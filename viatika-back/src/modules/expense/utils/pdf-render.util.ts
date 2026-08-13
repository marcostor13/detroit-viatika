/**
 * Rasterizado de PDF para el modelo de visión, con `pdftoppm`.
 *
 * El problema que resuelve: la API de visión reescala las imágenes que exceden
 * su presupuesto de tiles, y en una página A4 vertical el lado limitante es el
 * ancho. Medido sobre la factura F001-00004468, una página de 595x842 pt
 * rasterizada a 150 dpi (1240x1754 px) llega al modelo como 768x1087, es decir
 * ~93 dpi efectivos, y a esa resolución la tipografía espaciada de
 * JasperReports se deshace ("1.0" se lee "I.D"). Rasterizar a 300 dpi no cambia
 * nada: el reescalado deja el mismo resultado y sólo engorda el payload.
 *
 * La salida es cortar la página en bandas anchas y bajas. Cada imagen tiene su
 * propio presupuesto, así que una banda de 2042x768 no se reescala y conserva
 * los ~247 dpi con los que se rasterizó.
 */
import { readFile, readdir } from 'fs/promises'
import * as path from 'path'
import { runPoppler } from './poppler.util'
import { PdfPageText } from './pdf-text-layer.util'

/** Tope de lado largo de la API de visión: por encima, la imagen se reescala. */
export const LADO_LARGO_MAX = 2048
/** Tope de lado corto de la API de visión. */
export const LADO_CORTO_MAX = 768
/** Techo de resolución: más dpi no aporta y sí cuesta tiempo y bytes. */
export const DPI_MAX = 300
export const DPI_MIN = 96
/** dpi para la imagen de contexto de una página que ya tiene capa de texto. */
export const DPI_CONTEXTO = 150
/** Solape entre bandas, para que ningún renglón quede partido justo en el corte. */
export const SOLAPE_BANDAS = 0.15

export interface BandaRect {
  /** Recorte en píxeles a la resolución elegida. */
  x: number
  y: number
  width: number
  height: number
}

export interface PlanPagina {
  page: number
  /** `bandas` para páginas escaneadas, `completa` cuando hay capa de texto. */
  modo: 'bandas' | 'completa'
  dpi: number
  bandas: BandaRect[]
}

/**
 * dpi que deja el ancho de la página justo en el tope de lado largo, sin pasar
 * del techo. En páginas angostas (recibos térmicos de 80 mm) manda el techo.
 */
export function computeRenderDpi(
  widthPt: number,
  options: { ladoLargoMax?: number; dpiMax?: number; dpiMin?: number } = {}
): number {
  const ladoLargoMax = options.ladoLargoMax ?? LADO_LARGO_MAX
  const dpiMax = options.dpiMax ?? DPI_MAX
  const dpiMin = options.dpiMin ?? DPI_MIN
  if (!(widthPt > 0)) return dpiMin
  const ideal = Math.floor((ladoLargoMax / widthPt) * 72)
  return Math.max(dpiMin, Math.min(dpiMax, ideal))
}

/**
 * Corta la página en bandas de ancho completo y altura acotada al lado corto.
 * Si la página entera ya entra en el presupuesto, devuelve una sola banda.
 */
export function computeBands(
  widthPx: number,
  heightPx: number,
  options: { ladoCortoMax?: number; solape?: number } = {}
): BandaRect[] {
  const ladoCortoMax = options.ladoCortoMax ?? LADO_CORTO_MAX
  const solape = options.solape ?? SOLAPE_BANDAS
  const width = Math.max(1, Math.round(widthPx))
  const height = Math.max(1, Math.round(heightPx))

  if (height <= ladoCortoMax) {
    return [{ x: 0, y: 0, width, height }]
  }

  const alturaBanda = ladoCortoMax
  const paso = Math.max(1, Math.round(alturaBanda * (1 - solape)))
  const bandas: BandaRect[] = []
  for (let y = 0; y < height; y += paso) {
    const restante = height - y
    // Última banda: se ancla al pie en vez de quedar recortada, así el bloque de
    // totales (que vive abajo) nunca se parte entre dos imágenes.
    if (restante <= alturaBanda) {
      bandas.push({
        x: 0,
        y: Math.max(0, height - alturaBanda),
        width,
        height: Math.min(alturaBanda, height),
      })
      break
    }
    bandas.push({ x: 0, y, width, height: alturaBanda })
  }
  return bandas
}

const ANCLAS_FISCALES: RegExp[] = [
  /\bR\.?\s?U\.?\s?C\.?/i,
  /IMPORTE\s+TOTAL|TOTAL\s+A\s+PAGAR|\bTOTAL\b/i,
  /I\.?\s?G\.?\s?V\.?/i,
  /\b[FBE]\d{3}\b/,
  /\d{1,2}\s*\/\s*100/,
]

/** Cuántas anclas de comprobante aparecen en el texto de la página. */
export function contarAnclasFiscales(text: string): number {
  return ANCLAS_FISCALES.filter(re => re.test(text)).length
}

/**
 * Elige qué páginas se mandan al modelo. Prioriza las que contienen anclas de
 * comprobante (RUC, IMPORTE TOTAL, IGV, serie, importe en letras) sobre el orden
 * natural: en un escaneo agrupado la factura puede no estar en la página 1.
 * La página 1 siempre entra.
 */
