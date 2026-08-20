/**
 * Envoltorio de los binarios de poppler-utils (`pdfinfo`, `pdftotext`,
 * `pdftoppm`), que el Dockerfile ya instala vía `apk add poppler-utils`.
 *
 * Se usan binarios de sistema y no una librería de Node a propósito: el intento
 * anterior con @napi-rs/canvas requería AVX2 y crasheaba con SIGILL en el
 * servidor de QA. Al correr como proceso aparte, un crash mata sólo a ese
 * proceso y no a la API.
 *
 * En entornos sin poppler (por ejemplo Windows en desarrollo) las llamadas
 * fallan con ENOENT; se traduce a `PopplerUnavailableError` para que el llamador
 * degrade en vez de romper el escaneo.
 */
import { execFile } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

/**
 * Ruta completa del binario. Por defecto se invoca por nombre y lo resuelve el
 * PATH, que es como funciona en el contenedor (`apk add poppler-utils`).
 *
 * `POPPLER_BIN_DIR` permite apuntar al directorio de forma explícita. Existe por
 * Windows en desarrollo: al instalar poppler el PATH nuevo NO llega a los
 * procesos que ya estaban vivos, y como el `start:dev` cuelga de una terminal
 * abierta antes de la instalación, hereda el PATH viejo y sigue sin encontrar
 * los binarios por mucho que se reinicie el servidor. Con esta variable la ruta
 * deja de depender del entorno heredado. Mismo criterio que `NODE_DNS_SERVERS`
 * en `main.ts`. En producción se deja sin definir.
 */
export function resolvePopplerBin(bin: string): string {
  const dir = process.env.POPPLER_BIN_DIR?.trim()
  if (!dir) return bin
  const ext = process.platform === 'win32' ? '.exe' : ''
  return path.join(dir, `${bin}${ext}`)
}

/** El binario de poppler no está instalado en este entorno. */
export class PopplerUnavailableError extends Error {
  constructor(bin: string) {
    super(`El binario "${bin}" no está disponible en este entorno.`)
    this.name = 'PopplerUnavailableError'
  }
}

/** El binario existe pero terminó con error para este PDF. */
export class PopplerFailedError extends Error {
  constructor(
    bin: string,
    readonly detail: string
  ) {
    super(`"${bin}" terminó con error: ${detail}`)
    this.name = 'PopplerFailedError'
  }
}

export interface PopplerRunOptions {
  timeoutMs?: number
  /** Tope de stdout. `pdftotext -bbox-layout` de una factura ronda los 100 KB. */
  maxBuffer?: number
}

export function runPoppler(
  bin: string,
  args: string[],
  options: PopplerRunOptions = {}
): Promise<string> {
  const { timeoutMs = 60_000, maxBuffer = 32 * 1024 * 1024 } = options
  return new Promise((resolve, reject) => {
    execFile(
      resolvePopplerBin(bin),
      args,
      { timeout: timeoutMs, maxBuffer, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code
          if (code === 'ENOENT') {
            reject(new PopplerUnavailableError(bin))
            return
          }
          reject(
            new PopplerFailedError(
              bin,
              `code=${String(code)} signal=${String((error as { signal?: string }).signal)} ${stderr || error.message}`
            )
          )
          return
        }
        resolve(typeof stdout === 'string' ? stdout : String(stdout))
      }
    )
  })
}

/**
 * Escribe el PDF en un directorio temporal y ejecuta `fn` con la ruta. El
 * directorio se borra siempre, incluso si `fn` lanza. Todas las herramientas
 * corren sobre el mismo archivo para no copiar el buffer varias veces.
 */
export async function withTempPdf<T>(
  buffer: Buffer,
  fn: (pdfPath: string, tmpDir: string) => Promise<T>
): Promise<T> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'expense-pdf-'))
  const pdfPath = path.join(tmpDir, 'input.pdf')
  try {
    await writeFile(pdfPath, buffer)
    return await fn(pdfPath, tmpDir)
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Tamaño de una página en puntos PostScript (1 pt = 1/72 pulgada). */
export interface PdfPageSize {
  page: number
  widthPt: number
  heightPt: number
  /** Rotación declarada en el PDF (0/90/180/270). */
  rotation: number
}

export interface PdfGeometry {
  pageCount: number
  encrypted: boolean
  sizes: PdfPageSize[]
}

const A4: Omit<PdfPageSize, 'page'> = {
  widthPt: 595,
  heightPt: 842,
  rotation: 0,
}

/**
 * Argumentos de `pdfinfo` para leer la geometría. Sin `-f/-l` sólo informa el
 * tamaño de la primera página, así que se piden todas.
 *
 * La ejecución la hace quien llama, no este módulo: `runPoppler` es el único
 * punto impuro de todo el flujo de PDF y llamarlo desde acá adentro lo dejaría
 * fuera del alcance de los tests.
 */
export function pdfInfoArgs(pdfPath: string, maxPages = 20): string[] {
  return ['-f', '1', '-l', String(maxPages), pdfPath]
}

/** Parseo de la salida de `pdfinfo`. Puro: testeable sin el binario. */
export function parsePdfInfo(stdout: string): PdfGeometry {
  const pageCount = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1] ?? 0) || 0
  const encrypted = /^Encrypted:\s+yes/im.test(stdout)

  const sizes: PdfPageSize[] = []
  // "Page 1 size: 595 x 842 pts (A4)" y, sin -f/-l, "Page size: 595 x 842 pts"
  const sizeRe = /^Page(?:\s+(\d+))?\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/gim
  let m: RegExpExecArray | null
  while ((m = sizeRe.exec(stdout)) !== null) {
    sizes.push({
      page: Number(m[1] ?? 1) || 1,
      widthPt: Number(m[2]) || A4.widthPt,
      heightPt: Number(m[3]) || A4.heightPt,
      rotation: 0,
    })
  }

  const rotRe = /^Page(?:\s+(\d+))?\s+rot:\s+(-?\d+)/gim
  while ((m = rotRe.exec(stdout)) !== null) {
    const page = Number(m[1] ?? 1) || 1
    const target = sizes.find(s => s.page === page)
    if (target) target.rotation = (((Number(m[2]) || 0) % 360) + 360) % 360
  }

  const first = sizes[0] ?? { page: 1, ...A4 }
  for (let page = 1; page <= pageCount; page++) {
    if (!sizes.some(s => s.page === page)) {
      sizes.push({ ...first, page })
    }
  }
  sizes.sort((a, b) => a.page - b.page)

  return { pageCount: pageCount || sizes.length, encrypted, sizes }
}
