import {
  DPI_CONTEXTO,
  DPI_MAX,
  LADO_CORTO_MAX,
  LADO_LARGO_MAX,
  computeBands,
  computeRenderDpi,
  contarAnclasFiscales,
  planificarRender,
  planificarRenderDetallado,
  seleccionarPaginas,
} from './pdf-render.util'
import { PdfPageText } from './pdf-text-layer.util'

const A4_ANCHO_PT = 595
const A4_ALTO_PT = 842

describe('computeRenderDpi', () => {
  it('deja el ancho de un A4 justo bajo el tope de lado largo', () => {
    const dpi = computeRenderDpi(A4_ANCHO_PT)
    expect(dpi).toBe(247)
    expect(Math.round((A4_ANCHO_PT * dpi) / 72)).toBeLessThanOrEqual(
      LADO_LARGO_MAX
    )
  })

  it('no pasa del techo en páginas angostas (recibo térmico de 80 mm)', () => {
    expect(computeRenderDpi(226)).toBe(DPI_MAX)
  })

  it('tolera un ancho inválido', () => {
    expect(computeRenderDpi(0)).toBeGreaterThan(0)
  })
})

describe('computeBands', () => {
  it('no corta una página que ya entra en el presupuesto', () => {
    expect(computeBands(2042, 700)).toEqual([
      { x: 0, y: 0, width: 2042, height: 700 },
    ])
  })

  it('corta un A4 vertical en bandas que no se reescalan', () => {
    const dpi = computeRenderDpi(A4_ANCHO_PT)
    const width = Math.round((A4_ANCHO_PT * dpi) / 72)
    const height = Math.round((A4_ALTO_PT * dpi) / 72)
    const bandas = computeBands(width, height)

    expect(bandas.length).toBeGreaterThan(1)
    for (const banda of bandas) {
      const ladoCorto = Math.min(banda.width, banda.height)
      const ladoLargo = Math.max(banda.width, banda.height)
      expect(ladoCorto).toBeLessThanOrEqual(LADO_CORTO_MAX)
      expect(ladoLargo).toBeLessThanOrEqual(LADO_LARGO_MAX)
    }
  })

  it('solapa las bandas para no partir un renglón', () => {
    const bandas = computeBands(2042, 2889)
    for (let i = 1; i < bandas.length; i++) {
      const anterior = bandas[i - 1]
      expect(bandas[i].y).toBeLessThan(anterior.y + anterior.height)
    }
  })

  it('ancla la última banda al pie de la página', () => {
    const height = 2889
    const bandas = computeBands(2042, height)
    const ultima = bandas[bandas.length - 1]
    // El bloque de totales vive al pie: tiene que quedar completo en una banda.
    expect(ultima.y + ultima.height).toBe(height)
  })

  it('cubre la página entera', () => {
    const bandas = computeBands(2042, 2889)
    expect(bandas[0].y).toBe(0)
    let cursor = 0
    for (const banda of bandas) {
      expect(banda.y).toBeLessThanOrEqual(cursor)
      cursor = banda.y + banda.height
    }
    expect(cursor).toBe(2889)
  })
})

describe('contarAnclasFiscales', () => {
  it('reconoce una página de comprobante', () => {
    const texto =
      'R.U.C. 20601212537\nF001-00004468\nI.G.V. (10.5%) S/ 7.60\nIMPORTE TOTAL S/ 80.00\nSON: OCHENTA CON 00/100 SOLES'
    expect(contarAnclasFiscales(texto)).toBeGreaterThanOrEqual(4)
  })

  it('no reconoce una página cualquiera', () => {
    expect(contarAnclasFiscales('Anexo de condiciones generales')).toBe(0)
  })
})

