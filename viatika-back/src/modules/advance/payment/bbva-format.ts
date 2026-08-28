/**
 * Formato de archivo BBVA — Pagos Masivos / Pago a Proveedores (BBVA Net Cash).
 *
 * Módulo PURO (sin dependencias de Nest/Mongo) para poder testearlo byte a byte
 * contra el archivo real entregado por el cliente (`__fixtures__/BBVAREND.txt`).
 *
 * Hechos del formato (verificados con el archivo real — ver docs/formato-txt-banco.md):
 *  - Texto de ANCHO FIJO (no delimitado). Sin separadores.
 *  - Codificación Latin-1 / Windows-1252 (Ñ y tildes en 1 byte). NO UTF-8.
 *  - Fin de línea CRLF.
 *  - Cabecera: 1 línea de 151 chars, empieza con `75`.
 *  - Detalle: 1 línea por beneficiario de 277 chars, empieza con `002`.
 *  - Importe en céntimos, entero, alineado a la derecha con ceros.
 *  - Textos alineados a la izquierda, rellenados con espacios.
 *  - Glosa corta = glosa larga truncada a 12.
 */

export type BbvaDocType = 'R' | 'L' | 'P' | 'E' | 'M'
export type BbvaAccountType = 'I' | 'P'

/** Un abono (línea de detalle) a generar. */
export interface BbvaDetailRecord {
  /** Tipo de documento: R=RUC, L=DNI, P=Pasaporte, E=C.Extranjería, M=C.Id.Militar. */
  documentType: BbvaDocType
  /** N° de documento (se recorta/rellena a 12). */
  documentNumber: string
  /** Tipo de cuenta: I=Interbancaria (CCI otro banco), P=Propia BBVA. */
  accountType: BbvaAccountType
  /** N° de cuenta / CCI de 20 dígitos. */
  accountNumber: string
  /** Nombre del beneficiario (mayúsculas, se recorta/rellena a 40). */
  beneficiaryName: string
  /** Importe en céntimos (entero). */
  amountCents: number
  /** Glosa larga / concepto (ej. `RENDICIÓN DE VIÁTICOS`, `REEMBOLSO`, `SOLICITUD DE FONDOS`). */
  concepto: string
  /** Email de aviso del beneficiario. */
  email: string
}

export interface BbvaHeaderMeta {
  /** Cuenta de cargo de la empresa (Client.paymentAccount). Se rellena a 21. */
  chargeAccount: string
  /** Moneda ISO (default PEN). */
  currency?: string
  /** Descripción de la planilla (ej. `PROVEEDORES SOL 02 JUNIO`). Máx. 24. */
  description: string
  /** N° de registros de detalle. */
  recordCount: number
  /** Importe total en céntimos. */
  totalCents: number
}

// ── Anchos de campo (detalle) ────────────────────────────────────────────────
const DETAIL_LEN = 277
const HEADER_LEN = 151
const W = {
  docNumber: 12,
  accountNumber: 20,
  beneficiary: 40,
  amount: 15,
  glosaCorta: 12,
  glosaLarga: 40,
  email: 80,
  reserved: 32, // pos 228-259 (ceros)
  detailFiller: 18, // pos 260-277 (espacios)
} as const

// ── Helpers de relleno ───────────────────────────────────────────────────────

/** Recorta a `len` y rellena con espacios a la derecha (texto alineado a izq). */
export function padRight(value: string, len: number): string {
  const s = (value ?? '').slice(0, len)
  return s + ' '.repeat(Math.max(len - s.length, 0))
}

/** Rellena con ceros a la izquierda (números). Recorta por la izquierda si excede. */
export function padLeftZeros(value: string, len: number): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length >= len) return digits.slice(digits.length - len)
  return '0'.repeat(len - digits.length) + digits
}

/**
 * Sanitiza textos para el archivo: mayúsculas y sin caracteres no representables
 * en Latin-1. Conserva Ñ y tildes (el archivo real las trae). Colapsa espacios y
 * quita saltos/controles.
 */
