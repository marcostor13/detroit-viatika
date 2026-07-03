import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ICajaChicaReport } from '../interfaces/caja-chica-report.interface';

@Injectable({ providedIn: 'root' })
export class CajaChicaReportService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.api}/caja-chica-report`;

  create(payload: { title: string }): Observable<ICajaChicaReport> {
    return this.http.post<ICajaChicaReport>(this.apiUrl, payload);
  }

  findAll(): Observable<ICajaChicaReport[]> {
    return this.http.get<ICajaChicaReport[]>(this.apiUrl);
  }

  findOne(id: string): Observable<ICajaChicaReport> {
    return this.http.get<ICajaChicaReport>(`${this.apiUrl}/${id}`);
  }

  addReports(id: string, reportIds: string[]): Observable<ICajaChicaReport> {
    return this.http.patch<ICajaChicaReport>(`${this.apiUrl}/${id}/add-reports`, { reportIds });
  }

  removeReport(id: string, expenseReportId: string): Observable<ICajaChicaReport> {
    return this.http.patch<ICajaChicaReport>(`${this.apiUrl}/${id}/remove-report`, { expenseReportId });
  }

  finalize(id: string): Observable<ICajaChicaReport> {
    return this.http.patch<ICajaChicaReport>(`${this.apiUrl}/${id}/finalize`, {});
  }
}
