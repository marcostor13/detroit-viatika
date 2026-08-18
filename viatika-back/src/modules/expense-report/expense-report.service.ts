import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { CreateExpenseReportDto } from './dto/create-expense-report.dto'
import { UpdateExpenseReportDto } from './dto/update-expense-report.dto'
import {
  ExpenseReport,
  ExpenseReportDocument,
} from './entities/expense-report.entity'
import { Expense, ExpenseDocument } from '../expense/entities/expense.entity'
import {
  CajaChicaReport,
  CajaChicaReportDocument,
} from '../caja-chica-report/entities/caja-chica-report.entity'
import {
  parseFechaEmisionInput,
  applyFechaEmisionDisplayToExpense,
} from '../expense/utils/fecha-emision.util'
import { EmailService } from '../email/email.service'
import { NotificationsService } from '../notifications/notifications.service'
import { UserService } from '../user/user.service'
import { CreateAffidavitDto } from './dto/create-affidavit.dto'
import { RegisterReimbursementPaymentDto } from './dto/register-reimbursement-payment.dto'
import { CreateDirectaDepositDto } from './dto/create-directa-deposit.dto'
import { AdvanceService } from '../advance/advance.service'
import { ROLES } from '../auth/enums/roles.enum'
import { applyFechaEmisionDisplayToExpenses } from '../expense/utils/fecha-emision.util'
import { UploadService } from '../upload/upload.service'
import { ProjectService } from '../project/project.service'
import { CategoryService } from '../category/category.service'
import {
  findActionableChainStep,
  isChainFullyApproved,
  plainChainStep,
  buildSolicitudChain,
  buildRendicionChain,
  buildCajaChicaChain,
  ChainStep,
  ChainProject,
} from '../advance/approval-chain.util'
import { FondoCajaChicaService } from '../fondo-caja-chica/fondo-caja-chica.service'
import { CreateSolicitudCajaChicaDto } from './dto/create-solicitud-caja-chica.dto'
import { ApproverLevel } from '../../common/types/approver-level'
import { CreateViaticoExpenseReportDto } from './dto/create-viatico-expense-report.dto'
import { PayViaticoDto } from './dto/pay-viatico.dto'
import { ResubmitViaticoDto } from './dto/resubmit-viatico.dto'
import { CreateAdvanceLineDto } from '../advance/dto/create-advance.dto'
import { Logger } from '@nestjs/common'
import { monedaSymbol, DEFAULT_MONEDA } from '../../common/moneda.constants'
import { CurrencyService } from '../exchange-rate/currency.service'
import { normalizeMoneda } from '../../common/moneda.constants'

/** Contexto del usuario que solicita eliminar una solicitud. */
export interface SolicitudDeleteActor {
  userId: string
  role: string
}

@Injectable()
export class ExpenseReportService implements OnModuleInit {
  private readonly logger = new Logger(ExpenseReportService.name)

