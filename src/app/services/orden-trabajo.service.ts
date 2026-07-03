import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { IOrdenTrabajo } from '../interfaces/orden-trabajo.interface';
import { IPaginatedResult } from '../interfaces/paginated-result.interface';

/**
 * El httpInterceptor agrega automáticamente el companyId:
 * - GET  -> lo añade como segmento de ruta (/orden-trabajo/:clientId).
 * - POST -> lo inyecta en el body.
 * PATCH/DELETE resuelven el clientId desde el JWT en el backend.
 */
@Injectable({ providedIn: 'root' })
export class OrdenTrabajoService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.api}/orden-trabajo`;

  getAllPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    departamento?: string;
  }): Observable<IPaginatedResult<IOrdenTrabajo>> {
    let params = new HttpParams();
    if (opts?.page) params = params.set('page', opts.page);
    if (opts?.limit) params = params.set('limit', opts.limit);
    if (opts?.search) params = params.set('search', opts.search);
    if (opts?.departamento) params = params.set('departamento', opts.departamento);
    return this.http.get<IPaginatedResult<IOrdenTrabajo>>(this.apiUrl, { params });
  }

  /** Lista sin paginar (todas las OT de la empresa), para selectores. */
  getAll(): Observable<IOrdenTrabajo[]> {
    return this.http.get<IOrdenTrabajo[]>(this.apiUrl);
  }

  getById(id: string): Observable<IOrdenTrabajo> {
    return this.http.get<IOrdenTrabajo>(`${this.apiUrl}/${id}`);
  }

  create(orden: { departamento: string; descripcion?: string; isActive?: boolean }): Observable<IOrdenTrabajo> {
    return this.http.post<IOrdenTrabajo>(this.apiUrl, orden);
  }

  update(id: string, orden: { descripcion?: string; isActive?: boolean }): Observable<IOrdenTrabajo> {
    return this.http.patch<IOrdenTrabajo>(`${this.apiUrl}/${id}`, orden);
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
