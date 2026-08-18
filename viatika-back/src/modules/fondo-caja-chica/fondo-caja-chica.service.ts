import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  FondoCajaChica,
  FondoCajaChicaDocument,
  FondoMovement,
  saldoDisponible,
} from './entities/fondo-caja-chica.entity'
import { CreateFondoCajaChicaDto } from './dto/create-fondo-caja-chica.dto'
import { EmailService } from '../email/email.service'
import { UserService } from '../user/user.service'
import { NotificationsService } from '../notifications/notifications.service'

/** Los importes se guardan con 2 decimales: son soles, no flotantes libres. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

@Injectable()
export class FondoCajaChicaService {
  private readonly logger = new Logger(FondoCajaChicaService.name)

  constructor(
    @InjectModel(FondoCajaChica.name)
    private readonly model: Model<FondoCajaChicaDocument>,
    private readonly emailService: EmailService,
    private readonly userService: UserService,
    private readonly notificationsService: NotificationsService
  ) {}

  private async generateCode(clientId: string): Promise<string> {
    const prefix = 'CCH-'
    const last = await this.model
      .findOne({
        clientId: new Types.ObjectId(clientId),
        code: { $regex: `^${prefix}` },
      })
      .sort({ code: -1 })
      .lean()
      .exec()
    const seq = last?.code
      ? (parseInt(last.code.slice(prefix.length), 10) || 0) + 1
      : 1
    return `${prefix}${String(seq).padStart(4, '0')}`
  }

  private assertActivo(doc: FondoCajaChicaDocument): void {
    if (doc.status !== 'active') {
      throw new BadRequestException(
        doc.status === 'pending_funding'
          ? 'La caja chica todavía no fue fondeada por Tesorería.'
          : 'La caja chica está cerrada.'
      )
    }
  }

  private async push(
    id: string,
    movement: FondoMovement,
    incSpent: number,
    extraSet: Record<string, unknown> = {}
  ): Promise<FondoCajaChicaDocument> {
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        {
          $push: { movements: movement },
          ...(incSpent !== 0 ? { $inc: { spentAmount: incSpent } } : {}),
          ...(Object.keys(extraSet).length > 0 ? { $set: extraSet } : {}),
        },
        { new: true }
      )
      .exec()
    if (!updated) throw new NotFoundException(`Caja chica ${id} no encontrada`)
    return updated
  }

  async create(
    dto: CreateFondoCajaChicaDto,
    createdBy: string
  ): Promise<FondoCajaChicaDocument> {
    if (!dto.clientId) {
      throw new BadRequestException('clientId es requerido')
    }
    const existing = await this.findVivoByResponsible(
      dto.responsibleId,
      dto.clientId
    )
    if (existing) {
      throw new BadRequestException(
        `El responsable ya tiene una caja chica ${existing.status === 'active' ? 'activa' : 'pendiente de fondeo'} (${existing.code}). Ciérrela antes de abrir otra.`
      )
    }
    return this.model.create({
      code: await this.generateCode(dto.clientId),
      clientId: new Types.ObjectId(dto.clientId),
      responsibleId: new Types.ObjectId(dto.responsibleId),
      requestedAmount: round2(dto.requestedAmount),
      fundAmount: 0,
      spentAmount: 0,
      status: 'pending_funding',
      solicitudReportId: dto.solicitudReportId
        ? new Types.ObjectId(dto.solicitudReportId)
        : undefined,
      movements: [],
      createdBy,
    })
  }

  /**
   * Tesorería pagó la solicitud. El monto pagado, no el pedido, es el que fija
   * el tope al que volverá el fondo en cada reposición: si Tesorería depositó
   * menos, el fondo vale lo depositado.
   */
  async fondear(
    id: string,
    amount: number,
    registeredBy: string,
    note?: string
  ): Promise<FondoCajaChicaDocument> {
    const doc = await this.loadOrThrow(id)
    if (doc.status !== 'pending_funding') {
      throw new BadRequestException(
        'Esta caja chica ya fue fondeada. Para devolverle saldo use una reposición.'
      )
    }
    if (amount <= 0) {
      throw new BadRequestException('El monto del fondeo debe ser mayor a 0')
    }
    return this.push(
      id,
      {
        type: 'fondeo',
        amount: round2(amount),
        registeredBy,
        registeredAt: new Date(),
        note,
      },
      0,
      { status: 'active', fundAmount: round2(amount) }
    )
  }

  /**
   * Reemplaza el presupuesto por el de una solicitud posterior. Puede subir o
   * bajar.
   *
   * Bajarlo no toca lo ya gastado: el disponible se recalcula solo, porque es
   * `fundAmount - spentAmount`. Con 3000 de presupuesto y 1800 gastados,
   * pasar a 2000 deja 200 disponibles y 1000 por devolver, que es exactamente
   * el efectivo que sobra en la caja.
   */
  async ajustarPresupuesto(
    id: string,
    nuevoPresupuesto: number,
    registeredBy: string,
    note?: string
  ): Promise<FondoCajaChicaDocument> {
    const doc = await this.loadOrThrow(id)
    this.assertActivo(doc)

    const nuevo = round2(nuevoPresupuesto)
    if (nuevo <= 0) {
      throw new BadRequestException('El presupuesto debe ser mayor a 0')
    }
    const previo = round2(doc.fundAmount)
    if (nuevo === previo) return doc

    // El nuevo presupuesto no puede quedar por debajo de lo ya gastado y aun no
    // repuesto: el disponible (`fundAmount - spentAmount`) se iria en negativo y
    // la caja quedaba bloqueada, sin poder cargar ni un sol y sin forma de
    // arreglarlo desde la plataforma.
    const gastado = round2(doc.spentAmount)
    if (nuevo < gastado) {
      throw new BadRequestException(
        `El nuevo presupuesto (S/ ${nuevo.toFixed(2)}) no puede ser menor a lo ya gastado y pendiente de reposicion (S/ ${gastado.toFixed(2)}). Rinda esos comprobantes antes de bajar el presupuesto.`
      )
    }

    const aDevolver = previo > nuevo ? round2(previo - nuevo) : 0

    return this.push(
      id,
      {
        type: 'ajuste',
        amount: nuevo,
        previousAmount: previo,
        registeredBy,
        registeredAt: new Date(),
        note,
      },
      0,
      {
        fundAmount: nuevo,
        pendingReturnAmount: round2(
          Number(doc.pendingReturnAmount ?? 0) + aDevolver
        ),
      }
    )
  }

  /**
   * El responsable devuelve el sobrante que dejó un ajuste a la baja. El
   * comprobante del depósito es obligatorio: sin él no hay respaldo de que el
   * dinero volvió.
   */
  async registrarDevolucion(
    id: string,
    opts: {
      amount: number
      receiptUrl: string
      operationNumber?: string
      depositDate?: string
      bankOrigin?: string
      registeredBy: string
      note?: string
    }
  ): Promise<FondoCajaChicaDocument> {
    const doc = await this.loadOrThrow(id)
    this.assertActivo(doc)

    if (!opts.receiptUrl?.trim()) {
      throw new BadRequestException(
        'Adjunte el comprobante del depósito de la devolución.'
      )
    }
    const amount = round2(opts.amount)
    if (amount <= 0) {
      throw new BadRequestException('El monto de la devolución debe ser mayor a 0')
    }
    const pendiente = round2(Number(doc.pendingReturnAmount ?? 0))
    if (pendiente <= 0) {
      throw new BadRequestException('Esta caja chica no tiene sobrante por devolver.')
    }
    if (amount > pendiente) {
      throw new BadRequestException(
        `La devolución (S/ ${amount.toFixed(2)}) supera el sobrante pendiente (S/ ${pendiente.toFixed(2)}).`
      )
    }

    const actualizado = await this.push(
      id,
      {
        type: 'devolucion',
        amount,
        receiptUrl: opts.receiptUrl.trim(),
        operationNumber: opts.operationNumber,
        depositDate: opts.depositDate ? new Date(opts.depositDate) : undefined,
        bankOrigin: opts.bankOrigin?.trim() || undefined,
        registeredBy: opts.registeredBy,
        registeredAt: new Date(),
        note: opts.note,
      },
      0,
      { pendingReturnAmount: round2(pendiente - amount) }
    )

    // El depósito lo verifica alguien: sin este aviso la devolución quedaba
    // registrada y nadie se enteraba, a diferencia del comprobante de
    // devolución de una rendición, que sí avisa a Tesorería y Contabilidad.
    void this.notifyDevolucionRegistrada(actualizado, {
      amount,
      pendiente: round2(pendiente - amount),
      depositDate: opts.depositDate,
      bankOrigin: opts.bankOrigin?.trim() || undefined,
      operationNumber: opts.operationNumber,
    })

    return actualizado
  }

  /** Avisa a Tesorería y Contabilidad del depósito del sobrante. No lanza. */
  private async notifyDevolucionRegistrada(
    fondo: FondoCajaChicaDocument,
    datos: {
      amount: number
      pendiente: number
      depositDate?: string
      bankOrigin?: string
      operationNumber?: string
    }
  ): Promise<void> {
    try {
      const clientId = String(fondo.clientId)
      const responsableId = String(fondo.responsibleId)
      const responsable =
        await this.userService.findEmailNameClient(responsableId)
      const nombre = responsable?.name ?? 'El responsable'
      const montoFmt = datos.amount.toFixed(2)
      const fecha = datos.depositDate ?? new Date().toISOString().slice(0, 10)

      const tesoreria =
        await this.userService.findTesoreriaRecipientsWithIds(clientId)
      const contabilidad =
        await this.userService.findContabilidadRecipients(clientId)

      for (const t of tesoreria) {
        await this.notificationsService
          .create({
            userId: t._id,
            title: 'Devolución de caja chica registrada',
            message: `${nombre} depositó S/ ${montoFmt} del sobrante de su caja chica. Verifica la operación.`,
            type: 'info',
            actionUrl: '/tesoreria',
          })
          .catch(() => {})
      }

      const enviados = new Set<string>()
      for (const r of [...tesoreria, ...contabilidad]) {
        const key = r.email?.trim().toLowerCase()
        if (!key || enviados.has(key)) continue
        enviados.add(key)
        await this.emailService.sendCajaChicaDevolucionRegistrada(r.email, {
          clientId,
          recipientName: r.name,
          collaboratorName: nombre,
          fondoCode: fondo.code,
          amountFormatted: montoFmt,
          depositDate: fecha,
          bankOrigin: datos.bankOrigin,
          operationNumber: datos.operationNumber,
          pendienteFormatted: datos.pendiente.toFixed(2),
          platformUrl: this.emailService.buildAppUrl('/tesoreria'),
        })
      }
    } catch (err: unknown) {
      this.logger.error(
        `Aviso de devolución de caja chica ${String(fondo._id)}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * Registra un comprobante contra el fondo. Idempotente por `expenseId`: el
   * alta de un gasto puede reintentarse y no puede descontar dos veces.
   */
  async registrarCargo(
    id: string,
    opts: {
      expenseId: string
      expenseReportId?: string
      amount: number
      registeredBy: string
    }
  ): Promise<FondoCajaChicaDocument> {
    const doc = await this.loadOrThrow(id)
    this.assertActivo(doc)

    if (this.cargoVigente(doc, opts.expenseId)) return doc

    const amount = round2(opts.amount)
    if (amount <= 0) {
      throw new BadRequestException('El monto del gasto debe ser mayor a 0')
    }
    const disponible = saldoDisponible(doc)
    if (amount > disponible) {
      throw new BadRequestException(
        `Saldo insuficiente en la caja chica ${doc.code}. Disponible: S/ ${disponible.toFixed(2)}, gasto: S/ ${amount.toFixed(2)}`
      )
    }
    return this.push(
      id,
      {
        type: 'cargo',
        amount,
        expenseId: new Types.ObjectId(opts.expenseId),
        expenseReportId: opts.expenseReportId
          ? new Types.ObjectId(opts.expenseReportId)
          : undefined,
        registeredBy: opts.registeredBy,
        registeredAt: new Date(),
      },
      amount
    )
  }

  /**
   * Devuelve al fondo el cargo de un comprobante ELIMINADO. No se usa al
   * rechazar: un comprobante rechazado se corrige y se reenvía, y el efectivo ya
   * salió de la caja. Idempotente y sin efecto si el gasto nunca se cargó.
   */
  async reversarCargo(
    id: string,
    expenseId: string,
    registeredBy: string
  ): Promise<FondoCajaChicaDocument> {
    const doc = await this.loadOrThrow(id)
    const cargo = this.cargoVigente(doc, expenseId)
    if (!cargo) return doc

    return this.push(
      id,
      {
        type: 'reverso',
        amount: cargo.amount,
        expenseId: new Types.ObjectId(expenseId),
        expenseReportId: cargo.expenseReportId,
        registeredBy,
        registeredAt: new Date(),
      },
      -cargo.amount
    )
  }

  /**
   * Tesorería depositó lo aprobado en una rendición: el disponible sube. Nunca
   * por encima del tope del fondo, que es el invariante del fondo revolvente.
   */
  async reponer(
    id: string,
    opts: {
      amount: number
      expenseReportId?: string
      registeredBy: string
      note?: string
    }
  ): Promise<FondoCajaChicaDocument> {
    const doc = await this.loadOrThrow(id)
    this.assertActivo(doc)

    const amount = round2(opts.amount)
    if (amount <= 0) {
      throw new BadRequestException('El monto de la reposición debe ser mayor a 0')
    }
    if (amount > doc.spentAmount) {
      throw new BadRequestException(
        `La reposición (S/ ${amount.toFixed(2)}) supera lo gastado y no repuesto (S/ ${round2(doc.spentAmount).toFixed(2)}). La caja chica no puede quedar por encima de su tope.`
      )
    }
    return this.push(
      id,
      {
        type: 'reposicion',
        amount,
        expenseReportId: opts.expenseReportId
          ? new Types.ObjectId(opts.expenseReportId)
          : undefined,
        registeredBy: opts.registeredBy,
        registeredAt: new Date(),
        note: opts.note,
      },
      -amount
    )
  }

  async close(id: string, closedBy: string): Promise<FondoCajaChicaDocument> {
    const doc = await this.loadOrThrow(id)
    if (doc.status === 'closed') {
      throw new BadRequestException('La caja chica ya está cerrada')
    }
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        { $set: { status: 'closed', closedAt: new Date(), closedBy } },
        { new: true }
      )
      .exec()
    return updated!
  }

  /** Cargo de un gasto que sigue vigente, es decir que aún no fue reversado. */
  private cargoVigente(
    doc: FondoCajaChicaDocument,
    expenseId: string
  ): FondoMovement | undefined {
    const deEsteGasto = (doc.movements ?? []).filter(
      m => String(m.expenseId ?? '') === String(expenseId)
    )
    const cargos = deEsteGasto.filter(m => m.type === 'cargo')
    const reversos = deEsteGasto.filter(m => m.type === 'reverso')
    return cargos.length > reversos.length
      ? cargos[cargos.length - 1]
      : undefined
  }

  /** Lectura simple sin populate, para decidir flujo. `null` si no existe. */
  async findById(id: string): Promise<FondoCajaChicaDocument | null> {
    return this.model.findById(id).exec()
  }

  private async loadOrThrow(id: string): Promise<FondoCajaChicaDocument> {
    const doc = await this.model.findById(id).exec()
    if (!doc) throw new NotFoundException(`Caja chica ${id} no encontrada`)
    return doc
  }

  /**
   * `clientId` no es opcional por comodidad: sin él cualquier usuario
   * autenticado podría leer el fondo de otra empresa con solo tener el id.
   */
  async findOne(
    id: string,
    clientId: string
  ): Promise<FondoCajaChicaDocument> {
    const doc = await this.model
      .findOne({
        _id: new Types.ObjectId(id),
        clientId: new Types.ObjectId(clientId),
      })
      .populate('responsibleId', 'name email dni area')
      .exec()
    if (!doc) throw new NotFoundException(`Caja chica ${id} no encontrada`)
    return doc
  }

  /** Fondo no cerrado del responsable, si tiene. Es el que recibe los cargos. */
  async findVivoByResponsible(
    responsibleId: string,
    clientId: string
  ): Promise<FondoCajaChicaDocument | null> {
    return this.model
      .findOne({
        responsibleId: new Types.ObjectId(responsibleId),
        clientId: new Types.ObjectId(clientId),
        status: { $in: ['pending_funding', 'active'] },
      })
      .exec()
  }

  async findAllByClient(clientId: string): Promise<FondoCajaChicaDocument[]> {
    return this.model
      .find({ clientId: new Types.ObjectId(clientId) })
      .populate('responsibleId', 'name email dni area')
      .sort({ createdAt: -1 })
      .exec()
  }

  async findByResponsible(
    responsibleId: string,
    clientId: string
  ): Promise<FondoCajaChicaDocument[]> {
    return this.model
      .find({
        responsibleId: new Types.ObjectId(responsibleId),
        clientId: new Types.ObjectId(clientId),
      })
      // Mientras el fondo está pendiente de depósito, lo único que le interesa
      // al responsable es en qué paso va su solicitud (aprobador, Contabilidad,
      // Tesorería). Sin esto la pantalla solo podía decir "pendiente".
      .populate('solicitudReportId', 'status viaticoAmount createdAt')
      // La cuenta bancaria del responsable prellena el banco origen al devolver
      // el sobrante: ya está en su perfil, no tiene por qué volver a escribirlo.
      .populate('responsibleId', 'name email bankAccount')
      .sort({ createdAt: -1 })
      .exec()
  }
}
