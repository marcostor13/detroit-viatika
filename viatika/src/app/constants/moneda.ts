/**
 * Catálogo de monedas. La clave es el código **ISO 4217** ('PEN', 'USD'), que
 * es lo que viaja en los payloads y se guarda en cada documento.
 *
 * Los códigos numéricos de Contanet ('01', '02') no aparecen en el front: los
 * resuelve el backend al generar el archivo contable.
 */
export interface MonedaInfo {
  code: string;
  symbol: string;
  label: string;
}

export const MONEDA_CATALOG: Record<string, MonedaInfo> = {
  PEN: { code: 'PEN', symbol: 'S/', label: 'Soles' },
  USD: { code: 'USD', symbol: '$', label: 'Dólares' },
};

export const DEFAULT_MONEDA = 'PEN';

export function monedaSymbol(code?: string | null): string {
  return MONEDA_CATALOG[code ?? DEFAULT_MONEDA]?.symbol ?? MONEDA_CATALOG[DEFAULT_MONEDA].symbol;
}

export function monedaLabel(code?: string | null): string {
  return MONEDA_CATALOG[code ?? DEFAULT_MONEDA]?.label ?? MONEDA_CATALOG[DEFAULT_MONEDA].label;
}

/**
 * Normaliza a código ISO lo que devuelva el OCR. El escaneo puede entregar
 * 'PEN'/'USD' o el símbolo ('S/', '$'), según cómo esté impreso el
 * comprobante. Espejo de `normalizeMoneda` del backend; lo no reconocido cae
 * en la moneda por defecto.
 */
export function normalizeMonedaCode(value?: string | null): string {
  const raw = (value ?? '').toString().trim().toUpperCase();
  if (!raw) return DEFAULT_MONEDA;
  if (['USD', 'US$', '$', 'DOLARES', 'DÓLARES'].includes(raw)) return 'USD';
  if (['PEN', 'S/', 'S/.', 'SOLES'].includes(raw)) return 'PEN';
  return MONEDA_CATALOG[raw] ? raw : DEFAULT_MONEDA;
}

/**
 * Importe de un gasto en la moneda base de la empresa.
 *
 * Un comprobante emitido en otra moneda guarda su conversión congelada al
 * registrarse (`montoBase`). Sumar `total` a secas mezclaría monedas en
 * cualquier total agregado.
 */
export function expenseAmountBase(exp: unknown): number {
  const e = exp as { montoBase?: unknown; total?: unknown } | null;
  return Number(e?.montoBase ?? e?.total) || 0;
}

/**
 * Importe de un gasto en la moneda de su rendición. Solo aplica dentro del
 * detalle de una rendición; para totales entre rendiciones usa `expenseAmountBase`.
 */
export function expenseAmountInReport(exp: unknown): number {
  const e = exp as { montoReporte?: unknown; total?: unknown } | null;
  return Number(e?.montoReporte ?? e?.total) || 0;
}
