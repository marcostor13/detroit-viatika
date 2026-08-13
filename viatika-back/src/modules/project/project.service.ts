import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { CreateProjectDto } from './dto/create-project.dto'
import { UpdateProjectDto } from './dto/update-project.dto'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Project, ProjectDocument } from './entities/project.entity'
import { LineaNegocioDocument } from '../linea-negocio/entities/linea-negocio.entity'
import { UserDocument } from '../user/schemas/user.schema'

export interface IBulkImportResult {
  created: number
  skipped: string[]
  errors: string[]
}

/** Referencias vivas a un centro de costo, desglosadas por origen. */
export interface ProjectReferenceCount {
  usuarios: number
  comprobantes: number
  rendiciones: number
  solicitudes: number
  facturasLegado: number
  ordenesTrabajo: number
  total: number
}

/**
 * Sitios del modelo que referencian un centro de costo. La lista completa vive
 * SOLO acá: cualquier campo nuevo que apunte a un `Project` se agrega en este
 * lugar y queda cubierto por `countReferences` y por su test.
 *
 * Ojo con dos trampas del modelo, que son las que hicieron pasar por alto
 * referencias colgadas en el incidente del 2026-08-13:
 * - dos grafías: `proyectId` en comprobantes, `projectId` en rendiciones.
 * - dos tipos: string en los permisos de usuario y en las filas anidadas de un
 *   comprobante, ObjectId en el resto.
 */
type OrigenDeReferencia = keyof Omit<ProjectReferenceCount, 'total'>

interface SitioDeReferencia {
  /** Nombre del modelo Mongoose, tal como lo registra su módulo. */
  modelo: string
  origen: OrigenDeReferencia
  campos: Array<{ path: string; tipo: 'string' | 'objectId' }>
}

