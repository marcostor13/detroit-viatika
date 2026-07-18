import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import {
  IExpenseReport,
  ICreateExpenseReport,
  IUpdateExpenseReport,
  IRegisterReimbursementPaymentPayload,
  IMisDocumentoItem,
  ICreateViaticoPayload,
  IResubmitViaticoPayload,
} from '../interfaces/expense-report.interface';
import { Observable } from 'rxjs';

export interface IExpenseReportDeletionPreview {
  allowed: boolean;
  reason?: string;
  type?: string;
  isDirecta: boolean;
  isCajaChica: boolean;
  budget: number;
  expensesCount: number;
  expensesTotal: number;
  filesCount: number;
  linkedAdvances: { amount: number; status: string }[];
  cajaChicaReferenced: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ExpenseReportsService {
  private http = inject(HttpClient);
  private apiUrl = environment.api;

  create(data: ICreateExpenseReport): Observable<IExpenseReport> {
    return this.http.post<IExpenseReport>(`${this.apiUrl}/expense-report`, data);
  }

  findAllByClient(clientId: string): Observable<IExpenseReport[]> {
    return this.http.get<IExpenseReport[]>(`${this.apiUrl}/expense-report/client/${clientId}`);
  }

  findAllByUser(userId: string, clientId: string): Observable<IExpenseReport[]> {
    return this.http.get<IExpenseReport[]>(`${this.apiUrl}/expense-report/user/${userId}/client/${clientId}`);
  }

  findOne(id: string): Observable<IExpenseReport> {
    return this.http.get<IExpenseReport>(`${this.apiUrl}/expense-report/${id}`);
  }

  update(id: string, data: IUpdateExpenseReport): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(`${this.apiUrl}/expense-report/${id}`, data);
  }