export function seleccionarPaginas(
  pages: PdfPageText[],
  pageCount: number,
  maxPaginas: number
): number[] {
  if (maxPaginas <= 0) return []
  const totales = Math.max(pageCount, pages.length, 1)
  const todas = Array.from({ length: totales }, (_, i) => i + 1)
  if (totales <= maxPaginas) return todas

  const puntaje = new Map<number, number>()
  for (const page of pages) {
    puntaje.set(page.page, contarAnclasFiscales(page.text))
  }

  const ordenadas = [...todas].sort((a, b) => {
    const scoreDiff = (puntaje.get(b) ?? 0) - (puntaje.get(a) ?? 0)
    return scoreDiff !== 0 ? scoreDiff : a - b
  })

  const elegidas = new Set<number>([1])
  for (const page of ordenadas) {
    if (elegidas.size >= maxPaginas) break
    elegidas.add(page)
  }
  return [...elegidas].sort((a, b) => a - b)
}

/**
 * Arma el plan de imágenes. Una página con capa de texto sólo aporta contexto de
 * layout, así que va como imagen única y barata; los dígitos ya vienen exactos
 * del texto. Una página escaneada es la única fuente, así que va en bandas a la
 * resolución más alta que la API no reescala.
 */
export interface PlanRender {
  paginas: PlanPagina[]
  /**
   * Páginas o bandas que quedaron fuera por el tope de imágenes. Se reporta a
   * propósito: un recorte silencioso se lee después como "se miró todo".
   */
  descartes: string[]
}

export function planificarRender(
  paginas: number[],
  sizes: Array<{ page: number; widthPt: number; heightPt: number }>,
  textoPorPagina: Map<number, PdfPageText>,
  maxImagenes: number,
  options: { forzarBandas?: boolean } = {}
): PlanPagina[] {
  return planificarRenderDetallado(
    paginas,
    sizes,
    textoPorPagina,
    maxImagenes,
    options
  ).paginas
}

export function planificarRenderDetallado(
  paginas: number[],
  sizes: Array<{ page: number; widthPt: number; heightPt: number }>,
  textoPorPagina: Map<number, PdfPageText>,
  maxImagenes: number,
  options: { forzarBandas?: boolean } = {}
): PlanRender {
  const plan: PlanPagina[] = []
  const descartes: string[] = []
  let imagenes = 0

  for (const page of paginas) {
    if (imagenes >= maxImagenes) {
      descartes.push(`página ${page} sin rasterizar`)
      continue
    }
    const size = sizes.find(s => s.page === page) ?? sizes[0]
    const widthPt = size?.widthPt || 595
    const heightPt = size?.heightPt || 842
    const texto = textoPorPagina.get(page)
    // `forzarBandas` es el reintento: la página tiene capa de texto pero la
    // lectura no pasó las guardas, así que se manda en alta resolución.
    const esEscaneada = options.forzarBandas || !texto || texto.isScanned

    if (!esEscaneada) {
      plan.push({ page, modo: 'completa', dpi: DPI_CONTEXTO, bandas: [] })
      imagenes += 1
      continue
    }

    const dpi = computeRenderDpi(widthPt)
    const widthPx = Math.round((widthPt * dpi) / 72)
    const heightPx = Math.round((heightPt * dpi) / 72)
    const todas = computeBands(widthPx, heightPx)
    const bandas = todas.slice(0, Math.max(1, maxImagenes - imagenes))
    if (bandas.length < todas.length) {
      descartes.push(
        `página ${page}: ${todas.length - bandas.length} de ${todas.length} bandas sin enviar`
      )
    }
    plan.push({ page, modo: 'bandas', dpi, bandas })
    imagenes += bandas.length
  }

  return { paginas: plan, descartes }
}

async function leerPngGenerado(dir: string, prefijo: string): Promise<string> {
  const files = (await readdir(dir))
    .filter(f => f.startsWith(prefijo) && f.endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!files.length) {
    throw new Error(`pdftoppm no generó ninguna imagen para "${prefijo}".`)
  }
  const buffer = await readFile(path.join(dir, files[0]))
  return `data:image/png;base64,${buffer.toString('base64')}`
}

/** Ejecuta el plan y devuelve las imágenes como data URLs, en orden. */
export async function renderPlan(
  pdfPath: string,
  tmpDir: string,
  plan: PlanPagina[]
): Promise<string[]> {
  const imagenes: string[] = []

  for (const pagina of plan) {
    const recortes = pagina.bandas.length
      ? pagina.bandas
      : [null as BandaRect | null]

    for (let i = 0; i < recortes.length; i++) {
      const recorte = recortes[i]
      const prefijo = `p${pagina.page}-i${i}`
      const args = [
        '-png',
        '-r',
        String(pagina.dpi),
        '-f',
        String(pagina.page),
        '-l',
        String(pagina.page),
      ]
      if (recorte) {
        args.push(
          '-x',
          String(recorte.x),
          '-y',
          String(recorte.y),
          '-W',
          String(recorte.width),
          '-H',
          String(recorte.height)
        )
      }
      args.push(pdfPath, path.join(tmpDir, prefijo))
      await runPoppler('pdftoppm', args)
      imagenes.push(await leerPngGenerado(tmpDir, prefijo))
    }
  }

  return imagenes
}
