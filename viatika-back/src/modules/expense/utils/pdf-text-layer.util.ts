/**
 * Capa de texto de un PDF digital, reconstruida a partir de las coordenadas de
 * cada palabra (`pdftotext -bbox-layout`).
 *
 * Por qué por coordenadas y no con la salida de texto plano: sobre la factura
 * del Hotel Bolognesi (F001-00004468) se comprobó que
 * - `pdf-parse` pega etiqueta y valor y hasta los invierte
 *   ("72.40S/Op. Gravada", "80.00IMPORTE TOTALS/"), y
 * - `pdftotext -layout` desplaza la columna de importes y produce una lectura
 *   plausible pero equivocada (Op. Exonerada 72.40, Op. Inafecta 80.00, con
 *   Gravada / IGV / Total vacíos).
 * Reagrupando las palabras por su coordenada Y y ordenándolas por X sale
 * "Op. Gravada S/ 72.40" / "I.G.V. (10.5%) S/ 7.60" / "IMPORTE TOTAL S/ 80.00",
 * que es lo que necesita el modelo para no adivinar.
 */
import { PopplerUnavailableError, runPoppler } from './poppler.util'
import * as path from 'path'
import { readFile } from 'fs/promises'

export interface BboxWord {
  xMin: number
  yMin: number
  xMax: number
  yMax: number
  text: string
}

export interface BboxPage {
  page: number
  widthPt: number
  heightPt: number
  words: BboxWord[]
}

export interface PdfPageText {
  page: number
  text: string
  wordCount: number
  /** Sin capa de texto aprovechable: hay que leerla como imagen. */
  isScanned: boolean
}

export interface PdfTextLayer {
  source: 'pdftotext-bbox' | 'pdf-parse' | 'ninguna'
  /**
   * `true` sólo cuando el texto se reconstruyó por coordenadas. Con `pdf-parse`
   * el orden de lectura no es confiable y el prompt debe advertirlo.
   */
  orderReliable: boolean
  pages: PdfPageText[]
  warnings: string[]
}

/**
 * Debajo de esta cantidad de palabras se considera que la página no tiene capa
 * de texto útil. No se usa un umbral de caracteres como el `PDF_MIN_TEXT_LENGTH
 * = 20` anterior: un escaneo suele traer igual el sello al pie
 * ("Representación impresa de la FACTURA ELECTRONICA, visita: ..."), que por sí
 * solo pasa los 20 caracteres y lo haría pasar por PDF digital.
 */
export const MIN_WORDS_PAGINA_DIGITAL = 25

/**
 * Tope de páginas de las que se extrae texto. Es más alto que el tope de páginas
 * que se analizan porque este texto es el que permite ubicar en qué página está
 * el comprobante dentro de un escaneo agrupado.
 */
export const MAX_PAGINAS_TEXTO = 20

/** Firma de `pdf-parse`, el respaldo cuando poppler no está disponible. */
type PdfParseFn = (data: Buffer) => Promise<{ text: string }>

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeXmlText(raw: string): string {
  return raw.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = parseInt(entity.slice(2), 16)
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }
      if (entity.startsWith('#')) {
        const code = parseInt(entity.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : match
      }
      const named = XML_ENTITIES[entity.toLowerCase()]
      return named ?? match
    }
  )
}

function attr(tag: string, name: string): number | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tag)
  if (!m) return undefined
  const value = Number(m[1])
  return Number.isFinite(value) ? value : undefined
}

