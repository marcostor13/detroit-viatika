import { forwardRef, Module } from '@nestjs/common'
import { UserService } from './user.service'
import { MongooseModule } from '@nestjs/mongoose'
import { User, UserSchema } from './schemas/user.schema'
import { UserController } from './user.controller'
import { RoleModule } from '../role/role.module'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { ProjectModule } from '../project/project.module'
import { Project, ProjectSchema } from '../project/entities/project.entity'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      // Solo lectura: resuelve los centros de costo por código/nombre en la
      // carga masiva de usuarios (columnas de permisos).
      { name: Project.name, schema: ProjectSchema },
    ]),
    forwardRef(() => RoleModule),
    AuditLogModule,
    ProjectModule,
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
