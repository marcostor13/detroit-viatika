import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ICategory } from '../modules/invoices/interfaces/category.interface';
import { IPaginatedResult } from '../interfaces/paginated-result.interface';
import { UserStateService } from './user-state.service';

export interface IBulkImportResult {
  created: number;
  errors: { row: number; reason: string }[];
}

@Injectable({ providedIn: 'root' })
export class CategoriaService {
  private readonly baseUrl = `${environment.api}/category`;
  private readonly http = inject(HttpClient);
  private readonly userState = inject(UserStateService);

  private get companyId(): string {
    return this.userState.getUser()?.companyId ?? '';
  }

  getAll(options: { page?: number; limit?: number; search?: string } = {}): Observable<IPaginatedResult<ICategory>> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page.toString());
    if (options.limit) params = params.set('limit', options.limit.toString());
    if (options.search) params = params.set('search', options.search);
    return this.http.get<IPaginatedResult<ICategory>>(`${this.baseUrl}/${this.companyId}`, { params });
  }

  getOne(id: string): Observable<ICategory> {
    return this.http.get<ICategory>(`${this.baseUrl}/${id}/${this.companyId}`);
  }

  getAllFlat(): Observable<ICategory[]> {
    return this.http.get<ICategory[]>(`${this.baseUrl}/${this.companyId}/flat`);
  }

  getAllFlatAdmin(): Observable<ICategory[]> {
    return this.http.get<ICategory[]>(`${this.baseUrl}/${this.companyId}/flat-all`);
  }

  create(dto: {
    name: string;
    description?: string;
    cuenta?: string;
    observaciones?: string;
    limit?: number | null;
    perfilIds?: string[];
  }): Observable<ICategory> {
    return this.http.post<ICategory>(this.baseUrl, {
      ...dto,
      clientId: this.companyId,
    });
  }

  update(id: string, dto: {
    name?: string;
    description?: string;
    cuenta?: string;
    observaciones?: string;
    isActive?: boolean;
    limit?: number | null;
    perfilIds?: string[];
  }): Observable<ICategory> {
    return this.http.patch<ICategory>(`${this.baseUrl}/${id}/${this.companyId}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/${this.companyId}`);
  }

  importFromExcel(file: File): Observable<IBulkImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientId', this.companyId);
    return this.http.post<IBulkImportResult>(`${this.baseUrl}/import`, formData);
  }
}
