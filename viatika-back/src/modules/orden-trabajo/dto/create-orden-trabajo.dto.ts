import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator'

export class CreateOrdenTrabajoDto {
  /** Nombre/código de la OT (ej. "Lim-Com-1"). Único por empresa. */
  @IsString()
  @IsNotEmpty()
  nombre: string

  /**
   * Centro de costo principal. Opcional cuando llega `costCenterIds`: se toma
   * el primero de la lista. Se mantiene para no romper integraciones que aún
   * mandan un único centro de costo.
   */
  @IsMongoId()
  @IsOptional()
  costCenterId?: string

  /**
   * Centros de costo desde los que se puede usar la OT. El primero es el
   * principal. Debe llegar este campo o `costCenterId`.
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  @IsOptional()
  costCenterIds?: string[]

  @IsBoolean()
  @IsOptional()
  isActive?: boolean

  @IsString()
  @IsOptional()
  clientId?: string
}
