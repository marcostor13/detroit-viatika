import { IProject } from './project.interface';
import { ICategory } from './category.interface';

export type ExpenseType =
  | 'factura'
  | 'planilla_movilidad'
  | 'otros_gastos'
  | 'recibo_caja'
  /**
   * Constancia de un gasto que no llegó a ocurrir (viaje suspendido, servicio
   * anulado): solo fecha y motivo, siempre en 0 y sin comprobante.
   */
  | 'cancelacion';

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
  /**
   * Colaborador al que corresponde la fila. Es quien rinde, salvo en caja
   * chica: ahí el responsable del fondo elige a quien usó la movilidad y todas
   * las filas de la planilla van a su nombre.
   */
  colaboradorId?: string;
  colaboradorNombre?: string;
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
  /** Opcional en caja chica: ahí el centro de costo se elige por comprobante. */
  proyectId?: string;
  /**
   * Orden de Trabajo, obligatoria según el formato oficial ADF-FOR-005. Opcional
   * solo cuando la planilla pertenece a un viático cuya solicitud no llevó OT
   * (la OT es opcional al solicitar el viático y el gasto la hereda de ahí).
   */
  ordenTrabajoId?: string;
  categoryId: string;
  expenseReportId?: string;
  /** Obligatoria en caja chica, como en el resto de sus comprobantes. */
  firmaUrl?: string;
  mobilityRows: IMobilityRow[];
  imageUrl?: string;
  /**
   * Adjuntos de respaldo cuando hay más de uno. El primero coincide con
   * `imageUrl`, que es el que sigue quedando como `file` del comprobante.
   */
  attachments?: string[];
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
  /** Ver `ICreateMobilitySheetPayload.attachments`. */
  attachments?: string[];
}

/** Fila diaria de un rubro de la Declaración Jurada al extranjero (DJE). */
export interface IDeclaracionJuradaRow {
  fecha: string;
  monto: number;
}

export interface IDeclaracionJuradaSeccion {
  categoryId: string;
  rows: IDeclaracionJuradaRow[];
}

export interface ICreateDeclaracionJuradaPayload {
  proyectId: string;
  expenseReportId?: string;
  moneda: string;
  destino?: string;
  pais?: string;
  lugarFirma?: string;
  imageUrl?: string;
  alimentacion?: IDeclaracionJuradaSeccion;
  movilidad?: IDeclaracionJuradaSeccion;
}

/** Los gastos creados (uno por rubro) quedan unidos por `groupId`. */
export interface IDeclaracionJuradaResponse {
  groupId: string;
  expenses: IInvoiceResponse[];
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

/**
 * Cancelación. No lleva centro de costo, categoría ni adjunto: el gasto no
 * ocurrió, así que no hay nada que imputar. El monto lo fuerza el backend a 0.
 */
export interface ICreateCancelacionPayload {
  expenseReportId?: string;
  /** Fecha de cancelación; viaja como `fechaEmision` del gasto. */
  fechaEmision: string;
  motivo: string;
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
  /** Todos los adjuntos de respaldo; `attachments[0] === file`. */
  attachments?: string[];
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
  /** Supera el monto de alerta por comprobante de la empresa. Solo aviso. */
  superaTopeComprobante?: boolean;
  /** Monto de alerta vigente cuando se registró el comprobante. */
  topeComprobante?: number;
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
