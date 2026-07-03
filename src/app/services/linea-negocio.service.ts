import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ILineaNegocio } from '../interfaces/linea-negocio.interface';

/**
 * El httpInterceptor agrega automáticamente el companyId:
 * - GET  -> lo añade como segmento de ruta (/linea-negocio/:clientId).
 * - POST -> lo inyecta en el body.
 * PATCH/DELETE resuelven el clientId desde el JWT en el backend.
 */
@Injectable({ providedIn: 'root' })
export class LineaNegocioService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.api}/linea-negocio`;

  getAll(): Observable<ILineaNegocio[]> {
    return this.http.get<ILineaNegocio[]>(this.apiUrl);
  }

  getById(id: string): Observable<ILineaNegocio> {
    return this.http.get<ILineaNegocio>(`${this.apiUrl}/${id}`);
  }

  create(linea: Partial<ILineaNegocio>): Observable<ILineaNegocio> {
    return this.http.post<ILineaNegocio>(this.apiUrl, linea);
  }

  update(id: string, linea: Partial<ILineaNegocio>): Observable<ILineaNegocio> {
    return this.http.patch<ILineaNegocio>(`${this.apiUrl}/${id}`, linea);
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
