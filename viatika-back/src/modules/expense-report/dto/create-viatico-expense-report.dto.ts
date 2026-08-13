import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsMongoId,
  IsArray,
  ValidateNested,
  IsDateString,
  MaxLength,
} from 'class-validator'
import { Type, Transform } from 'class-transformer'
import { CreateAdvanceLineDto } from '../../advance/dto/create-advance.dto'

export class CreateViaticoExpenseReportDto {
  @IsNumber()
  @Min(1)
  amount: number

  /** Moneda ISO 4217 ('PEN' / 'USD'). Si no se envía se asume la moneda base. */
  @IsString()
  @IsOptional()
  moneda?: string

  @IsString()
  @IsNotEmpty()
  place: string

  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  lat?: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  lng?: number

  @IsDateString()
  startDate: string

  @IsDateString()
  endDate: string

  @IsMongoId()
  projectId: string

  /** Orden de Trabajo (opcional) a la que se imputa el gasto del viático. */
  @IsMongoId()
  @IsOptional()
  ordenTrabajoId?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAdvanceLineDto)
  lines?: CreateAdvanceLineDto[]

  /**
   * Justificación de la solicitud (VD-102). Obligatoria: el cliente pide que
   * ninguna solicitud de fondos llegue al aprobador sin motivo escrito.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Las observaciones son obligatorias' })
  observations: string

  /** Cuenta bancaria alternativa para el depósito (opcional). */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  bankName?: string

  @IsString()
  @IsOptional()
  @MaxLength(50)
  accountNumber?: string

  @IsString()
  @IsOptional()
  @MaxLength(50)
  cci?: string
}
