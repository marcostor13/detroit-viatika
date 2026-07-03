export interface IIgvRate {
  tasa: number;
  cuenta40: string;
}

export interface IBankAccount {
  banco: string;
  nroCuenta: string;
  cuentaContable: string;
  moneda?: string;
  cci?: string;
  activo?: boolean;
}

export interface IAccountingConfig {
  _id?: string;
  clientId?: string;
  cuenta42: string;
  cuenta79: string;
  cuenta14Raiz: string;
  cuenta46?: string;
  igvRates: IIgvRate[];
  inafectoKeywords: string[];
  codModulo: string;
  modulo: string;
  fuenteCompra: string;
  fuenteAplicacion: string;
  fuenteCajaBancos: string;
  monedaOrigen: string;
  monedaRegistro: string;
  identificadorCtrMda: string;
  conceptoFec: string;
  area?: string;
  centroCosto?: string;
  subCentroCosto?: string;
  tipoCambio?: number;
  cuentaReembolso: '14' | '46';
  bankAccounts: IBankAccount[];
}

/** Valores por defecto para inicializar el formulario cuando aún no hay config. */
export const DEFAULT_ACCOUNTING_CONFIG: IAccountingConfig = {
  cuenta42: '42.1.2.100',
  cuenta79: '79.1.1.100',
  cuenta14Raiz: '14.1.3.100',
  cuenta46: '',
  igvRates: [{ tasa: 18, cuenta40: '40.1.1.100' }],
  inafectoKeywords: ['recargo al consumo', 'servicio', 'd.l. 25988', 'propina'],
  codModulo: '03',
  modulo: 'CT',
  fuenteCompra: 'RC',
  fuenteAplicacion: 'LD',
  fuenteCajaBancos: 'CB',
  monedaOrigen: '01',
  monedaRegistro: '01',
  identificadorCtrMda: 'A',
  conceptoFec: '1',
  area: '',
  centroCosto: '',
  subCentroCosto: '',
  tipoCambio: 1,
  cuentaReembolso: '14',
  bankAccounts: [],
};