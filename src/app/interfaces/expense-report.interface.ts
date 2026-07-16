export type IReopeningStatus = 'none' | 'requested' | 'approved';

export type ExpenseReportType = 'rendicion' | 'viatico' | 'directa' | 'caja_chica';

export type IExpenseReportStatus =
  | 'solicited' | 'open' | 'submitted' | 'pending_accounting'
  | 'approved' | 'rejected' | 'reimbursed' | 'closed' | 'cancelled'
  | 'pending_l1' | 'pending_l2' | 'pending_contabilidad' | 'viatico_approved'
  | 'partially_paid' | 'paid' | 'settled' | 'returned';

/** Espeja `ChainStep` del backend (approval-chain.util.ts). */
export interface IChainStep {
  level: number;
  projectId: { _id: string; code?: string; name?: string } | string;
  projectRole: 'principal' | 'seleccionado';
  /** Cualquiera de estos aprobadores puede completar el paso. */
  approverIds: ({ _id: string; name: string; email: string } | string)[];
  /** Presente si este paso es resultado de un escalamiento (regla 1.5). */
  escalatedFrom?: number;
}

export interface ICreateViaticoPayload {
  amount: number;
  place: string;
  lat?: number;
  lng?: number;
  startDate: string;
  endDate: string;
  projectId: string;
  /** Orden de Trabajo (opcional) a la que se imputa el gasto del viático. */
  ordenTrabajoId?: string;
  observations?: string;
  /** Cuenta bancaria alternativa para el depósito (opcional). */
  bankName?: string;
  accountNumber?: string;
  cci?: string;
}

export interface IResubmitViaticoPayload {
  amount: number;
  place: string;
  lat?: number;
  lng?: number;
  startDate: string;
  endDate: string;
  projectId: string;
  /** Orden de Trabajo (opcional) a la que se imputa el gasto del viático. */
  ordenTrabajoId?: string;
  observations?: string;
  /** Cuenta bancaria alternativa para el depósito (opcional). */
  bankName?: string;
  accountNumber?: string;
  cci?: string;
}

export const VIATICO_REPORT_STATUS_LABELS: Partial<Record<IExpenseReportStatus, string>> = {
  pending_l1: 'En solicitud',
  pending_l2: 'Aprobada por coordinador',
  pending_contabilidad: 'Pendiente de Contabilidad',
  viatico_approved: 'Aprobada',
  partially_paid: 'Pago parcial',
  open: 'Registrando gastos',
  submitted: 'Enviada',
  pending_accounting: 'En contabilidad',
  approved: 'Aprobada',
  settled: 'Liquidada',
  returned: 'Saldo devuelto',
  reimbursed: 'Reembolsada',
  closed: 'Cerrada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
};

export const VIATICO_REPORT_STATUS_COLORS: Partial<Record<IExpenseReportStatus, string>> = {
  pending_l1: 'bg-yellow-100 text-yellow-700',
  pending_l2: 'bg-orange-100 text-orange-700',
  pending_contabilidad: 'bg-orange-100 text-orange-700',
  viatico_approved: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-cyan-100 text-cyan-700',
  open: 'bg-emerald-100 text-emerald-700',
  submitted: 'bg-purple-100 text-purple-700',
  pending_accounting: 'bg-violet-100 text-violet-700',
  approved: 'bg-green-100 text-green-700',
  settled: 'bg-teal-100 text-teal-700',
  returned: 'bg-gray-100 text-gray-500',
  reimbursed: 'bg-teal-100 text-teal-700',
  closed: 'bg-gray-100 text-gray-500',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

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
  /** Datos extraídos del comprobante por OCR/visión (informativos). */
  scannedAmount?: number;
  operationNumber?: string;
  operationDate?: string;
  operationTime?: string;
  titular?: string;
}

