/**
 * Reconciliación de la extracción OCR: el prompt pide los mismos datos dos
 * veces, planos (`rucEmisor`, `serie`, `montoTotal`) y anidados dentro de
 * `comprobanteDetallado`. Cuando el modelo llenaba sólo el objeto anidado nadie
 * copiaba esos valores a los campos planos, y el resultado era un total en 0, el
 * formulario en blanco y la validación SUNAT corriendo con serie y correlativo
 * vacíos, aunque el dato viniera en la respuesta.
 *
 * Sólo se rellena en el sentido anidado -> plano. No se escribe dentro de
 * `comprobanteDetallado` a propósito: el módulo de asientos contables
 * (`resolvePortions`) prioriza `comprobanteDetallado.totales` sobre los campos
 * sueltos, así que completarlo cambiaría de rama el cálculo de asientos ya
 * existentes.
 */

export interface ExtraccionOcr {
  rucEmisor?: string
  serie?: string
  correlativo?: string
  fechaEmision?: string
  montoTotal?: number
  tipoComprobante?: string
  moneda?: string
  razonSocial?: string
  direccionEmisor?: string
  baseAfecta?: number | null
  igv?: number | null
  tasaIgv?: number | null
  inafecto?: number | null
  comprobanteDetallado?: Record<string, unknown>
  [key: string]: unknown
}

export interface NormalizeResult<T extends ExtraccionOcr> {
  /**
   * `T & ExtraccionOcr` y no `T`: quien pasa un objeto literal (los tests, por
   * ejemplo) igual puede leer los campos que la normalización acaba de rellenar.
   */
  extraccion: T & ExtraccionOcr
  /** Campos que estaban vacíos y se recuperaron del objeto anidado. */
  camposRecuperados: string[]
}

function objeto(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * Convierte a texto sólo lo que tiene una representación textual útil. Un objeto
 * o un arreglo devuelven cadena vacía en vez de "[object Object]", que es basura
 * que después terminaría guardada como si fuera un RUC o una serie.
 */
export function textoDe(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value)
  }
  return ''
}

/** Vacío para un texto: undefined, null, no textual o sólo espacios. */
function textoVacio(value: unknown): boolean {
  return textoDe(value).trim() === ''
}

/**
 * Vacío para un número: undefined, null, cadena vacía o NaN. El 0 NO es vacío:
 * un IGV de 0.00 es un dato legítimo (factura exonerada o inafecta) y
 * sobreescribirlo sería justo el error que el prompt pide evitar.
 */
function numeroVacio(value: unknown): boolean {
  if (value == null || value === '') return true
  return !Number.isFinite(toNumber(value))
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (value == null) return NaN
  const clean = textoDe(value)
    .replace(/[^\d.,-]/g, '')
    .trim()
  if (!clean) return NaN
  // "1,234.56" -> "1234.56"; "1.234,56" -> "1234.56"
  const ultimaComa = clean.lastIndexOf(',')
  const ultimoPunto = clean.lastIndexOf('.')
  let normalizado = clean
  if (ultimaComa > -1 && ultimoPunto > -1) {
    normalizado =
      ultimaComa > ultimoPunto
        ? clean.replace(/\./g, '').replace(',', '.')
        : clean.replace(/,/g, '')
  } else if (ultimaComa > -1) {
    // Coma decimal sólo si deja 1 o 2 decimales ("80,00"); si no, es de miles.
    normalizado =
      clean.length - ultimaComa - 1 <= 2
        ? clean.replace(',', '.')
        : clean.replace(/,/g, '')
  }
  const parsed = Number(normalizado)
  return Number.isFinite(parsed) ? parsed : NaN
}

function textoLimpio(value: unknown): string | undefined {
  const texto = textoDe(value).trim()
  return texto === '' ? undefined : texto
}

/**
 * Separa una serie que llega con el correlativo pegado ("F001-00004468"), forma
 * en la que el modelo la devuelve muy seguido porque es como se imprime.
 */
