import { Types } from 'mongoose'

/**
 * Suplencia por vacaciones programadas (VD-124): mientras el titular está
 * fuera, su suplente puede firmar TODO lo que le tocaba firmar a él.
 *
 * El mecanismo no reescribe cadenas de aprobación. Las cadenas se sellan al
 * enviar (`ChainStep.approverIds`, ver `approval-chain.util.ts`) y siguen
 * nombrando al titular; lo que cambia es la respuesta a la única pregunta que
 * hacen todas las etapas: "¿este usuario está entre los aprobadores del paso?".
 * Durante la suplencia, el suplente responde que sí también por su titular.
 *
 * De ahí salen tres propiedades que el cliente pidió y que un rediseño de las
 * cadenas no daría gratis:
 *  - Cubre lo enviado ANTES de que empezara la vacación, no solo lo nuevo.
 *  - Cubre todas las etapas (solicitud, comprobante, rendición, caja chica)
 *    sin tocar ninguna regla de negocio.
 *  - Se apaga sola al vencer el rango, sin dejar datos que limpiar.
 *
 * Decisiones de diseño:
 *  - ADITIVA: el titular no pierde sus permisos. Si entra desde el celular,
 *    firma igual. Un rango mal puesto nunca deja un documento sin quién lo
 *    apruebe.
 *  - UN SOLO SALTO: si el suplente también está de vacaciones, NO se resuelve
 *    en cadena hacia su propio suplente. Evita ciclos y es predecible.
 *  - SIN AUTOAPROBACIÓN: la suplencia no habilita a firmar los documentos que
 *    el propio suplente creó (coherente con el escalamiento de la regla 1.5).
 */
export interface Suplencia {
  /** Inicio del período, normalizado a las 00:00:00.000 del día. */
  desde: Date
  /** Fin del período, normalizado a las 23:59:59.999 del día (inclusivo). */
  hasta: Date
  /** Quién firma en lugar del titular durante el período. */
  suplenteId: Types.ObjectId
}

/** Forma Mongoose de una `Suplencia` para el subdocumento embebido. */
export const suplenciaSchemaDefinition = {
  desde: { type: Date, required: true },
  hasta: { type: Date, required: true },
  suplenteId: { type: Types.ObjectId, ref: 'User', required: true },
  _id: false,
}

/**
 * Convierte a `Date` interpretando las fechas SIN hora como locales.
 *
 * `new Date('2026-09-01')` se parsea como medianoche UTC, no local: en Lima
 * (UTC-5) eso cae el 31 de agosto a las 19:00 y la vacación arrancaría un día
 * antes del que el usuario eligió. El formulario manda `YYYY-MM-DD`, así que
 * este caso es el normal, no el raro.
 */
export function aFechaLocal(valor: Date | string): Date {
  if (valor instanceof Date) return new Date(valor)
  const soloFecha = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(valor.trim())
  if (soloFecha) {
    return new Date(
      Number(soloFecha[1]),
      Number(soloFecha[2]) - 1,
      Number(soloFecha[3])
    )
  }
  return new Date(valor)
}

/**
 * Inicio del día de `fecha` (00:00:00.000) en la zona del servidor. La
 * vacación se define por días completos: quien la programa elige fechas, no
 * horas, y espera que cubra desde el primer minuto del día de inicio.
 */
export function inicioDelDia(fecha: Date): Date {
  const d = new Date(fecha)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Fin del día de `fecha` (23:59:59.999). El último día de vacaciones cuenta entero. */
export function finDelDia(fecha: Date): Date {
  const d = new Date(fecha)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * ¿La suplencia está vigente en `ref`? Los extremos se normalizan al guardar
 * (`normalizarSuplencia`), así que la comparación es directa; se vuelve a
 * normalizar aquí para que un documento cargado antes de esta regla —o escrito
 * a mano por un script— no quede fuera por unas horas.
 */
export function suplenciaVigente(
  vacaciones: Suplencia | null | undefined,
  ref: Date = new Date()
): boolean {
  if (!vacaciones?.desde || !vacaciones?.hasta || !vacaciones?.suplenteId) {
    return false
  }
  return (
    inicioDelDia(aFechaLocal(vacaciones.desde)).getTime() <= ref.getTime() &&
    ref.getTime() <= finDelDia(aFechaLocal(vacaciones.hasta)).getTime()
  )
}

/**
 * Normaliza los extremos a día completo para que la consulta por rango
 * (`desde <= ahora <= hasta`) sea exacta en Mongo sin aritmética de horas.
 */
export function normalizarSuplencia(opts: {
  desde: Date | string
  hasta: Date | string
  suplenteId: Types.ObjectId | string
}): Suplencia {
  return {
    desde: inicioDelDia(aFechaLocal(opts.desde)),
    hasta: finDelDia(aFechaLocal(opts.hasta)),
    suplenteId: new Types.ObjectId(opts.suplenteId),
  }
}