const SITIOS_DE_REFERENCIA: SitioDeReferencia[] = [
  {
    modelo: 'User',
    origen: 'usuarios',
    campos: [
      { path: 'permissions.projectIds', tipo: 'string' },
      { path: 'permissions.primaryProjectId', tipo: 'string' },
    ],
  },
  {
    modelo: 'Expense',
    origen: 'comprobantes',
    campos: [
      { path: 'proyectId', tipo: 'objectId' },
      { path: 'detalleAnalitico.proyectId', tipo: 'string' },
      { path: 'movilidadRows.proyectId', tipo: 'string' },
    ],
  },
  {
    modelo: 'ExpenseReport',
    origen: 'rendiciones',
    campos: [{ path: 'projectId', tipo: 'objectId' }],
  },
  {
    modelo: 'Advance',
    origen: 'solicitudes',
    campos: [{ path: 'projectId', tipo: 'objectId' }],
  },
  {
    modelo: 'Invoice',
    origen: 'facturasLegado',
    campos: [{ path: 'projectId', tipo: 'objectId' }],
  },
  {
    modelo: 'OrdenTrabajo',
    origen: 'ordenesTrabajo',
    campos: [
      { path: 'costCenterId', tipo: 'objectId' },
      { path: 'costCenterIds', tipo: 'objectId' },
    ],
  },
]

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name)

  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel('LineaNegocio')
    private lineaNegocioModel: Model<LineaNegocioDocument>,
    @InjectModel('User') private userModel: Model<UserDocument>
  ) {}

  private generateCode(name: string): string {
    return name
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20)
  }

  private buildDuplicateCodeMessage(code: string): string {
    return `Ya existe un centro de costo con el código "${code}". Usa un código diferente.`
  }

  private async ensureUniqueCode(
    code: string,
    clientId: Types.ObjectId,
    excludeProjectId?: string
  ): Promise<void> {
    const filter: Record<string, unknown> = { code, clientId }
    if (excludeProjectId) {
      filter['_id'] = { $ne: new Types.ObjectId(excludeProjectId) }
    }

    const existingProject = await this.projectModel.findOne(filter).exec()
    if (existingProject) {
      throw new BadRequestException(this.buildDuplicateCodeMessage(code))
    }
  }

  private rethrowDuplicateCodeError(error: unknown, code: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new BadRequestException(this.buildDuplicateCodeMessage(code))
    }

    throw error
  }

  private toResponse(project: ProjectDocument) {
    const ln: any = project.lineaNegocioId
    const lineaNegocioId =
      ln && typeof ln === 'object' && ln._id
        ? String(ln._id)
        : ln
          ? String(ln)
          : undefined
    const lineaNegocio =
      ln && typeof ln === 'object' && ln.name
        ? { _id: String(ln._id), name: ln.name, code: ln.code }
        : undefined
    const av: any = project.approverId
    const approverId =
      av && typeof av === 'object' && av._id
        ? String(av._id)
        : av
          ? String(av)
          : undefined
    const approver =
      av && typeof av === 'object' && av.name
        ? { _id: String(av._id), name: av.name, email: av.email }
        : undefined
    const approverLevels = (project.approverLevels ?? []).map(lvl => ({
      level: lvl.level,
      userIds: (lvl.userIds ?? []).map((u: any) =>
        u && typeof u === 'object' && u._id
          ? { _id: String(u._id), name: u.name, email: u.email }
          : { _id: String(u) }
      ),
    }))
    return {
      _id: project._id,
      name: project.name,
      code: project.code,
      isActive: project.isActive,
      client: project.clientId,
      clientName: project.clientName,
      lineaNegocioId,
      lineaNegocio,
      committedAdvanceTotal: project.committedAdvanceTotal ?? 0,
      approverId,
      approver,
      approverLevels,
    }
  }

  private toApproverLevelDocs(
    approverLevels: { level: number; userIds: string[] }[] | undefined
  ): { level: number; userIds: Types.ObjectId[] }[] | undefined {
    if (!approverLevels) return undefined
    return approverLevels
      .filter(lvl => lvl.userIds?.length)
      .map(lvl => ({
        level: lvl.level,
        userIds: lvl.userIds.map(id => new Types.ObjectId(id)),
      }))
  }

  /** Delta positivo al aprobar; negativo al registrar pago (Fase 3). */
  async adjustCommittedAdvanceTotal(
    projectId: string,
    clientId: string,
    delta: number
  ): Promise<void> {
    if (!delta) return
    const clientIdObject = new Types.ObjectId(clientId)
    const updated = await this.projectModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(projectId),
          clientId: clientIdObject,
        },
        { $inc: { committedAdvanceTotal: delta } },
        { new: true }
      )
      .exec()
    if (!updated) {
      throw new NotFoundException('Proyecto no encontrado')
    }
    const total = updated.committedAdvanceTotal ?? 0
    if (total < 0) {
      updated.committedAdvanceTotal = 0
      await updated.save()
    }
  }

  async create(createProjectDto: CreateProjectDto) {
    const clientId = new Types.ObjectId(createProjectDto.clientId)
    const code =
      createProjectDto.code?.trim() || this.generateCode(createProjectDto.name)
    await this.ensureUniqueCode(code, clientId)

    const lineaNegocioId = createProjectDto.lineaNegocioId?.trim()
      ? new Types.ObjectId(createProjectDto.lineaNegocioId.trim())
      : undefined
    const approverId = createProjectDto.approverId?.trim()
      ? new Types.ObjectId(createProjectDto.approverId.trim())
      : undefined
    const approverLevels = this.toApproverLevelDocs(createProjectDto.approverLevels)

    let project: ProjectDocument
    try {
      project = await this.projectModel.create({
        ...createProjectDto,
        code,
        clientId,
        lineaNegocioId,
        approverId,
        approverLevels,
      })
    } catch (error) {
      this.rethrowDuplicateCodeError(error, code)
    }

    return this.toResponse(project)
  }

  async findAll(
    clientId: string,
    opts?: {
      page?: number
      limit?: number
      search?: string
      isActive?: boolean
    }
  ) {
    const clientIdObject = new Types.ObjectId(clientId)
    const filter: any = { clientId: clientIdObject }

    if (opts?.isActive !== undefined) {
      filter.isActive = opts.isActive
    }
    if (opts?.search) {
      const re = new RegExp(opts.search, 'i')
      filter.$or = [{ name: re }, { code: re }]
    }

    const usePagination = opts?.page !== undefined || opts?.limit !== undefined
    const page = opts?.page ?? 1
    const limit = opts?.limit ?? 200
    const skip = (page - 1) * limit

    const [projects, total] = await Promise.all([
      this.projectModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .populate('clientId')
        .populate('lineaNegocioId', 'name code')
        .populate('approverId', 'name email')
        .populate('approverLevels.userIds', 'name email')
        .exec(),
      this.projectModel.countDocuments(filter).exec(),
    ])

    const data = projects.map(p => this.toResponse(p))

    if (usePagination) {
      return { data, total, page, pages: Math.ceil(total / limit), limit }
    }
    return data
  }

  async findOne(id: string, clientId: string) {
    const clientIdObject = new Types.ObjectId(clientId)
    const project = await this.projectModel
      .findOne({ _id: new Types.ObjectId(id), clientId: clientIdObject })
      .populate('clientId')
      .populate('lineaNegocioId', 'name code')
      .populate('approverId', 'name email')
      .exec()
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado')
    }
    return this.toResponse(project)
  }

  /**
   * ¿Este usuario aparece como aprobador (cualquier nivel) en su empresa?
   * Reemplaza el chequeo por rol "Coordinador" — la autorización real depende
   * de estar en `approverLevels`, no del rol.
   *
   * Consulta las DOS fuentes de aprobadores que alimentan el motor de cadena
   * (ver `ownerOrProjectSource` en `approval-chain.util.ts`): los niveles de un
   * centro de costo y los niveles propios de un colaborador
   * (`User.permissions.approverLevels`, regla 1.10). Mirar solo la primera
   * dejaba fuera de `/rendiciones` a quien aprueba únicamente por asignación
   * directa en el perfil del colaborador, aunque el motor sí lo pusiera en la
   * cadena y el API le aceptara la aprobación.
   */
  async isApproverForClient(userId: string, clientId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(clientId)) {
      return false
    }
    const userIdObject = new Types.ObjectId(userId)
    const clientIdObject = new Types.ObjectId(clientId)

    const enCentroDeCosto = await this.projectModel.exists({
      clientId: clientIdObject,
      'approverLevels.userIds': userIdObject,
    })
    if (enCentroDeCosto) return true

    const enColaborador = await this.userModel.exists({
      clientId: clientIdObject,
      'permissions.approverLevels.userIds': userIdObject,
    })
    return !!enColaborador
  }

  /** Carga varios centros de costo por ID (usado al armar la cadena de aprobación). */
  async findManyByIds(ids: string[], clientId: string): Promise<ProjectDocument[]> {
    if (!ids.length) return []
    const clientIdObject = new Types.ObjectId(clientId)
    const objectIds = ids.map(id => new Types.ObjectId(id))
    return this.projectModel
      .find({ _id: { $in: objectIds }, clientId: clientIdObject })
      .select('approverLevels')
      .exec()
  }

  async update(
    id: string,
    updateProjectDto: UpdateProjectDto,
    clientId: string
  ) {
    const clientIdObject = new Types.ObjectId(clientId)
    const updatePayload: UpdateProjectDto = { ...updateProjectDto }

    if (typeof updatePayload.code === 'string') {
      updatePayload.code = updatePayload.code.trim()
      if (!updatePayload.code) {
        delete updatePayload.code
      }
    }

    // Línea de negocio: cadena vacía/null limpia la asignación; valor válido la actualiza.
    if ('lineaNegocioId' in updatePayload) {
      const raw = (updatePayload.lineaNegocioId ?? '').toString().trim()
      ;(updatePayload as Record<string, unknown>).lineaNegocioId = raw
        ? new Types.ObjectId(raw)
        : null
    }

    // Aprobador del centro de costo: cadena vacía/null limpia la asignación.
    if ('approverId' in updatePayload) {
      const raw = (updatePayload.approverId ?? '').toString().trim()
      ;(updatePayload as Record<string, unknown>).approverId = raw
        ? new Types.ObjectId(raw)
        : null
    }

    // Niveles de aprobación: reemplazo completo del arreglo cuando se envía.
    if ('approverLevels' in updatePayload) {
      ;(updatePayload as Record<string, unknown>).approverLevels =
        this.toApproverLevelDocs(updatePayload.approverLevels) ?? []
    }

    if (updatePayload.code) {
      await this.ensureUniqueCode(updatePayload.code, clientIdObject, id)
    }

    // Desactivar SIEMPRE se permite. Antes se rechazaba cuando el centro de
    // costo tenía comprobantes activos, con un mensaje que además se
    // contradecía ("Puede desactivarlo, pero los gastos existentes se
    // conservarán") siendo una excepción que lo impedía. La guarda estaba en la
    // operación equivocada: desactivar conservando historial es justamente el
    // caso de uso, y bloquearlo empujaba a eliminar el centro de costo, que sí
    // es destructivo e irreversible (ver `remove`). El aviso sobre los
    // comprobantes existentes corresponde a una confirmación en la interfaz.

    let project: ProjectDocument | null
    try {
      project = await this.projectModel
        .findOneAndUpdate(
          { _id: new Types.ObjectId(id), clientId: clientIdObject },
          updatePayload,
          { new: true }
        )
        .populate('clientId')
        .populate('lineaNegocioId', 'name code')
        .populate('approverId', 'name email')
        .populate('approverLevels.userIds', 'name email')
        .exec()
    } catch (error) {
      this.rethrowDuplicateCodeError(
        error,
        updatePayload.code ?? updateProjectDto.code ?? ''
      )
    }

    if (!project) {
      throw new NotFoundException('Proyecto no encontrado')
    }

    return this.toResponse(project)
  }

  /** Parsea "Sí"/"No"/true/false/1/0 (o vacío) del Excel a boolean. Vacío => default. */
  private parseExcelBoolean(value: unknown, defaultValue: boolean): boolean {
    const str = String(value ?? '').trim().toLowerCase()
    if (!str) return defaultValue
    return ['si', 'sí', 'true', '1', 'yes'].includes(str)
  }

  /** Resuelve una lista de emails separados por coma a User._id dentro de la empresa. */
  private async resolveApproverEmails(
    raw: string,
    clientId: Types.ObjectId
  ): Promise<{ ids: Types.ObjectId[]; notFound: string[] }> {
    const emails = raw
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
    const ids: Types.ObjectId[] = []
    const notFound: string[] = []
    for (const email of emails) {
      const user = await this.userModel
        .findOne({ email, clientId })
        .select('_id')
        .exec()
      if (user) ids.push(user._id as Types.ObjectId)
      else notFound.push(email)
    }
    return { ids, notFound }
  }

  /**
   * Carga masiva de centros de costo desde Excel. A diferencia de la versión
   * inicial (solo nombre/código/clientName), cubre TODOS los campos del
   * formulario normal, incluida la cadena de aprobadores (regla 1.4) — sin
   * `approverLevels` un centro de costo creado por carga masiva nunca podría
   * recibir comprobantes en la cadena de aprobación. Los aprobadores se
   * expresan como email (no hay forma de que un Excel traiga un ObjectId) y
   * se resuelven por fila; un email no encontrado es un ERROR explícito de
   * fila, nunca se descarta en silencio.
   */
  async bulkImport(
    rows: Array<Record<string, any>>,
    clientId: string
  ): Promise<IBulkImportResult> {
    let created = 0
    const skipped: string[] = []
    const errors: string[] = []
    const clientIdObj = new Types.ObjectId(clientId)

    for (const row of rows) {
      const name = String(row['Nombre Proyecto'] ?? row['name'] ?? '').trim()
      if (!name) {
        errors.push('Fila sin nombre de proyecto')
        continue
      }

      const code =
        String(row['Código'] ?? row['Codigo'] ?? row['code'] ?? '').trim() ||
        this.generateCode(name)
      const clientName = String(row['Nombre Cliente'] ?? '').trim() || undefined

      try {
        const exists = await this.projectModel
          .findOne({ code, clientId: clientIdObj })
          .exec()
        if (exists) {
          skipped.push(code)
          continue
        }

        let lineaNegocioId: Types.ObjectId | undefined
        const lineaNegocioText = String(
          row['Línea de Negocio'] ?? row['Linea de Negocio'] ?? ''
        ).trim()
        if (lineaNegocioText) {
          const ln = await this.lineaNegocioModel
            .findOne({
              clientId: clientIdObj,
              name: {
                $regex: `^${lineaNegocioText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                $options: 'i',
              },
            })
            .exec()
          if (!ln) {
            errors.push(
              `${code}: línea de negocio "${lineaNegocioText}" no encontrada`
            )
            continue
          }
          lineaNegocioId = ln._id as Types.ObjectId
        }

        const approverLevels: { level: number; userIds: Types.ObjectId[] }[] = []
        let approverErrorFound = false
        const levelHeaders: [number, string][] = [
          [1, 'Aprobador N1'],
          [2, 'Aprobador N2'],
          [3, 'Aprobador N3'],
        ]
        for (const [level, header] of levelHeaders) {
          const raw = String(row[header] ?? '').trim()
          if (!raw) continue
          const { ids, notFound } = await this.resolveApproverEmails(
            raw,
            clientIdObj
          )
          if (notFound.length) {
            errors.push(
              `${code}: aprobador(es) no encontrado(s) en Nivel ${level}: ${notFound.join(', ')}`
            )
            approverErrorFound = true
            break
          }
          if (ids.length) approverLevels.push({ level, userIds: ids })
        }
        if (approverErrorFound) continue

        await this.projectModel.create({
          name,
          code,
          clientId: clientIdObj,
          clientName,
          lineaNegocioId,
          cuentaAnalitica9x:
            String(
              row['Cuenta Analítica 9x'] ?? row['Cuenta Analitica 9x'] ?? ''
            ).trim() || undefined,
          cuentaDestino6x:
            String(row['Cuenta Destino 6x'] ?? '').trim() || undefined,
          centroCosto:
            String(row['Centro de Costo Contanet'] ?? '').trim() || undefined,
          subCentroCosto:
            String(row['Sub Centro de Costo'] ?? '').trim() || undefined,
          area: String(row['Área'] ?? row['Area'] ?? '').trim() || undefined,
          esAdministrativo: this.parseExcelBoolean(
            row['Es Administrativo'],
            false
          ),
          isActive: this.parseExcelBoolean(row['Activo'], true),
          approverLevels: approverLevels.length ? approverLevels : undefined,
        })
        created++
      } catch (e: any) {
        errors.push(`${code}: ${e?.message || 'error'}`)
      }
    }
    return { created, skipped, errors }
  }

  /**
   * Cuenta las referencias vivas a un centro de costo en todo el modelo.
   *
   * Los modelos se resuelven por la conexión (`projectModel.db.model`) y no por
   * inyección para no crear dependencias circulares entre módulos; es el mismo
   * recurso que ya usaba la validación de desactivación. Si un modelo no está
   * registrado (tests unitarios con mocks), ese origen cuenta 0 en vez de
   * romper.
   */
  async countReferences(
    id: string,
    clientId: string
  ): Promise<ProjectReferenceCount> {
    const asString = String(id)
    let asObjectId: Types.ObjectId | null = null
    try {
      asObjectId = new Types.ObjectId(asString)
    } catch {
      asObjectId = null
    }
    const clientIdObject = new Types.ObjectId(clientId)

    // Una consulta por modelo con todos sus campos en un `$or`, para contar cada
    // documento una sola vez aunque lo referencie desde dos campos distintos.
    const contar = async (sitio: SitioDeReferencia): Promise<number> => {
      try {
        const model = this.projectModel.db.model(
          sitio.modelo
        ) as unknown as Model<unknown>
        if (!model) return 0
        const condiciones = sitio.campos
          .map(campo => ({
            path: campo.path,
            valor: campo.tipo === 'string' ? asString : asObjectId,
          }))
          .filter(c => c.valor != null)
          .map(c => ({ [c.path]: c.valor }))
        if (!condiciones.length) return 0
        return await model.countDocuments({
          clientId: clientIdObject,
          $or: condiciones,
        })
      } catch (error) {
        this.logger.warn(
          `No se pudo contar referencias en ${sitio.modelo}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
        return 0
      }
    }

    const porOrigen: Omit<ProjectReferenceCount, 'total'> = {
      usuarios: 0,
      comprobantes: 0,
      rendiciones: 0,
      solicitudes: 0,
      facturasLegado: 0,
      ordenesTrabajo: 0,
    }

    for (const sitio of SITIOS_DE_REFERENCIA) {
      porOrigen[sitio.origen] += await contar(sitio)
    }

    const total = Object.values(porOrigen).reduce((a, b) => a + b, 0)
    return { ...porOrigen, total }
  }

  /** Texto legible del desglose, para el mensaje de error. */
  private describeReferences(refs: ProjectReferenceCount): string {
    const partes: string[] = []
    const etiquetas: Array<[keyof ProjectReferenceCount, string, string]> = [
      ['usuarios', 'usuario', 'usuarios'],
      ['comprobantes', 'comprobante', 'comprobantes'],
      ['rendiciones', 'rendición', 'rendiciones'],
      ['solicitudes', 'solicitud', 'solicitudes'],
      ['facturasLegado', 'factura', 'facturas'],
      ['ordenesTrabajo', 'orden de trabajo', 'órdenes de trabajo'],
    ]
    for (const [key, singular, plural] of etiquetas) {
      const n = refs[key]
      if (n > 0) partes.push(`${n} ${n === 1 ? singular : plural}`)
    }
    return partes.join(', ')
  }

  /**
   * Elimina un centro de costo SOLO si nadie lo referencia.
   *
   * Antes borraba sin verificar nada, y como todo el modelo referencia el
   * centro de costo por `_id`, el borrado dejaba usuarios que ya no podían
   * registrar gastos ("Su centro de costo principal no fue encontrado") y
   * comprobantes imputados a un centro de costo inexistente. Recrearlo con el
   * mismo nombre o código NO reconecta nada, porque el `_id` es otro: el
   * borrado es irreversible desde la interfaz. De ahí que ante cualquier
   * referencia se rechace y se ofrezca desactivar, que conserva el historial.
   */
  async remove(id: string, clientId: string) {
    const clientIdObject = new Types.ObjectId(clientId)
    const existing = await this.projectModel
      .findOne({ _id: new Types.ObjectId(id), clientId: clientIdObject })
      .exec()
    if (!existing) {
      throw new NotFoundException('Proyecto no encontrado')
    }

    const refs = await this.countReferences(id, clientId)
    if (refs.total > 0) {
      throw new ConflictException(
        `No se puede eliminar el centro de costo "${existing.name}" porque está en uso: ` +
          `${this.describeReferences(refs)}. Desactívalo en lugar de eliminarlo: ` +
          `los registros existentes se conservan y deja de ofrecerse al cargar gastos.`
      )
    }

    const result = await this.projectModel
      .findOneAndDelete({
        _id: new Types.ObjectId(id),
        clientId: clientIdObject,
      })
      .exec()
    if (!result) {
      throw new NotFoundException('Proyecto no encontrado')
    }
    return result
  }
}
