import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { ExpenseService } from '../../services/expense.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import {
  IExpenseReport,
  VIATICO_REPORT_STATUS_LABELS,
  VIATICO_REPORT_STATUS_COLORS,
} from '../../interfaces/expense-report.interface';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CajaChicaReportService } from '../../services/caja-chica-report.service';
import { CreateRendicionModalComponent } from '../admin-users/user-details/create-rendicion-modal/create-rendicion-modal.component';
import { DataTableComponent } from '../../design-system/data-table/data-table.component';
import { ColumnDirective } from '../../design-system/data-table/column.directive';
import { ModalComponent } from '../../design-system/modal/modal.component';
import { ButtonComponent } from '../../design-system/button/button.component';
import { IconComponent } from '../../design-system/icon/icon.component';
import { EmptyStateComponent } from '../../design-system/empty-state/empty-state.component';
import { AdvanceService } from '../../services/advance.service';
import {
  IAdvance,
  ADVANCE_STATUS_LABELS,
  ADVANCE_STATUS_COLORS,
} from '../../interfaces/advance.interface';

type UnifiedViaticoItem = {
  _id: string;
  source: 'new' | 'advance' | 'rendicion';
  createdAt: string;
  statusLabel: string;
  statusColor: string;
  projectLabel: string;
  place: string;
  dateRange: string;
  amount: number;
  expensesCount: number;
  canEdit: boolean;
  canResubmit: boolean;
  isInExpensePhase: boolean;
  rawStatus: string;
  raw: IExpenseReport | IAdvance;
};

