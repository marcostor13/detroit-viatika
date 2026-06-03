import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { ExpenseService } from '../../services/expense.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { IExpenseReport } from '../../interfaces/expense-report.interface';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CreateRendicionModalComponent } from '../admin-users/user-details/create-rendicion-modal/create-rendicion-modal.component';
import { AdvanceService } from '../../services/advance.service';
import {
  IAdvance,
  ADVANCE_STATUS_LABELS,
  ADVANCE_STATUS_COLORS,
} from '../../interfaces/advance.interface';

@Component({
  selector: 'app-mis-rendiciones',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CreateRendicionModalComponent],
  templateUrl: './mis-rendiciones.component.html',
  styleUrls: ['./mis-rendiciones.component.scss']
})
export class MisRendicionesComponent implements OnInit {
  private expenseReportsService = inject(ExpenseReportsService);
  private expenseService = inject(ExpenseService);
  private userStateService = inject(UserStateService);
  private advanceService = inject(AdvanceService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  expenseReports: IExpenseReport[] = [];
  myAdvances: IAdvance[] = [];
  isLoading = true;
  showCreateModal = false;
  showGuidelines = signal(false);
  showTypeModal = false;
  isCreatingGasto = signal(false);

  // Tabs
  activeTab = signal<'viaticos' | 'directas'>('viaticos');

  // Tab gastos directos
  directaExpenses = signal<any[]>([]);
  directaTotal = signal(0);
  directaPages = signal(0);
  directaPage = 1;
  directaLoading = signal(false);
  directaLoaded = false;
  directaFilterTipo = '';
  isSubmittingDirectas = signal(false);

  readonly ADVANCE_STATUS_LABELS = ADVANCE_STATUS_LABELS;
  readonly ADVANCE_STATUS_COLORS = ADVANCE_STATUS_COLORS;

  toggleGuidelines() {
    this.showGuidelines.update(v => !v);
  }

  get currentUserId(): string {
    return (this.userStateService.getUser() as any)?._id ?? '';
  }

  get canCreateRendicion(): boolean {
    return this.userStateService.canCreateRendicion();
  }

  ngOnInit(): void {
    this.loadMyReports();
    this.loadMyAdvances();
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'directas') {
      this.setTab('directas');
    } else if (this.canCreateRendicion) {
      this.setTab('directas');
    }
  }

  setTab(tab: 'viaticos' | 'directas'): void {
    this.activeTab.set(tab);
    if (tab === 'directas' && !this.directaLoaded) {
      this.loadDirectaExpenses();
    }
  }

  loadDirectaExpenses(): void {
    this.directaLoading.set(true);
    this.expenseService.getMyDirectExpenses({
      page: this.directaPage,
      limit: 50,
      tipo: this.directaFilterTipo || undefined,
    }).subscribe({
      next: (res) => {
        this.directaExpenses.set(res.data ?? []);
        this.directaTotal.set(res.total ?? 0);
        this.directaPages.set(res.pages ?? 0);
        this.directaLoading.set(false);
        this.directaLoaded = true;
      },
      error: () => {
        this.directaLoading.set(false);
      },
    });
  }

  // Solo rendiciones de viáticos (no directas) para Tab 1
  get viaticosReports(): IExpenseReport[] {
    return this.expenseReports.filter(r => !r.isDirecta);
  }

  get loosePendingCount(): number {
    return this.directaExpenses().filter(e => !e.expenseReportId).length;
  }

  get loosePendingTotal(): number {
    return this.directaExpenses()
      .filter(e => !e.expenseReportId)
      .reduce((sum, e) => sum + (Number(e.total) || 0), 0);
  }

  submitDirectas(): void {
    if (this.loosePendingCount === 0) return;
    this.isSubmittingDirectas.set(true);
    this.expenseService.submitMyDirectExpenses().subscribe({
      next: () => {
        this.isSubmittingDirectas.set(false);
        this.notificationService.show('Documentos enviados a Contabilidad.', 'success');
        this.directaLoaded = false;
        this.loadDirectaExpenses();
        this.loadMyReports();
      },
      error: (err) => {
        this.isSubmittingDirectas.set(false);
        const msg = err?.error?.message ?? 'Error al enviar.';
        this.notificationService.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
      },
    });
  }

  // ─── Helpers columnas tabla gastos directos (alineados con rendicion-detail) ──

  private getData(e: any): Record<string, unknown> {
    const raw = e?.data;
    try {
      if (raw == null) return {};
      if (typeof raw === 'string') return JSON.parse(raw);
      if (typeof raw === 'object') return { ...raw };
    } catch { return {}; }
    return {};
  }

