import { readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'

// Se moquea únicamente `runPoppler`, el único punto impuro: el resto del flujo
// (directorio temporal, parseo del bbox, reconstrucción de filas, planificación
// de bandas) corre de verdad.
jest.mock('./poppler.util', () => {
  const actual = jest.requireActual('./poppler.util')
  return { ...actual, runPoppler: jest.fn() }
})

import { PopplerUnavailableError, runPoppler } from './poppler.util'
import {
  PdfSinContenidoLegibleError,
  buildTextoParaPrompt,
  preparePdfVisionInput,
} from './pdf-vision-input.util'

const runPopplerMock = runPoppler as jest.MockedFunction<typeof runPoppler>

// Estos casos escriben de verdad en un directorio temporal (el PDF, el XHTML y
// una imagen por banda). Con la suite completa en paralelo, el I/O de Windows se
// pasa largamente del timeout por defecto de 5 s: se midió una corrida de 80 s
// para este archivo, así que el margen es amplio a propósito.
jest.setTimeout(60_000)

const XHTML_FACTURA = readFileSync(
  join(__dirname, '__fixtures__', 'factura-hotel-bolognesi.bbox.xhtml'),
  'utf8'
)

const PDFINFO_A4 = [
  'Pages:          1',
  'Page 1 size:    595 x 842 pts (A4)',
  'Page 1 rot:     0',
  'Encrypted:      no',
].join('\n')

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
)

/** El buffer no importa: poppler está moqueado y pdf-parse sólo actúa de respaldo. */
const BUFFER_PDF = Buffer.from('%PDF-1.4 contenido irrelevante')

function mockPoppler(
  overrides: Partial<
    Record<'pdfinfo' | 'pdftotext' | 'pdftoppm', () => Promise<string>>
  > = {},
  info = PDFINFO_A4
) {
  runPopplerMock.mockImplementation(async (bin: string, args: string[]) => {
    if (bin === 'pdfinfo') {
      return overrides.pdfinfo ? overrides.pdfinfo() : info
    }
    if (bin === 'pdftotext') {
      if (overrides.pdftotext) return overrides.pdftotext()
      await writeFile(args[args.length - 1], XHTML_FACTURA, 'utf8')
      return ''
    }
    if (bin === 'pdftoppm') {
      if (overrides.pdftoppm) return overrides.pdftoppm()
      await writeFile(`${args[args.length - 1]}-1.png`, PNG_1PX)
      return ''
    }
    return ''
  })
}

describe('preparePdfVisionInput', () => {
  beforeEach(() => {
    runPopplerMock.mockReset()
  })

  it('sobre un PDF digital manda la capa de texto y una imagen de contexto', async () => {
    mockPoppler()
    const input = await preparePdfVisionInput(BUFFER_PDF)

    expect(input.textoSource).toBe('pdftotext-bbox')
    expect(input.ordenConfiable).toBe(true)
    expect(input.texto).toContain('IMPORTE TOTAL S/ 80.00')
    expect(input.texto).toContain('Op. Gravada S/ 72.40')
    expect(input.tieneEscaneos).toBe(false)
    expect(input.imagenes).toHaveLength(1)
    expect(input.imagenes[0].startsWith('data:image/png;base64,')).toBe(true)
    expect(input.paginasAnalizadas).toEqual([1])
    expect(input.resumen).toContain('orden confiable')
  })

  it('con forzarBandas manda varias imágenes de la misma página', async () => {
    mockPoppler()
    const input = await preparePdfVisionInput(BUFFER_PDF, {
      forzarBandas: true,
    })
    expect(input.imagenes.length).toBeGreaterThan(1)
    expect(input.tieneEscaneos).toBe(true)
    expect(input.resumen).toContain('bandas')
  })

  it('sigue adelante con sólo texto si pdftoppm no está instalado', async () => {
    // Es lo que pasa en desarrollo sobre Windows: antes el escaneo entero moría.
    mockPoppler({
      pdftoppm: () => Promise.reject(new PopplerUnavailableError('pdftoppm')),
    })
    const input = await preparePdfVisionInput(BUFFER_PDF)

    expect(input.imagenes).toEqual([])
    expect(input.texto).toContain('IMPORTE TOTAL S/ 80.00')
    expect(input.warnings.join(' ')).toContain('pdftoppm no está instalado')
  })

  it('asume A4 si pdfinfo falla', async () => {
    mockPoppler({
      pdfinfo: () => Promise.reject(new PopplerUnavailableError('pdfinfo')),
    })
    const input = await preparePdfVisionInput(BUFFER_PDF)
    expect(input.pageCount).toBe(1)
    expect(input.warnings.join(' ')).toContain('pdfinfo no está instalado')
  })

  it('lanza si no se puede leer ni texto ni imágenes', async () => {
    mockPoppler({
      pdftotext: () => Promise.reject(new PopplerUnavailableError('pdftotext')),
      pdftoppm: () => Promise.reject(new PopplerUnavailableError('pdftoppm')),
    })
    await expect(
      preparePdfVisionInput(Buffer.from('esto no es un pdf'))
    ).rejects.toThrow(PdfSinContenidoLegibleError)
  })

  it('avisa que el PDF está protegido con contraseña', async () => {
    mockPoppler(
      {
        pdftotext: () => Promise.reject(new Error('Incorrect password')),
        pdftoppm: () => Promise.reject(new Error('Incorrect password')),
      },
      ['Pages:          1', 'Encrypted:      yes'].join('\n')
    )
    await expect(
      preparePdfVisionInput(Buffer.from('esto no es un pdf'))
    ).rejects.toThrow(/protegido con contraseña/)
  })
})

describe('buildTextoParaPrompt', () => {
  const base = {
    texto: 'IMPORTE TOTAL S/ 80.00',
    textoSource: 'pdftotext-bbox' as const,
    ordenConfiable: true,
    imagenes: [],
    paginasAnalizadas: [1],
    pageCount: 1,
    tieneEscaneos: false,
    warnings: [],
    resumen: '',
  }

  it('declara el texto como exacto cuando el orden es confiable', () => {
    const prompt = buildTextoParaPrompt(base)
    expect(prompt).toContain('exactos')
    expect(prompt).toContain('IMPORTE TOTAL S/ 80.00')
  })

  it('advierte que el orden no es confiable con la extracción plana', () => {
    const prompt = buildTextoParaPrompt({
      ...base,
      textoSource: 'pdf-parse',
      ordenConfiable: false,
    })
    expect(prompt).toContain('NO es')
    expect(prompt).toContain('imágenes')
  })

  it('devuelve null si no hay capa de texto', () => {
    expect(buildTextoParaPrompt({ ...base, texto: '' })).toBeNull()
  })
})
