import { IProject } from './project.interface';
import { ICategory } from './category.interface';

export type ExpenseType =
  | 'factura'
  | 'planilla_movilidad'
  | 'otros_gastos'
  | 'recibo_caja';

export interface IMobilityRowCoords {
  lat: number;
  lng: number;
}

export interface IMobilityRow {
  fecha: string;
  total: number;
  /** Proyecto de la fila (Rendiciones Directas: el proyecto se elige por fila). */
  proyectId?: string;
  /** Categoría de la fila, según el perfil del proyecto de la fila (Rendiciones Directas). */
  categoryId?: string;
  origen: string;
  origenDepartamento?: string;
  origenProvincia?: string;
  origenDistrito?: string;
  origenCoords?: IMobilityRowCoords;
  destino: string;
  destinoDepartamento?: string;
  destinoProvincia?: string;
  destinoDistrito?: string;
  destinoCoords?: IMobilityRowCoords;
  distanciaKm?: number;
  gestion: string;
}

export interface ICreateMobilitySheetPayload {
  proyectId: string;
  /** Orden de Trabajo, obligatoria según el formato oficial ADF-FOR-005. */
  ordenTrabajoId: string;
  categoryId: string;
  expenseReportId?: string;
  mobilityRows: IMobilityRow[];
  imageUrl?: string;
}

export interface ICreateOtherExpensePayload {
  proyectId: string;
  categoryId: string;
  expenseReportId?: string;
  total: number;
  data?: string;
  declaracionJurada: true;
  declaracionJuradaFirmante: string;
  imageUrl?: string;
}

export interface ICreateCashReceiptPayload {
  proyectId: string;
  categoryId: string;
  expenseReportId?: string;
  total: number;
  data: string;
  fechaEmision: string;
  imageUrl: string;
}

export interface IInvoice {
  proyect: string;
  category: string;
  file: string;
  createdAt: string;
  updatedAt: string;
  total: string | number;
}

export type InvoiceStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'sunat_valid'
  | 'sunat_valid_not_ours'
  | 'sunat_not_found'
  | 'sunat_error'
  | 'VALIDO_ACEPTADO'
  | 'VALIDO_NO_PERTENECE'
  | 'NO_ENCONTRADO'
  | 'ERROR_SUNAT';

export interface IInvoiceResponse {
  _id: string;
  proyect: string;
  proyectId: IProject;
  categoryId: ICategory;
  expenseType?: ExpenseType;
  mobilityRows?: IMobilityRow[];
  declaracionJurada?: boolean;
  declaracionJuradaFirmante?: string;
  projectName?: string;
  category: string;
  file: string;
  data: any;
  total: string;
  date: string;
  createdAt: string;
  updatedAt: string;

  status?: InvoiceStatus;
  statusDate?: string;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  observado?: boolean;
  observacionPlazo?: string;
  diasRetraso?: number;
  categoryLimitPercent?: number;
  categoryLimitWarning?: string;
  reviewHistory?: {
    action: 'approved' | 'rejected';
    reviewerId?: string;
    reviewedAt: string;
    reason?: string;
  }[];
  internalCode?: string;

  provider?: string;
  ruc?: string;
  address?: string;
  tipo?: string;
  correlativo?: string;
  serie?: string;
  montoTotal?: number;
  moneda?: string;
  userId?: string;
  createdBy?: string;
  uploadedBy?: string;
}

export interface InvoicePayload {
  proyectId: string;
  categoryId: string;
  imageUrl: string;
  status?: InvoiceStatus;
  expenseReportId?: string | null;
}

export interface ApprovalPayload {
  status: InvoiceStatus;
  userId?: string;
  reason?: string;
}

export interface InvoiceData {
  rucEmisor?: string;
  tipoComprobante?: string;
  serie?: string;
  correlativo?: string;
  fechaEmision?: string;
  moneda?: string;
  montoTotal?: number;
  razonSocial?: string;
  direccionEmisor?: string;
}

// Nuevas interfaces para validación SUNAT
export interface SunatValidationResult {
  status:
    | 'VALIDO_ACEPTADO'
    | 'VALIDO_NO_PERTENECE'
    | 'NO_ENCONTRADO'
    | 'ERROR_SUNAT';
  details: any;
  message: string;
}

export interface SunatValidationInfo {
  expenseId: string;
  status: InvoiceStatus;
  sunatValidation: SunatValidationResult | null;
  hasValidation: boolean;
  message: string;
  extractedData?: {
    rucEmisor?: string;
    serie?: string;
    correlativo?: string;
    fechaEmision?: string;
    montoTotal?: number;
  };
}
