import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

/**
 * Fondo revolvente de caja chica: un responsable pide UNA vez un monto fijo,
 * carga contra él los comprobantes que le entregan, y al rendir Tesorería le
 * repone lo aprobado hasta devolverlo al monto original.
 *
 * No confundir con `PettyCash` (módulo `petty-cash`), que es un fondo MENSUAL
 * de otro proyecto: lleva `period` con índice único por mes y un solo `funding`.
 * Aquí no hay período y los movimientos son N, que es justo lo que hace
 * revolvente al fondo.
 */
export type FondoCajaChicaStatus = 'pending_funding' | 'active' | 'closed'

/**
 * - `fondeo`: Tesorería pagó la primera solicitud y el fondo queda operativo.
 * - `cargo`: se registró un comprobante contra el presupuesto.
 * - `reverso`: se ELIMINÓ un comprobante ya cargado. Un comprobante rechazado
 *   NO genera reverso: se corrige y se reenvía, y el efectivo ya salió de la
 *   caja igual.
 * - `reposicion`: Tesorería depositó lo aprobado en una rendición.
 * - `ajuste`: una solicitud posterior reemplazó el presupuesto por otro monto,
 *   mayor o menor. `amount` es el presupuesto NUEVO.
 * - `devolucion`: el responsable devolvió el sobrante que dejó un ajuste a la
 *   baja, con su comprobante de depósito.
 */
export type FondoMovementType =
  | 'fondeo'
  | 'cargo'
  | 'reverso'
  | 'reposicion'
  | 'ajuste'
  | 'devolucion'

export interface FondoMovement {
  type: FondoMovementType
  /** Siempre positivo. El signo lo da `type`. */
  amount: number
  expenseId?: Types.ObjectId
  expenseReportId?: Types.ObjectId
  registeredBy: string
  registeredAt: Date
  note?: string
  /** Comprobante del depósito, obligatorio en una devolución. */
  receiptUrl?: string
  operationNumber?: string
  /**
   * Datos del depósito de una `devolucion`, los mismos que pide el comprobante
   * de devolución de saldo de una rendición (`returnVoucher`): sin ellos
   * Tesorería no puede conciliar contra el extracto bancario.
   */
  depositDate?: Date
  bankOrigin?: string
  /** Solo en `ajuste`: presupuesto que había antes, para leer el historial. */
  previousAmount?: number
}

export interface FondoCajaChicaDocument extends Document {
  code: string
  clientId: Types.ObjectId
  responsibleId: Types.ObjectId
  /** Monto que pidió el responsable en la solicitud. */
  requestedAmount: number
  /**
   * Presupuesto vigente. 0 hasta el primer depósito. Es el tope al que vuelve
   * el fondo en cada reposición, y lo reemplaza cada solicitud posterior.
   */
  fundAmount: number
  /** Cargado y aún no repuesto. `fundAmount - spentAmount` es el disponible. */
  spentAmount: number
  /**
   * Sobrante que el responsable debe devolver porque su presupuesto bajó. Se
   * salda registrando la devolución con su comprobante.
   */
  pendingReturnAmount: number
  status: FondoCajaChicaStatus
  /** Solicitud (ExpenseReport) que originó el fondo. */
  solicitudReportId?: Types.ObjectId
  movements: FondoMovement[]
  closedAt?: Date
  closedBy?: string
}

@Schema({ timestamps: true })
export class FondoCajaChica {
  @Prop({ required: true, unique: true })
  code: string

  @Prop({ required: true, type: Types.ObjectId, ref: 'Client' })
  clientId: Types.ObjectId

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  responsibleId: Types.ObjectId

  @Prop({ required: true })
  requestedAmount: number

  @Prop({ default: 0 })
  fundAmount: number

  @Prop({ default: 0 })
  spentAmount: number

  @Prop({ default: 0 })
  pendingReturnAmount: number

  @Prop({
    type: String,
    enum: ['pending_funding', 'active', 'closed'],
    default: 'pending_funding',
  })
  status: FondoCajaChicaStatus

  @Prop({ required: false, type: Types.ObjectId, ref: 'ExpenseReport' })
  solicitudReportId?: Types.ObjectId

  @Prop({
    type: [
      {
        type: {
          type: String,
          enum: [
            'fondeo',
            'cargo',
            'reverso',
            'reposicion',
            'ajuste',
            'devolucion',
          ],
          required: true,
        },
        amount: { type: Number, required: true },
        expenseId: { type: Types.ObjectId, ref: 'Expense' },
        expenseReportId: { type: Types.ObjectId, ref: 'ExpenseReport' },
        registeredBy: { type: String, required: true },
        registeredAt: { type: Date, required: true },
        note: { type: String },
        receiptUrl: { type: String },
        operationNumber: { type: String },
        depositDate: { type: Date },
        bankOrigin: { type: String },
        previousAmount: { type: Number },
        _id: false,
      },
    ],
    default: [],
  })
  movements: FondoMovement[]

  @Prop({ type: Date, required: false })
  closedAt?: Date

  @Prop({ required: false })
  closedBy?: string
}

export const FondoCajaChicaSchema = SchemaFactory.createForClass(FondoCajaChica)

/**
 * Un solo fondo vivo por responsable y empresa. Los cerrados no cuentan, por eso
 * el índice es parcial: si fuera único a secas, un responsable no podría volver
 * a tener caja chica después de cerrarla.
 */
FondoCajaChicaSchema.index(
  { clientId: 1, responsibleId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['pending_funding', 'active'] },
    },
  }
)

/** Saldo que le queda al responsable para seguir gastando. */
export function saldoDisponible(fondo: {
  fundAmount: number
  spentAmount: number
}): number {
  return Math.round((fondo.fundAmount - fondo.spentAmount) * 100) / 100
}
