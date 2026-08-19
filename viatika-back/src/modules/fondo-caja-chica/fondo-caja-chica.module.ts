import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { FondoCajaChicaService } from './fondo-caja-chica.service'
import { FondoCajaChicaController } from './fondo-caja-chica.controller'
import {
  FondoCajaChica,
  FondoCajaChicaSchema,
} from './entities/fondo-caja-chica.entity'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { EmailModule } from '../email/email.module'
import { UserModule } from '../user/user.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FondoCajaChica.name, schema: FondoCajaChicaSchema },
    ]),
    AuditLogModule,
    // Avisos de la devolución del sobrante: correo a Tesorería/Contabilidad
    // (EmailModule + UserModule para resolver destinatarios) y aviso in-app.
    EmailModule,
    UserModule,
    NotificationsModule,
  ],
  controllers: [FondoCajaChicaController],
  providers: [FondoCajaChicaService],
  exports: [FondoCajaChicaService],
})
export class FondoCajaChicaModule {}