export function splitSerieCorrelativo(
  serieRaw?: string,
  correlativoRaw?: string
): { serie?: string; correlativo?: string } {
  let serie = textoLimpio(serieRaw)?.toUpperCase()
  let correlativo = textoLimpio(correlativoRaw)

  if (serie) {
    const pegado = /^([A-Z0-9]{3,4})[\s-]+(\d{1,12})$/.exec(serie)
    if (pegado) {
      serie = pegado[1]
      if (!correlativo) correlativo = pegado[2]
    }
  }

  // El correlativo a veces repite la serie ("F001-00004468" en ambos campos).
  if (correlativo && serie) {
    const conPrefijo = new RegExp(`^${serie}[\\s-]+(\\d{1,12})$`, 'i').exec(
      correlativo
    )
    if (conPrefijo) correlativo = conPrefijo[1]
  }
  if (correlativo) {
    const soloNumero = /^[A-Z0-9]{3,4}[\s-]+(\d{1,12})$/i.exec(correlativo)
    if (soloNumero && !serie) correlativo = soloNumero[1]
  }

  return { serie, correlativo }
}

/**
 * Completa los campos planos vacíos con lo que haya en `comprobanteDetallado`.
 * No sobreescribe nada que el modelo ya haya devuelto en la raíz.
 */
export function normalizeExtraccionOcr<T extends ExtraccionOcr>(
  extraccion: T
): NormalizeResult<T> {
  const out = { ...extraccion } as T & ExtraccionOcr
  const camposRecuperados: string[] = []
  const detallado = objeto(out.comprobanteDetallado)
  const emisor = objeto(detallado.emisor)
  const comprobante = objeto(detallado.comprobante)
  const totales = objeto(detallado.totales)

  const completarTexto = (
    campo: keyof ExtraccionOcr,
    ...fuentes: unknown[]
  ) => {
    if (!textoVacio(out[campo])) return
    for (const fuente of fuentes) {
      const valor = textoLimpio(fuente)
      if (valor) {
        ;(out as Record<string, unknown>)[campo as string] = valor
        camposRecuperados.push(campo as string)
        return
      }
    }
  }

  const completarNumero = (
    campo: keyof ExtraccionOcr,
    ...fuentes: unknown[]
  ) => {
    if (!numeroVacio(out[campo])) return
    for (const fuente of fuentes) {
      if (numeroVacio(fuente)) continue
      ;(out as Record<string, unknown>)[campo as string] = toNumber(fuente)
      camposRecuperados.push(campo as string)
      return
    }
  }

  completarTexto('rucEmisor', emisor.ruc)
  completarTexto('razonSocial', emisor.razonSocial, emisor.nombreComercial)
  completarTexto('direccionEmisor', emisor.direccion)
  completarTexto('tipoComprobante', comprobante.tipo)
  completarTexto('serie', comprobante.serie)
  completarTexto('correlativo', comprobante.correlativo)
  completarTexto('fechaEmision', comprobante.fechaEmision)
  completarTexto('moneda', comprobante.moneda)

  completarNumero('montoTotal', totales.importeTotal)
  completarNumero('baseAfecta', totales.operacionGravada)
  completarNumero('igv', totales.igv)
  completarNumero('tasaIgv', totales.tasaIgv)
  // Sólo el recargo al consumo. `operacionInafecta` ya entra como porción propia
  // en los asientos contables y copiarla acá la contaría dos veces.
  completarNumero('inafecto', detallado.recargoConsumo)

  // El RUC viaja como texto pero el modelo puede devolverlo con puntos o
  // espacios ("20601 21 2537", que es como lo imprime esta factura).
  if (!textoVacio(out.rucEmisor)) {
    const soloDigitos = String(out.rucEmisor).replace(/\D/g, '')
    if (soloDigitos) out.rucEmisor = soloDigitos
  }

  const { serie, correlativo } = splitSerieCorrelativo(
    out.serie,
    out.correlativo
  )
  if (serie) out.serie = serie
  if (correlativo) out.correlativo = correlativo

  if (!numeroVacio(out.montoTotal)) out.montoTotal = toNumber(out.montoTotal)

  return { extraccion: out, camposRecuperados: [...new Set(camposRecuperados)] }
}
