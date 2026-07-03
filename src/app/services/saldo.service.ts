import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  ISaldo,
  ICreatePagoSaldoPayload,
  SaldoContext,
} from '../interfaces/saldo.interface';

@Injectable({
  providedIn: 'root',
})
export class SaldoService {
  private http = inject(HttpClient);
  private apiUrl = environment.api;

  /** Total de saldo disponible del colaborador autenticado (para el header). */
  readonly total = signal<number>(0);

  /** Contabilidad registra un pago directo → crea un saldo tipo `pago`. */
  createPago(payload: ICreatePagoSaldoPayload): Observable<ISaldo> {
    return this.http.post<ISaldo>(`${this.apiUrl}/saldo/pago`, payload);
  }

  /** Saldos disponibles del colaborador (página Saldo). */
  getMine(): Observable<ISaldo[]> {
    return this.http.get<ISaldo[]>(`${this.apiUrl}/saldo/mine`);
  }

  /** Total disponible (header). */
  getTotal(): Observable<{ total: number }> {
    return this.http.get<{ total: number }>(`${this.apiUrl}/saldo/total`);
  }

  /** Saldos elegibles según contexto de consumo. */
  getEligible(context: SaldoContext, projectId?: string): Observable<ISaldo[]> {
    let params = new HttpParams().set('context', context);
    if (projectId) {
      params = params.set('projectId', projectId);
    }
    return this.http.get<ISaldo[]>(`${this.apiUrl}/saldo/eligible`, { params });
  }

  /** Refresca el signal de total (llamar tras login y tras consumir/crear saldos). */
  refreshTotal(): void {
    this.getTotal().subscribe({
      next: r => this.total.set(Number(r?.total) || 0),
      error: () => this.total.set(0),
    });
  }
}