  delete(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/expense-report/${id}`);
  }

  /** Vista previa de lo que se eliminaría (comprobantes, anticipos, caja chica) antes de confirmar el borrado. */
  getDeletionPreview(id: string): Observable<IExpenseReportDeletionPreview> {
    return this.http.get<IExpenseReportDeletionPreview>(
      `${this.apiUrl}/expense-report/${id}/deletion-preview`
    );
  }

  findPendingReimbursements(clientId: string): Observable<IExpenseReport[]> {
    return this.http.get<IExpenseReport[]>(
      `${this.apiUrl}/expense-report/pending-reimbursements/client/${clientId}`
    );
  }

  /** Contabilidad: crea una rendición directa con depósito inicial para un colaborador/coordinador. */
  createDirectaDeposit(payload: {
    userId: string;
    projectId: string;
    ordenTrabajoId: string;
    gestion?: string;
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
  }): Observable<IExpenseReport> {
    return this.http.post<IExpenseReport>(
      `${this.apiUrl}/expense-report/directa-deposit`,
      payload
    );
  }

  /** Colaborador: sus propias rendiciones de caja chica. */
  getMyCajaChica(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/expense-report/my/caja-chica`);
  }

  /** Contabilidad: todas las rendiciones de caja chica disponibles del cliente. */
  getAllCajaChicaAvailable(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/expense-report/caja-chica/available`);
  }

  /** Contabilidad: lista las rendiciones directas iniciadas con depósito. */
  findDirectaDepositReports(clientId: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/expense-report/directas-deposito/client/${clientId}`
    );
  }

  /** Escanea el comprobante de depósito (imagen o PDF, por URL) y extrae monto, fecha, hora, n° de operación y titular. */
  scanDepositAmount(url: string, mimeType?: string): Observable<{
    amount: number;
    fecha?: string;
    hora?: string;
    operationNumber?: string;
    titular?: string;
  }> {
    return this.http.post<{
      amount: number;
      fecha?: string;
      hora?: string;
      operationNumber?: string;
      titular?: string;
    }>(`${this.apiUrl}/expense/scan-deposit-amount`, { url, mimeType });
  }

  findMyDocuments(): Observable<{ items: IMisDocumentoItem[] }> {
    return this.http.get<{ items: IMisDocumentoItem[] }>(
      `${this.apiUrl}/expense-report/documents/my`
    );
  }

  registerReimbursementPayment(
    reportId: string,
    payload: IRegisterReimbursementPaymentPayload
  ): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(
      `${this.apiUrl}/expense-report/${reportId}/register-reimbursement-payment`,
      payload
    );
  }

  cancelRendicion(id: string, reason?: string): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(
      `${this.apiUrl}/expense-report/${id}/cancel`,
      { reason }
    );
  }

  validateClosure(reportId: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/expense-report/${reportId}/close/validate`);
  }

  close(reportId: string): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(`${this.apiUrl}/expense-report/${reportId}/close`, {});
  }

  requestReopening(reportId: string, reason: string): Observable<IExpenseReport> {
    return this.http.post<IExpenseReport>(
      `${this.apiUrl}/expense-report/${reportId}/reopen-request`,
      { reason }
    );
  }

  approveReopening(reportId: string, approve: boolean): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(
      `${this.apiUrl}/expense-report/${reportId}/reopen-approve`,
      { approve }
    );
  }

  registerReturnVoucher(
    reportId: string,
    payload: {
      depositDate: string;
      bankOrigin?: string;
      operationNumber?: string;
      fileUrl: string;
      fileName?: string;
      scannedAmount?: number;
      operationDate?: string;
      operationTime?: string;
      titular?: string;
    }
  ): Observable<IExpenseReport> {
    return this.http.post<IExpenseReport>(
      `${this.apiUrl}/expense-report/${reportId}/return-voucher`,
      payload
    );
  }

  findExpensesPaginated(
    reportId: string,
    params: { page?: number; limit?: number; type?: string; status?: string; search?: string }
  ): Observable<{ data: any[]; total: number; page: number; limit: number; pages: number }> {
    const qp = new URLSearchParams();
    if (params.page) qp.set('page', String(params.page));
    if (params.limit) qp.set('limit', String(params.limit));
    if (params.type && params.type !== 'all') qp.set('type', params.type);
    if (params.status && params.status !== 'all') qp.set('status', params.status);
    if (params.search?.trim()) qp.set('search', params.search.trim());
    const qs = qp.toString();
    return this.http.get<{ data: any[]; total: number; page: number; limit: number; pages: number }>(
      `${this.apiUrl}/expense-report/${reportId}/expenses${qs ? '?' + qs : ''}`
    );
  }

  // ─── Viáticos unificados ──────────────────────────────────────────────────

  createViatico(payload: ICreateViaticoPayload): Observable<IExpenseReport> {
    return this.http.post<IExpenseReport>(`${this.apiUrl}/expense-report/viatico`, payload);
  }

  getMyViaticos(): Observable<IExpenseReport[]> {
    return this.http.get<IExpenseReport[]>(`${this.apiUrl}/expense-report/viaticos/my`);
  }

  resubmitViatico(id: string, payload: IResubmitViaticoPayload): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(`${this.apiUrl}/expense-report/${id}/viatico/resubmit`, payload);
  }

  cancelViatico(id: string): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(`${this.apiUrl}/expense-report/${id}/viatico/cancel`, {});
  }

  approveViatico(id: string): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(`${this.apiUrl}/expense-report/${id}/viatico/approve`, {});
  }

  /** Aprobación final de Contabilidad, tras completarse la cadena de centro de costo. */
  approveViaticoContabilidad(id: string): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(`${this.apiUrl}/expense-report/${id}/viatico/contabilidad-approve`, {});
  }

  rejectViatico(id: string, rejectionReason: string): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(`${this.apiUrl}/expense-report/${id}/viatico/reject`, { rejectionReason });
  }

  /** Aprueba el paso del aprobador actual en la cadena de la RENDICIÓN a nivel de reporte (N1/N2…). Con la cadena completa, la rendición pasa a Contabilidad. */
  approveRendicion(id: string): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(`${this.apiUrl}/expense-report/${id}/rendicion/approve`, {});
  }

  /** Rechaza la RENDICIÓN a nivel de reporte (cualquier aprobador de un paso pendiente). */
  rejectRendicion(id: string, rejectionReason: string): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(`${this.apiUrl}/expense-report/${id}/rendicion/reject`, { rejectionReason });
  }

  /** Aprueba el turno actual de la cadena de aprobadores de centro de costo de una rendición directa. */
  registerViaticoPayment(id: string, payload: IRegisterReimbursementPaymentPayload): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(
      `${this.apiUrl}/expense-report/${id}/viatico/register-payment`,
      payload
    );
  }

  getViaticosList(filters: { status?: string; dateFrom?: string; dateTo?: string } = {}): Observable<IExpenseReport[]> {
    const parts: string[] = [];
    if (filters.status) parts.push(`status=${encodeURIComponent(filters.status)}`);
    if (filters.dateFrom) parts.push(`dateFrom=${encodeURIComponent(filters.dateFrom)}`);
    if (filters.dateTo) parts.push(`dateTo=${encodeURIComponent(filters.dateTo)}`);
    const qs = parts.length ? '?' + parts.join('&') : '';
    return this.http.get<IExpenseReport[]>(`${this.apiUrl}/expense-report/viaticos/list${qs}`);
  }

  reopen(reportId: string, reason: string): Observable<IExpenseReport> {
    return this.http.patch<IExpenseReport>(
      `${this.apiUrl}/expense-report/${reportId}/reopen`,
      { reason }
    );
  }

  batchApproveByCoord(reportId: string): Observable<{ approved: number }> {
    return this.http.patch<{ approved: number }>(
      `${this.apiUrl}/expense/report/${reportId}/batch-approve-coord`,
      {}
    );
  }

  batchApproveByCollab(reportId: string): Observable<{ approved: number }> {
    return this.http.patch<{ approved: number }>(
      `${this.apiUrl}/expense/report/${reportId}/batch-approve-collab`,
      {}
    );
  }

  createAffidavit(
    reportId: string,
    payload: { type: 'viaticos_nacionales' | 'viajes_exterior'; expenseIds: string[] }
  ): Observable<{
    reportId: string;
    type: 'viaticos_nacionales' | 'viajes_exterior';
    expenseIds: string[];
    generatedBy: string;
    generatedAt: string;
  }> {
    return this.http.post<{
      reportId: string;
      type: 'viaticos_nacionales' | 'viajes_exterior';
      expenseIds: string[];
      generatedBy: string;
      generatedAt: string;
    }>(`${this.apiUrl}/expense-report/${reportId}/affidavit`, payload);
  }

  findDirectRendicionExpenses(clientId: string, filters: {
    page?: number; limit?: number;
    dateFrom?: string; dateTo?: string;
    projectId?: string; categoryId?: string; docNumber?: string; tipo?: string;
    userId?: string;
  } = {}): Observable<{ data: any[]; total: number; page: number; limit: number; pages: number }> {
    let params = new HttpParams();
    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.limit) params = params.set('limit', String(filters.limit));
    if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params = params.set('dateTo', filters.dateTo);
    if (filters.projectId) params = params.set('projectId', filters.projectId);
    if (filters.categoryId) params = params.set('categoryId', filters.categoryId);
    if (filters.docNumber) params = params.set('docNumber', filters.docNumber);
    if (filters.tipo) params = params.set('tipo', filters.tipo);
    if (filters.userId) params = params.set('userId', filters.userId);
    return this.http.get<{ data: any[]; total: number; page: number; limit: number; pages: number }>(
      `${this.apiUrl}/expense-report/directas/expenses/${clientId}`,
      { params }
    );
  }

  /** Rendiciones directas a nivel de reporte (una fila por rendición) para la pestaña "Rendiciones directas". */
  findDirectRendicionReports(clientId: string, filters: {
    dateFrom?: string; dateTo?: string; userId?: string;
  } = {}): Observable<any[]> {
    let params = new HttpParams();
    if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params = params.set('dateTo', filters.dateTo);
    if (filters.userId) params = params.set('userId', filters.userId);
    return this.http.get<any[]>(
      `${this.apiUrl}/expense-report/directas/reports/${clientId}`,
      { params }
    );
  }
}
