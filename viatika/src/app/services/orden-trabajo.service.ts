import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { IOrdenTrabajo } from '../interfaces/orden-trabajo.interface';
import { IPaginatedResult } from '../interfaces/paginated-result.interface';
import { UserStateService } from './user-state.service';

/** Qué le pasa a una fila del Excel. Es lo que se revisa antes de aceptar la carga. */
export interface IBulkImportRow {
  row: number;
  nombre: string;
  accion: 'crear' | 'actualizar' | 'sin-cambios' | 'error';
  /** Con qué queda la OT (al crear) o qué le cambia (al actualizar). */
  detalle?: string;
  reason?: string;
}

export interface IBulkImportResult {
  created: number;
  /** OT que ya existían (mismo nombre) y se actualizaron con lo del archivo. */
  updated: number;
  /** OT que ya existían y a las que el archivo no les cambia nada. */
  unchanged: number;
  errors: { row: number; reason: string }[];
  rows: IBulkImportRow[];
  /** true = fue una previsualización: no se escribió nada. */
  dryRun: boolean;
}

/**
 * El httpInterceptor agrega automáticamente el companyId:
 * - GET  -> lo añade como segmento de ruta (/orden-trabajo/:clientId).
 * - POST -> lo inyecta en el body.
 * PATCH/DELETE resuelven el clientId desde el JWT en el backend.
 */
@Injectable({ providedIn: 'root' })
export class OrdenTrabajoService {
  private http = inject(HttpClient);
  private userState = inject(UserStateService);
  private apiUrl = `${environment.api}/orden-trabajo`;

  getAllPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    costCenterId?: string;
  }): Observable<IPaginatedResult<IOrdenTrabajo>> {
    let params = new HttpParams();
    if (opts?.page) params = params.set('page', opts.page);
    if (opts?.limit) params = params.set('limit', opts.limit);
    if (opts?.search) params = params.set('search', opts.search);
    if (opts?.costCenterId) params = params.set('costCenterId', opts.costCenterId);
    return this.http.get<IPaginatedResult<IOrdenTrabajo>>(this.apiUrl, { params });
  }

  /** Lista sin paginar (todas las OT de la empresa), para selectores. */
  getAll(): Observable<IOrdenTrabajo[]> {
    return this.http.get<IOrdenTrabajo[]>(this.apiUrl);
  }

  getById(id: string): Observable<IOrdenTrabajo> {
    return this.http.get<IOrdenTrabajo>(`${this.apiUrl}/${id}`);
  }

  /** `costCenterIds` va ordenado: el primero queda como centro de costo principal. */
  create(orden: { nombre: string; costCenterIds: string[]; isActive?: boolean }): Observable<IOrdenTrabajo> {
    return this.http.post<IOrdenTrabajo>(this.apiUrl, orden);
  }

  update(id: string, orden: { nombre?: string; costCenterIds?: string[]; isActive?: boolean }): Observable<IOrdenTrabajo> {
    return this.http.patch<IOrdenTrabajo>(`${this.apiUrl}/${id}`, orden);
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  /**
   * Sube el Excel de OT. Con `dryRun` el backend no escribe nada y devuelve el
   * plan (qué se crea, qué se modifica, qué falla) para revisarlo antes de
   * aceptar la carga.
   */
  importFromExcel(
    file: File,
    opts: { dryRun?: boolean } = {}
  ): Observable<IBulkImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientId', this.userState.getUser()?.companyId || '');
    if (opts.dryRun) formData.append('dryRun', 'true');
    return this.http.post<IBulkImportResult>(`${this.apiUrl}/import`, formData);
  }
}
