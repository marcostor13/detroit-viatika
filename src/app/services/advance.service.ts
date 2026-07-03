import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserStateService } from './user-state.service';
import {
  IAdvance,
  IAdvanceStats,
  ICreateAdvancePayload,
  IApproveAdvancePayload,
  IRejectAdvancePayload,
  IPayAdvancePayload,
  IReturnProof,
} from '../interfaces/advance.interface';

@Injectable({ providedIn: 'root' })
export class AdvanceService {
  private readonly url = `${environment.api}/advance`;
  private http = inject(HttpClient);
  private userStateService = inject(UserStateService);

  private get clientId(): string {
    const user = this.userStateService.getUser() as any;
    return user?.companyId || user?.client?._id || user?.clientId?._id || user?.clientId || '';
  }

  private get userId(): string {
    const user = this.userStateService.getUser() as any;
    return user?._id || '';
  }

  create(payload: ICreateAdvancePayload): Observable<IAdvance> {
    return this.http.post<IAdvance>(this.url, payload);
  }

  findMy(): Observable<IAdvance[]> {
    return this.http.get<IAdvance[]>(`${this.url}/my/${this.userId}/client/${this.clientId}`);
  }

  findAll(): Observable<IAdvance[]> {
    return this.http.get<IAdvance[]>(`${this.url}/client/${this.clientId}`);
  }

  findOrphaned(clientId: string): Observable<IAdvance[]> {
    return this.http.get<IAdvance[]>(`${this.url}/orphaned/client/${clientId}`);
  }

  findPending(): Observable<IAdvance[]> {
    return this.http.get<IAdvance[]>(`${this.url}/pending/client/${this.clientId}`);
  }

  getStats(): Observable<IAdvanceStats> {
    return this.http.get<IAdvanceStats>(`${this.url}/stats/client/${this.clientId}`);
  }

  findOne(id: string): Observable<IAdvance> {
    return this.http.get<IAdvance>(`${this.url}/${id}`);
  }

  approveL1(id: string, payload: IApproveAdvancePayload): Observable<IAdvance> {
    return this.http.patch<IAdvance>(`${this.url}/${id}/approve-l1`, payload);
  }

  approveL2(id: string, payload: IApproveAdvancePayload): Observable<IAdvance> {
    return this.http.patch<IAdvance>(`${this.url}/${id}/approve-l2`, payload);
  }

  reject(id: string, payload: IRejectAdvancePayload): Observable<IAdvance> {
    return this.http.patch<IAdvance>(`${this.url}/${id}/reject`, payload);
  }

  registerPayment(id: string, payload: IPayAdvancePayload): Observable<IAdvance> {
    return this.http.patch<IAdvance>(`${this.url}/${id}/register-payment`, payload);
  }

  registerReturn(id: string, returnedAmount: number): Observable<IAdvance> {
    return this.http.patch<IAdvance>(`${this.url}/${id}/return`, { returnedAmount });
  }

  /** Fase 3 — corrección y reenvío tras rechazo (solo el colaborador dueño). */
  resubmit(id: string, payload: ICreateAdvancePayload): Observable<IAdvance> {
    return this.http.patch<IAdvance>(`${this.url}/${id}/resubmit`, payload);
  }

  cancelAdvance(id: string): Observable<IAdvance> {
    return this.http.patch<IAdvance>(`${this.url}/${id}/cancel`, {});
  }

  /** Elimina (borrado físico) una solicitud de viáticos. */
  delete(id: string): Observable<IAdvance> {
    return this.http.delete<IAdvance>(`${this.url}/${id}`);
  }

  // ─── Fase 7 — devolución de saldo ──────────────────────────────────────────

  initiateReturn(id: string): Observable<IAdvance> {
    return this.http.patch<IAdvance>(`${this.url}/${id}/return/initiate`, {});
  }

  uploadReturnProof(id: string, proof: Omit<IReturnProof, 'uploadedAt'>): Observable<IAdvance> {
    return this.http.patch<IAdvance>(`${this.url}/${id}/return/proof`, proof);
  }

  validateReturn(id: string, approved: boolean, rejectionReason?: string): Observable<IAdvance> {
    return this.http.patch<IAdvance>(`${this.url}/${id}/return/validate`, { approved, rejectionReason });
  }

  findPendingReturns(clientId: string): Observable<IAdvance[]> {
    return this.http.get<IAdvance[]>(`${this.url}/pending-returns/client/${clientId}`);
  }

  findForViaticosPage(filters: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Observable<IAdvance[]> {
    let params = '';
    const parts: string[] = [];
    if (filters.status) parts.push(`status=${encodeURIComponent(filters.status)}`);
    if (filters.dateFrom) parts.push(`dateFrom=${encodeURIComponent(filters.dateFrom)}`);
    if (filters.dateTo) parts.push(`dateTo=${encodeURIComponent(filters.dateTo)}`);
    if (parts.length) params = '?' + parts.join('&');
    return this.http.get<IAdvance[]>(`${this.url}/viaticos/list${params}`);
  }
}
