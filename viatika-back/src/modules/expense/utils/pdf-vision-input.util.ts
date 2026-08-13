/**
 * Prepara lo que se le manda al modelo para leer un PDF de comprobante: la capa
 * de texto exacta (cuando el PDF es digital) más las imágenes rasterizadas.
 *
 * Se mandan las dos señales a propósito. Ninguna alcanza sola:
 * - el texto plano de cualquier extractor puede desalinear etiqueta y valor
 *   (`pdftotext -layout` sobre la factura F001-00004468 asignaba 72.40 a
 *   Op. Exonerada, que en el documento es 0.00), y
 * - la imagen llega reescalada por la API y a esa resolución los dígitos chicos
 *   se pierden.
 * Con las dos, los dígitos salen del texto y la asociación etiqueta-valor se
 * confirma con la imagen.
 */
import {
  PdfGeometry,
  PopplerUnavailableError,
  parsePdfInfo,
  pdfInfoArgs,
  runPoppler,
  withTempPdf,
} from './poppler.util'
import {
  PdfPageText,
  PdfTextLayer,
  extractPdfTextLayer,
} from './pdf-text-layer.util'
import {
  planificarRenderDetallado,
  renderPlan,
  seleccionarPaginas,
} from './pdf-render.util'

/** Máximo de páginas que se analizan de un PDF largo. */
export const MAX_PAGINAS_ANALIZADAS = 5
/**
 * Máximo de imágenes que se mandan al modelo. Una página escaneada A4 son 4
 * bandas, así que este tope es el que realmente acota el costo (el tope por
 * páginas no alcanza cuando cada página aporta varias imágenes).
 */
export const MAX_IMAGENES_VISION = 8
/** Tope de caracteres de capa de texto que se envían. */
export const MAX_CHARS_TEXTO = 15_000

export interface PdfVisionInput {
  texto: string
  textoSource: PdfTextLayer['source']
  /** El orden de lectura del texto es confiable (reconstruido por coordenadas). */
  ordenConfiable: boolean
  imagenes: string[]
  paginasAnalizadas: number[]
  pageCount: number
  /** Alguna página no tiene capa de texto y se leyó como imagen. */
  tieneEscaneos: boolean
  warnings: string[]
  /** Resumen de una línea para el log. */
  resumen: string
}

export class PdfSinContenidoLegibleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfSinContenidoLegibleError'
  }
}

const GEOMETRIA_POR_DEFECTO: PdfGeometry = {
  pageCount: 1,
  encrypted: false,
  sizes: [{ page: 1, widthPt: 595, heightPt: 842, rotation: 0 }],
}

function armarTexto(pages: PdfPageText[], varias: boolean): string {
  const bloques = pages
    .filter(p => p.text.trim())
    .map(p => (varias ? `=== Página ${p.page} ===\n${p.text}` : p.text))
  return bloques.join('\n\n').slice(0, MAX_CHARS_TEXTO)
}

export interface PrepararOptions {
  maxPaginas?: number
  maxImagenes?: number
  /**
   * Manda todas las páginas en bandas de alta resolución, incluso las que tienen
   * capa de texto. Es el reintento de `scanInvoicePdf` cuando las guardas
   * deterministas rechazan la primera lectura.
   */
  forzarBandas?: boolean
}

