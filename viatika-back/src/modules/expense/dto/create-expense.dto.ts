import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  IsObject,
  IsIn,
} from 'class-validator'
import {
  ExpenseStatus,
  ExpenseType,
  MobilityRow,
} from '../entities/expense.entity'
import { TIPOS_COMIDA, TipoComida } from '../../client/entities/client.entity'

export class CreateExpenseDto {
  /**
   * Centro de costo. Opcional a nivel de DTO porque en caja chica puede no ir;
   * en el resto de rendiciones el servicio lo sigue exigiendo (ver
   * `resolveComprobanteCajaChica`), para no aflojar la regla para todos.
   */
  @IsString()
  @IsOptional()
  proyectId?: string

  /** Firma que acompaña al comprobante (imagen o PDF). Obligatoria en caja chica. */
  @IsString()
  @IsOptional()
  firmaUrl?: string

  /** Orden de Trabajo (opcional salvo en planilla_movilidad, ver ADF-FOR-005). */
  @IsString()
  @IsOptional()
  ordenTrabajoId?: string

  /**
   * Categoría del gasto. Opcional a nivel de DTO porque en planilla_movilidad
   * la resuelve el frontend (única categoría "Planilla de movilidad" asignada,
   * o la que el colaborador elige si tiene más de una); el servicio la valida
   * y la exige en ese caso. El resto de tipos de gasto siempre la envían desde
   * el formulario.
   */
  @IsString()
  @IsOptional()
  categoryId?: string

  @IsString()
  @IsOptional()
  imageUrl?: string

  /**
   * Adjuntos de respaldo cuando el tipo de gasto admite varios (planilla de
   * movilidad y Otros Gastos). El primero coincide con `imageUrl`, que se
   * mantiene porque es lo que leen las validaciones y todo lo que ya existía.
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[]

  /**
   * Moneda ISO del comprobante ('PEN' / 'USD'). Si se omite se asume la moneda
   * base de la empresa: un comprobante emitido en Perú va en soles aunque la
   * rendición sea en dólares, y se convierte al mostrarlo.
   */
  @IsString()
  @IsOptional()
  moneda?: string

  @IsString()
  @IsOptional()
  data?: string

  @IsOptional()
  @IsNumber()
  total?: number

  @IsEnum([
    'pending',
    'approved',
    'rejected',
    'sunat_valid',
    'sunat_valid_not_ours',
    'sunat_not_found',
    'sunat_error',
  ])
  @IsOptional()
  status?: ExpenseStatus

  @IsString()
  @IsNotEmpty()
  clientId: string

  @IsString()
  @IsOptional()
  userId?: string

  @IsString()
  @IsOptional()
  expenseReportId?: string

  @IsEnum([
    'factura',
    'planilla_movilidad',
    'otros_gastos',
    'recibo_caja',
    'cancelacion',
  ])
  @IsOptional()
  expenseType?: ExpenseType

  @IsArray()
  @IsOptional()
  mobilityRows?: MobilityRow[]

  @IsBoolean()
  @IsOptional()
  declaracionJurada?: boolean

  @IsString()
  @IsOptional()
  declaracionJuradaFirmante?: string

  @IsString()
  @IsOptional()
  fechaEmision?: string

  @IsString()
  @IsOptional()
  comentario?: string

  @IsString()
  @IsOptional()
  placaVehiculo?: string

  @IsString()
  @IsOptional()
  subTipo?: string

  /**
   * Comida declarada en "Alimentación sin documentación" (VD-109). Reemplaza a
   * la descripción libre en ese sub-tipo y define contra qué tope se compara.
   */
  @IsIn(TIPOS_COMIDA)
  @IsOptional()
  tipoComida?: TipoComida

  @IsString()
  @IsOptional()
  serie?: string

  @IsString()
  @IsOptional()
  correlativo?: string

  @IsString()
  @IsOptional()
  rucEmisor?: string

  /** Motivo de la cancelación. Es el único texto que lleva ese tipo de gasto. */
  @IsString()
  @IsOptional()
  motivo?: string

  // --- Desglose contable (asientos Contanet) ---
  @IsNumber()
  @IsOptional()
  baseAfecta?: number

  @IsNumber()
  @IsOptional()
  igv?: number

  @IsNumber()
  @IsOptional()
  tasaIgv?: number

  @IsNumber()
  @IsOptional()
  inafecto?: number

  @IsArray()
  @IsOptional()
  detalleAnalitico?: {
    proyectId?: string
    condicion: 'afecto' | 'inafecto'
    monto: number
  }[]

  @IsBoolean()
  @IsOptional()
  desgloseRevisado?: boolean

  /** Información completa del comprobante extraída por OCR/IA (objeto libre). */
  @IsObject()
  @IsOptional()
  comprobanteDetallado?: Record<string, any>
}
