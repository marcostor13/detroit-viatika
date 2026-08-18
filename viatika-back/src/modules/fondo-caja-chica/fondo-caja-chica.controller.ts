import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { FondoCajaChicaService } from './fondo-caja-chica.service'
import {
  CreateFondoCajaChicaDto,
  FondearFondoDto,
  ReponerFondoDto,
  DevolverSobranteDto,
} from './dto/create-fondo-caja-chica.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorador'
import { ROLES } from '../auth/enums/roles.enum'
import { AuditLogService } from '../audit-log/audit-log.service'

@Controller('fondo-caja-chica')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FondoCajaChicaController {
  constructor(
    private readonly service: FondoCajaChicaService,
    private readonly auditLogService: AuditLogService
  ) {}

  private actor(req: any) {
    return {
      id: String(req.user?._id || req.user?.sub),
      name: req.user?.name || req.user?.email,
      clientId: req.user?.clientId,
    }
  }

  @Post()
  @Roles(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.CONTABILIDAD)
  async create(@Body() dto: CreateFondoCajaChicaDto, @Request() req: any) {
    const actor = this.actor(req)
    dto.clientId = dto.clientId || actor.clientId
    const result = await this.service.create(dto, actor.id)
    this.auditLogService.log({
      userId: actor.id,
      userName: actor.name,
      action: 'create_fondo_caja_chica',
      module: 'caja-chica',
      entityId: String(result._id),
      clientId: actor.clientId,
    })
    return result
  }

  @Get('client/:clientId')
  @Roles(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.CONTABILIDAD, ROLES.TESORERIA)
  findAllByClient(@Param('clientId') clientId: string) {
    return this.service.findAllByClient(clientId)
  }

  /** Fondos del usuario autenticado. El responsable ve solo el suyo. */
  @Get('mine')
  findMine(@Request() req: any) {
    const actor = this.actor(req)
    return this.service.findByResponsible(actor.id, actor.clientId)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(id, this.actor(req).clientId)
  }

  @Patch(':id/fondear')
  @Roles(ROLES.SUPER_ADMIN, ROLES.CONTABILIDAD, ROLES.TESORERIA)
  async fondear(
    @Param('id') id: string,
    @Body() dto: FondearFondoDto,
    @Request() req: any
  ) {
    const actor = this.actor(req)
    const result = await this.service.fondear(id, dto.amount, actor.id, dto.note)
    this.auditLogService.log({
      userId: actor.id,
      userName: actor.name,
      action: 'fondear_fondo_caja_chica',
      module: 'caja-chica',
      entityId: id,
      clientId: actor.clientId,
    })
    return result
  }

  @Patch(':id/reponer')
  @Roles(ROLES.SUPER_ADMIN, ROLES.CONTABILIDAD, ROLES.TESORERIA)
  async reponer(
    @Param('id') id: string,
    @Body() dto: ReponerFondoDto,
    @Request() req: any
  ) {
    const actor = this.actor(req)
    const result = await this.service.reponer(id, {
      amount: dto.amount,
      expenseReportId: dto.expenseReportId,
      registeredBy: actor.id,
      note: dto.note,
    })
    this.auditLogService.log({
      userId: actor.id,
      userName: actor.name,
      action: 'reponer_fondo_caja_chica',
      module: 'caja-chica',
      entityId: id,
      clientId: actor.clientId,
    })
    return result
  }

  /**
   * El responsable devuelve el sobrante tras bajar su presupuesto. Sin @Roles:
   * quien devuelve es el propio colaborador, no Contabilidad.
   */
  @Patch(':id/devolver-sobrante')
  async devolverSobrante(
    @Param('id') id: string,
    @Body() dto: DevolverSobranteDto,
    @Request() req: any
  ) {
    const actor = this.actor(req)
    const result = await this.service.registrarDevolucion(id, {
      amount: dto.amount,
      receiptUrl: dto.receiptUrl,
      operationNumber: dto.operationNumber,
      depositDate: dto.depositDate,
      bankOrigin: dto.bankOrigin,
      registeredBy: actor.id,
      note: dto.note,
    })
    this.auditLogService.log({
      userId: actor.id,
      userName: actor.name,
      action: 'devolver_sobrante_caja_chica',
      module: 'caja-chica',
      entityId: id,
      clientId: actor.clientId,
    })
    return result
  }

  @Patch(':id/close')
  @Roles(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.CONTABILIDAD)
  async close(@Param('id') id: string, @Request() req: any) {
    const actor = this.actor(req)
    const result = await this.service.close(id, actor.id)
    this.auditLogService.log({
      userId: actor.id,
      userName: actor.name,
      action: 'close_fondo_caja_chica',
      module: 'caja-chica',
      entityId: id,
      clientId: actor.clientId,
    })
    return result
  }
}
