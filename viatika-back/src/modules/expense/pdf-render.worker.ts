/**
 * Script standalone, ejecutado como proceso hijo (no importado por Nest).
 * Aísla el renderizado de PDF a imagen: si pdfjs-dist/@napi-rs/canvas
 * crashean (segfault nativo, OOM) el proceso que muere es este, no la API.
 * Uso: node pdf-render.worker.js <ruta-pdf> <max-paginas>
 * stdout: JSON.stringify(string[]) con un data URL PNG por página.
 */
import { readFileSync } from 'fs'

async function main(): Promise<void> {
  const [, , pdfPath, maxPagesArg] = process.argv
  if (!pdfPath) throw new Error('Falta la ruta del PDF')
  const maxPages = Number(maxPagesArg) || 5
  const buffer = readFileSync(pdfPath)

  // Mismo motivo que en expense.service.ts: pdfjs-dist es ESM puro y hay que
  // forzar un import() nativo para no depender de require(esm) (Node >=22.12).
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const dynamicImport = new Function(
    'specifier',
    'return import(specifier)'
  ) as (specifier: string) => Promise<any>

  const { getDocument } = await dynamicImport('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('@napi-rs/canvas')

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  })
  const images: string[] = []
  try {
    const doc = await loadingTask.promise
    const pageCount = Math.min(doc.numPages, maxPages)
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height)
      )
      const context = canvas.getContext('2d')
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise
      images.push(
        `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`
      )
    }
  } finally {
    await loadingTask.destroy()
  }
  process.stdout.write(JSON.stringify(images))
}

main().catch(err => {
  process.stderr.write(String(err?.stack || err))
  process.exit(1)
})