  getDirectaTipoCode(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad') return 'PM';
    if (type === 'comprobante_caja') return 'CC';
    if (type === 'recibo_caja') return 'H';
    if (type === 'otros_gastos') {
      const sub = e?.subTipo ?? this.getData(e)['subTipo'];
      if (sub === 'TK') return 'TK';
      if (sub === 'BV') return 'BV';
      if (sub === 'RC') return 'RC';
      if (sub === 'DJ') return 'DJ';
      if (sub === 'OT') return 'OT';
      return 'SC';
    }
    const d = this.getData(e);
    const tc = String(d['tipoComprobante'] ?? '').trim();
    if (tc === '03') return 'BV';
    if (tc === '12') return 'TK';
    if (tc === '01') return 'FE';
    return 'FT';
  }

  getDirectaTipoBadgeClass(e: any): string {
    const code = this.getDirectaTipoCode(e);
    if (code === 'PM') return 'bg-yellow-100 text-yellow-800';
    if (code === 'CC') return 'bg-purple-100 text-purple-800';
    if (code === 'SC' || code === 'OT') return 'bg-gray-100 text-gray-600';
    if (code === 'DJ') return 'bg-amber-100 text-amber-800';
    if (code === 'TK') return 'bg-teal-100 text-teal-700';
    if (code === 'RC') return 'bg-indigo-100 text-indigo-700';
    return 'bg-blue-100 text-blue-700';
  }