export async function preparePdfVisionInput(
  buffer: Buffer,
  options: PrepararOptions = {}
): Promise<PdfVisionInput> {
  const maxPaginas = options.maxPaginas ?? MAX_PAGINAS_ANALIZADAS
  const maxImagenes = options.maxImagenes ?? MAX_IMAGENES_VISION

  return withTempPdf(buffer, async (pdfPath, tmpDir) => {
    const warnings: string[] = []

    let geometria = GEOMETRIA_POR_DEFECTO
    try {
      geometria = parsePdfInfo(
        await runPoppler('pdfinfo', pdfInfoArgs(pdfPath, maxPaginas))
      )
    } catch (error) {
      warnings.push(
        error instanceof PopplerUnavailableError
          ? 'pdfinfo no está instalado; se asume una página A4.'
          : `pdfinfo falló: ${(error as Error).message}`
      )
    }

    const capa = await extractPdfTextLayer(pdfPath, tmpDir, buffer)
    warnings.push(...capa.warnings)

    const textoPorPagina = new Map(capa.pages.map(p => [p.page, p]))
    const paginas = seleccionarPaginas(
      capa.pages,
      geometria.pageCount,
      maxPaginas
    )
    const { paginas: plan, descartes } = planificarRenderDetallado(
      paginas,
      geometria.sizes,
      textoPorPagina,
      maxImagenes,
      { forzarBandas: options.forzarBandas }
    )
    for (const descarte of descartes) {
      warnings.push(`Tope de imágenes alcanzado: ${descarte}.`)
    }

    let imagenes: string[] = []
    try {
      imagenes = await renderPlan(pdfPath, tmpDir, plan)
    } catch (error) {
      // Sin imágenes se sigue adelante si hay capa de texto: es mejor leer el
      // comprobante con el texto exacto que abortar el escaneo. Es también lo
      // que permite trabajar en local sin poppler instalado.
      warnings.push(
        error instanceof PopplerUnavailableError
          ? 'pdftoppm no está instalado; el PDF se lee sólo con su capa de texto.'
          : `pdftoppm falló: ${(error as Error).message}`
      )
    }

    const paginasConTexto = capa.pages.filter(p => !p.isScanned)
    const texto = armarTexto(paginasConTexto, paginas.length > 1)
    const tieneEscaneos = plan.some(p => p.modo === 'bandas')

    if (!texto && !imagenes.length) {
      throw new PdfSinContenidoLegibleError(
        geometria.encrypted
          ? 'El PDF está protegido con contraseña y no se puede leer.'
          : 'No se pudo extraer texto ni imágenes del PDF.'
      )
    }

    const detalleImagenes = plan
      .map(p =>
        p.modo === 'bandas'
          ? `p${p.page}:${p.bandas.length} bandas @${p.dpi}dpi`
          : `p${p.page}:completa @${p.dpi}dpi`
      )
      .join(', ')

    return {
      texto,
      textoSource: capa.source,
      ordenConfiable: capa.orderReliable,
      imagenes,
      paginasAnalizadas: paginas,
      pageCount: geometria.pageCount,
      tieneEscaneos,
      warnings,
      resumen:
        `páginas=${geometria.pageCount} analizadas=[${paginas.join(',')}] ` +
        `texto=${capa.source}(${texto.length} chars, orden ${capa.orderReliable ? 'confiable' : 'no confiable'}) ` +
        `imágenes=${imagenes.length} [${detalleImagenes}]`,
    }
  })
}

/**
 * Bloque de texto que acompaña a las imágenes en el mensaje al modelo, con la
 * precedencia entre señales explícita. Sin esta instrucción el modelo trata el
 * texto y la imagen como equivalentes y puede preferir un dígito borroso de la
 * imagen a uno exacto del PDF.
 */
export function buildTextoParaPrompt(input: PdfVisionInput): string | null {
  if (!input.texto) return null

  const preambulo = input.ordenConfiable
    ? [
        'CAPA DE TEXTO DEL PDF (extraída del archivo, no por OCR).',
        'Los dígitos de esta capa son exactos: úsalos tal cual para RUC, serie,',
        'correlativo, fechas e importes. Cada línea respeta el orden visual de la',
        'página, así que la etiqueta y su valor están en la misma línea.',
        'Usa las imágenes para confirmar a qué etiqueta pertenece cada valor y',
        'para leer lo que no aparezca acá.',
      ]
    : [
        'CAPA DE TEXTO DEL PDF (extracción plana, el orden de lectura NO es',
        'confiable: puede pegar o invertir etiquetas y valores).',
        'Tómala sólo como referencia de los dígitos. La asociación entre cada',
        'etiqueta y su valor debe salir de las imágenes.',
      ]

  return `${preambulo.join('\n')}\n\n---\n${input.texto}\n---`
}
