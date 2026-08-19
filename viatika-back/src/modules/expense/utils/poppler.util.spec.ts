import { parsePdfInfo, pdfInfoArgs, resolvePopplerBin } from './poppler.util'

describe('pdfInfoArgs', () => {
  it('pide todas las páginas hasta el tope', () => {
    expect(pdfInfoArgs('/tmp/x/input.pdf', 5)).toEqual([
      '-f',
      '1',
      '-l',
      '5',
      '/tmp/x/input.pdf',
    ])
  })
})

describe('parsePdfInfo', () => {
  it('lee páginas y tamaño de un A4', () => {
    const geo = parsePdfInfo(
      [
        'Title:          input.pdf',
        'Pages:          1',
        'Page 1 size:    595 x 842 pts (A4)',
        'Page 1 rot:     0',
        'Encrypted:      no',
      ].join('\n')
    )
    expect(geo.pageCount).toBe(1)
    expect(geo.encrypted).toBe(false)
    expect(geo.sizes).toEqual([
      { page: 1, widthPt: 595, heightPt: 842, rotation: 0 },
    ])
  })

  it('lee el formato sin número de página', () => {
    const geo = parsePdfInfo(
      ['Pages:          1', 'Page size:      595 x 842 pts'].join('\n')
    )
    expect(geo.sizes[0]).toEqual({
      page: 1,
      widthPt: 595,
      heightPt: 842,
      rotation: 0,
    })
  })

  it('lee páginas de distinto tamaño y rotación', () => {
    const geo = parsePdfInfo(
      [
        'Pages:          3',
        'Page 1 size:    595 x 842 pts (A4)',
        'Page 1 rot:     0',
        'Page 2 size:    842 x 595 pts',
        'Page 2 rot:     90',
        'Page 3 size:    226 x 850 pts',
        'Page 3 rot:     0',
      ].join('\n')
    )
    expect(geo.pageCount).toBe(3)
    expect(geo.sizes[1]).toEqual({
      page: 2,
      widthPt: 842,
      heightPt: 595,
      rotation: 90,
    })
    // Recibo térmico angosto.
    expect(geo.sizes[2].widthPt).toBe(226)
  })

  it('completa las páginas sin tamaño propio con el de la primera', () => {
    const geo = parsePdfInfo(
      ['Pages:          4', 'Page 1 size:    595 x 842 pts (A4)'].join('\n')
    )
    expect(geo.sizes).toHaveLength(4)
    expect(geo.sizes.every(s => s.widthPt === 595)).toBe(true)
    expect(geo.sizes.map(s => s.page)).toEqual([1, 2, 3, 4])
  })

  it('detecta un PDF cifrado', () => {
    const geo = parsePdfInfo(
      ['Pages:          1', 'Encrypted:      yes (print:yes copy:no)'].join(
        '\n'
      )
    )
    expect(geo.encrypted).toBe(true)
  })

  it('normaliza una rotación negativa', () => {
    const geo = parsePdfInfo(
      [
        'Pages:          1',
        'Page 1 size: 595 x 842 pts',
        'Page 1 rot: -90',
      ].join('\n')
    )
    expect(geo.sizes[0].rotation).toBe(270)
  })

  it('no explota con una salida vacía', () => {
    const geo = parsePdfInfo('')
    expect(geo.pageCount).toBeGreaterThanOrEqual(0)
    expect(geo.encrypted).toBe(false)
  })
})

describe('resolvePopplerBin', () => {
  const original = process.env.POPPLER_BIN_DIR

  afterEach(() => {
    if (original === undefined) delete process.env.POPPLER_BIN_DIR
    else process.env.POPPLER_BIN_DIR = original
  })

  it('sin la variable invoca por nombre y deja que lo resuelva el PATH', () => {
    delete process.env.POPPLER_BIN_DIR
    expect(resolvePopplerBin('pdftoppm')).toBe('pdftoppm')
  })

  it('una variable vacía o en blanco se ignora', () => {
    process.env.POPPLER_BIN_DIR = '   '
    expect(resolvePopplerBin('pdfinfo')).toBe('pdfinfo')
  })

  it('con la variable arma la ruta completa del binario', () => {
    process.env.POPPLER_BIN_DIR = '/opt/poppler/bin'
    const esperado =
      process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm'
    expect(resolvePopplerBin('pdftoppm')).toContain('poppler')
    expect(resolvePopplerBin('pdftoppm').endsWith(esperado)).toBe(true)
  })
})
