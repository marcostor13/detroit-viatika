import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import * as XLSX from 'xlsx'
import { OrdenTrabajoService } from './orden-trabajo.service'
import { CreateOrdenTrabajoDto } from './dto/create-orden-trabajo.dto'
import { UpdateOrdenTrabajoDto } from './dto/update-orden-trabajo.dto'
import { Roles } from '../auth/decorators/roles.decorador'
import { ROLES } from '../auth/enums/roles.enum'
import { RolesGuard } from '../auth/guards/roles.guard'
import { AuditLogService } from '../audit-log/audit-log.service'

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('orden-trabajo')
export class OrdenTrabajoController {
  constructor(
    private readonly ordenTrabajoService: OrdenTrabajoService,
    private readonly auditLogService: AuditLogService
  ) {}

  private resolveClientId(req: any, fallback?: string): string {
    const raw = req?.user?.clientId
    const fromUser =
      raw && typeof raw === 'object' && '_id' in raw ? String(raw._id) : raw
    const clientId = fromUser || fallback
    if (!clientId) {
      throw new Error('No se pudo determinar la empresa del usuario')
    }
    return String(clientId)
  }

  @Post()
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  async create(@Body() dto: CreateOrdenTrabajoDto, @Request() req: any) {
    const clientId = this.resolveClientId(req, dto.clientId)
    const result = await this.ordenTrabajoService.create(dto, clientId)
    this.auditLogService.log({
      userId: req.user._id || req.user.sub,
      userName: req.user.name || req.user.email,
      action: 'create_orden_trabajo',
      module: 'configuracion',
      entityId: (result as any)?._id?.toString(),
      details: `${(result as any).nombre}`,
      clientId,
    })
    return result
  }

  /** Parsea "Sí"/"No"/true/false/1/0 (o vacío) del Excel a boolean. Vacío => default. */
  private parseExcelBoolean(value: unknown, defaultValue: boolean): boolean {
    const str = String(value ?? '').trim().toLowerCase()
    if (!str) return defaultValue
    return ['si', 'sí', 'true', '1', 'yes'].includes(str)
  }

  /** Primer valor no vacío entre varios encabezados posibles de la misma columna. */
  private celda(row: Record<string, any>, ...encabezados: string[]): string {
    for (const encabezado of encabezados) {
      const valor = String(row[encabezado] ?? '').trim()
      if (valor) return valor
    }
    return ''
  }

  /**
   * Respaldo para filas pegadas del informe del ERP de Detroit, que trae el
   * nombre partido en sucursal, departamento y número ("LIM" + "SMI" +
   * "00001463-G" => `LIM-SMI-1463-G`, sin los ceros de la izquierda). El archivo
   * que descarga la app NO usa estas columnas: lleva el nombre completo, igual
   * que el formulario de alta. Solo se mira si la fila no trae Nombre.
   */
  private nombreDesdeFormatoDetroit(row: Record<string, any>): string {
    const suc = this.celda(row, 'Suc', 'Sucursal', 'SUC')
    const dep = this.celda(row, 'Dep', 'Departamento', 'DEP')
    const numero = this.celda(row, 'Nº O/T', 'N° O/T', 'No O/T', 'Nro O/T', 'O/T', 'OT')
    if (!suc || !dep || !numero) return ''
    return `${suc}-${dep}-${numero.replace(/^0+/, '')}`
  }

  @Post('import')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/octet-stream', // algunos navegadores envían .xlsx así
        ]
        const nombre = (file.originalname || '').toLowerCase()
        const okExt = nombre.endsWith('.xlsx') || nombre.endsWith('.xls')
        if (allowed.includes(file.mimetype) || okExt) {
          cb(null, true)
        } else {
          cb(
            new BadRequestException('Solo se permiten archivos Excel (.xlsx)'),
            false
          )
        }
      },
    })
  )
  async importFromExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body('clientId') clientIdBody: string,
    @Request() req: any
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo')
    const clientId = this.resolveClientId(req, clientIdBody)

    const workbook = XLSX.read(file.buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: '',
    })

    const mapped = rows.map(row => ({
      // La columna Nombre manda; si no viene, se arma con Suc + Dep + Nº O/T,
      // que es como Detroit nombra sus órdenes en el informe del ERP.
      nombre:
        this.celda(row, 'Nombre*', 'Nombre') ||
        this.nombreDesdeFormatoDetroit(row),
      costCenterKey: this.celda(
        row,
        'Centros de Costo*',
        'Centros de Costo',
        'Código Centro de Costo*',
        'Código Centro de Costo',
        'Centro de Costo',
        'costCenterId'
      ),
      // Celda vacía = "no toques el estado": una OT desactivada no se reactiva
      // sola al subir un archivo que no trae esa columna (el informe del ERP no
      // la trae). En una OT nueva, sin dato, se crea activa.
      isActive: this.celda(row, 'Activo')
        ? this.parseExcelBoolean(row['Activo'], true)
        : undefined,
    }))

    const result = await this.ordenTrabajoService.bulkCreate(mapped, clientId)

    this.auditLogService.log({
      userId: req.user._id || req.user.sub,
      userName: req.user.name || req.user.email,
      action: 'import_ordenes_trabajo',
      module: 'configuracion',
      details: `Creadas: ${result.created}, Actualizadas: ${result.updated}, Errores: ${result.errors.length}`,
      clientId,
    })

    return result
  }

  @Get(':clientId')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COLABORADOR, ROLES.CONTABILIDAD)
  findAll(
    @Param('clientId') clientId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('costCenterId') costCenterId?: string
  ) {
    return this.ordenTrabajoService.findAll(clientId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      costCenterId,
    })
  }

  @Get(':id/:clientId')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.COLABORADOR, ROLES.CONTABILIDAD)
  findOne(@Param('id') id: string, @Param('clientId') clientId: string) {
    return this.ordenTrabajoService.findOne(id, clientId)
  }

  @Patch(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrdenTrabajoDto,
    @Request() req: any
  ) {
    const clientId = this.resolveClientId(req)
    const result = await this.ordenTrabajoService.update(id, dto, clientId)
    this.auditLogService.log({
      userId: req.user._id || req.user.sub,
      userName: req.user.name || req.user.email,
      action: 'update_orden_trabajo',
      module: 'configuracion',
      entityId: id,
      details: JSON.stringify(dto),
      clientId,
    })
    return result
  }

  @Delete(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD)
  async remove(@Param('id') id: string, @Request() req: any) {
    const clientId = this.resolveClientId(req)
    const result = await this.ordenTrabajoService.remove(id, clientId)
    this.auditLogService.log({
      userId: req.user._id || req.user.sub,
      userName: req.user.name || req.user.email,
      action: 'delete_orden_trabajo',
      module: 'configuracion',
      entityId: id,
      details: `${(result as any)?.nombre ?? ''}`,
      clientId,
    })
    return result
  }
}