  getDirectaFecha(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad') {
      const rows: any[] = e?.mobilityRows || [];
      if (!rows.length) return '—';
      const dates = rows.map((r: any) => r.fecha).filter(Boolean);
      return dates.length ? ([...dates].sort()[0]) : '—';
    }
    return e.fechaEmision || '—';
  }

  getDirectaDocNumber(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad' || type === 'comprobante_caja') {
      return (typeof e?.internalCode === 'string' && e.internalCode) ? e.internalCode : '-';
    }
    if (type === 'recibo_caja') {
      const d = this.getData(e);
      const payload = d['payload'];
      const p: any = typeof payload === 'string' ? (() => { try { return JSON.parse(payload); } catch { return {}; } })() : (payload ?? {});
      return p['numeroDocumento'] ? String(p['numeroDocumento']) : '-';
    }
    const d = this.getData(e);
    const serie = d['serie'] ? String(d['serie']) : '';
    const corr = d['correlativo'] ? String(d['correlativo']) : '';
    if (serie && corr) return `${serie}-${corr}`;
    return serie || corr || '-';
  }

  getDirectaTipo(e: any): string {
    const m: Record<string, string> = {
      factura: 'Factura', planilla_movilidad: 'Planilla', otros_gastos: 'Otros',
      recibo_caja: 'Recibo', comprobante_caja: 'Comprobante',
    };
    return m[e.expenseType] ?? e.expenseType ?? '—';
  }

  getDirectaConcepto(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad') {
      const rows: any[] = e?.mobilityRows || [];
      const first = rows[0];
      return first?.gestion || `${rows.length} filas`;
    }
    if (type === 'otros_gastos') return e?.description || 'DJ firmada';
    if (type === 'comprobante_caja') {
      try {
        const d = this.getData(e);
        const raw = d['payload'];
        const obj: any = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
        return String(obj['concepto'] || '');
      } catch { return ''; }
    }
    const d = this.getData(e);
    return String(d['concepto'] || e.description || '');
  }

  getDirectaProveedor(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad' || type === 'comprobante_caja' || type === 'otros_gastos') return '-';
    const d = this.getData(e);
    const r = d['razonSocial'];
    if (typeof r === 'string' && r.trim()) return r.trim();
    return e?.provider || '-';
  }

  getDirectaEstado(e: any): { label: string; cls: string } {
    if (!e.expenseReportId) return { label: 'Sin enviar', cls: 'bg-gray-100 text-gray-600' };
    const st = e._reportStatus;
    if (st === 'pending_accounting') return { label: 'En revision', cls: 'bg-yellow-100 text-yellow-700' };
    if (st === 'approved') return { label: 'Aprobado', cls: 'bg-green-100 text-green-700' };
    if (st === 'rejected') return { label: 'Rechazado', cls: 'bg-red-100 text-red-700' };
    if (e.approvalCont?.status === 'approved') return { label: 'Revisado', cls: 'bg-teal-100 text-teal-700' };
    return { label: 'Enviado', cls: 'bg-blue-100 text-blue-700' };
  }

  get directaTotalMonto(): number {
    return this.directaExpenses().reduce((sum, e) => sum + (Number(e.total) || 0), 0);
  }

  goToDirectaReport(e: any): void {
    this.router.navigate(['/mis-rendiciones/gasto', String(e._id)]);
  }

  loadMyAdvances() {
    const user = this.userStateService.getUser() as Record<string, unknown> | null;
    const clientId =
      (user?.['companyId'] as string) ||
      ((user?.['client'] as { _id?: string })?._id ?? '') ||
      ((user?.['clientId'] as { _id?: string })?._id ?? '') ||
      (typeof user?.['clientId'] === 'string' ? (user['clientId'] as string) : '');
    if (!user?.['_id'] || !clientId) return;
    this.advanceService.findMy().subscribe({
      next: (list) => {
        this.myAdvances = list ?? [];
        this.maybeOpenAdvanceFromEmailLink();
      },
      error: () => {
        this.myAdvances = [];
      },
    });
  }

  loadMyReports() {
    this.isLoading = true;
    const user = this.userStateService.getUser() as any;

    if (user && user._id) {
      const clientId = user.companyId || (user.client?._id) || (user.clientId?._id) || user.clientId;

      if (clientId) {
        this.expenseReportsService.findAllByUser(user._id, clientId).subscribe({
          next: (reports) => {
            this.expenseReports = reports;
            this.isLoading = false;
          },
          error: (err) => {
            console.error('Error loading reports', err);
            this.isLoading = false;
          }
        });
      } else {
        console.warn('No clientId found for user');
        this.isLoading = false;
      }
    } else {
      this.isLoading = false;
    }
  }

  openCreateModal() {
    this.showCreateModal = true;
  }

  openAddGasto(): void {
    this.showTypeModal = true;
  }

  closeTypeModal(): void {
    this.showTypeModal = false;
  }

  selectGastoType(tipo: string): void {
    this.showTypeModal = false;
    // Navega directamente al formulario en modo directa — sin crear rendición previa
    this.router.navigate(['/invoices/add'], { queryParams: { tipo, mode: 'directa' } });
  }

  openViaticosModal() {
    this.router.navigate(['/mis-rendiciones/solicitud-viaticos/nueva']);
  }

  openResubmitAdvance(advance: IAdvance) {
    this.router.navigate(['/mis-rendiciones/solicitud-viaticos', advance._id, 'editar']);
  }

  /** Deep link desde correo de rechazo (Fase 3): ?viaticoAdvanceId= */
  private maybeOpenAdvanceFromEmailLink(): void {
    const id =
      this.route.snapshot.queryParamMap.get('viaticoAdvanceId')?.trim();
    if (!id) return;
    const adv = this.myAdvances.find((a) => a._id === id);
    if (adv && (adv.status === 'rejected' || adv.status === 'pending_l1')) {
      void this.router.navigate(['/mis-rendiciones/solicitud-viaticos', adv._id, 'editar']);
    } else {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { viaticoAdvanceId: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  advanceProjectLabel(adv: IAdvance): string {
    const p = adv.projectId;
    if (p && typeof p === 'object' && 'name' in p) {
      const code = (p as { code?: string }).code;
      return code ? `${code} — ${(p as { name: string }).name}` : (p as { name: string }).name;
    }
    return 'Centro de costo';
  }

  advanceDateRange(adv: IAdvance): string {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    if (adv.startDate && adv.endDate) return `${fmt(adv.startDate)} al ${fmt(adv.endDate)}`;
    if (adv.startDate) return fmt(adv.startDate);
    return '';
  }

  getTotalGastado(report: IExpenseReport): number {
    if (!report.expenseIds?.length) return 0;
    return report.expenseIds.reduce((sum: number, e: any) => sum + (parseFloat(e.total) || 0), 0);
  }

  getSaldoLibre(report: IExpenseReport): number {
    return (report.budget ?? 0) - this.getTotalGastado(report);
  }

  advanceStatusText(adv: IAdvance): string {
    if (adv.status === 'paid') return 'En Progreso - Registrando Gastos';
    return this.ADVANCE_STATUS_LABELS[adv.status];
  }

  hasExpenseReportLink(adv: IAdvance): boolean {
    return !!this.getExpenseReportId(adv);
  }

  get pendingAdvances(): IAdvance[] {
    return this.myAdvances.filter(adv => !this.hasExpenseReportLink(adv));
  }

  getExpenseReportId(adv: IAdvance): string | null {
    if (!adv.expenseReportId) return null;
    if (typeof adv.expenseReportId === 'object' && '_id' in adv.expenseReportId) {
      return (adv.expenseReportId as { _id: string })._id;
    }
    if (typeof adv.expenseReportId === 'string' && adv.expenseReportId) {
      return adv.expenseReportId;
    }
    return null;
  }

  navigateToAdvanceReport(adv: IAdvance): void {
    const reportId = this.getExpenseReportId(adv);
    if (reportId) {
      this.router.navigate(['/mis-rendiciones', reportId, 'detalle']);
    }
  }

  onModalClose(success: boolean) {
    this.showCreateModal = false;
    if (success) {
      this.loadMyReports();
    }
  }

  // ─── Cancelar / Eliminar rendición solicitada ────────────────────────────────

  showCancelReportModal = signal(false);
  cancellingReport = signal<IExpenseReport | null>(null);
  isCancellingReport = signal(false);
  cancelReportReason = signal('');

  openCancelReportModal(report: IExpenseReport, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cancellingReport.set(report);
    this.cancelReportReason.set('');
    this.showCancelReportModal.set(true);
  }

  confirmCancelReport(): void {
    const report = this.cancellingReport();
    if (!report) return;
    this.isCancellingReport.set(true);
    this.expenseReportsService
      .cancelRendicion(report._id, this.cancelReportReason().trim() || undefined)
      .subscribe({
        next: () => {
          this.isCancellingReport.set(false);
          this.showCancelReportModal.set(false);
          this.cancellingReport.set(null);
          this.notificationService.show('Rendicion cancelada correctamente', 'success');
          this.loadMyReports();
        },
        error: (err) => {
          this.isCancellingReport.set(false);
          const raw = err?.error?.message;
          const msg = Array.isArray(raw) ? raw.join(', ') : raw;
          this.notificationService.show(msg || 'Error al cancelar', 'error');
        },
      });
  }

  goToReportDetail(report: IExpenseReport, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/mis-rendiciones', report._id, 'detalle']);
  }

  // ─── Cancelar / Eliminar solicitud de viáticos pendiente ─────────────────────

  showCancelAdvanceModal = signal(false);
  cancellingAdvance = signal<IAdvance | null>(null);
  isCancellingAdvance = signal(false);

  openCancelAdvanceModal(adv: IAdvance): void {
    this.cancellingAdvance.set(adv);
    this.showCancelAdvanceModal.set(true);
  }

  confirmCancelAdvance(): void {
    const adv = this.cancellingAdvance();
    if (!adv) return;
    this.isCancellingAdvance.set(true);
    this.advanceService.cancelAdvance(adv._id).subscribe({
      next: () => {
        this.isCancellingAdvance.set(false);
        this.showCancelAdvanceModal.set(false);
        this.cancellingAdvance.set(null);
        this.notificationService.show('Solicitud cancelada correctamente', 'success');
        this.loadMyAdvances();
      },
      error: (err) => {
        this.isCancellingAdvance.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al cancelar', 'error');
      },
    });
  }

  isReportInProgress(report: IExpenseReport): boolean {
    if (report.status !== 'open') return false;
    return this.myAdvances.some(adv => {
      const rid =
        adv.expenseReportId && typeof adv.expenseReportId === 'object'
          ? adv.expenseReportId._id
          : null;
      return rid === report._id && (adv.status === 'paid' || adv.status === 'settled');
    });
  }

  reportDateRange(report: IExpenseReport): string {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    if (report.startDate && report.endDate) return `${fmt(report.startDate)} al ${fmt(report.endDate)}`;
    if (report.startDate) return fmt(report.startDate);
    return '';
  }

  reportDisplayTitle(report: IExpenseReport): string {
    if (report.isDirecta) return report.motivo || report.description || 'Rendicion directa';
    return report.description || report.title || 'Rendicion de viaticos';
  }

  panelStatusText(report: IExpenseReport): string {
    if (this.isReportInProgress(report)) return 'EN PROGRESO - REGISTRANDO GASTOS';
    const map: Partial<Record<IExpenseReport['status'], string>> = {
      solicited: 'SOLICITADA',
      open: 'ABIERTA',
      submitted: 'ENVIADA',
      pending_accounting: 'PENDIENTE CONTABILIDAD',
      approved: 'APROBADA',
      rejected: 'RECHAZADA',
      reimbursed: 'REEMBOLSADO',
      closed: 'CERRADA',
      cancelled: 'CANCELADA',
    };
    return map[report.status] ?? report.status.toUpperCase();
  }
}