@Component({
  selector: 'app-mis-rendiciones',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CreateRendicionModalComponent, DataTableComponent, ColumnDirective, ModalComponent, ButtonComponent, IconComponent, EmptyStateComponent],
  templateUrl: './mis-rendiciones.component.html',
  styleUrls: ['./mis-rendiciones.component.scss']
})
export class MisRendicionesComponent implements OnInit {
  private expenseReportsService = inject(ExpenseReportsService);
  private expenseService = inject(ExpenseService);
  private userStateService = inject(UserStateService);
  private advanceService = inject(AdvanceService);
  private notificationService = inject(NotificationService);
  private cajaChicaReportService = inject(CajaChicaReportService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  expenseReports: IExpenseReport[] = [];
  myAdvances: IAdvance[] = [];
  myViaticoReports = signal<IExpenseReport[]>([]);
  viaticoReportsLoading = signal(false);
  isLoading = true;
  showCreateModal = false;
  showGuidelines = signal(false);
  showTypeModal = false;
  isCreatingGasto = signal(false);

  readonly VIATICO_REPORT_STATUS_LABELS = VIATICO_REPORT_STATUS_LABELS;
  readonly VIATICO_REPORT_STATUS_COLORS = VIATICO_REPORT_STATUS_COLORS;

  // Tabs
  activeTab = signal<'viaticos' | 'directas' | 'caja-chica'>('viaticos');

  // Tab caja chica
  cajaChicaReports = signal<IExpenseReport[]>([]);
  cajaChicaLoading = signal(false);
  cajaChicaLoaded = false;

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

  // ─── Filtros por tab ───────────────────────────────────────────────────────
  viaticosTypeFilter = signal<'solicitudes' | 'rendiciones' | ''>('');
  advancesStatusFilter = signal('');
  viaticosStatusFilter = signal('');
  viaticosDateFrom = signal('');
  viaticosDateTo = signal('');

  directasStatusFilter = signal('');
  directasDateFrom = signal('');
  directasDateTo = signal('');

  cajaDateFrom = signal('');
  cajaDateTo = signal('');

  toggleGuidelines() {
    this.showGuidelines.update(v => !v);
  }

  get currentUserId(): string {
    return (this.userStateService.getUser() as any)?._id ?? '';
  }

  get canCreateRendicion(): boolean {
    return this.userStateService.canCreateRendicion();
  }

  get canViewViaticos(): boolean {
    return this.userStateService.isColaborador() || this.userStateService.hasModulePermission('mis-rendiciones');
  }

  ngOnInit(): void {
    this.loadMyReports();
    this.loadMyAdvances();
    this.loadMyViaticoReports();
    // Tabs disponibles según permisos, en orden de preferencia.
    const available: Array<'viaticos' | 'directas' | 'caja-chica'> = [];
    if (this.canViewViaticos) available.push('viaticos');
    if (this.canCreateRendicion) available.push('directas');
    if (this.canAccessCajaChica) available.push('caja-chica');

    // Respeta el ?tab= solo si el usuario tiene acceso a ese tab; si no, usa el primero disponible.
    const requested = this.route.snapshot.queryParamMap.get('tab') as
      | 'viaticos'
      | 'directas'
      | 'caja-chica'
      | null;
    const initial =
      requested && available.includes(requested) ? requested : available[0] ?? 'viaticos';
    this.setTab(initial);
  }

  setTab(tab: 'viaticos' | 'directas' | 'caja-chica'): void {
    this.activeTab.set(tab);
    if (tab === 'caja-chica' && !this.cajaChicaLoaded) {
      this.loadCajaChicaReports();
    }
  }

  get canAccessCajaChica(): boolean {
    return this.userStateService.canAccessCajaChica() && this.userStateService.isColaborador();
  }

  loadCajaChicaReports(): void {
    this.cajaChicaLoading.set(true);
    this.expenseReportsService.getMyCajaChica().subscribe({
      next: (reports) => {
        this.cajaChicaReports.set(reports as IExpenseReport[]);
        this.cajaChicaLoading.set(false);
        this.cajaChicaLoaded = true;
      },
      error: () => { this.cajaChicaLoading.set(false); },
    });
  }

  navigateToNuevaCajaChica(): void {
    this.router.navigate(['/mis-rendiciones/nueva-caja-chica']);
  }

  cajaChicaTotalExpenses(report: any): number {
    if (!Array.isArray(report?.expenseIds)) return 0;
    return report.expenseIds.reduce((s: number, e: any) => s + (Number(e?.total) || 0), 0);
  }

  /** Rendiciones directas del colaborador (creadas primero, luego se agregan gastos). */
  get directaReports(): IExpenseReport[] {
    return this.expenseReports
      .filter((r) => r.isDirecta)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /** Crea primero la rendición directa; los gastos se agregan luego en el detalle. */
  openNuevaRendicionDirecta(): void {
    this.router.navigate(['/mis-rendiciones/nueva']);
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
    if (type === 'planilla_movilidad') {
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
      recibo_caja: 'Recibo',
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
    const d = this.getData(e);
    return String(d['concepto'] || e.description || '');
  }

  getDirectaProveedor(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad' || type === 'otros_gastos') return '-';
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

  loadMyViaticoReports(): void {
    this.viaticoReportsLoading.set(true);
    this.expenseReportsService.getMyViaticos().subscribe({
      next: (list) => {
        this.myViaticoReports.set(list ?? []);
        this.viaticoReportsLoading.set(false);
      },
      error: () => {
        this.viaticoReportsLoading.set(false);
      },
    });
  }

  // ─── Viático unificado helpers ─────────────────────────────────────────────

  viaticoPhaseLabel(report: IExpenseReport): string {
    return this.VIATICO_REPORT_STATUS_LABELS[report.status as keyof typeof VIATICO_REPORT_STATUS_LABELS]
      ?? report.status.toUpperCase();
  }

  viaticoPhaseColor(report: IExpenseReport): string {
    return this.VIATICO_REPORT_STATUS_COLORS[report.status as keyof typeof VIATICO_REPORT_STATUS_COLORS]
      ?? 'bg-gray-100 text-gray-600';
  }

  viaticoProjectLabel(report: IExpenseReport): string {
    const p = (report as any).projectId;
    if (p && typeof p === 'object' && 'name' in p) {
      return p.code ? `${p.code} — ${p.name}` : p.name;
    }
    return '—';
  }

  viaticoDates(report: IExpenseReport): string {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
    const start = report.viaticoStartDate;
    const end = report.viaticoEndDate;
    if (start && end) return `${fmt(start)} al ${fmt(end)}`;
    if (start) return fmt(start);
    return '—';
  }

  isViaticoInExpensePhase(report: IExpenseReport): boolean {
    return report.status === 'open';
  }

  canEditViatico(report: IExpenseReport): boolean {
    return report.status === 'pending_l1';
  }

  canResubmitViatico(report: IExpenseReport): boolean {
    return report.status === 'rejected';
  }

  navigateToViaticoDetail(report: IExpenseReport, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.router.navigate(['/mis-rendiciones', report._id, 'detalle'], {
      queryParams: { tab: 'viaticos' },
    });
  }

  openEditViatico(report: IExpenseReport): void {
    this.router.navigate(['/mis-rendiciones/solicitud-viaticos', report._id, 'editar']);
  }

  get filteredMyViaticoReports(): IExpenseReport[] {
    let list = [...this.myViaticoReports()];
    const status = this.viaticosStatusFilter();
    const from = this.viaticosDateFrom();
    const to = this.viaticosDateTo();
    if (status) list = list.filter(r => r.status === status);
    if (from) list = list.filter(r => new Date(r.createdAt) >= new Date(from));
    if (to) list = list.filter(r => new Date(r.createdAt) <= new Date(to + 'T23:59:59'));
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  loadMyReports() {
    this.isLoading = true;
    const user = this.userStateService.getUser() as any;

    if (user && user._id) {
      const clientId = user.companyId || (user.client?._id) || (user.clientId?._id) || user.clientId;

      if (clientId) {
        // "Mis Rendiciones" siempre muestra SOLO las rendiciones propias del usuario,
        // sin importar el rol. El coordinador revisa las de su equipo en el módulo
        // "Rendiciones" (vista admin), no aquí, para evitar duplicidad/confusión.
        const obs = this.expenseReportsService.findAllByUser(user._id, clientId);
        obs.subscribe({
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

  hasReportSaldo(report: IExpenseReport): boolean {
    return !!(report.directaDeposit);
  }

  getReportSaldo(report: IExpenseReport): number {
    return this.getSaldoLibre(report);
  }

  advanceStatusText(adv: IAdvance): string {
    if (adv.status === 'paid' || adv.status === 'partially_paid') return 'En Progreso - Registrando Gastos';
    return this.ADVANCE_STATUS_LABELS[adv.status];
  }

  hasExpenseReportLink(adv: IAdvance): boolean {
    return !!this.getExpenseReportId(adv);
  }

  /** El viático ya tiene pago (parcial o total) → el colaborador puede registrar gastos. */
  isAdvancePaidOrPartial(adv: IAdvance): boolean {
    return adv.status === 'paid' || adv.status === 'partially_paid';
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
    this.router.navigate(['/mis-rendiciones', report._id, 'detalle'], {
      queryParams: { tab: this.activeTab() },
    });
  }

  // ─── Eliminar (borrado físico) rendición ─────────────────────────────────────

  showDeleteReportModal = signal(false);
  deletingReport = signal<IExpenseReport | null>(null);
  isDeletingReport = signal(false);

  /**
   * El colaborador puede eliminar su solicitud mientras no tenga ninguna
   * aprobación (a nivel reporte). Una vez aprobada, el backend solo permite a
   * Contabilidad eliminarla.
   */
  canDeleteReport(report: IExpenseReport): boolean {
    // Espeja la validación del backend (remove): no debe haber aprobación ni a
    // nivel reporte ni en ningún comprobante. De lo contrario solo Contabilidad
    // puede eliminar, así que el botón no debe aparecer para el colaborador.
    const noReportApproval =
      !report.coordinatorApprovedBy && !report.contabilidadApprovedBy;
    const noExpenseApproval = !report.hasApprovedExpense;
    if (!noReportApproval || !noExpenseApproval) return false;

    // Rendición directa creada por Contabilidad para el colaborador: no la puede
    // eliminar (solo Contabilidad).
    if (report.isDirecta && report.createdByOther) return false;

    // Rendición directa con saldo heredado de otra: el dueño puede eliminarla
    // MIENTRAS no haya subido ningún gasto (el borrado devuelve el saldo a la
    // bolsa y libera la rendición de origen). Con gastos ya cargados, solo
    // Contabilidad. Espeja la validación del backend (remove).
    if (report.isDirecta && report.inheritedBalance && (report.expenseIds?.length ?? 0) > 0)
      return false;

    // Caja chica ya jalada por Contabilidad (borrador o finalizado): no la puede
    // eliminar (solo Contabilidad).
    if (report.isCajaChica && (report.referencedByCajaChica || report.lockedByCajaChica))
      return false;

    // Rendición de viáticos cuyo anticipo ya fue aprobado/pagado: no la puede
    // eliminar (solo Contabilidad). Estas rendiciones nacen del pago del anticipo.
    if (!report.isDirecta && !report.isCajaChica && report.hasApprovedLinkedAdvance)
      return false;

    // Viático unificado con pago ya desembolsado (estado "Registrando gastos"): el
    // pago consta en viaticoPaidAmount, no en un Advance, pero igualmente bloquea.
    // OJO: un viático aún pendiente de aprobación puede tener viaticoPaidAmount > 0
    // solo porque la bolsa de saldos lo prefinanció; ese caso SÍ es eliminable (al
    // borrarlo se devuelve el saldo), así que no lo bloqueamos.
    const viaticoPendienteAprobacion = ['pending_l1', 'pending_l2'].includes(report.status);
    if (
      (report as any).type === 'viatico' &&
      Number((report as any).viaticoPaidAmount ?? 0) > 0 &&
      !viaticoPendienteAprobacion
    )
      return false;

    const deletableStatuses = ['solicited', 'open', 'rejected', 'submitted'];
    if (deletableStatuses.includes(report.status)) return true;

    // Viático en solicitud sin comprobantes: el colaborador puede eliminarlo.
    if (report.status === 'pending_l1' && !(report.expenseIds?.length)) return true;

    return false;
  }

  openDeleteReportModal(report: IExpenseReport, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.deletingReport.set(report);
    this.showDeleteReportModal.set(true);
  }

  confirmDeleteReport(): void {
    const report = this.deletingReport();
    if (!report) return;
    this.isDeletingReport.set(true);
    this.expenseReportsService.delete(report._id).subscribe({
      next: () => {
        this.isDeletingReport.set(false);
        this.showDeleteReportModal.set(false);
        this.deletingReport.set(null);
        this.notificationService.show('Solicitud eliminada correctamente', 'success');
        // Cada pestaña se alimenta de señales/listas distintas; refrescamos las
        // fuentes de la pestaña activa. La de viáticos combina los viáticos nuevos
        // (myViaticoReports), los anticipos legados (myAdvances) y las rendiciones
        // legadas (expenseReports), así que hay que recargar las tres.
        if (this.activeTab() === 'caja-chica') {
          this.loadCajaChicaReports();
        } else if (this.activeTab() === 'viaticos') {
          this.loadMyViaticoReports();
          this.loadMyAdvances();
          this.loadMyReports();
        } else {
          this.loadMyReports();
        }
      },
      error: (err) => {
        this.isDeletingReport.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al eliminar', 'error');
      },
    });
  }

  // ─── Eliminar (borrado físico) solicitud de viáticos ─────────────────────────

  showDeleteAdvanceModal = signal(false);
  deletingAdvance = signal<IAdvance | null>(null);
  isDeletingAdvance = signal(false);

  /**
   * El colaborador puede eliminar su solicitud de viáticos mientras no tenga
   * ninguna aprobación. Una vez aprobada, el backend solo permite a Contabilidad.
   */
  canDeleteAdvance(adv: IAdvance): boolean {
    const hasApproval = (adv.approvalHistory ?? []).some(
      (e) => e.action === 'approved'
    );
    const deletableStatuses = ['pending_l1', 'rejected'];
    return !hasApproval && deletableStatuses.includes(adv.status);
  }

  openDeleteAdvanceModal(adv: IAdvance): void {
    this.deletingAdvance.set(adv);
    this.showDeleteAdvanceModal.set(true);
  }

  confirmDeleteAdvance(): void {
    const adv = this.deletingAdvance();
    if (!adv) return;
    this.isDeletingAdvance.set(true);
    this.advanceService.delete(adv._id).subscribe({
      next: () => {
        this.isDeletingAdvance.set(false);
        this.showDeleteAdvanceModal.set(false);
        this.deletingAdvance.set(null);
        this.notificationService.show('Solicitud eliminada correctamente', 'success');
        this.loadMyAdvances();
      },
      error: (err) => {
        this.isDeletingAdvance.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al eliminar', 'error');
      },
    });
  }

  // ─── Filtered + sorted lists ──────────────────────────────────────────────

  get filteredPendingAdvances(): IAdvance[] {
    let list = this.myAdvances.filter(adv => !this.hasExpenseReportLink(adv));
    const status = this.advancesStatusFilter();
    const from = this.viaticosDateFrom();
    const to = this.viaticosDateTo();
    if (status) list = list.filter(a => a.status === status);
    if (from) list = list.filter(a => new Date(a.createdAt) >= new Date(from));
    if (to) list = list.filter(a => new Date(a.createdAt) <= new Date(to + 'T23:59:59'));
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  get filteredViaticosReports(): IExpenseReport[] {
    // Legacy rendiciones de viáticos (linked to old Advance records, not new unified type='viatico')
    let reports = this.expenseReports.filter(r => !r.isDirecta && r.type !== 'viatico');
    const status = this.viaticosStatusFilter();
    const from = this.viaticosDateFrom();
    const to = this.viaticosDateTo();
    if (status) reports = reports.filter(r => r.status === status);
    if (from) reports = reports.filter(r => new Date(r.createdAt) >= new Date(from));
    if (to) reports = reports.filter(r => new Date(r.createdAt) <= new Date(to + 'T23:59:59'));
    return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  get viaticoTabBadgeCount(): number {
    return this.myViaticoReports().length
      + this.myAdvances.filter(a => !this.hasExpenseReportLink(a)).length
      + this.expenseReports.filter(r => !r.isDirecta && r.type !== 'viatico').length;
  }

  // ─── Helpers for legacy rendiciones in unified list ───────────────────────

  /**
   * Una rendición se considera cerrada (a efectos del label) cuando su saldo
   * pendiente ya fue resuelto: trasladado a otra solicitud o devuelto con
   * comprobante. Mismo criterio que el detalle (`isEffectivelyClosed`).
   */
  isReportEffectivelyClosed(report: IExpenseReport): boolean {
    return report.status === 'closed'
      || !!(report as any).returnVoucher;
  }

  getLegacyReportLabel(report: IExpenseReport): string {
    if (this.isReportInProgress(report)) return 'Registrando gastos';
    if (this.isReportEffectivelyClosed(report)) return 'Cerrada';
    const map: Partial<Record<string, string>> = {
      solicited: 'Solicitada', open: 'Abierta', submitted: 'Enviada',
      pending_l1: 'En solicitud',
      pending_accounting: 'En contabilidad', approved: 'Aprobada',
      rejected: 'Rechazada', reimbursed: 'Reembolsada',
      closed: 'Cerrada', cancelled: 'Cancelada',
    };
    return map[report.status] ?? report.status;
  }

  getLegacyReportColor(report: IExpenseReport): string {
    if (this.isReportInProgress(report)) return 'bg-emerald-100 text-emerald-700';
    if (this.isReportEffectivelyClosed(report)) return 'bg-gray-100 text-gray-500';
    const map: Partial<Record<string, string>> = {
      solicited: 'bg-purple-100 text-purple-700', open: 'bg-green-100 text-green-700',
      submitted: 'bg-yellow-100 text-yellow-700', pending_l1: 'bg-yellow-100 text-yellow-700',
      pending_accounting: 'bg-violet-100 text-violet-700',
      approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
      reimbursed: 'bg-teal-100 text-teal-700', closed: 'bg-gray-100 text-gray-500',
      cancelled: 'bg-gray-100 text-gray-500',
    };
    return map[report.status] ?? 'bg-gray-100 text-gray-600';
  }

  // ─── Unified viático list (merges new viaticos + old advances + old rendiciones) ───

  get unifiedViaticoList(): UnifiedViaticoItem[] {
    const items: UnifiedViaticoItem[] = [];

    // 1. New type='viatico' ExpenseReports
    for (const r of this.myViaticoReports()) {
      items.push({
        _id: r._id,
        source: 'new',
        createdAt: r.createdAt,
        statusLabel: this.viaticoPhaseLabel(r),
        statusColor: this.viaticoPhaseColor(r),
        projectLabel: this.viaticoProjectLabel(r),
        place: r.viaticoPlace ?? '—',
        dateRange: this.viaticoDates(r),
        amount: r.viaticoAmount ?? 0,
        expensesCount: (r.expenseIds || []).length,
        canEdit: this.canEditViatico(r),
        canResubmit: this.canResubmitViatico(r),
        isInExpensePhase: this.isViaticoInExpensePhase(r),
        rawStatus: r.status,
        raw: r,
      });
    }

    // 2. Old Advances without a linked ExpenseReport
    for (const adv of this.myAdvances.filter(a => !this.hasExpenseReportLink(a))) {
      items.push({
        _id: adv._id,
        source: 'advance',
        createdAt: adv.createdAt,
        statusLabel: this.ADVANCE_STATUS_LABELS[adv.status] ?? adv.status,
        statusColor: this.ADVANCE_STATUS_COLORS[adv.status] ?? 'bg-gray-100 text-gray-600',
        projectLabel: this.advanceProjectLabel(adv),
        place: adv.place ?? '—',
        dateRange: this.advanceDateRange(adv),
        amount: adv.amount,
        expensesCount: 0,
        canEdit: adv.status === 'pending_l1',
        canResubmit: adv.status === 'rejected',
        isInExpensePhase: false,
        rawStatus: adv.status,
        raw: adv,
      });
    }

    // 3. Old linked ExpenseReports (not directa, not type='viatico')
    for (const r of this.expenseReports.filter(r => !r.isDirecta && r.type !== 'viatico')) {
      items.push({
        _id: r._id,
        source: 'rendicion',
        createdAt: r.createdAt,
        statusLabel: this.getLegacyReportLabel(r),
        statusColor: this.getLegacyReportColor(r),
        // Las rendiciones legacy también tienen projectId; se resuelve igual que
        // en los viáticos (requiere que el backend lo popule en findAllByUser).
        projectLabel: this.viaticoProjectLabel(r),
        place: r.location ?? '—',
        dateRange: this.reportDateRange(r),
        amount: r.budget,
        expensesCount: (r.expenseIds || []).length,
        canEdit: false,
        canResubmit: false,
        isInExpensePhase: this.isReportInProgress(r),
        rawStatus: r.status,
        raw: r,
      });
    }

    // Apply filters
    const status = this.viaticosStatusFilter();
    const from = this.viaticosDateFrom();
    const to = this.viaticosDateTo();
    let filtered = items;
    if (status) filtered = filtered.filter(i => i.rawStatus === status);
    if (from) filtered = filtered.filter(i => new Date(i.createdAt) >= new Date(from));
    if (to) filtered = filtered.filter(i => new Date(i.createdAt) <= new Date(to + 'T23:59:59'));

    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  navigateToUnifiedItem(item: UnifiedViaticoItem, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (item.source === 'new' || item.source === 'rendicion') {
      this.router.navigate(['/mis-rendiciones', item._id, 'detalle'], {
        queryParams: { tab: 'viaticos' },
      });
    } else if (item.source === 'advance') {
      if (item.canEdit || item.canResubmit) {
        this.openResubmitAdvance(item.raw as IAdvance);
      }
    }
  }

  editUnifiedItem(item: UnifiedViaticoItem, event: Event): void {
    event.stopPropagation();
    if (item.source === 'advance') {
      this.openResubmitAdvance(item.raw as IAdvance);
    } else {
      this.openEditViatico(item.raw as IExpenseReport);
    }
  }

  deleteUnifiedItem(item: UnifiedViaticoItem, event: Event): void {
    event.stopPropagation();
    if (item.source === 'advance') {
      this.openDeleteAdvanceModal(item.raw as IAdvance);
    } else {
      this.openDeleteReportModal(item.raw as IExpenseReport, event);
    }
  }

  canDeleteUnifiedItem(item: UnifiedViaticoItem): boolean {
    if (item.source === 'advance') return this.canDeleteAdvance(item.raw as IAdvance);
    if (item.source === 'new') return this.canDeleteReport(item.raw as IExpenseReport);
    return false;
  }

  get filteredDirectaReports(): IExpenseReport[] {
    let reports = this.expenseReports.filter(r => r.isDirecta);
    const status = this.directasStatusFilter();
    const from = this.directasDateFrom();
    const to = this.directasDateTo();
    if (status) reports = reports.filter(r => r.status === status);
    if (from) reports = reports.filter(r => new Date(r.createdAt) >= new Date(from));
    if (to) reports = reports.filter(r => new Date(r.createdAt) <= new Date(to + 'T23:59:59'));
    return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  get filteredCajaChicaReports(): IExpenseReport[] {
    let reports = [...this.cajaChicaReports()];
    const from = this.cajaDateFrom();
    const to = this.cajaDateTo();
    if (from) reports = reports.filter(r => new Date(r.createdAt) >= new Date(from));
    if (to) reports = reports.filter(r => new Date(r.createdAt) <= new Date(to + 'T23:59:59'));
    return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  clearViaticosFilters(): void {
    this.viaticosStatusFilter.set('');
    this.viaticosDateFrom.set('');
    this.viaticosDateTo.set('');
  }

  clearDirectasFilters(): void {
    this.directasStatusFilter.set('');
    this.directasDateFrom.set('');
    this.directasDateTo.set('');
  }

  clearCajaFilters(): void {
    this.cajaDateFrom.set('');
    this.cajaDateTo.set('');
  }

  isReportInProgress(report: IExpenseReport): boolean {
    if (report.status !== 'open') return false;
    return this.myAdvances.some(adv => {
      const rid =
        adv.expenseReportId && typeof adv.expenseReportId === 'object'
          ? adv.expenseReportId._id
          : null;
      return rid === report._id && ['partially_paid', 'paid', 'settled'].includes(adv.status);
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
    if (report.isDirecta) return report.gestion || report.motivo || report.description || 'Rendicion directa';
    return report.description || report.title || 'Rendicion de viaticos';
  }

  panelStatusText(report: IExpenseReport): string {
    if (this.isReportInProgress(report)) return 'EN PROGRESO - REGISTRANDO GASTOS';
    if (this.isReportEffectivelyClosed(report)) return 'CERRADA';
    const map: Partial<Record<IExpenseReport['status'], string>> = {
      solicited: 'SOLICITADA',
      open: 'ABIERTA',
      submitted: 'ENVIADA',
      pending_l1: 'EN SOLICITUD',
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
