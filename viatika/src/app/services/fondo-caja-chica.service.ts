import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserStateService } from './user-state.service';
import {
  IFondoCajaChica,
  ISolicitudCajaChica,
} from '../interfaces/fondo-caja-chica.interface';
import { IExpenseReport } from '../interfaces/expense-report.interface';

/**
 * Bolsa de caja chica. No confundir con `PettyCashService`, que apunta al
 * módulo legacy `/petty-cash` (fondo mensual de otro proyecto).
 */
@Injectable({ providedIn: 'root' })
export class FondoCajaChicaService {
  private readonly url = `${environment.api}/fondo-caja-chica`;
  private http = inject(HttpClient);
  private userState = inject(UserStateService);

  private get clientId(): string {
    const user = this.userState.getUser() as any;
    return (
      user?.companyId ||
      user?.client?._id ||
      (typeof user?.clientId === 'string' ? user.clientId : user?.clientId?._id) ||
      ''
    );
  }

  /** Solicita la asignación del fondo. Va por el flujo de Solicitud de Fondos. */
  solicitar(payload: {
    amount: number;
    observations?: string;
  }): Observable<IExpenseReport> {
    return this.http.post<IExpenseReport>(
      `${environment.api}/expense-report/solicitud-caja-chica`,
      payload
    );
  }

  /** Historial de solicitudes de caja chica del usuario (asignación y cambios). */
  misSolicitudes(): Observable<ISolicitudCajaChica[]> {
    return this.http.get<ISolicitudCajaChica[]>(
      `${environment.api}/expense-report/solicitudes-caja-chica/my`
    );
  }

  /**
   * Cuántos documentos de caja chica esperan una acción de este usuario. Lo
   * cuenta el backend según su rol (aprobador, Contabilidad, Tesorería o
   * Administrador): la pestaña muestra el número antes de abrirse, así que
   * traerse la bandeja completa solo para contarla no sirve.
   */
  pendientes(): Observable<{ total: number }> {
    return this.http.get<{ total: number }>(
      `${environment.api}/expense-report/caja-chica/pendientes`
    );
  }

  findMine(): Observable<IFondoCajaChica[]> {
    return this.http.get<IFondoCajaChica[]>(`${this.url}/mine`);
  }

  /** Bolsa vigente del usuario, o `null` si todavía no solicitó ninguna. */
  findMyActive(): Observable<IFondoCajaChica | null> {
    return this.findMine().pipe(
      map(list => list.find(f => f.status !== 'closed') ?? null)
    );
  }

  findAllByClient(): Observable<IFondoCajaChica[]> {
    return this.http.get<IFondoCajaChica[]>(`${this.url}/client/${this.clientId}`);
  }

  findOne(id: string): Observable<IFondoCajaChica> {
    return this.http.get<IFondoCajaChica>(`${this.url}/${id}`);
  }

  /** Devuelve el sobrante que dejó una bajada de presupuesto. */
  devolverSobrante(
    id: string,
    payload: {
      amount: number;
      receiptUrl: string;
      operationNumber?: string;
      depositDate?: string;
      bankOrigin?: string;
      note?: string;
    }
  ): Observable<IFondoCajaChica> {
    return this.http.patch<IFondoCajaChica>(
      `${this.url}/${id}/devolver-sobrante`,
      payload
    );
  }

  /** Tesorería devuelve al presupuesto lo aprobado en una rendición. */
  reponer(
    id: string,
    payload: { amount: number; expenseReportId?: string; note?: string }
  ): Observable<IFondoCajaChica> {
    return this.http.patch<IFondoCajaChica>(`${this.url}/${id}/reponer`, payload);
  }

  close(id: string): Observable<IFondoCajaChica> {
    return this.http.patch<IFondoCajaChica>(`${this.url}/${id}/close`, {});
  }
}
