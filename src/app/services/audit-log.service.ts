import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { IPaginatedResult } from '../interfaces/paginated-result.interface';

export interface IAuditLog {
  _id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  entityId?: string;
  details?: string;
  clientId?: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private http = inject(HttpClient);
  private apiUrl = environment.api;

  findAll(opts: { page?: number; limit?: number; module?: string; search?: string } = {}): Observable<IPaginatedResult<IAuditLog>> {
    let params = new HttpParams()
      .set('page', String(opts.page ?? 1))
      .set('limit', String(opts.limit ?? 20));
    if (opts.module) params = params.set('module', opts.module);
    if (opts.search) params = params.set('search', opts.search);
    return this.http.get<IPaginatedResult<IAuditLog>>(`${this.apiUrl}/audit-log`, { params });
  }
}