/** Parsea el XHTML de `pdftotext -bbox-layout` (sin dependencias de XML). */
export function parseBboxLayoutXhtml(xhtml: string): BboxPage[] {
  const pages: BboxPage[] = []
  const pageRe = /<page\b([^>]*)>([\s\S]*?)<\/page>/gi
  let pageMatch: RegExpExecArray | null
  let pageNumber = 0

  while ((pageMatch = pageRe.exec(xhtml)) !== null) {
    pageNumber++
    const [, pageTag, body] = pageMatch
    const words: BboxWord[] = []
    const wordRe = /<word\b([^>]*)>([\s\S]*?)<\/word>/gi
    let wordMatch: RegExpExecArray | null

    while ((wordMatch = wordRe.exec(body)) !== null) {
      const [, wordTag, inner] = wordMatch
      const text = decodeXmlText(inner).trim()
      if (!text) continue
      const xMin = attr(wordTag, 'xMin')
      const yMin = attr(wordTag, 'yMin')
      const xMax = attr(wordTag, 'xMax')
      const yMax = attr(wordTag, 'yMax')
      if (xMin == null || yMin == null || xMax == null || yMax == null) continue
      words.push({ xMin, yMin, xMax, yMax, text })
    }

    pages.push({
      page: pageNumber,
      widthPt: attr(pageTag, 'width') ?? 0,
      heightPt: attr(pageTag, 'height') ?? 0,
      words,
    })
  }

  return pages
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

interface RebuildOptions {
  /** Eje sobre el que se agrupan las filas. 'y' para páginas verticales. */
  axis?: 'y' | 'x'
}

/**
 * Reagrupa palabras en filas de lectura: agrupa por el centro del eje
 * transversal con una tolerancia derivada de la altura de línea y ordena cada
 * fila por su coordenada de avance.
 */
export function rebuildTextFromWords(
  words: BboxWord[],
  options: RebuildOptions = {}
): string {
  if (!words.length) return ''
  const axis = options.axis ?? 'y'

  // Con la página rotada 90/270 las "filas" corren en vertical: se agrupa por X
  // y se ordena por Y.
  const across = (w: BboxWord) =>
    axis === 'y' ? (w.yMin + w.yMax) / 2 : (w.xMin + w.xMax) / 2
  const along = (w: BboxWord) => (axis === 'y' ? w.xMin : w.yMin)
  const thickness = (w: BboxWord) =>
    axis === 'y' ? w.yMax - w.yMin : w.xMax - w.xMin

  const alturaMediana = median(words.map(thickness).filter(v => v > 0))
  // 0.6 de la altura de línea: tolera las variaciones de línea base entre
  // celdas de una misma fila sin fusionar dos filas contiguas.
  const tolerancia = Math.max(1, alturaMediana * 0.6)

  const ordenadas = [...words].sort((a, b) => across(a) - across(b))
  const filas: BboxWord[][] = []
  let filaActual: BboxWord[] = []
  let referencia = across(ordenadas[0])

  for (const word of ordenadas) {
    if (filaActual.length && across(word) - referencia > tolerancia) {
      filas.push(filaActual)
      filaActual = []
      referencia = across(word)
    }
    if (!filaActual.length) referencia = across(word)
    filaActual.push(word)
  }
  if (filaActual.length) filas.push(filaActual)

  return filas
    .map(fila =>
      [...fila]
        .sort((a, b) => along(a) - along(b))
        .map(w => w.text)
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('\n')
}

/**
 * Palabras por fila. Agrupar por el eje equivocado (página rotada) parte cada
 * fila real en muchas de una o dos palabras, así que el promedio se desploma.
 */
function palabrasPorFila(text: string): number {
  const filas = text.split('\n').filter(Boolean)
  if (!filas.length) return 0
  const palabras = filas.reduce(
    (total, fila) => total + fila.split(' ').filter(Boolean).length,
    0
  )
  return palabras / filas.length
}

/**
 * Margen que debe ganarle el eje X al eje Y para preferirlo. El eje Y es el
 * correcto en la práctica totalidad de los casos (y poppler ya normaliza la
 * rotación declarada en el PDF), así que sólo se cambia de eje ante una mejora
 * clara, no ante un empate.
 */
const MARGEN_CAMBIO_DE_EJE = 1.25

/**
 * Reconstruye el texto de la página agrupando por Y, y sólo usa el eje X si
 * mejora la lectura de forma contundente (página rotada cuyas coordenadas
 * llegaron sin normalizar).
 */
export function rebuildPageText(page: BboxPage): string {
  const porY = rebuildTextFromWords(page.words, { axis: 'y' })
  const porX = rebuildTextFromWords(page.words, { axis: 'x' })
  return palabrasPorFila(porX) > palabrasPorFila(porY) * MARGEN_CAMBIO_DE_EJE
    ? porX
    : porY
}

function contarPalabras(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Extrae la capa de texto del PDF. Orden de preferencia:
 * 1. `pdftotext -bbox-layout` reconstruido por coordenadas (orden confiable).
 * 2. `pdf-parse` (siempre disponible como dependencia npm) si poppler no está
 *    instalado, con `orderReliable = false`.
 * 3. Nada, si el PDF no tiene texto o ambos fallan.
 */
export async function extractPdfTextLayer(
  pdfPath: string,
  tmpDir: string,
  fallbackBuffer?: Buffer,
  maxPaginasTexto = MAX_PAGINAS_TEXTO
): Promise<PdfTextLayer> {
  const warnings: string[] = []

  try {
    const outPath = path.join(tmpDir, 'text-layer.xhtml')
    // Se extrae más allá del tope de páginas que se analizan porque la selección
    // de páginas usa este texto para encontrar dónde está el comprobante, pero
    // igual se acota: un PDF de 200 páginas generaría un XHTML de varios MB.
    await runPoppler('pdftotext', [
      '-bbox-layout',
      '-enc',
      'UTF-8',
      '-f',
      '1',
      '-l',
      String(maxPaginasTexto),
      pdfPath,
      outPath,
    ])
    const xhtml = await readFile(outPath, 'utf8')
    const bboxPages = parseBboxLayoutXhtml(xhtml)
    if (bboxPages.length) {
      const pages: PdfPageText[] = bboxPages.map(bboxPage => {
        const text = rebuildPageText(bboxPage)
        const wordCount = bboxPage.words.length
        return {
          page: bboxPage.page,
          text,
          wordCount,
          isScanned: wordCount < MIN_WORDS_PAGINA_DIGITAL,
        }
      })
      return { source: 'pdftotext-bbox', orderReliable: true, pages, warnings }
    }
    warnings.push('pdftotext no devolvió páginas con texto.')
  } catch (error) {
    warnings.push(
      error instanceof PopplerUnavailableError
        ? 'pdftotext no está instalado; se usa pdf-parse como respaldo.'
        : `pdftotext falló: ${(error as Error).message}`
    )
  }

  if (fallbackBuffer) {
    try {
      // pdf-parse se publica como CommonJS: según el interop toca en `default`
      // o en el módulo mismo. Carga perezosa para no pesar en el arranque.
      const pdfModule: unknown = await import('pdf-parse')
      const conDefault = pdfModule as { default?: PdfParseFn }
      const pdfParse: PdfParseFn =
        typeof conDefault.default === 'function'
          ? conDefault.default
          : (pdfModule as PdfParseFn)
      const parsed = await pdfParse(fallbackBuffer)
      const text = (parsed.text || '').trim()
      if (text) {
        const wordCount = contarPalabras(text)
        return {
          source: 'pdf-parse',
          orderReliable: false,
          pages: [
            {
              page: 1,
              text,
              wordCount,
              isScanned: wordCount < MIN_WORDS_PAGINA_DIGITAL,
            },
          ],
          warnings,
        }
      }
    } catch (error) {
      warnings.push(`pdf-parse falló: ${(error as Error).message}`)
    }
  }

  return { source: 'ninguna', orderReliable: false, pages: [], warnings }
}
