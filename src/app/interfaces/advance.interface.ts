export type AdvanceStatus =
  | 'draft'
  | 'pending_l1'
  | 'pending_l2'
  | 'approved'
  | 'partially_paid'
  | 'paid'
  | 'settled'
  | 'rejected'
  | 'returned'
  | 'cancelled';

export interface IApprovalEntry {
  level: number;
  approvedBy: string;
  action: 'approved' | 'rejected' | 'resubmitted';
  notes?: string;
  date: string;
}

export interface IPaymentInfo {
  method: 'transferencia_bancaria' | 'efectivo' | 'cheque';
  bankName?: string;
  accountNumber?: string;
  cci?: string;
  transferDate: string;
  reference?: string;
  paymentReceiptUrl: string;
  paymentReceiptFileName?: string;
  paymentReceiptMimeType?: string;
  paymentReceiptSizeBytes?: number;
}

/** Pago parcial de un viático (contabilidad puede registrar varios). */
export interface IAdvancePayment {
  amount: number;
  method: 'transferencia_bancaria' | 'efectivo' | 'cheque';
  bankName?: string;
  accountNumber?: string;
  cci?: string;
  transferDate: string;
  reference?: string;
  paymentReceiptUrl: string;
  paymentReceiptFileName?: string;
  paymentReceiptMimeType?: string;
  paymentReceiptSizeBytes?: number;
  scannedAmount?: number;
  scannedTitular?: string;
  operationNumber?: string;
  operationDate?: string;
  operationTime?: string;
  createdAt?: string;
}

export interface IAdvanceSettlement {
  expenseTotal: number;
  advanceAmount: number;
  difference: number;
  type: 'reembolso' | 'devolucion' | 'equilibrado';
  settledAt: string;
}

export interface IAdvanceLine {
  categoryId: { _id: string; name: string; key?: string } | string;
  detalle?: string;
  importe: number;
  peopleCount: number;
  glpPerDay: number;
  days: number;
  lineTotal: number;
}

export interface ICoordinatorNotification {
  recipientUserId?: string;
  sentAt?: string;
  status: 'sent' | 'failed' | 'skipped';
  errorMessage?: string;
}

export type ReturnRecordStatus = 'pending' | 'proof_uploaded' | 'validated' | 'rejected';

export interface IReturnProof {
  depositDate: string;
  amountReturned: number;
  bankOrigin: string;
  operationNumber: string;
  fileUrl: string;
  fileKey?: string;
  uploadedAt: string;
  note?: string;
  /** Datos extraídos del comprobante por OCR/visión (informativos). */
  scannedAmount?: number;
  operationDate?: string;
  operationTime?: string;
  titular?: string;
}

export interface IReturnValidation {
  validatedBy: string;
  validatedAt: string;
  approved: boolean;
  rejectionReason?: string;
}

export interface IReturnRecord {
  status: ReturnRecordStatus;
  amountDue: number;
  dueDate: string;
  proof?: IReturnProof;
  validation?: IReturnValidation;
  isOverdue: boolean;
  remindersSent: number;
  escalatedAt?: string;
}

export interface IAdvance {
  _id: string;
  userId: { _id: string; name: string; email: string; bankAccount?: IBankAccount; dni?: string } | string;
  clientId: string;
  /** @deprecated usar approverChain. */
  coordinatorId?: string;
  /** Cadena ordenada de aprobadores asignada al momento de crear la solicitud. */
  approverChain?: ({ _id: string; name: string; email: string } | string)[];
  expenseReportId?: { _id: string; title: string; status: string } | string;
  /** Fase 2 — centro de costo */
  projectId?:
    | { _id: string; code?: string; name: string; isActive?: boolean }
    | string;
  place?: string;
  startDate?: string;
  endDate?: string;
  lines?: IAdvanceLine[];
  observations?: string;
  coordinatorNotification?: ICoordinatorNotification;
  amount: number;
  description: string;
  status: AdvanceStatus;
  approvalLevel: number;
  requiredLevels: number;
  approvalHistory: IApprovalEntry[];
  paymentInfo?: IPaymentInfo;
  payments?: IAdvancePayment[];
  paidAmount?: number;
  settlement?: IAdvanceSettlement;
  rejectedBy?: string;
  rejectionReason?: string;
  returnedAmount?: number;
  returnRecord?: IReturnRecord;
  /** Reenvíos tras rechazo (Fase 3). */
  solicitudVersion?: number;
  budgetCommitmentRecorded?: boolean;
  /** Rendición de origen cuando este anticipo incorpora un saldo pendiente de otra rendición. */
  pendingBalanceFromReportId?: string;
  pendingBalanceAmount?: number;
  additionalAmount?: number;
  requestBankName?: string;
  requestAccountNumber?: string;
  requestCci?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IBankAccount {
  bankName: string;
  accountNumber: string;
  cci: string;
  accountType: 'ahorros' | 'corriente';
}

export interface IAdvanceStats {
  pending_l1: number;
  pending_l2: number;
  approved: number;
  paid: number;
  settled: number;
  totalApprovedAmount: number;
}

/** Legacy: solo amount + description. Fase 2: lugar, fechas, proyecto y monto requerido. */
export interface ICreateAdvancePayload {
  amount: number;
  description: string;
  expenseReportId?: string;
  place?: string;
  lat?: number;
  lng?: number;
  startDate?: string;
  endDate?: string;
  projectId?: string;
  observations?: string;
  pendingBalanceFromReportId?: string;
  pendingBalanceAmount?: number;
  additionalAmount?: number;
  bankName?: string;
  accountNumber?: string;
  cci?: string;
}

export interface IApproveAdvancePayload {
  notes?: string;
}

export interface IRejectAdvancePayload {
  rejectionReason: string;
}

export interface IPayAdvancePayload {
  amount?: number;
  method: 'transferencia_bancaria' | 'efectivo' | 'cheque';
  bankName?: string;
  accountNumber?: string;
  cci?: string;
  transferDate: string;
  reference?: string;
  paymentReceiptUrl: string;
  paymentReceiptFileName?: string;
  paymentReceiptMimeType?: string;
  paymentReceiptSizeBytes?: number;
  scannedAmount?: number;
  scannedTitular?: string;
  operationNumber?: string;
  operationDate?: string;
  operationTime?: string;
}

export const ADVANCE_STATUS_LABELS: Record<AdvanceStatus, string> = {
  draft: 'Borrador',
  pending_l1: 'Pendiente Aprobación',
  pending_l2: 'Aprobado por Coordinador',
  approved: 'Aprobado',
  partially_paid: 'Pago parcial',
  paid: 'Pagado',
  settled: 'Liquidado',
  rejected: 'Rechazado',
  returned: 'Devuelto',
  cancelled: 'Cancelado',
};

export const ADVANCE_STATUS_COLORS: Record<AdvanceStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending_l1: 'bg-yellow-100 text-yellow-700',
  pending_l2: 'bg-orange-100 text-orange-700',
  approved: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-cyan-100 text-cyan-700',
  paid: 'bg-green-100 text-green-700',
  settled: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  returned: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-orange-100 text-orange-700',
};
