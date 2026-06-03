export type IReopeningStatus = 'none' | 'requested' | 'approved';

export interface IClosureRecord {
  closedAt: string;
  closedBy: string;
  documentHashes?: string[];
  reopeningStatus: IReopeningStatus;
  reopeningRequestedBy?: string;
  reopeningRequestedAt?: string;
  reopeningReason?: string;
  reopeningApprovedBy?: string;
  reopeningApprovedAt?: string;
  reopenedAt?: string;
}

export interface IExpenseReportBudgetItem {
  description: string;
  amount: number;
  peopleCount: number;
  fuelAmount: number;
  daysCount: number;
  total: number;
}

export interface IExpenseReportSettlement {
  advanceTotal: number;
  expenseTotal: number;
  difference: number;
  type: 'reembolso' | 'devolucion' | 'equilibrado';
  settledAt?: string;
}

export interface IReimbursementPaymentInfo {
  method: 'transferencia_bancaria' | 'efectivo' | 'cheque';
  bankName?: string;
  accountNumber?: string;
  cci?: string;
  transferDate: string;
  reference?: string;
  paymentReceiptUrl?: string;
  paymentReceiptFileName?: string;
  paymentReceiptMimeType?: string;
  paymentReceiptSizeBytes?: number;
}

export interface IExpenseReport {
  _id: string;
  title: string;
  description?: string;
  budget: number;
  userId: any; // Ideally IUserResponse or string ID
  clientId: string;
  status: 'solicited' | 'open' | 'submitted' | 'pending_accounting' | 'approved' | 'rejected' | 'reimbursed' | 'closed' | 'cancelled';
  /** Motivo indicado por el administrador al rechazar */
  rejectionReason?: string;
  /** Quién rechazó: coordinador (revisión inicial) o contabilidad (aprobación final). */
  rejectedByRole?: 'coordinador' | 'contabilidad';
  expenseIds: any[];
  createdBy: any; // User who created it
  approvedBy?: any; // Admin who approved it
  projectId?: any;
  createdAt: string;
  updatedAt: string;
  // New fields
  accountNumber?: string;
  idDocument?: string;
  peopleNames?: string[];
  location?: string;
  startDate?: string;
  endDate?: string;
  items?: IExpenseReportBudgetItem[];
  settlement?: IExpenseReportSettlement;
  reimbursementPaymentInfo?: IReimbursementPaymentInfo;
  reimbursedAt?: string;
  returnVoucher?: {
    url: string;
    fileName?: string;
    depositDate: string;
    bankOrigin?: string;
    operationNumber?: string;
    uploadedAt: string;
  };
  closureRecord?: IClosureRecord;
  coordinatorApprovedAt?: string;
  coordinatorApprovedBy?: any;
  contabilidadApprovedAt?: string;
  contabilidadApprovedBy?: any;
  reopenHistory?: Array<{ reason: string; reopenedBy: string; reopenedAt: string; fromStatus: string }>;
  motivo?: string;
  isDirecta?: boolean;
}

export interface ICreateExpenseReport {
  title?: string;
  description?: string;
  budget?: number;
  userId: string;
  clientId: string;
  projectId?: string;
  motivo?: string;
  isDirecta?: boolean;
  // New fields
  accountNumber?: string;
  idDocument?: string;
  peopleNames?: string[];
  location?: string;
  startDate?: string;
  endDate?: string;
  items?: IExpenseReportBudgetItem[];
}

export interface IRegisterReimbursementPaymentPayload {
  method: 'transferencia_bancaria' | 'efectivo' | 'cheque';
  bankName?: string;
  accountNumber?: string;
  cci?: string;
  transferDate: string;
  reference?: string;
  paymentReceiptUrl?: string;
  paymentReceiptFileName?: string;
  paymentReceiptMimeType?: string;
  paymentReceiptSizeBytes?: number;
}

export interface IMisDocumentoItem {
  kind: 'viatico_pago' | 'reembolso_rendicion';
  title: string;
  receiptUrl: string;
  receiptFileName?: string;
  date?: string;
  expenseReportId?: string;
  advanceId?: string;
  amountFormatted?: string;
  detailUrl?: string;
}

export interface IUpdateExpenseReport {
  title?: string;
  description?: string;
  budget?: number;
  status?:
    | 'solicited'
    | 'open'
    | 'submitted'
    | 'pending_accounting'
    | 'approved'
    | 'rejected'
    | 'reimbursed'
    | 'closed'
    | 'cancelled';
  rejectionReason?: string;
  expenseIds?: string[];
  // New fields
  accountNumber?: string;
  idDocument?: string;
  peopleNames?: string[];
  location?: string;
  startDate?: string;
  endDate?: string;
  items?: IExpenseReportBudgetItem[];
}
