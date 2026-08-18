import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { FondoCajaChicaService } from './fondo-caja-chica.service'
import { FondoCajaChicaController } from './fondo-caja-chica.controller'
import {
  FondoCajaChica,
  FondoCajaChicaSchema,
} from './entities/fondo-caja-chica.entity'
import { AuditLogModule } from '../audit-log/audit-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FondoCajaChica.name, schema: FondoCajaChicaSchema },
    ]),
    AuditLogModule,
  ],
  controllers: [FondoCajaChicaController],
  providers: [FondoCajaChicaService],
  exports: [FondoCajaChicaService],
})
export class FondoCajaChicaModule {}
