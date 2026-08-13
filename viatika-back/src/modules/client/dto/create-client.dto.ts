import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  ValidateNested,
  IsEmail,
  ValidateIf,
} from 'class-validator'
import { Type } from 'class-transformer'

class ClientLimitsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  movilidadDiario?: number

  /** Topes por comida de Alimentación sin documentación (VD-109). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  alimentacionDesayuno?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  alimentacionAlmuerzo?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  alimentacionCena?: number
}

export class CreateClientDto {
  @IsNotEmpty()
  @IsString()
  codigo: string

  @IsNotEmpty()
  @IsString()
  comercialName: string

  @IsString()
  businessName: string

  @IsString()
  businessId: string //ruc

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @ValidateIf(o => typeof o.email === 'string' && o.email.trim() !== '')
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  logo?: string

  /** Cuenta de cargo para el archivo de pagos BBVA (cabecera). */
  @IsOptional()
  @IsString()
  paymentAccount?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => ClientLimitsDto)
  limits?: ClientLimitsDto
}
