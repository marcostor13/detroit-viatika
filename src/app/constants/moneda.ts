/** Catálogo de monedas soportadas para viáticos. Código = código SUNAT usado en AccountingConfig. */
export interface MonedaInfo {
  code: string;
  symbol: string;
  label: string;
  iso: string;
}

export const MONEDA_CATALOG: Record<string, MonedaInfo> = {
  '01': { code: '01', symbol: 'S/', label: 'Soles', iso: 'PEN' },
  '02': { code: '02', symbol: '$', label: 'Dólares', iso: 'USD' },
};

export const DEFAULT_MONEDA = '01';

export function monedaSymbol(code?: string | null): string {
  return MONEDA_CATALOG[code ?? DEFAULT_MONEDA]?.symbol ?? MONEDA_CATALOG[DEFAULT_MONEDA].symbol;
}

export function monedaLabel(code?: string | null): string {
  return MONEDA_CATALOG[code ?? DEFAULT_MONEDA]?.label ?? MONEDA_CATALOG[DEFAULT_MONEDA].label;
}
