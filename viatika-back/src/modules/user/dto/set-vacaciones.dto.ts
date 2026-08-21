import { IsDateString, IsMongoId } from 'class-validator'

/**
 * Programación de vacaciones de un aprobador y designación de su suplente
 * (VD-124). Las fechas llegan como `YYYY-MM-DD`: la vacación se define por
 * días completos y el servidor normaliza los extremos al guardar
 * (`normalizarSuplencia`).
 *
 * Para terminar una suplencia antes de tiempo se usa el `DELETE` del mismo
 * recurso, no un PATCH con campos vacíos.
 */
export class SetVacacionesDto {
  @IsDateString()
  desde: string

  @IsDateString()
  hasta: string

  /** Quién firma en lugar del titular mientras dure el período. */
  @IsMongoId()
  suplenteId: string
}
