/**
 * Catálogo de monedas. La clave es el código **ISO 4217** ('PEN', 'USD'), que
 * es lo que se guarda en cada documento transaccional.
 *
 * Los códigos numéricos de SUNAT/Contanet ('01', '02') NO se guardan: viven
 * solo en `AccountingConfig.supportedCurrencies[].contanetCode` y se usan
 * exclusivamente al generar el archivo contable.
 */
export const MONEDA_SYMBOLS: Record<string, string> = {
  PEN: 'S/',
  USD: '$',
}

/** Código Contanet (Tabla 3) por moneda, para el export contable. */
export const CONTANET_CODES: Record<string, string> = {
  PEN: '01',
  USD: '02',
}

export const DEFAULT_MONEDA = 'PEN'

export function monedaSymbol(code?: string | null): string {
  return MONEDA_SYMBOLS[code ?? DEFAULT_MONEDA] ?? MONEDA_SYMBOLS[DEFAULT_MONEDA]
}

/** Código Contanet de una moneda ISO. Cae en soles si no se reconoce. */
export function contanetCode(code?: string | null): string {
  return CONTANET_CODES[code ?? DEFAULT_MONEDA] ?? CONTANET_CODES[DEFAULT_MONEDA]
}

/**
 * Normaliza a ISO lo que llegue de un formulario. La DJ al exterior manda el
 * símbolo ('US$') en vez del código, así que se aceptan varias formas de
 * escribir la misma moneda. Lo no reconocido cae en la moneda por defecto.
 */
export function normalizeMoneda(value?: string | null): string {
  const raw = (value ?? '').toString().trim().toUpperCase()
  if (!raw) return DEFAULT_MONEDA
  if (['USD', 'US$', '$', 'DOLARES', 'DÓLARES'].includes(raw)) return 'USD'
  if (['PEN', 'S/', 'S/.', 'SOLES'].includes(raw)) return 'PEN'
  return MONEDA_SYMBOLS[raw] ? raw : DEFAULT_MONEDA
}
