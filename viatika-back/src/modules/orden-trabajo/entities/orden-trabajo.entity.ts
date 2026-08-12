import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export interface OrdenTrabajoDocument extends Document {
  nombre: string
  costCenterId: Types.ObjectId
  costCenterIds: Types.ObjectId[]
  isActive: boolean
  clientId: Types.ObjectId
}

@Schema({ timestamps: true })
export class OrdenTrabajo {
  /**
   * Nombre/código de la OT que teclea el usuario (ej. "Lim-Com-1"). Es el
   * identificador visible de la OT y es único por empresa (ver índice de
   * abajo): la misma empresa no puede repetirlo, pero otra empresa sí puede
   * tener una OT con el mismo nombre (plataforma multitenant).
   */
  @Prop({ required: true, trim: true })
  nombre: string

  /**
   * Centro de costo PRINCIPAL de la OT: el que sale en los reportes oficiales
   * (columnas OT / C.COSTO del ADF-FOR-004) y en la ficha de la OT. Siempre es
   * el primero de `costCenterIds`.
   */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Project' })
  costCenterId: Types.ObjectId

  /**
   * Todos los centros de costo desde los que se puede usar la OT, empezando por
   * el principal. Una misma OT puede servir a varios centros de costo (p. ej.
   * las OT "SMI" se cargan desde los cinco centros de SERVICIO MINERIA), así
   * que los selectores filtran por esta lista y no por `costCenterId`.
   */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Project' }], default: [] })
  costCenterIds: Types.ObjectId[]

  @Prop({ default: true })
  isActive: boolean

  @Prop({ required: true, type: Types.ObjectId, ref: 'Client' })
  clientId: Types.ObjectId
}

export const OrdenTrabajoSchema = SchemaFactory.createForClass(OrdenTrabajo)

/**
 * Unicidad del nombre POR EMPRESA. Incluir `clientId` en la clave es lo que
 * permite que dos empresas distintas tengan una OT con el mismo nombre
 * (ej. ambas pueden tener "Lim-Com-1"), pero una misma empresa no lo repita.
 */
OrdenTrabajoSchema.index({ nombre: 1, clientId: 1 }, { unique: true })

/** Búsquedas frecuentes: OTs de un centro de costo dentro de una empresa. */
OrdenTrabajoSchema.index({ clientId: 1, costCenterId: 1 })

/** Índice multiclave para filtrar por cualquiera de los centros de costo de la OT. */
OrdenTrabajoSchema.index({ clientId: 1, costCenterIds: 1 })
