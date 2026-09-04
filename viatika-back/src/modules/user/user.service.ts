import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { User, UserDocument } from './schemas/user.schema'
import { Model, Types } from 'mongoose'
import { UpdateUserDto } from './dto/update-user.dto'
import { ClientDocument } from '../client/entities/client.entity'
import { RoleService } from '../role/role.service'
import { RoleDocument } from '../role/entities/role.entity'
import * as bcrypt from 'bcryptjs'
import { CreateUserDto } from './dto/create-user.dto'
import { ApproverLevel } from '../../common/types/approver-level'
import { Project, ProjectDocument } from '../project/entities/project.entity'
import {
  Suplencia,
  aFechaLocal,
  normalizarSuplencia,
  suplenciaVigente,
} from '../../common/types/suplencia'

export interface IUser {
  email: string
  name: string
  password: string
  roleId: Types.ObjectId
  clientId?: Types.ObjectId
  isActive?: boolean
}

export interface IUserPermissions {
  modules: string[]
  canApproveL1: boolean
  canApproveL2: boolean
}

/**
 * Campos de `permissions` que puede traer una fila del Excel de carga
 * masiva: solo centros de costo y aprobadores propios. El resto de permisos
 * (módulos, categorías…) se sigue asignando por rol o desde la pantalla de
 * permisos del colaborador.
 */
export interface BulkPermissionOverrides {
  projectIds?: string[]
  primaryProjectId?: string
  approverLevels?: ApproverLevel[]
}

/** Lo que le pasa a una fila del Excel en la carga masiva de colaboradores. */
export interface IUserBulkRowPlan {
  /** Fila del Excel (1 = encabezado). */
  row: number
  email: string
  accion: 'crear' | 'actualizar' | 'sin-cambios' | 'error'
  /** Qué se crea o qué cambia, en texto legible. */
  detalle?: string
  /** Por qué falló la fila. */
  reason?: string
}

export interface IUserBulkImportResult {
  created: number
  /** Colaboradores que ya existían y a los que el archivo les cambia permisos. */
  updated: number
  /** Colaboradores que ya existían y a los que el archivo no les cambia nada. */
  unchanged: number
  errors: { row: number; reason: string }[]
  /** Fila por fila: con `dryRun` es lo que PASARÍA; sin él, lo que pasó. */
  rows: IUserBulkRowPlan[]
  /** Contraseñas temporales de los creados. Vacío en `dryRun`. */
  credentials: { name: string; email: string; temporaryPassword: string }[]
  /** true = solo previsualización, no se escribió nada en la base. */
  dryRun: boolean
}

