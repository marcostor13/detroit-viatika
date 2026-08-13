import { readFileSync } from 'fs'
import { join } from 'path'
import {
  BboxWord,
  MIN_WORDS_PAGINA_DIGITAL,
  parseBboxLayoutXhtml,
  rebuildPageText,
  rebuildTextFromWords,
} from './pdf-text-layer.util'

/**
 * El fixture reproduce el XHTML de `pdftotext -bbox-layout` con las coordenadas
 * reales de la factura F001-00004468 del Hotel Bolognesi (Tacna, 28-06-2026),
 * el PDF con el que se detectó que el OCR devolvía campos vacíos.
 */
const xhtml = readFileSync(
  join(__dirname, '__fixtures__', 'factura-hotel-bolognesi.bbox.xhtml'),
  'utf8'
)

describe('parseBboxLayoutXhtml', () => {
  it('lee páginas, tamaño y palabras con sus coordenadas', () => {
    const pages = parseBboxLayoutXhtml(xhtml)
    expect(pages).toHaveLength(1)
    expect(Math.round(pages[0].widthPt)).toBe(595)
    expect(Math.round(pages[0].heightPt)).toBe(842)
    expect(pages[0].words.length).toBeGreaterThan(100)
    expect(pages[0].words.every(w => w.xMax >= w.xMin)).toBe(true)
  })

  it('decodifica entidades XML', () => {
    const pages = parseBboxLayoutXhtml(
      '<page width="100" height="100"><word xMin="1" yMin="1" xMax="2" yMax="2">A&amp;B &#8364; &lt;x&gt;</word></page>'
    )
    expect(pages[0].words[0].text).toBe('A&B € <x>')
  })

  it('ignora palabras sin coordenadas completas', () => {
    const pages = parseBboxLayoutXhtml(
      '<page width="100" height="100"><word xMin="1" yMin="1" xMax="2">roto</word><word xMin="1" yMin="1" xMax="2" yMax="2">ok</word></page>'
    )
    expect(pages[0].words.map(w => w.text)).toEqual(['ok'])
  })

  it('devuelve vacío si no hay páginas', () => {
    expect(parseBboxLayoutXhtml('<html><body></body></html>')).toEqual([])
  })
})

describe('rebuildPageText sobre la factura real', () => {
  const text = rebuildPageText(parseBboxLayoutXhtml(xhtml)[0])

  it('mantiene cada importe con su etiqueta', () => {
    // Esto es lo que `pdftotext -layout` equivoca: mueve la columna de importes
    // y termina asignando 72.40 a Op. Exonerada y 80.00 a Op. Inafecta.
    expect(text).toContain('Op. Exonerada S/ 0.00')
    expect(text).toContain('Op. Inafecta S/ 0.00')
    expect(text).toContain('Op. Gravada S/ 72.40')
    expect(text).toContain('I.G.V. (10.5%) S/ 7.60')
    expect(text).toContain('IMPORTE TOTAL S/ 80.00')
    expect(text).toContain('Detracción 0.00 % S/ 0.00')
  })

  it('separa el RUC del emisor del RUC del receptor', () => {
    expect(text).toContain('R.U.C. 20601212537')
    expect(text).toContain('R.U.C. : 20606142499')
  })

  it('conserva serie, correlativo, fecha y el detalle del ítem', () => {
    expect(text).toContain('F001-00004468')
    expect(text).toContain('Fecha de Emisión : 2026-06-28')
    expect(text).toContain('1 1.0 SERV SERVICIO DE HOSPEDAJE 80.00 80.00')
    expect(text).toContain('SON: OCHENTA CON 00/100 SOLES')
  })

  it('no reproduce las uniones que genera la extracción plana', () => {
    // Formas que devuelve pdf-parse sobre este mismo PDF.
    expect(text).not.toContain('80.00IMPORTE TOTAL')
    expect(text).not.toContain('72.40S/Op. Gravada')
    expect(text).not.toContain('180.001.0')
  })

  it('la página cuenta como digital', () => {
    expect(parseBboxLayoutXhtml(xhtml)[0].words.length).toBeGreaterThan(
      MIN_WORDS_PAGINA_DIGITAL
    )
  })
})

describe('rebuildTextFromWords', () => {
  const fila = (y: number, textos: string[]): BboxWord[] =>
    textos.map((text, i) => ({
      xMin: 10 + i * 50,
      xMax: 10 + i * 50 + 40,
      yMin: y,
      yMax: y + 10,
      text,
    }))

  it('agrupa por Y y ordena por X', () => {
    const words = [...fila(30, ['tercera']), ...fila(10, ['primera', 'fila'])]
    expect(rebuildTextFromWords(words)).toBe('primera fila\ntercera')
  })

  it('tolera desalineación de línea base dentro de la misma fila', () => {
    const words: BboxWord[] = [
      { xMin: 10, xMax: 50, yMin: 10, yMax: 20, text: 'IMPORTE' },
      { xMin: 60, xMax: 90, yMin: 12, yMax: 22, text: 'TOTAL' },
      { xMin: 100, xMax: 130, yMin: 11, yMax: 21, text: '80.00' },
    ]
    expect(rebuildTextFromWords(words)).toBe('IMPORTE TOTAL 80.00')
  })

  it('no fusiona filas contiguas', () => {
    const words = [...fila(10, ['uno']), ...fila(22, ['dos'])]
    expect(rebuildTextFromWords(words)).toBe('uno\ndos')
  })

  it('devuelve cadena vacía sin palabras', () => {
    expect(rebuildTextFromWords([])).toBe('')
  })

  it('agrupa por X cuando la página viene rotada', () => {
    // Página girada 90 grados: las filas corren en vertical.
    const words: BboxWord[] = [
      { xMin: 10, xMax: 20, yMin: 100, yMax: 140, text: 'IMPORTE' },
      { xMin: 11, xMax: 21, yMin: 150, yMax: 190, text: 'TOTAL' },
      { xMin: 12, xMax: 22, yMin: 200, yMax: 240, text: '80.00' },
      { xMin: 80, xMax: 90, yMin: 100, yMax: 140, text: 'OTRA' },
      { xMin: 81, xMax: 91, yMin: 150, yMax: 190, text: 'COLUMNA' },
    ]
    const page = { page: 1, widthPt: 842, heightPt: 595, words }
    expect(rebuildPageText(page)).toBe('IMPORTE TOTAL 80.00\nOTRA COLUMNA')
  })
})
