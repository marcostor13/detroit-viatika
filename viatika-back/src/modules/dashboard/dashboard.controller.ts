import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common'
import { DashboardService } from './dashboard.service'
import { DashboardQueryDto } from './dto/dashboard-query.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorador'
import { ROLES } from '../auth/enums/roles.enum'

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * KPIs y series agregadas del dashboard, acotadas a la empresa activa (JWT).
   * Dentro de la empresa, el alcance depende del rol: Contabilidad/Admin ven
   * todo y un Coordinador solo sus centros de costo (ver `resolveScope`).
   */
  @Get()
  @Roles(
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.COORDINADOR,
    ROLES.COLABORADOR,
    ROLES.CONTABILIDAD,
    ROLES.TESORERIA
  )
  getDashboard(@Query() query: DashboardQueryDto, @Request() req) {
    const rawClient = req.user?.clientId
    const clientId =
      rawClient?._id?.toString?.() ??
      rawClient?.toString?.() ??
      String(rawClient ?? '')

    if (!clientId) {
      throw new BadRequestException('No hay empresa activa en la sesión')
    }

    return this.dashboardService.getDashboard(clientId, query, {
      userId: String(req.user?._id ?? ''),
      role: req.user?.roles?.[0] ?? '',
    })
  }
}