export interface IExpenseReport {
  _id: string;
  title: string;
  description?: string;
  budget: number;
  userId: any; // Ideally IUserResponse or string ID
  clientId: string;
  type?: ExpenseReportType;
  status: IExpenseReportStatus;
  // ─── Viático fields (type='viatico') ──────────────────────────────────────
  viaticoAmount?: number;
  viaticoPlace?: string;
  viaticoStartDate?: string;
  viaticoEndDate?: string;
  viaticoLines?: any[];
  viaticoPayments?: any[];
  viaticoPaidAmount?: number;
  viaticoApprovalLevel?: number;
  viaticoRequiredLevels?: number;
  /** Cadena por centro de costo (N2 principal/seleccionado) asignada al crear la solicitud. */
  viaticoApproverChain?: IChainStep[];
  viaticoApprovalHistory?: Array<{ level: number; approvedBy: string; action: string; notes?: string; date: string }>;
  viaticoRejectionReason?: string;
  /** Quién rechazó: aprobador de centro de costo, o Contabilidad (gate final). */
  viaticoRejectedByRole?: 'centro_costo' | 'contabilidad';
  viaticoObservations?: string;
  viaticoSolicitudVersion?: number;
  viaticoBankName?: string;
  viaticoAccountNumber?: string;
  viaticoCci?: string;
  /** Orden de Trabajo a la que se imputa el gasto del viático (poblada: {_id, nombre, costCenterId}). */
  viaticoOrdenTrabajoId?: { _id: string; nombre: string; costCenterId?: string } | string;
  /** Motivo indicado por el administrador al rechazar */
  rejectionReason?: string;
  /** Quién rechazó: coordinador (revisión inicial) o contabilidad (aprobación final). */
  rejectedByRole?: 'coordinador' | 'contabilidad';
  // ─── Rendición directa: cadena de aprobadores por centro de costo ─────────
  directaApprovalLevel?: number;
  directaRequiredLevels?: number;
  /** Cadena ordenada de aprobadores de centro de costo, armada al enviar la rendición. */
  directaApproverChain?: ({ _id: string; name: string; email: string } | string)[];
  directaApprovalHistory?: Array<{ level: number; approvedBy: string; action: string; notes?: string; date: string }>;
  /** Orden de Trabajo elegida al crear la rendición directa (heredada por todos sus comprobantes). */
  directaOrdenTrabajoId?: { _id: string; nombre: string; costCenterId?: string } | string;
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
    /** Datos extraídos del comprobante por OCR/visión (informativos). */
    scannedAmount?: number;
    operationDate?: string;
    operationTime?: string;
    titular?: string;
    uploadedAt: string;
  };
  closureRecord?: IClosureRecord;
  coordinatorApprovedAt?: string;
  coordinatorApprovedBy?: any;
  contabilidadApprovedAt?: string;
  contabilidadApprovedBy?: any;
  /**
   * Derivado en backend: algún comprobante de la solicitud ya fue aprobado
   * (coordinador o contabilidad). Si es true, el colaborador ya no puede
   * eliminar la solicitud.
   */
  hasApprovedExpense?: boolean;
  /**
   * Derivado en backend: la solicitud la creó alguien distinto del dueño (ej.
   * Contabilidad creó la rendición directa para el colaborador). Si es true, el
   * dueño no puede eliminarla; solo Contabilidad.
   */
  createdByOther?: boolean;
  /**
   * Derivado en backend: la rendición directa se creó con saldo heredado de otra
   * rendición. Si es true, el dueño no puede eliminarla (rompería la cadena del
   * saldo); solo Contabilidad.
   */
  inheritedBalance?: boolean;
  /**
   * Derivado en backend: la caja chica ya fue incluida (jalada) por Contabilidad
   * en un reporte (borrador o finalizado). Si es true, el colaborador ya no puede
   * eliminarla; solo Contabilidad.
   */
  referencedByCajaChica?: boolean;
  /**
   * Derivado en backend: la rendición de viáticos tiene un anticipo vinculado ya
   * aprobado/pagado. Si es true, el colaborador ya no puede eliminarla; solo
   * Contabilidad.
   */
  hasApprovedLinkedAdvance?: boolean;
  reopenHistory?: Array<{ reason: string; reopenedBy: string; reopenedAt: string; fromStatus: string }>;
  motivo?: string;
  /** Código autoincremental único de la rendición directa (ej. RD-0001). */
  codigo?: string;
  /** Gestión que el colaborador realizará para estos gastos. */
  gestion?: string;
  isDirecta?: boolean;
  isCajaChica?: boolean;
  /**
   * Derivado en backend: la caja chica que incluye esta rendición ya fue
   * finalizada por Contabilidad, por lo que el colaborador no puede subir más gastos.
   */
  lockedByCajaChica?: boolean;
  /** Depósito inicial cuando la rendición directa fue iniciada por Contabilidad. */
  directaDeposit?: IDirectaDepositInfo;
}

export interface IDirectaDepositInfo {
  amount: number;
  metodoPago?: 'deposito' | 'efectivo';
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
  createdBy?: any;
  createdAt?: string;
}

export interface ICreateExpenseReport {
  title?: string;
  description?: string;
  budget?: number;
  userId: string;
  clientId: string;
  projectId?: string;
  /** Orden de Trabajo elegida al crear la rendición directa (filtrada por el centro de costo). */
  ordenTrabajoId?: string;
  motivo?: string;
  gestion?: string;
  isDirecta?: boolean;
  isCajaChica?: boolean;
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
  /** Datos extraídos del comprobante por OCR/visión (informativos). */
  scannedAmount?: number;
  operationNumber?: string;
  operationDate?: string;
  operationTime?: string;
  titular?: string;
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
  status?: IExpenseReportStatus;
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