export function sanitizeLatin1(value: string): string {
  return (value ?? '')
    .toUpperCase()
    .replace(/[\r\n\t]+/g, ' ')
    // Elimina cualquier carácter fuera del rango imprimible Latin-1.
    .replace(/[^\x20-\xFF]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Sanitiza un campo de TEXTO del archivo (nombre del beneficiario, glosas,
 * descripción de la planilla). Más estricto que `sanitizeLatin1`: BBVA Net Cash
 * valida los caracteres de estos campos y rechaza el archivo COMPLETO por
 * "errores de estructura" si encuentra puntuación —
 * `Valor no permitido para campo nombre; localizado en la fila N, columna 38`
 * (el banco reporta la columna donde ARRANCA el campo, no la del carácter).
 *
 * El disparador real fue la coma: los usuarios se cargaron desde el Excel de
 * personal como `APELLIDOS, NOMBRES` (185 de 186 filas traen coma), mientras
 * que los archivos que el banco sí aceptó no tienen ni una. Las letras con
 * tilde y la Ñ NO son el problema: el archivo aceptado las trae y se conservan.
 *
 * La puntuación se sustituye por espacio, nunca se borra: `GUTIERREZ,DIEGO`
 * sin coma quedaría `GUTIERREZDIEGO`, un titular que no existe.
 */
export function sanitizeBankText(value: string): string {
  return sanitizeLatin1(value)
    // Deja letras (A-Z + acentuadas y Ñ de Latin-1), dígitos y espacio.
    .replace(/[^A-Z0-9\xC0-\xD6\xD8-\xF6\xF8-\xFF ]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Alias con el nombre del campo que provocó el rechazo (pos 38-77). */
export const sanitizeBeneficiaryName = sanitizeBankText

/**
 * Sanitiza el CORREO DE AVISO (pos 148-227). No puede usar `sanitizeBankText`:
 * la `@` y el `.` son justamente los dos únicos caracteres no alfanuméricos que
 * el archivo aceptado contiene, y sin ellos el aviso no llega a nadie. Se
 * eliminan (no se sustituyen por espacio) los caracteres ajenos a un correo,
 * incluidos los espacios: un correo partido en dos no es un correo.
 */
export function sanitizeEmail(value: string): string {
  return sanitizeLatin1(value).replace(/[^A-Z0-9@._+-]/g, '')
}

/**
 * Sanitiza el N° DE DOCUMENTO (pos 5-16). Alfanumérico: los DNI son dígitos,
 * pero pasaporte y carné de extranjería admiten letras. Fuera puntos, guiones y
 * espacios con los que suele venir escrito el documento.
 */
export function sanitizeDocNumber(value: string): string {
  return sanitizeLatin1(value).replace(/[^A-Z0-9]/g, '')
}

/** Convierte soles (number) a céntimos enteros de forma segura. */
export function solesToCents(amount: number): number {
  return Math.round(Number(amount ?? 0) * 100)
}

// ── Resolución del número de cuenta (pos 18-37) ──────────────────────────────

/** Código de banco de BBVA en las 4 primeras posiciones de una cuenta propia. */
export const BBVA_BANK_PREFIX = '0011'

/** Cuenta ya lista para el archivo, con la traza de de dónde salió. */
export interface BbvaAccountResolution {
  /** Número de 20 dígitos que va en las posiciones 18-37. */
  account20: string
  /** Campo del que se obtuvo: el CCI registrado o el N° de cuenta BBVA. */
  source: 'cci' | 'accountNumber'
}

/**
 * Normaliza una cuenta al campo de 20 dígitos del archivo. Dos formatos válidos
 * y NINGÚN relleno a ciegas:
 *
 *  - **20 dígitos** → se usa tal cual (es el CCI, o una cuenta BBVA ya en
 *    formato de 20).
 *  - **18 dígitos que empiezan en `0011`** → es el N° de cuenta BBVA. El bloque
 *    de cuenta ocupa 12 posiciones en el archivo y el banco lo entrega con 10,
 *    así que se alinea con dos ceros a la izquierda:
 *      `0011 0332 0200289116` → `0011 0332 000200289116`
 *    Verificado dígito a dígito contra las 10 filas de tipo `P` de los archivos
 *    que BBVA aceptó (`__fixtures__/BBVAREND.txt`). Esos dos dígitos NO son de
 *    control: no se calcula nada, solo se alinea el bloque.
 *
 * Cualquier otra cosa devuelve `null`. En particular, una cuenta de OTRO banco
 * sin CCI no se puede completar: rellenarla con ceros produciría una cuenta
 * ajena y existente, es decir, un abono a la persona equivocada.
 */
export function toBbvaAccount20(value: string | undefined | null): string | null {
  const digits = (value ?? '').replace(/\D/g, '')

  if (digits.length === 20) {
    // Un 20 dígitos "a la fuerza": la cuenta de 18 rellenada con ceros a la
    // IZQUIERDA. Ningún banco peruano tiene código 000 (verificado sobre los
    // 138 valores reales del cliente: 001/002/003/009). Dejarlo pasar mandaba
    // una cuenta inexistente marcada además como interbancaria.
    if (digits.startsWith('000')) return null
    // La misma cuenta rellenada por la DERECHA. En una cuenta BBVA legítima el
    // bloque de cuenta ocupa 12 posiciones y arranca con los dos ceros de
    // alineación (27/27 casos reales); una de 18 rellenada al final deja ahí el
    // inicio del número y TODOS los dígitos corridos, es decir, otra cuenta.
    if (digits.startsWith(BBVA_BANK_PREFIX) && digits.slice(8, 10) !== '00') {
      return null
    }
    return digits
  }

  if (digits.length === 18 && digits.startsWith(BBVA_BANK_PREFIX)) {
    return digits.slice(0, 8) + '00' + digits.slice(8)
  }
  return null
}

/**
 * Explica en una frase por qué una cuenta no se pudo usar. Solo tiene sentido
 * cuando `toBbvaAccount20` devolvió `null`. Existe para que Tesorería lea qué
 * corregir en cada caso, en vez del mismo "CCI inválido" para cinco problemas
 * distintos que se arreglan de forma distinta.
 */
export function describeBbvaAccountProblem(value: string | undefined | null): string {
  const d = (value ?? '').replace(/\D/g, '')
  if (!d) return 'está vacío'
  if (d.length === 20 && d.startsWith('000')) {
    return `parece un N° de cuenta de 18 dígitos rellenado con ceros a la izquierda ("${d}")`
  }
  if (d.length === 20 && d.startsWith(BBVA_BANK_PREFIX)) {
    return `es una cuenta BBVA con los dígitos corridos ("${d}"): sobra relleno al final`
  }
  if (d.length === 18) {
    return `tiene 18 dígitos y no es una cuenta BBVA ("${d}"), así que falta su CCI de 20`
  }
  return `tiene ${d.length} dígitos y se necesitan 20 (CCI) o 18 (cuenta BBVA)`
}

/**
 * Resuelve la cuenta a usar a partir de lo que el usuario tenga registrado.
 * Prefiere el CCI; si falta o no es utilizable, cae al N° de cuenta — que para
 * BBVA alcanza, y que además rescata a los usuarios cargados al revés (el CCI
 * guardado en `accountNumber` con `cci` vacío, ver `cargar-detroit-2026-08.mjs`).
 * Devuelve `null` solo cuando NINGUNO de los dos sirve.
 */
export function resolveBbvaAccount(opts: {
  cci?: string | null
  accountNumber?: string | null
}): BbvaAccountResolution | null {
  const desdeCci = toBbvaAccount20(opts.cci)
  if (desdeCci) return { account20: desdeCci, source: 'cci' }
  const desdeCuenta = toBbvaAccount20(opts.accountNumber)
  if (desdeCuenta) return { account20: desdeCuenta, source: 'accountNumber' }
  return null
}

// ── Construcción de líneas ───────────────────────────────────────────────────

/** Construye una línea de DETALLE (277 chars). */
export function buildDetailLine(rec: BbvaDetailRecord): string {
  const concepto = sanitizeBankText(rec.concepto)
  const glosaCorta = concepto.slice(0, W.glosaCorta)

  const line =
    '00' + // pos 1-2  filler
    '2' + // pos 3    tipo registro detalle
    rec.documentType + // pos 4    tipo doc
    padRight(sanitizeDocNumber(rec.documentNumber), W.docNumber) + // pos 5-16
    rec.accountType + // pos 17   tipo cuenta
    padRight(padLeftZeros(rec.accountNumber, W.accountNumber), W.accountNumber) + // pos 18-37
    padRight(sanitizeBankText(rec.beneficiaryName), W.beneficiary) + // pos 38-77
    padLeftZeros(String(Math.max(0, Math.round(rec.amountCents))), W.amount) + // pos 78-92
    'F' + // pos 93   flag glosa corta
    padRight(glosaCorta, W.glosaCorta) + // pos 94-105
    'N' + // pos 106  flag glosa larga
    padRight(concepto, W.glosaLarga) + // pos 107-146
    'E' + // pos 147  flag email
    padRight(sanitizeEmail(rec.email), W.email) + // pos 148-227
    '0'.repeat(W.reserved) + // pos 228-259 reservado
    ' '.repeat(W.detailFiller) // pos 260-277 filler

  if (line.length !== DETAIL_LEN) {
    throw new Error(
      `Línea de detalle con longitud inválida (${line.length} ≠ ${DETAIL_LEN}) para ${rec.beneficiaryName}`
    )
  }
  return line
}

/** Construye la línea de CABECERA (151 chars). */
export function buildHeaderLine(meta: BbvaHeaderMeta): string {
  // Sin `padRight`: una moneda que quede vacía debe romper el chequeo de
  // longitud de abajo, no colarse como 3 espacios en una cabecera aceptable.
  const currency = sanitizeBankText(meta.currency ?? 'PEN')
    .replace(/[^A-Z]/g, '')
    .slice(0, 3)
  const line =
    '75' + // pos 1-2   prefijo cabecera
    padRight(padLeftZeros(meta.chargeAccount, 21), 21) + // pos 3-23  cuenta de cargo
    currency + // pos 24-26 moneda
    padLeftZeros(String(Math.max(0, Math.round(meta.totalCents))), 15) + // pos 27-41 total céntimos
    'A' + // pos 42    flag
    ' '.repeat(9) + // pos 43-51
    padRight(sanitizeBankText(meta.description), 24) + // pos 52-75 descripción
    ' ' + // pos 76
    padLeftZeros(String(meta.recordCount), 6) + // pos 77-82 N° registros
    'S' + // pos 83    flag
    '0'.repeat(18) + // pos 84-101
    ' '.repeat(50) // pos 102-151

  if (line.length !== HEADER_LEN) {
    throw new Error(
      `Cabecera con longitud inválida (${line.length} ≠ ${HEADER_LEN})`
    )
  }
  return line
}

/**
 * Construye el contenido completo del archivo (cabecera + detalles), unido con
 * CRLF. El total y el conteo de la cabecera se calculan de los registros, salvo
 * que se pasen explícitos en `metaOverride`.
 *
 * SIN salto de línea final: el archivo real que el banco acepta termina en el
 * último carácter del último detalle. Un CRLF de cierre deja una línea vacía
 * que algunos validadores de Net Cash cuentan como registro malformado.
 */
export function buildBbvaTxt(
  records: BbvaDetailRecord[],
  metaOverride: Omit<BbvaHeaderMeta, 'recordCount' | 'totalCents'> &
    Partial<Pick<BbvaHeaderMeta, 'recordCount' | 'totalCents'>>
): string {
  const totalCents =
    metaOverride.totalCents ??
    records.reduce((s, r) => s + Math.round(r.amountCents), 0)
  const recordCount = metaOverride.recordCount ?? records.length
  const header = buildHeaderLine({ ...metaOverride, totalCents, recordCount })
  const details = records.map(buildDetailLine)
  return [header, ...details].join('\r\n')
}

/** Codifica el texto del archivo a un Buffer Latin-1 (Windows-1252). */
export function toLatin1Buffer(txt: string): Buffer {
  return Buffer.from(txt, 'latin1')
}

// ── Conciliación del PDF de retorno ──────────────────────────────────────────

export interface BbvaPdfRow {
  /** Titular tal como lo devuelve el PDF (ya normalizado para comparar). */
  titular: string
  /** DNI / número de documento extraído (solo dígitos). */
  documentNumber: string
  /** Importe en soles (2 decimales). */
  amount: number
  /** Situación (ABONO ENVIADO / ABONO CORRECTO / etc.). */
  situacion: string
  /** true si la situación indica abono exitoso. */
  success: boolean
  /**
   * Cómo se leyó la columna "Situación" de ESTA fila, antes de contrastar con la
   * cabecera. Se conserva en la fila (y no en un arreglo aparte) porque el
   * contraste ocurre después de fusionar las filas de varios PDF del mismo lote
   * y ahí ya no hay forma de mantener un arreglo paralelo en orden.
   */
  estado?: 'ok' | 'fallo' | 'ilegible'
}

/**
 * Totales que el propio reporte declara en el bloque "Después del proceso".
 * Son la fuente de verdad a nivel documento y permiten validar lo que se leyó
 * fila por fila (ver `parseBbvaPdfText`).
 */
export interface BbvaPdfTotals {
  /** "Abonos procesados". */
  procesados?: number
  /** "Abonos NO procesados". */
  noProcesados?: number
  /** "Importe cargado por abonos" (sin comisiones). */
  importeAbonado?: number
}

export interface BbvaPdfSummary {
  rows: BbvaPdfRow[]
  /** N° de movimiento de cargo (N° de operación del lote), si se detecta. */
  operationNumber?: string
  /** Fecha/hora de ejecución del lote, si se detecta. */
  executedAt?: string
  /** Totales declarados en la cabecera, si se detectan. */
  declared?: BbvaPdfTotals
  /**
   * La columna "Situación" era ilegible y el resultado se resolvió cuadrando
   * las filas contra los totales de la cabecera. El llamador lo informa como
   * advertencia para que quede rastro de por qué se dieron por abonadas.
   */
  situacionResueltaPorCabecera?: boolean
  /**
   * Lo leído fila por fila contradice los totales de la cabecera. Ninguna fila
   * se da por abonada: el llamador debe mandar a confirmación manual.
   */
  inconsistenteConCabecera?: boolean
}

/**
 * Normaliza un nombre para comparar: mayúsculas, sin tildes, sin caracteres no
 * alfanuméricos, espacios colapsados. Corrige la corrupción de Ñ que el PDF de
 * BBVA suele traer (`SALDAµA`, `PE#A` → `SALDANA`, `PENA`).
 */
export function normalizeName(value: string): string {
  return (value ?? '')
    // Ñ corrupta en el PDF: µ (0xB5) y # aparecen en lugar de Ñ. Se corrige ANTES
    // de mayúsculas porque `'µ'.toUpperCase()` en JS devuelve la Mu griega (U+039C).
    .replace(/[µ#ÑñΜµΜ]/g, 'N')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ¿Coinciden dos nombres? Tolerante al orden de tokens: coincide si comparten al
 * menos 2 tokens significativos, o todos los de la cadena más corta.
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = normalizeName(a).split(' ').filter((t) => t.length > 2)
  const tb = normalizeName(b).split(' ').filter((t) => t.length > 2)
  if (!ta.length || !tb.length) return false
  const setB = new Set(tb)
  const shared = ta.filter((t) => setB.has(t)).length
  return shared >= 2 || shared === Math.min(ta.length, tb.length)
}

/** ¿La situación del PDF indica un abono exitoso? */
export function isSuccessfulSituacion(situacion: string): boolean {
  const s = (situacion ?? '').toUpperCase()
  return s.includes('ABONO ENVIADO') || s.includes('ABONO CORRECTO')
}

/** Palabras de la columna "Situación" que indican abono exitoso. */
const SITUACION_OK = ['ABONO', 'ABONADO', 'ENVIADO', 'CORRECTO', 'PROCESADO']

/** Palabras de la columna "Situación" que indican que el abono NO se hizo. */
const SITUACION_FALLO = [
  'ERRADO',
  'ERRADA',
  'ERROR',
  'RECHAZADO',
  'DEVUELTO',
  'ANULADO',
  'EXTORNADO',
  'OBSERVADO',
  'PENDIENTE',
]

/**
 * "NO ABONADO" / "NO PROCESADO" / "NO ENVIADO": el NO invierte el sentido de la
 * palabra que sigue, así que hay que verlos como frase y antes que los tokens.
 */
const SITUACION_FALLO_FRASE = /\bNO\s+(?:ABON|PROCES|ENVIA)/

/**
 * Recortes de 3 letras admitidos uno por uno. Con solo 3 letras —y la última
 * pudiendo estar mal leída— quedan 2 caracteres de señal, que es demasiado poco
 * para una regla general: "PEA" (de PEÑA, un apellido) casaría con PENDIENTE y
 * marcaría como rechazado un abono que sí se hizo. Se listan entonces los
 * recortes que el banco produce de verdad y ninguno más.
 */
const SITUACION_OK_CORTO = ['ABC', 'ABO', 'ABN']
const SITUACION_FALLO_CORTO = ['ERR']

/**
 * ¿`token` es la palabra `palabra` o un recorte suyo? "Situación" es la última
 * columna de la tabla y la impresión del reporte la corta en el borde de la
 * página: "ABONO ENVIADO" llega partido en dos líneas y recortado como
 * "ABC"+"ENVI" (lote 000025800) o "ABONC"+"ENVIAL" (lote 000025714). Se admite
 * el prefijo y también el prefijo con la última letra mal leída, que es justo
 * donde el corte parte el trazo del carácter.
 */
function esFragmentoDe(token: string, palabra: string): boolean {
  if (token.length < 4) return false
  return palabra.startsWith(token) || palabra.startsWith(token.slice(0, -1))
}

/**
 * Como `esFragmentoDe` pero SIN tolerar la última letra mal leída. Se usa para
 * los fallos: un falso "abonado" lo caza el contraste con la cabecera, pero un
 * falso "rechazado" además bloquea ese rescate para todo el documento, así que
 * conviene ser más exigente de este lado.
 */
function esPrefijoDe(token: string, palabra: string): boolean {
  return token.length >= 4 && palabra.startsWith(token)
}

/** Tokens alfabéticos de una línea, sin puntuación ("ERR/" → "ERR"). */
function tokensDeLinea(linea: string): string[] {
  return linea
    .split(/\s+/)
    .map(t => t.replace(/[^A-Z]/g, ''))
    .filter(Boolean)
}

/**
 * Lee la situación de un abono a partir de la ventana de texto que le sigue.
 *
 * Se compara por TOKEN COMPLETO y no por substring: con substrings, un apellido
 * como CORREA activaría el patrón "CORR" y daría por abonado a quien no cobró.
 *
 * La asimetría entre éxito y fallo es deliberada. Un fallo se acepta desde
 * cualquier posición de la línea; un éxito solo si el fragmento es el ÚLTIMO
 * token de su línea, que es donde cae la última columna de la tabla. Ante la
 * duda conviene equivocarse hacia "no abonado", que manda a confirmación
 * manual, y nunca hacia dar por pagado a alguien.
 *
 * Devuelve tres estados, no dos: hay que distinguir "el banco dice que falló"
 * de "no se pudo leer la situación", porque solo el segundo admite resolverse
 * contra los totales de la cabecera (ver `verificarContraCabecera`).
 */
export function clasificarSituacion(ventana: string): 'ok' | 'fallo' | 'ilegible' {
  const texto = (ventana ?? '').toUpperCase()
  if (SITUACION_FALLO_FRASE.test(texto)) return 'fallo'

  const lineas = texto.split('\n')
  const ultimoToken = (linea: string) => {
    const tokens = tokensDeLinea(linea)
    return tokens[tokens.length - 1]
  }

  for (const linea of lineas) {
    if (tokensDeLinea(linea).some(t => SITUACION_FALLO.includes(t))) return 'fallo'
    const ultimo = ultimoToken(linea)
    if (!ultimo) continue
    if (SITUACION_FALLO_CORTO.includes(ultimo)) return 'fallo'
    if (SITUACION_FALLO.some(p => esPrefijoDe(ultimo, p))) return 'fallo'
  }
  for (const linea of lineas) {
    const ultimo = ultimoToken(linea)
    if (!ultimo) continue
    if (SITUACION_OK_CORTO.includes(ultimo)) return 'ok'
    if (SITUACION_OK.some(p => esFragmentoDe(ultimo, p))) return 'ok'
  }
  return 'ilegible'
}

/** Longitud del número de documento por tipo (Perú): DNI=8, RUC=11. */
const DOC_LEN: Partial<Record<BbvaDocType, number>> = { L: 8, R: 11 }

/** Palabras de banco a descartar al extraer el titular del PDF. */
const BANK_WORDS =
  /CREDITO|DEL PERU|SCOTIABANK|INTERBANK|BBVA|CONTINENTAL|BANCO|PERU S\.?A|NACION|PICHINCHA|BIF/i

/**
 * El PDF de BBVA trae el documento y el importe PEGADOS en un solo bloque
 * (ej. `75162447304.00` = DNI 75162447 + 304.00; `100170561,154.00` = 10017056
 * + 1,154.00). Los separa usando la longitud fija del documento por tipo; si es
 * desconocida, toma el importe como el patrón decimal final y el resto como
 * documento.
 */
export function splitDocAndAmount(
  type: BbvaDocType,
  blob: string
): { documentNumber: string; amount: number } {
  const trimmed = (blob ?? '').trim()

  // Caso ESPACIADO: "75162447 304.00" (documento y monto separados).
  const spaced = trimmed.match(/^(\d[\d,]*)\s+(\d[\d,]*\.\d{2})$/)
  if (spaced) {
    return {
      documentNumber: spaced[1].replace(/\D/g, ''),
      amount: Number(spaced[2].replace(/,/g, '')),
    }
  }

  // Caso PEGADO: "75162447304.00" / "100170561,154.00". Separa por longitud fija
  // del documento según el tipo (DNI=8, RUC=11).
  const compact = trimmed.replace(/\s/g, '')
  const len = DOC_LEN[type]
  if (len && compact.replace(/[.,]/g, '').length > len) {
    return {
      documentNumber: compact.slice(0, len).replace(/\D/g, ''),
      amount: Number(compact.slice(len).replace(/,/g, '')),
    }
  }
  // Tipo de longitud desconocida: importe = patrón decimal final, doc = resto.
  const m = compact.match(/^(\d+?)(\d{1,3}(?:,\d{3})*\.\d{2})$/)
  if (m) return { documentNumber: m[1], amount: Number(m[2].replace(/,/g, '')) }
  return { documentNumber: '', amount: NaN }
}

/** Titular a mejor esfuerzo: líneas de solo letras antes del documento, sin bancos. */
function extractTitularBefore(before: string): string {
  const nameLines = before
    .split('\n')
    .map((s) => s.trim())
    .filter(
      (l) =>
        /^[A-ZÁÉÍÓÚÑµ#\s.]+$/.test(l) &&
        !BANK_WORDS.test(l) &&
        l.replace(/\s/g, '').length > 1
    )
  return normalizeName(nameLines.slice(-4).join(' '))
}

/**
 * Lee UN PDF "Consulta de Pagos Masivos" de BBVA, sin contrastar todavía con los
 * totales de la cabecera. El PDF real es MUY frágil: el documento y el importe
 * salen pegados (`L - 75162447304.00`), los nombres se parten en varias líneas y
 * la situación aparece en líneas aparte o pegada al importe (`249.80CORRECTO`).
 * Por eso la conciliación cruza por DNI+monto (no por el nombre) y admite un
 * fallback manual. Extrae, por abono: documento, importe y cómo se leyó su
 * situación.
 *
 * El contraste contra la cabecera va aparte (`verificarContraCabecera`) porque
 * el banco pagina la relación de abonos: un lote puede llegar repartido en
 * varios PDF y los totales solo cuadran una vez fusionadas TODAS las filas.
 */
export function readBbvaPdfText(text: string): BbvaPdfSummary {
  const rows: BbvaPdfRow[] = []
  const clean = (text ?? '').replace(/\r/g, '')

  // N° de movimiento de cargo (N° de operación del lote).
  const opMatch =
    clean.match(/movimiento\s+de\s+cargo[^\d]*(\d{6,})/i) ||
    clean.match(/n[ºo°.]*\s*movimiento[^\d]*(\d{6,})/i)
  // Fecha de ejecución del lote (evita la fecha de emisión del reporte).
  const dateMatch =
    clean.match(
      /ejecuci[oó]n[^\d]*(\d{2}[/-]\d{2}[/-]\d{2,4}(?:\s*-?\s*\d{2}:\d{2}(?::\d{2})?)?)/i
    ) || clean.match(/(\d{2}[/-]\d{2}[/-]\d{2,4}\s+\d{2}:\d{2}(?::\d{2})?)/)

  // Documento + importe: PEGADOS ("L - 75162447304.00", "L - 100170561,154.00",
  // o con situación pegada "L - 09831083249.80CORRECTO") o ESPACIADOS
  // ("L - 75162447 304.00"). El grupo admite dígitos, comas, puntos y espacios,
  // y debe terminar en un importe con 2 decimales.
  const docRe = /([RLPEM])\s*-\s*([\d,. ]+\.\d{2})/g
  const hits: Array<{ index: number; end: number; type: BbvaDocType; blob: string }> = []
  let m: RegExpExecArray | null
  while ((m = docRe.exec(clean)) !== null) {
    hits.push({ index: m.index, end: m.index + m[0].length, type: m[1].toUpperCase() as BbvaDocType, blob: m[2] })
  }

  for (let k = 0; k < hits.length; k++) {
    const cur = hits[k]
    const { documentNumber, amount } = splitDocAndAmount(cur.type, cur.blob)
    if (!documentNumber || !Number.isFinite(amount) || amount <= 0) continue

    // Ventana de situación ACOTADA al abono actual: desde el fin del importe hasta
    // el inicio del siguiente documento (o +120 chars), para no “robar” la
    // situación de la fila siguiente. Un abono fallido gana sobre uno exitoso.
    const nextIdx = k + 1 < hits.length ? hits[k + 1].index : clean.length
    const sit = clean.slice(cur.end, Math.min(nextIdx, cur.end + 120))
    const estado = clasificarSituacion(sit)
    const success = estado === 'ok'

    // Titular ACOTADO entre el documento anterior y el actual (mejor esfuerzo).
    const prevEnd = k > 0 ? hits[k - 1].end : 0
    const titular = extractTitularBefore(
      clean.slice(Math.max(prevEnd, cur.index - 140), cur.index)
    )

    rows.push({
      titular,
      documentNumber,
      amount,
      situacion: success ? 'ABONO ENVIADO' : '',
      success,
      estado,
    })
  }

  return {
    rows,
    operationNumber: opMatch?.[1],
    executedAt: dateMatch?.[1],
    declared: parseDeclaredTotals(clean),
  }
}

/**
 * Contrasta lo leído fila por fila contra los totales que declara el propio
 * reporte, y ajusta el `success` de las filas en consecuencia.
 *
 * La lectura fila por fila depende de una tabla que el PDF recorta y que el OCR
 * puede equivocar. La cabecera ("Abonos procesados", "Abonos NO procesados",
 * "Importe cargado por abonos") es un invariante a nivel documento: sirve para
 * CONFIRMAR la lectura, para RESCATARLA cuando la columna "Situación" es
 * ilegible, y para DESAUTORIZARLA cuando no cuadra.
 *
 * Sólo se aplica si los tres datos están; con la cabecera incompleta no hay
 * invariante que verificar y se respeta lo leído por fila.
 *
 * Va separado de la lectura porque el banco pagina la relación de abonos: con
 * un lote repartido en varios PDF, los totales solo cuadran contra la UNIÓN de
 * las filas, nunca contra las de un archivo suelto.
 */
export function verificarContraCabecera(summary: BbvaPdfSummary): BbvaPdfSummary {
  const { rows, declared } = summary
  summary.situacionResueltaPorCabecera = false
  summary.inconsistenteConCabecera = false

  const hayIlegibles = rows.some(r => r.estado === 'ilegible')
  const hayFallos = rows.some(r => r.estado === 'fallo')

  if (declared && declaracionCompleta(declared)) {
    if (!coincideConCabecera(rows, declared)) {
      if (hayIlegibles && !hayFallos && cuadraConCabecera(rows, declared)) {
        // La columna venía cortada, pero el banco declara que procesó todas las
        // filas leídas por el importe exacto: no hay otra combinación posible.
        for (const row of rows) {
          row.success = true
          row.situacion = 'ABONO ENVIADO'
          row.estado = 'ok'
        }
        summary.situacionResueltaPorCabecera = true
      } else {
        // Lo leído contradice a la cabecera: se leyó de más, de menos o mal.
        // Se falla cerrado — ninguna fila se da por abonada y el flujo cae a la
        // confirmación manual. Equivocarse hacia "no pagado" se corrige a mano;
        // marcar pagado a quien no cobró, no.
        for (const row of rows) {
          row.success = false
          row.situacion = ''
        }
        summary.inconsistenteConCabecera = true
      }
    }
  }
  return summary
}

/** Resultado de fusionar las lecturas de varios PDF del mismo lote. */
export interface BbvaMergeResult {
  summary: BbvaPdfSummary
  /** Por qué NO se pueden fusionar (son de lotes distintos). Vacío si todo bien. */
  conflicto?: string
}

/**
 * Fusiona las lecturas de varios PDF del MISMO lote y las verifica como un
 * único documento.
 *
 * El reporte del banco pagina la "Relación de las cuentas de abono" (botones
 * "Siguiente"/"Anterior"), de modo que un lote grande sale repartido en varios
 * archivos y cada uno REPITE la cabecera completa. Por eso se validan primero
 * el N° de movimiento de cargo y los totales: si difieren, son órdenes
 * distintas y fusionarlas validaría las filas de una contra los totales de la
 * otra.
 *
 * A propósito NO se deduplica por documento+importe: un mismo trabajador puede
 * tener dos abonos idénticos en la misma planilla (en el lote 000025800 hay dos
 * filas de S/266.00 al DNI 72233722, y son dos pagos distintos). Si alguien
 * sube dos veces la misma página, quien lo detecta es el conteo contra la
 * cabecera, no un dedupe que se comería un pago legítimo.
 */
export function mergeBbvaReadings(parts: BbvaPdfSummary[]): BbvaMergeResult {
  const operaciones = [
    ...new Set(parts.map(p => p.operationNumber).filter(Boolean) as string[]),
  ]
  if (operaciones.length > 1) {
    return {
      summary: { rows: [] },
      conflicto:
        `Los PDF son de órdenes distintas (N° ${operaciones.join(' y N° ')}). ` +
        'Sube solo las páginas de un mismo lote.',
    }
  }

  const declaraciones = parts
    .map(p => p.declared)
    .filter((d): d is BbvaPdfTotals => !!d && declaracionCompleta(d))
  const base = declaraciones[0]
  const difiere = (d: BbvaPdfTotals) =>
    d.procesados !== base.procesados ||
    d.noProcesados !== base.noProcesados ||
    Math.abs((d.importeAbonado ?? 0) - (base.importeAbonado ?? 0)) >= 0.01
  if (base && declaraciones.some(difiere)) {
    return {
      summary: { rows: [] },
      conflicto:
        'Los PDF declaran totales distintos en su cabecera: no son del mismo ' +
        'lote. Sube solo las páginas de un mismo reporte.',
    }
  }

  return {
    summary: verificarContraCabecera({
      rows: parts.flatMap(p => p.rows),
      operationNumber: operaciones[0],
      executedAt: parts.find(p => p.executedAt)?.executedAt,
      declared: base ?? parts.find(p => p.declared)?.declared,
    }),
  }
}

/**
 * Lee y verifica UN solo PDF. Atajo de `readBbvaPdfText` +
 * `verificarContraCabecera` para el caso de un lote que cabe en un archivo.
 */
export function parseBbvaPdfText(text: string): BbvaPdfSummary {
  return verificarContraCabecera(readBbvaPdfText(text))
}

/** ¿La cabecera trae los tres datos que hacen falta para verificar? */
function declaracionCompleta(d: BbvaPdfTotals): boolean {
  return (
    d.procesados !== undefined &&
    d.noProcesados !== undefined &&
    d.importeAbonado !== undefined
  )
}

/**
 * ¿Lo leído fila por fila concuerda con la cabecera? Compara las filas dadas por
 * exitosas contra "Abonos procesados" y su suma contra "Importe cargado por
 * abonos", y exige además que el total de filas sea procesados + no procesados
 * (si no, se leyeron de más o de menos).
 */
export function coincideConCabecera(
  rows: BbvaPdfRow[],
  declared?: BbvaPdfTotals
): boolean {
  if (!declared || !declaracionCompleta(declared)) return false
  const { procesados = 0, noProcesados = 0, importeAbonado = 0 } = declared
  if (rows.length !== procesados + noProcesados) return false
  const exitosas = rows.filter(r => r.success)
  if (exitosas.length !== procesados) return false
  const suma = exitosas.reduce((s, r) => s + r.amount, 0)
  return Math.abs(suma - importeAbonado) < 0.01
}

/** Totales del bloque "Consulta de la Orden - Después del proceso". */
export function parseDeclaredTotals(text: string): BbvaPdfTotals | undefined {
  const entero = (re: RegExp): number | undefined => {
    const m = text.match(re)
    return m ? Number(m[1]) : undefined
  }
  // "Abonos NO procesados" se busca primero: su patrón es más específico y
  // "Abonos procesados" también casaría con esa línea si se probara antes.
  const noProcesados = entero(/Abonos\s+NO\s+procesados[^\d]*(\d+)/i)
  const procesados = entero(/Abonos\s+procesados[^\d]*(\d+)/i)
  const importeMatch = text.match(
    /Importe\s+cargado\s+por\s+abonos[^\d]*([\d,]+\.\d{2})/i
  )
  const importeAbonado = importeMatch
    ? Number(importeMatch[1].replace(/,/g, ''))
    : undefined

  if (
    procesados === undefined &&
    noProcesados === undefined &&
    importeAbonado === undefined
  ) {
    return undefined
  }
  return { procesados, noProcesados, importeAbonado }
}

/**
 * ¿Las filas leídas cuadran exactamente con lo que declara la cabecera? Exige
 * las TRES condiciones; si falta cualquiera de los tres datos devuelve false,
 * porque sin el invariante completo no hay garantía y el flujo debe caer a la
 * confirmación manual.
 */
export function cuadraConCabecera(
  rows: BbvaPdfRow[],
  declared?: BbvaPdfTotals
): boolean {
  if (!rows.length || !declared) return false
  const { procesados, noProcesados, importeAbonado } = declared
  if (procesados === undefined || noProcesados === undefined) return false
  if (importeAbonado === undefined) return false
  if (noProcesados !== 0) return false
  if (procesados !== rows.length) return false
  const suma = rows.reduce((s, r) => s + r.amount, 0)
  return Math.abs(suma - importeAbonado) < 0.01
}
