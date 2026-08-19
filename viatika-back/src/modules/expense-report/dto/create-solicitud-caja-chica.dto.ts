import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { Transform } from 'class-transformer'

/**
 * Solicitud de asignación de caja chica. El formato en papel solo tiene un
 * campo que el responsable escriba: el monto. Todo lo demás (nombre, DNI, área,
 * centro de costo y cuenta bancaria) sale de su perfil, y la fecha es la del
 * día en que se genera. El formato no lleva motivo ni orden de trabajo.
 */
export class CreateSolicitudCajaChicaDto {
  @IsNumber()
  @Min(1)
  amount: number

  /** Moneda ISO 4217. Si no se envía se asume la moneda base. */
  @IsOptional()
  @IsString()
  moneda?: string

  /** Nota libre, no está en el formato pero sirve para el historial. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  observations?: string
}
