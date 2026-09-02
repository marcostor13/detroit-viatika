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
  ordenTrabajoId?: string;
  department?: string;
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
  /** Porcentaje sobre el gasto total del periodo (solo en categorías). */
  pct?: number;
  categoryId?: string;
  projectId?: string;
  ordenTrabajoId?: string;
  userId?: string;
}

/** Un mes con las tres vías por las que sale dinero. */
export interface IMonthlyPoint {
  month: string;
  solicitudes: number;
  directas: number;
  cajaChica: number;
}

export interface IDashboardKpis {
  totalGasto: number;
  gastoCount: number;
  totalGastoPrev: number;
  totalGastoDeltaPct: number;
  anticipoSolicitado: number;
  anticipoSolicitadoCount: number;
  devolucionesPendientesAmount: number;
  devolucionesPendientesCount: number;
  porRendirAmount: number;
  porRendirCount: number;
  porRendirVencidoAmount: number;
  porRendirVencidoCount: number;
}

/** Destino agrupado por departamento. */
export interface ILocationPoint {
  place: string;
  count: number;
  /** Gasto rendido en ese destino. */
  amount: number;
  /** Monto solicitado por adelantado para ese destino. */
  solicitado: number;
  lat?: number;
  lng?: number;
}

/** Fila de los paneles operativos (devoluciones / anticipos sin rendir). */
export interface IPendienteRow {
  reportId: string;
  codigo: string;
  place: string;
  userName: string;
  amount: number;
  dias: number;
  status?: string;
}

export interface IDashboardResponse {
  range: { dateFrom: string; dateTo: string };
  currency: string;
  /** Recorte aplicado por rol: un coordinador solo ve sus centros de costo. */
  scope: { restricted: boolean; projectIds: string[] };
  kpis: IDashboardKpis;
  diasParaRendir: number;
  monthlySeries: IMonthlyPoint[];
  topCategories: INamedAmount[];
  topOrdenesTrabajo: INamedAmount[];
  topProjects: INamedAmount[];
  topCollaborators: INamedAmount[];
  topLocations: ILocationPoint[];
  departments: string[];
  pendientes: {
    devoluciones: IPendienteRow[];
    porRendir: IPendienteRow[];
  };
  reportByStatus: IReportStatus[];
  expenseByType: ITypeAmount[];
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
