import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SunatValidationInfo {
  expenseId: string;
  status: string;
  sunatValidation: any;
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

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private http = inject(HttpClient);
  private url = `${environment.api}/expense`;

  getExpenses(filters?: any): Observable<any[]> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach((key) => {
        if (
          filters[key] !== undefined &&
          filters[key] !== null &&
          filters[key] !== ''
        ) {
          params = params.set(key, filters[key]);
        }
      });
    }
    return this.http.get<any[]>(`${this.url}`, { params });
  }

  analyzeExpense(expenseData: any): Observable<any> {
    return this.http.post<any>(`${this.url}/analyze-image`, expenseData);
  }

  getSunatValidation(
    id: string,
    companyId: string
  ): Observable<SunatValidationInfo> {
    return this.http.get<SunatValidationInfo>(
      `${this.url}/${id}/${companyId}/sunat-validation`
    );
  }

  updateExpense(id: string, companyId: string, payload: any): Observable<any> {
    return this.http.patch<any>(`${this.url}/${id}/${companyId}`, payload);
  }

  /** Edición del desglose contable (base/IGV/tasa/inafecto) por Contabilidad. */
  updateDesglose(
    id: string,
    payload: {
      baseAfecta?: number;
      igv?: number;
      tasaIgv?: number;
      inafecto?: number;
      detalleAnalitico?: {
        proyectId?: string;
        condicion: 'afecto' | 'inafecto';
        monto: number;
      }[];
    }
  ): Observable<any> {
    return this.http.patch<any>(`${this.url}/invoice/${id}/desglose`, payload);
  }

  deleteExpense(id: string, companyId: string): Observable<any> {
    return this.http.delete<any>(`${this.url}/${id}/${companyId}`);
  }

  getById(id: string): Observable<any> {
    return this.http.get<any>(`${this.url}/invoice/${id}`);
  }

  getMyDirectExpenses(filters: {
    tipo?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number;
  } = {}): Observable<{ data: any[]; total: number; page: number; limit: number; pages: number }> {
    let params = new HttpParams();
    if (filters.tipo) params = params.set('tipo', filters.tipo);
    if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params = params.set('dateTo', filters.dateTo);
    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.limit) params = params.set('limit', String(filters.limit));
    return this.http.get<any>(`${this.url}/my-direct-expenses`, { params });
  }

  submitMyDirectExpenses(motivo?: string): Observable<{ reportId: string; expensesSubmitted: number }> {
    return this.http.post<any>(`${this.url}/my-direct-expenses/submit`, { motivo });
  }
}