export interface IUserResponse {
  _id: Types.ObjectId
  email: string
  name: string
  role: RoleDocument
  client: ClientDocument
  password?: string
  isActive: boolean
  permissions: IUserPermissions
  dni?: string
  employeeCode?: string
  area?: string
  cargo?: string
  address?: string
  phone?: string
  /** @deprecated usar approverIds. */
  coordinatorId?:
    | Types.ObjectId
    | { _id: Types.ObjectId; name?: string; email?: string }
  approverIds?: (
    | Types.ObjectId
    | { _id: Types.ObjectId; name?: string; email?: string }
  )[]
  mustChangePassword?: boolean
  signature?: string
  bankAccount?: {
    bankName: string
    accountNumber: string
    cci: string
    accountType: string
  }
  /** Cuenta en dólares, para los depósitos de solicitudes en USD. */
  bankAccountUsd?: {
    bankName: string
    accountNumber: string
    cci: string
    accountType: string
  }
  profilePic?: string
  emailNotificationsEnabled?: boolean
  /** Vacaciones programadas y su suplente (VD-124). */
  vacaciones?: Suplencia
}

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    // Solo lectura: resuelve los centros de costo por código/nombre en la
    // carga masiva de usuarios (columnas de permisos).
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    private readonly roleService: RoleService
  ) {}

  /**
   * Valida que cada id de la cadena de aprobadores corresponda a un usuario
   * activo con rol Coordinador del mismo cliente. Devuelve la cadena ordenada
   * como ObjectId[] (o `[]` si se envía una lista vacía, lo que limpia la cadena).
   */
  private async validateApproverChain(
    approverIds: string[],
    clientId: string | null
  ): Promise<Types.ObjectId[]> {
    if (approverIds.length === 0) return []
    const coordinadorRole = await this.roleService.getByName('Coordinador')
    if (!coordinadorRole) {
      throw new BadRequestException('No existe el rol Coordinador en el sistema')
    }
    const found = await this.userModel
      .find({
        _id: { $in: approverIds.map(id => new Types.ObjectId(id)) },
        roleId: (coordinadorRole as any)._id,
        clientId: clientId ? new Types.ObjectId(clientId) : null,
        isActive: { $ne: false },
      })
      .select('_id')
      .exec()
    const foundIds = new Set(found.map(u => u._id.toString()))
    const missing = approverIds.filter(id => !foundIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(
        'Todos los aprobadores deben ser usuarios activos con rol Coordinador de la misma empresa'
      )
    }
    return approverIds.map(id => new Types.ObjectId(id))
  }

  /**
   * Valida y normaliza los niveles de aprobación propios de un colaborador
   * (regla 1.10). A diferencia de `validateApproverChain` (cadena plana
   * legacy) NO se exige el rol Coordinador: se admite cualquier usuario activo
   * de la misma empresa, igual que en los niveles de un centro de costo.
   * Los niveles sin aprobadores se descartan (regla 1.6: un nivel vacío
   * simplemente no existe).
   */
  private async validateApproverLevels(
    levels: { level: number; userIds: string[] }[],
    clientId: string | null,
    ownerUserId: string
  ): Promise<ApproverLevel[]> {
    const normalized = levels
      .map(l => ({ level: l.level, userIds: [...new Set((l.userIds ?? []).map(String))] }))
      .filter(l => l.userIds.length > 0)
    if (normalized.length === 0) return []

    const seen = new Set<number>()
    for (const l of normalized) {
      if (!Number.isInteger(l.level) || l.level < 1) {
        throw new BadRequestException(
          `Nivel de aprobación inválido: ${l.level}. Debe ser un número entero mayor o igual a 1.`
        )
      }
      if (seen.has(l.level)) {
        throw new BadRequestException(`El nivel ${l.level} está repetido.`)
      }
      seen.add(l.level)
      if (l.userIds.includes(ownerUserId)) {
        throw new BadRequestException(
          `El colaborador no puede ser su propio aprobador (nivel ${l.level}).`
        )
      }
    }

    const allIds = [...new Set(normalized.flatMap(l => l.userIds))]
    const found = await this.userModel
      .find({
        _id: { $in: allIds.map(id => new Types.ObjectId(id)) },
        clientId: clientId ? new Types.ObjectId(clientId) : null,
        isActive: { $ne: false },
      })
      .select('_id')
      .exec()
    const foundIds = new Set(found.map(u => u._id.toString()))
    const missing = allIds.filter(id => !foundIds.has(id))
    if (missing.length > 0) {
      throw new BadRequestException(
        'Todos los aprobadores deben ser usuarios activos de la misma empresa'
      )
    }

    return normalized.map(l => ({
      level: l.level,
      userIds: l.userIds.map(id => new Types.ObjectId(id)),
    }))
  }

  async findAllWithClient(): Promise<IUserResponse[]> {
    const users = await this.userModel
      .find()
      .populate('roleId')
      .populate('clientId')
      .exec()
    return users.map(user => ({
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.roleId as unknown as RoleDocument,
      client: user.clientId as unknown as ClientDocument,
      isActive: user.isActive,
      permissions: (user as any).permissions || {
        modules: [],
        canApproveL1: false,
        canApproveL2: false,
      },
      dni: (user as any).dni,
      employeeCode: (user as any).employeeCode,
      area: (user as any).area,
      cargo: (user as any).cargo,
      address: (user as any).address,
      phone: (user as any).phone,
    }))
  }

  async findAllByEmail(email: string): Promise<IUserResponse[]> {
    const users = await this.userModel
      .find({ email })
      .populate('roleId')
      .populate('clientId')
      .exec()
    return users.map(user => ({
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.roleId as unknown as RoleDocument,
      client: user.clientId as unknown as ClientDocument,
      password: user.password,
      isActive: user.isActive,
      permissions: (user as any).permissions || {
        modules: [],
        canApproveL1: false,
        canApproveL2: false,
      },
      dni: (user as any).dni,
      employeeCode: (user as any).employeeCode,
      area: (user as any).area,
      cargo: (user as any).cargo,
      address: (user as any).address,
      phone: (user as any).phone,
      mustChangePassword: !!(user as any).mustChangePassword,
      signature: (user as any).signature,
    }))
  }

  async findByEmail(email: string): Promise<IUserResponse | null> {
    const user = await this.userModel
      .findOne({ email })
      .populate('roleId')
      .populate('clientId')
      .exec()
    if (!user) {
      return null
    }
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.roleId as unknown as RoleDocument,
      client: user.clientId as unknown as ClientDocument,
      password: user.password,
      isActive: user.isActive,
      permissions: (user as any).permissions || {
        modules: [],
        canApproveL1: false,
        canApproveL2: false,
      },
      dni: (user as any).dni,
      employeeCode: (user as any).employeeCode,
      area: (user as any).area,
      cargo: (user as any).cargo,
      address: (user as any).address,
      phone: (user as any).phone,
      mustChangePassword: !!(user as any).mustChangePassword,
      signature: (user as any).signature,
    }
  }

  async findOne(id: string): Promise<IUserResponse> {
    const user = await this.userModel
      .findById(id)
      .populate('roleId')
      .populate('clientId')
      .populate('coordinatorId', 'name email')
      .populate('approverIds', 'name email')
      .exec()
    if (!user) {
      return {} as IUserResponse
    }
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.roleId as unknown as RoleDocument,
      client: user.clientId as unknown as ClientDocument,
      isActive: user.isActive,
      permissions: (user as any).permissions || {
        modules: [],
        canApproveL1: false,
        canApproveL2: false,
      },
      dni: (user as any).dni,
      employeeCode: (user as any).employeeCode,
      area: (user as any).area,
      cargo: (user as any).cargo,
      address: (user as any).address,
      phone: (user as any).phone,
      coordinatorId: (user as any).coordinatorId,
      approverIds: (user as any).approverIds,
      bankAccount: (user as any).bankAccount,
      bankAccountUsd: (user as any).bankAccountUsd,
      signature: (user as any).signature,
      mustChangePassword: !!(user as any).mustChangePassword,
      profilePic: (user as any).profilePic,
      emailNotificationsEnabled: !!(user as any).emailNotificationsEnabled,
      vacaciones: (user as any).vacaciones,
    }
  }

  async create(
    userData: CreateUserDto
  ): Promise<IUserResponse & { temporaryPassword: string }> {
    const clientId = userData.clientId
      ? new Types.ObjectId(userData.clientId)
      : null
    const roleId = new Types.ObjectId(userData.roleId)

    const issetUser = await this.userModel.findOne({
      email: userData.email,
      clientId: clientId || null,
    })
    if (issetUser) {
      throw new BadRequestException(
        'El correo ya se encuentra registrado en esta empresa'
      )
    }
    const temporaryPassword =
      Math.random().toString(36).slice(-8) +
      Math.random().toString(36).slice(-4).toUpperCase()
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10)
    const {
      coordinatorId: coordRaw,
      approverIds: approverIdsRaw,
      permissions,
      ...rest
    } = userData as CreateUserDto & {
      coordinatorId?: string
      approverIds?: string[]
      permissions?: IUserPermissions
    }
    const chain = approverIdsRaw
      ? await this.validateApproverChain(approverIdsRaw, userData.clientId)
      : undefined
    const savedUser = await this.userModel.create({
      ...rest,
      roleId,
      clientId,
      password: hashedPassword,
      mustChangePassword: true,
      ...(chain
        ? { approverIds: chain, coordinatorId: chain[0] }
        : { coordinatorId: coordRaw ? new Types.ObjectId(coordRaw) : undefined }),
      ...(permissions ? { permissions } : {}),
    })
    const populatedUser = await this.userModel
      .findById(savedUser._id)
      .populate('roleId')
      .populate('clientId')
      .exec()
    if (!populatedUser) {
      return {} as IUserResponse & { temporaryPassword: string }
    }
    return {
      _id: populatedUser._id,
      email: populatedUser.email,
      name: populatedUser.name,
      role: populatedUser.roleId as unknown as RoleDocument,
      client: populatedUser.clientId as unknown as ClientDocument,
      isActive: populatedUser.isActive,
      permissions: (populatedUser as any).permissions || {
        modules: [],
        canApproveL1: false,
        canApproveL2: false,
      },
      dni: (populatedUser as any).dni,
      employeeCode: (populatedUser as any).employeeCode,
      area: (populatedUser as any).area,
      cargo: (populatedUser as any).cargo,
      address: (populatedUser as any).address,
      phone: (populatedUser as any).phone,
      temporaryPassword,
    }
  }

  /** Colaboradores que tienen a `approverId` en cualquier posición de su cadena de aprobadores. */
  async findUserIdsByApprover(
    approverId: string,
    clientId: string
  ): Promise<Types.ObjectId[]> {
    const users = await this.userModel
      .find({
        approverIds: new Types.ObjectId(approverId),
        clientId: new Types.ObjectId(clientId),
      })
      .select('_id')
      .exec()
    return users.map(u => u._id)
  }

  async findAll(clientId: Types.ObjectId) {
    const users = await this.userModel
      .find({ clientId })
      .populate('roleId')
      .populate('clientId')
      .exec()
    return users.map(user => ({
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.roleId,
      client: user.clientId,
      isActive: user.isActive,
      isCompanyAdmin: (user as any).isCompanyAdmin ?? false,
    }))
  }

  /** Lista mínima de trabajadores activos del cliente, para selectores. */
  async findColaboradoresBasic(clientId: Types.ObjectId | string) {
    // clientId llega como string desde el token JWT pero se almacena como ObjectId:
    // se convierte explícitamente (igual que findAll vía ParseObjectIdPipe).
    const idStr = clientId.toString()
    if (!Types.ObjectId.isValid(idStr)) return []
    const cid = new Types.ObjectId(idStr)
    const users = await this.userModel
      .find({ clientId: cid, isActive: { $ne: false } })
      .select('_id name email dni')
      .sort({ name: 1 })
      .lean()
      .exec()
    return users.map((u: any) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      dni: u.dni,
    }))
  }

  async findAllPaginated(
    clientId: Types.ObjectId,
    opts: {
      page?: number
      limit?: number
      search?: string
      status?: string
      roleName?: string
    } = {}
  ) {
    const page = opts.page ?? 1
    const limit = opts.limit ?? 20
    const skip = (page - 1) * limit
    const filter: any = { clientId }

    if (opts.search) {
      const re = new RegExp(opts.search, 'i')
      filter.$or = [{ name: re }, { email: re }]
    }
    if (opts.status) {
      filter.isActive = opts.status === 'active'
    }
    if (opts.roleName) {
      const role = await this.roleService.getByName(opts.roleName)
      filter.roleId = role ? (role as any)._id : null
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .populate('roleId')
        .populate('clientId')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filter),
    ])
    const pages = Math.ceil(total / limit)
    const data = users.map(user => ({
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.roleId as unknown as RoleDocument,
      client: user.clientId as unknown as ClientDocument,
      isActive: user.isActive,
      permissions: (user as any).permissions || {
        modules: [],
        canApproveL1: false,
        canApproveL2: false,
      },
    }))
    return { data, total, page, pages, limit }
  }

  /**
   * `permissions` se escribe CLAVE POR CLAVE (`permissions.modules`, …), nunca
   * como objeto completo: `findByIdAndUpdate(id, { permissions })` se traduce a
   * `$set: { permissions: <objeto> }`, que REEMPLAZA el subdocumento entero y
   * borra toda clave ausente del DTO. Todos los campos de
   * `UpdatePermissionsDto` son opcionales — el contrato ya era parcial y solo
   * la escritura era total.
   *
   * Eso hacía que cada corrida de `cargar-detroit-2026-08.mjs` (manda 6 de las
   * 8 claves) borrara `otrosGastosOpcionales` y `permitirFechasAnteriores`, y
   * que cualquier PATCH parcial contra `/user/:id/permissions` se llevara por
   * delante centros de costo y aprobadores. `configurar-permisos-roles.mjs`
   * documenta la trampa y la esquiva releyendo y reenviando el objeto entero;
   * con la escritura parcial ese rodeo deja de ser obligatorio.
   */
  async update(id: string, updateUserDto: UpdateUserDto) {
    const { permissions, ...camposRaiz } = updateUserDto
    const updateData: any = { ...camposRaiz }
    const unset: Record<string, ''> = {}

    // Una sola lectura del documento actual, compartida por las validaciones
    // que necesitan el estado previo (clientId, centros de costo ya asignados).
    let existente: any | null | undefined
    const cargarExistente = async () => {
      if (existente === undefined) {
        existente = await this.userModel
          .findById(id)
          .select('clientId permissions')
          .exec()
      }
      return existente
    }

    if (permissions) {
      // El principal se valida contra los centros de costo EFECTIVOS: los del
      // payload si vienen y, si no, los ya guardados. Con escritura parcial un
      // PATCH legítimo puede cambiar el principal sin repetir la lista entera.
      if (permissions.primaryProjectId) {
        const projectIds =
          permissions.projectIds ??
          ((await cargarExistente())?.permissions?.projectIds ?? []).map(String)
        if (!projectIds.includes(permissions.primaryProjectId)) {
          throw new BadRequestException(
            'El centro de costo principal debe estar entre los centros de costo asignados.'
          )
        }
      }

      // Los niveles propios (regla 1.10) son la única clave que no se copia
      // tal cual: se validan contra la empresa antes de escribirse.
      const nivelesValidados =
        permissions.approverLevels !== undefined
          ? await this.validateApproverLevels(
              permissions.approverLevels,
              updateUserDto.clientId ??
                (await cargarExistente())?.clientId?.toString() ??
                null,
              id
            )
          : undefined

      for (const [clave, valor] of Object.entries(permissions)) {
        if (valor === undefined) continue
        updateData[`permissions.${clave}`] =
          clave === 'approverLevels' ? nivelesValidados : valor
      }

      // Sacar de la lista el centro de costo que era principal SIN mandar
      // `primaryProjectId` es justo lo que hace el formulario (lo pone en
      // `undefined` y JSON.stringify lo omite). Con escritura parcial la clave
      // ausente ya no borra nada, así que el principal huérfano hay que
      // quitarlo a mano: si no, el usuario quedaría apuntando a un centro de
      // costo que ya no tiene asignado.
      if (permissions.projectIds && permissions.primaryProjectId === undefined) {
        const actual = (await cargarExistente())?.permissions?.primaryProjectId
        if (actual && !permissions.projectIds.includes(String(actual))) {
          unset['permissions.primaryProjectId'] = ''
        }
      }
    }

    if (updateData.roleId) {
      updateData.roleId = new Types.ObjectId(updateData.roleId)
    }

    if (updateData.clientId) {
      updateData.clientId = new Types.ObjectId(updateData.clientId)
    }

    if (
      'coordinatorId' in updateUserDto &&
      updateUserDto.coordinatorId !== undefined
    ) {
      updateData.coordinatorId = updateUserDto.coordinatorId
        ? new Types.ObjectId(updateUserDto.coordinatorId)
        : null
    }

    if ('approverIds' in updateUserDto && updateUserDto.approverIds !== undefined) {
      let clientIdForValidation = updateUserDto.clientId ?? null
      if (!clientIdForValidation) {
        clientIdForValidation =
          (await cargarExistente())?.clientId?.toString() ?? null
      }
      const chain = await this.validateApproverChain(
        updateUserDto.approverIds,
        clientIdForValidation
      )
      updateData.approverIds = chain
      updateData.coordinatorId = chain[0] ?? null
    }

    return this.userModel
      .findByIdAndUpdate(
        id,
        Object.keys(unset).length
          ? { $set: updateData, $unset: unset }
          : updateData,
        { new: true }
      )
      .populate('roleId')
      .populate('clientId')
      .exec()
  }

  delete(id: string) {
    return this.userModel.findByIdAndDelete(id).exec()
  }

  // --- Suplencia por vacaciones (VD-124) -----------------------------------

  /**
   * Programa (o borra, con `datos = null`) las vacaciones de un aprobador y a
   * quién le deja firmando.
   *
   * El suplente tiene que ser alguien de la misma empresa: la cadena de
   * aprobación vive dentro de un cliente y dejar entrar a un usuario de otro
   * abriría documentos de una empresa a gente de otra.
   */
  async setVacaciones(
    titularId: string,
    datos: { desde: string | Date; hasta: string | Date; suplenteId: string } | null
  ): Promise<UserDocument> {
    const titular = await this.userModel
      .findById(titularId)
      .select('clientId name')
      .exec()
    if (!titular) throw new NotFoundException('Usuario no encontrado')

    if (datos === null) {
      const limpio = await this.userModel
        .findByIdAndUpdate(titularId, { $unset: { vacaciones: '' } }, { new: true })
        .exec()
      return limpio as UserDocument
    }

    if (!Types.ObjectId.isValid(datos.suplenteId)) {
      throw new BadRequestException('El suplente indicado no es válido.')
    }
    if (datos.suplenteId === titularId) {
      throw new BadRequestException('Un usuario no puede ser su propio suplente.')
    }

    // `aFechaLocal` y no `new Date(...)`: un `YYYY-MM-DD` se parsea como
    // medianoche UTC y en Lima retrocede un dia. Tiene que usarse tambien aqui,
    // en la validacion, porque estos mismos Date son los que se le pasan a
    // `normalizarSuplencia` — si llegan corridos, ella solo los clona.
    const desde = aFechaLocal(datos.desde)
    const hasta = aFechaLocal(datos.hasta)
    if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
      throw new BadRequestException('Las fechas de vacaciones no son válidas.')
    }
    if (hasta < desde) {
      throw new BadRequestException(
        'La fecha de fin de vacaciones no puede ser anterior a la de inicio.'
      )
    }

    const suplente = await this.userModel
      .findById(datos.suplenteId)
      .select('clientId isActive name')
      .exec()
    if (!suplente) throw new NotFoundException('El suplente indicado no existe.')
    if (!suplente.isActive) {
      throw new BadRequestException('El suplente indicado está inactivo.')
    }
    if (String(suplente.clientId) !== String(titular.clientId)) {
      throw new BadRequestException(
        'El suplente debe pertenecer a la misma empresa que el titular.'
      )
    }

    const vacaciones = normalizarSuplencia({
      desde,
      hasta,
      suplenteId: datos.suplenteId,
    })
    const actualizado = await this.userModel
      .findByIdAndUpdate(titularId, { $set: { vacaciones } }, { new: true })
      .exec()
    return actualizado as UserDocument
  }

  /**
   * Titulares que este usuario está cubriendo AHORA por suplencia de
   * vacaciones. Es la consulta que alimenta a `identidadesDelActor` en el motor
   * de cadena, así que corre en cada acción de aprobación y va indexada
   * (`vacaciones.suplenteId + desde + hasta`).
   *
   * UN SOLO SALTO a propósito: si un titular cubierto está a su vez de
   * vacaciones, no se sigue la cadena hacia su suplente. Encadenar suplencias
   * abre ciclos y vuelve imposible explicarle a alguien por qué le apareció un
   * documento que no reconoce.
   */
  async findTitularesCubiertosPor(
    suplenteId: string,
    clientId?: string,
    ref: Date = new Date()
  ): Promise<{ _id: string; name: string }[]> {
    if (!Types.ObjectId.isValid(suplenteId)) return []
    const filtro: Record<string, unknown> = {
      'vacaciones.suplenteId': new Types.ObjectId(suplenteId),
      'vacaciones.desde': { $lte: ref },
      'vacaciones.hasta': { $gte: ref },
      isActive: true,
    }
    if (clientId && Types.ObjectId.isValid(clientId)) {
      filtro.clientId = new Types.ObjectId(clientId)
    }
    const titulares = await this.userModel
      .find(filtro)
      .select('_id name')
      .lean<{ _id: Types.ObjectId; name: string }[]>()
      .exec()
    return titulares.map(t => ({ _id: String(t._id), name: t.name }))
  }

  /** Solo los ids, que es lo que necesita el motor de cadena. */
  async idsTitularesCubiertosPor(
    suplenteId: string,
    clientId?: string,
    ref: Date = new Date()
  ): Promise<string[]> {
    return (await this.findTitularesCubiertosPor(suplenteId, clientId, ref)).map(
      t => t._id
    )
  }

  /**
   * Titulares que el actor cubre PARA FIRMAR ESTE DOCUMENTO. Igual que
   * `idsTitularesCubiertosPor`, salvo que devuelve vacío cuando el actor es
   * quien creó el documento: la suplencia no habilita a aprobarse a uno mismo,
   * misma idea que el escalamiento de la regla 1.5 cuando el creador aparece
   * entre los aprobadores de su propio nivel.
   *
   * Un documento así queda esperando al titular o a otro nivel de la cadena;
   * es el precio de no dejar que nadie se apruebe solo.
   */
  async idsTitularesCubiertosPara(
    actorId: string,
    documento:
      | { clientId?: unknown; userId?: unknown; createdBy?: unknown }
      | null
      | undefined,
    ref: Date = new Date()
  ): Promise<string[]> {
    // El dueño se llama `userId` en las rendiciones y `createdBy` en los
    // comprobantes; hay que mirar los dos o la regla se cae en la mitad de los
    // documentos.
    const dueno = documento?.userId ?? documento?.createdBy
    if (dueno && String(dueno) === String(actorId)) {
      return []
    }
    return this.idsTitularesCubiertosPor(
      actorId,
      documento?.clientId ? String(documento.clientId) : undefined,
      ref
    )
  }

  /**
   * TODAS las suplencias vigentes de la empresa: quién está de vacaciones y
   * quién lo cubre.
   *
   * No es lo mismo que `findTitularesCubiertosPor`, que responde "¿a quién
   * cubro YO?". Esto lo necesita cualquiera que mire un documento: el
   * colaborador que rinde y Contabilidad ven en la cadena el nombre del
   * titular y se quedan esperando a alguien que está de vacaciones. Con esta
   * lista, la pantalla puede decir quién va a firmar de verdad.
   *
   * Es una lista corta (los que estén de vacaciones hoy) y va indexada, así que
   * el front la pide una vez y anota con ella cualquier cadena.
   */
  async findSuplenciasVigentes(
    clientId: string,
    ref: Date = new Date()
  ): Promise<
    { titularId: string; titularName: string; suplenteId: string; suplenteName: string }[]
  > {
    if (!Types.ObjectId.isValid(clientId)) return []
    const titulares = await this.userModel
      .find({
        clientId: new Types.ObjectId(clientId),
        'vacaciones.desde': { $lte: ref },
        'vacaciones.hasta': { $gte: ref },
        isActive: true,
      })
      .select('_id name vacaciones')
      .lean<{ _id: Types.ObjectId; name: string; vacaciones: Suplencia }[]>()
      .exec()
    if (titulares.length === 0) return []

    const suplentes = await this.userModel
      .find({ _id: { $in: titulares.map(t => t.vacaciones.suplenteId) }, isActive: true })
      .select('_id name')
      .lean<{ _id: Types.ObjectId; name: string }[]>()
      .exec()
    const nombre = new Map(suplentes.map(u => [String(u._id), u.name]))

    return titulares
      .filter(t => nombre.has(String(t.vacaciones.suplenteId)))
      .map(t => ({
        titularId: String(t._id),
        titularName: t.name,
        suplenteId: String(t.vacaciones.suplenteId),
        suplenteName: nombre.get(String(t.vacaciones.suplenteId))!,
      }))
  }

  /**
   * Suplente vigente de un titular, o `null` si no está de vacaciones. Se usa
   * en el otro sentido que la consulta anterior: las cadenas nombran al
   * titular, y los avisos tienen que llegarle a quien de verdad puede firmar.
   */
  async resolverSuplenteVigente(
    titularId: string,
    ref: Date = new Date()
  ): Promise<{ _id: string; name: string; email: string } | null> {
    if (!Types.ObjectId.isValid(titularId)) return null
    const titular = await this.userModel
      .findById(titularId)
      .select('vacaciones')
      .lean<{ vacaciones?: Suplencia }>()
      .exec()
    if (!suplenciaVigente(titular?.vacaciones, ref)) return null

    const suplente = await this.userModel
      .findById(titular!.vacaciones!.suplenteId)
      .select('_id name email isActive')
      .lean<{ _id: Types.ObjectId; name: string; email: string; isActive: boolean }>()
      .exec()
    if (!suplente || !suplente.isActive) return null
    return { _id: String(suplente._id), name: suplente.name, email: suplente.email }
  }

  /** Firma y cadena de aprobadores para validar solicitudes transaccionales (viáticos). */
  async findTransactionalProfile(userId: string): Promise<{
    signature?: string
    coordinatorId?: Types.ObjectId
    approverIds?: Types.ObjectId[]
    projectIds?: string[]
    primaryProjectId?: string
    /** Niveles propios del colaborador (regla 1.10). */
    approverLevels?: ApproverLevel[]
    /** Permite solicitar viáticos con fechas anteriores a hoy. */
    permitirFechasAnteriores?: boolean
  } | null> {
    const u = await this.userModel
      .findById(userId)
      .select(
        'signature coordinatorId approverIds permissions.projectIds permissions.primaryProjectId permissions.approverLevels permissions.permitirFechasAnteriores'
      )
      .exec()
    if (!u) return null
    return {
      signature: u.signature,
      coordinatorId: u.coordinatorId,
      approverIds: u.approverIds,
      projectIds: u.permissions?.projectIds ?? [],
      primaryProjectId: u.permissions?.primaryProjectId,
      approverLevels: u.permissions?.approverLevels,
      permitirFechasAnteriores: u.permissions?.permitirFechasAnteriores === true,
    }
  }

  async findEmailNameClient(
    userId: string
  ): Promise<{ email: string; name: string; clientId: Types.ObjectId } | null> {
    const u = await this.userModel
      .findById(userId)
      .select('email name clientId')
      .exec()
    if (!u) return null
    return {
      email: u.email,
      name: u.name,
      clientId: u.clientId,
    }
  }

  /** Datos para plantillas de correo viáticos (Fase 3 — nombre, documento, área, cargo). */
  async findCollaboratorViaticoNotifyProfile(userId: string): Promise<{
    name: string
    dni?: string
    employeeCode?: string
    area?: string
    cargo?: string
  } | null> {
    const u = await this.userModel
      .findById(userId)
      .select('name dni employeeCode area cargo')
      .exec()
    if (!u) return null
    return {
      name: u.name,
      dni: u.dni,
      employeeCode: u.employeeCode,
      area: u.area,
      cargo: u.cargo,
    }
  }

  /**
   * Destinatarios notificación solicitud aprobada → contabilidad/tesorería (Fase 3).
   * Administradores del cliente + módulos `tesoreria` o `contabilidad`.
   */
  async findViaticoAccountingNotifyRecipients(
    clientId: string
  ): Promise<{ email: string; name: string }[]> {
    const contabilidadRole = await this.roleService.getByName('Contabilidad')
    if (!contabilidadRole) return []

    // Solo rol Contabilidad. Administrador NO es Contabilidad: tiene su propio
    // canal de notificaciones (findAdminsByClient). Los módulos de UI tampoco
    // cuentan: habilitan pantallas pero no implican ser destinatario contable.
    const scopedUsers = await this.userModel
      .find({
        clientId: new Types.ObjectId(clientId),
        isActive: true,
        emailNotificationsEnabled: true,
        roleId: (contabilidadRole as any)._id,
      })
      .select('email name')
      .exec()

    // Global Contabilidad users (clientId = null) — always notified
    const contabilidadUsers = contabilidadRole
      ? await this.userModel
          .find({
            clientId: null,
            roleId: (contabilidadRole as any)._id,
            isActive: true,
            emailNotificationsEnabled: true,
          })
          .select('email name')
          .exec()
      : []

    const seen = new Set<string>()
    const out: { email: string; name: string }[] = []
    for (const u of [...scopedUsers, ...contabilidadUsers]) {
      const em = u.email?.trim().toLowerCase()
      if (!em || seen.has(em)) continue
      seen.add(em)
      out.push({ email: u.email, name: u.name })
    }
    return out
  }

  /**
   * Solo usuarios con rol Contabilidad. No incluye administradores ni
   * a quienes tengan los módulos tesoreria/contabilidad por permiso de UI.
   */
  async findContabilidadRecipients(
    clientId: string
  ): Promise<{ email: string; name: string }[]> {
    const contabilidadRole = await this.roleService.getByName('Contabilidad')
    if (!contabilidadRole) return []

    const scopedUsers = await this.userModel
      .find({
        clientId: new Types.ObjectId(clientId),
        isActive: true,
        emailNotificationsEnabled: true,
        roleId: (contabilidadRole as any)._id,
      })
      .select('email name')
      .exec()

    const globalContabilidad = contabilidadRole
      ? await this.userModel
          .find({
            clientId: null,
            roleId: (contabilidadRole as any)._id,
            isActive: true,
            emailNotificationsEnabled: true,
          })
          .select('email name')
          .exec()
      : []

    const seen = new Set<string>()
    const out: { email: string; name: string }[] = []
    for (const u of [...scopedUsers, ...globalContabilidad]) {
      const em = u.email?.trim().toLowerCase()
      if (!em || seen.has(em)) continue
      seen.add(em)
      out.push({ email: u.email, name: u.name })
    }
    return out
  }

  /**
   * Destinatarios de los correos "pendiente de pago" (rendición/viático
   * aprobado). Reemplaza la antigua lista libre `Client.tesoreriaEmails`:
   * ahora se notifica a los usuarios del cliente con rol Tesoreria.
   */
  async findTesoreriaNotifyRecipients(
    clientId: string
  ): Promise<{ email: string; name: string }[]> {
    const tesoreriaRole = await this.roleService.getByName('Tesoreria')
    if (!tesoreriaRole) return []

    const scopedUsers = await this.userModel
      .find({
        clientId: new Types.ObjectId(clientId),
        isActive: true,
        emailNotificationsEnabled: true,
        roleId: (tesoreriaRole as any)._id,
      })
      .select('email name')
      .exec()

    const seen = new Set<string>()
    const out: { email: string; name: string }[] = []
    for (const u of scopedUsers) {
      const em = u.email?.trim().toLowerCase()
      if (!em || seen.has(em)) continue
      seen.add(em)
      out.push({ email: u.email, name: u.name })
    }
    return out
  }

  /**
   * Usuarios con rol Contabilidad (sin filtrar por emailNotificationsEnabled,
   * porque hay flujos que separan notificación in-app del correo).
   * NO incluye usuarios cuyo único vínculo con contabilidad sean permisos de módulo.
   */
  async findContabilidadUsersForNotif(clientId: string): Promise<
    {
      _id: string
      email: string
      name: string
      emailNotificationsEnabled: boolean
    }[]
  > {
    const contabilidadRole = await this.roleService.getByName('Contabilidad')
    if (!contabilidadRole) return []

    const scopedUsers = await this.userModel
      .find({
        clientId: new Types.ObjectId(clientId),
        isActive: true,
        roleId: (contabilidadRole as any)._id,
      })
      .select('_id email name emailNotificationsEnabled')
      .exec()

    const globalContabilidad = contabilidadRole
      ? await this.userModel
          .find({
            clientId: null,
            roleId: (contabilidadRole as any)._id,
            isActive: true,
          })
          .select('_id email name emailNotificationsEnabled')
          .exec()
      : []

    const seen = new Set<string>()
    const out: {
      _id: string
      email: string
      name: string
      emailNotificationsEnabled: boolean
    }[] = []
    for (const u of [...scopedUsers, ...globalContabilidad]) {
      const em = u.email?.trim().toLowerCase()
      if (!em || seen.has(em)) continue
      seen.add(em)
      out.push({
        _id: String((u as any)._id),
        email: u.email,
        name: u.name,
        emailNotificationsEnabled: !!(u as any).emailNotificationsEnabled,
      })
    }
    return out
  }

  /**
   * Destinatarios para "Aprobación final requerida" (pending_l2).
   * Incluye: rol Contabilidad o usuarios con `permissions.canApproveL2 = true`.
   * `canApproveL2` es una asignación explícita de aprobador, no un permiso de UI.
   * NO incluye a quienes solo tengan los módulos tesoreria/contabilidad por permiso de pantalla.
   */
  async findL2ApprovalNotifyRecipients(
    clientId: string
  ): Promise<{ email: string; name: string }[]> {
    const contabilidadRole = await this.roleService.getByName('Contabilidad')

    const scopedUsers = await this.userModel
      .find({
        clientId: new Types.ObjectId(clientId),
        isActive: true,
        emailNotificationsEnabled: true,
        $or: [
          ...(contabilidadRole
            ? [{ roleId: (contabilidadRole as any)._id }]
            : []),
          { 'permissions.canApproveL2': true },
        ],
      })
      .select('email name')
      .exec()

    const globalContabilidad = contabilidadRole
      ? await this.userModel
          .find({
            clientId: null,
            roleId: (contabilidadRole as any)._id,
            isActive: true,
            emailNotificationsEnabled: true,
          })
          .select('email name')
          .exec()
      : []

    const seen = new Set<string>()
    const out: { email: string; name: string }[] = []
    for (const u of [...scopedUsers, ...globalContabilidad]) {
      const em = u.email?.trim().toLowerCase()
      if (!em || seen.has(em)) continue
      seen.add(em)
      out.push({ email: u.email, name: u.name })
    }
    return out
  }

  async findAccountingRecipientsWithIds(
    clientId: string
  ): Promise<{ _id: string; email: string; name: string }[]> {
    const contabilidadRole = await this.roleService.getByName('Contabilidad')
    if (!contabilidadRole) return []

    // Solo rol Contabilidad. Administrador NO recibe estos correos: tiene su
    // propio canal vía findAdminsByClient cuando aplica.
    const scopedUsers = await this.userModel
      .find({
        clientId: new Types.ObjectId(clientId),
        isActive: true,
        emailNotificationsEnabled: true,
        roleId: (contabilidadRole as any)._id,
      })
      .select('_id email name')
      .exec()

    const contabilidadUsers = contabilidadRole
      ? await this.userModel
          .find({
            clientId: null,
            roleId: (contabilidadRole as any)._id,
            isActive: true,
            emailNotificationsEnabled: true,
          })
          .select('_id email name')
          .exec()
      : []

    const seen = new Set<string>()
    const out: { _id: string; email: string; name: string }[] = []
    for (const u of [...scopedUsers, ...contabilidadUsers]) {
      const em = u.email?.trim().toLowerCase()
      if (!em || seen.has(em)) continue
      seen.add(em)
      out.push({ _id: String((u as any)._id), email: u.email, name: u.name })
    }
    return out
  }

  /**
   * Usuarios con rol Tesorería (scoped + globales), con `_id` para poder crear
   * notificaciones in-app además de correo. Espejo de
   * `findAccountingRecipientsWithIds`. Tesorería es quien ejecuta reembolsos
   * (VD-37), por eso necesita recibir el aviso de reembolso pendiente.
   */
  async findTesoreriaRecipientsWithIds(
    clientId: string
  ): Promise<{ _id: string; email: string; name: string }[]> {
    const tesoreriaRole = await this.roleService.getByName('Tesoreria')
    if (!tesoreriaRole) return []

    const scopedUsers = await this.userModel
      .find({
        clientId: new Types.ObjectId(clientId),
        isActive: true,
        emailNotificationsEnabled: true,
        roleId: (tesoreriaRole as any)._id,
      })
      .select('_id email name')
      .exec()

    const globalUsers = await this.userModel
      .find({
        clientId: null,
        roleId: (tesoreriaRole as any)._id,
        isActive: true,
        emailNotificationsEnabled: true,
      })
      .select('_id email name')
      .exec()

    const seen = new Set<string>()
    const out: { _id: string; email: string; name: string }[] = []
    for (const u of [...scopedUsers, ...globalUsers]) {
      const em = u.email?.trim().toLowerCase()
      if (!em || seen.has(em)) continue
      seen.add(em)
      out.push({ _id: String((u as any)._id), email: u.email, name: u.name })
    }
    return out
  }

  async changeOwnPassword(userId: string, newPassword: string): Promise<void> {
    const hashed = await bcrypt.hash(newPassword, 10)
    await this.userModel
      .findByIdAndUpdate(userId, {
        password: hashed,
        mustChangePassword: false,
      })
      .exec()
  }

  async resetPassword(id: string): Promise<{ temporaryPassword: string }> {
    const user = await this.userModel.findById(id).exec()
    if (!user) throw new NotFoundException('Usuario no encontrado')
    const temporaryPassword =
      Math.random().toString(36).slice(-8) +
      Math.random().toString(36).slice(-4).toUpperCase()
    const hashed = await bcrypt.hash(temporaryPassword, 10)
    await this.userModel
      .findByIdAndUpdate(id, { password: hashed, mustChangePassword: true })
      .exec()
    return { temporaryPassword }
  }

  /** Normaliza un encabezado: minúsculas, sin tildes, sin espacios extra. */
  private normalizeHeader(h: string): string {
    return String(h)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  /** Alias de encabezados (ES/EN) a los campos canónicos del importador. */
  private static readonly BULK_HEADER_ALIASES: Record<string, string> = {
    name: 'name',
    nombre: 'name',
    nombres: 'name',
    'nombre completo': 'name',
    email: 'email',
    correo: 'email',
    'correo electronico': 'email',
    'e-mail': 'email',
    mail: 'email',
    dni: 'dni',
    documento: 'dni',
    'nro documento': 'dni',
    'numero de documento': 'dni',
    tipodocumento: 'documentType',
    'tipo documento': 'documentType',
    'tipo de documento': 'documentType',
    subcuenta14: 'subcuenta14',
    'sub cuenta 14': 'subcuenta14',
    'subcuenta 14': 'subcuenta14',
    employeecode: 'employeeCode',
    codigo: 'employeeCode',
    'codigo empleado': 'employeeCode',
    'codigo de empleado': 'employeeCode',
    'codigo colaborador': 'employeeCode',
    area: 'area',
    cargo: 'cargo',
    puesto: 'cargo',
    phone: 'phone',
    telefono: 'phone',
    celular: 'phone',
    movil: 'phone',
    address: 'address',
    direccion: 'address',
    domicilio: 'address',
    role: 'role',
    rol: 'role',
    perfil: 'role',
    bankname: 'bankName',
    banco: 'bankName',
    'nombre banco': 'bankName',
    accountnumber: 'accountNumber',
    'numero cuenta': 'accountNumber',
    'numero de cuenta': 'accountNumber',
    cuenta: 'accountNumber',
    'nro cuenta': 'accountNumber',
    cci: 'cci',
    'codigo cci': 'cci',
    accounttype: 'accountType',
    'tipo cuenta': 'accountType',
    'tipo de cuenta': 'accountType',
    tipocuenta: 'accountType',
    // --- Permisos. Se prefijan con "permisos_" en la plantilla para dejar
    // claro que NO son datos del colaborador sino su configuración de
    // permisos: centros de costo asignados y aprobadores propios.
    permisos_centrosdecosto: 'permProjects',
    'permisos centros de costo': 'permProjects',
    'centros de costo': 'permProjects',
    'centro de costo': 'permProjects',
    permisos_centrodecostoprincipal: 'permPrimaryProject',
    'permisos centro de costo principal': 'permPrimaryProject',
    'centro de costo principal': 'permPrimaryProject',
    permisos_aprobadorn1: 'permApproversN1',
    'permisos aprobador n1': 'permApproversN1',
    'aprobador n1': 'permApproversN1',
    'aprobador nivel 1': 'permApproversN1',
    permisos_aprobadorn2: 'permApproversN2',
    'permisos aprobador n2': 'permApproversN2',
    'aprobador n2': 'permApproversN2',
    'aprobador nivel 2': 'permApproversN2',
  }

  /** Separadores admitidos en las columnas de lista del Excel. */
  private static readonly BULK_LIST_SEPARATOR = /[,;]/

  /** Trocea una celda de lista ("A, B; C") en valores limpios. */
  private splitBulkList(value: string): string[] {
    return value
      .split(UserService.BULK_LIST_SEPARATOR)
      .map(v => v.trim())
      .filter(Boolean)
  }

  private mapBulkRow(raw: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(raw)) {
      const field = UserService.BULK_HEADER_ALIASES[this.normalizeHeader(key)]
      if (field && value !== undefined && value !== null) {
        out[field] = String(value).trim()
      }
    }
    return out
  }

  /** Permisos por defecto según el rol (espejo de la creación manual en el front). */
  private defaultPermissionsForRole(roleName: string): IUserPermissions & {
    categoryIds: string[]
  } {
    const ALL_NON_COLAB = [
      'nueva-rendicion',
      'rendiciones',
      'viaticos',
      'consolidated-invoices',
      'tesoreria',
      'configuracion',
      'audit-log',
    ]
    switch (roleName) {
      case 'Coordinador':
        return {
          modules: ['rendiciones', 'viaticos', 'tesoreria'],
          canApproveL1: true,
          canApproveL2: false,
          categoryIds: [],
        }
      case 'Contabilidad':
        return {
          modules: ALL_NON_COLAB,
          canApproveL1: true,
          canApproveL2: true,
          categoryIds: [],
        }
      case 'Tesoreria':
        return {
          // Rendir lo suyo se habilita asignándole los módulos de rendición
          // desde la pantalla de permisos, como a cualquier otro rol (VD-115).
          modules: ['tesoreria'],
          canApproveL1: false,
          canApproveL2: false,
          categoryIds: [],
        }
      case 'Administrador':
        return {
          modules: ALL_NON_COLAB,
          canApproveL1: false,
          canApproveL2: false,
          categoryIds: [],
        }
      case 'Colaborador':
      default:
        return {
          modules: ['mis-rendiciones', 'nueva-rendicion', 'viaticos'],
          canApproveL1: false,
          canApproveL2: false,
          categoryIds: [],
        }
    }
  }

  /** Encabezados de la hoja "Usuarios" de la plantilla de carga masiva. */
  static readonly BULK_TEMPLATE_HEADERS = [
    'nombre',
    'email',
    'dni',
    'tipoDocumento',
    'codigoEmpleado',
    'subcuenta14',
    'area',
    'cargo',
    'telefono',
    'direccion',
    'rol',
    'banco',
    'numeroCuenta',
    'cci',
    'tipoCuenta',
    'permisos_centrosDeCosto',
    'permisos_centroDeCostoPrincipal',
    'permisos_aprobadorN1',
    'permisos_aprobadorN2',
  ]

  /** Ancho de cada columna de la hoja "Colaboradores", en el mismo orden. */
  static readonly BULK_TEMPLATE_WIDTHS = [
    26, 30, 12, 14, 16, 14, 18, 20, 14, 28, 14, 12, 22, 24, 12, 28, 26, 30,
    30,
  ]

  /**
   * Filas de la plantilla de carga masiva con los colaboradores que la
   * empresa YA tiene, en el mismo orden de columnas que espera el
   * importador. Sirve para editar en bloque: se descarga, se cambian las
   * columnas `permisos_*` y se vuelve a subir. Los centros de costo salen
   * por código y los aprobadores por email, que es lo que el importador
   * sabe resolver de vuelta.
   */
  async buildBulkTemplateData(clientId: string): Promise<{
    rows: string[][]
    costCenters: { code: string; name: string }[]
  }> {
    if (!clientId) return { rows: [], costCenters: [] }
    const clientObjectId = new Types.ObjectId(clientId)
    const users = await this.userModel
      .find({ clientId: clientObjectId })
      .populate('roleId', 'name')
      .sort({ name: 1 })
      .exec()

    // Catálogo de la hoja de ayuda: lo que se puede poner en las columnas
    // de centro de costo, con el mismo código que resuelve el importador.
    const catalogo = await this.projectModel
      .find({ clientId: clientObjectId, isActive: { $ne: false } })
      .select('code name')
      .sort({ code: 1 })
      .exec()
    const costCenters = catalogo.map(p => ({
      code: p.code ?? '',
      name: p.name ?? '',
    }))
    if (!users.length) return { rows: [], costCenters }

    // Una sola consulta por catálogo para no resolver id por id.
    const projectIds = new Set<string>()
    const relatedUserIds = new Set<string>()
    for (const u of users) {
      for (const p of u.permissions?.projectIds ?? []) projectIds.add(String(p))
      if (u.permissions?.primaryProjectId) {
        projectIds.add(String(u.permissions.primaryProjectId))
      }
      for (const level of u.permissions?.approverLevels ?? []) {
        for (const id of level.userIds ?? []) relatedUserIds.add(String(id))
      }
    }
    const toObjectIds = (ids: Set<string>) =>
      [...ids].filter(id => Types.ObjectId.isValid(id)).map(id => new Types.ObjectId(id))

    const projects = projectIds.size
      ? await this.projectModel
          .find({ _id: { $in: toObjectIds(projectIds) } })
          .select('code name')
          .exec()
      : []
    const projectLabel = new Map(
      projects.map(p => [String(p._id), p.code || p.name])
    )
    const related = relatedUserIds.size
      ? await this.userModel
          .find({ _id: { $in: toObjectIds(relatedUserIds) } })
          .select('email')
          .exec()
      : []
    const emailById = new Map(related.map(u => [String(u._id), u.email]))

    const labelOf = (id?: string) => (id && projectLabel.get(String(id))) || ''
    const approversOf = (u: UserDocument, level: number) =>
      (u.permissions?.approverLevels ?? [])
        .find(l => l.level === level)
        ?.userIds?.map(id => emailById.get(String(id)) ?? "")
        .filter(Boolean)
        .join(', ') ?? ''

    const rows = users.map(u => [
      u.name ?? '',
      u.email ?? '',
      u.dni ?? '',
      u.documentType ?? '',
      u.employeeCode ?? '',
      u.subcuenta14 ?? '',
      u.area ?? '',
      u.cargo ?? '',
      u.phone ?? '',
      u.address ?? '',
      ((u.roleId as unknown as { name?: string })?.name) ?? '',
      u.bankAccount?.bankName ?? '',
      u.bankAccount?.accountNumber ?? '',
      u.bankAccount?.cci ?? '',
      u.bankAccount?.accountType ?? '',
      (u.permissions?.projectIds ?? [])
        .map(id => labelOf(String(id)))
        .filter(Boolean)
        .join(', '),
      labelOf(u.permissions?.primaryProjectId),
      approversOf(u, 1),
      approversOf(u, 2),
    ])
    return { rows, costCenters }
  }

  /**
   * Carga masiva de colaboradores desde Excel — mismo patrón que la de órdenes
   * de trabajo: la plantilla se descarga con los colaboradores que ya existen,
   * se edita y se vuelve a subir. Una fila cuyo email ya está en la empresa
   * lo ACTUALIZA en vez de fallar por duplicada; las filas nuevas crean al
   * colaborador. El email es la llave.
   *
   * La actualización alcanza a todo lo que trae el archivo — datos, cuenta
   * bancaria, rol y permisos — con una regla: una celda vacía significa "no
   * toques ese dato", nunca "bórralo", para que una fila incompleta no vacíe
   * medio perfil.
   *
   * Con `opts.dryRun` no escribe nada: devuelve el mismo resultado (contadores
   * y el plan fila por fila) para que el usuario vea qué se va a crear y qué se
   * va a modificar ANTES de aceptar la carga.
   */
  async bulkImportUsers(
    rawRows: Array<Record<string, any>>,
    clientId: string,
    opts: { dryRun?: boolean } = {}
  ): Promise<IUserBulkImportResult> {
    const dryRun = opts.dryRun === true
    const result: IUserBulkImportResult = {
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: [],
      rows: [],
      credentials: [],
      dryRun,
    }

    const fallo = (row: number, email: string, reason: string) => {
      result.errors.push({ row, reason })
      result.rows.push({ row, email, accion: 'error', reason })
    }

    if (!clientId) {
      result.errors.push({
        row: 0,
        reason: 'No se pudo determinar la empresa destino',
      })
      return result
    }
    const clientObjectId = new Types.ObjectId(clientId)

    // Etiquetas legibles para el plan de la previsualización: el usuario ve
    // códigos de centro de costo y emails, no ObjectIds.
    const projectLabelById = new Map<string, string>()
    const emailById = new Map<string, string>()

    const allowedRoles = [
      'Colaborador',
      'Coordinador',
      'Contabilidad',
      'Administrador',
      'Tesoreria',
    ]
    const roleCache = new Map<string, Types.ObjectId | null>()
    const resolveRole = async (
      name: string
    ): Promise<Types.ObjectId | null> => {
      const match = allowedRoles.find(
        r => r.toLowerCase() === name.toLowerCase()
      )
      const roleName = match || 'Colaborador'
      if (roleCache.has(roleName)) return roleCache.get(roleName)!
      const role = await this.roleService.getByName(roleName)
      const id = role ? ((role as any)._id as Types.ObjectId) : null
      roleCache.set(roleName, id)
      return id
    }

    /** 'ahorros' | 'corriente' de la celda, o undefined si no vale. */
    const tipoDeCuenta = (valor?: string) => {
      const v = (valor || '').toLowerCase()
      return v === 'corriente' || v === 'ahorros' ? v : undefined
    }
    /** Tipo de documento válido de la celda ('R'|'L'|'P'|'E'|'M'). */
    const tipoDeDocumento = (valor?: string) => {
      const v = (valor || '').toUpperCase()
      return ['R', 'L', 'P', 'E', 'M'].includes(v)
        ? (v as 'R' | 'L' | 'P' | 'E' | 'M')
        : undefined
    }
    /**
     * Nombre de rol canónico de la celda. `null` = la celda trae algo que no
     * es un rol del sistema; `undefined` = celda vacía ('no lo toques').
     */
    const nombreDeRol = (valor?: string) => {
      if (!valor) return undefined
      return (
        allowedRoles.find(r => r.toLowerCase() === valor.toLowerCase()) ??
        null
      )
    }

    // Nombres de rol por id: solo para el "Rol: antes → después" del plan.
    const roleNameById = new Map<string, string>()
    const cargarNombresDeRol = async () => {
      if (roleNameById.size) return
      const roles = (await this.roleService.findAll()) as any[]
      for (const r of roles ?? []) roleNameById.set(String(r._id), r.name)
    }

    // Cache de usuarios por email: lo usan los aprobadores N1/N2 de las
    // columnas de permisos.
    const userByEmailCache = new Map<string, Types.ObjectId | null>()
    const resolveUserByEmail = async (
      email: string
    ): Promise<Types.ObjectId | null> => {
      const key = email.toLowerCase()
      if (userByEmailCache.has(key)) return userByEmailCache.get(key)!
      const u = await this.userModel
        .findOne({ email: key, clientId: clientObjectId })
        .select('_id')
        .exec()
      const id = u ? u._id : null
      userByEmailCache.set(key, id)
      if (id) emailById.set(String(id), key)
      return id
    }

    const labelProject = async (id?: string | null): Promise<string> => {
      if (!id) return ''
      const key = String(id)
      const cached = projectLabelById.get(key)
      if (cached !== undefined) return cached
      const p = Types.ObjectId.isValid(key)
        ? await this.projectModel
            .findById(key)
            .select('code name')
            .exec()
        : null
      const label = p ? p.code || p.name || key : key
      projectLabelById.set(key, label)
      return label
    }
    const labelUser = async (id?: string | null): Promise<string> => {
      if (!id) return ''
      const key = String(id)
      const cached = emailById.get(key)
      if (cached !== undefined) return cached
      const u = Types.ObjectId.isValid(key)
        ? await this.userModel.findById(key).select('email').exec()
        : null
      const label = u?.email || key
      emailById.set(key, label)
      return label
    }

    // Centros de costo por código o por nombre: el Excel del cliente usa
    // indistintamente uno u otro. Se cachean por texto normalizado.
    const projectCache = new Map<string, string | null>()
    const resolveProject = async (token: string): Promise<string | null> => {
      const key = token.trim().toLowerCase()
      if (!key) return null
      if (projectCache.has(key)) return projectCache.get(key)!
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const p = await this.projectModel
        .findOne({
          clientId: clientObjectId,
          $or: [
            { code: { $regex: `^${escaped}$`, $options: 'i' } },
            { name: { $regex: `^${escaped}$`, $options: 'i' } },
          ],
        })
        .select('code name')
        .exec()
      const id = p ? String(p._id) : null
      projectCache.set(key, id)
      if (p && id) projectLabelById.set(id, p.code || p.name || key)
      return id
    }

    /**
     * Traduce las columnas de permisos de la fila (centros de costo y
     * aprobadores N1/N2) al bloque que persiste `permissions`. Devuelve
     * `overrides: null` cuando la fila no trae ninguna de esas columnas, para
     * distinguir "no lo toques" de "déjalo vacío". Un centro de costo o un
     * email de aprobador inexistente es un ERROR de fila explícito: nunca se
     * descarta en silencio, igual que en la carga masiva de centros de costo.
     */
    const buildPermissionOverrides = async (
      row: Record<string, string>
    ): Promise<{
      overrides: BulkPermissionOverrides | null
      error: string | null
    }> => {
      const raw = {
        projects: row.permProjects || '',
        primary: row.permPrimaryProject || '',
        n1: row.permApproversN1 || '',
        n2: row.permApproversN2 || '',
      }
      if (!raw.projects && !raw.primary && !raw.n1 && !raw.n2) {
        return { overrides: null, error: null }
      }

      const overrides: BulkPermissionOverrides = {}
      const projectIds: string[] = []
      for (const token of this.splitBulkList(raw.projects)) {
        const id = await resolveProject(token)
        if (!id) {
          return {
            overrides: null,
            error: `Centro de costo "${token}" no encontrado en esta empresa`,
          }
        }
        if (!projectIds.includes(id)) projectIds.push(id)
      }

      if (raw.primary) {
        const primaryId = await resolveProject(raw.primary)
        if (!primaryId) {
          return {
            overrides: null,
            error: `Centro de costo principal "${raw.primary}" no encontrado en esta empresa`,
          }
        }
        // El principal siempre forma parte de los asignados: el schema pide
        // que primaryProjectId esté contenido en projectIds.
        if (!projectIds.includes(primaryId)) projectIds.push(primaryId)
        overrides.primaryProjectId = primaryId
      }
      if (raw.projects || raw.primary) overrides.projectIds = projectIds

      const approverLevels: ApproverLevel[] = []
      const levels: [number, string][] = [
        [1, raw.n1],
        [2, raw.n2],
      ]
      for (const [level, value] of levels) {
        if (!value) continue
        const userIds: Types.ObjectId[] = []
        for (const approverEmail of this.splitBulkList(value)) {
          const id = await resolveUserByEmail(approverEmail)
          if (!id) {
            return {
              overrides: null,
              error: `Aprobador N${level} "${approverEmail}" no encontrado en esta empresa`,
            }
          }
          if (!userIds.some(u => u.equals(id))) userIds.push(id)
        }
        if (userIds.length) approverLevels.push({ level, userIds })
      }
      // Un nivel sin aprobadores no se persiste (regla 1.6). Si ambas
      // columnas vienen presentes pero vacías, se limpian los niveles
      // propios y la cadena vuelve a la del centro de costo principal.
      if (raw.n1 || raw.n2) overrides.approverLevels = approverLevels

      return { overrides, error: null }
    }

    /**
     * Bloque de permisos definitivo para un colaborador que ya existe. El
     * archivo solo tiene columnas N1 y N2, así que los niveles superiores
     * que ya tuviera configurados se conservan: una carga masiva no puede
     * borrar en silencio lo que no sabe expresar.
     */
    const combinarPermisos = (
      actuales: Record<string, any>,
      overrides: BulkPermissionOverrides
    ): Record<string, any> => {
      const combinados: Record<string, any> = { ...actuales, ...overrides }
      if (overrides.approverLevels) {
        const superiores = (actuales.approverLevels ?? []).filter(
          (l: ApproverLevel) => l.level > 2
        )
        combinados.approverLevels = [
          ...overrides.approverLevels,
          ...superiores,
        ].sort((a, b) => a.level - b.level)
      }
      return combinados
    }

    /**
     * Qué le cambia la fila a los DATOS de un colaborador que ya existe
     * (todo lo que no son permisos, el rol incluido). Una celda vacía
     * significa "no toques ese dato", nunca "bórralo": así una fila pegada
     * de otro archivo no vacía medio perfil.
     */
    const describirCambiosDatos = async (
      actual: UserDocument,
      row: Record<string, string>
    ): Promise<{
      cambios: Record<string, unknown>
      detalles: string[]
      error: string | null
    }> => {
      const doc = actual.toObject() as Record<string, any>
      const cambios: Record<string, unknown> = {}
      const detalles: string[] = []

      const simples: [string, string, string | undefined][] = [
        ['name', 'Nombre', row.name],
        ['dni', 'DNI', row.dni],
        ['documentType', 'Tipo de documento', tipoDeDocumento(row.documentType)],
        ['employeeCode', 'Código de empleado', row.employeeCode],
        ['subcuenta14', 'Subcuenta 14', row.subcuenta14],
        ['area', 'Área', row.area],
        ['cargo', 'Cargo', row.cargo],
        ['phone', 'Teléfono', row.phone],
        ['address', 'Dirección', row.address],
      ]
      for (const [campo, etiqueta, valor] of simples) {
        if (!valor || String(doc[campo] ?? '') === valor) continue
        cambios[campo] = valor
        detalles.push(`${etiqueta}: ${doc[campo] || '—'} → ${valor}`)
      }

      // La cuenta bancaria se mezcla campo a campo: traer solo el CCI no
      // debe borrar el banco ni el número de cuenta.
      const banco: Record<string, any> = doc.bankAccount ?? {}
      const nuevoBanco = { ...banco }
      const subcampos: [string, string, string | undefined][] = [
        ['bankName', 'Banco', row.bankName],
        ['accountNumber', 'N° de cuenta', row.accountNumber],
        ['cci', 'CCI', row.cci],
        ['accountType', 'Tipo de cuenta', tipoDeCuenta(row.accountType)],
      ]
      for (const [campo, etiqueta, valor] of subcampos) {
        if (!valor || String(banco[campo] ?? '') === valor) continue
        nuevoBanco[campo] = valor
        detalles.push(`${etiqueta}: ${banco[campo] || '—'} → ${valor}`)
        cambios.bankAccount = nuevoBanco
      }

      const roleName = nombreDeRol(row.role)
      if (roleName === null) {
        return {
          cambios: {},
          detalles: [],
          error: `El rol "${row.role}" no existe`,
        }
      }
      if (roleName) {
        const roleId = await resolveRole(roleName)
        if (!roleId) {
          return {
            cambios: {},
            detalles: [],
            error: `El rol "${roleName}" no existe`,
          }
        }
        if (String(doc.roleId) !== String(roleId)) {
          await cargarNombresDeRol()
          cambios.roleId = roleId
          detalles.push(
            `Rol: ${roleNameById.get(String(doc.roleId)) || '—'} → ${roleName}`
          )
        }
      }

      return { cambios, detalles, error: null }
    }

    /** Etiquetas de una lista de centros de costo, para el detalle del plan. */
    const etiquetasProyectos = async (ids: unknown[]): Promise<string> => {
      const labels: string[] = []
      for (const id of ids ?? []) {
        const label = await labelProject(String(id))
        if (label) labels.push(label)
      }
      return labels.join(', ')
    }
    const nivel = (levels: ApproverLevel[] | undefined, level: number) =>
      (levels ?? []).find(l => l.level === level)?.userIds ?? []
    const etiquetasAprobadores = async (ids: unknown[]): Promise<string> => {
      const labels: string[] = []
      for (const id of ids ?? []) {
        const label = await labelUser(String(id))
        if (label) labels.push(label)
      }
      return labels.join(', ')
    }
    const mismosIds = (a: unknown[] = [], b: unknown[] = []) => {
      const norm = (list: unknown[]) => list.map(String).sort().join('|')
      return norm(a) === norm(b)
    }

    /**
     * Qué le cambia el archivo a un colaborador que ya existe. Lista vacía =
     * la fila no le cambia nada, y entonces cuenta como "sin cambios".
     */
    const describirCambios = async (
      actuales: Record<string, any>,
      overrides: BulkPermissionOverrides
    ): Promise<string[]> => {
      const detalles: string[] = []
      if (
        overrides.projectIds &&
        !mismosIds(actuales.projectIds ?? [], overrides.projectIds)
      ) {
        const antes = await etiquetasProyectos(actuales.projectIds ?? [])
        const despues = await etiquetasProyectos(overrides.projectIds)
        detalles.push(`Centros de costo: ${antes || '—'} → ${despues || '—'}`)
      }
      if (
        overrides.primaryProjectId &&
        String(actuales.primaryProjectId ?? '') !==
          String(overrides.primaryProjectId)
      ) {
        const antes = await labelProject(actuales.primaryProjectId)
        const despues = await labelProject(overrides.primaryProjectId)
        detalles.push(`Principal: ${antes || '—'} → ${despues || '—'}`)
      }
      if (overrides.approverLevels) {
        for (const level of [1, 2]) {
          const antesIds = nivel(actuales.approverLevels, level)
          const despuesIds = nivel(overrides.approverLevels, level)
          if (mismosIds(antesIds, despuesIds)) continue
          const antes = await etiquetasAprobadores(antesIds)
          const despues = await etiquetasAprobadores(despuesIds)
          detalles.push(
            `Aprobadores N${level}: ${antes || '—'} → ${despues || '—'}`
          )
        }
      }
      return detalles
    }

    const seenEmails = new Set<string>()
    let rowNumber = 1
    for (const raw of rawRows) {
      rowNumber++
      const row = this.mapBulkRow(raw)
      const email = (row.email || '').toLowerCase()
      try {
        if (!email) {
          fallo(rowNumber, '', 'La fila no trae email')
          continue
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          fallo(rowNumber, email, 'Email inválido')
          continue
        }
        if (seenEmails.has(email)) {
          fallo(rowNumber, email, 'Email repetido en este mismo archivo')
          continue
        }

        const { overrides: permissionOverrides, error: permissionError } =
          await buildPermissionOverrides(row)
        if (permissionError) {
          fallo(rowNumber, email, permissionError)
          continue
        }

        const exists = await this.userModel
          .findOne({ email, clientId: clientObjectId })
          .exec()
        if (exists) {
          seenEmails.add(email)
          const actuales =
            ((exists.toObject() as Record<string, any>).permissions as
              | Record<string, any>
              | undefined) ?? {}
          const datos = await describirCambiosDatos(exists, row)
          if (datos.error) {
            fallo(rowNumber, email, datos.error)
            continue
          }
          const detalles = [
            ...datos.detalles,
            ...(permissionOverrides
              ? await describirCambios(actuales, permissionOverrides)
              : []),
          ]
          if (!detalles.length) {
            result.unchanged++
            result.rows.push({
              row: rowNumber,
              email,
              accion: 'sin-cambios',
              detalle: 'Ya está igual que en el archivo',
            })
            continue
          }
          if (!dryRun) {
            if (permissionOverrides) {
              exists.set(
                'permissions',
                combinarPermisos(actuales, permissionOverrides)
              )
            }
            for (const [campo, valor] of Object.entries(datos.cambios)) {
              exists.set(campo, valor)
            }
            await exists.save()
          }
          result.updated++
          result.rows.push({
            row: rowNumber,
            email,
            accion: 'actualizar',
            detalle: detalles.join(' · '),
          })
          continue
        }

        const roleName = nombreDeRol(row.role) ?? 'Colaborador'
        if (nombreDeRol(row.role) === null) {
          fallo(rowNumber, email, `El rol "${row.role}" no existe`)
          continue
        }
        const roleId = await resolveRole(roleName)
        if (!roleId) {
          fallo(rowNumber, email, `El rol "${roleName}" no existe`)
          continue
        }

        const accountType = tipoDeCuenta(row.accountType)
        const bankAccount =
          row.bankName || row.accountNumber || row.cci
            ? {
                bankName: row.bankName || '',
                accountNumber: row.accountNumber || '',
                cci: row.cci || '',
                accountType: accountType || 'ahorros',
              }
            : undefined

        const documentType = tipoDeDocumento(row.documentType)

        const name = row.name || email
        if (!dryRun) {
          const temporaryPassword =
            Math.random().toString(36).slice(-8) +
            Math.random().toString(36).slice(-4).toUpperCase()
          const hashed = await bcrypt.hash(temporaryPassword, 10)
          await this.userModel.create({
            name,
            email,
            password: hashed,
            roleId,
            clientId: clientObjectId,
            mustChangePassword: true,
            permissions: {
              ...this.defaultPermissionsForRole(roleName),
              ...(permissionOverrides ?? {}),
            },
            ...(row.dni ? { dni: row.dni } : {}),
            ...(documentType ? { documentType } : {}),
            ...(row.subcuenta14 ? { subcuenta14: row.subcuenta14 } : {}),
            ...(row.employeeCode ? { employeeCode: row.employeeCode } : {}),
            ...(row.area ? { area: row.area } : {}),
            ...(row.cargo ? { cargo: row.cargo } : {}),
            ...(row.address ? { address: row.address } : {}),
            ...(row.phone ? { phone: row.phone } : {}),
            ...(bankAccount ? { bankAccount } : {}),
          })
          result.credentials.push({ name, email, temporaryPassword })
        }
        seenEmails.add(email)
        result.created++
        const centros = await etiquetasProyectos(
          permissionOverrides?.projectIds ?? []
        )
        result.rows.push({
          row: rowNumber,
          email,
          accion: 'crear',
          detalle: [
            `Rol: ${roleName}`,
            centros ? `Centros de costo: ${centros}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        })
      } catch (e: any) {
        fallo(rowNumber, email, e?.message || 'Error desconocido')
      }
    }
    return result
  }

  async findAdminsByClient(clientId: string): Promise<UserDocument[]> {
    const roles = await this.roleService.getAdminRoles()
    const roleIds = roles.map(r => (r as any)._id)
    const superAdminRole = roles.find(r => r.name === 'Superadministrador')

    return this.userModel
      .find({
        $or: [
          { clientId: new Types.ObjectId(clientId) },
          { roleId: superAdminRole?._id, clientId: { $exists: false } },
          { roleId: superAdminRole?._id, clientId: null },
        ],
        roleId: { $in: roleIds },
        isActive: true,
      })
      .exec()
  }

  async deleteByClientId(clientId: string): Promise<void> {
    await this.userModel
      .deleteMany({ clientId: new Types.ObjectId(clientId) })
      .exec()
  }

  /** Retorna true solo si el usuario tiene notificaciones por correo habilitadas. */
  async isEmailEnabled(userId: string): Promise<boolean> {
    const u = await this.userModel
      .findById(userId)
      .select('emailNotificationsEnabled')
      .exec()
    return !!(u as any)?.emailNotificationsEnabled
  }

  async setEmailNotifications(userId: string, enabled: boolean): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(userId, { emailNotificationsEnabled: enabled })
      .exec()
  }

  /** Retorna el coordinatorId del usuario, o null si no tiene coordinador asignado. */
  async findUserCoordinatorId(userId: string): Promise<Types.ObjectId | null> {
    const u = await this.userModel
      .findById(userId)
      .select('coordinatorId')
      .lean<{ coordinatorId?: Types.ObjectId }>()
      .exec()
    return u?.coordinatorId ?? null
  }

  /**
   * Usuarios de Administrador + Contabilidad de un cliente que tienen email habilitado.
   * Usados para enviar recordatorios semanales de rendiciones pendientes de contabilidad.
   */
  /**
   * Administradores + Contabilidad activos de un cliente.
   * Incluye `emailNotificationsEnabled` para que el caller decida si enviar correo.
   * El in-app se envía siempre; el correo solo si el flag está activo.
   */
  async findRendicionApprovalUsers(
    clientId: string
  ): Promise<{ _id: string; email: string; name: string; emailNotificationsEnabled: boolean }[]> {
    const [contabilidadRole, adminRoles] = await Promise.all([
      this.roleService.getByName('Contabilidad'),
      this.roleService.getAdminRoles(),
    ])

    const roleIds = [
      ...adminRoles.map(r => (r as any)._id),
      ...(contabilidadRole ? [(contabilidadRole as any)._id] : []),
    ]

    const users = await this.userModel
      .find({
        clientId: new Types.ObjectId(clientId),
        roleId: { $in: roleIds },
        isActive: true,
      })
      .select('_id email name emailNotificationsEnabled')
      .lean<{ _id: Types.ObjectId; email: string; name: string; emailNotificationsEnabled?: boolean }[]>()
      .exec()

    return users.map(u => ({
      _id: u._id.toString(),
      email: u.email,
      name: u.name,
      emailNotificationsEnabled: !!u.emailNotificationsEnabled,
    }))
  }
}
