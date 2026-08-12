import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

/** Una fila del cuadro de gastos de la DJ (una fecha, un importe declarado). */
export class DeclaracionJuradaRowDto {
  @IsString()
  @IsNotEmpty()
  fecha: string

  @IsNumber()
  @Min(0.01)
  monto: number
}

/** Un rubro de la DJ (alimentación o movilidad) con su categoría y sus filas. */
export class DeclaracionJuradaSeccionDto {
  @IsString()
  @IsNotEmpty()
  categoryId: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DeclaracionJuradaRowDto)
  rows: DeclaracionJuradaRowDto[]
}

/**
 * Declaración jurada de gastos al exterior (sub-tipo DJE de Otros Gastos).
 * Genera un gasto por rubro; los importes vienen en `moneda` (normalmente US$)
 * y el servicio los convierte a soles con el tipo de cambio de cada fecha.
 */
export class CreateDeclaracionJuradaDto {
  @IsString()
  @IsNotEmpty()
  proyectId: string

  @IsString()
  @IsOptional()
  expenseReportId?: string

  /** Código SUNAT o símbolo ('02' / 'US$'). Se normaliza en el servicio. */
  @IsString()
  @IsOptional()
  moneda?: string

  @IsString()
  @IsOptional()
  destino?: string

  @IsString()
  @IsOptional()
  pais?: string

  @IsString()
  @IsOptional()
  lugarFirma?: string

  /** Adjunto opcional: la DJ se sustenta con la firma, no con un comprobante. */
  @IsString()
  @IsOptional()
  imageUrl?: string

  @ValidateNested()
  @Type(() => DeclaracionJuradaSeccionDto)
  @IsOptional()
  alimentacion?: DeclaracionJuradaSeccionDto

  @ValidateNested()
  @Type(() => DeclaracionJuradaSeccionDto)
  @IsOptional()
  movilidad?: DeclaracionJuradaSeccionDto

  // Inyectados por el controlador desde el JWT.
  @IsString()
  @IsOptional()
  clientId?: string

  @IsString()
  @IsOptional()
  userId?: string
}
