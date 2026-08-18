import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export interface ClientLimits {
  movilidadDiario?: number
  /**
   * Topes por comida de "Alimentación sin documentación" (VD-109). Se aplican
   * a cada gasto cargado, no al acumulado del día. Vacío = sin tope.
   */
  alimentacionDesayuno?: number
  alimentacionAlmuerzo?: number
  alimentacionCena?: number
  /**
   * Tope de ALERTA por comprobante. Un solo valor para toda la empresa, sin
   * distinguir categoría, aplicado a cualquier tipo de rendición. A diferencia
   * de los topes de comida, este NUNCA bloquea: solo marca el gasto para que
   * quien lo sube y quien lo aprueba vean la advertencia. Vacío = sin tope.
   */
  topeComprobante?: number
}

/** Comidas de "Alimentación sin documentación" (VD-109). */
export const TIPOS_COMIDA = ['desayuno', 'almuerzo', 'cena'] as const
export type TipoComida = (typeof TIPOS_COMIDA)[number]

/** Tope configurado para cada comida, o `null` si la empresa no puso ninguno. */
export function topeComida(
  limits: ClientLimits | undefined,
  tipo: TipoComida
): number | null {
  const valor =
    tipo === 'desayuno'
      ? limits?.alimentacionDesayuno
      : tipo === 'almuerzo'
        ? limits?.alimentacionAlmuerzo
        : limits?.alimentacionCena
  return typeof valor === 'number' && valor > 0 ? valor : null
}

/** Tope de alerta por comprobante, o `null` si la empresa no puso ninguno. */
export function topeComprobante(
  limits: ClientLimits | undefined
): number | null {
  const valor = limits?.topeComprobante
  return typeof valor === 'number' && valor > 0 ? valor : null
}

export interface ClientNotificationSettings {
  enabled: boolean
  frequency: 'semanal' | 'mensual'
  /** Día de la semana para notificaciones semanales: 0=Domingo … 6=Sábado (default 1=Lunes) */
  notificationDay?: number
}

export interface ClientDocument extends Document {
  codigo: string
  comercialName: string
  businessName: string
  businessId: string //ruc
  address: string
  phone: string
  email: string
  logo: string
  limits?: ClientLimits
  notificationSettings?: ClientNotificationSettings
  /** Cuenta de cargo de la empresa para el archivo de pagos BBVA (cabecera). */
  paymentAccount?: string
}

export interface GetClientDocument extends ClientDocument {
  _id: Types.ObjectId
}

@Schema({ timestamps: true })
export class Client {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  codigo: string

  @Prop({ required: true })
  comercialName: string

  @Prop({ required: true })
  businessName: string

  @Prop({ required: true })
  businessId: string //ruc

  @Prop({ default: '' })
  address: string

  @Prop({ default: '' })
  phone: string

  @Prop({ default: '' })
  email: string

  @Prop()
  logo: string

  /** Cuenta de cargo de la empresa para el archivo de pagos BBVA (cabecera). */
  @Prop({ type: String, default: '' })
  paymentAccount?: string

  @Prop({
    type: {
      movilidadDiario: { type: Number, default: null },
      alimentacionDesayuno: { type: Number, default: null },
      alimentacionAlmuerzo: { type: Number, default: null },
      alimentacionCena: { type: Number, default: null },
      topeComprobante: { type: Number, default: null },
    },
    default: {},
  })
  limits: ClientLimits

  @Prop({
    type: {
      enabled: { type: Boolean, default: false },
      frequency: {
        type: String,
        enum: ['semanal', 'mensual'],
        default: 'semanal',
      },
      notificationDay: { type: Number, min: 0, max: 6, default: 1 },
      _id: false,
    },
    required: false,
  })
  notificationSettings?: ClientNotificationSettings
}

export const ClientSchema = SchemaFactory.createForClass(Client)
ClientSchema.index({ codigo: 1 }, { unique: true })
