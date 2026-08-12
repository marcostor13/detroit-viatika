import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator'

/**
 * Todos los campos son opcionales: se puede renombrar la OT (se revalida la
 * unicidad por empresa), reasignar sus centros de costo o activarla /
 * desactivarla. No hay correlativo ni código autogenerado que preservar.
 */
export class UpdateOrdenTrabajoDto {
  @IsString()
  @IsOptional()
  nombre?: string

  /** Centro de costo único (compatibilidad). Equivale a `costCenterIds: [id]`. */
  @IsMongoId()
  @IsOptional()
  costCenterId?: string

  /** Lista completa de centros de costo de la OT; el primero es el principal. */
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  @IsOptional()
  costCenterIds?: string[]

  @IsBoolean()
  @IsOptional()
  isActive?: boolean
}
