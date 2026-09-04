/**
 * Verificaciones deterministas sobre lo que devuelve el OCR. Son código, no
 * criterio del modelo: cada una puede fallar sola y decir por qué.
 *
 * Existen porque ninguna vía de lectura es confiable por sí misma. Sobre la
 * factura F001-00004468 del Hotel Bolognesi, `pdftotext -layout` produjo una
 * lectura plausible y equivocada (Op. Exonerada 72.40 en vez de 0.00) que
 * ninguna revisión visual habría notado, y que la guarda de coherencia
 * aritmética sí detecta.
 */
import { parseFechaEmisionInput } from './fecha-emision.util'
import { ExtraccionOcr, textoDe, toNumber } from './ocr-normalize.util'

export type OcrIssueSeverity = 'error' | 'warn'

export interface OcrIssue {
  code: string
  severity: OcrIssueSeverity
  message: string
  field?: string
}

export interface OcrGuardOptions {
  /** RUC de la empresa que rinde, para detectar emisor y receptor invertidos. */
  rucEmpresa?: string
  /** Fecha de referencia (inyectable para tests). */
  hoy?: Date
}

export interface OcrGuardResult {
  issues: OcrIssue[]
  hasErrors: boolean
  /** Hay al menos un error: el comprobante no debería pasar sin revisión. */
  requiereRevision: boolean
}

/** Tolerancia en soles para comparar importes (redondeo de céntimos). */
const TOLERANCIA_IMPORTE = 0.05

// --------------------------------------------------------------------------
// RUC
// --------------------------------------------------------------------------

const PESOS_MODULO_11 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

/**
 * Dígito verificador de RUC (módulo 11 de SUNAT). Cualquier dígito mal leído
 * por el OCR rompe la comprobación, así que sirve de filtro para el error más
 * caro: validar el comprobante contra SUNAT con un RUC equivocado.
 */
export function isValidRucModulo11(ruc?: string | null): boolean {
  const digits = String(ruc ?? '').replace(/\D/g, '')
  if (digits.length !== 11) return false
  const suma = PESOS_MODULO_11.reduce(
    (acc, peso, i) => acc + peso * Number(digits[i]),
    0
  )
  const resto = suma % 11
  let esperado = 11 - resto
  if (esperado === 10) esperado = 0
  if (esperado === 11) esperado = 1
  return esperado === Number(digits[10])
}

// --------------------------------------------------------------------------
// Importe en letras
// --------------------------------------------------------------------------

const NUMEROS_EN_LETRAS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
}

// Marcas diacríticas combinantes (U+0300 a U+036F). El rango se arma desde una
// cadena escapada para que no queden caracteres combinantes sueltos en el fuente.
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

function sinTildes(text: string): string {
  return text.normalize('NFD').replace(DIACRITICOS, '')
}

