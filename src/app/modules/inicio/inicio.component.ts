import { Component, inject, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { UserStateService } from '../../services/user-state.service';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { AdvanceService } from '../../services/advance.service';
import { IExpenseReport } from '../../interfaces/expense-report.interface';
import { IAdvance, ADVANCE_STATUS_LABELS, ADVANCE_STATUS_COLORS } from '../../interfaces/advance.interface';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './inicio.component.html',
})
export class InicioComponent implements OnInit {
  private userState = inject(UserStateService);
  private expenseReportsService = inject(ExpenseReportsService);
  private advanceService = inject(AdvanceService);
  private router = inject(Router);

  isLoading = signal(true);
  reports = signal<IExpenseReport[]>([]);
  advances = signal<IAdvance[]>([]);

  readonly STATUS_LABELS = ADVANCE_STATUS_LABELS;
  readonly STATUS_COLORS = ADVANCE_STATUS_COLORS;

  readonly REPORT_STATUS_LABELS: Record<string, string> = {
    solicited: 'Solicitada',
    open: 'Abierta',
    submitted: 'Enviada',
    pending_accounting: 'Pendiente contabilidad',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    reimbursed: 'Reembolsado',
    closed: 'Cerrada',
    cancelled: 'Cancelada',
  };

  readonly REPORT_STATUS_COLORS: Record<string, string> = {
    solicited: 'bg-purple-100 text-purple-700',
    open: 'bg-blue-100 text-blue-700',
    submitted: 'bg-yellow-100 text-yellow-700',
    pending_accounting: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    reimbursed: 'bg-teal-100 text-teal-700',
    closed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-orange-100 text-orange-700',
  };

  // ── KPIs ─────────────────────────────────────────────────────────
  kpiRendicionesActivas = computed(() =>
    this.reports().filter((r) => r.status === 'open' || r.status === 'submitted').length
  );

  kpiPresupuestoTotal = computed(() =>
    this.reports().reduce((sum, r) => sum + (r.budget || 0), 0)
  );

  kpiGastado = computed(() =>
    this.reports().reduce((sum, r) => {
      const total = r.expenseIds?.reduce((s: number, e: any) => s + (e.total || 0), 0) || 0;
      return sum + total;
    }, 0)
  );

  kpiComprobantes = computed(() =>
    this.reports().reduce((sum, r) => sum + (r.expenseIds?.length || 0), 0)
  );

  kpiAnticiposPendientes = computed(() =>
    this.advances().filter((a) => a.status === 'pending_l1' || a.status === 'pending_l2').length
  );

  paidAdvances = computed(() =>
    this.advances()
      .filter((a) => a.status === 'paid')
      .filter((a) => {
        const reportId = this.getAdvanceReportId(a);
        if (!reportId) return true;
        const report = this.reports().find((r) => r._id === reportId);
        return !report || report.status === 'open';
      })
  );

  kpiAnticiposMonto = computed(() =>
    this.advances()
      .filter((a) => ['approved', 'paid', 'settled'].includes(a.status))
      .reduce((sum, a) => sum + a.amount, 0)
  );

  // ── Recientes ────────────────────────────────────────────────────
  recentReports = computed(() =>
    [...this.reports()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3)
  );

  recentAdvances = computed(() =>
    [...this.advances()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3)
  );

  // ── Greeting ─────────────────────────────────────────────────────
  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  get userName(): string {
    return this.userState.getUser()?.name?.split(' ')[0] || 'colaborador';
  }

  ngOnInit() {
    const user = this.userState.getUser() as any;
    const userId = user?._id;
    const clientId = user?.companyId || user?.clientId;

    if (!userId || !clientId) {
      this.isLoading.set(false);
      return;
    }

    forkJoin({
      reports: this.expenseReportsService.findAllByUser(userId, clientId),
      advances: this.advanceService.findMy(),
    }).subscribe({
      next: ({ reports, advances }) => {
        this.reports.set(reports);
        this.advances.set(advances);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  goToRendicion(id: string) {
    this.router.navigate(['/mis-rendiciones', id, 'detalle']);
  }

  getReportStatusLabel(status: string): string {
    return this.REPORT_STATUS_LABELS[status] || status;
  }

  getReportStatusColor(status: string): string {
    return this.REPORT_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';
  }

  getAdvanceReportTitle(advance: IAdvance): string {
    if (typeof advance.expenseReportId === 'object' && advance.expenseReportId) {
      return advance.expenseReportId.title;
    }
    return '—';
  }

  getAdvanceReportId(advance: IAdvance): string | null {
    if (!advance.expenseReportId) return null;
    if (typeof advance.expenseReportId === 'object') {
      return advance.expenseReportId._id;
    }
    return advance.expenseReportId;
  }

  navigateToExpenseReport(advance: IAdvance) {
    const reportId = this.getAdvanceReportId(advance);
    if (reportId) {
      this.router.navigate(['/mis-rendiciones', reportId, 'detalle']);
    } else {
      this.router.navigate(['/mis-rendiciones']);
    }
  }

  get saldoLibreTotal(): number {
    return this.kpiPresupuestoTotal() - this.kpiGastado();
  }

  get porcentajeEjecutado(): number {
    const total = this.kpiPresupuestoTotal();
    if (!total) return 0;
    return Math.min(100, Math.round((this.kpiGastado() / total) * 100));
  }
}
