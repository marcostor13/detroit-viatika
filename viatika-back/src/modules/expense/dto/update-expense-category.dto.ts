import { IsMongoId } from 'class-validator'

/**
 * Corrección de la categoría contable de un comprobante durante la revisión de
 * Contabilidad.
 *
 * Es un DTO propio y no `UpdateExpenseDto` a propósito: Contabilidad solo puede
 * cambiar la categoría. Reusar el DTO general dejaría abierto el monto, la
 * fecha y el resto del comprobante, que siguen siendo del colaborador (VD-69).
 */
export class UpdateExpenseCategoryDto {
  @IsMongoId({ message: 'La categoría indicada no es válida' })
  categoryId: string
}
