import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsMongoId,
  MinLength,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ApproverLevelDto } from './update-user.dto'

class CreateBankAccountDto {
  @IsString()
  @IsOptional()
  bankName?: string

  @IsString()
  @IsOptional()
  accountNumber?: string

  @IsString()
  @IsOptional()
  cci?: string

  @IsEnum(['ahorros', 'corriente'])
  @IsOptional()
  accountType?: 'ahorros' | 'corriente'
}

class CreatePermissionsDto {
  @IsArray()
  @IsOptional()
  modules?: string[]

  @IsBoolean()
  @IsOptional()
  canApproveL1?: boolean

  @IsBoolean()
  @IsOptional()
  canApproveL2?: boolean

  /** Aprobadores propios del colaborador por nivel (regla 1.10). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproverLevelDto)
  @IsOptional()
  approverLevels?: ApproverLevelDto[]
}

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsNotEmpty()
  email: string

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string

  @IsNotEmpty()
  roleId: string

  @IsString()
  @IsMongoId()
  @IsNotEmpty()
  clientId: string

  @IsBoolean()
  @IsOptional()
  isActive?: boolean

  @IsString()
  @IsOptional()
  dni?: string

  /** Tipo de documento para pagos BBVA (R/L/P/E/M). Default L. */
  @IsEnum(['R', 'L', 'P', 'E', 'M'])
  @IsOptional()
  documentType?: 'R' | 'L' | 'P' | 'E' | 'M'

  @IsString()
  @IsOptional()
  employeeCode?: string

  @IsString()
  @IsOptional()
  area?: string

  @IsString()
  @IsOptional()
  cargo?: string

  @IsString()
  @IsOptional()
  address?: string

  @IsString()
  @IsOptional()
  phone?: string

  /** @deprecated usar approverIds. Se conserva para migración. */
  @IsMongoId()
  @IsOptional()
  coordinatorId?: string

  /** Cadena ordenada de aprobadores (rol Coordinador) para anticipos/viáticos. */
  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  approverIds?: string[]

  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePermissionsDto)
  permissions?: CreatePermissionsDto

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBankAccountDto)
  bankAccount?: CreateBankAccountDto

  /** Cuenta en dólares, para los depósitos de solicitudes en USD. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBankAccountDto)
  bankAccountUsd?: CreateBankAccountDto

  @IsBoolean()
  @IsOptional()
  isCompanyAdmin?: boolean
}
