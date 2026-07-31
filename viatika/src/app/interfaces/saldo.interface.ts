export type SaldoType = 'pago' | 'rendicion_directa' | 'rendicion';
export type SaldoStatus = 'available' | 'consumed';
export type SaldoContext = 'rendicion_directa' | 'viatico';
export type MetodoPago = 'deposito' | 'efectivo';

export interface ISaldoProjectRef {
  _id: string;
  name?: string;
  code?: string;
}

export interface ISaldoSourceReportRef {
  _id: string;
  codigo?: string;
  title?: string;
}

export interface ISaldoDeposit {
  amount: number;
  metodoPago?: MetodoPago;
  receiptUrl?: string;
  operationNumber?: string;
  operationDate?: string;
  operationTime?: string;
  titular?: string;
}

export interface ISaldo {
  _id: string;
  clientId: string;
  userId: string;
  type: SaldoType;
  amount: number;
  status: SaldoStatus;
  /** Gestión / motivo libre que escribió quien originó el saldo. */
  concepto?: string;
  projectId?: ISaldoProjectRef | string | null;
  sourceReportId?: ISaldoSourceReportRef | string | null;
  deposit?: ISaldoDeposit;
  consumedAt?: string;
  createdAt?: string;
}

export interface ICreatePagoSaldoPayload {
  userId: string;
  amount: number;
  concepto?: string;
  metodoPago?: MetodoPago;
  scannedAmount?: number;
  receiptUrl?: string;
  receiptFileName?: string;
  receiptMimeType?: string;
  receiptSizeBytes?: number;
  depositDate?: string;
  operationNumber?: string;
  operationDate?: string;
  operationTime?: string;
  titular?: string;
}