function normalizarLeyenda(text: string): string {
  return sinTildes(String(text).toLowerCase())
    .replace(/[^a-z0-9/\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Convierte palabras en número. Devuelve null si no reconoce ninguna. */
export function parseNumeroEnLetras(frase: string): number | null {
  const tokens = normalizarLeyenda(frase).split(' ').filter(Boolean)
  let total = 0
  let grupo = 0
  let reconocido = false

  for (const token of tokens) {
    if (token === 'mil') {
      grupo = (grupo || 1) * 1000
      total += grupo
      grupo = 0
      reconocido = true
      continue
    }
    if (token === 'millon' || token === 'millones') {
      total += (grupo || 1) * 1_000_000
      grupo = 0
      reconocido = true
      continue
    }
    const valor = NUMEROS_EN_LETRAS[token]
    if (valor != null) {
      grupo += valor
      reconocido = true
    }
    // Cualquier otra palabra (moneda, conectores) se ignora.
  }

  if (!reconocido) return null
  return total + grupo
}

/**
 * Lee la leyenda "SON: OCHENTA CON 00/100 SOLES". Es una verificación del total
 * totalmente independiente de la lectura de los dígitos, y casi toda factura
 * peruana la trae impresa.
 */
export function parseImporteEnLetras(leyenda?: string | null): number | null {
  if (!leyenda) return null
  let texto = normalizarLeyenda(leyenda)
  if (!texto) return null
  texto = texto.replace(/^son\s+/, '')

  const fraccion = /(\d{1,2})\s*\/\s*100/.exec(texto)
  let centimos = fraccion ? Number(fraccion[1]) : null
  if (fraccion) texto = texto.slice(0, fraccion.index)

  const partes = texto.split(/\bcon\b/)
  const entera = parseNumeroEnLetras(partes[0] ?? '')
  if (entera == null) return null

  if (centimos == null && partes.length > 1) {
    const decimal = parseNumeroEnLetras(partes.slice(1).join(' '))
    if (decimal != null && decimal >= 0 && decimal < 100) centimos = decimal
  }

  return Number((entera + (centimos ?? 0) / 100).toFixed(2))
}

/**
 * Busca la leyenda del importe en letras dentro de la extracción. Vive en
 * `comprobanteDetallado.leyendas` según el prompt, pero el modelo también la
 * deja en observaciones, así que se recorre el objeto buscando el patrón NN/100.
 */
export function findImporteEnLetras(extraccion: ExtraccionOcr): string | null {
  const visitados = new Set<unknown>()
  const buscar = (value: unknown, profundidad: number): string | null => {
    if (profundidad > 4 || value == null) return null
    if (typeof value === 'string') {
      return /\d{1,2}\s*\/\s*100/.test(value) ? value : null
    }
    if (typeof value !== 'object' || visitados.has(value)) return null
    visitados.add(value)
    for (const inner of Object.values(value as Record<string, unknown>)) {
      const found = buscar(inner, profundidad + 1)
      if (found) return found
    }
    return null
  }
  return buscar(extraccion, 0)
}

// --------------------------------------------------------------------------
// Guardas
// --------------------------------------------------------------------------

const SERIE_VALIDA = /^(?:[A-Z][A-Z0-9]{2,3}|\d{3,4})$/
const CORRELATIVO_VALIDO = /^\d{1,12}$/

function numeroDefinido(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = toNumber(value)
  return Number.isFinite(n) ? n : null
}

function objeto(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function runOcrGuards(
  extraccion: ExtraccionOcr,
  options: OcrGuardOptions = {}
): OcrGuardResult {
  const issues: OcrIssue[] = []
  const push = (
    severity: OcrIssueSeverity,
    code: string,
    message: string,
    field?: string
  ) => issues.push({ code, severity, message, field })

  // 1. Campos mínimos para registrar y validar el comprobante.
  const obligatorios: Array<[string, string]> = [
    ['rucEmisor', 'RUC del emisor'],
    ['serie', 'serie'],
    ['correlativo', 'correlativo'],
    ['fechaEmision', 'fecha de emisión'],
  ]
  for (const [campo, etiqueta] of obligatorios) {
    if (textoDe(extraccion[campo]).trim() === '') {
      push('error', 'campo_faltante', `No se pudo leer la ${etiqueta}.`, campo)
    }
  }
  const total = numeroDefinido(extraccion.montoTotal)
  if (total == null || total <= 0) {
    push(
      'error',
      'total_faltante',
      'No se pudo leer el importe total del comprobante.',
      'montoTotal'
    )
  }

  // 2. RUC del emisor.
  const ruc = textoDe(extraccion.rucEmisor).replace(/\D/g, '')
  if (ruc) {
    if (ruc.length !== 11) {
      push(
        'error',
        'ruc_formato',
        `El RUC leído tiene ${ruc.length} dígitos y debe tener 11.`,
        'rucEmisor'
      )
    } else if (!isValidRucModulo11(ruc)) {
      push(
        'error',
        'ruc_digito_verificador',
        `El RUC ${ruc} no pasa el dígito verificador: algún dígito se leyó mal.`,
        'rucEmisor'
      )
    }
    const rucEmpresa = String(options.rucEmpresa ?? '').replace(/\D/g, '')
    if (rucEmpresa && ruc === rucEmpresa) {
      push(
        'error',
        'ruc_emisor_es_receptor',
        'El RUC leído como emisor es el de la propia empresa: se confundió el emisor con el receptor.',
        'rucEmisor'
      )
    }
  }

  // 2b. RUC del receptor, como segunda linea de defensa.
  //
  // Quien manda en esto es SUNAT, que avisa "emitido a otro contribuyente" en
  // el arreglo `observaciones` de la consulta de validez. Este cotejo cubre los
  // casos en los que esa consulta no llega a hacerse (comprobante sin los datos
  // minimos, tipo no validable, o SUNAT caido), asi que va como aviso: una mala
  // lectura del RUC del cliente no debe bloquear un comprobante legitimo.
  const rucReceptor = textoDe(extraccion.rucReceptor).replace(/\D/g, '')
  const rucEmpresaCotejo = String(options.rucEmpresa ?? '').replace(/\D/g, '')
  if (rucReceptor && rucEmpresaCotejo && rucReceptor !== rucEmpresaCotejo) {
    const nombre = textoDe(extraccion.razonSocialReceptor).trim()
    push(
      'warn',
      'receptor_no_es_la_empresa',
      `El comprobante está emitido a ${nombre || 'otro contribuyente'} (RUC ${rucReceptor}), no a la empresa (RUC ${rucEmpresaCotejo}).`,
      'rucReceptor'
    )
  }

  // 3. Serie y correlativo.
  const serie = textoDe(extraccion.serie).trim().toUpperCase()
  if (serie && !SERIE_VALIDA.test(serie)) {
    push(
      'warn',
      'serie_formato',
      `La serie "${serie}" no tiene el formato habitual.`,
      'serie'
    )
  }
  const correlativo = textoDe(extraccion.correlativo).trim()
  if (correlativo && !CORRELATIVO_VALIDO.test(correlativo)) {
    push(
      'warn',
      'correlativo_formato',
      `El correlativo "${correlativo}" no es un número.`,
      'correlativo'
    )
  }

  // 4. Fecha de emisión.
  const fechaRaw = extraccion.fechaEmision
  if (String(fechaRaw ?? '').trim() !== '') {
    const fecha = parseFechaEmisionInput(fechaRaw as string)
    if (!fecha) {
      push(
        'error',
        'fecha_invalida',
        `No se pudo interpretar la fecha "${String(fechaRaw)}".`,
        'fechaEmision'
      )
    } else {
      const hoy = options.hoy ?? new Date()
      const unDia = 24 * 60 * 60 * 1000
      if (fecha.getTime() > hoy.getTime() + unDia) {
        push(
          'warn',
          'fecha_futura',
          'La fecha de emisión es futura.',
          'fechaEmision'
        )
      }
      const cincoAnios = 5 * 365 * unDia
      if (hoy.getTime() - fecha.getTime() > cincoAnios) {
        push(
          'warn',
          'fecha_antigua',
          'La fecha de emisión tiene más de 5 años.',
          'fechaEmision'
        )
      }
    }
  }

  // 5. Total contra el importe en letras (verificación independiente).
  if (total != null && total > 0) {
    const leyenda = findImporteEnLetras(extraccion)
    const enLetras = parseImporteEnLetras(leyenda)
    if (enLetras != null && Math.abs(enLetras - total) > TOLERANCIA_IMPORTE) {
      push(
        'error',
        'total_no_coincide_con_letras',
        `El total leído (${total.toFixed(2)}) no coincide con el importe en letras (${enLetras.toFixed(2)}).`,
        'montoTotal'
      )
    }
  }

  // 6. Coherencia de los totales del comprobante detallado.
  const totales = objeto(objeto(extraccion.comprobanteDetallado).totales)
  const importeTotalDetallado = numeroDefinido(totales.importeTotal)
  if (importeTotalDetallado != null && importeTotalDetallado > 0) {
    // La operación gratuita queda fuera a propósito: no suma al importe a pagar.
    const componentes = [
      'operacionGravada',
      'operacionExonerada',
      'operacionInafecta',
      'igv',
      'isc',
      'icbper',
      'otrosTributos',
      'otrosCargos',
    ]
      .map(key => numeroDefinido(totales[key]))
      .filter((v): v is number => v != null)
    const descuentos = numeroDefinido(totales.descuentosGlobales) ?? 0

    if (componentes.length >= 2) {
      const suma = componentes.reduce((acc, v) => acc + v, 0) - descuentos
      const tolerancia = Math.max(
        TOLERANCIA_IMPORTE,
        importeTotalDetallado * 0.005
      )
      if (Math.abs(suma - importeTotalDetallado) > tolerancia) {
        push(
          'warn',
          'suma_incoherente',
          `La suma de operaciones e impuestos (${suma.toFixed(2)}) no cuadra con el importe total (${importeTotalDetallado.toFixed(2)}).`
        )
      }
    }

    if (
      total != null &&
      Math.abs(total - importeTotalDetallado) > TOLERANCIA_IMPORTE
    ) {
      push(
        'warn',
        'total_discrepa_detallado',
        `El total (${total.toFixed(2)}) no coincide con el del comprobante detallado (${importeTotalDetallado.toFixed(2)}).`,
        'montoTotal'
      )
    }
  }

  // 7. IGV contra base afecta y tasa.
  const base = numeroDefinido(extraccion.baseAfecta)
  const igv = numeroDefinido(extraccion.igv)
  const tasa = numeroDefinido(extraccion.tasaIgv)
  if (base != null && igv != null && tasa != null && tasa > 0 && base > 0) {
    const esperado = (base * tasa) / 100
    const tolerancia = Math.max(TOLERANCIA_IMPORTE, esperado * 0.02)
    if (Math.abs(esperado - igv) > tolerancia) {
      push(
        'warn',
        'igv_incoherente',
        `El IGV leído (${igv.toFixed(2)}) no corresponde al ${tasa}% de la base (${base.toFixed(2)}).`,
        'igv'
      )
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error')
  return { issues, hasErrors, requiereRevision: hasErrors }
}

/** Resumen corto para el log. */
export function describeOcrIssues(result: OcrGuardResult): string {
  if (!result.issues.length) return 'sin observaciones'
  return result.issues
    .map(i => `${i.severity === 'error' ? 'ERROR' : 'warn'}:${i.code}`)
    .join(', ')
}
