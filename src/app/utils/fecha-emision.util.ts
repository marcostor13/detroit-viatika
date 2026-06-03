/**
 * Utilidad de fechas de emisión de comprobantes (dd/MM/yyyy).
 * Alineada con viatika-back/src/modules/expense/utils/fecha-emision.util.ts
 */

export function parseFechaEmisionInput(
  raw?: string | Date | null
): Date | null {
  if (raw == null) return null

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    return new Date(
      raw.getFullYear(),
      raw.getMonth(),
      raw.getDate()
    )
  }

  const clean = String(raw).trim()
  if (!clean) return null

  const isoDatePrefix = clean.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDatePrefix) {
    return new Date(
      Number(isoDatePrefix[1]),
      Number(isoDatePrefix[2]) - 1,
      Number(isoDatePrefix[3])
    )
  }

  const ymdMatch = clean.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/)
  if (ymdMatch) {
    return new Date(
      Number(ymdMatch[1]),
      Number(ymdMatch[2]) - 1,
      Number(ymdMatch[3])
    )
  }

  const dmyMatch = clean.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)
  if (dmyMatch) {
    return new Date(
      Number(dmyMatch[3]),
      Number(dmyMatch[2]) - 1,
      Number(dmyMatch[1])
    )
  }

  const parsed = new Date(clean)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

/** Formato de visualización: dd/MM/yyyy */
export function formatFechaEmisionDdMmYyyy(
  raw?: string | Date | null
): string {
  const d = parseFechaEmisionInput(raw)
  if (!d) return '-'
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

/** Resuelve fecha de emisión: raíz del expense y fallback en JSON data. */
export function resolveExpenseFechaEmision(expense: {
  fechaEmision?: unknown
  data?: unknown
}): string | Date | null | undefined {
  if (expense?.fechaEmision != null && expense.fechaEmision !== '') {
    return expense.fechaEmision as string | Date
  }
  try {
    const raw = expense?.data
    if (raw == null) return undefined
    const obj =
      typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : (raw as Record<string, unknown>)
    const fe = obj?.['fechaEmision']
    if (fe != null && fe !== '') return fe as string | Date
  } catch {
    /* ignore */
  }
  return undefined
}