describe('seleccionarPaginas', () => {
  const pagina = (page: number, text: string): PdfPageText => ({
    page,
    text,
    wordCount: text.split(' ').length,
    isScanned: false,
  })

  it('devuelve todas cuando caben', () => {
    expect(seleccionarPaginas([], 3, 5)).toEqual([1, 2, 3])
  })

  it('prioriza las páginas con anclas de comprobante', () => {
    // La factura está en la página 6 de un escaneo agrupado: con el tope de 5
    // páginas por orden natural nunca se habría mirado.
    const pages = [
      pagina(1, 'Caratula del expediente'),
      pagina(2, 'Anexo'),
      pagina(3, 'Anexo'),
      pagina(4, 'Anexo'),
      pagina(5, 'Anexo'),
      pagina(
        6,
        'R.U.C. 20601212537 F001-00004468 I.G.V. IMPORTE TOTAL S/ 80.00 SON: OCHENTA CON 00/100 SOLES'
      ),
    ]
    const elegidas = seleccionarPaginas(pages, 6, 2)
    expect(elegidas).toContain(6)
    expect(elegidas).toContain(1)
    expect(elegidas).toHaveLength(2)
  })

  it('siempre incluye la página 1', () => {
    const pages = [pagina(2, 'R.U.C. IMPORTE TOTAL I.G.V. F001 00/100')]
    expect(seleccionarPaginas(pages, 4, 2)).toContain(1)
  })

  it('devuelve vacío si no se permite ninguna página', () => {
    expect(seleccionarPaginas([], 3, 0)).toEqual([])
  })
})

describe('planificarRender', () => {
  const sizes = [{ page: 1, widthPt: A4_ANCHO_PT, heightPt: A4_ALTO_PT }]
  const digital: PdfPageText = {
    page: 1,
    text: 'IMPORTE TOTAL S/ 80.00',
    wordCount: 120,
    isScanned: false,
  }
  const escaneada: PdfPageText = {
    page: 1,
    text: '',
    wordCount: 0,
    isScanned: true,
  }

  it('manda una sola imagen de contexto si la página tiene capa de texto', () => {
    const plan = planificarRender([1], sizes, new Map([[1, digital]]), 8)
    expect(plan).toEqual([
      { page: 1, modo: 'completa', dpi: DPI_CONTEXTO, bandas: [] },
    ])
  })

  it('manda bandas de alta resolución si la página es un escaneo', () => {
    const plan = planificarRender([1], sizes, new Map([[1, escaneada]]), 8)
    expect(plan[0].modo).toBe('bandas')
    expect(plan[0].dpi).toBe(247)
    expect(plan[0].bandas.length).toBeGreaterThan(1)
  })

  it('trata como escaneo la página sin entrada de texto', () => {
    expect(planificarRender([1], sizes, new Map(), 8)[0].modo).toBe('bandas')
  })

  it('fuerza bandas en el reintento aunque haya capa de texto', () => {
    const plan = planificarRender([1], sizes, new Map([[1, digital]]), 8, {
      forzarBandas: true,
    })
    expect(plan[0].modo).toBe('bandas')
  })

  it('respeta el tope de imágenes', () => {
    const varias = [1, 2, 3]
    const sizesVarias = varias.map(page => ({
      page,
      widthPt: A4_ANCHO_PT,
      heightPt: A4_ALTO_PT,
    }))
    const plan = planificarRender(varias, sizesVarias, new Map(), 6)
    const imagenes = plan.reduce(
      (total, p) => total + (p.bandas.length || 1),
      0
    )
    expect(imagenes).toBeLessThanOrEqual(6)
  })

  it('reporta lo que quedó fuera por el tope de imágenes', () => {
    // Un recorte silencioso se lee después como "se miró todo el documento".
    const varias = [1, 2, 3]
    const sizesVarias = varias.map(page => ({
      page,
      widthPt: A4_ANCHO_PT,
      heightPt: A4_ALTO_PT,
    }))
    const { descartes } = planificarRenderDetallado(
      varias,
      sizesVarias,
      new Map(),
      6
    )
    expect(descartes.length).toBeGreaterThan(0)
    expect(descartes.join(' ')).toMatch(/página 2|página 3|bandas sin enviar/)
  })

  it('no reporta descartes cuando todo entra', () => {
    const { descartes } = planificarRenderDetallado(
      [1],
      sizes,
      new Map([[1, digital]]),
      8
    )
    expect(descartes).toEqual([])
  })
})