  constructor(
    @InjectModel(ExpenseReport.name)
    private readonly expenseReportModel: Model<ExpenseReportDocument>,
    @InjectModel(Expense.name)
    private readonly expenseModel: Model<ExpenseDocument>,
    @InjectModel(CajaChicaReport.name)
    private readonly cajaChicaReportModel: Model<CajaChicaReportDocument>,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => AdvanceService))
    private readonly advanceService: AdvanceService,
    private readonly uploadService: UploadService,
    private readonly projectService: ProjectService,
    private readonly categoryService: CategoryService,
    private readonly currencyService: CurrencyService,
    private readonly fondoCajaChicaService: FondoCajaChicaService
  ) { }

  async onModuleInit() {
    const col = this.expenseReportModel.collection
    try {
      await col.dropIndex('clientId_1_codigo_1')
      this.logger.log('Dropped old sparse index clientId_1_codigo_1')
    } catch {
      // Index didn't exist or was already replaced — safe to ignore
    }
    try {
      await col.createIndex(
        { clientId: 1, codigo: 1 },
        { unique: true, partialFilterExpression: { codigo: { $type: 'string' } }, background: true }
      )
      this.logger.log('Created partialFilterExpression index for clientId+codigo')
    } catch (e) {
      this.logger.warn(`Index create skipped: ${(e as Error).message}`)
    }
    await this.migrateAssignedCoordinatorIds()
  }

  /**
   * Backfill único e idempotente: asigna `assignedCoordinatorId` a las rendiciones
   * que no lo tengan, resolviendo el aprobador del centro de costo (`Project.approverId`)
   * de su `projectId`. Si la rendición no tiene centro de costo o este no tiene
   * aprobador configurado, cae al dato legacy `User.coordinatorId` del dueño como
   * último recurso, solo para no dejar historicos huérfanos. Tras esta migración,
   * el resto del código ya no necesita leer el campo legacy.
   */
  private async migrateAssignedCoordinatorIds() {
    const pending = await this.expenseReportModel
      .find({
        type: { $ne: 'viatico' },
        assignedCoordinatorId: { $exists: false },
      })
      .select('_id projectId userId clientId')
      .lean()
      .exec()
    if (pending.length === 0) return

    const projectIdsByClient = new Map<string, Set<string>>()
    for (const r of pending) {
      if (!r.projectId) continue
      const clientKey = String(r.clientId)
      if (!projectIdsByClient.has(clientKey)) {
        projectIdsByClient.set(clientKey, new Set())
      }
      projectIdsByClient.get(clientKey)!.add(String(r.projectId))
    }

    const approverByProjectId = new Map<string, Types.ObjectId>()
    for (const [clientKey, projectIdSet] of projectIdsByClient) {
      const projects = await this.projectService.findManyByIds(
        [...projectIdSet],
        clientKey
      )
      for (const p of projects) {
        if (p.approverId) {
          approverByProjectId.set(String((p as any)._id), p.approverId)
        }
      }
    }

    let migrated = 0
    for (const r of pending) {
      let assignedCoordinatorId = r.projectId
        ? approverByProjectId.get(String(r.projectId))
        : undefined

      if (!assignedCoordinatorId) {
        const profile = await this.userService.findTransactionalProfile(
          String(r.userId)
        )
        assignedCoordinatorId = profile?.coordinatorId
      }

      if (!assignedCoordinatorId) continue

      await this.expenseReportModel.updateOne(
        { _id: r._id },
        { $set: { assignedCoordinatorId } }
      )
      migrated++
    }

    if (migrated > 0) {
      this.logger.log(
        `Backfill: asignado assignedCoordinatorId a ${migrated} rendición(es) desde centro de costo / legacy`
      )
    }
  }

  /**
   * Resuelve el coordinador responsable de un centro de costo (`Project.approverId`)
   * para snapshotearlo en `assignedCoordinatorId` al crear/editar una rendición.
   */
  private async resolveAssignedCoordinatorId(
    projectId: string | undefined,
    clientId: string
  ): Promise<Types.ObjectId | undefined> {
    if (!projectId) return undefined
    const projects = await this.projectService.findManyByIds(
      [projectId],
      clientId
    )
    return projects[0]?.approverId
  }

  private validatePaymentReceipt(
    mimeType?: string,
    fileName?: string,
    sizeBytes?: number
  ): { ok: boolean; reason?: string } {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png']
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png']
    const normalizedMime = (mimeType ?? '').toLowerCase().trim()
    const normalizedName = (fileName ?? '').toLowerCase().trim()
    const mimeAllowed = normalizedMime
      ? allowedMimes.includes(normalizedMime)
      : false
    const extAllowed = allowedExtensions.some(ext =>
      normalizedName.endsWith(ext)
    )
    if (!mimeAllowed && !extAllowed) {
      return {
        ok: false,
        reason: 'Formato inválido. Solo se permite PDF, JPG o PNG.',
      }
    }
    if (typeof sizeBytes === 'number' && sizeBytes > 10 * 1024 * 1024) {
      return { ok: false, reason: 'El comprobante excede 10MB.' }
    }
    return { ok: true }
  }

  private normalizeExpenseReportClientId(clientId: unknown): string {
    if (!clientId) return ''
    if (clientId instanceof Types.ObjectId) return clientId.toHexString()
    if (
      typeof clientId === 'object' &&
      clientId !== null &&
      '_id' in clientId
    ) {
      return String((clientId as { _id: unknown })._id)
    }
    return String(clientId)
  }

  /**
   * Para correos / notificaciones: muestra el "presupuesto" alineado con la UI
   * (`totalAnticipado` del frontend) — suma TODOS los anticipos vinculados
   * con status approved/paid/settled. Si la rendición no tiene anticipos
   * (caso directa), cae a `report.budget` para no mostrar S/ 0.00.
   */
  private async computeReportBudgetDisplay(report: any): Promise<number> {
    if (!report?._id) return Number(report?.budget) || 0
    const reportId = String(report._id)

    // Rendición directa: no usa anticipo ni presupuesto, por lo que budget=0 y
    // advances=0 hacían que los correos (incluida la notificación a Tesorería)
    // mostraran "S/ 0.00" (VD-52). El monto relevante es el total gastado = suma
    // de los gastos no-rechazados.
    if (report.isDirecta === true) {
      const directa = await this.expenseReportModel
        .findById(reportId)
        .populate('expenseIds', 'total status montoBase moneda montoReporte monedaReporte')
        .exec()
      const exps = (directa?.expenseIds ?? []) as any[]
      const gastado = exps.reduce(
        (s: number, e: any) =>
          String(e?.status || '').toLowerCase() === 'rejected'
            ? s
            : s + this.expenseSettlementAmountBase(e),
        0
      )
      return gastado > 0 ? gastado : Number(report.budget) || 0
    }

    // Rendición de caja chica: tampoco tiene anticipo, y su `budget` es 0. El
    // presupuesto que corresponde mostrar es el TOPE de la caja del responsable
    // (`fundAmount` del fondo), que es contra lo que rinde. Sin esta rama los
    // correos anunciaban "Presupuesto asignado S/ 0.00" y, restando lo gastado,
    // un saldo negativo — el mismo defecto que se veía en el modal de envío.
    if (report.isCajaChica === true) {
      // `userId`/`clientId` llegan como ObjectId o ya populados según el punto
      // desde el que se arma el correo.
      const ownerId = String(report.userId?._id ?? report.userId ?? '')
      const clientId = String(report.clientId?._id ?? report.clientId ?? '')
      if (ownerId && clientId) {
        const fondo = await this.fondoCajaChicaService.findVivoByResponsible(
          ownerId,
          clientId
        )
        const tope = Number(fondo?.fundAmount ?? 0)
        if (tope > 0) return tope
      }
      return Number(report.budget) || 0
    }

    const rawAdvanceIds: string[] = (
      Array.isArray(report.advanceIds) ? report.advanceIds : []
    ).map((x: any) =>
      x && typeof x === 'object' && '_id' in x ? String(x._id) : String(x)
    )
    const linkedAdvances = await this.advanceService.findByExpenseReportId(
      reportId,
      rawAdvanceIds
    )
    const total = linkedAdvances
      .filter((a: any) =>
        ['approved', 'partially_paid', 'paid', 'settled'].includes(a.status)
      )
      .reduce(
        (s: number, a: any) =>
          s +
          (a.status === 'approved' ? 0 : Number(a.paidAmount ?? a.amount) || 0),
        0
      )
    return total > 0 ? total : Number(report.budget) || 0
  }

  /**
   * Destinatarios de correo que son los APROBADORES del reporte: la cadena por
   * centro de costo de sus comprobantes (Aprobador 1, 2, … N), NO el
   * `coordinatorId` personal (obsoleto — ya no existe el concepto de
   * coordinador; ver VD-85/VD-87). N-genérico: recorre TODOS los pasos de la
   * `approverChain` de cada comprobante no rechazado y deduplica por usuario y
   * por correo, respetando "email habilitado". Si mañana la cadena arma 3+
   * niveles, este helper los cubre sin cambios.
   */
  private async resolveReportApproverRecipients(
    reportId: string,
    opts: { excludeUserIds?: Array<string | undefined> } = {}
  ): Promise<
    Array<{ userId: string; email: string; name: string; emailEnabled: boolean }>
  > {
    const exclude = new Set(
      (opts.excludeUserIds ?? []).filter(Boolean).map(x => String(x))
    )
    const report = await this.expenseReportModel
      .findById(reportId)
      .select('expenseIds')
      .lean<{ expenseIds?: unknown[] }>()
      .exec()
    const expenseIds = (report?.expenseIds ?? []).map((x: any) =>
      x && typeof x === 'object' && '_id' in x ? x._id : x
    )
    if (!expenseIds.length) return []

    const chainExpenses = await this.expenseModel
      .find({ _id: { $in: expenseIds }, status: { $ne: 'rejected' } })
      .select('approverChain')
      .lean<{ approverChain?: { approverIds?: Types.ObjectId[] }[] }[]>()
      .exec()

    // Único por usuario (la cadena puede repetir el mismo aprobador en varios
    // comprobantes / pasos).
    const approverIds = new Set<string>()
    for (const e of chainExpenses) {
      for (const step of e.approverChain ?? []) {
        for (const aid of step.approverIds ?? []) {
          const id = String(aid)
          if (!exclude.has(id)) approverIds.add(id)
        }
      }
    }

    const recipients: Array<{
      userId: string
      email: string
      name: string
      emailEnabled: boolean
    }> = []
    for (const userId of approverIds) {
      const u = await this.userService.findEmailNameClient(userId)
      if (!u) continue
      const emailEnabled = await this.userService.isEmailEnabled(userId)
      recipients.push({
        userId,
        email: u.email || '',
        name: u.name,
        emailEnabled,
      })
    }
    return recipients
  }

  /**
   * Igual que `resolveReportApproverRecipients` pero para una SOLICITUD de
   * viático: los aprobadores viven en `viaticoApproverChain` (cadena por centro
   * de costo a nivel de reporte, no por comprobante). N-genérico.
   */
  private async resolveViaticoApproverRecipients(
    report: { viaticoApproverChain?: { approverIds?: Types.ObjectId[] }[] },
    opts: { excludeUserIds?: Array<string | undefined> } = {}
  ): Promise<
    Array<{ userId: string; email: string; name: string; emailEnabled: boolean }>
  > {
    const exclude = new Set(
      (opts.excludeUserIds ?? []).filter(Boolean).map(x => String(x))
    )
    const approverIds = new Set<string>()
    for (const step of report.viaticoApproverChain ?? []) {
      for (const aid of step.approverIds ?? []) {
        const id = String(aid)
        if (!exclude.has(id)) approverIds.add(id)
      }
    }
    const recipients: Array<{
      userId: string
      email: string
      name: string
      emailEnabled: boolean
    }> = []
    for (const userId of approverIds) {
      const u = await this.userService.findEmailNameClient(userId)
      if (!u) continue
      const emailEnabled = await this.userService.isEmailEnabled(userId)
      recipients.push({
        userId,
        email: u.email || '',
        name: u.name,
        emailEnabled,
      })
    }
    return recipients
  }

  private async validateBeforeSubmit(reportId: string): Promise<void> {
    const report = await this.expenseReportModel
      .findById(reportId)
      .populate('expenseIds')
      .select('expenseIds')
      .lean()
      .exec()

    if (!report) {
      throw new NotFoundException(
        `Expense report with ID ${reportId} not found`
      )
    }

    const expenses = Array.isArray(report.expenseIds) ? report.expenseIds : []
    if (expenses.length === 0) {
      throw new BadRequestException(
        'Debe registrar al menos un gasto antes de enviar la rendición.'
      )
    }

    const hasRejected = expenses.some(
      (e: any) => String(e?.status || '').toLowerCase() === 'rejected'
    )
    if (hasRejected) {
      throw new BadRequestException(
        'No puede enviar la rendición mientras existan comprobantes rechazados sin corregir.'
      )
    }
  }

  private async validateBeforeFinalApproval(reportId: string): Promise<void> {
    const report = await this.expenseReportModel
      .findById(reportId)
      .populate('expenseIds')
      .select('expenseIds')
      .lean()
      .exec()

    if (!report) {
      throw new NotFoundException(
        `Expense report with ID ${reportId} not found`
      )
    }

    const expenses = Array.isArray(report.expenseIds) ? report.expenseIds : []
    if (expenses.length === 0) {
      throw new BadRequestException(
        'No se puede aprobar una rendición sin comprobantes registrados.'
      )
    }

    const hasRejected = expenses.some(
      (e: any) => String(e?.status || '').toLowerCase() === 'rejected'
    )
    if (hasRejected) {
      throw new BadRequestException(
        'Existen comprobantes rechazados. Corrígelos antes de aprobar la rendición.'
      )
    }

    // Regla 1.4 (decisión "esperar a que todos completen"): la rendición solo
    // pasa a Contabilidad cuando TODOS sus comprobantes completaron su propia
    // cadena N1/N2/[N2 sel] — no se permite avance parcial.
    const hasPendingChain = expenses.some((e: any) => {
      const required = e?.requiredLevels ?? e?.approverChain?.length ?? 0
      const level = e?.approvalLevel ?? 0
      return level < required
    })
    if (hasPendingChain) {
      throw new BadRequestException(
        'Existen comprobantes que aún no completaron su cadena de aprobación.'
      )
    }
  }

  /**
   * Guard enfocado para la aprobación final de Contabilidad: bloquea si algún
   * comprobante quedó observado (rejected). A diferencia de
   * `validateBeforeFinalApproval`, NO exige comprobantes ni cadena completa —
   * solo impide aprobar una rendición que contiene un comprobante sin corregir.
   */
  private async assertNoRejectedExpenses(reportId: string): Promise<void> {
    const report = await this.expenseReportModel
      .findById(reportId)
      .populate('expenseIds')
      .select('expenseIds')
      .lean()
      .exec()
    const expenses = Array.isArray((report as any)?.expenseIds)
      ? (report as any).expenseIds
      : []
    const hasRejected = expenses.some(
      (e: any) => String(e?.status || '').toLowerCase() === 'rejected'
    )
    if (hasRejected) {
      throw new BadRequestException(
        'Existen comprobantes observados. La rendición fue devuelta al colaborador para corrección; no puede aprobarse.'
      )
    }
  }

  /**
   * Contabilidad aprueba la rendición completa recién cuando aprobó cada uno de
   * sus comprobantes. El gate del reporte cierra el trabajo hecho comprobante
   * por comprobante, no lo reemplaza: sin este control la rendición podía
   * quedar aprobada (y por lo tanto pagable) con comprobantes que Contabilidad
   * nunca revisó, porque el único requisito era que ninguno estuviera observado.
   */
  private async assertAllExpensesApprovedByAccounting(
    reportId: string
  ): Promise<void> {
    const report = await this.expenseReportModel
      .findById(reportId)
      .populate('expenseIds')
      .select('expenseIds')
      .lean()
      .exec()
    const expenses = Array.isArray((report as any)?.expenseIds)
      ? (report as any).expenseIds
      : []
    const pendientes = expenses.filter(
      (e: any) =>
        String(e?.contabilidadStatus || 'pending').toLowerCase() !== 'approved'
    )
    if (pendientes.length > 0) {
      throw new BadRequestException(
        `Falta que Contabilidad apruebe ${pendientes.length} comprobante(s) de esta rendición. Revísalos uno por uno antes de aprobar la rendición completa.`
      )
    }
  }

  /**
   * Genera un código autoincremental único por empresa de forma atómica
   * usando una colección `counters` (a prueba de concurrencia). Ej: RD-0001.
   */
  private async generateDirectaCodigo(clientId: string): Promise<string> {
    const key = `rendicion-directa:${clientId}`
    const res: any = await this.expenseReportModel.db
      .collection('counters')
      .findOneAndUpdate(
        { _id: key as any },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      )
    const seq = (res && (res.seq ?? res.value?.seq)) ?? 1
    return `RD-${String(seq).padStart(4, '0')}`
  }

  async create(
    createExpenseReportDto: CreateExpenseReportDto,
    createdBy: string,
    isCollaborator = false
  ) {
    const isDirecta = createExpenseReportDto.isDirecta === true
    const isCajaChica = createExpenseReportDto.isCajaChica === true
    const title =
      createExpenseReportDto.title?.trim() ||
      createExpenseReportDto.motivo?.trim() ||
      createExpenseReportDto.gestion?.trim() ||
      'Rendición'

    const codigo = isDirecta
      ? await this.generateDirectaCodigo(createExpenseReportDto.clientId)
      : undefined

    const assignedCoordinatorId = await this.resolveAssignedCoordinatorId(
      createExpenseReportDto.projectId,
      createExpenseReportDto.clientId
    )

    const report = new this.expenseReportModel({
      ...createExpenseReportDto,
      title,
      codigo,
      userId: new Types.ObjectId(createExpenseReportDto.userId),
      clientId: new Types.ObjectId(createExpenseReportDto.clientId),
      createdBy: new Types.ObjectId(createdBy),
      projectId: createExpenseReportDto.projectId
        ? new Types.ObjectId(createExpenseReportDto.projectId)
        : undefined,
      directaOrdenTrabajoId: createExpenseReportDto.ordenTrabajoId
        ? new Types.ObjectId(createExpenseReportDto.ordenTrabajoId)
        : undefined,
      assignedCoordinatorId,
      budget: createExpenseReportDto.budget ?? 0,
      // Caja chica y rendición directa: siempre open desde el inicio
      status:
        isDirecta || isCajaChica
          ? 'open'
          : isCollaborator
            ? 'solicited'
            : 'open',
      expenseIds: [],
    })
    const savedReport = await report.save()

    console.log(
      `[ExpenseReportService] Created report: ${savedReport._id}. isCollaborator: ${isCollaborator}, isDirecta: ${isDirecta}`
    )

    // Solo notificar admins si es una rendición normal solicitada (no directa)
    if (isCollaborator && !isDirecta) {
      try {
        const admins = await this.userService.findAdminsByClient(
          String(savedReport.clientId)
        )
        const user = await this.userService.findOne(createdBy)
        const creatorName = user.name || 'Un colaborador'

        for (const admin of admins) {
          await this.notificationsService.create({
            userId: String(admin._id),
            title: 'Nueva Rendición Solicitada',
            message: `${creatorName} ha creado una nueva solicitud de rendición: "${savedReport.title}"`,
            type: 'info',
            actionUrl: `/mis-rendiciones/${savedReport._id}/detalle`,
          })
        }
      } catch (error) {
        console.error(
          'Error enviando notificaciones a administradores (create)',
          error
        )
      }
    }

    return savedReport
  }

  /**
   * Crea una rendición directa con depósito inicial, iniciada por Contabilidad.
   * El usuario destino recibe el saldo disponible (amount = budget). Reutiliza
   * `create()` (genera el código RD) y luego adjunta el subdocumento `directaDeposit`.
   */
  async createDirectaWithDeposit(
    dto: CreateDirectaDepositDto,
    createdBy: string,
    clientId: string
  ) {
    if (dto.metodoPago !== 'efectivo' && !dto.receiptUrl) {
      throw new BadRequestException(
        'Debe adjuntar el comprobante de depósito (o marcar el método de pago como efectivo).'
      )
    }

    const report = await this.create(
      {
        isDirecta: true,
        userId: dto.userId,
        clientId,
        gestion: dto.gestion,
        budget: dto.amount,
        projectId: dto.projectId,
        ordenTrabajoId: dto.ordenTrabajoId,
      } as CreateExpenseReportDto,
      createdBy,
      false // no es flujo de colaborador → no notifica admins
    )

    report.directaDeposit = {
      amount: dto.amount,
      metodoPago: dto.metodoPago ?? 'deposito',
      scannedAmount: dto.scannedAmount,
      receiptUrl: dto.receiptUrl,
      receiptFileName: dto.receiptFileName,
      receiptMimeType: dto.receiptMimeType,
      receiptSizeBytes: dto.receiptSizeBytes,
      depositDate: dto.depositDate,
      operationNumber: dto.operationNumber,
      operationDate: dto.operationDate,
      operationTime: dto.operationTime,
      titular: dto.titular,
      createdBy: new Types.ObjectId(createdBy),
      createdAt: new Date(),
    }
    await report.save()

    try {
      await this.notificationsService.create({
        userId: String(dto.userId),
        title: 'Nueva Rendición Directa con saldo',
        message: `Contabilidad te asignó una rendición directa (${report.codigo}) con saldo disponible de ${this.reportCurrencySymbol(report)} ${dto.amount.toFixed(2)}.`,
        type: 'info',
        actionUrl: `/mis-rendiciones/${report._id}/detalle`,
      })
    } catch (error) {
      console.error('Error notificando rendición directa con depósito', error)
    }

    return report
  }

  /**
   * Lista las rendiciones directas iniciadas por Contabilidad (con depósito)
   * de un cliente, calculando total gastado y saldo disponible.
   */
  async findDirectaDepositReports(clientId: string) {
    const reports = await this.expenseReportModel
      .find({
        clientId: new Types.ObjectId(clientId),
        isDirecta: true,
        directaDeposit: { $exists: true, $ne: null },
      })
      .populate('userId', 'name email')
      .populate('expenseIds', 'total montoBase moneda montoReporte monedaReporte')
      .sort({ createdAt: -1 })
      .lean()
      .exec()

    return reports.map(r => {
      const expenses = (r.expenseIds as any[]) || []
      const totalGastado = expenses.reduce(
        (sum, e) => sum + this.expenseSettlementAmountBase(e),
        0
      )
      const deposited = Number(r.directaDeposit?.amount ?? r.budget ?? 0)
      return {
        ...r,
        totalGastado,
        saldoDisponible: deposited - totalGastado,
      }
    })
  }

  async createAutoFromViatico(advance: {
    _id: unknown
    userId: Types.ObjectId
    clientId: Types.ObjectId
    projectId?: Types.ObjectId
    description?: string
    place?: string
    amount: number
    startDate?: Date
    endDate?: Date
  }): Promise<ExpenseReportDocument> {
    const title =
      advance.description?.trim() || advance.place?.trim() || 'Solicitud de Fondos'
    const assignedCoordinatorId = await this.resolveAssignedCoordinatorId(
      advance.projectId?.toString(),
      advance.clientId.toString()
    )
    const report = new this.expenseReportModel({
      title,
      userId: advance.userId,
      clientId: advance.clientId,
      createdBy: advance.userId,
      projectId: advance.projectId ?? undefined,
      assignedCoordinatorId,
      location: advance.place ?? undefined,
      budget: advance.amount,
      startDate: advance.startDate ?? undefined,
      endDate: advance.endDate ?? undefined,
      status: 'open',
      expenseIds: [],
      advanceIds: [advance._id],
    })
    return report.save()
  }

  /**
   * Listado administrativo completo (Contabilidad/Tesorería/Admin, `?scope=all`).
   *
   * La caja chica YA NO se excluye. La exclusión venía de cuando era un depósito
   * de comprobantes que solo se miraba desde el agrupador contable; hoy su
   * rendición se aprueba como cualquier otra y pasa por el gate de Contabilidad,
   * así que ocultarla acá dejaba a Contabilidad sin la pantalla donde revisarla.
   * El front la manda a la pestaña Caja Chica, no la mezcla con los viáticos.
   */
  async findAllByClient(clientId: string) {
    return await this.expenseReportModel
      .find({
        clientId: new Types.ObjectId(clientId),
      })
      .populate('userId', 'name email signature bankAccount')
      .populate('createdBy', 'name email')
      // Centro de costo con su código (VD-113): el listado lo muestra como
      // "código — nombre" y sin este populate dependía del catálogo del front.
      .populate('projectId', 'code name')
      // Nombre de la categoría de cada línea de viático, para mostrar el detalle
      // por categoría al aprobar (la list no traía categoryId poblado).
      .populate('viaticoLines.categoryId', 'name')
      // Orden de Trabajo imputada, para mostrarla en el detalle de la solicitud.
      .populate('viaticoOrdenTrabajoId', 'nombre costCenterId')
      .populate('directaOrdenTrabajoId', 'nombre costCenterId')
      // Estado de la cadena por comprobante (regla 1.4) — para mostrar progreso
      // agregado de rendición directa (ya no tiene cadena a nivel de reporte).
      // `total` también poblado: reportExpensesTotal() lo necesita y antes de
      // este populate expenseIds llegaban sin poblar (siempre devolvía 0).
      .populate('expenseIds', 'total status approvalLevel requiredLevels contabilidadStatus montoBase moneda montoReporte monedaReporte')
      .sort({ createdAt: -1 })
      .exec()
  }

  /**
   * Rendiciones a cargo de un Coordinador. Combina mecanismos, cada uno con
   * su propio snapshot:
   * - Rendición normal: `assignedCoordinatorId`, tomado al crear/editar la
   *   rendición (ver `resolveAssignedCoordinatorId`).
   * - Viático: `viaticoApproverChain`, la cadena por centro de costo tomada
   *   al solicitar el viático (ver `buildSolicitudChain`/`buildSolicitudCostCenterChain`).
   * - Rendición por comprobante (directa, normal o viático ya en fase de
   *   rendición): ya no tiene cadena a nivel de reporte — se resuelve por
   *   comprobante (`Expense.approverChain`, ver `buildRendicionChain`); se
   *   incluye cualquier reporte que tenga al menos un comprobante con este
   *   aprobador en su cadena, SIN importar el estado del reporte. Como la
   *   cadena del comprobante se construye al SUBIRLO (regla 1.9), el aprobador
   *   ve la rendición apenas se carga el primer comprobante, aunque el
   *   colaborador todavía no la haya enviado (`open`).
   * Ninguno usa la relación en vivo usuario→coordinador ni el aprobador actual
   * del centro de costo, así que si este cambia, las solicitudes ya creadas
   * conservan a su coordinador original.
   */
  async findAllByCoordinator(coordinatorId: string, clientId: string) {
    const coordinatorObjectId = new Types.ObjectId(coordinatorId)
    const chainReportIds = await this.expenseModel
      .find({ 'approverChain.approverIds': coordinatorObjectId })
      .distinct('expenseReportId')
      .exec()
    // Caja chica: la cadena recién se estampa en los comprobantes al ENVIAR la
    // rendición, así que hasta ese momento no hay nada que enganchar y el
    // aprobador no veía consumirse el fondo que él mismo autorizó. Se traen
    // también las rendiciones en curso de los responsables a los que aprueba
    // (los mismos que resuelve `buildCajaChicaChain`); llegan sin acciones,
    // solo para seguimiento.
    const responsibleIds = (
      await this.projectService.findCajaChicaResponsibleIds(coordinatorId, clientId)
    ).map(id => new Types.ObjectId(id))
    return await this.expenseReportModel
      .find({
        clientId: new Types.ObjectId(clientId),
        // La caja chica ya NO se excluye. Antes era un flujo puramente contable
        // sin aprobador, pero ahora tanto la solicitud del fondo como la
        // rendición pasan por la cadena del responsable, así que su aprobador
        // tiene que verlas para poder aprobarlas. El `$or` sigue siendo el
        // filtro real: solo entran las que tienen a este usuario en su cadena.
        $or: [
          { assignedCoordinatorId: coordinatorObjectId },
          { type: 'viatico', 'viaticoApproverChain.approverIds': coordinatorObjectId },
          { _id: { $in: chainReportIds } },
          ...(responsibleIds.length > 0
            ? [{ isCajaChica: true, userId: { $in: responsibleIds } }]
            : []),
        ],
      })
      .populate('userId', 'name email signature bankAccount')
      .populate('createdBy', 'name email')
      // Nombre de categoría por línea de viático (para el detalle al aprobar).
      .populate('viaticoLines.categoryId', 'name')
      // Centro de costo (código/nombre) y Orden de Trabajo, para el detalle de la solicitud.
      .populate('projectId', 'code name')
      .populate('viaticoOrdenTrabajoId', 'nombre costCenterId')
      .populate('directaOrdenTrabajoId', 'nombre costCenterId')
      // Comprobantes: total (monto de la rendición directa) y datos/archivo para
      // mostrar las facturas en el modal de aprobación del jefe inmediato (VD-25).
      // `approverChain` y `status` van también porque con el modelo por
      // comprobante (regla 1.4) la rendición se aprueba aprobando todos sus
      // gastos: sin ellos el front no puede saber si a este aprobador todavía le
      // queda alguno pendiente y el Inicio no podía listarlas.
      .populate(
        'expenseIds',
        'total data file expenseType status approverChain montoBase moneda montoReporte monedaReporte'
      )
      .sort({ createdAt: -1 })
      .exec()
  }

  async findAllByUser(userId: string, clientId: string) {
    const reports = await this.expenseReportModel
      .find({
        userId: new Types.ObjectId(userId),
        clientId: new Types.ObjectId(clientId),
        isCajaChica: { $ne: true },
      })
      .populate('expenseIds', 'total approvalLevel requiredLevels contabilidadStatus montoBase moneda montoReporte monedaReporte')
      .populate('createdBy', 'name email')
      .populate('viaticoLines.categoryId', 'name')
      .populate('projectId', 'code name')
      .populate('viaticoOrdenTrabajoId', 'nombre costCenterId')
      .populate('directaOrdenTrabajoId', 'nombre costCenterId')
      .sort({ createdAt: -1 })
      .lean()
      .exec()

    // Rendiciones de viáticos cuyo anticipo vinculado ya fue aprobado/pagado: el
    // colaborador ya no puede eliminarlas. Se resuelve en un solo query batch.
    const viaticoReportIds = reports
      .filter(r => !r.isDirecta && !(r as any).isCajaChica)
      .map(r => String(r._id))
    const approvedAdvanceSet = new Set(
      await this.advanceService.findApprovedExpenseReportIds(viaticoReportIds)
    )

    return reports.map(r => ({
      ...this.withDeletionApprovalFlag(r),
      hasApprovedLinkedAdvance: approvedAdvanceSet.has(String(r._id)),
    }))
  }

  async findMyCajaChica(userId: string, clientId: string) {
    const reports = await this.expenseReportModel
      .find({
        userId: new Types.ObjectId(userId),
        clientId: new Types.ObjectId(clientId),
        isCajaChica: true,
      })
      .populate(
        'expenseIds',
        'total expenseType fechaEmision proveedor approvalLevel requiredLevels contabilidadStatus montoBase moneda montoReporte monedaReporte'
      )
      .sort({ createdAt: -1 })
      .lean()
      .exec()

    // ¿Cuáles de estas cajas chicas ya fueron jaladas por Contabilidad (en
    // cualquier reporte, borrador o finalizado)? El dueño ya no puede borrarlas.
    const ids = reports.map(r => r._id as Types.ObjectId)
    const referencedSet = new Set<string>()
    if (ids.length > 0) {
      const referencing = await this.cajaChicaReportModel
        .find({ 'selectedReports.expenseReportId': { $in: ids } })
        .select('selectedReports.expenseReportId')
        .lean()
        .exec()
      for (const cc of referencing) {
        for (const sr of (cc as any).selectedReports ?? []) {
          referencedSet.add(String(sr.expenseReportId))
        }
      }
    }

    return reports.map(r => ({
      ...this.withDeletionApprovalFlag(r),
      referencedByCajaChica: referencedSet.has(String(r._id)),
    }))
  }

  /**
   * Anexa `hasApprovedExpense` a un reporte para que el front sepa si algún
   * comprobante ya fue aprobado (coord o contabilidad). Espeja la condición de
   * `remove`: con cualquier aprobación, el colaborador ya no puede eliminar la
   * solicitud, así que el botón no debe mostrarse.
   */
  private withDeletionApprovalFlag(report: any) {
    const hasApprovedExpense = (report.expenseIds ?? []).some(
      (e: any) => (e?.approvalLevel ?? 0) > 0 || e?.contabilidadStatus === 'approved'
    )
    // `createdByOther`: la solicitud la creó alguien distinto del dueño (ej.
    // Contabilidad creó una rendición directa para el colaborador). En ese caso
    // el dueño no puede eliminarla; el front oculta el botón.
    const createdById = String(report.createdBy?._id ?? report.createdBy ?? '')
    const ownerId = String(report.userId?._id ?? report.userId ?? '')
    const createdByOther = !!createdById && !!ownerId && createdById !== ownerId
    return { ...report, hasApprovedExpense, createdByOther }
  }

  async findAllCajaChicaAvailable(clientId: string) {
    return await this.expenseReportModel
      .find({
        clientId: new Types.ObjectId(clientId),
        isCajaChica: true,
      })
      .populate('userId', 'name email')
      .populate({
        path: 'expenseIds',
        select:
          'total expenseType fechaEmision proveedor data mobilityRows description categoryId proyectId',
        populate: [
          { path: 'categoryId', select: 'name' },
          { path: 'proyectId', select: 'name code' },
        ],
      })
      .sort({ createdAt: -1 })
      .exec()
  }

  async findExpensesPaginated(
    reportId: string,
    opts: {
      page: number
      limit: number
      type?: string
      status?: string
      search?: string
      /** Quién consulta, para el filtro "me falta aprobar" (VD-114). */
      actorUserId?: string
    }
  ) {
    const report = await this.expenseReportModel
      .findById(reportId)
      .select('expenseIds')
      .exec()
    if (!report) throw new NotFoundException(`Report ${reportId} not found`)

    const ids = report.expenseIds.map(id => new Types.ObjectId(id.toString()))
    if (ids.length === 0) {
      return {
        data: [],
        total: 0,
        page: opts.page,
        limit: opts.limit,
        pages: 0,
      }
    }

    const filter: Record<string, unknown> = { _id: { $in: ids } }
    const and: Record<string, unknown>[] = []
    if (opts.type && opts.type !== 'all') {
      filter['expenseType'] = opts.type
    }
    if (opts.status && opts.status !== 'all') {
      // VD-114: "Pendiente" no puede leer `status` directo. Un comprobante
      // recién cargado guarda ahí el resultado de la validación SUNAT
      // ('VALIDO_ACEPTADO', 'sunat_error', 'PENDING'…), así que los que estaban
      // en 0/2 aprobaciones quedaban fuera del filtro. Pendiente = todo lo que
      // no está aprobado ni rechazado; `status` solo vale 'approved'/'rejected'
      // de forma fiable, porque cada aprobación recalcula el estado combinado.
      if (opts.status === 'pending') {
        and.push({ status: { $nin: ['approved', 'rejected'] } })
        and.push({ contabilidadStatus: { $ne: 'rejected' } })
      } else if (opts.status === 'rejected') {
        and.push({
          $or: [{ status: 'rejected' }, { contabilidadStatus: 'rejected' }],
        })
      } else if (opts.status === 'mine_pending') {
        // Comprobantes en los que el usuario es aprobador de un paso que
        // todavía no se resolvió (VD-114).
        if (!opts.actorUserId || !Types.ObjectId.isValid(opts.actorUserId)) {
          and.push({ _id: null })
        } else {
          and.push({
            approverChain: {
              $elemMatch: {
                approved: { $ne: true },
                approverIds: new Types.ObjectId(opts.actorUserId),
              },
            },
          })
          and.push({ status: { $ne: 'rejected' } })
        }
      } else {
        filter['status'] = opts.status
      }
    }
    if (opts.search?.trim()) {
      // VD-65: el buscador de comprobantes filtra por RUC del emisor (antes
      // buscaba por "concepto" en múltiples campos). El RUC vive dentro del JSON
      // `data`, persistido como string, en el campo `rucEmisor`; se busca el
      // término dentro de ese valor para admitir coincidencias parciales.
      const term = opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      and.push({
        data: { $regex: `"rucEmisor"\\s*:\\s*"[^"]*${term}`, $options: 'i' },
      })
    }
    if (and.length) filter['$and'] = and

    const all = await this.expenseModel
      .find(filter)
      .populate('categoryId', 'name')
      .populate('proyectId', 'name code')
      // Nombres de los aprobadores de cada paso de la cadena (regla 1.4) para
      // mostrarlos en la columna Estado en vez del ObjectId crudo, que no es
      // legible para el usuario.
      .populate('approverChain.approverIds', 'name email')
      .exec()

    const sorted = (all as unknown as Record<string, unknown>[]).sort(
      (a, b) => {
        const dA =
          parseFechaEmisionInput(a['fechaEmision'] as string | undefined) ??
          new Date((a['createdAt'] as string | undefined) ?? 0)
        const dB =
          parseFechaEmisionInput(b['fechaEmision'] as string | undefined) ??
          new Date((b['createdAt'] as string | undefined) ?? 0)
        return dB.getTime() - dA.getTime()
      }
    )

    const total = sorted.length
    const skip = (opts.page - 1) * opts.limit
    const data = sorted
      .slice(skip, skip + opts.limit)
      .map(e =>
        applyFechaEmisionDisplayToExpense(
          e as { fechaEmision?: unknown; data?: unknown }
        )
      )

    return {
      data,
      total,
      page: opts.page,
      limit: opts.limit,
      pages: Math.ceil(total / opts.limit),
    }
  }

  /**
   * ¿La rendición está incluida en un reporte de caja chica ya finalizado por
   * Contabilidad? Al finalizar, el total queda congelado, por lo que el
   * colaborador no debe poder agregar ni modificar gastos en esa rendición.
   */
  async isLockedByFinalizedCajaChica(reportId: string): Promise<boolean> {
    if (!reportId || !Types.ObjectId.isValid(reportId)) return false
    const count = await this.cajaChicaReportModel
      .countDocuments({
        status: 'finalized',
        'selectedReports.expenseReportId': new Types.ObjectId(reportId),
      })
      .exec()
    return count > 0
  }

  /**
   * ¿La rendición de caja chica ya fue incluida (jalada) por Contabilidad en
   * algún reporte de caja chica, esté en borrador o finalizado? Una vez jalada,
   * el colaborador ya no puede eliminar su caja chica (rompería la
   * consolidación); solo Contabilidad puede.
   */
  async isReferencedByCajaChica(reportId: string): Promise<boolean> {
    if (!reportId || !Types.ObjectId.isValid(reportId)) return false
    const count = await this.cajaChicaReportModel
      .countDocuments({
        'selectedReports.expenseReportId': new Types.ObjectId(reportId),
      })
      .exec()
    return count > 0
  }

  /**
   * En caja chica el comprobante DESCUENTA del presupuesto del responsable, así
   * que solo él puede cargarlo: un tercero con acceso al módulo podía subir un
   * gasto a la rendición ajena y consumirle la caja al dueño (el cargo siempre
   * va contra el fondo del titular de la rendición, no contra el suyo).
   *
   * Solo cubre caja chica a propósito. Que cualquiera pueda agregar gastos a la
   * rendición de otro es un problema más amplio del módulo, anotado como deuda:
   * acotarlo aquí no cambia los flujos donde Contabilidad carga comprobantes por
   * el colaborador (directas, viáticos).
   */
  async assertPuedeCargarEnCajaChica(
    reportId?: string,
    actorUserId?: string
  ): Promise<void> {
    if (!reportId || !actorUserId || !Types.ObjectId.isValid(reportId)) return
    const report = await this.expenseReportModel
      .findById(reportId)
      .select('isCajaChica userId')
      .lean<{ isCajaChica?: boolean; userId?: unknown }>()
      .exec()
    if (!report?.isCajaChica) return
    if (String(report.userId ?? '') !== String(actorUserId)) {
      throw new ForbiddenException(
        'Solo el responsable de la caja chica puede cargar comprobantes contra su presupuesto.'
      )
    }
  }

  /** Lanza 403 si la rendición pertenece a una caja chica ya finalizada. */
  async assertReportNotLockedByCajaChica(reportId?: string): Promise<void> {
    if (!reportId) return
    if (await this.isLockedByFinalizedCajaChica(reportId)) {
      throw new ForbiddenException(
        'La caja chica de esta rendición fue finalizada por Contabilidad. No se pueden agregar ni modificar más gastos.'
      )
    }
  }

  /**
   * Moneda y TC congelado de una rendición. Lectura liviana: la usa el alta de
   * gastos para expresar cada comprobante en la moneda del viático sin cargar
   * el reporte completo con sus populates.
   */
  async findCurrencyMeta(reportId: string): Promise<{
    moneda?: string
    tipoCambio?: number
    tcFecha?: string
  } | null> {
    if (!Types.ObjectId.isValid(reportId)) return null
    const report = await this.expenseReportModel
      .findById(reportId)
      .select('viaticoMoneda tipoCambio tcFecha')
      .lean<{ viaticoMoneda?: string; tipoCambio?: number; tcFecha?: string }>()
      .exec()
    if (!report) return null
    return {
      moneda: report.viaticoMoneda,
      tipoCambio: report.tipoCambio,
      tcFecha: report.tcFecha,
    }
  }

  /**
   * True cuando la rendición no puede aportar una OT a sus gastos, porque no la
   * lleva. Los gastos de planilla de movilidad la heredan de la rendición y la
   * OT es opcional en ambos orígenes:
   *  - viático: opcional al solicitarlo (VD-28)
   *  - directa: opcional al crear la rendición
   *  - caja chica: la rendición no tiene OT propia; CC y OT se eligen por
   *    comprobante y son opcionales (decisión del cliente). Sin esto el
   *    colaborador no podía cargar una planilla de movilidad en su caja chica:
   *    se le exigía una OT que la pantalla ni siquiera le ofrece.
   * Si la rendición no la tiene, el formulario ni siquiera muestra el campo, así
   * que no hay nada que exigirle a la planilla.
   */
  async isReportSinOrdenTrabajo(reportId?: string): Promise<boolean> {
    if (!reportId || !Types.ObjectId.isValid(reportId)) return false
    const report = await this.expenseReportModel
      .findById(reportId)
      .select('type isDirecta isCajaChica viaticoOrdenTrabajoId directaOrdenTrabajoId')
      .lean<{
        type?: string
        isDirecta?: boolean
        isCajaChica?: boolean
        viaticoOrdenTrabajoId?: Types.ObjectId
        directaOrdenTrabajoId?: Types.ObjectId
      }>()
      .exec()
    if (!report) return false
    if (report.isCajaChica) return true
    if (report.type === 'viatico') return !report.viaticoOrdenTrabajoId
    if (report.isDirecta) return !report.directaOrdenTrabajoId
    return false
  }

  /**
   * Centro de costo con el que se imputa un comprobante de caja chica que llega
   * SIN centro de costo: el del responsable, el mismo que quedó guardado en su
   * primera solicitud (decisión del cliente, 2026-08-18). Elegirlo por
   * comprobante sigue siendo opcional para él; lo que ya no queda es un gasto
   * sin imputar, que era lo que frenaba el asiento contable.
   *
   * Se toma de la SOLICITUD y no del perfil para que sea estable: si mañana le
   * cambian el centro de costo al colaborador, los comprobantes de esa caja no
   * se mueven. El perfil queda de respaldo por si el fondo se creó a mano.
   *
   * Devuelve `undefined` si no hay de dónde sacarlo: mejor un comprobante sin
   * centro de costo que un alta rota.
   */
  async resolveCentroCostoCajaChica(
    reportId: string
  ): Promise<Types.ObjectId | undefined> {
    if (!reportId || !Types.ObjectId.isValid(reportId)) return undefined
    const report = await this.expenseReportModel
      .findById(reportId)
      .select('userId clientId')
      .lean<{ userId?: unknown; clientId?: unknown }>()
      .exec()
    const ownerId = report?.userId ? String(report.userId) : ''
    const clientId = report?.clientId ? String(report.clientId) : ''
    if (!ownerId || !clientId) return undefined

    const fondo = await this.fondoCajaChicaService.findVivoByResponsible(
      ownerId,
      clientId
    )
    const solicitudId = (fondo as unknown as { solicitudReportId?: unknown })
      ?.solicitudReportId
    if (solicitudId) {
      const solicitud = await this.expenseReportModel
        .findById(String(solicitudId))
        .select('projectId')
        .lean<{ projectId?: unknown }>()
        .exec()
      if (solicitud?.projectId) return new Types.ObjectId(String(solicitud.projectId))
    }

    const profile = await this.userService.findTransactionalProfile(ownerId)
    const fallback = profile?.primaryProjectId ?? profile?.projectIds?.[0]
    return fallback ? new Types.ObjectId(String(fallback)) : undefined
  }

  /** `true` si la rendición es de caja chica. Sin id, `false`. */
  async isReportCajaChica(reportId?: string): Promise<boolean> {
    if (!reportId || !Types.ObjectId.isValid(reportId)) return false
    const report = await this.expenseReportModel
      .findById(reportId)
      .select('isCajaChica')
      .lean<{ isCajaChica?: boolean }>()
      .exec()
    return report?.isCajaChica === true
  }

  async findOne(id: string) {
    const report = await this.expenseReportModel
      .findById(id)
      .populate('userId', 'name email signature bankAccount dni area')
      .populate({
        path: 'expenseIds',
        populate: [
          { path: 'categoryId', select: 'name cuenta' },
          { path: 'proyectId', select: 'name' },
          // OT y su centro de costo por gasto (columnas OT / C.COSTO del formato
          // ADF-FOR-004). costCenterId se popula anidado para obtener el nombre.
          {
            path: 'ordenTrabajoId',
            select: 'nombre costCenterId',
            populate: { path: 'costCenterId', select: 'code name' },
          },
          // Aprobadores N1/N2 esperados por comprobante (regla 1.4) y quién
          // aprobó por Contabilidad — para mostrar nombres reales (no roles
          // genéricos) en la sección Estado de la RENDICIÓN.
          { path: 'approverChain.approverIds', select: 'name email' },
          // Quién aprobó REALMENTE cada paso de la cadena del comprobante, con
          // firma. Es la única fuente fiable del recuadro V°B° JEFE INMEDIATO
          // del formato ADF-FOR-004: cuando VD-87 auto-avanza la rendición no
          // hay un `coordinatorApprovedBy` a nivel de reporte, porque la
          // aprobación ocurrió comprobante por comprobante.
          { path: 'approverChain.approvedBy', select: 'name signature dni' },
          { path: 'contabilidadApprovedBy', select: 'name email' },
        ],
      })
      .populate('createdBy', 'name email')
      // Firma incluida para el recuadro V°B° JEFE INMEDIATO del formato ADF-FOR-004
      // (fallback cuando no hubo coordinador).
      .populate('approvedBy', 'name email signature')
      // Coordinador snapshot de la rendición (regla 1.4, rendición normal/directa
      // sin cadena por comprobante): nombre para mostrarlo en la sección Estado.
      .populate('assignedCoordinatorId', 'name email')
      // Coordinador que aprobó: se incluye su firma/DNI para el PDF de la planilla
      // de movilidad (firma del colaborador y del coordinador, VD-33).
      .populate('coordinatorApprovedBy', 'name email signature dni')
      // Contabilidad que dio la aprobación final: nombre y firma para la trazabilidad
      // y el recuadro V°B° FINANZAS (VD-31).
      .populate('contabilidadApprovedBy', 'name email signature')
      // Contabilidad que aprobó la SOLICITUD del viático (regla 1.3) — distinto de
      // contabilidadApprovedBy, que es de la RENDICIÓN (regla 1.4, posterior al pago).
      // Firma incluida para el recuadro "V°B° Recepción dinero" del PDF Solicitud
      // de Fondos (ADF-FOR-003, VD-90).
      .populate('viaticoSolicitudContabilidadApprovedBy', 'name email signature')
      .populate('projectId', 'name')
      .populate({
        path: 'viaticoOrdenTrabajoId',
        select: 'nombre costCenterId',
        populate: { path: 'costCenterId', select: 'code name' },
      })
      .populate({
        path: 'directaOrdenTrabajoId',
        select: 'nombre costCenterId',
        populate: { path: 'costCenterId', select: 'code name' },
      })
      .populate('viaticoApproverChain.approverIds', 'name email')
      .populate('rendicionApproverChain.approverIds', 'name email')
      .exec()

    if (!report) {
      throw new NotFoundException(`Expense report with ID ${id} not found`)
    }
    const normalized = this.normalizeReportExpenseDates(report)
      // Flag derivado para el front: si la caja chica fue finalizada, el
      // colaborador ya no puede subir gastos (botón "Añadir Gasto" oculto).
      ; (
        normalized as unknown as { lockedByCajaChica?: boolean }
      ).lockedByCajaChica =
        (normalized as unknown as { isCajaChica?: boolean }).isCajaChica === true
          ? await this.isLockedByFinalizedCajaChica(id)
          : false

    // Caja de quien rinde (no la de quien mira). El front la necesita para el
    // modal de envío y las tarjetas de cabecera; pedirla por su cuenta con
    // `/fondo-caja-chica/mine` devuelve la caja del USUARIO CONECTADO, así que
    // el aprobador o Contabilidad veían su propio presupuesto —o ninguno— sobre
    // la rendición de otro.
    if ((normalized as unknown as { isCajaChica?: boolean }).isCajaChica === true) {
      const cajaOwnerId = String(
        (normalized as any).userId?._id ?? (normalized as any).userId ?? ''
      )
      const cajaClientId = String(
        (normalized as any).clientId?._id ?? (normalized as any).clientId ?? ''
      )
      if (cajaOwnerId && cajaClientId) {
        const fondo = await this.fondoCajaChicaService.findVivoByResponsible(
          cajaOwnerId,
          cajaClientId
        )
        if (fondo) {
          const fundAmount = Number(fondo.fundAmount ?? 0)
          const spentAmount = Number(fondo.spentAmount ?? 0)
          ; (normalized as any).cajaChicaFondo = {
            code: fondo.code,
            status: fondo.status,
            fundAmount,
            // "Gastado y aún no repuesto": tras la reposición vuelve a 0.
            spentAmount,
            disponible: Math.round((fundAmount - spentAmount) * 100) / 100,
            pendingReturnAmount: Number(fondo.pendingReturnAmount ?? 0),
          }
        }
      }
    }

    // N° de rendición para viáticos (VD-63): los viáticos no tienen `codigo`
    // (solo las directas). Se numeran por la posición del viático entre los del
    // mismo colaborador, ordenados por fecha de creación. Aquí devolvemos solo la
    // posición estable; el front arma "INICIALES-00N" con el nombre que muestra.
    const meta = normalized as unknown as {
      type?: string
      userId?: { _id?: unknown }
      clientId?: unknown
      createdAt?: Date
      viaticoPosition?: number
    }
    if (meta.type === 'viatico') {
      const ownerRef = meta.userId as { _id?: unknown } | unknown
      const ownerId =
        ownerRef && typeof ownerRef === 'object' && '_id' in ownerRef
          ? (ownerRef as { _id?: unknown })._id
          : ownerRef
      const earlier = await this.expenseReportModel.countDocuments({
        type: 'viatico',
        clientId: meta.clientId,
        userId: ownerId,
        createdAt: { $lt: meta.createdAt },
      })
      meta.viaticoPosition = earlier + 1
    }
    return normalized
  }

  /**
   * Nombre visible de la rendición para correos y notificaciones. Los viáticos
   * (y algunos reportes) guardan el nombre en `description`, no en `title` — el
   * header del app usa `description`. Sin este fallback, los correos mostraban el
   * campo "Título:"/"Rendición:" vacío. Cae a description y luego a un genérico.
   */
  private resolveReportTitle(report: any): string {
    const title = typeof report?.title === 'string' ? report.title.trim() : ''
    const description =
      typeof report?.description === 'string' ? report.description.trim() : ''
    return title || description || 'Rendición'
  }

  private normalizeReportExpenseDates(report: ExpenseReportDocument) {
    // Convertimos a POJO antes de tocar `expenseIds`: asignar POJOs sobre un
    // Document hace que Mongoose castee cada elemento de vuelta a ObjectId
    // (por el `ref: 'Expense'` del schema), descartando los datos populados.
    const pojo =
      typeof (report as { toObject?: () => unknown }).toObject === 'function'
        ? (
          report as unknown as { toObject: () => Record<string, unknown> }
        ).toObject()
        : (report as unknown as Record<string, unknown>)

    const raw = pojo.expenseIds
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') {
      pojo.expenseIds = applyFechaEmisionDisplayToExpenses(
        raw as { fechaEmision?: unknown; data?: unknown }[]
      )
    }
    return pojo as unknown as ExpenseReportDocument
  }

  /**
   * Notifica a Contabilidad que una rendición quedó lista para su aprobación
   * final (coordinador/cadena de centro de costo ya completada), y al
   * colaborador que ya pasó ese paso. Compartido entre la rendición normal
   * (coordinador único, desde `update()`) y la rendición directa (cadena del
   * jefe inmediato, desde `approveDirecta`).
   */
  private async notifyAccountingReportPendingApproval(
    id: string,
    fullyUpdatedReport: any
  ): Promise<void> {
    try {
      const clientId = String(fullyUpdatedReport.clientId)
      const ownerRef = fullyUpdatedReport.userId as any
      const ownerId = ownerRef?._id ? String(ownerRef._id) : String(ownerRef)
      const collaboratorName =
        (typeof ownerRef === 'object' && ownerRef?.name) || 'Colaborador'
      const reportTitle = this.resolveReportTitle(fullyUpdatedReport)
      const budgetFormatted = (
        await this.computeReportBudgetDisplay(fullyUpdatedReport)
      ).toFixed(2)
      const expenseCount = fullyUpdatedReport.expenseIds?.length ?? 0
      const platformUrl = this.emailService.buildAppUrl(
        `/mis-rendiciones/${id}/detalle`
      )

      const ownerProfile =
        await this.userService.findTransactionalProfile(ownerId)
      const ownerCoordinatorId =
        ownerProfile?.coordinatorId?.toString?.() || ''
      const ownerEmailLower =
        typeof ownerRef === 'object' && ownerRef?.email
          ? String(ownerRef.email).trim().toLowerCase()
          : ''

      const accountingUsersRaw =
        await this.userService.findAccountingRecipientsWithIds(clientId)
      const accountingUsers = accountingUsersRaw.filter(
        u =>
          u._id !== ownerId &&
          u._id !== ownerCoordinatorId &&
          (ownerEmailLower
            ? u.email?.trim().toLowerCase() !== ownerEmailLower
            : true)
      )
      for (const u of accountingUsers) {
        await this.notificationsService.create({
          userId: u._id,
          title: 'Rendición aprobada por los aprobadores',
          message: `La rendición "${reportTitle}" fue aprobada por los aprobadores y está lista para tu aprobación final.`,
          type: 'info',
          actionUrl: `/mis-rendiciones/${id}/detalle`,
        })

        try {
          const accountingEmailEnabled =
            await this.userService.isEmailEnabled(u._id)
          if (accountingEmailEnabled) {
            await this.emailService.sendRendicionPendienteContabilidad(
              u.email,
              {
                clientId,
                recipientName: u.name,
                collaboratorName,
                reportTitle,
                budgetFormatted,
                currencySymbol: this.reportCurrencySymbol(fullyUpdatedReport),
                expenseCount,
                platformUrl,
              }
            )
          }
        } catch (mailErr) {
          console.error(
            `[pending_accounting] Error correo contabilidad ${u.email}:`,
            mailErr
          )
        }
      }

      await this.notificationsService.create({
        userId: ownerId,
        title: 'Tu rendición fue aprobada por los aprobadores',
        message: `Tu rendición "${reportTitle}" fue aprobada por los aprobadores. Contabilidad realizará la revisión final.`,
        type: 'success',
        actionUrl: `/mis-rendiciones/${id}/detalle`,
      })
    } catch (error) {
      console.error(
        'Error enviando notificaciones a contabilidad (pending_accounting)',
        error
      )
    }
  }

  async update(id: string, updateExpenseReportDto: UpdateExpenseReportDto) {
    const dto = updateExpenseReportDto
    const existing = await this.expenseReportModel
      .findById(id)
      // `isCajaChica` va en el select porque de el sale `esCajaChica` al
      // (re)construir las cadenas por comprobante: sin traerlo llegaba siempre
      // como `false` y los comprobantes de una caja chica se enrutaban por el
      // centro de costo de cada uno (`buildRendicionChain`) en vez de por los
      // aprobadores del RESPONSABLE, que es la regla de caja chica.
      .select('status isDirecta isCajaChica type clientId projectId userId expenseIds rendicionApproverChain rendicionApprovalLevel rendicionRequiredLevels')
      .lean()
      .exec()
    if (!existing) {
      throw new NotFoundException(`Expense report with ID ${id} not found`)
    }
    const isDirecta = (existing as any).isDirecta === true
    // Viático con pago parcial: sigue en fase de carga, el colaborador puede enviarlo
    // aunque contabilidad aún no complete el depósito (lo completa tras el envío).
    const isPartialViatico =
      (existing as any).type === 'viatico' &&
      existing.status === 'partially_paid'

    if (dto.status === 'reimbursed') {
      throw new BadRequestException(
        'El estado reembolsado se registra únicamente al cargar el comprobante de pago en tesorería.'
      )
    }

    if (
      dto.status === 'submitted' &&
      existing.status !== 'open' &&
      existing.status !== 'rejected' &&
      !isPartialViatico
    ) {
      throw new BadRequestException(
        'Solo se puede enviar una rendición en estado abierta o rechazada.'
      )
    }
    if (dto.status === 'submitted') {
      await this.validateBeforeSubmit(id)
    }
    if (dto.status === 'solicited' && existing.status !== 'rejected') {
      throw new BadRequestException(
        'Solo se puede re-enviar una solicitud en estado rechazada.'
      )
    }
    if (dto.status === 'open' && existing.status !== 'solicited') {
      throw new BadRequestException(
        'Solo se puede aprobar una solicitud en estado solicitada.'
      )
    }
    if (
      dto.status === 'rejected' &&
      existing.status !== 'submitted' &&
      existing.status !== 'solicited' &&
      existing.status !== 'pending_accounting'
    ) {
      throw new BadRequestException(
        'Solo se pueden rechazar rendiciones enviadas, solicitadas o pendientes de contabilidad.'
      )
    }
    if (
      dto.status === 'pending_accounting' &&
      existing.status !== 'submitted'
    ) {
      throw new BadRequestException(
        'Solo se puede enviar a contabilidad una rendicion en estado enviada.'
      )
    }
    if (dto.status === 'pending_accounting') {
      await this.validateBeforeFinalApproval(id)
      // La rendición pasa a Contabilidad SOLO cuando su cadena de aprobadores de
      // centro de costo (N1/N2…) a nivel de reporte está completa. Ese avance lo
      // realiza `approveRendicion` (el último aprobador). Un intento directo por
      // aquí con la cadena aún incompleta se rechaza (evita saltarse aprobadores).
      const reportChain = (existing as any).rendicionApproverChain as ChainStep[] | undefined
      if (reportChain !== undefined && !isChainFullyApproved(reportChain)) {
        throw new BadRequestException(
          'La rendición aún no fue aprobada por todos los aprobadores del centro de costo (N1/N2). Debe aprobarse por cada aprobador antes de pasar a Contabilidad.'
        )
      }
    }
    if (dto.status === 'approved' && existing.status !== 'pending_accounting') {
      throw new BadRequestException(
        'Solo se puede aprobar una rendicion pendiente de contabilidad.'
      )
    }
    // No aprobar la rendición completa si quedó algún comprobante observado.
    // En el flujo normal, rechazar un comprobante por Contabilidad ya devuelve la
    // rendición a 'rejected' (returnToCollaboratorOnAccountingRejection). Este
    // guard cubre además el caso en que un aprobador rechazó un comprobante con
    // `rejectByCoord`: el auto-avance a `pending_accounting` ignora los rechazados,
    // así que la rendición podría llegar aquí con uno observado sin corregir.
    if (dto.status === 'approved') {
      await this.assertNoRejectedExpenses(id)
      await this.assertAllExpensesApprovedByAccounting(id)
    }
    // Un viático con pago parcial SÍ puede aprobarse aunque quede saldo del anticipo
    // sin depositar: la liquidación reconcilia con lo realmente pagado
    // (viaticoPaidAmount) vs lo gastado → reembolso al colaborador o devolución según
    // el caso. El saldo no depositado simplemente no entra en la cuenta.

    const $set: Record<string, unknown> = {}
    const $unset: Record<string, ''> = {}

    // Solo campos definidos: evita $set con undefined y no pisa expenseIds por error
    if (dto.title !== undefined) $set.title = dto.title
    if (dto.description !== undefined) $set.description = dto.description
    if (dto.budget !== undefined) $set.budget = dto.budget

    // Al enviar (o reenviar tras rechazo) una rendición — normal, directa, de
    // caja chica, o la RENDICIÓN de comprobantes de un viático ya pagado — se
    // (re)construye la cadena de aprobación por documento (regla 1.4) de cada
    // uno de sus comprobantes — ver `buildExpenseChains`. La SOLICITUD del
    // viático (createViatico/resubmitViatico, regla 1.3) tiene su propio flujo
    // y no pasa por aquí; pero una vez pagado y enviado a rendición, sus
    // comprobantes necesitan la misma cadena N1/N2 que cualquier otra.
    if (dto.status !== undefined) {
      if (dto.status === 'submitted') {
        const ownerId = (existing as any).userId?.toString()
        const reportClientId = (existing as any).clientId?.toString()
        if (ownerId && reportClientId) {
          await this.buildExpenseChains(
            ((existing as any).expenseIds ?? []) as Types.ObjectId[],
            ownerId,
            reportClientId,
            { esCajaChica: (existing as any).isCajaChica === true }
          )
          // Cadena de aprobación de la RENDICIÓN a nivel de reporte (viático):
          // los aprobadores del centro de costo (N1/N2…) deben completarla antes
          // de que la rendición pase a Contabilidad. Reusa `buildRendicionChain`
          // tal cual — misma lógica (asignado/apoyo/escalamiento/omisión) que la
          // cadena por comprobante. Se (re)construye en cada envío/reenvío,
          // reseteando cualquier aprobación previa a nivel de reporte.
          const reportProjectId = (existing as any).projectId?.toString()
          if ((existing as any).type === 'viatico' && reportProjectId) {
            try {
              const reportChain = await this.buildReportRendicionChain(
                ownerId,
                reportClientId,
                reportProjectId
              )
              $set.rendicionApproverChain = reportChain
              $set.rendicionRequiredLevels = reportChain.length
              $set.rendicionApprovalLevel = 0
              $set.rendicionApprovalHistory = []
            } catch (err: unknown) {
              this.logger.error(
                `No se pudo construir la cadena de rendición del reporte ${id}: ${err instanceof Error ? err.message : String(err)}`
              )
            }
          }
        }
        $set.status = 'submitted'
      } else {
        $set.status = dto.status
      }
    }
    if (dto.userId !== undefined) $set.userId = new Types.ObjectId(dto.userId)
    if (dto.clientId !== undefined)
      $set.clientId = new Types.ObjectId(dto.clientId)
    if (dto.projectId !== undefined) {
      $set.projectId = dto.projectId ? new Types.ObjectId(dto.projectId) : null
      // El centro de costo cambió: se re-snapshotea su coordinador. Si se limpia
      // el centro de costo, también se limpia el coordinador asignado.
      $set.assignedCoordinatorId = dto.projectId
        ? (await this.resolveAssignedCoordinatorId(
          dto.projectId,
          String((existing as any).clientId)
        )) ?? null
        : null
    }
    if (dto.expenseIds !== undefined && Array.isArray(dto.expenseIds)) {
      $set.expenseIds = dto.expenseIds.map(eId => new Types.ObjectId(eId))
    }

    if (dto.status === 'rejected') {
      const reason =
        typeof dto.rejectionReason === 'string'
          ? dto.rejectionReason.trim()
          : ''
      if (!reason) {
        throw new BadRequestException(
          'El motivo de rechazo es obligatorio para rechazar una rendición.'
        )
      }
      $set.rejectionReason = reason
      // Quién rechazó se infiere del estado previo: pending_accounting → Contabilidad;
      // submitted/solicited → Coordinador.
      $set.rejectedByRole =
        existing.status === 'pending_accounting'
          ? 'contabilidad'
          : 'coordinador'
    } else if (
      dto.rejectionReason !== undefined &&
      dto.status !== 'submitted'
    ) {
      $set.rejectionReason = dto.rejectionReason?.trim() || ''
    }

    if (dto.status === 'submitted' || dto.status === 'solicited') {
      $unset.rejectionReason = ''
      $unset.rejectedByRole = ''
    }

    const updatePayload: Record<string, unknown> = {}
    if (Object.keys($set).length > 0) updatePayload.$set = $set
    if (Object.keys($unset).length > 0) updatePayload.$unset = $unset

    if (Object.keys(updatePayload).length > 0) {
      const updated = await this.expenseReportModel
        .findByIdAndUpdate(id, updatePayload, { new: true })
        .exec()
      if (!updated) {
        throw new NotFoundException(`Expense report with ID ${id} not found`)
      }
    }

    // findByIdAndUpdate no hace populate: la UI necesita expenseIds como documentos
    const fullyUpdatedReport = await this.findOne(id)

    // La cadena de cada comprobante se construye al SUBIRLO, no al enviar la
    // rendición (ver `buildExpenseChains`), justamente para que los aprobadores
    // puedan revisar sin esperar al colaborador. El efecto secundario es que
    // pueden terminar de aprobar TODO antes de que él haga clic en "Enviar": en
    // ese caso no queda ningún `approveByCoord` posterior que dispare el avance
    // automático a Contabilidad (VD-87) y la rendición se queda atascada en
    // `submitted` de forma definitiva — desde VD-87 los aprobadores ya no tienen
    // botón a nivel de reporte y Contabilidad solo puede actuar desde
    // `pending_accounting`. Reevaluar aquí cierra esa ventana: al enviar, si
    // todo está ya aprobado, la rendición pasa de largo a Contabilidad.
    // Idempotente: si falta alguna aprobación no hace nada y el flujo sigue
    // dependiendo de `approveByCoord`, como siempre.
    let autoAdvancedToAccounting = false
    if (dto.status === 'submitted') {
      autoAdvancedToAccounting =
        await this.advanceToAccountingIfAllExpensesApproved(id).catch(err => {
          this.logger.error(
            `No se pudo evaluar el avance a Contabilidad al enviar la rendición ${id}: ${err instanceof Error ? err.message : String(err)}`
          )
          return false
        })
    }

    // Si la rendición solicitada fue editada sin cambio de estado, re-notificar admins
    if (existing.status === 'solicited' && dto.status === undefined) {
      try {
        const admins = await this.userService.findAdminsByClient(
          String(fullyUpdatedReport.clientId)
        )
        const ownerRef = fullyUpdatedReport.userId as any
        const ownerId = ownerRef?._id ? String(ownerRef._id) : String(ownerRef)
        const user = await this.userService.findOne(ownerId)
        const creatorName = user.name || 'Un colaborador'
        for (const admin of admins) {
          await this.notificationsService.create({
            userId: String(admin._id),
            title: 'Solicitud de rendición actualizada',
            message: `${creatorName} ha actualizado su solicitud de rendición: "${fullyUpdatedReport.title}"`,
            type: 'info',
            actionUrl: `/mis-rendiciones/${id}/detalle`,
          })
        }
      } catch (error) {
        console.error(
          'Error enviando notificaciones de rendición actualizada',
          error
        )
      }
    }

    // Coordinador aprueba la rendición normal (→ pending_accounting): notificar a contabilidad + colaborador
    // No aplica a rendiciones directas (para directa se llama desde approveDirecta al completar su cadena)
    if (dto.status === 'pending_accounting' && !isDirecta) {
      await this.notifyAccountingReportPendingApproval(id, fullyUpdatedReport)
    }

    // Contabilidad aprueba la rendición (→ approved): notificar colaborador
    // En rendición directa: solo colaborador. En flujo normal: colaborador + coordinador.
    if (dto.status === 'approved') {
      console.log(`[APROBACIÓN RENDICIÓN] Entrando al bloque approved para rendición ${id}`)
      const owner = fullyUpdatedReport.userId as any
      const ownerId = owner?._id ? String(owner._id) : String(owner)

      // Contabilidad aprueba a nivel de RENDICIÓN, no gasto por gasto: al aprobar
      // la rendición completa, sus comprobantes quedan aprobados por Contabilidad.
      // Sin esto quedaban en "Pendiente Contabilidad" (con sus botones ✓/✗) aunque
      // la rendición ya estaba aprobada, lo cual confundía a todos.
      const contActor = (fullyUpdatedReport as any).contabilidadApprovedBy
      const contActorId =
        contActor && typeof contActor === 'object'
          ? String(contActor._id)
          : contActor
            ? String(contActor)
            : undefined
      await this.markReportExpensesAccountingApproved(id, contActorId).catch(
        () => {}
      )

      const reportTitle = this.resolveReportTitle(fullyUpdatedReport)
      const budgetDisplay =
        await this.computeReportBudgetDisplay(fullyUpdatedReport)
      const platformUrl = this.emailService.buildAppUrl(
        `/mis-rendiciones/${id}/detalle`
      )
      const collaboratorName =
        (typeof owner === 'object' && owner?.name) || 'Colaborador'

      try {
        const ownerEmail =
          (typeof owner === 'object' && owner?.email) || undefined
        const ownerEmailEnabled = ownerId
          ? await this.userService.isEmailEnabled(ownerId)
          : false
        if (ownerEmail && ownerEmailEnabled) {
          await this.emailService.sendRendicionFullyApprovedEmail(ownerEmail, {
            clientId: String(fullyUpdatedReport.clientId),
            userName: collaboratorName,
            title: reportTitle,
            budget: budgetDisplay,
            // `budgetDisplay` sale de `computeReportBudgetDisplay`, que devuelve
            // el presupuesto en la moneda de la rendición, no en la base.
            currencySymbol: this.reportCurrencySymbol(fullyUpdatedReport),
            platformUrl,
          })
        }
        await this.notificationsService.create({
          userId: ownerId,
          title: 'Rendición aprobada por Contabilidad',
          message: `Tu rendición "${reportTitle}" ha sido aprobada por contabilidad. Revisa el detalle para los próximos pasos.`,
          type: 'success',
          actionUrl: `/mis-rendiciones/${id}/detalle`,
        })

        // VD-95: la cadena de aprobadores (Aprobador 1, 2, … N) YA NO recibe
        // aviso cuando Contabilidad aprueba —ni correo ni campana—. Ellos ya
        // hicieron su parte; a partir de la aprobación de Contabilidad el hilo
        // es entre Contabilidad y el colaborador. Se eliminó con esto el correo
        // "Rendición aprobada por Contabilidad" y su plantilla.
      } catch (error) {
        console.error(
          'Error enviando notificaciones de rendición aprobada por contabilidad',
          error
        )
      }

      // VD-88: liquidar PRIMERO para saber si el resultado es un pago al
      // colaborador (reembolso/directa) o una DEVOLUCIÓN (el colaborador debe
      // devolver saldo). El correo de "pendiente de pago" a Tesorería solo
      // aplica cuando hay algo que pagar.
      try {
        await this.advanceService.liquidateExpenseReport(id)
      } catch (err) {
        console.error(
          `[ExpenseReportService] Liquidación post-aprobación ${id}:`,
          err
        )
      }

      let liquidated: {
        settlement?: { type?: string; difference?: number }
        title?: string
        description?: string
        clientId?: any
      } | null = null
      try {
        liquidated = await this.expenseReportModel
          .findById(id)
          .select('settlement title description clientId')
          .lean<{
            settlement?: { type?: string; difference?: number }
            title?: string
            description?: string
            clientId?: any
          }>()
          .exec()
      } catch (err) {
        console.error(
          `[ExpenseReportService] Lectura settlement post-aprobación ${id}:`,
          err
        )
      }
      const diffAbs = Math.abs(Number(liquidated?.settlement?.difference ?? 0))
      const isDevolucion =
        liquidated?.settlement?.type === 'devolucion' && diffAbs >= 0.01

      // Correo a Tesorería con datos de pago al colaborador — SOLO cuando hay
      // un monto real que pagar (reembolso, `diffAbs >= 0.01`). NO en
      // devolución (VD-88 bug 1) ni en `equilibrado` (nada que pagar → no se
      // envía "pendiente de pago" ni se muestra un monto en 0).
      if (!isDevolucion && diffAbs >= 0.01) {
        try {
          const clientIdStr = String(fullyUpdatedReport.clientId)
          const tesoreriaRecipients =
            await this.userService.findTesoreriaNotifyRecipients(clientIdStr)
          const tesoreriaEmails = tesoreriaRecipients.map(r => r.email)
          if (tesoreriaEmails.length > 0) {
            const bank =
              (typeof owner === 'object' && owner?.bankAccount) || null
            const hasBankAccount = !!bank?.accountNumber
            const tesoreriaEmailData = {
              clientId: clientIdStr,
              reportTitle,
              collaboratorName,
              collaboratorDni:
                (typeof owner === 'object' && owner?.dni) || undefined,
              budgetFormatted: Number(budgetDisplay).toFixed(2),
              currencySymbol: this.reportCurrencySymbol(fullyUpdatedReport),
              hasBankAccount,
              bankName: bank?.bankName || undefined,
              accountType:
                bank?.accountType === 'ahorros'
                  ? 'Ahorros'
                  : bank?.accountType === 'corriente'
                    ? 'Corriente'
                    : undefined,
              accountNumber: bank?.accountNumber || undefined,
              cci: bank?.cci || undefined,
              platformUrl,
            }
            for (const tesoEmail of tesoreriaEmails) {
              await this.emailService.sendRendicionAprobadaTesoreria(
                tesoEmail,
                tesoreriaEmailData
              )
            }
          }
        } catch (err) {
          console.error(`[TESORERÍA RENDICIÓN] ERROR:`, err)
        }
      }

      // Si el resultado es devolución, avisar al colaborador que debe devolver.
      if (isDevolucion) {
        try {
          const amountFormatted = diffAbs.toFixed(2)
          const ownerEmailLocal =
            (typeof owner === 'object' && owner?.email) || undefined
          if (ownerEmailLocal) {
            const ownerEmailEnabledLocal = ownerId
              ? await this.userService.isEmailEnabled(ownerId)
              : false
            if (ownerEmailEnabledLocal) {
              await this.emailService.sendRendicionDevolucionColaborador(
                ownerEmailLocal,
                {
                  clientId: String(
                    liquidated?.clientId ?? fullyUpdatedReport.clientId
                  ),
                  recipientName: collaboratorName,
                  reportTitle:
                    liquidated?.title || liquidated?.description || reportTitle,
                  amountFormatted,
                  currencySymbol: this.settlementCurrencySymbol(
                    liquidated ?? fullyUpdatedReport
                  ),
                  closedAt: this.emailService.formatDateDDMMYYYY(new Date()),
                  platformUrl,
                }
              )
            }
          }
          await this.notificationsService
            .create({
              userId: ownerId,
              title: 'Saldo pendiente de devolución',
              message: `Tu rendición "${reportTitle}" fue aprobada. Tienes un saldo de ${this.settlementCurrencySymbol(liquidated ?? fullyUpdatedReport)} ${amountFormatted} a devolver a la empresa.`,
              type: 'warning',
              actionUrl: `/mis-rendiciones/${id}/detalle`,
            })
            .catch(() => { })
        } catch (err) {
          console.error(
            `[ExpenseReportService] Aviso devolución post-aprobación ${id}:`,
            err
          )
        }
      }
    }

    // Rendición enviada (submitted). Si el envío la mandó directo a Contabilidad
    // (todo ya venía aprobado), se omite: `advanceToAccountingIfAllExpensesApproved`
    // ya avisó a Contabilidad, y convocar a los aprobadores a revisar algo que
    // acaban de aprobar solo genera correos y notificaciones sin acción posible.
    if (dto.status === 'submitted' && !autoAdvancedToAccounting) {
      try {
        const ownerRef2 = fullyUpdatedReport.userId as any
        const ownerId2 = ownerRef2?._id
          ? String(ownerRef2._id)
          : String(ownerRef2)
        const user = await this.userService.findOne(ownerId2)
        const creatorName = user.name || 'Un colaborador'
        const clientId = String(fullyUpdatedReport.clientId)
        const budgetFormatted = (
          await this.computeReportBudgetDisplay(fullyUpdatedReport)
        ).toFixed(2)
        const expenseCount = fullyUpdatedReport.expenseIds?.length ?? 0
        const expenseDocs = Array.isArray(fullyUpdatedReport.expenseIds)
          ? fullyUpdatedReport.expenseIds
          : []
        // `budgetFormatted` viene en la moneda de la rendición, así que los
        // gastos van en la misma: en base darían "Presupuesto 800" contra
        // "Gastado 1066.68" dentro del mismo correo, ambos rotulados S/.
        const currencySymbol = this.reportCurrencySymbol(fullyUpdatedReport)
        const expenseTotal = expenseDocs.reduce(
          (s: number, e: any) => s + this.expenseAmountInReport(e),
          0
        )
        const expenseTotalFormatted = expenseTotal.toFixed(2)
        const expenseItems = expenseDocs.map((e: any) => ({
          categoryName: e?.categoryId?.name || 'Gasto',
          description: e?.description || '',
          totalFormatted: this.expenseAmountInReport(e).toFixed(2),
        }))
        const platformUrl = this.emailService.buildAppUrl(
          `/mis-rendiciones/${id}/detalle`
        )

        // Rendición directa iniciada por Contabilidad: mostrar depósito y saldo en el correo.
        const directaDepositAmount = Number(
          (fullyUpdatedReport as any).directaDeposit?.amount ?? 0
        )
        const hasDirectaDeposit = isDirecta && directaDepositAmount > 0
        const depositFormatted = directaDepositAmount.toFixed(2)
        const saldoFormatted = (directaDepositAmount - expenseTotal).toFixed(2)

        const emailData = {
          clientId,
          collaboratorName: creatorName,
          reportTitle: this.resolveReportTitle(fullyUpdatedReport),
          budgetFormatted,
          currencySymbol,
          expenseCount,
          expenseTotalFormatted,
          expenseItems,
          isDirecta,
          hasDirectaDeposit,
          depositFormatted,
          saldoFormatted,
          platformUrl,
        }

        // Email del colaborador autor: lo reservamos primero en sentEmails para
        // que, si por configuración también figura en Contabilidad/Tesorería,
        // NO reciba el correo orientado al revisor; solo la confirmación "Usted
        // ha enviado…" que va al final.
        const ownerEmail = (fullyUpdatedReport.userId as any)?.email as
          | string
          | undefined
        const ownerEmailKey = ownerEmail?.trim().toLowerCase() || ''

        if (isDirecta) {
          // Rendición directa: la cadena de aprobación es por comprobante (cada
          // uno tiene la suya, ver `buildExpenseChains`).
          await this.notificationsService.create({
            userId: ownerId2,
            title: 'Rendición enviada para aprobación',
            message: `Tu rendición "${fullyUpdatedReport.title}" fue enviada y está pendiente de aprobación por centro de costo.`,
            type: 'info',
            actionUrl: `/mis-rendiciones/${id}/detalle`,
          })

          // VD-85 (rama directa): avisar por CORREO a los aprobadores del centro
          // de costo (Aprobador 1, 2, … N), igual que en la rama normal.
          try {
            const approvers = await this.resolveReportApproverRecipients(id, {
              excludeUserIds: [ownerId2],
            })
            const sentDirecta = new Set<string>()
            for (const a of approvers) {
              if (!a.emailEnabled || !a.email) continue
              const key = a.email.trim().toLowerCase()
              if (sentDirecta.has(key)) continue
              sentDirecta.add(key)
              await this.emailService.sendRendicionSubmitted(a.email, {
                recipientName: a.name,
                ...emailData,
              })
            }
          } catch (err) {
            console.error(
              `[submitted-directa] Error correo a aprobadores por centro de costo ${id}:`,
              err
            )
          }
        } else {
          // Flujo normal: admins in-app + coordinador (in-app + correo) + contabilidad.
          const admins = await this.userService.findAdminsByClient(clientId)
          for (const admin of admins) {
            await this.notificationsService.create({
              userId: String(admin._id),
              title: 'Rendición Enviada',
              message: `${creatorName} ha enviado la rendición "${fullyUpdatedReport.title}" para tu revisión.`,
              type: 'warning',
              actionUrl: `/mis-rendiciones/${id}/detalle`,
            })
          }

          const sentEmails = new Set<string>()
          if (ownerEmailKey) sentEmails.add(ownerEmailKey)

          // Aprobadores del centro de costo (Aprobador 1, 2, … N) — VD-85/VD-87.
          // Reemplaza al `coordinatorId` personal (obsoleto): los avisos van a
          // quienes realmente aprueban la cadena del reporte. El correo se envía
          // al ENVIAR la rendición, NO por cada gasto individual aprobado
          // (comentario de VD-85: "no enviar correos al aprobar gastos").
          try {
            const approvers = await this.resolveReportApproverRecipients(id, {
              excludeUserIds: [ownerId2],
            })
            for (const a of approvers) {
              if (!a.emailEnabled || !a.email) continue
              const key = a.email.trim().toLowerCase()
              if (sentEmails.has(key)) continue
              sentEmails.add(key)
              await this.emailService.sendRendicionSubmitted(a.email, {
                recipientName: a.name,
                ...emailData,
              })
            }
          } catch (err) {
            console.error(
              `[submitted] Error correo a aprobadores por centro de costo ${id}:`,
              err
            )
          }

          // Gate final de Contabilidad.
          const accountingRecipients =
            await this.userService.findContabilidadRecipients(clientId)
          for (const r of accountingRecipients) {
            const key = r.email.trim().toLowerCase()
            if (sentEmails.has(key)) continue
            sentEmails.add(key)
            await this.emailService.sendRendicionSubmitted(r.email, {
              recipientName: r.name,
              ...emailData,
            })
          }
        }

        // Confirmación al colaborador autor de la rendición (siempre, si tiene email habilitado).
        if (ownerEmail) {
          const ownerEmailEnabled =
            await this.userService.isEmailEnabled(ownerId2)
          if (ownerEmailEnabled) {
            await this.emailService.sendRendicionSubmittedToColaborador(
              ownerEmail,
              {
                clientId,
                collaboratorName: creatorName,
                reportTitle: emailData.reportTitle,
                budgetFormatted: emailData.budgetFormatted,
                expenseCount: emailData.expenseCount,
                hasDirectaDeposit: emailData.hasDirectaDeposit,
                depositFormatted: emailData.depositFormatted,
                expenseTotalFormatted: emailData.expenseTotalFormatted,
                saldoFormatted: emailData.saldoFormatted,
                platformUrl: emailData.platformUrl,
              }
            )
          }
        }
      } catch (error) {
        console.error('Error enviando notificaciones (update/submitted)', error)
      }
    }

    // Rendición rechazada: notificar al colaborador (siempre) y al coordinador (solo si la rechazó Contabilidad).
    if (dto.status === 'rejected') {
      try {
        const ownerRef = fullyUpdatedReport.userId as any
        const ownerId = ownerRef?._id ? String(ownerRef._id) : String(ownerRef)
        const collaboratorName =
          (typeof ownerRef === 'object' && ownerRef?.name) || 'Colaborador'
        const ownerEmail =
          (typeof ownerRef === 'object' && ownerRef?.email) || undefined
        const reportTitle = this.resolveReportTitle(fullyUpdatedReport)
        const rejectionReason =
          (fullyUpdatedReport as any).rejectionReason || 'Ver detalle'
        // Distinguir quién rechazó según el estado previo del documento.
        const rejectedByContabilidad = existing.status === 'pending_accounting'
        const rejectedByLabel = rejectedByContabilidad
          ? 'Contabilidad'
          : 'los aprobadores'
        const platformUrl = this.emailService.buildAppUrl(
          `/mis-rendiciones/${id}/detalle`
        )

        await this.notificationsService.create({
          userId: ownerId,
          title: 'Rendición rechazada',
          message: `Tu rendición "${reportTitle}" fue rechazada por ${rejectedByLabel}. Motivo: ${rejectionReason}`,
          type: 'error',
          actionUrl: `/mis-rendiciones/${id}/detalle`,
        })

        // Correo al colaborador.
        if (ownerEmail) {
          const ownerEmailEnabled =
            await this.userService.isEmailEnabled(ownerId)
          if (ownerEmailEnabled) {
            await this.emailService.sendRendicionRechazadaColaborador(
              ownerEmail,
              {
                clientId: String(fullyUpdatedReport.clientId),
                collaboratorName,
                reportTitle,
                rejectionReason,
                rejectedBy: rejectedByLabel,
                platformUrl,
              }
            )
          }
        }

        // Si lo rechazó Contabilidad, también avisar a los APROBADORES del
        // centro de costo (Aprobador 1, 2, … N), no al coordinador personal.
        if (rejectedByContabilidad) {
          try {
            const approvers = await this.resolveReportApproverRecipients(id, {
              excludeUserIds: [ownerId],
            })
            const sentRejected = new Set<string>()
            for (const a of approvers) {
              await this.notificationsService.create({
                userId: a.userId,
                title: 'Rendición rechazada por Contabilidad',
                message: `La rendición "${reportTitle}" de ${collaboratorName} fue rechazada por Contabilidad. Motivo: ${rejectionReason}`,
                type: 'warning',
                actionUrl: `/mis-rendiciones/${id}/detalle`,
              })
              if (!a.emailEnabled || !a.email) continue
              const key = a.email.trim().toLowerCase()
              if (sentRejected.has(key)) continue
              sentRejected.add(key)
              await this.emailService.sendRendicionRechazadaCoordinador(
                a.email,
                {
                  clientId: String(fullyUpdatedReport.clientId),
                  coordinatorName: a.name,
                  collaboratorName,
                  reportTitle,
                  rejectionReason,
                  platformUrl,
                }
              )
            }
          } catch (mailErr) {
            console.error(
              `[rejected] Error correo/notif rechazo a aprobadores ${id}:`,
              mailErr
            )
          }
        }
      } catch (error) {
        console.error(
          'Error enviando notificación de rechazo de rendición',
          error
        )
      }
    }

    // `fullyUpdatedReport` se leyó cuando la rendición todavía estaba en
    // `submitted`: si el envío la avanzó a Contabilidad, la UI debe recibir el
    // estado nuevo o mostraría "pendiente de aprobadores" hasta el próximo refresh.
    if (autoAdvancedToAccounting) {
      return (await this.findOne(id)) as ExpenseReportDocument
    }

    return fullyUpdatedReport
  }

  /**
   * Extrae la "key" de S3 a partir de la URL pública del archivo.
   * Devuelve null si la URL no es absoluta o no se puede parsear.
   */
  private extractS3Key(fileUrl?: string): string | null {
    if (!fileUrl) return null
    try {
      const parsed = new URL(fileUrl)
      const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
      return key || null
    } catch {
      return null
    }
  }

  /** Borra un archivo de S3 en modo best-effort (no interrumpe el flujo si falla). */
  private async tryDeleteS3File(fileUrl?: string): Promise<void> {
    const key = this.extractS3Key(fileUrl)
    if (!key) return
    try {
      await this.uploadService.deleteFile(key)
    } catch (err) {
      console.error('[remove] No se pudo eliminar archivo de S3:', fileUrl, err)
    }
  }

  /**
   * Evalúa si `actor` puede eliminar `report` (mismas reglas documentadas en
   * `remove()`), sin lanzar excepción ni mutar nada. La usan tanto `remove()`
   * (que sí lanza `ForbiddenException` si `!allowed`) como `getDeletionPreview()`
   * (solo lectura, para la advertencia previa a confirmar en el front).
   */
  private async evaluateDeleteAuthorization(
    report: any,
    expenses: {
      approvalLevel?: number
      contabilidadStatus?: string
    }[],
    actor: SolicitudDeleteActor
  ): Promise<{
    allowed: boolean
    reason?: string
    linkedAdvances: { _id: Types.ObjectId; status: string; amount: number }[]
    hasApprovedAdvance: boolean
  }> {
    const role = actor?.role ?? ''
    const isSuperAdmin = role === ROLES.SUPER_ADMIN
    const isContabilidad = role === ROLES.CONTABILIDAD
    // VD-115: Tesorería, cuando le habilitan rendir, borra sus propias
    // solicitudes con la misma regla del colaborador (solo las suyas), sin
    // heredar el borrado amplio de Contabilidad.
    const isColaborador = role === ROLES.COLABORADOR || role === ROLES.TESORERIA

    // "Aprobado por alguien" = aprobación a nivel comprobante O a nivel reporte.
    const reportLevelApproved =
      !!report.coordinatorApprovedBy || !!report.contabilidadApprovedBy
    const anyExpenseApproved = expenses.some(
      e => (e.approvalLevel ?? 0) > 0 || e.contabilidadStatus === 'approved'
    )

    // Condiciones que restringen el borrado a solo Contabilidad/Superadmin (el
    // colaborador/coordinador dueño ya no puede eliminar).
    let restricted = reportLevelApproved || anyExpenseApproved
    let restrictedMsg =
      'Esta solicitud ya tiene una aprobación; solo Contabilidad puede eliminarla.'

    // Rendición directa creada por Contabilidad para el colaborador/coordinador
    // (createdBy distinto del dueño): solo Contabilidad puede eliminarla.
    if (!restricted && report.isDirecta) {
      const createdById = String(report.createdBy ?? '')
      const ownerId = String(report.userId ?? '')
      if (createdById && ownerId && createdById !== ownerId) {
        restricted = true
        restrictedMsg =
          'Esta rendición directa fue creada por Contabilidad; solo Contabilidad puede eliminarla.'
      }
    }

    // Caja chica ya incluida (jalada) por Contabilidad en un reporte —borrador o
    // finalizado—: solo Contabilidad puede eliminarla.
    if (!restricted && report.isCajaChica) {
      if (await this.isReferencedByCajaChica(String(report._id))) {
        restricted = true
        restrictedMsg =
          'Esta caja chica ya fue incluida por Contabilidad en un reporte; solo Contabilidad puede eliminarla.'
      }
    }

    // Rendición de viáticos: si su anticipo vinculado ya fue aprobado/pagado (el
    // coordinador aprobó y/o contabilidad pagó), la rendición representa dinero ya
    // desembolsado y NO puede eliminarse por la app —ni el colaborador ni
    // Contabilidad—. Solo Superadmin (escape técnico). Estas rendiciones se
    // auto-crean al registrar el pago del anticipo.
    let linkedAdvances: { _id: Types.ObjectId; status: string; amount: number }[] = []
    let hasApprovedAdvance = false
    if (!report.isDirecta && !report.isCajaChica) {
      const rawAdvanceIds: string[] = (
        Array.isArray(report.advanceIds) ? report.advanceIds : []
      ).map((x: any) => (x && typeof x === 'object' && '_id' in x ? String(x._id) : String(x)))
      linkedAdvances = (await this.advanceService.findByExpenseReportId(
        String(report._id),
        rawAdvanceIds
      )) as unknown as { _id: Types.ObjectId; status: string; amount: number }[]
      hasApprovedAdvance = linkedAdvances.some((a: any) =>
        ['approved', 'partially_paid', 'paid', 'settled'].includes(a.status)
      )
      if (hasApprovedAdvance && !isSuperAdmin) {
        return {
          allowed: false,
          reason:
            'El anticipo de esta rendición ya fue aprobado/pagado; la rendición no puede eliminarse.',
          linkedAdvances,
          hasApprovedAdvance,
        }
      }
    }

    if (restricted) {
      if (!isContabilidad && !isSuperAdmin) {
        return { allowed: false, reason: restrictedMsg, linkedAdvances, hasApprovedAdvance }
      }
    } else if (isColaborador) {
      // Estados iniciales: el colaborador solo puede eliminar las suyas.
      const ownerId = String(report.createdBy ?? report.userId ?? '')
      if (ownerId !== String(actor.userId)) {
        return {
          allowed: false,
          reason: 'Solo puedes eliminar tus propias solicitudes.',
          linkedAdvances,
          hasApprovedAdvance,
        }
      }
    }

    return { allowed: true, linkedAdvances, hasApprovedAdvance }
  }

  /**
   * Vista previa de lo que se eliminaría (y si el actor puede hacerlo), sin
   * borrar nada. La usa el front para mostrar la advertencia antes de confirmar.
   */
  async getDeletionPreview(id: string, actor: SolicitudDeleteActor) {
    const report = await this.expenseReportModel.findById(id).lean().exec()
    if (!report)
      throw new NotFoundException(`Expense report with ID ${id} not found`)

    const expenseIds = report.expenseIds ?? []
    const expenses = expenseIds.length
      ? await this.expenseModel
        .find({ _id: { $in: expenseIds } })
        .select('_id total file expenseType approvalLevel contabilidadStatus')
        .lean()
        .exec()
      : []

    const authResult = await this.evaluateDeleteAuthorization(
      report,
      expenses,
      actor
    )
    const expensesTotal = expenses.reduce(
      (sum, e: any) => sum + this.expenseSettlementAmountBase(e),
      0
    )
    const filesCount = expenses.filter((e: any) => !!e.file).length
    const cajaChicaReferenced = report.isCajaChica
      ? await this.isReferencedByCajaChica(id)
      : false

    return {
      allowed: authResult.allowed,
      reason: authResult.reason,
      type: report.type,
      isDirecta: !!report.isDirecta,
      isCajaChica: !!report.isCajaChica,
      budget: report.budget,
      expensesCount: expenses.length,
      expensesTotal,
      filesCount,
      linkedAdvances: authResult.linkedAdvances.map((a: any) => ({
        amount: a.amount,
        status: a.status,
      })),
      cajaChicaReferenced,
    }
  }

  /**
   * Elimina una solicitud (rendición directa / caja chica) completa, con cascada
   * de comprobantes y sus archivos. La autorización depende del estado de aprobación:
   *  - Sin comprobantes o con comprobantes pero ninguno aprobado:
   *    el colaborador propietario, Contabilidad, Administrador o Superadmin.
   *  - Con al menos una aprobación (a nivel comprobante o de reporte):
   *    solo Contabilidad o Superadmin.
   */
  async remove(id: string, actor: SolicitudDeleteActor) {
    const report = await this.expenseReportModel.findById(id).lean().exec()
    if (!report)
      throw new NotFoundException(`Expense report with ID ${id} not found`)

    // Carga los comprobantes adjuntos para evaluar el estado de aprobación.
    const expenseIds = report.expenseIds ?? []
    const expenses = expenseIds.length
      ? await this.expenseModel
        .find({ _id: { $in: expenseIds } })
        .select('_id file approvalLevel contabilidadStatus')
        .lean()
        .exec()
      : []

    const authResult = await this.evaluateDeleteAuthorization(
      report,
      expenses,
      actor
    )
    if (!authResult.allowed) {
      throw new ForbiddenException(authResult.reason)
    }
    const linkedAdvances = authResult.linkedAdvances

    // Cascada: elimina los comprobantes adjuntos y sus archivos en S3.
    if (expenses.length > 0) {
      for (const e of expenses) {
        await this.tryDeleteS3File(e.file)
      }
      await this.expenseModel.deleteMany({ _id: { $in: expenseIds } }).exec()
    }

    // Anticipos vinculados: nunca se borran (registro financiero), solo se
    // desvinculan de la rendición eliminada para no dejar una FK colgando. Si
    // aún no habían sido pagados, vuelven a aparecer como huérfanos y siguen
    // su flujo normal de aprobación/pago.
    let advancesUnlinked = 0
    if (linkedAdvances.length > 0) {
      try {
        advancesUnlinked = await this.advanceService.detachFromDeletedReport(
          linkedAdvances.map(a => a._id)
        )
      } catch (err: unknown) {
        this.logger.error(
          `Desvincular anticipos al eliminar ${id}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    // Caja chica: si esta rendición ya había sido incluida (jalada) por
    // Contabilidad en algún reporte de caja chica —borrador o finalizado—,
    // quita la referencia para no dejarla apuntando a un documento eliminado.
    // `totalAmount` es denormalizado y se recalcula solo en la próxima lectura
    // (ver CajaChicaReportService.findAllByClient/findOne).
    let cajaChicaReportsUpdated = 0
    if (report.isCajaChica) {
      try {
        const pulled = await this.cajaChicaReportModel
          .updateMany(
            { 'selectedReports.expenseReportId': new Types.ObjectId(id) },
            {
              $pull: {
                selectedReports: { expenseReportId: new Types.ObjectId(id) },
              },
            }
          )
          .exec()
        cajaChicaReportsUpdated = pulled.modifiedCount ?? 0
      } catch (err: unknown) {
        this.logger.error(
          `Limpiar referencias de caja chica al eliminar ${id}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    await this.expenseReportModel.findByIdAndDelete(id).exec()
    return {
      ...report,
      deletionSummary: {
        expensesDeleted: expenses.length,
        advancesUnlinked,
        cajaChicaReportsUpdated,
      },
    }
  }

  /**
   * IDs de las rendiciones directas donde el usuario figura como aprobador de
   * algún comprobante — mismo criterio que `findAllByCoordinator`, que es como
   * se acota la pestaña "Solicitud de Fondos". Sirve para que las pantallas de
   * directas muestren a cada aprobador lo que le toca aprobar y nada más.
   */
  private async directaReportIdsForApprover(
    userId: string
  ): Promise<Types.ObjectId[]> {
    if (!Types.ObjectId.isValid(userId)) return []
    return this.expenseModel
      .find({ 'approverChain.approverIds': new Types.ObjectId(userId) })
      .distinct('expenseReportId')
      .exec()
  }

  /**
   * Devuelve los gastos de todas las rendiciones directas de un cliente,
   * con filtros opcionales de fecha, proyecto, categoría y número de documento.
   *
   * `approverUserId` acota el resultado a las rendiciones que ese usuario debe
   * aprobar. Lo manda el controlador para todos menos Contabilidad, Tesorería y
   * los administradores, que son los únicos que ven la empresa completa.
   */
  async findDirectRendicionExpenses(
    clientId: string,
    filters: {
      page?: number
      limit?: number
      dateFrom?: string
      dateTo?: string
      projectId?: string
      categoryId?: string
      docNumber?: string
      tipo?: string
      userId?: string
      approverUserId?: string
    } = {}
  ) {
    const page = Math.max(1, filters.page ?? 1)
    const limit = Math.min(200, filters.limit ?? 50)
    const skip = (page - 1) * limit

    // 1. Obtener IDs de todas las rendiciones directas del cliente
    const reportQuery: any = {
      clientId: new Types.ObjectId(clientId),
      isDirecta: true,
    }
    if (filters.userId && /^[0-9a-fA-F]{24}$/.test(filters.userId)) {
      reportQuery.userId = new Types.ObjectId(filters.userId)
    }
    if (filters.approverUserId) {
      reportQuery._id = {
        $in: await this.directaReportIdsForApprover(filters.approverUserId),
      }
    }
    const directReports = await this.expenseReportModel
      .find(reportQuery)
      .select(
        // `status` va para que la pantalla sepa si la rendición ya llegó a
        // Contabilidad: los botones de aprobación por comprobante solo aplican
        // desde `pending_accounting`.
        '_id userId title motivo gestion budget createdAt createdBy directaDeposit status'
      )
      .populate('userId', 'name email dni bankAccount')
      .populate({
        path: 'createdBy',
        select: 'name email roleId',
        populate: { path: 'roleId', select: 'name' },
      })
      .lean()
      .exec()

    if (directReports.length === 0) {
      return { data: [], total: 0, page, limit, pages: 0 }
    }

    // Determina quién generó la rendición directa y de qué tipo (origen):
    // - Contabilidad: iniciada desde Tesorería/Pagos (lleva depósito) o creada
    //   por un usuario con rol Contabilidad/Administrador.
    // - Coordinador / Colaborador: creada por el propio usuario según su rol.
    const enrichedReports = directReports.map(r => {
      const creator: any = r.createdBy
      const roleName = String(creator?.roleId?.name ?? '').toLowerCase()
      let origin: 'contabilidad' | 'coordinador' | 'colaborador'
      if (r.directaDeposit || /contabilidad|administrador/.test(roleName)) {
        origin = 'contabilidad'
      } else if (/coordinador/.test(roleName)) {
        origin = 'coordinador'
      } else {
        origin = 'colaborador'
      }
      return {
        ...r,
        _generatedByName: creator?.name || creator?.email || null,
        _generatedByRole: creator?.roleId?.name || null,
        _origin: origin,
      }
    })

    const reportIds = enrichedReports.map(r => r._id)
    const reportMap = new Map(enrichedReports.map(r => [String(r._id), r]))

    // 2. Construir el pipeline de agregación sobre Expense
    const pipeline: any[] = []

    // Match base: gastos que pertenecen a estas rendiciones directas
    const matchStage: any = {
      expenseReportId: { $in: reportIds },
    }

    // Filtro número de documento: busca en serie+correlativo y receiptNumeroDocumento
    if (filters.docNumber?.trim()) {
      const dn = filters.docNumber.trim()
      matchStage.$or = [
        { serie: { $regex: dn, $options: 'i' } },
        { correlativo: { $regex: dn, $options: 'i' } },
        { receiptNumeroDocumento: { $regex: dn, $options: 'i' } },
      ]
    }

    // Filtro tipo de documento
    if (filters.tipo && filters.tipo !== 'all') {
      matchStage.expenseType = filters.tipo
    }

    // Filtro proyecto — el id puede estar guardado como ObjectId (PM, CC, otros)
    // o como string (facturas), así que se filtra por ambas representaciones.
    if (filters.projectId && /^[0-9a-fA-F]{24}$/.test(filters.projectId)) {
      matchStage.proyectId = {
        $in: [filters.projectId, new Types.ObjectId(filters.projectId)],
      }
    }

    // Filtro categoría — idem (ObjectId o string)
    if (filters.categoryId && /^[0-9a-fA-F]{24}$/.test(filters.categoryId)) {
      matchStage.categoryId = {
        $in: [filters.categoryId, new Types.ObjectId(filters.categoryId)],
      }
    }

    pipeline.push({ $match: matchStage })

    // Filtros de fecha sobre fechaEmision (string con formato dd/mm/yyyy o yyyy-mm-dd)
    if (filters.dateFrom || filters.dateTo) {
      pipeline.push({
        $addFields: {
          _parsedDate: {
            $cond: {
              if: {
                $regexMatch: {
                  input: { $ifNull: ['$fechaEmision', ''] },
                  regex: /^\d{2}\/\d{2}\/\d{4}$/,
                },
              },
              then: {
                $dateFromString: {
                  dateString: {
                    $concat: [
                      { $substr: ['$fechaEmision', 6, 4] },
                      '-',
                      { $substr: ['$fechaEmision', 3, 2] },
                      '-',
                      { $substr: ['$fechaEmision', 0, 2] },
                    ],
                  },
                },
              },
              else: {
                $dateFromString: {
                  dateString: { $ifNull: ['$fechaEmision', '1970-01-01'] },
                  onError: new Date('1970-01-01'),
                },
              },
            },
          },
        },
      })

      const dateMatch: any = {}
      if (filters.dateFrom) dateMatch.$gte = new Date(filters.dateFrom)
      if (filters.dateTo) {
        const to = new Date(filters.dateTo)
        to.setHours(23, 59, 59, 999)
        dateMatch.$lte = to
      }
      pipeline.push({ $match: { _parsedDate: dateMatch } })
    }

    // Count total
    const countPipeline = [...pipeline, { $count: 'total' }]
    const countResult = await this.expenseModel.aggregate(countPipeline).exec()
    const total = countResult[0]?.total ?? 0

    // Lookup proyecto y categoría.
    // proyectId/categoryId pueden venir guardados como ObjectId (PM, CC, otros)
    // o como string (facturas creadas por el flujo de invoices). El $lookup es
    // estricto en tipos, así que primero se normaliza a ObjectId con $convert:
    // un ObjectId pasa intacto, un string hex válido se castea, y cualquier otro
    // caso queda en null (el lookup no resuelve, igual que antes).
    pipeline.push(
      {
        $addFields: {
          _proyectOid: {
            $convert: {
              input: '$proyectId',
              to: 'objectId',
              onError: null,
              onNull: null,
            },
          },
          _categoryOid: {
            $convert: {
              input: '$categoryId',
              to: 'objectId',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: 'projects',
          localField: '_proyectOid',
          foreignField: '_id',
          as: '_project',
        },
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_categoryOid',
          foreignField: '_id',
          as: '_category',
        },
      },
      {
        $addFields: {
          _projectDoc: { $arrayElemAt: ['$_project', 0] },
          _categoryDoc: { $arrayElemAt: ['$_category', 0] },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    )

    const expenses = await this.expenseModel.aggregate(pipeline).exec()

    // Adjuntar info del reporte a cada gasto
    const data = expenses.map(e => ({
      ...e,
      _report: reportMap.get(String(e.expenseReportId)) ?? null,
      _projectDoc: e._projectDoc ?? e._project?.[0] ?? null,
      _categoryDoc: e._categoryDoc ?? e._category?.[0] ?? null,
    }))

    return { data, total, page, limit, pages: Math.ceil(total / limit) }
  }

  /**
   * Lista las rendiciones directas de un cliente a nivel de REPORTE (una fila por
   * rendición), con su total gastado, depósito/saldo y quién la generó. Alimenta
   * la pestaña "Rendiciones directas" (vista por rendición), separada de la
   * pestaña "Gastos" (vista por comprobante, ver findDirectRendicionExpenses).
   *
   * `approverUserId` acota la lista a las rendiciones que ese usuario debe
   * aprobar (ver `directaReportIdsForApprover`).
   */
  async findDirectRendicionReports(
    clientId: string,
    filters: {
      dateFrom?: string
      dateTo?: string
      userId?: string
      approverUserId?: string
    } = {}
  ) {
    const query: any = {
      clientId: new Types.ObjectId(clientId),
      isDirecta: true,
    }
    if (filters.userId && /^[0-9a-fA-F]{24}$/.test(filters.userId)) {
      query.userId = new Types.ObjectId(filters.userId)
    }
    if (filters.approverUserId) {
      query._id = {
        $in: await this.directaReportIdsForApprover(filters.approverUserId),
      }
    }
    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {}
      if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom)
      if (filters.dateTo) {
        const to = new Date(filters.dateTo)
        to.setHours(23, 59, 59, 999)
        query.createdAt.$lte = to
      }
    }

    const reports = await this.expenseReportModel
      .find(query)
      .select(
        '_id codigo userId title motivo gestion budget status createdAt createdBy directaDeposit expenseIds returnVoucher'
      )
      .populate('userId', 'name email')
      .populate({
        path: 'createdBy',
        select: 'name email roleId',
        populate: { path: 'roleId', select: 'name' },
      })
      .populate('expenseIds', 'total montoBase moneda montoReporte monedaReporte')
      .sort({ createdAt: -1 })
      .lean()
      .exec()

    return reports.map((r: any) => {
      const creator: any = r.createdBy
      const roleName = String(creator?.roleId?.name ?? '').toLowerCase()
      let origin: 'contabilidad' | 'coordinador' | 'colaborador'
      if (r.directaDeposit || /contabilidad|administrador/.test(roleName)) {
        origin = 'contabilidad'
      } else if (/coordinador/.test(roleName)) {
        origin = 'coordinador'
      } else {
        origin = 'colaborador'
      }
      const expenses = (r.expenseIds as any[]) || []
      const totalGastado = expenses.reduce(
        (s, e) => s + this.expenseSettlementAmountBase(e),
        0
      )
      const deposited = Number(r.directaDeposit?.amount ?? r.budget ?? 0)
      const hasFunds = !!r.directaDeposit
      return {
        _id: String(r._id),
        codigo: r.codigo ?? null,
        userId: r.userId,
        title: r.title ?? null,
        motivo: r.motivo ?? null,
        status: r.status ?? null,
        // Cerrada (a efectos de label): devuelta con comprobante.
        effectivelyClosed: r.status === 'closed' || !!r.returnVoucher,
        createdAt: r.createdAt,
        hasDeposit: hasFunds,
        deposited,
        totalGastado,
        saldo: hasFunds ? deposited - totalGastado : null,
        expenseCount: expenses.length,
        generatedByName: creator?.name || creator?.email || null,
        generatedByRole: creator?.roleId?.name || null,
        origin,
      }
    })
  }

  async addExpenseToReport(reportId: string, expenseId: string) {
    const existing = await this.expenseReportModel
      .findById(reportId)
      .select('status userId clientId expenseIds isCajaChica')
      .lean()
      .exec()

    // Caja chica: el comprobante descuenta del presupuesto y no puede superarlo.
    // Se cobra ANTES de engancharlo, así que si no alcanza el saldo el gasto se
    // borra y no queda ni comprobante colgado ni presupuesto descuadrado.
    if ((existing as any)?.isCajaChica === true) {
      await this.cargarGastoAlPresupuesto(
        reportId,
        expenseId,
        String((existing as any).userId),
        String((existing as any).clientId)
      )
    }

    const updateOp: Record<string, unknown> = {
      $push: { expenseIds: new Types.ObjectId(expenseId) },
    }
    const wasRejected = (existing as any)?.status === 'rejected'
    // Un comprobante agregado a una rendición que YA estaba con Contabilidad la
    // devuelve al tramo de aprobadores: ese gasto no lo revisó nadie todavía y
    // Contabilidad solo actúa sobre comprobantes con su cadena completa. Sin
    // esto la rendición quedaba trabada — nadie podía aprobar el comprobante
    // nuevo (los aprobadores solo actúan en `submitted`) y sin él aprobado la
    // rendición tampoco se puede cerrar.
    const wasPendingAccounting =
      (existing as any)?.status === 'pending_accounting'
    if (wasRejected) {
      updateOp.$set = { status: 'submitted' }
      updateOp.$unset = { rejectionReason: '', rejectedByRole: '' }
    } else if (wasPendingAccounting) {
      updateOp.$set = { status: 'submitted' }
    }

    const updated = await this.expenseReportModel
      .findByIdAndUpdate(reportId, updateOp, { new: true })
      .exec()

    const ownerId = (existing as any)?.userId?.toString()
    const reportClientId = (existing as any)?.clientId?.toString()
    const wasSubmitted = (existing as any)?.status === 'submitted'
    if (ownerId && reportClientId) {
      if (wasRejected) {
        // Rendición rechazada y corregida: se (re)construye la cadena de
        // TODOS sus comprobantes (mismo criterio que un reenvío normal desde
        // `update()`) — el revisor vuelve a validar todo desde cero.
        const expenseIds = [
          ...((existing as any)?.expenseIds ?? []),
          new Types.ObjectId(expenseId),
        ] as Types.ObjectId[]
        await this.buildExpenseChains(expenseIds, ownerId, reportClientId, {
          force: true,
          esCajaChica: (existing as any)?.isCajaChica === true,
        })
      } else if (wasSubmitted || wasPendingAccounting) {
        // Rendición ya enviada y en curso de aprobación: solo se construye la
        // cadena del comprobante NUEVO — no se toca la de los existentes, que
        // pueden tener aprobaciones N1/N2 ya en curso.
        await this.buildExpenseChains(
          [new Types.ObjectId(expenseId)],
          ownerId,
          reportClientId,
          { esCajaChica: (existing as any)?.isCajaChica === true }
        )
      }
    }

    return updated
  }

  /**
   * Descuenta un comprobante del presupuesto de caja chica del responsable. Si
   * no alcanza el saldo, BORRA el comprobante recién creado y propaga el error:
   * el colaborador ve el motivo y no queda un gasto huérfano ni un presupuesto
   * que no cuadra con lo cargado.
   *
   * El cargo es idempotente por `expenseId`, así que un reintento del alta no
   * descuenta dos veces.
   */
  private async cargarGastoAlPresupuesto(
    reportId: string,
    expenseId: string,
    ownerId: string,
    clientId: string
  ): Promise<void> {
    const fondo = await this.fondoCajaChicaService.findVivoByResponsible(
      ownerId,
      clientId
    )
    if (!fondo) {
      await this.expenseModel.deleteOne({ _id: new Types.ObjectId(expenseId) })
      throw new BadRequestException(
        'No tiene una caja chica activa. Solicite su presupuesto antes de cargar comprobantes.'
      )
    }

    const expense = await this.expenseModel
      .findById(expenseId)
      .select('montoBase total')
      .lean<{ montoBase?: number; total?: number }>()
      .exec()
    // El presupuesto está en moneda base, así que el gasto se mide igual.
    const monto = Number(expense?.montoBase ?? expense?.total ?? 0)

    try {
      await this.fondoCajaChicaService.registrarCargo(String(fondo._id), {
        expenseId,
        expenseReportId: reportId,
        amount: monto,
        registeredBy: ownerId,
      })
    } catch (err: unknown) {
      await this.expenseModel.deleteOne({ _id: new Types.ObjectId(expenseId) })
      throw err
    }
  }

  /**
   * Devuelve al presupuesto el cargo de un comprobante que se elimina. Solo
   * aplica al BORRADO: un comprobante rechazado se corrige y se reenvía, y el
   * efectivo ya salió de la caja igual.
   */
  async descargarGastoDelPresupuesto(expenseId: string): Promise<void> {
    const expense = await this.expenseModel
      .findById(expenseId)
      .select('expenseReportId clientId createdBy')
      .lean<{ expenseReportId?: Types.ObjectId; clientId?: string }>()
      .exec()
    if (!expense?.expenseReportId) return

    const report = await this.expenseReportModel
      .findById(expense.expenseReportId)
      .select('isCajaChica userId clientId')
      .lean<{ isCajaChica?: boolean; userId?: Types.ObjectId; clientId?: Types.ObjectId }>()
      .exec()
    if (!report?.isCajaChica || !report.userId || !report.clientId) return

    const fondo = await this.fondoCajaChicaService.findVivoByResponsible(
      String(report.userId),
      String(report.clientId)
    )
    if (!fondo) return

    try {
      await this.fondoCajaChicaService.reversarCargo(
        String(fondo._id),
        expenseId,
        String(report.userId)
      )
    } catch (err: unknown) {
      this.logger.error(
        `No se pudo reversar el cargo del gasto ${expenseId}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /** Cambia silenciosamente el estado de una rendición rechazada a enviada, sin notificaciones. */
  async resubmitSilent(reportId: string): Promise<void> {
    const existing = await this.expenseReportModel
      .findById(reportId)
      // `isCajaChica`: ver el select de `update()`. Aca se reconstruyen TODAS
      // las cadenas con `force`, asi que sin el campo un reenvio le cambiaba
      // los aprobadores a la caja chica.
      .select('status isCajaChica userId clientId expenseIds')
      .lean()
      .exec()
    if (!existing || (existing as any).status !== 'rejected') return
    await this.expenseReportModel
      .findByIdAndUpdate(reportId, {
        $set: { status: 'submitted' },
        $unset: { rejectionReason: '', rejectedByRole: '' },
      })
      .exec()
    // Igual que en `update()`: al reenviar se (re)construye la cadena de cada
    // comprobante — sin esto, comprobantes de la rendición reabierta quedaban
    // con `approverChain` sin (re)construir, o con el de un envío anterior.
    const ownerId = (existing as any).userId?.toString()
    const reportClientId = (existing as any).clientId?.toString()
    if (ownerId && reportClientId) {
      await this.buildExpenseChains(
        ((existing as any).expenseIds ?? []) as Types.ObjectId[],
        ownerId,
        reportClientId,
        { force: true, esCajaChica: (existing as any).isCajaChica === true }
      )
    }
  }

  async removeExpenseFromReport(
    reportId: string,
    expenseId: string
  ): Promise<void> {
    await this.expenseReportModel
      .findByIdAndUpdate(reportId, {
        $pull: { expenseIds: new Types.ObjectId(expenseId) },
      })
      .exec()

    // Quitar un comprobante puede completar la aprobación de la rendición: si el
    // que se va era el único sin aprobar (típico: el colaborador borra el
    // comprobante observado en vez de corregirlo), los que quedan ya están
    // aprobados y nadie más va a disparar el avance a Contabilidad — no queda
    // ningún `approveByCoord` por delante. Sin esto la rendición se queda en
    // `submitted` sin salida, igual que cuando se aprueba todo antes de enviar.
    await this.advanceToAccountingIfAllExpensesApproved(reportId).catch(err => {
      this.logger.error(
        `No se pudo evaluar el avance a Contabilidad al quitar el comprobante ${expenseId} de la rendición ${reportId}: ${err instanceof Error ? err.message : String(err)}`
      )
    })
  }

  async addAdvanceToReport(reportId: string, advanceId: string) {
    return await this.expenseReportModel
      .findByIdAndUpdate(
        reportId,
        { $addToSet: { advanceIds: new Types.ObjectId(advanceId) } },
        { new: true }
      )
      .exec()
  }

  /**
   * Equivalente en moneda base de un gasto. `montoBase` se congela al crear el
   * comprobante (TC de su fecha de emisión); si el documento es previo al
   * multimoneda, `montoBase` no existe y `total` ya estaba asumido en base.
   *
   * Sumar `total` a secas mezclaría monedas: una factura en dólares entraría
   * en la liquidación como si fueran soles.
   */
  private expenseSettlementAmountBase(e: any): number {
    return Number(e?.montoBase ?? e?.total) || 0
  }

  /**
   * Equivalente de un gasto en la moneda de la rendición que lo contiene.
   * `montoReporte` se congela al crear el comprobante; si no existe, el gasto
   * ya estaba en esa misma moneda. Es el número que ve el colaborador en el
   * detalle, así que la liquidación lo reusa en vez de reconvertir.
   */
  private expenseAmountInReport(e: any): number {
    return Number(e?.montoReporte ?? e?.total) || 0
  }

  /**
   * Símbolo de la moneda en que está expresada una rendición. Solo los viáticos
   * pueden salirse de la moneda base; el resto (directas, caja chica) siempre
   * son soles y caen en el default.
   */
  private reportCurrencySymbol(report: any): string {
    return monedaSymbol(report?.viaticoMoneda)
  }

  /**
   * Símbolo de los importes de la liquidación (devolución / reembolso). Van en
   * moneda base aunque el viático se haya entregado en dólares, porque es la
   * moneda en la que operan tesorería, el TXT y los asientos.
   */
  private settlementCurrencySymbol(report: any): string {
    return monedaSymbol(report?.settlement?.moneda)
  }

  /**
   * Equivalente en moneda base de lo realmente pagado de un anticipo. Reaplica
   * el TC congelado sobre `paidAmount ?? amount` en vez de usar `montoBase`
   * (que se congeló sobre el monto solicitado), porque el pago real puede
   * diferir de lo pedido.
   */
  private advanceSettlementAmountBase(a: any): number {
    if (a?.status === 'approved') return 0
    const raw = Number(a?.paidAmount ?? a?.amount) || 0
    return Math.round(raw * this.advanceRate(a) * 100) / 100
  }

  /**
   * TC congelado de un anticipo. La colección `advances` es legado (ya no se
   * crean: los viáticos viven como ExpenseReport), así que un documento en
   * moneda extranjera sin TC es un dato corrupto, no un caso previsto: se
   * registra en el log en vez de valorarlo 1 a 1 en silencio.
   */
  private advanceRate(a: any): number {
    const rate = Number(a?.tipoCambio)
    if (rate > 0) return rate
    const moneda = a?.moneda || DEFAULT_MONEDA
    if (moneda !== DEFAULT_MONEDA) {
      this.logger.error(
        `Anticipo ${a?._id} en ${moneda} sin tipo de cambio congelado: se valora 1 a 1 y la liquidación quedará mal. Revisar el documento.`
      )
    }
    return 1
  }

  /** Equivalente en base de un importe propio del reporte (budget, viaticoPaidAmount…). */
  private reportSettlementAmountBase(report: any, amount: number): number {
    const rate = Number(report?.tipoCambio) || 1
    return Math.round((Number(amount) || 0) * rate * 100) / 100
  }

  async updateSettlement(reportId: string, settlement: any) {
    return await this.expenseReportModel
      .findByIdAndUpdate(reportId, { $set: { settlement } }, { new: true })
      .exec()
  }

  /**
   * Fondos entregados al colaborador en una rendición directa: depósito de
   * contabilidad. Base para calcular devolución vs reembolso.
   */
  private directaFundsGiven(report: any): number {
    // El depósito está en la moneda del reporte; se compara contra gastos ya
    // llevados a moneda base, así que hay que convertirlo igual.
    return this.reportSettlementAmountBase(
      report,
      Number(report?.directaDeposit?.amount ?? 0)
    )
  }

  async setApprovedBy(reportId: string, userId: string) {
    await this.expenseReportModel
      .findByIdAndUpdate(reportId, {
        $set: { approvedBy: new Types.ObjectId(userId) },
      })
      .exec()
  }

  async setCoordinatorApproval(reportId: string, userId: string) {
    await this.expenseReportModel
      .findByIdAndUpdate(reportId, {
        $set: {
          coordinatorApprovedBy: new Types.ObjectId(userId),
          coordinatorApprovedAt: new Date(),
        },
      })
      .exec()
  }

  async setContabilidadApproval(reportId: string, userId: string) {
    await this.expenseReportModel
      .findByIdAndUpdate(reportId, {
        $set: {
          contabilidadApprovedBy: new Types.ObjectId(userId),
          contabilidadApprovedAt: new Date(),
        },
      })
      .exec()
  }

  async registerAffidavit(
    reportId: string,
    dto: CreateAffidavitDto,
    generatedBy: string
  ) {
    const report = await this.findOne(reportId)
    if (!report) {
      throw new NotFoundException(
        `Expense report with ID ${reportId} not found`
      )
    }
    if (report.status !== 'closed') {
      throw new BadRequestException(
        'La declaración jurada solo puede generarse cuando la rendición está cerrada.'
      )
    }

    const reportExpenses = (report.expenseIds || []).map((e: any) =>
      String(e._id)
    )
    const missing = dto.expenseIds.filter(
      id => !reportExpenses.includes(String(id))
    )
    if (missing.length > 0) {
      throw new BadRequestException(
        'Los comprobantes seleccionados no pertenecen a esta rendición.'
      )
    }

    await this.expenseReportModel.findByIdAndUpdate(reportId, {
      $push: {
        affidavits: {
          type: dto.type,
          expenseIds: dto.expenseIds.map(id => new Types.ObjectId(id)),
          generatedBy: new Types.ObjectId(generatedBy),
          generatedAt: new Date(),
        },
      },
    })

    return {
      reportId,
      type: dto.type,
      expenseIds: dto.expenseIds,
      generatedBy,
      generatedAt: new Date().toISOString(),
    }
  }

  async markReimbursementAccountingNotified(reportId: string): Promise<void> {
    await this.expenseReportModel.findByIdAndUpdate(reportId, {
      $set: { reimbursementAccountingNotifiedAt: new Date() },
    })
  }

  /**
   * Viáticos (rendiciones tipo viatico) aprobados y pendientes de pago, para el
   * lote de pagos BBVA. Devuelve el saldo por pagar y los datos bancarios (de la
   * solicitud si existen, si no del perfil del colaborador). VD-7.
   */
  async findBatchPayableViaticos(clientId: string) {
    const rows = await this.expenseReportModel
      .find({
        clientId: new Types.ObjectId(clientId),
        type: 'viatico',
        status: { $in: ['viatico_approved', 'partially_paid'] },
      })
      .populate('userId', 'name email dni documentType bankAccount')
      .lean()
      .exec()

    return rows
      .map((r: any) => {
        const remaining =
          Number(r.viaticoAmount ?? 0) - Number(r.viaticoPaidAmount ?? 0)
        return {
          reportId: String(r._id),
          user: r.userId,
          remaining: Math.round(remaining * 100) / 100,
          // El importe queda en la moneda del viático: el archivo del banco
          // declara una sola moneda por planilla.
          moneda: r.viaticoMoneda,
          bankName: r.viaticoBankName ?? r.userId?.bankAccount?.bankName ?? '',
          accountNumber:
            r.viaticoAccountNumber ?? r.userId?.bankAccount?.accountNumber ?? '',
          cci: r.viaticoCci ?? r.userId?.bankAccount?.cci ?? '',
        }
      })
      .filter(x => x.remaining > 0.009)
  }

  async findPendingReimbursementsByClient(clientId: string) {
    const cid = new Types.ObjectId(clientId)
    const noPayment = [
      { reimbursementPaymentInfo: { $exists: false } },
      { reimbursementPaymentInfo: null },
    ]

    // 1. Reportes con reembolso ya liquidado (settlement persistido).
    const settled = await this.expenseReportModel
      .find({
        clientId: cid,
        status: 'approved',
        'settlement.type': 'reembolso',
        $or: noPayment,
      })
      .populate('userId', 'name email bankAccount dni documentType')
      .sort({ updatedAt: -1 })
      .lean()
      .exec()

    // 2. Rendiciones directas aprobadas SIN settlement de reembolso persistido
    //    (p. ej. aprobadas antes de VD-26). Se calcula el saldo a favor del
    //    colaborador desde los gastos (todo gasto no rechazado, menos el depósito
    //    si lo hubiera) y, si es positivo, se adjunta un settlement calculado para
    //    que Tesorería pueda registrar el pago. Al confirmar, el backend recomputa
    //    y persiste el settlement real (registerReimbursementPayment). VD-37.
    // La caja chica entra por la misma puerta: su reposición es aritméticamente
    // igual a un reembolso de directa sin depósito (entregado 0, gastado X, se
    // le debe X). Lo que cambia es qué pasa al registrar el pago: además del
    // depósito al colaborador, el presupuesto vuelve a su tope.
    const directas = await this.expenseReportModel
      .find({
        clientId: cid,
        $or: [{ isDirecta: true }, { isCajaChica: true }],
        status: 'approved',
        'settlement.type': { $ne: 'reembolso' },
        $and: [{ $or: noPayment }],
      })
      .populate('userId', 'name email bankAccount dni documentType')
      .populate('expenseIds', 'total status montoBase moneda montoReporte monedaReporte')
      .sort({ updatedAt: -1 })
      .lean()
      .exec()

    const computedDirectas = directas
      .map(r => {
        const deposit = this.reportSettlementAmountBase(
          r,
          Number((r as any).directaDeposit?.amount ?? 0)
        )
        const gastado = (((r as any).expenseIds as any[]) || []).reduce(
          (s: number, e: any) => {
            const st = String(e?.status || '').toLowerCase()
            return st === 'rejected' ? s : s + this.expenseSettlementAmountBase(e)
          },
          0
        )
        return { r, deposit, gastado, difference: deposit - gastado }
      })
      // difference < 0 ⇒ el colaborador gastó más de lo depositado ⇒ reembolso.
      .filter(x => x.difference < -0.01)
      .map(({ r, deposit, gastado, difference }) => ({
        ...r,
        settlement: {
          advanceTotal: deposit,
          expenseTotal: gastado,
          difference,
          type: 'reembolso' as const,
        },
      }))

    return [...settled, ...computedDirectas].sort((a, b) =>
      String((b as any).updatedAt ?? '').localeCompare(
        String((a as any).updatedAt ?? '')
      )
    )
  }

  async findMyDocuments(userId: string, clientId: string) {
    const reimbursementRows = await this.expenseReportModel
      .find({
        userId: new Types.ObjectId(userId),
        clientId: new Types.ObjectId(clientId),
        reimbursementPaymentInfo: { $exists: true, $ne: null },
      })
      .select(
        'title reimbursementPaymentInfo reimbursedAt settlement.difference'
      )
      .sort({ reimbursedAt: -1 })
      .lean()
      .exec()

    const viaticoRows =
      await this.advanceService.findPaymentReceiptsForCollaborator(
        userId,
        clientId
      )

    const reimbursementDocs = reimbursementRows.map(r => ({
      kind: 'reembolso_rendicion' as const,
      expenseReportId: String(r._id),
      title: r.title || 'Rendición',
      receiptUrl: r.reimbursementPaymentInfo?.paymentReceiptUrl || '',
      receiptFileName:
        r.reimbursementPaymentInfo?.paymentReceiptFileName ||
        'comprobante-reembolso.pdf',
      date:
        r.reimbursedAt?.toISOString?.() ||
        r.reimbursementPaymentInfo?.transferDate ||
        '',
      amountFormatted:
        r.settlement?.difference != null
          ? Math.abs(Number(r.settlement.difference)).toFixed(2)
          : undefined,
      detailUrl: `${this.emailService.buildAppUrl(`/mis-rendiciones/${String(r._id)}/detalle`)}`,
    }))

    const viaticoDocs = (viaticoRows as any[]).flatMap(row => {
      const rep = row.expenseReportId
      const reportTitle =
        typeof rep === 'object' && rep?.title ? rep.title : 'Solicitud de Fondos'
      const expenseReportId =
        typeof rep === 'object' && rep?._id
          ? String(rep._id)
          : rep
            ? String(rep)
            : undefined
      // Un documento por cada pago parcial; fallback a paymentInfo (legado).
      const list =
        Array.isArray(row.payments) && row.payments.length
          ? row.payments
          : row.paymentInfo
            ? [row.paymentInfo]
            : []
      const multiple = list.length > 1
      return list
        .filter((p: any) => p?.paymentReceiptUrl)
        .map((p: any, i: number) => ({
          kind: 'viatico_pago' as const,
          advanceId: String(row._id),
          title: multiple
            ? `${row.description || reportTitle} · Pago ${i + 1}`
            : row.description || reportTitle,
          receiptUrl: p.paymentReceiptUrl || '',
          receiptFileName:
            p.paymentReceiptFileName ||
            `comprobante-pago-solicitudes de fondos${multiple ? `-${i + 1}` : ''}.pdf`,
          date:
            p.transferDate?.toISOString?.() ||
            p.createdAt?.toISOString?.() ||
            row.createdAt?.toString?.() ||
            '',
          expenseReportId,
        }))
    })

    return {
      items: [...reimbursementDocs, ...viaticoDocs].sort((a, b) =>
        String(b.date).localeCompare(String(a.date))
      ),
    }
  }

  async registerReimbursementPayment(
    reportId: string,
    dto: RegisterReimbursementPaymentDto,
    userRole: string,
    userPermissions?: { canApproveL2?: boolean },
    tenantCtx?: { requestClientId: string; isSuperAdmin: boolean },
    opts?: { bypassReceipt?: boolean }
  ) {
    // El reembolso lo registra Tesorería (Contabilidad/SuperAdmin o delegado
    // con L2). El Coordinador queda excluido aunque tenga canApproveL2 o el
    // RolesGuard lo aliase a Administrador: por rol no participa en el pago.
    const canPay =
      userRole !== ROLES.COORDINADOR &&
      (userRole === ROLES.SUPER_ADMIN ||
        userRole === ROLES.TESORERIA ||
        userPermissions?.canApproveL2 === true)
    if (!canPay) {
      throw new ForbiddenException(
        'No tienes permiso para registrar pagos de reembolso.'
      )
    }

    if (!opts?.bypassReceipt && dto.method !== 'efectivo' && !dto.paymentReceiptUrl) {
      throw new BadRequestException(
        'El comprobante es obligatorio para pagos por transferencia o cheque.'
      )
    }

    if (dto.paymentReceiptUrl) {
      const receiptValidation = this.validatePaymentReceipt(
        dto.paymentReceiptMimeType,
        dto.paymentReceiptFileName,
        dto.paymentReceiptSizeBytes
      )
      if (!receiptValidation.ok) {
        throw new BadRequestException(receiptValidation.reason)
      }
    }

    const report = await this.expenseReportModel.findById(reportId).exec()
    if (!report) {
      throw new NotFoundException(
        `Expense report with ID ${reportId} not found`
      )
    }

    if (tenantCtx && !tenantCtx.isSuperAdmin) {
      const rid = this.normalizeExpenseReportClientId(report.clientId)
      if (!tenantCtx.requestClientId || rid !== tenantCtx.requestClientId) {
        throw new ForbiddenException(
          'La rendición no pertenece a su organización.'
        )
      }
    }

    if (report.status !== 'approved' && report.status !== 'closed') {
      throw new BadRequestException(
        'Solo se puede registrar el reembolso cuando la rendición está aprobada o cerrada.'
      )
    }

    // Calcular liquidación efectiva desde los montos reales (no confiar en el tipo almacenado)
    let settlementType = report.settlement?.type
    let preSettlement: Record<string, unknown> | null = null
    if (!settlementType || settlementType !== 'reembolso') {
      const populated = await this.expenseReportModel
        .findById(reportId)
        .populate('expenseIds', 'total montoBase moneda montoReporte monedaReporte')
        .exec()
      const expenses = (populated?.expenseIds ?? []) as any[]
      const expenseTotal = expenses.reduce(
        (s: number, e: any) => s + this.expenseSettlementAmountBase(e),
        0
      )
      const rawAdvanceIds = ((report as any).advanceIds ?? []).map((x: any) =>
        x && typeof x === 'object' && '_id' in x ? String(x._id) : String(x)
      )
      const linkedAdvances = await this.advanceService.findByExpenseReportId(
        reportId,
        rawAdvanceIds
      )
      const activeAdvances = linkedAdvances.filter((a: any) =>
        ['approved', 'partially_paid', 'paid', 'settled'].includes(a.status)
      )
      // Si no hay anticipos activos, el colaborador gastó de su propio bolsillo (saldo = 0 - gastos).
      // Excepción: en una rendición directa con depósito de Contabilidad, ese depósito funciona como anticipo.
      const depositTotal = this.directaFundsGiven(report)
      const advanceTotal =
        activeAdvances.reduce(
          (s: number, a: any) => s + this.advanceSettlementAmountBase(a),
          0
        ) + depositTotal
      const difference = advanceTotal - expenseTotal
      if (Math.abs(difference) >= 0.01) {
        settlementType = difference > 0 ? 'devolucion' : 'reembolso'
        preSettlement = {
          advanceTotal,
          expenseTotal,
          difference,
          type: settlementType,
          settledAt: new Date(),
        }
      }
    }

    if (settlementType !== 'reembolso') {
      throw new BadRequestException(
        'Esta rendición no tiene saldo a favor del colaborador que deba reembolsarse.'
      )
    }
    if (report.reimbursementPaymentInfo) {
      throw new BadRequestException(
        'El reembolso de esta rendición ya fue registrado.'
      )
    }

    // Usar findByIdAndUpdate con $set para evitar el conflicto de Mongoose con el campo 'type' en settlement
    const updateFields: Record<string, unknown> = {
      reimbursementPaymentInfo: {
        method: dto.method,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        cci: dto.cci,
        transferDate: new Date(dto.transferDate),
        reference: dto.reference,
        paymentReceiptUrl: dto.paymentReceiptUrl,
        paymentReceiptFileName: dto.paymentReceiptFileName,
        paymentReceiptMimeType: dto.paymentReceiptMimeType,
        paymentReceiptSizeBytes: dto.paymentReceiptSizeBytes,
        scannedAmount: dto.scannedAmount,
        operationNumber: dto.operationNumber,
        operationDate: dto.operationDate,
        operationTime: dto.operationTime,
        titular: dto.titular,
      },
      reimbursedAt: new Date(),
    }
    if (report.status !== 'closed') {
      updateFields.status = 'reimbursed'
    }
    if (preSettlement) {
      updateFields.settlement = preSettlement
    }
    await this.expenseReportModel
      .findByIdAndUpdate(reportId, { $set: updateFields })
      .exec()

    // Caja chica: el depósito que acaba de registrar Tesorería es la REPOSICIÓN
    // del presupuesto. Devuelve al saldo lo rendido, así que la caja vuelve a
    // su tope y el responsable puede seguir gastando.
    if (report.isCajaChica) {
      const repuesto =
        Math.abs(
          Number(
            (preSettlement?.['difference'] as number | undefined) ??
              report.settlement?.difference ??
              0
          )
        ) || 0
      await this.reponerPresupuestoCajaChica(report, reportId, repuesto)
    }

    await this.notifyCollaboratorReimbursementPaid(reportId)

    return this.findOne(reportId)
  }

  /**
   * Devuelve al presupuesto de caja chica lo que Tesorería acaba de depositar.
   * No lanza: el pago al colaborador ya quedó registrado y no puede deshacerse
   * porque falle la reposición; si algo sale mal queda en el log para
   * corregirlo a mano.
   */
  private async reponerPresupuestoCajaChica(
    report: ExpenseReportDocument,
    reportId: string,
    monto: number
  ): Promise<void> {
    if (monto <= 0) return
    try {
      const fondo = await this.fondoCajaChicaService.findVivoByResponsible(
        String(report.userId),
        String(report.clientId)
      )
      if (!fondo) {
        this.logger.warn(
          `Rendición de caja chica ${reportId}: su responsable no tiene fondo activo, no hay presupuesto que reponer.`
        )
        return
      }
      await this.fondoCajaChicaService.reponer(String(fondo._id), {
        amount: monto,
        expenseReportId: reportId,
        registeredBy: String(report.userId),
        note: `Reposición por la rendición ${reportId}`,
      })
    } catch (err: unknown) {
      this.logger.error(
        `No se pudo reponer el presupuesto de caja chica de la rendición ${reportId}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  private async notifyCollaboratorReimbursementPaid(reportId: string) {
    const report = await this.findOne(reportId)
    const owner = report.userId as any
    if (!owner?.email) return

    const ownerId = String(owner._id || owner.id)
    const ownerEmailEnabled = await this.userService.isEmailEnabled(ownerId)

    const diff = report.settlement?.difference ?? 0
    const amountFormatted = Math.abs(Number(diff)).toFixed(2)

    const platformUrl = this.emailService.buildAppUrl('/mis-documentos')

    const pi = report.reimbursementPaymentInfo
    const transferDate = pi?.transferDate
      ? new Date(pi.transferDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)

    const baseData = {
      clientId: String(report.clientId),
      collaboratorName: owner.name || 'Colaborador',
      reportTitle: this.resolveReportTitle(report),
      amountFormatted,
      currencySymbol: this.settlementCurrencySymbol(report),
      transferDate,
      reference: pi?.reference || '—',
      paymentMethod: pi?.method || 'transferencia_bancaria',
      paymentReceiptUrl: pi?.paymentReceiptUrl || '',
      paymentReceiptFileName:
        pi?.paymentReceiptFileName || 'comprobante-reembolso.pdf',
      platformUrl,
    }

    try {
      // Pago realizado: le compete al COLABORADOR (involucrado) y a TESORERÍA
      // (quien ejecutó el pago), NO a los aprobadores.
      const sentPaid = new Set<string>()
      if (ownerEmailEnabled) {
        sentPaid.add(owner.email.trim().toLowerCase())
        await this.emailService.sendRendicionReembolsoPagado(owner.email, {
          recipientName: owner.name || 'Colaborador',
          ...baseData,
        })
      }

      const tesoreria = await this.userService.findTesoreriaNotifyRecipients(
        String(report.clientId)
      )
      for (const t of tesoreria) {
        const key = t.email.trim().toLowerCase()
        if (sentPaid.has(key)) continue
        sentPaid.add(key)
        await this.emailService.sendRendicionReembolsoPagado(t.email, {
          recipientName: t.name,
          ...baseData,
        })
      }

      await this.notificationsService.create({
        userId: ownerId,
        title: 'Reembolso registrado',
        message: `Se registró el pago del reembolso por ${this.settlementCurrencySymbol(report)} ${amountFormatted} para "${report.title}".`,
        type: 'success',
        actionUrl: `/mis-documentos`,
      })
    } catch (err) {
      console.error('Error enviando notificación de reembolso pagado', err)
    }
  }

  async findOneWithAdvances(id: string) {
    const report = await this.expenseReportModel
      .findById(id)
      .populate('userId', 'name email signature bankAccount dni area')
      .populate({
        path: 'expenseIds',
        populate: [
          { path: 'categoryId', select: 'name cuenta' },
          { path: 'proyectId', select: 'name' },
          {
            path: 'ordenTrabajoId',
            select: 'nombre costCenterId',
            populate: { path: 'costCenterId', select: 'code name' },
          },
        ],
      })
      .populate('advanceIds')
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('projectId', 'name')
      .populate({
        path: 'viaticoOrdenTrabajoId',
        select: 'nombre costCenterId',
        populate: { path: 'costCenterId', select: 'code name' },
      })
      .exec()
    if (!report)
      throw new NotFoundException(`Expense report with ID ${id} not found`)
    return this.normalizeReportExpenseDates(report)
  }

  // ─── FASE 8 — Cierre Definitivo ──────────────────────────────────────────

  /** Valida todas las condiciones previas al cierre. Devuelve lista de errores (vacía = OK). */
  async validateClosureConditions(id: string): Promise<string[]> {
    const report = await this.expenseReportModel
      .findById(id)
      .populate('expenseIds')
      .exec()
    if (!report) throw new NotFoundException(`Rendición ${id} no encontrada`)
    const errors: string[] = []
    if (report.status === 'closed') {
      errors.push('La rendición ya está cerrada')
      return errors
    }
    if (report.status !== 'approved' && report.status !== 'reimbursed') {
      errors.push(
        `Estado actual "${report.status}" no permite cierre. Se requiere estado aprobado o reembolsado.`
      )
    }
    const expenses = (report.expenseIds as any[]) || []
    const hasPendingExpenses = expenses.some(
      e => e?.status === 'pending_review' || e?.status === 'pending_sunat'
    )
    if (hasPendingExpenses) {
      errors.push(
        'Existen gastos en estado pendiente de revisión o validación SUNAT'
      )
    }
    const returnRecord = (report as any).returnRecord
    if (returnRecord && returnRecord.status !== 'validated') {
      errors.push(
        `Devolución pendiente en estado: ${returnRecord.status}. Se requiere validación de Contabilidad.`
      )
    }

    // Determinar tipo de liquidación para validar comprobantes previos al cierre
    {
      const existingSettlement = (report as any).settlement
      let effectiveSettlementType = existingSettlement?.type as
        | string
        | undefined
      if (!effectiveSettlementType) {
        const expenses = (report.expenseIds as any[]) || []
        const expenseTotal = expenses.reduce(
          (s: number, e: any) => s + this.expenseSettlementAmountBase(e),
          0
        )
        const rawAdvanceIds = ((report as any).advanceIds ?? []).map(
          (x: any) =>
            x && typeof x === 'object' && '_id' in x ? String(x._id) : String(x)
        )
        const linkedAdvances = await this.advanceService.findByExpenseReportId(
          id,
          rawAdvanceIds
        )
        const activeAdvances = linkedAdvances.filter((a: any) =>
          ['approved', 'partially_paid', 'paid', 'settled'].includes(a.status)
        )
        const depositTotal = this.directaFundsGiven(report)
        const advanceTotal =
          activeAdvances.reduce(
            (s: number, a: any) =>
              s +
              (a.status === 'approved'
                ? 0
                : Number(a.paidAmount ?? a.amount) || 0),
            0
          ) + depositTotal
        const difference = advanceTotal - expenseTotal
        if (Math.abs(difference) >= 0.01) {
          effectiveSettlementType = difference > 0 ? 'devolucion' : 'reembolso'
        }
      }
      if (
        effectiveSettlementType === 'devolucion' &&
        !(report as any).returnVoucher &&
        !(report as any).settlement?.toBolsa
      ) {
        errors.push(
          'El colaborador debe adjuntar el comprobante de devolución antes de cerrar la rendición.'
        )
      }
      if (
        effectiveSettlementType === 'reembolso' &&
        !(report as any).reimbursementPaymentInfo
      ) {
        errors.push(
          'Tesorería debe registrar el comprobante de reembolso al colaborador antes de cerrar la rendición.'
        )
      }
    }

    return errors
  }

  /** Cierra definitivamente la rendición. Bloquea toda edición posterior. */
  async close(id: string, closedBy: string): Promise<ExpenseReportDocument> {
    // Para viáticos: recomputar settlement antes de validar (corrige datos stale o mal calculados).
    try {
      await this.liquidateViaticoReport(id, /* fromClose= */ true)
    } catch (err) {
      console.error(`[close] Pre-validation viatico liquidation error for ${id}:`, err)
    }
    const errors = await this.validateClosureConditions(id)
    if (errors.length > 0) {
      throw new BadRequestException(errors.join(' | '))
    }
    // Compute settlement before closing in case it was skipped at approval time
    // (liquidateExpenseReport requires status === 'approved', which is still true here)
    try {
      await this.advanceService.liquidateExpenseReport(id, /* fromClose= */ true)
    } catch (err) {
      console.error(`[close] Pre-close liquidation error for ${id}:`, err)
    }
    const closureRecord = {
      closedAt: new Date(),
      closedBy,
      reopeningStatus: 'none' as const,
      documentHashes: [],
    }
    const updated = await this.expenseReportModel
      .findByIdAndUpdate(
        id,
        { $set: { status: 'closed', closureRecord } },
        { new: true }
      )
      .exec()
    if (!updated) throw new NotFoundException(`Rendición ${id} no encontrada`)
    const collaborator = await this.userService.findEmailNameClient(
      updated.userId.toString()
    )
    const collaboratorEmailEnabled = collaborator?.email
      ? await this.userService.isEmailEnabled(updated.userId.toString())
      : false
    const closedAtStr = this.emailService.formatDateDDMMYYYY(
      closureRecord.closedAt
    )
    const clientIdStr = updated.clientId.toString()
    if (collaboratorEmailEnabled) {
      this.emailService
        .sendRendicionCerrada(collaborator!.email, {
          clientId: clientIdStr,
          recipientName: collaborator!.name,
          reportTitle: this.resolveReportTitle(updated),
          closedAt: closedAtStr,
        })
        .catch(() => { })
    }

    const settlement = (updated as any).settlement
    const settlementDiffAbs = Math.abs(Number(settlement?.difference ?? 0))
    const clientId = clientIdStr
    const platformUrl = this.emailService.buildAppUrl(
      `/mis-rendiciones/${id}/detalle`
    )

    // Al cerrar, al colaborador solo le llega el correo de "rendición cerrada"
    // (arriba). El pedido de devolución ("debes devolver el saldo, adjunta el
    // comprobante") ya se envió al APROBAR la rendición (rama `approved`), que es
    // cuando el colaborador debe depositar y cargar el comprobante. Repetirlo
    // aquí llegaba junto al de cierre y era contradictorio (pedía devolver en una
    // rendición ya cerrada y, normalmente, ya devuelta).
    // Solo enviar correos de reembolso si hay un monto real (>= 0.01).
    if (settlement?.type === 'reembolso' && settlementDiffAbs >= 0.01) {
      const amountFormatted = settlementDiffAbs.toFixed(2)
      // Reembolso al colaborador: lo EJECUTA Tesorería (VD-37) y solo a ella le
      // llega el aviso (correo + in-app). VD-94: Contabilidad ya no recibe la
      // copia informativa que había agregado VD-88 —lo que ejecuta Tesorería es
      // asunto de Tesorería—. Se mantiene el dedup por correo.
      const tesoreriaUsers =
        await this.userService.findTesoreriaRecipientsWithIds(clientId)
      const sentReembolso = new Set<string>()
      for (const u of tesoreriaUsers) {
        const key = u.email.trim().toLowerCase()
        if (sentReembolso.has(key)) continue
        sentReembolso.add(key)
        this.emailService
          .sendRendicionReembolsoContabilidad(u.email, {
            clientId,
            recipientName: u.name,
            reportLabel: updated.title,
            reportTitle: this.resolveReportTitle(updated),
            collaboratorName: collaborator?.name || 'Colaborador',
            amountFormatted,
            currencySymbol: this.settlementCurrencySymbol(updated),
            detailUrl: platformUrl,
          })
          .catch(() => { })
        this.notificationsService
          .create({
            userId: u._id,
            title: 'Reembolso pendiente — Rendición cerrada',
            message: `La rendición "${updated.title}" fue cerrada. Hay un reembolso de ${this.settlementCurrencySymbol(updated)} ${amountFormatted} pendiente de pago al colaborador ${collaborator?.name || ''}.`,
            type: 'info',
            actionUrl: `/mis-rendiciones/${id}/detalle`,
          })
          .catch(() => { })
      }
    }

    return updated
  }

  async registerReturnVoucher(
    id: string,
    dto: {
      depositDate: string
      bankOrigin?: string
      operationNumber?: string
      amountReturned?: number
      fileUrl: string
      fileName?: string
      scannedAmount?: number
      operationDate?: string
      operationTime?: string
      titular?: string
    },
    userId: string
  ): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel
      .findById(id)
      .populate('expenseIds', 'total status montoBase moneda montoReporte monedaReporte')
      .exec()
    if (!report) throw new NotFoundException(`Rendición ${id} no encontrada`)
    if (report.status !== 'closed' && report.status !== 'approved') {
      throw new BadRequestException(
        'El comprobante de devolución solo puede cargarse cuando la rendición está aprobada o cerrada.'
      )
    }
    if ((report as any).returnVoucher) {
      throw new BadRequestException(
        'Ya se ha cargado un comprobante de devolución para esta rendición.'
      )
    }
    if (report.userId.toString() !== userId) {
      throw new ForbiddenException(
        'Solo el colaborador dueño puede cargar el comprobante de devolución.'
      )
    }

    // Compute live balance from linked advances — used for notification amount only, never blocks the upload
    const rawAdvanceIds = ((report as any).advanceIds ?? []).map((x: any) =>
      x && typeof x === 'object' && '_id' in x ? String(x._id) : String(x)
    )
    const linkedAdvances = await this.advanceService.findByExpenseReportId(
      id,
      rawAdvanceIds
    )
    const activeAdvances = linkedAdvances.filter(a =>
      ['approved', 'partially_paid', 'paid', 'settled'].includes(a.status)
    )
    const expenses = (report.expenseIds as any[]) || []
    const expenseTotal = expenses.reduce(
      (s, e) => s + this.expenseSettlementAmountBase(e),
      0
    )
    const advanceTotal =
      activeAdvances.length > 0
        ? activeAdvances.reduce(
          (s, a) =>
            s +
            (a.status === 'approved'
              ? 0
              : Number(a.paidAmount ?? a.amount) || 0),
          0
        )
        : // Sin anticipos enlazados el fondo entregado es propio del reporte
        // (viático pagado o presupuesto de la directa) y está en la moneda del
        // reporte, mientras que los gastos ya vienen en base: hay que valorarlo
        // con el TC congelado antes de restar.
        this.reportSettlementAmountBase(
          report,
          Number(
            (report as any).viaticoPaidAmount ?? (report as any).budget ?? 0
          )
        )
    const difference = advanceTotal - expenseTotal
    const notifySettlement = {
      advanceTotal,
      expenseTotal,
      difference,
      type: 'devolucion' as const,
      settledAt: new Date(),
    }
    // Update settlement in DB only if not already set or the stored type conflicts with actual balance
    const existingSettlement = (report as any).settlement
    const settlementIsStale =
      !existingSettlement ||
      (difference > 0.01 && existingSettlement.type !== 'devolucion')
    if (settlementIsStale) {
      await this.expenseReportModel
        .findByIdAndUpdate(id, { $set: { settlement: notifySettlement } })
        .exec()
    }
    // La liquidación persistida (calculada al aprobar, con el TC de cada gasto)
    // manda sobre el recálculo local: si no se pisó, es la que hay que avisar.
    const effectiveSettlement = settlementIsStale
      ? notifySettlement
      : existingSettlement

    const voucher = {
      url: dto.fileUrl,
      fileName: dto.fileName,
      depositDate: dto.depositDate,
      bankOrigin: dto.bankOrigin,
      operationNumber: dto.operationNumber,
      amountReturned: dto.amountReturned,
      scannedAmount: dto.scannedAmount,
      operationDate: dto.operationDate,
      operationTime: dto.operationTime,
      titular: dto.titular,
      uploadedAt: new Date(),
    }
    await this.expenseReportModel
      .findByIdAndUpdate(id, { $set: { returnVoucher: voucher } })
      .exec()

    const amountFormatted = Math.abs(
      Number(effectiveSettlement?.difference ?? 0)
    ).toFixed(2)
    const clientId = report.clientId.toString()
    const platformUrl = this.emailService.buildAppUrl(
      `/mis-rendiciones/${id}/detalle`
    )
    const collaborator = await this.userService.findEmailNameClient(userId)
    const collaboratorName = collaborator?.name || 'Colaborador'
    const collaboratorEmailEnabled = collaborator?.email
      ? await this.userService.isEmailEnabled(userId)
      : false

    if (collaboratorEmailEnabled) {
      this.emailService
        .sendRendicionCerrada(collaborator!.email, {
          clientId,
          recipientName: collaboratorName,
          reportTitle: this.resolveReportTitle(report),
          closedAt: this.emailService.formatDateDDMMYYYY(voucher.uploadedAt),
        })
        .catch(() => { })
    }
    this.notificationsService
      .create({
        userId,
        title: 'Comprobante de devolución enviado',
        message: `Tu comprobante de devolución para la rendición "${report.title}" fue enviado correctamente. Tesorería verificará el depósito.`,
        type: 'success',
        actionUrl: `/mis-rendiciones/${id}/detalle`,
      })
      .catch(() => { })

    // La devolución la verifica TESORERÍA (misma sección de Pagos que los
    // reembolsos, VD-37) y solo a ella le llega el aviso (correo + in-app).
    // VD-94: Contabilidad ya no recibe la copia informativa que había agregado
    // VD-88. Se mantiene el dedup por correo.
    const tesoreriaUsers =
      await this.userService.findTesoreriaRecipientsWithIds(clientId)
    const sentDevolucion = new Set<string>()
    for (const u of tesoreriaUsers) {
      const key = u.email.trim().toLowerCase()
      if (sentDevolucion.has(key)) continue
      sentDevolucion.add(key)
      this.emailService
        .sendRendicionDevolucionCargada(u.email, {
          clientId,
          recipientName: u.name,
          collaboratorName,
          reportTitle: this.resolveReportTitle(report),
          amountFormatted,
          currencySymbol: monedaSymbol((effectiveSettlement as any)?.moneda),
          depositDate: dto.depositDate,
          bankOrigin: dto.bankOrigin,
          operationNumber: dto.operationNumber,
          platformUrl,
        })
        .catch(() => { })
      this.notificationsService
        .create({
          userId: u._id,
          title: 'Comprobante de devolución recibido',
          message: `${collaboratorName} adjuntó el comprobante de devolución de ${monedaSymbol((effectiveSettlement as any)?.moneda)} ${amountFormatted} para la rendición "${report.title}". Por favor, verifica el depósito.`,
          type: 'info',
          actionUrl: `/mis-rendiciones/${id}/detalle`,
        })
        .catch(() => { })
    }

    return this.expenseReportModel
      .findById(id)
      .exec() as Promise<ExpenseReportDocument>
  }

  /** Solicita reapertura (rol Gerencia/Admin). */
  async requestReopening(
    id: string,
    requestedBy: string,
    reason: string
  ): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id).exec()
    if (!report) throw new NotFoundException(`Rendición ${id} no encontrada`)
    if (report.status !== 'closed') {
      throw new BadRequestException(
        'Solo se puede solicitar reapertura de rendiciones cerradas'
      )
    }
    if (reason.trim().length < 200) {
      throw new BadRequestException(
        'El motivo de reapertura debe tener al menos 200 caracteres'
      )
    }
    const updatedClosure = {
      ...(report as any).closureRecord,
      reopeningStatus: 'requested' as const,
      reopeningRequestedBy: requestedBy,
      reopeningRequestedAt: new Date(),
      reopeningReason: reason,
    }
    const updated = await this.expenseReportModel
      .findByIdAndUpdate(
        id,
        { $set: { closureRecord: updatedClosure } },
        { new: true }
      )
      .exec()
    return updated!
  }

  /** Contabilidad aprueba o rechaza la reapertura. */
  async approveReopening(
    id: string,
    approvedBy: string,
    approve: boolean
  ): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id).exec()
    if (!report) throw new NotFoundException(`Rendición ${id} no encontrada`)
    const cr = (report as any).closureRecord
    if (!cr || cr.reopeningStatus !== 'requested') {
      throw new BadRequestException('No hay solicitud de reapertura pendiente')
    }
    const updates: any = {}
    if (approve) {
      updates.status = 'approved'
      updates.closureRecord = {
        ...cr,
        reopeningStatus: 'approved' as const,
        reopeningApprovedBy: approvedBy,
        reopeningApprovedAt: new Date(),
        reopenedAt: new Date(),
      }
    } else {
      updates.closureRecord = {
        ...cr,
        reopeningStatus: 'none' as const,
        reopeningApprovedBy: approvedBy,
        reopeningApprovedAt: new Date(),
      }
    }
    const updated = await this.expenseReportModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .exec()
    return updated!
  }

  // ─── Cancel / Delete por colaborador ────────────────────────────────────────

  /** Cancela una rendición en estado 'solicited'. Solo el propietario puede cancelar. */
  async cancel(
    id: string,
    userId: string,
    reason?: string
  ): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id).lean().exec()
    if (!report)
      throw new NotFoundException(`Expense report with ID ${id} not found`)

    if (
      String(report.userId) !== String(userId) &&
      String(report.createdBy) !== String(userId)
    ) {
      throw new ForbiddenException(
        'No tienes permiso para cancelar esta rendición'
      )
    }
    if (report.status !== 'solicited') {
      throw new BadRequestException(
        'Solo se puede cancelar una rendición en estado solicitada.'
      )
    }

    const updated = await this.expenseReportModel
      .findByIdAndUpdate(id, { $set: { status: 'cancelled' } }, { new: true })
      .exec()
    if (!updated)
      throw new NotFoundException(`Expense report with ID ${id} not found`)

    try {
      const admins = await this.userService.findAdminsByClient(
        String(report.clientId)
      )
      const user = await this.userService.findOne(userId)
      const collaboratorName = user.name || 'Un colaborador'

      for (const admin of admins) {
        if (admin.email) {
          await this.emailService.sendRendicionCancelada(admin.email, {
            clientId: String(report.clientId),
            adminName: admin.name || 'Administrador',
            collaboratorName,
            reportTitle: this.resolveReportTitle(report),
            cancelReason: reason,
          })
        }
        await this.notificationsService.create({
          userId: String(admin._id),
          title: 'Rendición cancelada',
          message: `${collaboratorName} ha cancelado su solicitud de rendición: "${report.title}"`,
          type: 'warning',
          actionUrl: `/mis-rendiciones/${id}/detalle`,
        })
      }
    } catch (error) {
      console.error(
        'Error enviando notificaciones de rendición cancelada',
        error
      )
    }

    return updated
  }

  /** Contabilidad reabre una rendición directamente (sin ciclo request/approve). Vuelve a estado 'open'. */
  async reopen(
    id: string,
    reopenedBy: string,
    reason: string
  ): Promise<ExpenseReportDocument> {
    const trimmedReason = reason?.trim() ?? ''
    if (!trimmedReason) {
      throw new BadRequestException('El motivo de reapertura es obligatorio.')
    }
    const report = await this.expenseReportModel.findById(id).exec()
    if (!report) throw new NotFoundException(`Rendición ${id} no encontrada`)

    const nonReopenable: string[] = ['open', 'solicited', 'cancelled']
    if (nonReopenable.includes(report.status)) {
      throw new BadRequestException(
        `La rendición ya está en estado "${report.status}". No se puede reabrir.`
      )
    }

    const reopenEntry = {
      reason: trimmedReason,
      reopenedBy,
      reopenedAt: new Date(),
      fromStatus: report.status,
    }
    // Al reabrir, la notificación previa a contabilidad (si la hubo) queda obsoleta:
    // los montos pueden cambiar antes del próximo cierre. Limpiamos esa marca para
    // que el correo se vuelva a enviar con el monto correcto. No tocamos
    // `reimbursementPaymentInfo` ni `returnVoucher` porque representan pagos reales.
    // También limpiamos `settlement` porque sus montos (advanceTotal, expenseTotal,
    // difference) reflejan el estado al momento del cierre anterior; cualquier nuevo
    // anticipo o gasto durante esta reapertura los volvería stale. Sin settlement, la UI
    // y los flujos de cierre/reembolso/devolución caen al cómputo live. La próxima
    // aprobación reconstruirá un settlement fresco vía liquidateExpenseReport.
    const updated = await this.expenseReportModel
      .findByIdAndUpdate(
        id,
        {
          $set: { status: 'open' },
          $unset: { reimbursementAccountingNotifiedAt: '', settlement: '' },
          $push: { reopenHistory: reopenEntry },
        },
        { new: true }
      )
      .exec()
    if (!updated) throw new NotFoundException(`Rendición ${id} no encontrada`)

    const collaborator = await this.userService.findEmailNameClient(
      report.userId.toString()
    )
    const platformUrl = this.emailService.buildAppUrl(
      `/mis-rendiciones/${id}/detalle`
    )
    const clientIdStr = report.clientId.toString()
    const reportTitle = this.resolveReportTitle(updated)

    this.notificationsService
      .create({
        userId: report.userId.toString(),
        title: 'Rendición reabierta',
        message: `Tu rendición fue reabierta por contabilidad. Motivo: ${trimmedReason.slice(0, 100)}. Ya puedes editar tus comprobantes.`,
        type: 'warning',
        actionUrl: `/mis-rendiciones/${id}/detalle`,
      })
      .catch(() => { })

    if (collaborator?.email) {
      const collaboratorEmailEnabled = await this.userService.isEmailEnabled(
        report.userId.toString()
      )
      if (collaboratorEmailEnabled) {
        this.emailService
          .sendRendicionReabierta(collaborator.email, {
            clientId: clientIdStr,
            recipientName: collaborator.name,
            reportTitle,
            reason: trimmedReason,
            intro:
              'Su rendición cerrada fue reabierta por Contabilidad. Ya puede editar sus comprobantes y volver a enviarla.',
            platformUrl,
          })
          .catch((err: unknown) =>
            console.error(
              `Correo reapertura colaborador ${collaborator.email}: ${err instanceof Error ? err.message : String(err)}`
            )
          )
      }
    }

    // Notificar a los APROBADORES del centro de costo (Aprobador 1, 2, … N),
    // no al coordinador personal (obsoleto).
    try {
      const approvers = await this.resolveReportApproverRecipients(id, {
        excludeUserIds: [report.userId.toString()],
      })
      const sentReopen = new Set<string>()
      for (const a of approvers) {
        this.notificationsService
          .create({
            userId: a.userId,
            title: 'Rendición reabierta por Contabilidad',
            message: `La rendición "${reportTitle}" fue reabierta. Motivo: ${trimmedReason.slice(0, 100)}.`,
            type: 'info',
            actionUrl: `/mis-rendiciones/${id}/detalle`,
          })
          .catch(() => { })

        if (!a.emailEnabled || !a.email) continue
        const key = a.email.trim().toLowerCase()
        if (sentReopen.has(key)) continue
        sentReopen.add(key)
        this.emailService
          .sendRendicionReabierta(a.email, {
            clientId: clientIdStr,
            recipientName: a.name,
            reportTitle,
            reason: trimmedReason,
            intro: `La rendición de ${collaborator?.name || 'el colaborador'} que usted aprobó fue reabierta por Contabilidad.`,
            platformUrl,
          })
          .catch((err: unknown) =>
            console.error(
              `Correo reapertura aprobador ${a.email}: ${err instanceof Error ? err.message : String(err)}`
            )
          )
      }
    } catch { }

    return updated
  }

  /** Guard: lanza ForbiddenException si la rendición está cerrada. */
  async assertNotClosed(id: string): Promise<void> {
    const report = await this.expenseReportModel
      .findById(id)
      .select('status closureRecord')
      .exec()
    if (!report) throw new NotFoundException(`Rendición ${id} no encontrada`)
    if (report.status === 'closed') {
      throw new ForbiddenException(
        'La rendición está cerrada y no permite modificaciones'
      )
    }
  }

  // ─── VIÁTICOS UNIFICADOS (type = 'viatico') ──────────────────────────────────

  private viaticoStartOfDay(d: Date): Date {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }

  private viaticoFormatMoney(value: number): string {
    if (!Number.isFinite(value)) return '0.00'
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  /** Símbolo de moneda ('S/' / '$') a partir del código ISO guardado en el viático. */
  private viaticoMoneySymbol(moneda?: string): string {
    return monedaSymbol(moneda)
  }

  private viaticoEscapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  private computeViaticoLineTotal(line: CreateAdvanceLineDto): number {
    const imp = Number(line.importe) || 0
    const glp = Number(line.glpPerDay) || 0
    const d = Number(line.days) || 0
    const p = Number(line.peopleCount) || 0
    const raw = glp > 0 ? imp * glp * d : imp * p * d
    return Math.round(raw * 100) / 100
  }

  private isValidViaticoReceipt(mimeType?: string, fileName?: string, sizeBytes?: number) {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png']
    const allowedExt = ['.pdf', '.jpg', '.jpeg', '.png']
    const mime = (mimeType ?? '').toLowerCase().trim()
    const name = (fileName ?? '').toLowerCase().trim()
    if (!allowedMimes.includes(mime) && !allowedExt.some(e => name.endsWith(e))) {
      return { ok: false, reason: 'Formato inválido. Solo se permite PDF, JPG o PNG.' }
    }
    if (typeof sizeBytes === 'number' && sizeBytes > 10 * 1024 * 1024) {
      return { ok: false, reason: 'El comprobante excede 10MB.' }
    }
    return { ok: true }
  }

  private addViaticoBusinessDays(date: Date, days: number): Date {
    const result = new Date(date)
    let added = 0
    while (added < days) {
      result.setDate(result.getDate() + 1)
      const dow = result.getDay()
      if (dow !== 0 && dow !== 6) added++
    }
    return result
  }

  /**
   * @param allowPastDates permiso por usuario `permissions.permitirFechasAnteriores`:
   * cuando es true se omite la validación de "fecha de inicio no anterior a hoy".
   */
  private async validateViaticoLines(
    dto: { place: string; startDate: string; endDate: string; projectId: string; lines?: CreateAdvanceLineDto[]; observations?: string; amount: number; moneda?: string },
    clientId: string,
    allowPastDates = false
  ) {
    const start = this.viaticoStartOfDay(new Date(dto.startDate))
    const end = this.viaticoStartOfDay(new Date(dto.endDate))
    if (end < start) throw new BadRequestException('La fecha fin debe ser mayor o igual a la fecha inicio.')

    const today = this.viaticoStartOfDay(new Date())
    if (!allowPastDates && start < today) {
      throw new BadRequestException('La fecha de inicio no puede ser anterior a hoy.')
    }

    await this.projectService.findOne(dto.projectId, clientId)

    // El monto requerido lo ingresa directamente el colaborador; ya no se arma a
    // partir de un detalle por categoría. `lines` solo se procesa si viene (datos
    // legados o clientes antiguos en caché) y en ese caso valida contra `amount`.
    const lineDocs: { categoryId: Types.ObjectId; detalle?: string; importe: number; peopleCount: number; glpPerDay: number; days: number; lineTotal: number }[] = []
    // Las líneas se declaran en la moneda que pidió el colaborador, no en soles.
    const sym = monedaSymbol(dto.moneda)
    const lines = dto.lines ?? []
    let sum = 0
    for (const line of lines) {
      const cat = await this.categoryService.findOne(line.categoryId, clientId)
      if (!cat.isActive) throw new BadRequestException(`La categoría "${cat.name}" está inactiva.`)
      const expected = this.computeViaticoLineTotal(line)
      if (Math.abs(line.lineTotal - expected) > 0.02) {
        throw new BadRequestException(`Total de línea inconsistente. Esperado ${sym} ${expected.toFixed(2)}, recibido ${sym} ${line.lineTotal.toFixed(2)}.`)
      }
      sum += line.lineTotal
      const det = line.detalle?.trim()
      lineDocs.push({ categoryId: new Types.ObjectId(line.categoryId), detalle: det?.length ? det : undefined, importe: line.importe, peopleCount: line.peopleCount, glpPerDay: line.glpPerDay, days: line.days, lineTotal: line.lineTotal })
    }

    let roundedSum: number
    if (lines.length > 0) {
      roundedSum = Math.round(sum * 100) / 100
      if (Math.abs(roundedSum - dto.amount) > 0.02) {
        throw new BadRequestException(`El monto total (${sym} ${dto.amount}) debe coincidir con la suma de líneas (${sym} ${roundedSum}).`)
      }
    } else {
      if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
        throw new BadRequestException('Indique el monto requerido.')
      }
      roundedSum = Math.round(dto.amount * 100) / 100
    }

    const startFmt = this.emailService.formatDateDDMMYYYY(dto.startDate as any)
    const endFmt = this.emailService.formatDateDDMMYYYY(dto.endDate as any)
    const description = dto.observations?.trim()
      ? `Solicitud de Fondos: ${dto.place.trim()} (${startFmt} → ${endFmt}) | ${dto.observations.trim()}`
      : `Solicitud de Fondos: ${dto.place.trim()} (${startFmt} → ${endFmt})`

    return { lineDocs, roundedSum, description }
  }

  /**
   * Arma la cadena de aprobadores de la SOLICITUD de viático (regla 1.3):
   * N2(seleccionado) si el centro está asignado al colaborador; N2(principal)
   * → N2(seleccionado) si no lo está.
   */
  private async buildSolicitudCostCenterChain(
    profile: {
      projectIds?: string[]
      primaryProjectId?: string
      approverLevels?: ApproverLevel[]
    },
    selectedProjectId: string,
    creatorId: string,
    clientId: string
  ): Promise<ChainStep[]> {
    const assignedProjectIds = profile.projectIds ?? []
    const idsToLoad = [...new Set([...assignedProjectIds, selectedProjectId])]
    const projects = await this.projectService.findManyByIds(idsToLoad, clientId)
    const projectById = new Map<string, ChainProject>(
      projects.map(p => [String(p._id), p as unknown as ChainProject])
    )
    return buildSolicitudChain({
      assignedProjectIds,
      primaryProjectId: profile.primaryProjectId,
      selectedProjectId,
      creatorId,
      projectById,
      ownerApproverLevels: profile.approverLevels,
    })
  }

  /**
   * Arma la cadena de aprobación de la RENDICIÓN a nivel de reporte (regla 1.4,
   * fase post-pago del viático). Reusa `buildRendicionChain` tal cual, con el
   * centro de costo del reporte como "seleccionado" — misma lógica de
   * asignado/apoyo/escalamiento/omisión que la cadena por comprobante, sin
   * generalizar nada. Para el centro de prueba (2 niveles) devuelve [N1, N2].
   */
  private async buildReportRendicionChain(
    ownerUserId: string,
    clientId: string,
    reportProjectId: string
  ): Promise<ChainStep[]> {
    const profile = await this.userService.findTransactionalProfile(ownerUserId)
    const assignedProjectIds = profile?.projectIds ?? []
    const primaryProjectId = profile?.primaryProjectId
    const idsToLoad = [
      ...new Set(
        [...assignedProjectIds, reportProjectId].filter((x): x is string => !!x)
      ),
    ]
    const projects = await this.projectService.findManyByIds(idsToLoad, clientId)
    const projectById = new Map<string, ChainProject>(
      projects.map(p => [String(p._id), p as unknown as ChainProject])
    )
    return buildRendicionChain({
      assignedProjectIds,
      primaryProjectId,
      selectedProjectId: reportProjectId,
      creatorId: ownerUserId,
      projectById,
      // Regla 1.10: si el colaborador tiene aprobadores propios por nivel, la
      // cadena de la rendición sale de ellos, igual que la cadena por
      // comprobante (`buildExpenseChains`) y la de la solicitud
      // (`buildSolicitudCostCenterChain`). Sin esto, la fase post-pago del
      // viático se seguía armando con los niveles del centro de costo.
      ownerApproverLevels: profile?.approverLevels,
    })
  }

  /**
   * Construye la cadena de aprobación por documento (regla 1.4) de los
   * comprobantes indicados que **todavía no tengan una** (`approverChain ===
   * undefined`). No se usa ya únicamente al enviar la rendición completa: se
   * llama sobre todo al registrar CADA comprobante (ver
   * `buildChainForNewExpense`), para que N1/N2/[N2 sel] puedan empezar a
   * aprobar desde el momento en que se sube, sin esperar a que el colaborador
   * termine de cargar todo y haga clic en "Enviar". Que no toque comprobantes
   * que YA tienen cadena es deliberado: evita pisar aprobaciones en curso si
   * esta función se vuelve a llamar más tarde (p. ej. al enviar la rendición,
   * como red de seguridad para comprobantes legados sin cadena). Tampoco toca
   * comprobantes ya rechazados — su reapertura resetea la cadena aparte (ver
   * `ExpenseService.updateExpense`, rama de corrección de rechazo).
   *
   * `opts.force` reconstruye la cadena aunque ya exista una — solo lo usan
   * `addExpenseToReport` (rama `wasRejected`) y `resubmitSilent`: cuando se
   * rechaza la RENDICIÓN completa (no un comprobante individual) y el
   * colaborador corrige y reenvía, el revisor debe volver a validar todo
   * desde cero, así que cualquier aprobación N1/N2 previa se descarta.
   */
  private async buildExpenseChains(
    expenseIds: Types.ObjectId[],
    ownerUserId: string,
    clientId: string,
    opts: { force?: boolean; esCajaChica?: boolean } = {}
  ): Promise<void> {
    if (expenseIds.length === 0) return
    const profile = await this.userService.findTransactionalProfile(ownerUserId)
    const assignedProjectIds = profile?.projectIds ?? []
    const primaryProjectId = profile?.primaryProjectId
    // Regla 1.10: N1/N2 salen de los niveles propios del colaborador si los
    // tiene; si no, del centro de costo principal (comportamiento previo).
    const ownerApproverLevels = profile?.approverLevels

    const expenses = await this.expenseModel
      .find({ _id: { $in: expenseIds } })
      .select('proyectId status approverChain')
      .exec()

    const projectIdsToLoad = [
      ...new Set(
        [...assignedProjectIds, ...expenses.map(e => e.proyectId?.toString())].filter(
          (x): x is string => !!x
        )
      ),
    ]
    const projects = await this.projectService.findManyByIds(projectIdsToLoad, clientId)
    const projectById = new Map<string, ChainProject>(
      projects.map(p => [String(p._id), p as unknown as ChainProject])
    )

    // Caja chica: el centro de costo del comprobante es opcional y puede ser
    // cualquiera, así que no puede decidir quién aprueba. Todos los gastos del
    // fondo van a los aprobadores del RESPONSABLE, la misma cadena que la
    // solicitud. Se resuelve una vez, fuera del bucle, porque no depende del
    // comprobante.
    const principalId = primaryProjectId ?? assignedProjectIds[0]
    const cajaChicaChain = opts.esCajaChica
      ? buildCajaChicaChain({
          ownerApproverLevels,
          fallbackProject: projectById.get(String(principalId)) ?? {
            _id: new Types.ObjectId(),
          },
          creatorId: ownerUserId,
          // El comprobante ya está guardado: lanzar acá lo dejaría a medio
          // registrar. Sin aprobadores la cadena queda vacía, igual que en el
          // resto del motor, y se avisa en el log.
          throwOnEmpty: false,
        })
      : null
    if (opts.esCajaChica && cajaChicaChain?.length === 0) {
      this.logger.warn(
        `Caja chica de ${ownerUserId}: sus comprobantes quedan sin cadena porque no tiene aprobadores configurados.`
      )
    }

    for (const expense of expenses) {
      if (expense.status === 'rejected') continue
      if (expense.approverChain !== undefined && !opts.force) continue
      const selectedProjectId = expense.proyectId?.toString()
      if (!opts.esCajaChica && !selectedProjectId) continue
      const chain =
        cajaChicaChain ??
        buildRendicionChain({
          assignedProjectIds,
          primaryProjectId,
          selectedProjectId: selectedProjectId!,
          creatorId: ownerUserId,
          projectById,
          ownerApproverLevels,
        })
      expense.approverChain = chain
      expense.requiredLevels = chain.length
      expense.approvalLevel = 0
      await expense.save()
      // Aprobación en paralelo: TODOS los pasos son accionables desde que se
      // construye la cadena (no solo el primero) — se notifica a los
      // aprobadores de cada uno.
      for (const step of chain) {
        void this.notifyExpensePendingApprovers(expense, step)
      }
    }
  }

  /**
   * Construye la cadena de aprobación de UN comprobante recién creado —
   * público, lo llama `ExpenseService` justo después de guardarlo.
   *
   * Solo actúa si la rendición YA fue enviada (comprobante agregado a una
   * rendición en curso de aprobación). Mientras siga abierta no se construye
   * nada: sin cadena no hay a quién le toque aprobar, así que el comprobante no
   * aparece en la bandeja de ningún aprobador hasta que el colaborador envía.
   *
   * Antes se construía desde el registro, para que N1/N2 pudieran ir aprobando
   * en paralelo sin esperar al colaborador. Eso abría dos huecos: la rendición
   * podía quedar con todo aprobado antes del envío y entonces ningún
   * `approveByCoord` posterior la avanzaba a Contabilidad (se quedaba en
   * `submitted` sin salida), y el colaborador podía editar un comprobante ya
   * aprobado — las aprobaciones no se reinician al editar y el envío no
   * reconstruye cadenas existentes, así que el monto revisado y el enviado
   * podían no ser el mismo. La cadena de todos los comprobantes se construye
   * ahora al enviar (ver `update()`).
   */
  async buildChainForNewExpense(
    expenseId: string,
    ownerUserId: string,
    clientId: string
  ): Promise<void> {
    if (!ownerUserId || !clientId) return
    const expense = await this.expenseModel
      .findById(expenseId)
      .select('expenseReportId')
      .lean<{ expenseReportId?: unknown }>()
      .exec()
    const reportId = expense?.expenseReportId
      ? String(
        (expense.expenseReportId as { _id?: unknown })?._id ??
        expense.expenseReportId
      )
      : null
    if (!reportId) return
    const report = await this.expenseReportModel
      .findById(reportId)
      .select('status isCajaChica')
      .lean<{ status?: string; isCajaChica?: boolean }>()
      .exec()
    if (report?.status !== 'submitted') return
    await this.buildExpenseChains(
      [new Types.ObjectId(expenseId)],
      ownerUserId,
      clientId,
      { esCajaChica: report.isCajaChica === true }
    )
  }

  /**
   * Notifica (in-app) a los approverIds de un paso de un comprobante que les
   * toca revisarlo. Se llama por cada paso pendiente al construir la cadena
   * (aprobación en paralelo: todos son accionables desde el envío).
   */
  async notifyExpensePendingApprovers(
    expense: { _id: unknown; total?: number; expenseReportId?: unknown },
    step: ChainStep
  ): Promise<void> {
    const expenseId = String((expense as any)._id)
    for (const approverId of step.approverIds) {
      try {
        await this.notificationsService.create({
          userId: approverId.toString(),
          title: 'Comprobante pendiente de tu aprobación',
          message: `Un comprobante de ${monedaSymbol((expense as any).moneda)} ${Number((expense as any).total ?? 0).toFixed(2)} está pendiente de tu revisión (nivel ${step.level}).`,
          type: 'info',
          actionUrl: `/mis-rendiciones/${(expense as any).expenseReportId?.toString() ?? ''}/detalle`,
          metadata: { expenseId, event: 'expense_pending_coord' },
        })
      } catch (err: unknown) {
        this.logger.error(`Notif comprobante pendiente ${expenseId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  /**
   * SOLICITUD de asignación de caja chica. Va sobre un reporte `type: 'viatico'`
   * a propósito: así reutiliza entero el flujo de Solicitud de Fondos que ya
   * existe (aprobación por la cadena, gate de Contabilidad, pago de Tesorería,
   * archivo del banco y correos) sin duplicar nada. Lo que cambia respecto de
   * `createViatico`:
   *
   * - No lleva lugar, fechas, líneas, motivo ni orden de trabajo: el formato en
   *   papel no los tiene. Lo único que escribe el responsable es el monto.
   * - El centro de costo es el suyo, no lo elige.
   * - La cadena sale de sus propios aprobadores (`buildCajaChicaChain`), no del
   *   centro de costo, porque los gastos del fondo pueden ir a cualquiera.
   *
   * Se crea también el fondo en `pending_funding`. Recién queda operativo
   * cuando Tesorería registra el pago (ver `registerViaticoPayment`): antes de
   * eso el responsable no tiene efectivo en la mano.
   */
  async createSolicitudCajaChica(
    dto: CreateSolicitudCajaChicaDto,
    userId: string,
    clientId: string
  ): Promise<ExpenseReportDocument> {
    const profile = await this.userService.findTransactionalProfile(userId)
    if (!profile?.signature?.trim()) {
      throw new ForbiddenException(
        'Debe registrar su firma digital en el perfil antes de solicitar fondos.'
      )
    }

    // Una solicitud posterior REEMPLAZA el presupuesto vigente: puede pedir más
    // o menos. Lo único que no se permite es encimar dos solicitudes, porque no
    // se sabría cuál manda.
    const fondoVigente = await this.fondoCajaChicaService.findVivoByResponsible(
      userId,
      clientId
    )
    if (fondoVigente?.status === 'pending_funding') {
      throw new BadRequestException(
        'Ya tiene una solicitud de caja chica en curso. Espere a que se resuelva antes de pedir otro presupuesto.'
      )
    }
    if (fondoVigente) {
      const enCurso = await this.expenseReportModel.countDocuments({
        userId: new Types.ObjectId(userId),
        clientId: new Types.ObjectId(clientId),
        isSolicitudCajaChica: true,
        status: {
          $in: ['pending_l1', 'pending_l2', 'pending_contabilidad', 'viatico_approved'],
        },
      })
      if (enCurso > 0) {
        throw new BadRequestException(
          'Ya tiene una solicitud de presupuesto en curso. Espere a que se resuelva antes de pedir otra.'
        )
      }
    }

    // Bajar el presupuesto por debajo de lo ya gastado dejaria el disponible en
    // negativo. Se corta aca, al pedirlo, y no al final de la cadena: el
    // responsable se entera de una y no despues de molestar a sus aprobadores.
    const gastadoVigente = Math.round(Number(fondoVigente?.spentAmount ?? 0) * 100) / 100
    if (fondoVigente && Math.round(dto.amount * 100) / 100 < gastadoVigente) {
      throw new BadRequestException(
        `El presupuesto solicitado (S/ ${dto.amount.toFixed(2)}) es menor a lo ya gastado y pendiente de reposicion (S/ ${gastadoVigente.toFixed(2)}). Rinda esos comprobantes antes de bajar el presupuesto.`
      )
    }

    // El centro de costo es el del solicitante. Si no tiene principal se toma el
    // primero asignado, que es el mismo criterio del resto del motor.
    const projectId = profile.primaryProjectId ?? profile.projectIds?.[0]
    if (!projectId) {
      throw new BadRequestException(
        'No tiene centros de costo asignados. Un administrador debe asignarle al menos uno antes de solicitar caja chica.'
      )
    }
    const [project] = await this.projectService.findManyByIds(
      [projectId],
      clientId
    )
    if (!project) {
      throw new BadRequestException('Su centro de costo no fue encontrado.')
    }

    const chain = buildCajaChicaChain({
      ownerApproverLevels: profile.approverLevels,
      fallbackProject: project as unknown as ChainProject,
      creatorId: userId,
    })

    // El presupuesto solicitado reemplaza al vigente. Lo que Tesorería tiene que
    // depositar es solo la DIFERENCIA: pedir 5000 teniendo 3000 mueve 2000, y
    // pedir 2000 teniendo 3000 no mueve nada (genera un sobrante por devolver).
    const nuevoPresupuesto = Math.round(dto.amount * 100) / 100
    const presupuestoVigente = Math.round(
      Number(fondoVigente?.fundAmount ?? 0) * 100
    ) / 100
    const amount = Math.max(
      0,
      Math.round((nuevoPresupuesto - presupuestoVigente) * 100) / 100
    )

    const moneda = normalizeMoneda(dto.moneda)
    const accountingConfig = await this.currencyService.getConfig(clientId)
    const conversion = await this.currencyService.toBase(
      amount,
      moneda,
      new Date(),
      accountingConfig
    )

    const report = await this.expenseReportModel.create({
      type: 'viatico',
      isSolicitudCajaChica: true,
      cajaChicaNuevoPresupuesto: nuevoPresupuesto,
      cajaChicaPresupuestoAnterior: presupuestoVigente,
      userId: new Types.ObjectId(userId),
      clientId: new Types.ObjectId(clientId),
      createdBy: new Types.ObjectId(userId),
      projectId: new Types.ObjectId(projectId),
      // El título es lo que la lista del aprobador muestra en la columna
      // principal: sin él la fila salía como "—" porque una solicitud de caja
      // chica no tiene lugar de destino del que caer.
      title: fondoVigente
        ? `Caja chica: nuevo presupuesto S/ ${nuevoPresupuesto.toFixed(2)}`
        : 'Solicitud de caja chica',
      description: 'Solicitud de asignación de caja chica',
      status: 'pending_l1',
      expenseIds: [],
      budget: amount,
      viaticoAmount: amount,
      viaticoMoneda: moneda,
      viaticoMontoBase: conversion.montoBase,
      tipoCambio: conversion.tipoCambio,
      tcFecha: conversion.tcFecha,
      viaticoApproverChain: chain,
      viaticoRequiredLevels: chain.length,
      viaticoApprovalLevel: 0,
      viaticoApprovalHistory: [],
      viaticoSolicitudVersion: 1,
      viaticoBudgetCommitmentRecorded: false,
      viaticoObservations: dto.observations?.trim(),
      viaticoLines: [],
    })

    const reportId = String((report as any)._id)
    // La primera solicitud abre el fondo; las siguientes se cuelgan del que ya
    // existe y solo lo ajustan cuando se aprueban.
    const fondo =
      fondoVigente ??
      (await this.fondoCajaChicaService.create(
        {
          responsibleId: userId,
          clientId,
          requestedAmount: nuevoPresupuesto,
          solicitudReportId: reportId,
        },
        userId
      ))
    await this.expenseReportModel.updateOne(
      { _id: (report as any)._id },
      { $set: { fondoCajaChicaId: fondo._id } }
    )

    void this.notifyViaticoCoordinator(
      report as ExpenseReportDocument,
      userId,
      clientId
    )

    return this.findOne(reportId) as Promise<ExpenseReportDocument>
  }

  async createViatico(dto: CreateViaticoExpenseReportDto, userId: string, clientId: string): Promise<ExpenseReportDocument> {
    const profile = await this.userService.findTransactionalProfile(userId)
    if (!profile?.signature?.trim()) {
      throw new ForbiddenException('Debe registrar su firma digital en el perfil antes de solicitar fondos.')
    }

    const chain = await this.buildSolicitudCostCenterChain(profile, dto.projectId, userId, clientId)

    // `dto.amount` es el costo del viático (suma de líneas). El saldo heredado NO se
    // suma al anticipo: prefinancia ese costo igual que un saldo de la bolsa.
    const { lineDocs, roundedSum, description } = await this.validateViaticoLines(
      { place: dto.place, startDate: dto.startDate, endDate: dto.endDate, projectId: dto.projectId, lines: dto.lines, observations: dto.observations, amount: dto.amount },
      clientId,
      profile.permitirFechasAnteriores === true
    )

    // Regla 1.6: si todos los niveles del centro de costo quedaron omitidos
    // (vacíos, o el creador era el único aprobador sin nivel superior), la
    // cadena queda vacía — la solicitud pasa directo al gate de Contabilidad
    // en vez de quedar en pending_l1 sin nadie que pueda avanzarla.
    const initialStatus = chain.length === 0 ? 'pending_contabilidad' : 'pending_l1'

    // Conversión del viático a la moneda base, congelada al crear la solicitud.
    // Es la tasa que después usan sus gastos para expresarse en la moneda del
    // viático: si se recalculara, una rendición ya liquidada cambiaría sola.
    const viaticoMoneda = normalizeMoneda(dto.moneda)
    const accountingConfig = await this.currencyService.getConfig(clientId)
    const conversion = await this.currencyService.toBase(
      roundedSum,
      viaticoMoneda,
      new Date(dto.startDate),
      accountingConfig
    )

    const report = await this.expenseReportModel.create({
      type: 'viatico',
      userId: new Types.ObjectId(userId),
      clientId: new Types.ObjectId(clientId),
      createdBy: new Types.ObjectId(userId),
      projectId: new Types.ObjectId(dto.projectId),
      description,
      status: initialStatus,
      expenseIds: [],
      budget: roundedSum,
      viaticoAmount: roundedSum,
      viaticoMoneda,
      viaticoMontoBase: conversion.montoBase,
      tipoCambio: conversion.tipoCambio,
      tcFecha: conversion.tcFecha,
      viaticoApproverChain: chain,
      viaticoRequiredLevels: chain.length,
      viaticoApprovalLevel: 0,
      viaticoApprovalHistory: [],
      viaticoSolicitudVersion: 1,
      viaticoBudgetCommitmentRecorded: false,
      viaticoPlace: dto.place.trim(),
      ...(dto.lat != null && { viaticoLat: dto.lat }),
      ...(dto.lng != null && { viaticoLng: dto.lng }),
      viaticoStartDate: new Date(dto.startDate),
      viaticoEndDate: new Date(dto.endDate),
      viaticoLines: lineDocs,
      viaticoObservations: dto.observations?.trim(),
      ...(dto.bankName?.trim() && { viaticoBankName: dto.bankName.trim() }),
      ...(dto.accountNumber?.trim() && { viaticoAccountNumber: dto.accountNumber.trim() }),
      ...(dto.cci?.trim() && { viaticoCci: dto.cci.trim() }),
      ...(dto.ordenTrabajoId && { viaticoOrdenTrabajoId: new Types.ObjectId(dto.ordenTrabajoId) }),
    })

    if (initialStatus === 'pending_contabilidad') {
      void this.notifyContabilidadPendingApproval(report as ExpenseReportDocument)
    } else {
      void this.notifyViaticoCoordinator(report as ExpenseReportDocument, userId, clientId)
    }

    return this.findOne(String((report as any)._id)) as Promise<ExpenseReportDocument>
  }

  /**
   * Notifica a los aprobadores de TODOS los pasos aún pendientes de
   * `viaticoApproverChain` (aprobación en paralelo entre niveles: N1/N2/N3
   * son accionables desde el envío, sin importar el orden). Se llama tanto al
   * crear la solicitud como tras cada aprobación intermedia, para reforzar el
   * aviso a quienes todavía no actuaron.
   */
  /**
   * La SOLICITUD de caja chica viaja como viático para reutilizar su flujo,
   * pero no vive donde viven los viáticos: el aprobador la atiende en la
   * pestaña de caja chica de /rendiciones y el responsable la sigue desde sus
   * rendiciones. Sin esto, los avisos del trámite llevaban a /viaticos, donde
   * la solicitud no aparece.
   */
  private esSolicitudCajaChica(report: any): boolean {
    return report?.isSolicitudCajaChica === true
  }

  /** Pantalla donde cada destinatario atiende la solicitud. */
  private solicitudAppPath(
    report: any,
    destino: 'aprobador' | 'solicitante'
  ): string {
    if (this.esSolicitudCajaChica(report)) {
      return destino === 'aprobador'
        ? '/rendiciones?tab=caja-chica'
        : '/mis-rendiciones?tab=caja-chica'
    }
    return destino === 'aprobador' ? '/viaticos' : '/mis-rendiciones'
  }

  /** Cómo se llama el trámite en los avisos. */
  private solicitudNombre(report: any): string {
    return this.esSolicitudCajaChica(report)
      ? 'solicitud de caja chica'
      : 'solicitud de fondos'
  }

  private async notifyViaticoCoordinator(report: ExpenseReportDocument, collaboratorUserId: string, clientId: string): Promise<void> {
    const reportId = String((report as any)._id)
    const collaborator = await this.userService.findEmailNameClient(collaboratorUserId)
    const pendingSteps = (report.viaticoApproverChain ?? []).filter(s => !s.approved)
    const approverIds = [
      ...new Map(
        pendingSteps.flatMap(s => s.approverIds).map(id => [id.toString(), id])
      ).values(),
    ]
    if (approverIds.length === 0) {
      await this.expenseReportModel.updateOne({ _id: (report as any)._id }, { $set: { viaticoCoordinatorNotification: { status: 'skipped', sentAt: new Date(), errorMessage: 'Sin aprobador asignado en este paso' } } })
      return
    }

    // Cualquiera de los aprobadores de cualquier paso pendiente puede actuar — se notifica a todos.
    for (const approverId of approverIds) {
      const approver = await this.userService.findEmailNameClient(approverId.toString())
      if (!approver || !collaborator) {
        await this.expenseReportModel.updateOne({ _id: (report as any)._id }, { $set: { viaticoCoordinatorNotification: { recipientUserId: approverId, status: 'skipped', sentAt: new Date(), errorMessage: 'Aprobador o colaborador no encontrado' } } })
        continue
      }
      if (approver.clientId && collaborator.clientId && approver.clientId.toString() !== collaborator.clientId.toString()) {
        await this.expenseReportModel.updateOne({ _id: (report as any)._id }, { $set: { viaticoCoordinatorNotification: { recipientUserId: approverId, status: 'skipped', sentAt: new Date(), errorMessage: 'Aprobador de distinta empresa' } } })
        continue
      }

      try {
        const esCaja = this.esSolicitudCajaChica(report)
        await this.notificationsService.create({ userId: approverId.toString(), title: esCaja ? 'Nueva solicitud de caja chica pendiente' : 'Nueva solicitud de fondos pendiente', message: `${collaborator.name} envió una ${this.solicitudNombre(report)} — ${this.viaticoMoneySymbol(report.viaticoMoneda)} ${this.viaticoFormatMoney(esCaja ? (report.cajaChicaNuevoPresupuesto ?? report.viaticoAmount ?? 0) : (report.viaticoAmount ?? 0))}. Ingresa a revisarla.`, type: 'info', actionUrl: this.solicitudAppPath(report, 'aprobador'), metadata: { reportId, collaboratorUserId, event: 'viatico_submitted' } })
      } catch (err: unknown) { this.logger.error(`In-app notif viático ${reportId}: ${err instanceof Error ? err.message : String(err)}`) }

      const approverEmailEnabled = await this.userService.isEmailEnabled(approverId.toString())
      if (!approverEmailEnabled) {
        await this.expenseReportModel.updateOne({ _id: (report as any)._id }, { $set: { viaticoCoordinatorNotification: { recipientUserId: approverId, status: 'skipped', sentAt: new Date(), errorMessage: 'Notificaciones por correo deshabilitadas' } } })
        continue
      }

      try {
        const project = await this.projectService.findOne(report.projectId!.toString(), clientId)
        const projectLabel = `[${project.code} - ${project.name}]`
        const startStr = report.viaticoStartDate instanceof Date ? report.viaticoStartDate.toISOString().slice(0, 10) : String(report.viaticoStartDate ?? '').slice(0, 10)
        const endStr = report.viaticoEndDate instanceof Date ? report.viaticoEndDate.toISOString().slice(0, 10) : String(report.viaticoEndDate ?? '').slice(0, 10)
        await this.emailService.sendViaticoSolicitudToCoordinator(approver.email, {
          clientId, coordinatorName: approver.name, collaboratorName: collaborator.name,
          place: report.viaticoPlace ?? '', startDate: startStr, endDate: endStr,
          totalFormatted: this.viaticoFormatMoney(report.viaticoAmount ?? 0),
          currencySymbol: this.viaticoMoneySymbol(report.viaticoMoneda),
          projectLabel,
          platformUrl: this.emailService.buildAppUrl(
            this.solicitudAppPath(report, 'aprobador')
          ),
        })
        await this.expenseReportModel.updateOne({ _id: (report as any)._id }, { $set: { viaticoCoordinatorNotification: { recipientUserId: approverId, status: 'sent', sentAt: new Date() } } })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.error(`Correo aprobador viático ${reportId}: ${msg}`)
        await this.expenseReportModel.updateOne({ _id: (report as any)._id }, { $set: { viaticoCoordinatorNotification: { recipientUserId: approverId, status: 'failed', sentAt: new Date(), errorMessage: msg } } })
      }
    }
  }

  /**
   * Aprueba UN paso de la cadena de aprobadores del viático (regla 1.3).
   * Aprobación en paralelo entre niveles: cualquier aprobador de cualquier
   * paso aún pendiente puede actuar, sin importar el orden, o
   * Superadministrador (llave maestra). Cuando TODOS los pasos quedan
   * aprobados, la solicitud pasa a la espera de Contabilidad.
   */
  async approveViatico(id: string, opts: { approvedBy: string; notes?: string }, actorId: string, actorRole: string): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Solicitud de Fondos ${id} no encontrada`)
    if (report.type !== 'viatico') throw new BadRequestException('Esta rendición no es de tipo solicitud de fondos')
    if (report.status !== 'pending_l1') throw new BadRequestException(`La solicitud de fondos no está pendiente de aprobación (estado actual: ${report.status})`)

    const chain = report.viaticoApproverChain ?? []
    const stepIndex = findActionableChainStep({ chain, actorId, actorRole })
    if (stepIndex === -1) {
      throw new ForbiddenException('No te corresponde aprobar esta solicitud en este momento')
    }

    const step = chain[stepIndex]
    const approvalLevel = report.viaticoApprovalLevel ?? 0
    ;(report.viaticoApprovalHistory ?? []).push({ level: step.level, approvedBy: opts.approvedBy, action: 'approved', notes: opts.notes, date: new Date() })
    chain[stepIndex] = {
      ...plainChainStep(step),
      approved: true,
      approvedBy: new Types.ObjectId(actorId),
      approvedAt: new Date(),
    }
    report.viaticoApproverChain = chain
    const nextLevel = approvalLevel + 1
    const isComplete = isChainFullyApproved(chain)
    report.viaticoApprovalLevel = nextLevel

    if (isComplete) {
      // Todos los aprobadores de centro de costo terminaron: siempre pasa por el
      // gate de Contabilidad antes de quedar lista para pago (aplica incluso si
      // el viático quedó 100% cubierto por saldo, sin desembolso real).
      report.status = 'pending_contabilidad'
      await report.save()
      this.notificationsService.create({ userId: report.userId.toString(), title: 'Solicitud de Fondos en aprobación final', message: `Tu solicitud por ${this.viaticoMoneySymbol(report.viaticoMoneda)} ${this.viaticoFormatMoney(report.viaticoAmount ?? 0)} fue aprobada por los centros de costo y está pendiente de la aprobación final de Contabilidad.`, type: 'info', actionUrl: '/mis-rendiciones' }).catch(() => {})
      await this.notifyContabilidadPendingApproval(report as ExpenseReportDocument)
    } else {
      await report.save()
      this.notificationsService.create({ userId: report.userId.toString(), title: 'Solicitud de Fondos en revisión', message: `Tu solicitud por ${this.viaticoMoneySymbol(report.viaticoMoneda)} ${this.viaticoFormatMoney(report.viaticoAmount ?? 0)} fue aprobada por uno de sus aprobadores (${nextLevel} de ${report.viaticoRequiredLevels ?? chain.length}) y está pendiente de los demás niveles.`, type: 'info', actionUrl: '/mis-rendiciones' }).catch(() => {})
      this.notifyViaticoCoordinator(report as ExpenseReportDocument, report.userId.toString(), report.clientId.toString()).catch(() => {})
    }

    return this.findOne(id) as Promise<ExpenseReportDocument>
  }

  /**
   * Aprueba UN paso de la cadena de aprobación de la RENDICIÓN a nivel de
   * reporte (regla 1.4, fase post-pago del viático). Aprobación en paralelo
   * entre niveles: cualquier aprobador de un paso aún pendiente puede actuar
   * (N2 puede aprobar antes que N1), o Superadmin. Cuando TODOS los pasos quedan
   * aprobados, la rendición pasa a Contabilidad (`pending_accounting`). Espejo
   * de `approveViatico`.
   */
  async approveRendicion(
    id: string,
    opts: { approvedBy: string; notes?: string },
    actorId: string,
    actorRole: string
  ): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Rendición ${id} no encontrada`)
    if (report.status !== 'submitted') {
      throw new BadRequestException(
        `La rendición no está enviada, no se puede aprobar (estado actual: ${report.status}).`
      )
    }
    const chain = report.rendicionApproverChain ?? []
    if (chain.length === 0) {
      throw new BadRequestException(
        'Esta rendición no tiene una cadena de aprobación a nivel de reporte.'
      )
    }
    const stepIndex = findActionableChainStep({ chain, actorId, actorRole })
    if (stepIndex === -1) {
      throw new ForbiddenException(
        'No te corresponde aprobar esta rendición en este momento'
      )
    }

    const step = chain[stepIndex]
    const approvalLevel = report.rendicionApprovalLevel ?? 0
    ;(report.rendicionApprovalHistory ?? []).push({
      level: step.level,
      approvedBy: opts.approvedBy,
      action: 'approved',
      notes: opts.notes,
      date: new Date(),
    })
    chain[stepIndex] = {
      ...plainChainStep(step),
      approved: true,
      approvedBy: new Types.ObjectId(actorId),
      approvedAt: new Date(),
    }
    report.rendicionApproverChain = chain
    const nextLevel = approvalLevel + 1
    report.rendicionApprovalLevel = nextLevel
    const isComplete = isChainFullyApproved(chain)

    if (isComplete) {
      // Todos los aprobadores del centro de costo terminaron → la rendición pasa
      // al gate de Contabilidad (igual que el clic único anterior, pero ahora
      // exige la cadena completa antes de llegar aquí).
      report.status = 'pending_accounting'
      report.coordinatorApprovedAt = new Date()
      report.coordinatorApprovedBy = new Types.ObjectId(actorId)
      await report.save()
      const fresh = (await this.findOne(id)) as ExpenseReportDocument
      await this.notifyAccountingReportPendingApproval(id, fresh).catch(() => {})
      this.notificationsService
        .create({
          userId: report.userId.toString(),
          title: 'Rendición aprobada',
          message:
            'Tu rendición fue aprobada por los aprobadores del centro de costo y está pendiente de la aprobación final de Contabilidad.',
          type: 'info',
          actionUrl: `/mis-rendiciones/${id}/detalle`,
        })
        .catch(() => {})
      return fresh
    }

    await report.save()
    this.notificationsService
      .create({
        userId: report.userId.toString(),
        title: 'Rendición en revisión',
        message: `Tu rendición fue aprobada por uno de sus aprobadores (nivel ${nextLevel} de ${report.rendicionRequiredLevels ?? chain.length}) y está pendiente de los demás.`,
        type: 'info',
        actionUrl: `/mis-rendiciones/${id}/detalle`,
      })
      .catch(() => {})
    return this.findOne(id) as Promise<ExpenseReportDocument>
  }

  /**
   * VD-87: cuando los aprobadores completan la aprobación de TODOS los gastos
   * individuales (cadena de centro de costo de cada comprobante), la rendición
   * pasa automáticamente a Contabilidad (`pending_accounting`) y se avisa a
   * Contabilidad por correo — sin el paso extra de "aprobar la rendición
   * completa" (antes se requería una segunda ronda de aprobadores + contabilidad).
   * Lo llaman `ExpenseService.approveByCoord` tras aprobar cada comprobante y
   * `update()` al enviar la rendición (ver ahí por qué el segundo punto es
   * imprescindible y no una redundancia).
   * Idempotente: solo actúa si el reporte sigue en `submitted`, hay al menos un
   * comprobante, NINGUNO está observado (rechazado) y TODOS están aprobados por
   * su cadena. Si queda un comprobante rechazado, la rendición espera a que el
   * colaborador lo corrija (no avanza a Contabilidad con observaciones pendientes).
   * La cadena a nivel de reporte del viático no bloquea el avance: se sella con
   * estas mismas aprobaciones (ver abajo).
   *
   * Devuelve `true` solo si ESTA llamada movió la rendición a Contabilidad, para
   * que el llamador ajuste sus notificaciones (no tiene sentido avisar a los
   * aprobadores de una rendición que ya pasó de largo).
   */
  async advanceToAccountingIfAllExpensesApproved(
    reportId: string
  ): Promise<boolean> {
    const report = await this.expenseReportModel
      .findById(reportId)
      .select(
        'status expenseIds userId rendicionApproverChain rendicionApprovalLevel rendicionApprovalHistory'
      )
      .exec()
    if (!report || report.status !== 'submitted') return false

    const expenseIds = (report.expenseIds ?? []).map((x: any) =>
      x && typeof x === 'object' && '_id' in x ? x._id : x
    )
    if (!expenseIds.length) return false

    const expenses = await this.expenseModel
      .find({ _id: { $in: expenseIds } })
      .select('status approverChain approvalLevel requiredLevels')
      .lean<
        {
          status?: string
          approverChain?: unknown[]
          approvalLevel?: number
          requiredLevels?: number
        }[]
      >()
      .exec()

    // No avanzar a Contabilidad mientras haya un comprobante observado sin
    // corregir: la rendición debe completar su revisión de aprobadores primero
    // (el rechazo de un aprobador es por comprobante y la deja en `submitted`;
    // el colaborador corrige y se re-aprueba antes de pasar a Contabilidad).
    const hasRejected = expenses.some(
      e => String(e.status ?? '').toLowerCase() === 'rejected'
    )
    if (hasRejected) return false

    const active = expenses.filter(e => e.status !== 'rejected')
    if (active.length === 0) return false

    // Un comprobante está aprobado por los aprobadores cuando su cadena de
    // centro de costo se completó (mismo criterio que `chainCoordStatus`):
    // approverChain definida y approvalLevel >= niveles requeridos.
    const coordApproved = (e: {
      approverChain?: unknown[]
      approvalLevel?: number
      requiredLevels?: number
    }): boolean => {
      if (e.approverChain === undefined) return false
      const required = e.requiredLevels ?? e.approverChain.length ?? 0
      return (e.approvalLevel ?? 0) >= required
    }
    if (!active.every(coordApproved)) return false

    // La cadena a nivel de reporte del viático (N1/N2 del centro de costo, ver
    // `approveRendicion`) la firman los MISMOS aprobadores que acaban de
    // pronunciarse comprobante por comprobante, y desde VD-87 ya no existe el
    // botón "Aprobar Rendición" con el que la completaban. Bloquear el avance
    // mientras siguiera pendiente dejaba a TODA rendición de viático atascada
    // en `submitted` de forma definitiva: nadie tenía cómo cerrar esa cadena y
    // Contabilidad solo puede actuar desde `pending_accounting`. Se da por
    // cumplida con esas aprobaciones y se sella aquí — ya con la certeza de que
    // ningún comprobante quedó sin aprobar — para que el detalle y el historial
    // no muestren pendiente la cadena de una rendición que ya está en
    // Contabilidad.
    const reportChain = (report.rendicionApproverChain ?? []) as ChainStep[]
    if (reportChain.length > 0 && !isChainFullyApproved(reportChain)) {
      // Quién firma cada nivel sale de las cadenas de los comprobantes: son los
      // aprobadores que realmente aprobaron ese nivel, no un sello anónimo.
      const approverByLevel = new Map<number, Types.ObjectId>()
      for (const e of expenses) {
        for (const step of (e.approverChain ?? []) as ChainStep[]) {
          if (step.approved && step.approvedBy && !approverByLevel.has(step.level)) {
            approverByLevel.set(
              step.level,
              new Types.ObjectId(String(step.approvedBy))
            )
          }
        }
      }
      const sealedAt = new Date()
      const history = report.rendicionApprovalHistory ?? []
      report.rendicionApproverChain = reportChain.map(step => {
        if (step.approved) return step
        const approvedBy = approverByLevel.get(step.level)
        history.push({
          level: step.level,
          approvedBy: String(approvedBy ?? ''),
          action: 'approved',
          notes: 'Aprobada al quedar aprobados todos sus comprobantes.',
          date: sealedAt,
        })
        return {
          ...plainChainStep(step),
          approved: true,
          approvedBy,
          approvedAt: sealedAt,
        }
      })
      report.rendicionApprovalHistory = history
      report.rendicionApprovalLevel = reportChain.length
    }

    // Todos los gastos aprobados por los aprobadores → gate de Contabilidad.
    report.status = 'pending_accounting'
    ;(report as any).coordinatorApprovedAt = new Date()
    await report.save()

    const fresh = (await this.findOne(reportId)) as ExpenseReportDocument
    await this.notifyAccountingReportPendingApproval(reportId, fresh).catch(
      () => {}
    )
    return true
  }

  /**
   * Contabilidad observó un comprobante en su aprobación final: se devuelve TODA
   * la rendición al colaborador (`rejected`) y se resetean los comprobantes a
   * estado normal para que pueda corregirlos y se re-aprueben desde cero.
   *
   * Por qué el reset total: un comprobante `approved` queda bloqueado de por vida
   * para el colaborador (ver `ExpenseService.assertCanEdit`), y uno con aprobación
   * parcial tampoco es editable mientras la rendición esté en revisión. Sin
   * resetear, el colaborador no podría corregir la rendición devuelta. El
   * comprobante observado conserva su estado `rejected` + motivo para que sepa
   * cuál corregir. Lo llama `ExpenseService.rejectByContabilidad`.
   */
  async returnToCollaboratorOnAccountingRejection(
    reportId: string,
    rejectedExpenseId: string,
    reason: string
  ): Promise<void> {
    const report = await this.expenseReportModel.findById(reportId)
    if (!report) return
    // Solo aplica mientras la rendición está en revisión (contabilidad, o por si
    // acaso aprobadores). En otros estados no se toca.
    if (
      report.status !== 'pending_accounting' &&
      report.status !== 'submitted'
    ) {
      return
    }

    const expenseIds = (report.expenseIds ?? []).map((x: any) =>
      x && typeof x === 'object' && '_id' in x ? String(x._id) : String(x)
    )
    const expenses = await this.expenseModel
      .find({ _id: { $in: expenseIds } })
      .select('approverChain')
      .lean<{ _id: Types.ObjectId; approverChain?: ChainStep[] }[]>()
      .exec()

    for (const e of expenses) {
      const isRejected = String(e._id) === String(rejectedExpenseId)
      // Reset de la cadena de aprobadores en TODOS: cualquier edición posterior
      // debe re-aprobarse sobre el dato corregido (sin dejar aprobaciones stale).
      const clearedChain = (e.approverChain ?? []).map(step => ({
        ...plainChainStep(step),
        approved: false,
        approvedBy: undefined,
        approvedAt: undefined,
      }))
      const set: Record<string, unknown> = {
        approverChain: clearedChain,
        approvalLevel: 0,
      }
      if (!isRejected) {
        // Los demás vuelven a 'pending' (editables y re-aprobables desde cero).
        set.contabilidadStatus = 'pending'
        set.contabilidadApprovedBy = undefined
        set.contabilidadApprovedAt = undefined
        set.contabilidadRejectionReason = ''
        set.status = 'pending'
        set.rejectionReason = ''
        set.rejectedBy = ''
      }
      // El observado conserva contabilidadStatus='rejected'/status='rejected' + motivo.
      await this.expenseModel.updateOne({ _id: e._id }, { $set: set })
    }

    report.status = 'rejected'
    report.rejectionReason = reason.trim()
    ;(report as any).rejectedByRole = 'contabilidad'
    await report.save()

    // Rechazo de la rendición COMPLETA: Contabilidad observó un comprobante y
    // devolvió toda la rendición → avisar al colaborador (in-app + correo).
    try {
      const ownerId = report.userId.toString()
      this.notificationsService
        .create({
          userId: ownerId,
          title: 'Rendición rechazada',
          message: `Tu rendición fue rechazada por Contabilidad: ${reason.trim().slice(0, 80)}`,
          type: 'error',
          actionUrl: `/mis-rendiciones/${reportId}/detalle`,
        })
        .catch(() => { })
      const owner = await this.userService.findEmailNameClient(ownerId)
      const ownerEmailEnabled = await this.userService.isEmailEnabled(ownerId)
      if (owner?.email && ownerEmailEnabled) {
        await this.emailService.sendRendicionRechazadaColaborador(owner.email, {
          clientId: report.clientId.toString(),
          collaboratorName: owner.name,
          reportTitle: this.resolveReportTitle(report),
          rejectionReason: reason.trim(),
          rejectedBy: 'Contabilidad',
          platformUrl: this.emailService.buildAppUrl(
            `/mis-rendiciones/${reportId}/detalle`
          ),
        })
      }
    } catch (err) {
      console.error(
        `[returnToCollaboratorOnAccountingRejection] Error correo rechazo ${reportId}:`,
        err
      )
    }
  }

  /**
   * Al aprobar la RENDICIÓN completa, Contabilidad aprueba de una todos sus
   * comprobantes (contabilidad aprueba a nivel de rendición, no gasto por gasto).
   * Marca los comprobantes NO rechazados como aprobados por Contabilidad para que
   * dejen de mostrarse "Pendiente Contabilidad" (y desaparezcan sus botones ✓/✗)
   * una vez aprobada la rendición. Los rechazados no deberían existir aquí
   * (assertNoRejectedExpenses lo garantiza), pero se excluyen por seguridad.
   */
  private async markReportExpensesAccountingApproved(
    reportId: string,
    actorId?: string
  ): Promise<void> {
    const report = await this.expenseReportModel
      .findById(reportId)
      .select('expenseIds')
      .lean()
      .exec()
    const ids = ((report as any)?.expenseIds ?? []).map((x: any) =>
      x && typeof x === 'object' && '_id' in x ? x._id : x
    )
    if (!ids.length) return
    const set: Record<string, unknown> = {
      contabilidadStatus: 'approved',
      contabilidadApprovedAt: new Date(),
      status: 'approved',
    }
    if (actorId) set.contabilidadApprovedBy = new Types.ObjectId(actorId)
    await this.expenseModel.updateMany(
      { _id: { $in: ids }, status: { $ne: 'rejected' } },
      { $set: set }
    )
  }

  /**
   * Rechaza la RENDICIÓN a nivel de reporte. Aprobación en paralelo: cualquier
   * aprobador de un paso aún pendiente puede rechazar todo el reporte (o
   * Admin/Contabilidad/Superadmin si no hay cadena). Espejo de `rejectByCoord`.
   */
  async rejectRendicion(
    id: string,
    opts: { rejectedBy: string; rejectionReason: string },
    actorId: string,
    actorRole: string
  ): Promise<ExpenseReportDocument> {
    if (!opts.rejectionReason?.trim()) {
      throw new BadRequestException('El motivo de rechazo es obligatorio.')
    }
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Rendición ${id} no encontrada`)
    if (report.status !== 'submitted') {
      throw new BadRequestException(
        `La rendición no está enviada, no se puede rechazar (estado actual: ${report.status}).`
      )
    }
    const chain = report.rendicionApproverChain ?? []
    const isAdminOverride = [
      ROLES.SUPER_ADMIN,
      ROLES.ADMIN,
      ROLES.CONTABILIDAD,
    ].includes(actorRole as any)
    let rejectedAtLevel = (report.rendicionApprovalLevel ?? 0) + 1
    if (chain.length > 0) {
      const stepIndex = findActionableChainStep({ chain, actorId, actorRole })
      if (stepIndex === -1) {
        throw new ForbiddenException(
          'No te corresponde rechazar esta rendición en este momento'
        )
      }
      rejectedAtLevel = chain[stepIndex].level
    } else if (!isAdminOverride) {
      throw new ForbiddenException(
        'No te corresponde rechazar esta rendición en este momento'
      )
    }
    ;(report.rendicionApprovalHistory ?? []).push({
      level: rejectedAtLevel,
      approvedBy: opts.rejectedBy,
      action: 'rejected',
      notes: opts.rejectionReason.trim(),
      date: new Date(),
    })
    report.status = 'rejected'
    report.rejectionReason = opts.rejectionReason.trim()
    report.rejectedByRole = 'coordinador'
    await report.save()
    this.notificationsService
      .create({
        userId: report.userId.toString(),
        title: 'Rendición observada',
        message: `Tu rendición fue rechazada por un aprobador: ${opts.rejectionReason.slice(0, 80)}`,
        type: 'error',
        actionUrl: `/mis-rendiciones/${id}/detalle`,
      })
      .catch(() => {})

    // Correo al colaborador SOLO cuando se rechaza la rendición COMPLETA (este
    // path). El rechazo por comprobante (`rejectByCoord`) queda solo in-app para
    // no spamear.
    try {
      const owner = await this.userService.findEmailNameClient(
        report.userId.toString()
      )
      const ownerEmailEnabled = await this.userService.isEmailEnabled(
        report.userId.toString()
      )
      if (owner?.email && ownerEmailEnabled) {
        await this.emailService.sendRendicionRechazadaColaborador(owner.email, {
          clientId: report.clientId.toString(),
          collaboratorName: owner.name,
          reportTitle: this.resolveReportTitle(report),
          rejectionReason: opts.rejectionReason.trim(),
          rejectedBy: 'los aprobadores',
          platformUrl: this.emailService.buildAppUrl(
            `/mis-rendiciones/${id}/detalle`
          ),
        })
      }
    } catch (err) {
      console.error(
        `[rejectRendicion] Error correo rechazo a colaborador ${id}:`,
        err
      )
    }

    return this.findOne(id) as Promise<ExpenseReportDocument>
  }

  /**
   * Campos del bloque «Detalles rápidos» de los correos de viático, para que
   * Contabilidad/Tesorería reciban el mismo detalle (centro de costo, lugar,
   * fechas, monto) que el aprobador — antes solo se les mandaba una frase
   * suelta en `detailBody` y el correo salía sin datos.
   */
  private async buildViaticoDetalleRapido(
    report: ExpenseReportDocument
  ): Promise<{
    collaboratorName: string
    place: string
    startDate: string
    endDate: string
    totalFormatted: string
    currencySymbol: string
    projectLabel: string
  }> {
    const collaborator = await this.userService.findEmailNameClient(
      report.userId.toString()
    )
    let projectLabel = ''
    if (report.projectId) {
      try {
        const project = await this.projectService.findOne(
          report.projectId.toString(),
          report.clientId.toString()
        )
        if (project) projectLabel = `${project.code} - ${project.name}`
      } catch {
        // Centro de costo borrado o inaccesible: el correo sale sin la fila.
      }
    }
    const toIsoDay = (v: unknown): string =>
      v instanceof Date
        ? v.toISOString().slice(0, 10)
        : String(v ?? '').slice(0, 10)
    return {
      collaboratorName: collaborator?.name ?? '',
      place: report.viaticoPlace ?? '',
      startDate: toIsoDay(report.viaticoStartDate),
      endDate: toIsoDay(report.viaticoEndDate),
      totalFormatted: this.viaticoFormatMoney(report.viaticoAmount ?? 0),
      currencySymbol: this.viaticoMoneySymbol(report.viaticoMoneda),
      projectLabel,
    }
  }

  /** Notifica a Contabilidad que un viático terminó su cadena de centro de costo y espera su aprobación final. */
  private async notifyContabilidadPendingApproval(report: ExpenseReportDocument): Promise<void> {
    try {
      const recipients = await this.userService.findViaticoAccountingNotifyRecipients(report.clientId.toString())
      const detalle = await this.buildViaticoDetalleRapido(report)
      for (const r of recipients) {
        await this.emailService.sendViaticoAprobacionContabilidad(r.email, {
          clientId: report.clientId.toString(), recipientName: r.name, urgent: false, urgentBanner: '',
          emailTitle: this.esSolicitudCajaChica(report)
            ? 'Solicitud de caja chica pendiente de tu aprobación'
            : 'Solicitud de Fondos pendiente de tu aprobación',
          intro: 'La solicitud fue aprobada por los aprobadores y requiere tu aprobación final antes de quedar lista para pago.',
          ...detalle,
          platformUrl: this.emailService.buildAppUrl(
            this.solicitudAppPath(report, 'aprobador')
          ),
        }).catch(() => {})
      }
    } catch (err: unknown) {
      this.logger.error(`Notificación Contabilidad pendiente viático ${(report as any)._id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Gate final: Contabilidad aprueba una solicitud de viático que ya completó
   * su cadena de aprobadores de centro de costo. Solo entonces se registra el
   * compromiso presupuestal y se notifica a Tesorería para el pago.
   */
  async approveViaticoContabilidad(id: string, opts: { approvedBy: string; notes?: string }, actorId: string, actorRole: string): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Solicitud de Fondos ${id} no encontrada`)
    if (report.type !== 'viatico') throw new BadRequestException('Esta rendición no es de tipo solicitud de fondos')
    if (report.status !== 'pending_contabilidad') throw new BadRequestException(`La solicitud de fondos no está pendiente de la aprobación de Contabilidad (estado actual: ${report.status})`)
    if (actorRole !== ROLES.CONTABILIDAD && actorRole !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('Solo Contabilidad puede aprobar este paso.')
    }

    const chainLevels = report.viaticoRequiredLevels ?? report.viaticoApproverChain?.length ?? 0
    ;(report.viaticoApprovalHistory ?? []).push({ level: chainLevels + 1, approvedBy: opts.approvedBy, action: 'approved', notes: opts.notes, date: new Date() })
    // Campos propios de la SOLICITUD — no usar contabilidadApprovedAt/By: esos
    // pertenecen a la aprobación de la RENDICIÓN de comprobantes (regla 1.4,
    // posterior al pago) y se pisarían entre sí.
    report.viaticoSolicitudContabilidadApprovedAt = new Date()
    report.viaticoSolicitudContabilidadApprovedBy = new Types.ObjectId(actorId)
    report.status = 'viatico_approved'
    await report.save()

    // Solicitud de caja chica que BAJA el presupuesto: no hay nada que
    // depositar, así que no tiene sentido dejarla esperando a Tesorería. El
    // ajuste se aplica acá y el sobrante queda pendiente de devolución.
    if (
      report.isSolicitudCajaChica &&
      Number(report.viaticoAmount ?? 0) <= 0 &&
      report.fondoCajaChicaId
    ) {
      try {
        await this.fondoCajaChicaService.ajustarPresupuesto(
          String(report.fondoCajaChicaId),
          Number(report.cajaChicaNuevoPresupuesto ?? 0),
          String(report.userId),
          `Solicitud ${String((report as any)._id)}`
        )
        report.status = 'paid'
        await report.save()
      } catch (err: unknown) {
        this.logger.error(
          `No se pudo ajustar el presupuesto de caja chica de la solicitud ${id}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      return this.findOne(id) as Promise<ExpenseReportDocument>
    }

    const autoOpenedBySaldo = await this.onViaticoFullyApproved(report as ExpenseReportDocument)

    if (!autoOpenedBySaldo) {
      this.notificationsService.create({ userId: report.userId.toString(), title: 'Solicitud de Fondos aprobada', message: `Tu solicitud por ${this.viaticoMoneySymbol(report.viaticoMoneda)} ${this.viaticoFormatMoney(report.viaticoAmount ?? 0)} fue aprobada. El pago está siendo procesado.`, type: 'success', actionUrl: '/mis-rendiciones' }).catch(() => {})
    }

    return this.findOne(id) as Promise<ExpenseReportDocument>
  }

  /** Devuelve `true` si el viático quedó cubierto 100% con saldo y se abrió sin pago. */
  private async onViaticoFullyApproved(report: ExpenseReportDocument): Promise<boolean> {
    if (report.projectId && !report.viaticoBudgetCommitmentRecorded) {
      try {
        await this.projectService.adjustCommittedAdvanceTotal(report.projectId.toString(), report.clientId.toString(), report.viaticoAmount ?? 0)
        await this.expenseReportModel.updateOne({ _id: (report as any)._id }, { $set: { viaticoBudgetCommitmentRecorded: true } })
      } catch (err: unknown) { this.logger.error(`Compromiso presupuestal viático ${(report as any)._id}: ${err instanceof Error ? err.message : String(err)}`) }
    }
    // A Contabilidad NO se le avisa aquí: este método solo corre desde
    // `approveViaticoContabilidad`, es decir, justo después de que Contabilidad
    // aprobó la solicitud. Enviarle un «Solicitud de viáticos aprobada» sería
    // notificarle su propia acción. El aviso accionable es el de Tesorería, que
    // va a continuación.

    // Notificar a tesorería con datos de pago del colaborador
    try {
      const reportId = String((report as any)._id)
      const clientIdStr = report.clientId.toString()
      console.log(`[TESORERÍA VIÁTICO] Buscando usuarios de tesorería para clientId=${clientIdStr}, reportId=${reportId}`)
      const tesoreriaRecipients = await this.userService.findTesoreriaNotifyRecipients(clientIdStr)
      const tesoreriaEmails = tesoreriaRecipients.map(r => r.email)
      console.log(`[TESORERÍA VIÁTICO] Emails de tesorería: ${JSON.stringify(tesoreriaEmails)}`)
      if (tesoreriaEmails.length > 0) {
        const collab = await this.userService.findOne(report.userId.toString())
        // Prefer bank data from the solicitud itself; fall back to user profile.
        const requestBank = report.viaticoAccountNumber?.trim()
          ? { bankName: report.viaticoBankName, accountNumber: report.viaticoAccountNumber, cci: report.viaticoCci, accountType: undefined as string | undefined }
          : null
        const profileBank = collab?.bankAccount ?? null
        const bank = requestBank ?? profileBank
        const hasBankAccount = !!(bank?.accountNumber)
        console.log(`[TESORERÍA VIÁTICO] colaborador=${collab?.name}, hasBankAccount=${hasBankAccount}, source=${requestBank ? 'solicitud' : 'perfil'}`)

        let projectLabel: string | undefined
        if (report.projectId) {
          try {
            const proj = await this.projectService.findOne(report.projectId.toString(), clientIdStr)
            projectLabel = `${proj.code ?? '—'} - ${proj.name ?? '—'}`
          } catch { /* proyecto opcional */ }
        }

        const platformUrl = this.emailService.buildAppUrl('/tesoreria')
        for (const tesoEmail of tesoreriaEmails) {
          console.log(`[TESORERÍA VIÁTICO] Enviando a ${tesoEmail}...`)
          await this.emailService.sendViaticoAprobadoTesoreria(tesoEmail, {
            clientId: clientIdStr,
            advanceDescription: report.viaticoPlace ?? report.title ?? 'Solicitud de Fondos',
            collaboratorName: collab?.name ?? 'Colaborador',
            collaboratorDni: collab?.dni,
            budgetFormatted: Number(report.viaticoAmount ?? 0).toFixed(2),
            currencySymbol: this.viaticoMoneySymbol(report.viaticoMoneda),
            projectLabel,
            hasBankAccount,
            bankName: bank?.bankName || undefined,
            accountType: (bank as any)?.accountType === 'ahorros' ? 'Ahorros' : (bank as any)?.accountType === 'corriente' ? 'Corriente' : undefined,
            accountNumber: bank?.accountNumber || undefined,
            cci: bank?.cci || undefined,
            platformUrl,
          })
          console.log(`[TESORERÍA VIÁTICO] Enviado a ${tesoEmail} OK`)
        }
      }
    } catch (err: unknown) {
      console.error(`[TESORERÍA VIÁTICO] ERROR:`, err)
    }

    return false
  }

  async rejectViatico(id: string, opts: { rejectedBy: string; rejectionReason: string }, actorId: string, actorRole: string): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Solicitud de Fondos ${id} no encontrada`)
    if (report.type !== 'viatico') throw new BadRequestException('Esta rendición no es de tipo solicitud de fondos')
    if (!['pending_l1', 'pending_contabilidad'].includes(report.status)) {
      throw new BadRequestException(`No se puede rechazar en estado "${report.status}"`)
    }

    let rejectedByRole: 'centro_costo' | 'contabilidad'
    let rejectedAtLevel = (report.viaticoApprovalLevel ?? 0) + 1
    if (report.status === 'pending_contabilidad') {
      if (actorRole !== ROLES.CONTABILIDAD && actorRole !== ROLES.SUPER_ADMIN) {
        throw new ForbiddenException('No tienes permiso para rechazar esta solicitud')
      }
      rejectedByRole = 'contabilidad'
    } else {
      // Aprobación en paralelo: cualquier aprobador de un paso aún pendiente
      // puede rechazar la solicitud completa — no solo "el turno actual".
      const chain = report.viaticoApproverChain ?? []
      const stepIndex = findActionableChainStep({ chain, actorId, actorRole })
      if (stepIndex === -1) {
        throw new ForbiddenException('No tienes permiso para rechazar esta solicitud')
      }
      rejectedAtLevel = chain[stepIndex].level
      rejectedByRole = 'centro_costo'
    }

    if ((opts.rejectionReason?.trim() ?? '').length < 10) throw new BadRequestException('El motivo de rechazo debe tener al menos 10 caracteres.')

    ;(report.viaticoApprovalHistory ?? []).push({ level: rejectedAtLevel, approvedBy: opts.rejectedBy, action: 'rejected', notes: opts.rejectionReason, date: new Date() })
    report.status = 'rejected'
    report.viaticoRejectedBy = opts.rejectedBy
    report.viaticoRejectionReason = opts.rejectionReason
    report.viaticoRejectedByRole = rejectedByRole
    await report.save()

    this.notificationsService.create({ userId: report.userId.toString(), title: this.esSolicitudCajaChica(report) ? 'Solicitud de caja chica rechazada' : 'Solicitud de Fondos rechazada', message: `Tu ${this.solicitudNombre(report)} por ${this.viaticoMoneySymbol(report.viaticoMoneda)} ${this.viaticoFormatMoney(this.esSolicitudCajaChica(report) ? (report.cajaChicaNuevoPresupuesto ?? report.viaticoAmount ?? 0) : (report.viaticoAmount ?? 0))} fue rechazada. Motivo: ${opts.rejectionReason}`, type: 'error', actionUrl: this.solicitudAppPath(report, 'solicitante') }).catch(() => {})

    const collaborator = await this.userService.findEmailNameClient(report.userId.toString())
    if (collaborator?.email && await this.userService.isEmailEnabled(report.userId.toString())) {
      this.emailService.sendViaticoRechazoColaborador(collaborator.email, {
        clientId: report.clientId.toString(), collaboratorName: collaborator.name,
        collaboratorDocument: '', collaboratorArea: '', collaboratorCargo: '',
        projectLabel: '', rejectionReason: opts.rejectionReason,
        platformUrl: this.emailService.buildAppUrl(
          this.solicitudAppPath(report, 'solicitante')
        ),
      }).catch(() => {})
    }

    return this.findOne(id) as Promise<ExpenseReportDocument>
  }

  /**
   * @removed approveDirecta/rejectDirecta/notifyDirectaCoordinator — la
   * aprobación de rendición directa ya no vive a nivel de reporte: usa la
   * misma cadena por comprobante que la rendición normal (ver
   * `buildExpenseChains` y `ExpenseService.approveByCoord/rejectByCoord`).
   */

  async resubmitViatico(id: string, dto: ResubmitViaticoDto, actingUserId: string, clientId: string): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Solicitud de Fondos ${id} no encontrada`)
    if (report.type !== 'viatico') throw new BadRequestException('Esta rendición no es de tipo solicitud de fondos')
    if (!['rejected', 'pending_l1'].includes(report.status)) throw new BadRequestException('Solo pueden reenviarse solicitudes rechazadas o pendientes de aprobación.')
    if (report.userId.toString() !== actingUserId) throw new ForbiddenException('Solo el colaborador solicitante puede corregir y reenviar esta solicitud.')
    if (report.clientId.toString() !== clientId) throw new ForbiddenException('La solicitud no pertenece a su organización.')

    const profile = await this.userService.findTransactionalProfile(actingUserId)
    if (!profile?.signature?.trim()) throw new ForbiddenException('Debe registrar su firma digital en el perfil antes de reenviar solicitudes de fondos.')

    const { lineDocs, roundedSum, description } = await this.validateViaticoLines(
      { place: dto.place, startDate: dto.startDate, endDate: dto.endDate, projectId: dto.projectId, lines: dto.lines, observations: dto.observations, amount: dto.amount },
      clientId,
      profile.permitirFechasAnteriores === true
    )

    // La cadena de aprobadores se recalcula desde el centro de costo elegido y
    // los centros de costo asignados actuales del colaborador (pueden haber
    // cambiado desde la solicitud original).
    const chain = await this.buildSolicitudCostCenterChain(profile, dto.projectId, actingUserId, clientId)

    const wasEditing = report.status === 'pending_l1'
    report.viaticoPlace = dto.place.trim()
    if (dto.lat != null) report.viaticoLat = dto.lat
    if (dto.lng != null) report.viaticoLng = dto.lng
    report.viaticoStartDate = new Date(dto.startDate)
    report.viaticoEndDate = new Date(dto.endDate)
    report.projectId = new Types.ObjectId(dto.projectId)
    report.viaticoLines = lineDocs
    report.viaticoObservations = dto.observations?.trim()
    report.viaticoBankName = dto.bankName?.trim() || undefined
    report.viaticoAccountNumber = dto.accountNumber?.trim() || undefined
    report.viaticoCci = dto.cci?.trim() || undefined
    report.viaticoOrdenTrabajoId = dto.ordenTrabajoId
      ? new Types.ObjectId(dto.ordenTrabajoId)
      : undefined
    report.viaticoAmount = roundedSum
    if (dto.moneda?.trim()) report.viaticoMoneda = dto.moneda.trim()
    report.budget = roundedSum
    report.description = description
    // Regla 1.6: cadena vacía (todos los niveles omitidos) va directo a Contabilidad.
    report.status = chain.length === 0 ? 'pending_contabilidad' : 'pending_l1'
    report.viaticoApprovalLevel = 0
    report.viaticoApproverChain = chain
    report.viaticoRequiredLevels = chain.length
    report.viaticoRejectedBy = undefined
    report.viaticoRejectionReason = undefined
    report.viaticoBudgetCommitmentRecorded = false
    report.viaticoSolicitudVersion = (report.viaticoSolicitudVersion ?? 1) + 1
    ;(report.viaticoApprovalHistory ?? []).push({ level: 0, approvedBy: actingUserId, action: 'resubmitted', notes: wasEditing ? 'Solicitud editada antes de aprobación' : 'Solicitud corregida y reenviada tras rechazo', date: new Date() })
    await report.save()

    if (report.status === 'pending_contabilidad') {
      void this.notifyContabilidadPendingApproval(report as ExpenseReportDocument)
    } else {
      void this.notifyViaticoCoordinator(report as ExpenseReportDocument, actingUserId, clientId)
    }

    return this.findOne(id) as Promise<ExpenseReportDocument>
  }

  async registerViaticoPayment(id: string, dto: PayViaticoDto, userRole: string, userPermissions?: any, opts?: { bypassReceipt?: boolean }): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Solicitud de Fondos ${id} no encontrada`)
    if (report.type !== 'viatico') throw new BadRequestException('Esta rendición no es de tipo solicitud de fondos')
    // Estados con saldo del anticipo aún por depositar. Tras el envío del colaborador
    // (submitted/pending_accounting) contabilidad todavía puede completar el pago parcial;
    // en esos casos solo se actualiza el monto pagado, sin tocar el estado del flujo.
    const PAYABLE_STATUSES = ['viatico_approved', 'partially_paid', 'submitted', 'pending_accounting']
    if (!PAYABLE_STATUSES.includes(report.status)) {
      throw new BadRequestException(`Solo se puede registrar pago de fondos aprobados (estado actual: ${report.status})`)
    }

    const canPay = [ROLES.SUPER_ADMIN, ROLES.CONTABILIDAD, ROLES.TESORERIA].includes(userRole as ROLES) || userPermissions?.canApproveL2 === true
    if (!canPay) throw new ForbiddenException('No tienes permiso para registrar pagos')

    if (!opts?.bypassReceipt && dto.method !== 'efectivo' && !dto.paymentReceiptUrl) throw new BadRequestException('El comprobante es obligatorio para pagos por transferencia o cheque.')
    if (dto.paymentReceiptUrl) {
      const v = this.isValidViaticoReceipt(dto.paymentReceiptMimeType, dto.paymentReceiptFileName, dto.paymentReceiptSizeBytes)
      if (!v.ok) throw new BadRequestException(v.reason)
    }

    const prevPaid = Number(report.viaticoPaidAmount ?? 0)
    const isFirstPayment = !report.viaticoPayments || report.viaticoPayments.length === 0
    const paymentAmount = Number(dto.amount ?? Math.max((report.viaticoAmount ?? 0) - prevPaid, 0))
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) throw new BadRequestException('El monto del pago debe ser mayor a 0.')

    if (isFirstPayment && report.viaticoBudgetCommitmentRecorded && report.projectId) {
      try {
        await this.projectService.adjustCommittedAdvanceTotal(report.projectId.toString(), report.clientId.toString(), -(report.viaticoAmount ?? 0))
      } catch (err: unknown) { this.logger.error(`Libera compromiso viático ${id}: ${err instanceof Error ? err.message : String(err)}`) }
      report.viaticoBudgetCommitmentRecorded = false
    }

    const paymentRecord = {
      amount: paymentAmount, method: dto.method, bankName: dto.bankName, accountNumber: dto.accountNumber,
      cci: dto.cci, transferDate: new Date(dto.transferDate), reference: dto.reference,
      paymentReceiptUrl: dto.paymentReceiptUrl ?? '', paymentReceiptFileName: dto.paymentReceiptFileName,
      paymentReceiptMimeType: dto.paymentReceiptMimeType, paymentReceiptSizeBytes: dto.paymentReceiptSizeBytes,
      scannedAmount: dto.scannedAmount, scannedTitular: dto.scannedTitular, operationNumber: dto.operationNumber,
      operationDate: dto.operationDate, operationTime: dto.operationTime, createdAt: new Date(),
    }
    report.viaticoPayments = [...(report.viaticoPayments ?? []), paymentRecord]
    report.viaticoPaidAmount = prevPaid + paymentAmount

    if (isFirstPayment) {
      report.viaticoPaymentInfo = { method: dto.method, bankName: dto.bankName, accountNumber: dto.accountNumber, cci: dto.cci, transferDate: new Date(dto.transferDate), reference: dto.reference, paymentReceiptUrl: dto.paymentReceiptUrl ?? '', paymentReceiptFileName: dto.paymentReceiptFileName, paymentReceiptMimeType: dto.paymentReceiptMimeType, paymentReceiptSizeBytes: dto.paymentReceiptSizeBytes }
    }

    const fullyPaid = report.viaticoPaidAmount >= (report.viaticoAmount ?? 0)

    // El estado solo se gestiona mientras la rendición está en fase de pago/carga
    // (aún no enviada por el colaborador): con el pago total pasa a 'open' para que
    // registre gastos; si sigue parcial queda 'partially_paid'. Si el colaborador ya
    // la envió (submitted/pending_accounting), el avance del flujo manda y completar
    // el pago solo actualiza el monto, sin revertir el estado.
    const inPrePaymentPhase =
      report.status === 'viatico_approved' || report.status === 'partially_paid'
    if (inPrePaymentPhase) {
      // La solicitud de caja chica NO se convierte en rendición al pagarse: el
      // dinero va al fondo y los gastos se rinden aparte, en rendiciones de
      // caja chica. Por eso termina en 'paid' y no en 'open'.
      report.status = fullyPaid
        ? report.isSolicitudCajaChica
          ? 'paid'
          : 'open'
        : 'partially_paid'
    }

    await report.save()

    // Recién con el depósito el responsable tiene el efectivo, así que es acá y
    // no en la aprobación donde el presupuesto queda disponible. La primera
    // solicitud abre el fondo; una posterior solo lo ajusta al monto nuevo.
    if (report.isSolicitudCajaChica && fullyPaid && report.fondoCajaChicaId) {
      const fondoId = String(report.fondoCajaChicaId)
      const nota = `Depósito de la solicitud ${String((report as any)._id)}`
      try {
        const fondo = await this.fondoCajaChicaService.findById(fondoId)
        if (fondo?.status === 'pending_funding') {
          await this.fondoCajaChicaService.fondear(
            fondoId,
            Number(report.viaticoPaidAmount ?? paymentAmount),
            String(report.userId),
            nota
          )
        } else {
          await this.fondoCajaChicaService.ajustarPresupuesto(
            fondoId,
            Number(report.cajaChicaNuevoPresupuesto ?? 0),
            String(report.userId),
            nota
          )
        }
      } catch (err: unknown) {
        this.logger.error(
          `No se pudo aplicar el presupuesto de caja chica de la solicitud ${id}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    const collabId = report.userId.toString()
    const collaborator = await this.userService.findEmailNameClient(collabId)
    const reportId = String((report as any)._id)

    // Centro de costo legible para los correos (igual que en el flujo de anticipo).
    let projectLabel = ''
    if (report.projectId) {
      try {
        const p = await this.projectService.findOne(report.projectId.toString(), report.clientId.toString())
        projectLabel = `[${p.code} - ${p.name}]`
      } catch { /* fallback a etiqueta vacía */ }
    }

    const viaticoSym = this.viaticoMoneySymbol(report.viaticoMoneda)
    const paymentEmailData = {
      clientId: report.clientId.toString(),
      collaboratorName: collaborator?.name ?? 'Colaborador',
      projectLabel,
      amountFormatted: this.viaticoFormatMoney(report.viaticoAmount ?? 0),
      currencySymbol: viaticoSym,
      transferDate: new Date(dto.transferDate).toISOString().slice(0, 10),
      reference: dto.reference ?? '—',
      paymentMethod: dto.method,
      paymentReceiptUrl: dto.paymentReceiptUrl ?? '',
      paymentReceiptFileName: dto.paymentReceiptFileName ?? 'comprobante.pdf',
      platformUrl: this.emailService.buildAppUrl(
        this.solicitudAppPath(report, 'solicitante')
      ),
    }

    const tramite = this.solicitudNombre(report)
    const fullyPaidMsg = fullyPaid
      ? (inPrePaymentPhase
          ? `Se registró el pago de tu ${tramite} por ${viaticoSym} ${this.viaticoFormatMoney(paymentAmount)}. Ya puedes registrar tus gastos.`
          : `Se registró el pago restante de tu ${tramite} por ${viaticoSym} ${this.viaticoFormatMoney(paymentAmount)} (total pagado ${viaticoSym} ${this.viaticoFormatMoney(report.viaticoPaidAmount ?? 0)}).`)
      : `Se registró un pago parcial de tu ${tramite} por ${viaticoSym} ${this.viaticoFormatMoney(paymentAmount)} (total pagado ${viaticoSym} ${this.viaticoFormatMoney(report.viaticoPaidAmount ?? 0)} de ${viaticoSym} ${this.viaticoFormatMoney(report.viaticoAmount ?? 0)}).`

    // La solicitud de caja chica no tiene pantalla de detalle propia (esa vista
    // rebota: es un trámite de presupuesto, no una rendición), así que el aviso
    // lleva a su pestaña.
    this.notificationsService.create({ userId: collabId, title: fullyPaid ? 'Pago de fondos registrado' : 'Pago parcial de fondos registrado', message: fullyPaidMsg, type: 'success', actionUrl: this.esSolicitudCajaChica(report) ? this.solicitudAppPath(report, 'solicitante') : `/mis-rendiciones/${reportId}/detalle` }).catch(() => {})

    if (collaborator?.email && await this.userService.isEmailEnabled(collabId)) {
      this.emailService.sendViaticoPagoRealizado(collaborator.email, {
        recipientName: collaborator.name,
        ...paymentEmailData,
      }).catch(() => {})
    }

    // Pago realizado: copia a TESORERÍA (quien ejecutó el pago), no al
    // coordinador personal (obsoleto) ni a los aprobadores.
    const tesoreria = await this.userService.findTesoreriaNotifyRecipients(
      report.clientId.toString()
    )
    const collabEmailKey = collaborator?.email?.trim().toLowerCase()
    for (const t of tesoreria) {
      if (t.email.trim().toLowerCase() === collabEmailKey) continue
      this.emailService.sendViaticoPagoRealizado(t.email, {
        recipientName: t.name,
        ...paymentEmailData,
      }).catch(() => {})
    }

    return this.findOne(id) as Promise<ExpenseReportDocument>
  }

  async cancelViatico(id: string, userId: string): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Solicitud de Fondos ${id} no encontrada`)
    if (report.type !== 'viatico') throw new BadRequestException('Esta rendición no es de tipo solicitud de fondos')
    if (report.userId.toString() !== userId) throw new ForbiddenException('Solo el colaborador solicitante puede cancelar esta solicitud.')
    if (report.status !== 'pending_l1') throw new BadRequestException('Solo se puede cancelar una solicitud en estado pendiente de aprobación.')
    report.status = 'cancelled'
    await report.save()

    // Avisar a los APROBADORES del viático (cadena por centro de costo) que el
    // colaborador canceló su solicitud — no al coordinador personal (obsoleto).
    try {
      const collaborator = await this.userService.findEmailNameClient(userId)
      const collaboratorName = collaborator?.name || 'El colaborador'
      let projectLabel = ''
      if (report.projectId) {
        try {
          const p = await this.projectService.findOne(
            report.projectId.toString(),
            report.clientId.toString()
          )
          projectLabel = `[${p.code} - ${p.name}]`
        } catch { /* etiqueta vacía */ }
      }
      const startStr =
        report.viaticoStartDate instanceof Date
          ? report.viaticoStartDate.toISOString().slice(0, 10)
          : String(report.viaticoStartDate ?? '').slice(0, 10)
      const endStr =
        report.viaticoEndDate instanceof Date
          ? report.viaticoEndDate.toISOString().slice(0, 10)
          : String(report.viaticoEndDate ?? '').slice(0, 10)
      const totalFormatted = this.viaticoFormatMoney(report.viaticoAmount ?? 0)
      const plainSummary = `${collaboratorName} canceló su solicitud de viáticos${projectLabel ? ' ' + projectLabel : ''}.`

      const approvers = await this.resolveViaticoApproverRecipients(report, {
        excludeUserIds: [userId],
      })
      const sentCancel = new Set<string>()
      for (const a of approvers) {
        await this.notificationsService
          .create({
            userId: a.userId,
            title: 'Solicitud de Fondos cancelada',
            message: plainSummary,
            type: 'warning',
            actionUrl: '/viaticos',
          })
          .catch(() => { })

        if (!a.emailEnabled || !a.email) continue
        const key = a.email.trim().toLowerCase()
        if (sentCancel.has(key)) continue
        sentCancel.add(key)
        await this.emailService.sendViaticoCancelacion(a.email, {
          clientId: report.clientId.toString(),
          coordinatorName: a.name,
          collaboratorName,
          place: report.viaticoPlace ?? '',
          startDate: startStr,
          endDate: endStr,
          totalFormatted,
          currencySymbol: this.viaticoMoneySymbol(report.viaticoMoneda),
          projectLabel,
          plainSummary,
          platformUrl: this.emailService.buildAppUrl('/viaticos'),
        })
      }
    } catch (err) {
      console.error(`[cancelViatico] Error notificando aprobadores ${id}:`, err)
    }

    return this.findOne(id) as Promise<ExpenseReportDocument>
  }


  async findViaticos(opts: { requesterId: string; requesterRole: string; requesterPermissions?: any; clientId: string; status?: string; dateFrom?: string; dateTo?: string }) {
    const isAdmin = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.CONTABILIDAD].includes(opts.requesterRole as ROLES)
    // El rol "Coordinador" casi nunca se asigna literalmente: en la práctica un
    // aprobador es un Colaborador asignado como N1/N2 en algún centro de costo.
    // Sin este chequeo, cualquier aprobador-Colaborador caía en el filtro por
    // userId (solo sus propias solicitudes) y nunca veía las que debía aprobar.
    const isApprover =
      !isAdmin &&
      (opts.requesterRole === ROLES.COORDINADOR ||
        (await this.projectService.isApproverForClient(opts.requesterId, opts.clientId)))
    const filter: Record<string, unknown> = { type: 'viatico', clientId: new Types.ObjectId(opts.clientId) }

    // `viaticoApproverChain` es un array de pasos (`{ approverIds: ObjectId[] }`),
    // no un array de ObjectId — hay que filtrar por el subcampo.
    if (isApprover) filter['viaticoApproverChain.approverIds'] = new Types.ObjectId(opts.requesterId)
    else if (!isAdmin) filter['userId'] = new Types.ObjectId(opts.requesterId)

    if (opts.status && opts.status !== 'all') filter['status'] = opts.status
    if (opts.dateFrom || opts.dateTo) {
      const dateFilter: Record<string, Date> = {}
      if (opts.dateFrom) dateFilter['$gte'] = new Date(opts.dateFrom)
      if (opts.dateTo) { const to = new Date(opts.dateTo); to.setHours(23, 59, 59, 999); dateFilter['$lte'] = to }
      filter['createdAt'] = dateFilter
    }

    return this.expenseReportModel.find(filter)
      .populate('userId', 'name email bankAccount dni')
      .populate('projectId', 'code name')
      .populate('viaticoOrdenTrabajoId', 'nombre costCenterId')
      .populate('viaticoApproverChain.approverIds', 'name email')
      .sort({ viaticoStartDate: -1, createdAt: -1 })
      .exec()
  }

  /**
   * Solicitudes de caja chica del colaborador, la primera y las de cambio de
   * presupuesto. Viven aquí y no en la lista de viáticos porque para el
   * colaborador son otra cosa, aunque por dentro compartan el mismo flujo.
   */
  /**
   * Cuántos documentos de caja chica esperan una acción DE ESTE usuario, para
   * el contador de la pestaña /rendiciones?tab=caja-chica. Cada rol cuenta lo
   * suyo y un usuario que junta varios (un Administrador que además aprueba)
   * suma sin repetir documentos.
   *
   * Se resuelve en el servidor y no contando la lista en el front porque la
   * pestaña muestra el número ANTES de abrirse: pedir el listado completo solo
   * para contarlo cargaría la bandeja entera en cada visita a /rendiciones.
   */
  async countCajaChicaPendientes(
    userId: string,
    clientId: string,
    opts: {
      esContabilidad: boolean
      esTesoreria: boolean
      /** Admin/Superadmin: ve todo lo pendiente de la empresa. */
      esAdmin: boolean
    }
  ): Promise<{ total: number }> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(clientId)) {
      return { total: 0 }
    }
    const uid = new Types.ObjectId(userId)
    const cid = new Types.ObjectId(clientId)
    const ids = new Set<string>()
    const add = (docs: { _id: unknown }[]) => {
      for (const d of docs) ids.add(String(d._id))
    }
    const soloIds = { _id: 1 } as const

    // Aprobador: le toca firmar. La solicitud lleva su cadena en el propio
    // documento; la rendición, en la de cada comprobante.
    const solicitudesPorFirmar = await this.expenseReportModel
      .find({
        clientId: cid,
        isSolicitudCajaChica: true,
        status: 'pending_l1',
        viaticoApproverChain: {
          $elemMatch: { approved: { $ne: true }, approverIds: uid },
        },
      })
      .select(soloIds)
      .lean()
      .exec()
    add(solicitudesPorFirmar)

    const comprobantesPorFirmar = await this.expenseModel
      .find({
        clientId: cid,
        status: { $ne: 'rejected' },
        approverChain: {
          $elemMatch: { approved: { $ne: true }, approverIds: uid },
        },
      })
      .select({ expenseReportId: 1 })
      .lean<{ expenseReportId?: Types.ObjectId }[]>()
      .exec()
    const reportIdsPorFirmar = [
      ...new Set(
        comprobantesPorFirmar
          .map(e => e.expenseReportId)
          .filter((x): x is Types.ObjectId => !!x)
          .map(String)
      ),
    ].map(x => new Types.ObjectId(x))
    if (reportIdsPorFirmar.length > 0) {
      const rendicionesPorFirmar = await this.expenseReportModel
        .find({
          _id: { $in: reportIdsPorFirmar },
          isCajaChica: true,
          status: 'submitted',
        })
        .select(soloIds)
        .lean()
        .exec()
      add(rendicionesPorFirmar)
    }

    if (opts.esContabilidad || opts.esAdmin) {
      const enContabilidad = await this.expenseReportModel
        .find({
          clientId: cid,
          $or: [
            { isSolicitudCajaChica: true, status: 'pending_contabilidad' },
            { isCajaChica: true, status: 'pending_accounting' },
          ],
        })
        .select(soloIds)
        .lean()
        .exec()
      add(enContabilidad)
    }

    if (opts.esTesoreria || opts.esAdmin) {
      // Depósito del presupuesto y reposición de lo ya aprobado: las dos colas
      // de Tesorería en caja chica.
      const enTesoreria = await this.expenseReportModel
        .find({
          clientId: cid,
          $or: [
            {
              isSolicitudCajaChica: true,
              status: { $in: ['viatico_approved', 'partially_paid'] },
            },
            {
              isCajaChica: true,
              status: 'approved',
              $and: [
                {
                  $or: [
                    { reimbursementPaymentInfo: { $exists: false } },
                    { reimbursementPaymentInfo: null },
                  ],
                },
              ],
            },
          ],
        })
        .select(soloIds)
        .lean()
        .exec()
      add(enTesoreria)
    }

    if (opts.esAdmin) {
      // El Administrador ve el trabajo de la empresa, no solo el suyo: se suman
      // los documentos que esperan a CUALQUIER aprobador.
      const esperandoAprobador = await this.expenseReportModel
        .find({
          clientId: cid,
          $or: [
            { isSolicitudCajaChica: true, status: 'pending_l1' },
            { isCajaChica: true, status: 'submitted' },
          ],
        })
        .select(soloIds)
        .lean()
        .exec()
      add(esperandoAprobador)
    }

    return { total: ids.size }
  }

  async findMySolicitudesCajaChica(userId: string, clientId: string) {
    return this.expenseReportModel
      .find({
        type: 'viatico',
        isSolicitudCajaChica: true,
        userId: new Types.ObjectId(userId),
        clientId: new Types.ObjectId(clientId),
      })
      // Los campos de la cadena y de los hitos van incluidos porque el
      // responsable ve la MISMA línea de tiempo que el aprobador
      // (`buildReportFlowSteps`): sin ellos su pantalla solo podía decir
      // "pendiente", sin indicar en qué paso está.
      .select(
        'type status createdAt viaticoAmount cajaChicaNuevoPresupuesto cajaChicaPresupuestoAnterior title ' +
        'rejectionReason viaticoRejectionReason rejectedByRole viaticoRejectedByRole ' +
        'viaticoApproverChain viaticoApprovalLevel viaticoRequiredLevels ' +
        'viaticoSolicitudContabilidadApprovedAt viaticoSolicitudContabilidadApprovedBy ' +
        'viaticoPaidAmount viaticoPaymentInfo viaticoPayments closedAt'
      )
      // Nombres reales en la línea de tiempo: sin poblar, cada paso decía
      // "Aprobador" en vez de quién es.
      .populate('viaticoApproverChain.approverIds', 'name email')
      .populate('viaticoSolicitudContabilidadApprovedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean()
      .exec()
  }

  /**
   * Solicitudes de fondos del colaborador. La solicitud de caja chica viaja
   * como `type: 'viatico'` para reutilizar ese flujo, pero para el colaborador
   * es otra cosa y se muestra en su propia pestaña, así que aquí se excluye.
   */
  async findMyViaticos(userId: string, clientId: string) {
    return this.expenseReportModel.find({
      type: 'viatico',
      isSolicitudCajaChica: { $ne: true },
      userId: new Types.ObjectId(userId),
      clientId: new Types.ObjectId(clientId),
    })
      .populate('userId', 'name email')
      .populate('projectId', 'code name')
      .populate('viaticoOrdenTrabajoId', 'nombre costCenterId')
      .sort({ createdAt: -1 })
      .exec()
  }

  async initiateViaticoReturnTracking(id: string): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Solicitud de Fondos ${id} no encontrada`)
    if (report.type !== 'viatico') throw new BadRequestException('Esta rendición no es de tipo solicitud de fondos')
    if (report.status !== 'settled') throw new BadRequestException('Solo se puede iniciar devolución desde estado liquidado')
    if (!report.settlement || report.settlement.type !== 'devolucion') throw new BadRequestException('Esta solicitud de fondos no tiene saldo a devolver')

    const dueDate = this.addViaticoBusinessDays(new Date(), 10)
    await this.expenseReportModel.findByIdAndUpdate(id, {
      $set: { viaticoReturnRecord: { status: 'pending', amountDue: report.settlement.difference, dueDate, isOverdue: false, remindersSent: 0 } },
    })
    const collaborator = await this.userService.findEmailNameClient(report.userId.toString())
    if (collaborator?.email) {
      this.emailService.sendDevolucionPendiente(collaborator.email, {
        clientId: report.clientId.toString(), recipientName: collaborator.name,
        amountDue: this.viaticoFormatMoney(report.settlement.difference),
        // `difference` está en moneda base, no en la del viático: rotularlo con
        // el símbolo de la solicitud diría "$ 1639.72" por una deuda de S/ 1639.72.
        currencySymbol: this.settlementCurrencySymbol(report),
        dueDate: this.emailService.formatDateDDMMYYYY(dueDate), advanceId: id,
      }).catch(() => {})
    }
    return this.findOne(id) as Promise<ExpenseReportDocument>
  }

  async uploadViaticoReturnProof(id: string, proof: { depositDate: Date; amountReturned: number; bankOrigin: string; operationNumber: string; fileUrl: string; fileKey?: string; note?: string; scannedAmount?: number; operationDate?: string; operationTime?: string; titular?: string }): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Solicitud de Fondos ${id} no encontrada`)
    if (report.type !== 'viatico') throw new BadRequestException('Esta rendición no es de tipo solicitud de fondos')
    const rr = (report as any).viaticoReturnRecord
    if (!rr || rr.status !== 'pending') throw new BadRequestException('No hay devolución pendiente de comprobante')
    if (proof.amountReturned < rr.amountDue) throw new BadRequestException(`El monto devuelto (${proof.amountReturned}) es menor al monto adeudado (${rr.amountDue})`)
    await this.expenseReportModel.findByIdAndUpdate(id, { $set: { viaticoReturnRecord: { ...rr, status: 'proof_uploaded', proof: { ...proof, uploadedAt: new Date() } } } })
    return this.findOne(id) as Promise<ExpenseReportDocument>
  }

  async validateViaticoReturn(id: string, approved: boolean, validatedBy: string, rejectionReason?: string): Promise<ExpenseReportDocument> {
    const report = await this.expenseReportModel.findById(id)
    if (!report) throw new NotFoundException(`Solicitud de Fondos ${id} no encontrada`)
    if (report.type !== 'viatico') throw new BadRequestException('Esta rendición no es de tipo solicitud de fondos')
    const rr = (report as any).viaticoReturnRecord
    if (!rr || rr.status !== 'proof_uploaded') throw new BadRequestException('No hay comprobante pendiente de validación')
    if (!approved && (!rejectionReason || rejectionReason.trim().length < 50)) throw new BadRequestException('El motivo de rechazo debe tener al menos 50 caracteres')

    const validation = { validatedBy, validatedAt: new Date(), approved, rejectionReason }
    const updates: any = { viaticoReturnRecord: { ...rr, status: approved ? 'validated' : 'rejected', validation } }
    if (approved) updates.status = 'returned'
    await this.expenseReportModel.findByIdAndUpdate(id, { $set: updates })

    const collaborator = await this.userService.findEmailNameClient(report.userId.toString())
    if (collaborator?.email && await this.userService.isEmailEnabled(report.userId.toString())) {
      const sendFn = approved ? this.emailService.sendDevolucionValidada.bind(this.emailService) : this.emailService.sendDevolucionRechazada.bind(this.emailService)
      sendFn(collaborator.email, { clientId: report.clientId.toString(), recipientName: collaborator.name, amountDue: this.viaticoFormatMoney(rr.amountDue), currencySymbol: this.settlementCurrencySymbol(report), rejectionReason, advanceId: id }).catch(() => {})
    }
    return this.findOne(id) as Promise<ExpenseReportDocument>
  }

  async findViaticosPendingReturns(clientId: string) {
    return this.expenseReportModel.find({
      type: 'viatico',
      clientId: new Types.ObjectId(clientId),
      'viaticoReturnRecord.status': { $in: ['pending', 'proof_uploaded', 'rejected'] },
    })
      .populate('userId', 'name email bankAccount dni')
      .exec()
  }

  /** Liquidación para rendiciones de tipo viático (sin Advance externo). */
  async liquidateViaticoReport(reportId: string, fromClose = false): Promise<void> {
    const report = await this.expenseReportModel.findById(reportId).populate('expenseIds').exec()
    if (!report || report.type !== 'viatico' || report.status !== 'approved') return

    const expenses = (report.expenseIds as any[]) || []
    const approved = expenses.filter(
      e => String(e?.status ?? '').toLowerCase() === 'approved'
    )
    const expenseTotal = approved.reduce(
      (sum, e) => sum + this.expenseSettlementAmountBase(e),
      0
    )

    // `viaticoPaidAmount` está en la moneda del viático (puede ser USD) y los
    // gastos ya vienen en moneda base: restarlos crudos compararía dólares
    // contra soles. Se valora el anticipo con el TC congelado del viático,
    // igual que hace la rendición directa con su depósito.
    const advanceTotal = this.reportSettlementAmountBase(
      report,
      Number(report.viaticoPaidAmount ?? 0)
    )
    // Solo omitir si ambos son cero (nada que liquidar).
    if (advanceTotal <= 0 && expenseTotal <= 0) return

    const difference = advanceTotal - expenseTotal
    const type: 'reembolso' | 'devolucion' | 'equilibrado' =
      Math.abs(difference) < 0.01 ? 'equilibrado' : difference > 0 ? 'devolucion' : 'reembolso'

    // La liquidación se guarda en moneda base (es la que consumen tesorería,
    // el TXT y los asientos). Se anota además el equivalente en la moneda del
    // viático para que la rendición del colaborador pueda mostrar su moneda.
    const config = await this.currencyService
      .getConfig(report.clientId.toString())
      .catch(() => null)
    const monedaBase = config?.monedaBase || DEFAULT_MONEDA
    const rate = Number(report.tipoCambio) || 1
    const monedaReporte = report.viaticoMoneda || monedaBase
    const round2 = (n: number) => Math.round(n * 100) / 100
    // El equivalente en la moneda del viático se suma de los `montoReporte`
    // congelados por comprobante, no dividiendo el total base entre el TC del
    // viático: cada gasto pudo congelarse con el TC de su propia fecha, así que
    // dividir daría unos céntimos distintos de lo que ve el colaborador.
    const advanceTotalReporte = round2(Number(report.viaticoPaidAmount ?? 0))
    const expenseTotalReporte = round2(
      approved.reduce((sum, e) => sum + this.expenseAmountInReport(e), 0)
    )

    await this.updateSettlement(reportId, {
      advanceTotal,
      expenseTotal,
      difference,
      type,
      moneda: monedaBase,
      monedaReporte,
      advanceTotalReporte,
      expenseTotalReporte,
      differenceReporte: round2(advanceTotalReporte - expenseTotalReporte),
      tipoCambio: rate,
      settledAt: new Date(),
    })

    // Auto-cierre inmediato cuando el viático queda equilibrado.
    // fromClose=true indica que esta llamada viene desde close() — evita recursión.
    if (!fromClose && type === 'equilibrado') {
      await this.close(reportId, 'sistema')
    }
  }
}
