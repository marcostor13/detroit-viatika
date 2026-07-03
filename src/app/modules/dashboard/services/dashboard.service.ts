import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface IDashboardFilters {
  dateFrom?: string;
  dateTo?: string;
  projectId?: string;
  categoryId?: string;
  collaboratorId?: string;
}

export interface IStatusAmount {
  status: string;
  amount: number;
  count: number;
}

export interface IReportStatus {
  status: string;
  count: number;
  budget: number;
}

export interface ITypeAmount {
  type: string;
  amount: number;
  count: number;
}

export interface INamedAmount {
  name: string;
  amount: number;
  count: number;
  categoryId?: string;
  projectId?: string;
  userId?: string;
}

export interface IMonthlyPoint {
  month: string;
  gasto: number;
  anticipo: number;
}

export interface IDashboardKpis {
  totalGasto: number;
  gastoCount: number;
  ticketPromedio: number;
  totalGastoPrev: number;
  totalGastoDeltaPct: number;
  gastoApprovedAmount: number;
  gastoPendingAmount: number;
  gastoPendingCount: number;
  gastoRejectedAmount: number;
  tasaAprobacionGastos: number;
  anticipoSolicitado: number;
  anticipoSolicitadoCount: number;
  anticipoAprobadoAmount: number;
  anticipoPagadoAmount: number;
  anticipoPendienteAprobAmount: number;
  anticipoPendienteAprobCount: number;
  devolucionesPendientesAmount: number;
  devolucionesPendientesCount: number;
  rendicionesTotal: number;
  rendicionesPendientes: number;
  rendicionesAprobadas: number;
}

export interface ILocationPoint {
  place: string;
  count: number;
  amount: number;
  lat?: number;
  lng?: number;
}

export interface IDashboardResponse {
  range: { dateFrom: string; dateTo: string };
  currency: string;
  kpis: IDashboardKpis;
  expenseByStatus: IStatusAmount[];
  expenseByType: ITypeAmount[];
  advanceByStatus: IStatusAmount[];
  reportByStatus: IReportStatus[];
  topCategories: INamedAmount[];
  topProjects: INamedAmount[];
  topCollaborators: INamedAmount[];
  topLocations: ILocationPoint[];
  monthlySeries: IMonthlyPoint[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private url = `${environment.api}/dashboard`;
  private http = inject(HttpClient);

  getDashboard(filters?: IDashboardFilters): Observable<IDashboardResponse> {
    let params = new HttpParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params = params.set(key, value as string);
        }
      });
    }
    return this.http.get<IDashboardResponse>(this.url, { params });
  }
}
