import {
  Controller,
  Post,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Get,
  Req,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
  ForbiddenException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import * as ExcelJS from 'exceljs'
import { UserService } from './user.service'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorador'
import { ROLES } from '../auth/enums/roles.enum'
import { CreateUserDto } from './dto/create-user.dto'
import { Types } from 'mongoose'
import { UpdateUserDto, UpdatePermissionsDto } from './dto/update-user.dto'
import { SetVacacionesDto } from './dto/set-vacaciones.dto'
import { ParseObjectIdPipe } from './pipes/parse-objectid.pipe'
import { AuditLogService } from '../audit-log/audit-log.service'
import { ProjectService } from '../project/project.service'

@Controller('user')
export class UserController {
  constructor(
    private userService: UserService,
    private auditLogService: AuditLogService,
    private projectService: ProjectService
  ) {}

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN)
  @Get()
  async findAllWithClient() {
    return await this.userService.findAllWithClient()
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Post()
  async create(@Body() createdUserDto: CreateUserDto, @Request() req: any) {
    const result = await this.userService.create(createdUserDto)
    this.auditLogService.log({
      userId: req.user._id || req.user.sub,
      userName: req.user.name || req.user.email,
      action: 'create_user',
      module: 'usuarios',
      entityId: (result as any)?._id?.toString(),
      details: createdUserDto.email,
      clientId: req.user.clientId,
    })
    return result
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.CONTABILIDAD,
    ROLES.COLABORADOR,
    ROLES.TESORERIA
  )
  @Get('client/:clientId')
  async findAll(
    @Param('clientId', ParseObjectIdPipe) clientId: Types.ObjectId,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('roleName') roleName?: string,
    @Req() req?: any
  ) {
    const role: string = req?.user?.roles?.[0] ?? ''

    if (role === ROLES.COLABORADOR) {
      const hasRendicionesPermission =
        req?.user?.permissions?.modules?.includes('rendiciones')
      const userId = req?.user?._id || req?.user?.sub
      const isApprover =
        !hasRendicionesPermission &&
        (await this.projectService.isApproverForClient(
          userId?.toString(),
          clientId.toString()
        ))
      if (!hasRendicionesPermission && !isApprover) {
        throw new ForbiddenException(
          'No tienes permiso para ver usuarios de esta empresa'
        )
      }
    }

    if (role !== ROLES.SUPER_ADMIN && role !== ROLES.CONTABILIDAD) {
      const tokenClientId = req?.user?.clientId?.toString()
      if (!tokenClientId || tokenClientId !== clientId.toString()) {
        throw new ForbiddenException(
          'No tienes permiso para ver usuarios de esta empresa'
        )
      }
    }

    if (page || limit || search || status || roleName) {
      return this.userService.findAllPaginated(clientId, {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        search,
        status,
        roleName,
      })
    }
    return this.userService.findAll(clientId)
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getMe(@Request() req: any) {
    const userId = req.user._id || req.user.sub
    return await this.userService.findOne(userId.toString())
  }

  /**
   * Lista mínima de colaboradores (trabajadores activos) de la empresa del usuario.
   * Pensada para selectores (p. ej. colaborador por fila en planilla de movilidad):
   * accesible a cualquier usuario autenticado y acotada a su propio clientId.
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('colaboradores')
  async findColaboradores(@Req() req: any) {
    const clientId = req.user?.clientId
    if (!clientId) return []
    return this.userService.findColaboradoresBasic(clientId.toString())
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Get('details/:id')
  async findOne(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return await this.userService.findOne(id.toString())
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile')
  async updateOwnProfile(
    @Body() body: { name?: string; profilePic?: string },
    @Request() req: any
  ) {
    const userId = req.user._id || req.user.sub
    const updateData: UpdateUserDto = {}
    if (body.name?.trim()) updateData.name = body.name.trim()
    if (body.profilePic !== undefined) updateData.profilePic = body.profilePic
    return await this.userService.update(userId, updateData)
  }

  // --- Suplencia por vacaciones (VD-124) -----------------------------------
  //
  // Las rutas `profile/...` van declaradas ANTES que `:id/...`: Express casa
  // por orden de registro y `profile` entraría como `:id` si fuera al revés.

  /**
   * A quién cubre ahora mismo el usuario y qué suplencia tiene programada él.
   * El front lo usa para el aviso "estás aprobando en reemplazo de X", que es
   * lo que evita que alguien firme sin saber en nombre de quién.
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('profile/suplencias')
  async getMisSuplencias(@Request() req: any) {
    const userId = (req.user._id || req.user.sub).toString()
    const clientId = req.user?.clientId?.toString()
    const [cubroA, yo] = await Promise.all([
      this.userService.findTitularesCubiertosPor(userId, clientId),
      this.userService.findOne(userId),
    ])
    const vacaciones = yo?.vacaciones ?? null
    if (!vacaciones) return { cubroA, vacaciones: null }
    // El nombre del suplente viaja resuelto: si no, la pantalla tendría que
    // cargar la lista completa de colaboradores solo para traducir un id, y al
    // refrescar —cuando esa lista todavía no está— mostraba "otro usuario".
    const suplente = await this.userService.findEmailNameClient(
      vacaciones.suplenteId.toString()
    )
    // Campo por campo, NUNCA `{ ...vacaciones }`: es un subdocumento de Mongoose
    // y el spread copia sus internos (`$__parent`), que arrastran el documento
    // completo del usuario —con el hash de la contraseña— a la respuesta.
    // Misma trampa que documenta `plainChainStep` en approval-chain.util.ts.
    return {
      cubroA,
      vacaciones: {
        desde: vacaciones.desde,
        hasta: vacaciones.hasta,
        suplenteId: vacaciones.suplenteId.toString(),
        suplenteName: suplente?.name ?? null,
      },
    }
  }

  /**
   * Suplencias vigentes de la empresa. Cualquier usuario autenticado puede
   * leerla: la necesitan el colaborador que rinde y Contabilidad para saber
   * quién va a firmar de verdad, no solo el suplente. Devuelve nombres, no
   * fechas ni motivos.
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('suplencias-vigentes')
  async getSuplenciasVigentes(@Request() req: any) {
    const clientId = req.user?.clientId?.toString()
    if (!clientId) return []
    return this.userService.findSuplenciasVigentes(clientId)
  }

  /** El propio aprobador programa sus vacaciones y deja quién lo reemplaza. */
  @UseGuards(AuthGuard('jwt'))
  @Patch('profile/vacaciones')
  async setMisVacaciones(@Body() dto: SetVacacionesDto, @Request() req: any) {
    const userId = (req.user._id || req.user.sub).toString()
    const result = await this.userService.setVacaciones(userId, dto)
    this.auditLogService.log({
      userId,
      userName: req.user.name || req.user.email,
      action: 'set_vacaciones',
      module: 'usuarios',
      entityId: userId,
      details: `Vacaciones ${dto.desde} a ${dto.hasta}, suplente ${dto.suplenteId}`,
      clientId: req.user.clientId,
    })
    return result
  }

  /** Vuelta anticipada: el titular retoma sus aprobaciones. */
  @UseGuards(AuthGuard('jwt'))
  @Delete('profile/vacaciones')
  async borrarMisVacaciones(@Request() req: any) {
    const userId = (req.user._id || req.user.sub).toString()
    const result = await this.userService.setVacaciones(userId, null)
    this.auditLogService.log({
      userId,
      userName: req.user.name || req.user.email,
      action: 'clear_vacaciones',
      module: 'usuarios',
      entityId: userId,
      details: 'El usuario terminó su período de vacaciones',
      clientId: req.user.clientId,
    })
    return result
  }

  /**
   * Un administrador programa las vacaciones de otro. Hace falta porque el
   * caso típico es justamente que la persona se fue sin dejarlo configurado.
   */
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Patch(':id/vacaciones')
  async setVacaciones(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: SetVacacionesDto,
    @Request() req: any
  ) {
    const result = await this.userService.setVacaciones(id.toString(), dto)
    this.auditLogService.log({
      userId: req.user._id || req.user.sub,
      userName: req.user.name || req.user.email,
      action: 'set_vacaciones',
      module: 'usuarios',
      entityId: id.toString(),
      details: `Vacaciones ${dto.desde} a ${dto.hasta}, suplente ${dto.suplenteId}`,
      clientId: req.user.clientId,
    })
    return result
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Delete(':id/vacaciones')
  async borrarVacaciones(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Request() req: any
  ) {
    const result = await this.userService.setVacaciones(id.toString(), null)
    this.auditLogService.log({
      userId: req.user._id || req.user.sub,
      userName: req.user.name || req.user.email,
      action: 'clear_vacaciones',
      module: 'usuarios',
      entityId: id.toString(),
      details: 'Se dio por terminado el período de vacaciones',
      clientId: req.user.clientId,
    })
    return result
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Patch(':id')
  async update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() updateUserDto: UpdateUserDto
  ) {
    return await this.userService.update(id.toString(), updateUserDto)
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Patch(':id/permissions')
  async updatePermissions(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() permissionsDto: UpdatePermissionsDto,
    @Request() req: any
  ) {
    const result = await this.userService.update(id.toString(), {
      permissions: permissionsDto,
    })
    this.auditLogService.log({
      userId: req.user._id || req.user.sub,
      userName: req.user.name || req.user.email,
      action: 'update_permissions',
      module: 'usuarios',
      entityId: id.toString(),
      details: JSON.stringify(permissionsDto),
      clientId: req.user.clientId,
    })
    return result
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Patch(':id/notifications')
  async updateEmailNotifications(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() body: { emailNotificationsEnabled: boolean },
    @Request() req: any
  ) {
    await this.userService.setEmailNotifications(
      id.toString(),
      !!body.emailNotificationsEnabled
    )
    this.auditLogService.log({
      userId: req.user._id || req.user.sub,
      userName: req.user.name || req.user.email,
      action: 'update_email_notifications',
      module: 'usuarios',
      entityId: id.toString(),
      details: body.emailNotificationsEnabled ? 'activadas' : 'desactivadas',
      clientId: req.user.clientId,
    })
    return { emailNotificationsEnabled: !!body.emailNotificationsEnabled }
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Delete(':id')
  async delete(@Param('id', ParseObjectIdPipe) id: Types.ObjectId) {
    return await this.userService.delete(id.toString())
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Post(':id/reset-password')
  async resetPassword(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Request() req: any
  ) {
    const result = await this.userService.resetPassword(id.toString())
    this.auditLogService.log({
      userId: req.user._id || req.user.sub,
      userName: req.user.name || req.user.email,
      action: 'reset_password',
      module: 'usuarios',
      entityId: id.toString(),
      clientId: req.user.clientId,
    })
    return result
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Post('bulk-import')
  @UseInterceptors(FileInterceptor('file'))
  /**
   * Sube el Excel de colaboradores. Con `dryRun` (lo que manda el front al
   * elegir el archivo) no escribe nada: devuelve el plan — qué se crea, qué
   * permisos se modifican y qué filas fallan — para que el usuario lo acepte
   * antes de la carga real. Mismo patrón que órdenes de trabajo.
   */
  async bulkImport(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { clientId: string; dryRun?: string | boolean },
    @Request() req: any
  ) {
    if (!file) throw new Error('No se recibió archivo')
    const xlsx = await import('xlsx')
    const wb = xlsx.read(file.buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[] = xlsx.utils.sheet_to_json(ws)
    // El Administrador solo puede importar en su propia empresa; el
    // Superadministrador puede indicar la empresa destino vía body.clientId.
    const role: string = req?.user?.roles?.[0] ?? ''
    const clientId =
      role === ROLES.SUPER_ADMIN
        ? body.clientId || req.user?.clientId
        : req.user?.clientId
    // El multipart llega como texto, así que 'true' vale tanto como true.
    const dryRun = body.dryRun === true || body.dryRun === 'true'
    const result = await this.userService.bulkImportUsers(rows, clientId, {
      dryRun,
    })
    // Una previsualización no cambió nada: no hay nada que auditar.
    if (!dryRun) {
      this.auditLogService.log({
        userId: req.user._id || req.user.sub,
        userName: req.user.name || req.user.email,
        action: 'bulk_import_users',
        module: 'usuarios',
        details: `Creados: ${result.created}, Actualizados: ${result.updated}, Sin cambios: ${result.unchanged}, Errores: ${result.errors.length}`,
        clientId,
      })
    }
    return result
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @Get('bulk-import/template')
  /**
   * Excel de carga masiva de colaboradores, con el mismo formato que el de
   * órdenes de trabajo: encabezado destacado, anchos de columna, una hoja de
   * instrucciones y el catálogo de centros de costo a mano.
   *
   * Baja con los colaboradores que la empresa YA tiene y sus permisos actuales,
   * para editarlo y volver a subirlo. Solo cuando todavía no hay ninguno se
   * entrega la fila de ejemplo.
   */
  async downloadTemplate(@Request() req: any) {
    const { rows, costCenters } = await this.userService.buildBulkTemplateData(
      req.user?.clientId
    )
    const exampleRow = [
      'Juan Pérez',
      'juan@empresa.com',
      '12345678',
      'L',
      'EMP-001',
      '',
      'Operaciones',
      'Analista',
      '999888777',
      'Av. Siempre Viva 123',
      'Colaborador',
      'BCP',
      '1912345678901',
      '00219112345678901234',
      'ahorros',
      costCenters[0]?.code || 'CC-001',
      costCenters[0]?.code || 'CC-001',
      'jefe@empresa.com',
      'gerente@empresa.com',
    ]

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Viatika'

    const sheet = workbook.addWorksheet('Colaboradores')
    sheet.addRow(UserService.BULK_TEMPLATE_HEADERS)
    const headerRow = sheet.getRow(1)
    headerRow.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A5F' },
      }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
    headerRow.height = 22
    sheet.columns = UserService.BULK_TEMPLATE_HEADERS.map((key, i) => ({
      key,
      width: UserService.BULK_TEMPLATE_WIDTHS[i] ?? 20,
    }))
    // La cabecera se queda fija al desplazarse: son 20 columnas.
    sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }]

    for (const fila of rows.length ? rows : [exampleRow]) sheet.addRow(fila)
    if (!rows.length) {
      sheet.getRow(2).font = { italic: true, color: { argb: 'FF888888' } }
    }

    const instrSheet = workbook.addWorksheet('Instrucciones')
    instrSheet.addRow(['Campo', 'Requerido', 'Descripción'])
    instrSheet.getRow(1).font = { bold: true }
    const instrucciones: [string, string, string][] = [
      ['nombre', 'Sí', 'Nombre completo del colaborador.'],
      ['email', 'Sí', 'Único por empresa. Es la llave: si ya existe, la fila lo actualiza en vez de crear a nadie. El email en sí no se puede cambiar desde aquí.'],
      ['dni', 'No', 'Número de documento.'],
      ['tipoDocumento', 'No', 'R=RUC, L=DNI, P=Pasaporte, E=C.Ext., M=C.Mil. Por defecto: L (DNI).'],
      ['codigoEmpleado', 'No', 'Código del colaborador en planilla.'],
      ['subcuenta14', 'No', 'Subcuenta contable 14 (asientos Contanet). Si va vacía, se usa el DNI.'],
      ['area', 'No', 'Área organizacional.'],
      ['cargo', 'No', 'Cargo del colaborador.'],
      ['telefono', 'No', 'Teléfono de contacto.'],
      ['direccion', 'No', 'Dirección del colaborador.'],
      ['rol', 'No', 'Colaborador, Coordinador, Contabilidad, Tesoreria o Administrador. Por defecto: Colaborador.'],
      ['banco', 'No', 'Banco de la cuenta de abono.'],
      ['numeroCuenta', 'No', 'Número de cuenta del banco.'],
      ['cci', 'No', 'Código de cuenta interbancario.'],
      ['tipoCuenta', 'No', 'ahorros o corriente.'],
      [
        'permisos_centrosDeCosto',
        'No',
        'Centros de costo asignados: código o nombre, varios separados por coma ("123, 223, 423"). Ver la hoja "Centros de Costo Disponibles".',
      ],
      [
        'permisos_centroDeCostoPrincipal',
        'No',
        'Cuál de ellos es el principal. Si no está en la lista anterior se agrega solo. Vacío = se usa el primero.',
      ],
      [
        'permisos_aprobadorN1',
        'No',
        'Aprobadores propios de Nivel 1: email(s) de usuarios ya existentes, separados por coma. Sustituyen a los del centro de costo principal.',
      ],
      [
        'permisos_aprobadorN2',
        'No',
        'Aprobadores propios de Nivel 2, mismo formato que N1. Las dos columnas vacías = se usan los aprobadores del centro de costo.',
      ],
    ]
    for (const fila of instrucciones) instrSheet.addRow(fila)
    instrSheet.columns = [
      { key: 'Campo', width: 32 },
      { key: 'Requerido', width: 12 },
      { key: 'Descripción', width: 90 },
    ]
    instrSheet.addRow([])
    instrSheet.addRow(['Cómo funciona la carga:']).font = { bold: true }
    instrSheet.addRow([
      'El archivo baja con los colaboradores que ya existen. Al subirlo, las filas cuyo email ya está en la empresa ACTUALIZAN sus permisos y las filas nuevas CREAN al colaborador.',
    ])
    instrSheet.addRow([
      'De un colaborador que ya existe se actualiza todo lo que traiga la fila: datos, cuenta bancaria, rol y permisos.',
    ])
    instrSheet.addRow([
      'Una celda vacía NO borra el dato: significa "no lo toques". Para vaciar un campo, hazlo desde la ficha del colaborador.',
    ])
    instrSheet.addRow([
      'Antes de guardar nada se muestra en pantalla qué se crea y qué se modifica, para aceptarlo.',
    ])
    instrSheet.addRow([
      'Si una fila falla (centro de costo o aprobador inexistente, email repetido), solo se reporta esa fila; el resto del archivo se procesa igual.',
    ])
    instrSheet.addRow([
      'La contraseña de los colaboradores nuevos se genera automáticamente y se descarga al terminar la carga.',
    ])

    const codesSheet = workbook.addWorksheet('Centros de Costo Disponibles')
    codesSheet.addRow(['Código', 'Nombre'])
    codesSheet.getRow(1).font = { bold: true }
    for (const cc of costCenters) codesSheet.addRow([cc.code, cc.name])
    codesSheet.columns = [
      { key: 'Código', width: 20 },
      { key: 'Nombre', width: 42 },
    ]

    const buffer = await workbook.xlsx.writeBuffer()
    return {
      file: Buffer.from(buffer).toString('base64'),
      filename: 'colaboradores.xlsx',
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile/password')
  async changeOwnPassword(
    @Body() body: { password: string },
    @Request() req: any
  ) {
    const userId = req.user._id || req.user.sub
    await this.userService.changeOwnPassword(userId, body.password)
    return { message: 'Contraseña actualizada correctamente' }
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('profile/signature')
  async updateSignature(
    @Body() body: { signature: string },
    @Request() req: any
  ) {
    const userId = req.user._id || req.user.sub
    const result = await this.userService.update(userId, {
      signature: body.signature,
    })
    this.auditLogService.log({
      userId: userId,
      userName: req.user.name || req.user.email,
      action: 'update_signature',
      module: 'usuarios',
      entityId: userId,
      details: 'El usuario actualizó su firma digital',
      clientId: req.user.clientId,
    })
    return result
  }
}
