import { Component, OnInit, OnDestroy, inject, signal, computed, HostListener, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { AdvanceService } from '../../../services/advance.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { CompanyConfigService } from '../../../services/company-config.service';
import { ConfirmationService } from '../../../services/confirmation.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { UploadService } from '../../../services/upload.service';
import {
  AccountingEntriesService,
  IGeneratedFile,
  AsientoTipo,
} from '../../../services/accounting-entries.service';
import { IExpenseReport } from '../../../interfaces/expense-report.interface';
import { buildReportFlowSteps, FlowStep } from '../../../shared/flow-steps.util';
import { IProject } from '../../invoices/interfaces/project.interface';
import { IAdvance, IAdvancePayment, ADVANCE_STATUS_LABELS, ADVANCE_STATUS_COLORS } from '../../../interfaces/advance.interface';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { ModalComponent } from '../../../design-system/modal/modal.component';
import {
  MobilitySheetExportData,
  RendicionExportService,
  AffidavitExportData,
  RendicionExportData,
  ReceiptExportData,
  SingleExpenseAffidavitData,
  ComprobantePage,
  FacturaPageData,
} from '../../../services/rendicion-export.service';
import { SolicitudViaticosModalComponent } from '../solicitud-viaticos-modal/solicitud-viaticos-modal.component';
import {
  formatFechaEmisionDdMmYyyy,
  resolveExpenseFechaEmision,
} from '../../../utils/fecha-emision.util';

/** Paso del proceso de generación de asientos, para el modal de progreso. */
interface AsientoStep {
  label: string;
  status: 'pending' | 'active' | 'done';
}

@Component({
  selector: 'app-rendicion-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    ModalComponent,
    SolicitudViaticosModalComponent,
    RouterModule,
  ],
  templateUrl: './rendicion-detail.component.html',
  styleUrls: ['./rendicion-detail.component.scss']
})
export class RendicionDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private expenseReportsService = inject(ExpenseReportsService);
  private advanceService = inject(AdvanceService);
  private notificationService = inject(NotificationService);
  private userStateService = inject(UserStateService);
  private confirmationService = inject(ConfirmationService);
  private invoicesService = inject(InvoicesService);
  private rendicionExportService = inject(RendicionExportService);
  private companyConfigService = inject(CompanyConfigService);
  private uploadService = inject(UploadService);
  private accountingEntriesService = inject(AccountingEntriesService);
  id: string = this.route.snapshot.params['id'];
  report: IExpenseReport | null = null;
  isLoading = true;
  advances: IAdvance[] = [];
  /** Catálogo de proyectos del cliente, para resolver el proyecto por fila de las planillas (Rendiciones Directas). */
  projects: IProject[] = [];
  showAdvanceModal = false;

  // Comprobantes paginados
  expensesPage = signal<{ data: any[]; total: number; page: number; limit: number; pages: number } | null>(null);
  isLoadingExpenses = signal(false);
  expFilterType = signal('all');
  expFilterStatus = signal('all');
  expFilterSearch = signal('');

  readonly ADVANCE_STATUS_LABELS = ADVANCE_STATUS_LABELS;
  readonly ADVANCE_STATUS_COLORS = ADVANCE_STATUS_COLORS;

  amountEditedTooltipId = signal<string | null>(null);

  // Aprobación dual de comprobantes
  approvingExpenseRoleId = signal<string | null>(null);
  rejectingExpenseRoleId = signal<string | null>(null);
  rejectRoleReason = signal('');
  showRejectRoleModal = signal(false);
  pendingRejectRoleExpenseId = signal<string | null>(null);
  pendingRejectRole = signal<'coord' | 'cont' | null>(null);

  // Planilla movilidad accordion (IDs collapsed; empty = all expanded by default)
  collapsedMobilityIds = signal<Set<string>>(new Set());

  toggleMobilityAccordion(id: string): void {
    const s = new Set(this.collapsedMobilityIds());
    if (s.has(id)) { s.delete(id); } else { s.add(id); }
    this.collapsedMobilityIds.set(s);
  }

  isMobilityExpanded(id: string): boolean {
    return !this.collapsedMobilityIds().has(id);
  }

  // Batch approve
  isBatchApproving = signal(false);
  isBatchApprovingCollab = signal(false);

  // Reopen modal (direct reopen by Contabilidad)
  showReopenModal = signal(false);
  isReopening = signal(false);

  totalGastado = 0;

  @HostListener('document:click')
  closeAmountEditedTooltip() {
    this.amountEditedTooltipId.set(null);
  }

  toggleAmountEditedTooltip(id: string, evt: MouseEvent) {
    evt.stopPropagation();
    this.amountEditedTooltipId.set(this.amountEditedTooltipId() === id ? null : id);
  }

  getExpenseAmountEdited(expense: any): boolean {
    const d = this.getExpenseDataObject(expense as Record<string, unknown>);
    return d['amountEdited'] === true;
  }

  getExpenseOriginalOcrTotal(expense: any): number | null {
    const d = this.getExpenseDataObject(expense as Record<string, unknown>);
    const v = d['originalOcrTotal'];
    return (v !== undefined && v !== null) ? Number(v) : null;
  }

  get saldoLibre(): number {
    // Viáticos unificados: el fondo disponible es siempre viaticoPaidAmount − gastado
    // (incluye el depósito de contabilidad).
    if (this.report?.type === 'viatico') {
      const viaticoPaid = Number((this.report as any)?.viaticoPaidAmount ?? 0);
      return viaticoPaid - this.totalGastado;
    }
    // Rendición directa con depósito de Contabilidad: el saldo a devolver es el
    // depósito menos lo gastado (en vivo), no el monto del settlement almacenado.
    if (this.hasDirectaDeposit) {
      return this.directaSaldo;
    }
    if (this.settlement?.difference !== undefined && this.settlement.difference !== null) {
      return this.settlement.difference;
    }
    return this.totalAnticipado - this.totalGastado;
  }

  /** Tipo de settlement efectivo para viáticos: calculado en vivo desde viaticoPaidAmount. */
  private get effectiveSettlementType(): string | undefined {
    if (this.report?.type === 'viatico') {
      const viaticoPaid = Number((this.report as any)?.viaticoPaidAmount ?? 0);
      if (viaticoPaid <= 0 && this.totalGastado <= 0) {
        return (this.report as any)?.settlement?.type;
      }
      const diff = viaticoPaid - this.totalGastado;
      return Math.abs(diff) < 0.01 ? 'equilibrado' : diff > 0 ? 'devolucion' : 'reembolso';
    }
    return (this.report as any)?.settlement?.type;
  }

  /** Rendición directa iniciada por Contabilidad (tiene depósito con saldo). */
  get hasDirectaDeposit(): boolean {
    return !!(this.report?.isDirecta && this.report?.directaDeposit);
  }

  get directaDeposited(): number {
    return Number(this.report?.directaDeposit?.amount ?? this.report?.budget ?? 0);
  }

  get directaSaldo(): number {
    return this.directaDeposited - this.totalGastado;
  }

  ngOnInit(): void {
    this.companyConfigService.refreshConfig();
    this.loadProjects();
    if (this.id) {
      this.loadReport();
      this.loadAdvances();
    }
  }

  private loadProjects(): void {
    this.invoicesService.getProjects().subscribe({
      next: (list) => { this.projects = list ?? []; },
      error: () => {},
    });
  }

  /** Resuelve el código de un proyecto a partir de su id (proyecto por fila en Rendiciones Directas). En los reportes solo se muestra el código. */
  private resolveRowProjectLabel(id: unknown): string {
    if (!id) return '';
    const pid = typeof id === 'object' ? String((id as { _id?: string })._id ?? '') : String(id);
    if (!pid) return '';
    const p = this.projects.find((pr) => String(pr._id) === pid);
    if (!p) return '';
    return p.code || '';
  }

  get reportProjectId(): string | null {
    const p = this.report?.projectId;
    if (!p) return null;
    return typeof p === 'object' && p !== null ? p._id ?? null : String(p);
  }

  loadAdvances() {
    const request$ = this.isAdminView
      ? this.advanceService.findAll()
      : this.advanceService.findMy();

    request$.subscribe({
      next: (advances) => {
        this.advances = advances.filter(a => {
          const rid = typeof a.expenseReportId === 'object' ? a.expenseReportId?._id : a.expenseReportId;
          return rid === this.id;
        });
      },
      error: () => {},
    });
  }

  get totalAnticipado(): number {
    // El presupuesto refleja lo realmente pagado (paidAmount) — soporta pagos parciales.
    const advances = this.advances
      .filter(a => ['approved', 'partially_paid', 'paid', 'settled'].includes(a.status))
      .reduce((sum, a) => sum + Number(a.paidAmount ?? a.amount), 0);
    // Para viáticos unificados (type='viatico'), el monto pagado está en viaticoPaidAmount
    // del propio ExpenseReport, no en Advances vinculados.
    const viaticoPaid = this.report?.type === 'viatico'
      ? Number((this.report as any).viaticoPaidAmount ?? 0)
      : 0;
    // El depósito de una rendición directa iniciada por Contabilidad funciona como
    // anticipo: el saldo no gastado debe devolverlo el colaborador/coordinador.
    return advances + viaticoPaid + (this.hasDirectaDeposit ? this.directaDeposited : 0);
  }

  get paidAdvances(): IAdvance[] {
    return this.advances.filter(a => ['approved', 'partially_paid', 'paid', 'settled'].includes(a.status));
  }

  get hasPaidAdvanceForReport(): boolean {
    // Con el primer pago (parcial o total) el colaborador ya puede rendir.
    if (this.advances.some(a => ['partially_paid', 'paid', 'settled'].includes(a.status))) return true;
    // Para viáticos unificados el pago está en viaticoPaidAmount, no en un Advance.
    if (this.report?.type === 'viatico' && Number((this.report as any).viaticoPaidAmount ?? 0) > 0) return true;
    return false;
  }

  /** Pagos parciales de un anticipo (para el desglose del presupuesto). */
  advancePayments(adv: IAdvance): IAdvancePayment[] {
    return Array.isArray(adv?.payments) ? adv.payments : [];
  }

  advancePaidAmount(adv: IAdvance): number {
    return Number(adv?.paidAmount ?? adv?.amount ?? 0);
  }

  get settlement(): any {
    return (this.report as any)?.settlement;
  }

  openAdvanceModal() {
    this.showAdvanceModal = true;
  }

  onSolicitudViaticosClosed(success: boolean): void {
    this.showAdvanceModal = false;
    if (success) this.loadAdvances();
  }

  private updateDocCounts(report: IExpenseReport): void {
    const ids = (report.expenseIds as any[]) ?? [];
    this.totalDocCount.set(ids.length);
    this.approvedDocCount.set(ids.filter((e: any) => e.status === 'approved').length);
  }

  loadReport() {
    this.isLoading = true;
    this.expenseReportsService.findOne(this.id).subscribe({
      next: (data) => {
        this.report = data;
        this.calculateTotals();
        this.updateDocCounts(data);
        this.isLoading = false;
        this.loadExpensesPage(1);
        // Auto-cierre: viáticos equilibrados que quedaron en 'approved' por datos stale.
        if (
          (data as any)?.type === 'viatico' &&
          data?.status === 'approved' &&
          this.effectiveSettlementType === 'equilibrado' &&
          this.userStateService.isContabilidad()
        ) {
          this.expenseReportsService.close(this.id).subscribe({
            next: (closed) => {
              this.report = closed;
              this.calculateTotals();
              this.updateDocCounts(closed);
            },
            error: () => {},
          });
        }
      },
      error: (err) => {
        console.error('Error fetching report detail', err);
        this.isLoading = false;
      }
    });
  }

  private refreshReport(): void {
    this.expenseReportsService.findOne(this.id).subscribe({
      next: (data) => {
        this.report = data;
        this.calculateTotals();
        this.updateDocCounts(data);
      },
      error: () => {},
    });
  }

  loadExpensesPage(page: number) {
    this.isLoadingExpenses.set(true);
    this.expenseReportsService.findExpensesPaginated(this.id, {
      page,
      limit: 10,
      type: this.expFilterType(),
      status: this.expFilterStatus(),
      search: this.expFilterSearch(),
    }).subscribe({
      next: (result) => { this.expensesPage.set(result); this.isLoadingExpenses.set(false); },
      error: () => { this.isLoadingExpenses.set(false); },
    });
  }

  applyExpenseFilters() {
    this.loadExpensesPage(1);
  }

  clearExpenseFilters() {
    this.expFilterType.set('all');
    this.expFilterStatus.set('all');
    this.expFilterSearch.set('');
    this.loadExpensesPage(1);
  }

  calculateTotals() {
    if (!this.report) return;

    // TODO: in a real scenario we'd query the Expense objects to sum their 'montos'.
    // Here we'll map the populated expenseIds if they contain the real amounts,
    // or simulate if the backend just returns IDs.
    this.totalGastado = 0;
    
    // For now, assume expenseIds returns full objects due to mongoose populate
    if (this.report.expenseIds && this.report.expenseIds.length > 0) {
      this.totalGastado = this.report.expenseIds.reduce((sum, exp: any) => sum + (parseFloat(exp.total) || 0), 0);
    }
    
  }

  goBack() {
    const ownerId = typeof this.report?.userId === 'object' ? this.report?.userId?._id : this.report?.userId;
    const canViewAdminUsers = this.userStateService.isAdmin() || this.userStateService.isSuperAdmin();
    if (this.isAdminView && ownerId && canViewAdminUsers) {
      this.router.navigate(['/admin-users', ownerId, 'details']);
    } else if (this.isAdminView && this.userStateService.isContabilidad()) {
      this.router.navigate(['/rendiciones'], this.report?.isDirecta ? { queryParams: { tab: 'directas' } } : {});
    } else if (this.isAdminView) {
      this.router.navigate(['/tesoreria']);
    } else {
      const tab = this.route.snapshot.queryParamMap.get('tab');
      this.router.navigate(['/mis-rendiciones'], tab ? { queryParams: { tab } } : {});
    }
  }

  submitReport() {
    this.expenseReportsService.update(this.id, { status: 'submitted' }).subscribe({
      next: (res) => {
        this.report = res;
        this.calculateTotals();
        // Maybe show notification
      }
    });
  }

  // Admin approval / rejection
  showAdminApproveModal = signal(false);
  isApprovingReport = signal(false);
  showAdminRejectModal = signal(false);
  adminRejectionReason = signal('');

  /** La rendición pertenece al usuario actual (es su propia rendición). */
  get isOwnReport(): boolean {
    const uid = this.userStateService.getUser()?._id;
    if (!uid || !this.report) return false;
    const owner = this.report.userId;
    const ownerId = owner && typeof owner === 'object' ? owner._id : owner;
    return String(ownerId ?? '') === String(uid);
  }

  get isAdminView(): boolean {
    // Sobre su propia rendición, cualquier rol (incl. coordinador) actúa como
    // colaborador: agrega/envía sus gastos y no puede auto-aprobarse.
    if (this.isOwnReport) return false;
    return this.userStateService.isAdmin() || this.userStateService.isSuperAdmin() || this.userStateService.isContabilidad() || this.userStateService.canApproveL2()
      || (this.userStateService.isCoordinador() && this.userStateService.hasModulePermission('rendiciones'));
  }

  // --- Descarga de asientos contables (solo Contabilidad) ---
  downloadingAsientos = false;

  // Modal de progreso paso a paso de la generación de asientos.
  asientosModalOpen = signal(false);
  asientosSteps = signal<AsientoStep[]>([]);
  asientosError = signal<string | null>(null);
  asientosDone = signal(false);
  private asientosStepTimer: ReturnType<typeof setInterval> | null = null;

  /** Pasos mostrados al usuario (reflejan el proceso real del backend). */
  private asientosStepLabels(): string[] {
    return [
      'Leyendo datos de la rendición',
      'Verificando caché de asientos',
      'Clasificando cuentas contables con IA',
      'Calculando tipo de cambio',
      'Generando archivos Excel (Contanet)',
    ];
  }

  /** Solo el rol Contabilidad puede descargar los asientos contables. */
  get canDownloadAsientos(): boolean {
    return this.userStateService.isContabilidad();
  }

  private clearAsientosTimer(): void {
    if (this.asientosStepTimer) {
      clearInterval(this.asientosStepTimer);
      this.asientosStepTimer = null;
    }
  }

  /**
   * Avanza el paso activo. No pasa del último automáticamente: ese se marca
   * como completado solo cuando el backend responde.
   */
  private advanceAsientoStep(): void {
    const steps = this.asientosSteps();
    const activeIdx = steps.findIndex((s) => s.status === 'active');
    if (activeIdx === -1 || activeIdx >= steps.length - 1) return;
    this.asientosSteps.set(
      steps.map((s, i) => {
        if (i === activeIdx) return { ...s, status: 'done' };
        if (i === activeIdx + 1) return { ...s, status: 'active' };
        return s;
      })
    );
  }

  private markAllAsientoStepsDone(): void {
    this.asientosSteps.set(
      this.asientosSteps().map((s) => ({ ...s, status: 'done' }))
    );
  }

  /** Cierra el modal de asientos (solo si ya no está cargando). */
  closeAsientosModal(): void {
    if (this.downloadingAsientos) return;
    this.clearAsientosTimer();
    this.asientosModalOpen.set(false);
  }

  ngOnDestroy(): void {
    this.clearAsientosTimer();
  }

  /**
   * Tipos de asiento que pueden producir salida para esta rendición.
   * Evita pedir al backend trabajo innecesario (devolución/reembolso solo
   * aplican si el tipo de liquidación coincide). `solicitud` se mantiene
   * siempre porque depende de anticipos no visibles en este modelo; el
   * backend la descarta si no hay anticipos.
   */
  private applicableAsientoTipos(): AsientoTipo[] {
    const tipos: AsientoTipo[] = ['solicitud'];
    if (this.report?.expenseIds?.length) {
      tipos.push('compra', 'aplicacion');
    }
    const settlementType = this.report?.settlement?.type;
    if (settlementType === 'devolucion') tipos.push('devolucion');
    if (settlementType === 'reembolso') tipos.push('reembolso');
    return tipos;
  }

  downloadAsientos(): void {
    if (!this.report?._id || this.downloadingAsientos) return;
    this.downloadingAsientos = true;
    this.asientosError.set(null);
    this.asientosDone.set(false);
    this.asientosSteps.set(
      this.asientosStepLabels().map((label, i) => ({
        label,
        status: i === 0 ? 'active' : 'pending',
      }))
    );
    this.asientosModalOpen.set(true);
    this.clearAsientosTimer();
    this.asientosStepTimer = setInterval(() => this.advanceAsientoStep(), 850);

    this.accountingEntriesService
      .generate(this.report._id, this.applicableAsientoTipos())
      .subscribe({
        next: (res: { files: IGeneratedFile[] }) => {
          this.clearAsientosTimer();
          this.downloadingAsientos = false;
          this.markAllAsientoStepsDone();
          const files = res?.files ?? [];
          if (!files.length) {
            this.asientosError.set(
              'No hay asientos que generar para esta rendición.'
            );
            return;
          }
          this.asientosDone.set(true);
          for (const file of files) {
            this.accountingEntriesService.downloadBase64(file);
          }
          const conErrores = files.filter((f) => f.cuadreErrors?.length);
          // Breve confirmación visual antes de cerrar el modal.
          setTimeout(() => {
            this.asientosModalOpen.set(false);
            if (conErrores.length) {
              this.notificationService.show(
                `Asientos descargados. Atención: ${conErrores
                  .map((f) => f.tipo)
                  .join(', ')} con descuadre. Revisa el desglose contable.`,
                'error'
              );
            } else {
              this.notificationService.show(
                `Asientos descargados (${files.length} archivo(s)).`,
                'success'
              );
            }
          }, 1000);
        },
        error: (err) => {
          this.clearAsientosTimer();
          this.downloadingAsientos = false;
          console.group('[asientos] ERROR detalle');
          console.log('status:', err?.status);
          console.log('statusText:', err?.statusText);
          console.log('message:', err?.message);
          console.log('error.message:', err?.error?.message);
          console.log('error (raw):', err?.error);
          console.log('¿status 0?', err?.status === 0, '→ probable timeout nginx o CORS');
          console.log('¿status 408?', err?.status === 408, '→ timeout NestJS (>295 s)');
          console.log('¿status 403?', err?.status === 403, '→ rol no autorizado en backend');
          console.groupEnd();
          this.asientosError.set(
            err?.error?.message ||
              err?.message ||
              'Error desconocido al generar los asientos.'
          );
        },
      });
  }

  get canApproveExpenses(): boolean {
    if (this.userStateService.isContabilidad()) return false;
    if (this.userStateService.isCoordinador() && this.userStateService.hasModulePermission('rendiciones')) return true;
    return this.userStateService.canApproveL1();
  }

  /** La rendición está en fase de solicitud inicial (creada por colaborador, aún no aprobada). */
  get isSolicitudPhase(): boolean {
    if (!this.report) return false;
    if (this.report.status === 'solicited') return true;
    // Rechazada en fase de solicitud: no tiene gastos aún
    if (this.report.status === 'rejected' && (this.report.expenseIds?.length ?? 0) === 0) return true;
    return false;
  }

  /** Colaborador puede agregar gastos (rendición ya aprobada/abierta, o rechazada en fase de gastos). */
  get canAddExpenses(): boolean {
    if (!this.report || this.isAdminView) return false;
    const isRejectedGasPhase = this.report.status === 'rejected' && !this.isSolicitudPhase;
    // Viático con pago parcial: contabilidad ya depositó parte del anticipo, por lo
    // que el colaborador puede empezar a cargar gastos aunque falte completar el pago.
    const isPartialViatico = this.report.type === 'viatico' && this.report.status === 'partially_paid';
    if (this.report.status !== 'open' && !isRejectedGasPhase && !isPartialViatico) return false;
    // Caja chica finalizada por Contabilidad: el total quedó congelado, no se
    // pueden subir más gastos a esta rendición.
    if (this.report.lockedByCajaChica) return false;
    // Rendición directa: no necesita anticipo pagado para agregar gastos
    if (this.report.isDirecta || this.report.isCajaChica) return true;
    // Rendición rechazada en fase de gastos: el anticipo ya fue pagado antes del envío
    if (isRejectedGasPhase) return true;
    return this.hasPaidAdvanceForReport;
  }

  /** Colaborador puede re-enviar la solicitud inicial (fue rechazada antes de agregar gastos). */
  get canResendSolicitud(): boolean {
    if (!this.report || this.isAdminView) return false;
    return this.report.status === 'rejected' && (this.report.expenseIds?.length ?? 0) === 0;
  }

  /** Colaborador puede re-enviar la rendición completa (rechazada después de agregar gastos). */
  get canResubmitReport(): boolean {
    if (!this.report || this.isAdminView) return false;
    return this.report.status === 'rejected' && (this.report.expenseIds?.length ?? 0) > 0;
  }

  /** Colaborador puede agregar gastos y enviar (abierta o rechazada en fase de gastos). */
  get collaboratorCanEdit(): boolean {
    return this.canAddExpenses || this.canResubmitReport;
  }

  get canSubmitReport(): boolean {
    if (!this.report || this.isAdminView) return false;
    if (this.report.isCajaChica) return false;
    // Viático con pago parcial: el colaborador puede enviar aunque contabilidad aún
    // no complete el depósito (el pago restante se registra después del envío).
    const isPartialViatico = this.report.type === 'viatico' && this.report.status === 'partially_paid';
    if (!(this.report.status === 'open' || this.report.status === 'rejected' || isPartialViatico)) return false;
    const expenses = this.report.expenseIds || [];
    return expenses.length > 0;
  }

  openAdminApproveModal(): void {
    this.showAdminApproveModal.set(true);
  }

  closeAdminApproveModal(): void {
    if (this.isApprovingReport()) return;
    this.showAdminApproveModal.set(false);
  }

  confirmApproveReport(): void {
    const currentStatus = this.report?.status;
    let newStatus: IExpenseReport['status'];
    let successMsg: string;

    if (currentStatus === 'solicited') {
      newStatus = 'open';
      successMsg = 'Solicitud aprobada. El colaborador ya puede agregar sus gastos.';
    } else if (currentStatus === 'submitted') {
      newStatus = 'pending_accounting';
      successMsg = 'Rendicion aprobada por coordinador. Enviada a contabilidad para aprobacion final.';
    } else {
      newStatus = 'approved';
      successMsg = 'Rendicion aprobada definitivamente por contabilidad.';
    }

    this.isApprovingReport.set(true);
    this.expenseReportsService.update(this.id, { status: newStatus }).subscribe({
      next: (res) => {
        this.report = res;
        this.calculateTotals();
        this.showAdminApproveModal.set(false);
        this.isApprovingReport.set(false);
        this.notificationService.show(successMsg, 'success');
      },
      error: () => {
        this.isApprovingReport.set(false);
        this.notificationService.show('Error al aprobar', 'error');
      },
    });
  }

  isResendingSolicitud = signal(false);

  reenviarSolicitudDirecto(): void {
    this.isResendingSolicitud.set(true);
    this.expenseReportsService.update(this.id, { status: 'solicited', rejectionReason: '' }).subscribe({
      next: (res) => {
        this.report = res;
        this.calculateTotals();
        this.isResendingSolicitud.set(false);
        this.notificationService.show('Solicitud reenviada correctamente', 'success');
      },
      error: () => {
        this.isResendingSolicitud.set(false);
        this.notificationService.show('Error al reenviar la solicitud', 'error');
      },
    });
  }

  openAdminRejectModal() {
    this.adminRejectionReason.set('');
    this.showAdminRejectModal.set(true);
  }

  submitAdminRejection() {
    if (!this.adminRejectionReason()) {
      this.notificationService.show('Debe ingresar un motivo de rechazo', 'error');
      return;
    }
    this.expenseReportsService
      .update(this.id, {
        status: 'rejected',
        rejectionReason: this.adminRejectionReason().trim(),
      })
      .subscribe({
      next: (res) => {
        this.report = res;
        this.showAdminRejectModal.set(false);
        this.notificationService.show('Rendición rechazada', 'success');
      },
      error: (err) => {
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(
          msg || 'Error al rechazar la rendición',
          'error'
        );
      },
    });
  }

  showTypeModal = false;
  showSubmitModal = false;
  isSubmitting = signal(false);
  deletingExpenseId = signal<string | null>(null);
  isExportingExcel = signal(false);
  isExportingPdf = signal(false);
  isExportingFullPdf = signal(false);
  showAffidavitModal = signal(false);
  isGeneratingAffidavit = signal(false);
  affidavitType = signal<'viaticos_nacionales' | 'viajes_exterior'>('viaticos_nacionales');
  affidavitSelectedExpenseIds = signal<string[]>([]);

  // --- Aprobación documento por documento ---
  approvingExpenseId = signal<string | null>(null);
  rejectingExpenseId = signal<string | null>(null);
  showExpenseRejectModal = signal(false);
  expenseRejectTargetId = signal<string | null>(null);
  expenseRejectReason = signal('');

  approvedDocCount = signal(0);
  totalDocCount = signal(0);
  readonly allDocumentsApproved = computed(() =>
    this.totalDocCount() > 0 && this.approvedDocCount() === this.totalDocCount()
  );

  /** Coordinador/Admin puede aprobar (paso 1): rendicion enviada + todos los docs aprobados. */
  get canCoordinadorApprove(): boolean {
    if (this.userStateService.isContabilidad()) return false;
    return this.report?.status === 'submitted' && this.allDocumentsApproved();
  }

  /** Contabilidad/Admin/SuperAdmin puede hacer la aprobacion final (paso 2). */
  get canContabilidadApprove(): boolean {
    const hasRole = this.userStateService.isContabilidad()
      || this.userStateService.isSuperAdmin()
      || this.userStateService.isAdmin();
    return hasRole && this.report?.status === 'pending_accounting';
  }

  /** Contabilidad ve la rendicion en submitted pero no puede actuar aun. */
  get isPendingCoordinador(): boolean {
    return this.userStateService.isContabilidad() && this.report?.status === 'submitted';
  }

  /** @deprecated usar canCoordinadorApprove o canContabilidadApprove */
  get canFinalApprove(): boolean {
    return this.canCoordinadorApprove || this.canContabilidadApprove;
  }

  /**
   * Rendición directa: aprobador de centro de costo al que le toca el turno
   * actual de la cadena (`directaApproverChain[directaApprovalLevel]`), o
   * Superadmin. Solo aplica en `pending_l1`; al completar la cadena pasa a
   * `pending_accounting` y actúa Contabilidad (`canContabilidadApprove`).
   */
  get canApproveDirectaChainStep(): boolean {
    if (!this.report?.isDirecta || this.report.status !== 'pending_l1') return false;
    if (this.userStateService.isSuperAdmin()) return true;
    // La autoridad para aprobar una directa es POR ASIGNACIÓN (el jefe inmediato de
    // la cadena), igual que valida el backend (canActOnChain: expected === actorId).
    // No se exige el rol Coordinador: el aprobador asignado puede tener otro rol y
    // aun así debe ver el botón. VD-36.
    const chain = this.report.directaApproverChain ?? [];
    const expected = chain[this.report.directaApprovalLevel ?? 0];
    const expectedId = expected && typeof expected === 'object' ? (expected as any)._id : expected;
    const currentUserId = this.userStateService.getUser()?._id;
    return !!expectedId && !!currentUserId && String(expectedId) === String(currentUserId);
  }

  approvingDirecta = signal(false);

  confirmApproveDirectaChainStep(): void {
    this.approvingDirecta.set(true);
    this.expenseReportsService.approveDirecta(this.id).subscribe({
      next: (res) => {
        this.report = res;
        this.calculateTotals();
        this.approvingDirecta.set(false);
        this.notificationService.show('Turno aprobado.', 'success');
      },
      error: (err) => {
        this.approvingDirecta.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al aprobar', 'error');
      },
    });
  }

  showDirectaRejectModal = signal(false);
  directaRejectionReason = signal('');
  isRejectingDirecta = signal(false);

  openDirectaRejectModal(): void {
    this.directaRejectionReason.set('');
    this.showDirectaRejectModal.set(true);
  }

  submitDirectaRejection(): void {
    const reason = this.directaRejectionReason().trim();
    if (reason.length < 10) {
      this.notificationService.show('El motivo de rechazo debe tener al menos 10 caracteres', 'error');
      return;
    }
    this.isRejectingDirecta.set(true);
    this.expenseReportsService.rejectDirecta(this.id, reason).subscribe({
      next: (res) => {
        this.report = res;
        this.showDirectaRejectModal.set(false);
        this.isRejectingDirecta.set(false);
        this.notificationService.show('Rendición rechazada', 'success');
      },
      error: (err) => {
        this.isRejectingDirecta.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al rechazar', 'error');
      },
    });
  }

  confirmApproveExpense(expenseId: string): void {
    this.confirmationService.show(
      '¿Aprobar este comprobante? Esta acción no se puede deshacer.',
      () => this.approveExpense(expenseId)
    );
  }

  approveExpense(expenseId: string): void {
    this.approvingExpenseId.set(expenseId);
    this.invoicesService.approveInvoice(expenseId, { status: 'approved' }).subscribe({
      next: () => {
        this.notificationService.show('Documento aprobado', 'success');
        this.approvingExpenseId.set(null);
        this.loadReport();
      },
      error: (err) => {
        this.approvingExpenseId.set(null);
        const msg = err?.error?.message;
        this.notificationService.show(
          typeof msg === 'string' ? msg : 'Error al aprobar documento',
          'error'
        );
      },
    });
  }

  openExpenseRejectModal(expenseId: string): void {
    this.expenseRejectTargetId.set(expenseId);
    this.expenseRejectReason.set('');
    this.showExpenseRejectModal.set(true);
  }

  closeExpenseRejectModal(): void {
    this.showExpenseRejectModal.set(false);
    this.expenseRejectTargetId.set(null);
  }

  confirmRejectExpense(): void {
    const id = this.expenseRejectTargetId();
    if (!id) return;
    this.rejectingExpenseId.set(id);
    this.invoicesService.rejectInvoice(id, { status: 'rejected', reason: this.expenseRejectReason() }).subscribe({
      next: () => {
        this.notificationService.show('Documento rechazado', 'success');
        this.rejectingExpenseId.set(null);
        this.showExpenseRejectModal.set(false);
        this.loadReport();
      },
      error: (err) => {
        this.rejectingExpenseId.set(null);
        const msg = err?.error?.message;
        this.notificationService.show(
          typeof msg === 'string' ? msg : 'Error al rechazar documento',
          'error'
        );
      },
    });
  }

  openSubmitModal() {
    if (!this.canSubmitReport) {
      this.notificationService.show(
        'Debes agregar al menos un gasto antes de enviar la rendición.',
        'warning'
      );
      return;
    }
    this.showSubmitModal = true;
  }

  closeSubmitModal() {
    this.showSubmitModal = false;
  }

  confirmSubmitReport() {
    const wasRejected = this.report?.status === 'rejected';
    this.isSubmitting.set(true);
    this.expenseReportsService.update(this.id, { status: 'submitted' }).subscribe({
      next: (res) => {
        this.report = res;
        this.calculateTotals();
        this.showSubmitModal = false;
        this.isSubmitting.set(false);
        this.notificationService.show(
          wasRejected
            ? 'Rendición reenviada correctamente'
            : 'Rendición enviada correctamente',
          'success'
        );
      },
      error: () => {
        this.isSubmitting.set(false);
        this.notificationService.show('Error al enviar la rendición', 'error');
      }
    });
  }

  openAddExpenseModal() {
    this.showTypeModal = true;
  }

  closeTypeModal() {
    this.showTypeModal = false;
  }

  selectExpenseType(tipo: string) {
    this.showTypeModal = false;
    this.router.navigate(['/invoices/add'], { queryParams: { rendicionId: this.id, tipo } });
  }

  getExpenseTypeLabel(expense: any): string {
    const type = expense?.expenseType;
    if (type === 'planilla_movilidad') return 'Planilla Movilidad';
    if (type === 'otros_gastos') return 'Otros Gastos';
    if (type === 'recibo_caja') return 'Recibo de Caja';
    return 'Factura';
  }

  /** Código corto del tipo de documento. */
  getExpenseTypeCode(expense: any): string {
    const type = expense?.expenseType;
    if (type === 'planilla_movilidad') return 'PM';
    if (type === 'recibo_caja') return 'H';
    if (type === 'otros_gastos') {
      const sub = expense?.subTipo ?? this.getExpenseDataObject(expense)['subTipo'];
      if (sub === 'TK') return 'TK';
      if (sub === 'BV') return 'BV';
      if (sub === 'RC') return 'RC';
      if (sub === 'DJ') return 'DJ';
      if (sub === 'OT') return 'OT';
      return 'SC';
    }
    const dataObj = this.getExpenseDataObject(expense);
    const tipoComp = String(dataObj['tipoComprobante'] ?? '').trim();
    if (tipoComp === '03') return 'BV';
    if (tipoComp === '12') return 'TK';
    if (tipoComp === '01') return 'FE';
    if (type === 'factura' || !type) return 'FT';
    return 'FT';
  }

  getExpenseTypeCodeBadgeClass(expense: any): string {
    const code = this.getExpenseTypeCode(expense);
    if (code === 'PM') return 'bg-yellow-100 text-yellow-800';
    if (code === 'CC') return 'bg-purple-100 text-purple-800';
    if (code === 'H')  return 'bg-green-100 text-green-800';
    if (code === 'SC' || code === 'OT') return 'bg-gray-100 text-gray-600';
    if (code === 'DJ') return 'bg-amber-100 text-amber-800';
    if (code === 'TK') return 'bg-teal-100 text-teal-700';
    if (code === 'RC') return 'bg-indigo-100 text-indigo-700';
    return 'bg-blue-100 text-blue-700';
  }

  getExpenseDocumentNumber(expense: any): string {
    const type = expense?.expenseType;
    if (type === 'planilla_movilidad') {
      return typeof expense?.internalCode === 'string' && expense.internalCode ? expense.internalCode : '-';
    }
    if (type === 'recibo_caja') {
      const d = this.getExpenseDataObject(expense);
      const payload = d['payload'];
      const p: Record<string, unknown> =
        typeof payload === 'string'
          ? (() => { try { return JSON.parse(payload); } catch { return {}; } })()
          : (payload && typeof payload === 'object' ? payload as Record<string, unknown> : {});
      return p['numeroDocumento'] ? String(p['numeroDocumento']) : '-';
    }
    const d = this.getExpenseDataObject(expense);
    const serie = d['serie'] ? String(d['serie']) : '';
    const correlativo = d['correlativo'] ? String(d['correlativo']) : '';
    if (serie && correlativo) return `${serie}-${correlativo}`;
    if (serie) return serie;
    if (correlativo) return correlativo;
    return '-';
  }

  getExpenseProveedor(expense: any): string {
    const type = expense?.expenseType;
    if (type === 'planilla_movilidad' || type === 'otros_gastos') return '-';
    const d = this.getExpenseDataObject(expense);
    const razonSocial = d['razonSocial'];
    if (typeof razonSocial === 'string' && razonSocial.trim()) return razonSocial.trim();
    const provider = expense?.provider;
    if (typeof provider === 'string' && provider.trim()) return provider.trim();
    return '-';
  }

  formatShortDate(raw: string | null | undefined): string {
    if (!raw) return '-';
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, day] = raw.split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(raw);
    }
    if (isNaN(d.getTime())) return raw;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  /** Fecha de emisión del comprobante en formato dd/MM/yyyy */
  formatEmissionDate(raw: string | Date | null | undefined): string {
    return formatFechaEmisionDdMmYyyy(raw);
  }

  emissionDateText(exp: Record<string, unknown>): string {
    return formatFechaEmisionDdMmYyyy(resolveExpenseFechaEmision(exp));
  }

  getExpenseDate(expense: any): string {
    const type = expense?.expenseType;
    if (type === 'planilla_movilidad') {
      const rows: any[] = expense?.mobilityRows || [];
      if (rows.length === 0) return '-';
      const dates = rows.map((r: any) => r.fecha).filter(Boolean);
      if (dates.length === 0) return '-';
      return this.formatEmissionDate([...dates].sort()[0]);
    }
    if (type === 'otros_gastos') {
      return this.formatEmissionDate(expense?.createdAt);
    }
    return this.emissionDateText(expense);
  }

  getExpenseComentario(expense: Record<string, unknown>): string {
    const top = expense['comentario'];
    if (typeof top === 'string' && top.trim()) return top.trim();
    const fromData = this.getExpenseDataObject(expense)['comentario'];
    if (typeof fromData === 'string' && fromData.trim()) return fromData.trim();
    return '';
  }

  getExpensePlaca(expense: Record<string, unknown>): string {
    const top = expense['placaVehiculo'];
    if (typeof top === 'string' && top.trim()) return top.trim();
    const fromData = this.getExpenseDataObject(expense)['placaVehiculo'];
    if (typeof fromData === 'string' && fromData.trim()) return fromData.trim();
    return '';
  }

  /** Concepto original del gasto (no incluye comentario manual). */
  getExpenseConcepto(expense: any): string {
    const type = expense?.expenseType;
    if (type === 'planilla_movilidad') {
      const firstRow = expense?.mobilityRows?.[0];
      return firstRow?.gestion || `${expense?.mobilityRows?.length || 0} filas`;
    }
    if (type === 'otros_gastos') {
      return expense?.description || 'DJ firmada';
    }
    if (type === 'recibo_caja') {
      try {
        const data = typeof expense?.data === 'string' ? JSON.parse(expense.data) : expense?.data || {};
        return data.concepto || data.razonSocial || 'N/A';
      } catch { return 'N/A'; }
    }
    try {
      const data = typeof expense?.data === 'string' ? JSON.parse(expense.data) : expense?.data || {};
      return data.razonSocial || 'N/A';
    } catch { return 'N/A'; }
  }

  /** Lista de conceptos para la tabla Comprobantes Asociados (1 entrada por fila de planilla). */
  getExpenseDescriptionLines(expense: any): string[] {
    const type = expense?.expenseType;
    if (type === 'planilla_movilidad') {
      const rows: any[] = expense?.mobilityRows || [];
      if (!rows.length) return ['0 filas'];
      const lines = rows
        .map((r: any) => {
          const concepto = (r?.concepto || '').toString().trim();
          if (concepto) return concepto;
          const gestion = (r?.gestion || '').toString().trim();
          if (gestion) return gestion;
          const origen = (r?.origen || '').toString().trim();
          const destino = (r?.destino || '').toString().trim();
          if (origen && destino) return `${origen} → ${destino}`;
          return origen || destino || (r?.clienteProveedor || '').toString().trim();
        })
        .filter(Boolean);
      return lines.length ? lines : [`${rows.length} filas`];
    }
    return [this.getExpenseDescription(expense)];
  }

  getExpenseDescription(expense: any): string {
    const type = expense?.expenseType;
    if (type === 'planilla_movilidad') {
      const firstRow = expense?.mobilityRows?.[0];
      return firstRow?.gestion || `${expense?.mobilityRows?.length || 0} filas`;
    }
    if (type === 'otros_gastos') {
      return expense?.description || 'DJ firmada';
    }
    if (type === 'recibo_caja') {
      try {
        const data = typeof expense?.data === 'string' ? JSON.parse(expense.data) : expense?.data || {};
        return data.razonSocial || data.concepto || 'N/A';
      } catch { return 'N/A'; }
    }
    try {
      const data = typeof expense?.data === 'string' ? JSON.parse(expense.data) : expense?.data || {};
      return data.razonSocial || 'N/A';
    } catch { return 'N/A'; }
  }

  parseData(data: string) {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  /** Modal ficha completa del comprobante (documento + datos). */
  showExpenseDetailModal = signal(false);
  selectedExpense = signal<Record<string, unknown> | null>(null);

  openExpenseDetail(expense: Record<string, unknown>): void {
    this.selectedExpense.set(expense);
    this.showExpenseDetailModal.set(true);
  }

  closeExpenseDetail(): void {
    this.showExpenseDetailModal.set(false);
    this.selectedExpense.set(null);
  }

  getExpenseFileUrl(expense: Record<string, unknown> | null | undefined): string | null {
    if (!expense) return null;
    const f = expense['file'];
    if (typeof f !== 'string' || !f.trim()) return null;
    return f.trim();
  }

  hasExpenseFile(expense: Record<string, unknown> | null | undefined): boolean {
    return this.getExpenseFileUrl(expense) !== null;
  }

  openExpenseFile(expense: Record<string, unknown>): void {
    const url = this.getExpenseFileUrl(expense);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      this.notificationService.show('No hay documento adjunto', 'warning');
    }
  }

  isPreviewableImage(expense: Record<string, unknown>): boolean {
    const u = this.getExpenseFileUrl(expense);
    if (!u) return false;
    return /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(u);
  }

  getExpenseDataObject(expense: Record<string, unknown>): Record<string, unknown> {
    const raw = expense['data'];
    try {
      if (raw == null) return {};
      if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
      if (typeof raw === 'object') return { ...(raw as Record<string, unknown>) };
    } catch {
      return {};
    }
    return {};
  }

  /** Valor legible de un campo del JSON `data` de la factura/gasto. */
  dataText(exp: Record<string, unknown>, key: string): string {
    const d = this.getExpenseDataObject(exp);
    const v = d[key];
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  getExpenseStatusForUi(expense: Record<string, unknown>): string {
    if (expense['observado'] === true) return 'Observado';
    return this.mapExpenseStatusExport(
      typeof expense['status'] === 'string' ? expense['status'] : undefined
    );
  }

  getPopulatedName(field: unknown): string {
    if (field && typeof field === 'object' && field !== null && 'name' in field) {
      return String((field as { name: string }).name);
    }
    return '—';
  }

  getExpenseTypeKey(
    exp: Record<string, unknown>
  ): 'factura' | 'planilla_movilidad' | 'otros_gastos' {
    const t = exp['expenseType'];
    if (t === 'planilla_movilidad') return 'planilla_movilidad';
    if (t === 'otros_gastos') return 'otros_gastos';
    return 'factura';
  }

  mobilityRows(exp: Record<string, unknown>): Record<string, unknown>[] {
    const rows = exp['mobilityRows'];
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  }

  sunatBlock(exp: Record<string, unknown>): Record<string, unknown> | null {
    const d = this.getExpenseDataObject(exp);
    const s = d['sunatValidation'];
    if (s && typeof s === 'object') return s as Record<string, unknown>;
    return null;
  }

  reviewHistory(exp: Record<string, unknown>): Record<string, unknown>[] {
    const raw = exp['reviewHistory'];
    if (!Array.isArray(raw)) return [];
    return raw.filter(item => item && typeof item === 'object') as Record<string, unknown>[];
  }

  reviewActionLabel(action: unknown): string {
    return action === 'rejected' ? 'Rechazado' : 'Aprobado';
  }

  reviewDateText(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackMobilityRow(index: number, row: Record<string, unknown>): string {
    return `${index}-${String(row['fecha'] ?? '')}-${String(row['gestion'] ?? '').slice(0, 20)}`;
  }

  /** Acepta `unknown` para usar desde plantillas con `expense` de `@for` sin `unknown` en el pipe `number`. */
  getExpenseTotal(exp: unknown): number {
    if (exp == null || typeof exp !== 'object') return 0;
    const t = (exp as Record<string, unknown>)['total'];
    if (typeof t === 'number' && !Number.isNaN(t)) return t;
    const n = Number(t);
    return Number.isNaN(n) ? 0 : n;
  }

  mobilityRowTotal(row: Record<string, unknown>): number {
    const t = row['total'];
    if (typeof t === 'number' && !Number.isNaN(t)) return t;
    const n = Number(t);
    return Number.isNaN(n) ? 0 : n;
  }

  trackByExpenseId(_index: number, expense: { _id?: string }): string {
    return expense._id ?? `idx-${_index}`;
  }

  /**
   * La rendición sigue en revisión, por lo que el colaborador puede corregir un
   * comprobante que le rechazaron. El rechazo es por-comprobante: la rendición
   * permanece en `submitted` (revisión del coordinador) o `pending_accounting`
   * (revisión de contabilidad) mientras tanto, no en estado finalizado.
   */
  get canCorrectRejectedExpense(): boolean {
    if (!this.report || this.isAdminView) return false;
    if (this.report.lockedByCajaChica) return false;
    const correctable: IExpenseReport['status'][] = [
      'open',
      'rejected',
      'submitted',
      'pending_l1',
      'pending_accounting',
      'partially_paid',
    ];
    return correctable.includes(this.report.status);
  }

  /** El colaborador dueño puede editar/eliminar sus comprobantes pendientes (rendición abierta/rechazada) o corregir los que le rechazaron. */
  canMutateOwnExpense(expense: { createdBy?: string; status?: string }): boolean {
    const uid = this.userStateService.getUser()?._id;
    if (!uid) return false;
    if (String(expense.createdBy ?? '') !== String(uid)) return false;
    const st = expense.status ?? 'pending';
    if (st === 'approved') return false;
    // Comprobante rechazado por coordinador/contabilidad: corrección habilitada
    // mientras la rendición siga en revisión.
    if (st === 'rejected') return this.canCorrectRejectedExpense;
    // Pendiente / validación SUNAT: edición normal (rendición abierta o rechazada).
    return this.collaboratorCanEdit;
  }

  /** Coordinador (con permiso rendiciones) o Contabilidad pueden editar/eliminar cualquier comprobante pendiente. */
  get canMutateAsAdmin(): boolean {
    return (this.userStateService.isCoordinador() && this.userStateService.hasModulePermission('rendiciones'))
      || this.userStateService.isContabilidad();
  }

  canMutateExpense(expense: { createdBy?: string; status?: string }): boolean {
    if (this.canMutateOwnExpense(expense)) return true;
    if (!this.canMutateAsAdmin) return false;
    const reportStatus = this.report?.status;
    if (!reportStatus || ['approved', 'paid', 'settled', 'closed', 'cancelled'].includes(reportStatus)) return false;
    const st = expense.status ?? 'pending';
    return st !== 'approved' && st !== 'rejected';
  }

  goEditExpense(expenseId: string): void {
    this.router.navigate(['/invoices/edit', expenseId], {
      queryParams: { rendicionId: this.id },
    });
  }

  getReportStatusLabel(): string {
    if (!this.report) return '';
    // Saldo ya resuelto (trasladado o devuelto) => se muestra como Cerrada.
    if (this.isEffectivelyClosed) return 'Cerrada';
    if (this.report.isDirecta) {
      const directaLabels: Partial<Record<IExpenseReport['status'], string>> = {
        solicited: 'Solicitada',
        open: 'Abierta',
        submitted: 'Enviada',
        pending_l1: 'En solicitud',
        pending_accounting: 'Pendiente de Contabilidad',
        approved: 'Aprobada',
        rejected: 'Rechazada',
        reimbursed: 'Reembolsada',
        closed: 'Cerrada',
        cancelled: 'Cancelada',
      };
      return directaLabels[this.report.status] ?? this.report.status;
    }
    // Viático con pago registrado y en fase de carga de gastos.
    if (this.report.type === 'viatico' && this.report.status === 'open' && Number((this.report as any).viaticoPaidAmount ?? 0) > 0) {
      return 'Registrando gastos';
    }
    const labels: Partial<Record<IExpenseReport['status'], string>> = {
      solicited: 'Solicitada',
      open: 'Abierta',
      submitted: 'Enviada',
      pending_accounting: 'Aprobada por Coordinador',
      approved: 'Aprobada por Contabilidad',
      rejected: 'Rechazada',
      reimbursed: 'Reembolsada',
      closed: 'Cerrada',
      cancelled: 'Cancelada',
      // Estados de viáticos
      pending_l1: 'En solicitud',
      pending_l2: 'Aprobada por coordinador',
      viatico_approved: 'Aprobada',
      partially_paid: 'Pago parcial',
      paid: 'Pagada',
      settled: 'Liquidada',
      returned: 'Saldo devuelto',
    };
    return labels[this.report.status] ?? this.report.status;
  }

  /** Trazabilidad del flujo de aprobación paso a paso (VD-31). Ver `buildReportFlowSteps`. */
  flowSteps(): FlowStep[] {
    return buildReportFlowSteps(this.report);
  }

  getCollaboratorDisplayName(): string {
    const u = this.report?.userId;
    if (u == null) return '—';
    if (typeof u === 'object' && u !== null && 'name' in u) {
      const name = (u as { name?: string }).name;
      if (name) return name;
    }
    return '—';
  }

  getCollaboratorSignature(): string | undefined {
    const u = this.report?.userId;
    if (u == null) return undefined;
    if (typeof u === 'object' && u !== null && 'signature' in u) {
      return (u as { signature?: string }).signature;
    }
    return undefined;
  }

  getCollaboratorDni(): string | undefined {
    const u = this.report?.userId;
    if (u && typeof u === 'object' && 'dni' in u) {
      return (u as { dni?: string }).dni;
    }
    return undefined;
  }

  /**
   * DNI del colaborador para los PDFs/Excel. Usa el snapshot `idDocument` del reporte
   * y, si viene vacío (caso habitual: nunca se guardó), cae al DNI configurado en el
   * perfil del usuario (`userId.dni`, que el endpoint de detalle sí popula).
   */
  collaboratorDniForPdf(): string | undefined {
    return this.report?.idDocument || this.getCollaboratorDni();
  }

  getCollaboratorAccountNumber(): string | undefined {
    const u = this.report?.userId;
    if (u && typeof u === 'object' && 'bankAccount' in u) {
      const ba = (u as { bankAccount?: { accountNumber?: string; cci?: string } }).bankAccount;
      return ba?.cci || ba?.accountNumber;
    }
    return undefined;
  }

  getCollaboratorBankName(): string | undefined {
    const u = this.report?.userId;
    if (u && typeof u === 'object' && 'bankAccount' in u) {
      return (u as { bankAccount?: { bankName?: string } }).bankAccount?.bankName?.toUpperCase();
    }
    return undefined;
  }

  getApprovedByName(): string {
    const u = this.report?.approvedBy;
    if (u == null) return '—';
    if (typeof u === 'object' && u !== null && 'name' in u) {
      return (u as { name?: string }).name || '—';
    }
    return '—';
  }

  /** Coordinador que aprobó (para la firma en el PDF de planilla de movilidad, VD-33). */
  private coordinatorApprover(): { name?: string; signature?: string; dni?: string } | null {
    const u = (this.report as any)?.coordinatorApprovedBy;
    return u && typeof u === 'object' ? u : null;
  }

  getCoordinatorName(): string | undefined {
    return this.coordinatorApprover()?.name || undefined;
  }

  getCoordinatorSignature(): string | undefined {
    return this.coordinatorApprover()?.signature || undefined;
  }

  getCoordinatorDni(): string | undefined {
    return this.coordinatorApprover()?.dni || undefined;
  }

  getCreatedByName(): string {
    const u = this.report?.createdBy;
    if (u == null) return '—';
    if (typeof u === 'object' && u !== null && 'name' in u) {
      return (u as { name?: string }).name || '—';
    }
    return '—';
  }

  getProjectName(): string {
    const p = this.report?.projectId;
    if (p == null) return '—';
    if (typeof p === 'object' && p !== null && 'name' in p) {
      return (p as { name?: string }).name || '—';
    }
    return '—';
  }

  getExpenseProjectName(expense: Record<string, unknown>): string {
    const p = expense['proyectId'];
    if (p && typeof p === 'object' && 'name' in p) {
      const name = (p as { name?: string }).name;
      if (name) return name;
    }
    const rp = this.report?.projectId;
    if (rp && typeof rp === 'object' && 'name' in rp) {
      return (rp as { name?: string }).name || '';
    }
    return '';
  }

  get reportDateRange(): string {
    const r = this.report;
    if (!r) return '';
    if (r.startDate && r.endDate) return `${this.formatShortDate(r.startDate)} al ${this.formatShortDate(r.endDate)}`;
    if (r.startDate) return this.formatShortDate(r.startDate);
    return '';
  }

  private mapExpenseStatusExport(status?: string): string {
    const s = String(status || 'pending').toLowerCase();
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      approved: 'Aprobada',
      rejected: 'Rechazada',
      sunat_valid: 'Validado SUNAT',
      sunat_valid_not_ours: 'SUNAT (no propio)',
      sunat_not_found: 'SUNAT no encontrado',
      sunat_error: 'Error SUNAT',
    };
    return labels[s] || status || '—';
  }

  private getSettlementForExport(): RendicionExportData['settlement'] | undefined {
    const s = this.settlement as {
      advanceTotal?: number;
      expenseTotal?: number;
      difference?: number;
      type?: string;
    } | null;
    if (!s || typeof s !== 'object') return undefined;
    let typeLabel = 'Diferencia (S/)';
    if (s.type === 'devolucion') typeLabel = 'A devolver (S/)';
    else if (s.type === 'reembolso') typeLabel = 'A reembolsar (S/)';
    const diff = Number(s.difference) || 0;
    const displayAmount = s.type === 'reembolso' ? -diff : diff;
    return {
      advanceTotal: Number(s.advanceTotal) || 0,
      expenseTotal: Number(s.expenseTotal) || 0,
      difference: displayAmount,
      typeLabel,
    };
  }

  buildExportData(): RendicionExportData | null {
    if (!this.report) return null;
    const safeName = (this.report.title || 'rendicion')
      .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 50);
    const comprobantes = (this.report.expenseIds || []).map((exp: Record<string, unknown>) => {
      const dataObj = this.getExpenseDataObject(exp);
      const expType = exp['expenseType'] as string;
      let provider = exp['provider'] as string || dataObj['razonSocial'] as string || '';
      if (!provider && this.getExpenseTypeLabel(exp) === 'Planilla movilidad') {
        provider = 'Planilla de Movilidad';
      }
      let numDoc = '';
      if (expType === 'planilla_movilidad') {
        numDoc = typeof exp['internalCode'] === 'string' ? exp['internalCode'] : '';
      } else if (expType === 'recibo_caja') {
        const payload = dataObj['payload'];
        const p: Record<string, unknown> =
          typeof payload === 'string'
            ? (() => { try { return JSON.parse(payload) as Record<string, unknown>; } catch { return {}; } })()
            : (payload && typeof payload === 'object' ? payload as Record<string, unknown> : {});
        numDoc = p['numeroDocumento'] ? String(p['numeroDocumento']) : '';
      } else {
        numDoc = dataObj['serie'] && dataObj['correlativo']
          ? `${dataObj['serie']}-${dataObj['correlativo']}`
          : '';
      }

      const comentario = this.getExpenseComentario(exp);
      const placaVehiculo = this.getExpensePlaca(exp);
      const concepto = this.getExpenseConcepto(exp);
      // Rendición directa: el proyecto es individual por gasto. En el reporte solo va el código.
      const proyecto = this.resolveRowProjectLabel(exp['proyectId']);
      return {
        tipo: this.getExpenseTypeCode(exp),
        fecha: this.getExpenseDate(exp),
        descripcion: concepto,
        comentario: comentario || undefined,
        placaVehiculo: placaVehiculo || undefined,
        proyecto: proyecto || undefined,
        monto: Number(exp['total']) || 0,
        estadoComprobante: this.mapExpenseStatusExport(
          typeof exp['status'] === 'string' ? exp['status'] : undefined,
        ),
        proveedor: provider,
        numeroDocumento: numDoc
      };
    });
    const anticipos = this.advances.flatMap((a) => {
      const fechaSolicitud = a.createdAt ? this.formatEmissionDate(a.createdAt) : '—';
      const estado = this.ADVANCE_STATUS_LABELS[a.status] ?? a.status;
      return [{ descripcion: a.description, monto: a.amount, estado, fechaSolicitud }];
    });
    // Rendición directa con depósito de Contabilidad: el depósito funciona como
    // anticipo (igual que en la solicitud de viáticos), por lo que debe figurar
    // como una "Transferencia" en la columna Ingresos del reporte.
    if (this.hasDirectaDeposit && this.report.directaDeposit) {
      const dep = this.report.directaDeposit;
      const rawDate = dep.depositDate || dep.operationDate || dep.createdAt;
      const fechaSolicitud = rawDate ? this.formatEmissionDate(rawDate) : '—';
      anticipos.unshift({
        descripcion: 'Depósito de Contabilidad',
        monto: this.directaDeposited,
        estado: 'Depositado',
        fechaSolicitud,
      });
    }
    // Viático: lo pagado por contabilidad es un ingreso.
    if (this.report.type === 'viatico') {
      const viaticoPaid = Number(
        (this.report as { viaticoPaidAmount?: number }).viaticoPaidAmount ?? 0
      );
      const deposito = Math.round(viaticoPaid * 100) / 100;
      if (deposito > 0.01) {
        const pagos = (
          this.report as {
            viaticoPayments?: { transferDate?: string; createdAt?: string }[];
          }
        ).viaticoPayments;
        const rawDate =
          pagos?.[0]?.transferDate || pagos?.[0]?.createdAt || this.report.createdAt;
        const fechaSolicitud = rawDate ? this.formatEmissionDate(rawDate) : '—';
        anticipos.unshift({
          descripcion: 'Depósito de Contabilidad',
          monto: deposito,
          estado: 'Depositado',
          fechaSolicitud,
        });
      }
    }
    return {
      fileBaseName: `rendicion_${this.report.codigo || this.id}_${safeName}`.replace(/_+/g, '_'),
      // En directas el proyecto es por gasto: el título no debe llevar proyecto.
      titulo: this.report.isDirecta
        ? (this.report.title || this.report.description || 'Rendición directa')
        : (this.getProjectName() !== '—' ? this.getProjectName() : (this.report.title || 'Sin título')),
      isDirecta: !!this.report.isDirecta,
      estado: this.getReportStatusLabel(),
      codigo: this.report.codigo || undefined,
      gestion: this.report.gestion || undefined,
      descripcionRendicion: this.report.description || undefined,
      colaborador: this.getCollaboratorDisplayName(),
      presupuesto: this.report.budget ?? 0,
      totalGastado: this.totalGastado,
      totalAnticipado: this.totalAnticipado,
      saldoLibre: this.saldoLibre,
      fechaGeneracion: new Date().toLocaleString('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
      rejectionReason: this.report.rejectionReason,
      comprobantes,
      anticipos,
      settlement: this.getSettlementForExport(),
      // New fields
      accountNumber: this.report.accountNumber || this.getCollaboratorAccountNumber(),
      idDocument: this.collaboratorDniForPdf(),
      peopleNames: this.report.peopleNames,
      location: this.report.location,
      startDate: (this.report.startDate ?? this.report.viaticoStartDate) ? new Date((this.report.startDate ?? this.report.viaticoStartDate) as string).toLocaleDateString('es-PE') : undefined,
      endDate: (this.report.endDate ?? this.report.viaticoEndDate) ? new Date((this.report.endDate ?? this.report.viaticoEndDate) as string).toLocaleDateString('es-PE') : undefined,
      items: (this.report.items || []).map(i => ({
        descripcion: i.description,
        importe: i.amount,
        personas: i.peopleCount,
        combustible: i.fuelAmount,
        dias: i.daysCount,
        total: i.total
      })),
      signature: this.getCollaboratorSignature(),
      approvedByName: this.getApprovedByName(),
      createdByName: this.getCreatedByName(),
      projectName: this.getProjectName(),
    };
  }

  async exportRendicionExcel(): Promise<void> {
    const data = this.buildExportData();
    if (!data) {
      this.notificationService.show('No hay datos para exportar', 'error');
      return;
    }
    this.isExportingExcel.set(true);
    try {
      await this.rendicionExportService.exportToExcel(data);
      this.notificationService.show('Excel descargado correctamente', 'success');
    } catch {
      this.notificationService.show('No se pudo generar el Excel', 'error');
    } finally {
      this.isExportingExcel.set(false);
    }
  }

  exportRendicionPdf(): void {
    const data = this.buildExportData();
    if (!data) {
      this.notificationService.show('No hay datos para exportar', 'error');
      return;
    }
    this.isExportingPdf.set(true);
    try {
      this.rendicionExportService.exportToPdf(data);
      this.notificationService.show('PDF descargado correctamente', 'success');
    } catch {
      this.notificationService.show('No se pudo generar el PDF', 'error');
    } finally {
      this.isExportingPdf.set(false);
    }
  }

  private buildMobilityPageData(expense: Record<string, unknown>): MobilitySheetExportData {
    const rows = this.mobilityRows(expense).map(r => ({
      fecha: String(r['fecha'] || ''),
      origen: String(r['origen'] || ''),
      destino: String(r['destino'] || ''),
      gestion: String(r['gestion'] || ''),
      total: this.mobilityRowTotal(r),
      proyecto: this.resolveRowProjectLabel(r['proyectId']),
      colaborador: String(r['colaboradorNombre'] || this.getCollaboratorDisplayName() || ''),
    }));
    const total = rows.reduce((sum, r) => sum + (r.total || 0), 0);
    const firstFecha = rows.find(r => r.fecha)?.fecha;
    let periodo = '';
    if (firstFecha) {
      const d = new Date(firstFecha);
      if (!isNaN(d.getTime())) {
        periodo = d.toLocaleString('es-PE', { month: 'long' }).toUpperCase();
      }
    }
    return {
      fileBaseName: `planilla_movilidad_${String(expense['_id'] || 'sin_id')}`,
      collaborator: this.getCollaboratorDisplayName(),
      collaboratorDni: this.collaboratorDniForPdf(),
      internalCode: typeof expense['internalCode'] === 'string' ? expense['internalCode'] : undefined,
      location: this.report?.location,
      generatedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }),
      periodo,
      proyecto: this.getExpenseProjectName(expense),
      rows,
      total,
      signature: this.getCollaboratorSignature(),
      coordinator: this.getCoordinatorName(),
      coordinatorDni: this.getCoordinatorDni(),
      coordinatorSignature: this.getCoordinatorSignature(),
    };
  }

  private buildReceiptPageData(expense: Record<string, unknown>): ReceiptExportData {
    const dataObj = this.getExpenseDataObject(expense);
    return {
      fileBaseName: `recibo_caja_${String(expense['_id'] || 'sin_id')}`,
      collaborator: this.getCollaboratorDisplayName(),
      collaboratorDni: this.collaboratorDniForPdf(),
      razonSocial: String(dataObj['razonSocial'] || '—'),
      ruc: dataObj['ruc'] ? String(dataObj['ruc']) : undefined,
      numeroDocumento: dataObj['numeroDocumento'] ? String(dataObj['numeroDocumento']) : undefined,
      concepto: String(dataObj['concepto'] || this.getExpenseDescription(expense)),
      fecha: this.emissionDateText(expense),
      monto: this.getExpenseTotal(expense),
      signature: this.getCollaboratorSignature(),
    };
  }

  private buildAffidavitPageData(
    expense: Record<string, unknown>,
    titulo: string,
    mobilityRows?: MobilitySheetExportData['rows'],
    receiptFields?: Array<{ label: string; value: string }>,
    descripcion?: string,
  ): SingleExpenseAffidavitData {
    const client = this.userStateService.getUser()?.client;
    return {
      fileBaseName: `dj_${String(expense['_id'] || 'sin_id')}`,
      titulo,
      colaborador: String(expense['declaracionJuradaFirmante'] || this.getCollaboratorDisplayName()),
      colaboradorDni: this.collaboratorDniForPdf(),
      empresaNombre: client?.businessName,
      fechaGeneracion: new Date().toLocaleDateString('es-PE'),
      total: this.getExpenseTotal(expense),
      mobilityRows,
      receiptFields,
      descripcion,
      signature: this.getCollaboratorSignature(),
    };
  }

  private buildFacturaPageData(expense: Record<string, unknown>, index: number): FacturaPageData {
    const dataObj = this.getExpenseDataObject(expense);
    const tipoComp = String(dataObj['tipoComprobante'] || '');
    let tipo = 'Factura';
    if (tipoComp === '03') tipo = 'Boleta de Venta';
    else if (tipoComp === '12') tipo = 'Ticket';
    return {
      tipo,
      razonSocial: String(dataObj['razonSocial'] || ''),
      rucEmisor: String(dataObj['rucEmisor'] || ''),
      serie: String(dataObj['serie'] || ''),
      correlativo: String(dataObj['correlativo'] || ''),
      fechaEmision: this.emissionDateText(expense),
      montoTotal: this.getExpenseTotal(expense),
      moneda: String(dataObj['moneda'] || 'PEN'),
      comentario: this.getExpenseComentario(expense) || undefined,
      placaVehiculo: this.getExpensePlaca(expense) || undefined,
      descripcion: String(expense['description'] || dataObj['description'] || ''),
      index,
    };
  }

  private parseDateSafe(raw: string): Date | null {
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const [y, m, day] = raw.slice(0, 10).split('-').map(Number);
      return new Date(y, m - 1, day);
    }
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  private dateToYmd(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  private buildConsolidatedMobilityPageData(
    mobilityExpenses: Record<string, unknown>[],
  ): MobilitySheetExportData | null {
    if (!mobilityExpenses.length) return null;

    const totalAmount = Math.round(
      mobilityExpenses.reduce(
        (sum, exp) => sum + this.mobilityRows(exp).reduce((s, r) => s + this.mobilityRowTotal(r), 0),
        0,
      ) * 100,
    ) / 100;

    if (totalAmount <= 0) return null;

    const DAILY_RATE = 40;
    const rows: MobilitySheetExportData['rows'] = [];

    // Las rendiciones de anticipo guardan las fechas en startDate/endDate, pero las
    // de viatico unificado las guardan en viaticoStartDate/viaticoEndDate. Sin este
    // fallback el viatico cae al else y no separa el total en tramos de S/40 por dia.
    const startDate = this.parseDateSafe(
      (this.report?.startDate ?? this.report?.viaticoStartDate) as string ?? '',
    );
    const endDate = this.parseDateSafe(
      (this.report?.endDate ?? this.report?.viaticoEndDate) as string ?? '',
    );

    if (startDate && endDate) {
      const day2 = new Date(startDate);
      day2.setDate(day2.getDate() + 1);

      const msPerDay = 24 * 60 * 60 * 1000;
      const daysFromDay2 = Math.max(0, Math.round((endDate.getTime() - day2.getTime()) / msPerDay) + 1);
      const rowsNeeded = Math.ceil(totalAmount / DAILY_RATE);

      const cur = rowsNeeded <= daysFromDay2 ? new Date(day2) : new Date(startDate);

      let remaining = totalAmount;
      while (remaining > 0.005) {
        const dayAmount = Math.min(DAILY_RATE, Math.round(remaining * 100) / 100);
        rows.push({
          fecha: this.dateToYmd(cur),
          origen: '',
          destino: '',
          gestion: '',
          total: dayAmount,
          colaborador: this.getCollaboratorDisplayName(),
        });
        remaining = Math.round((remaining - dayAmount) * 100) / 100;
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      rows.push({
        fecha: '',
        origen: '',
        destino: '',
        gestion: '',
        total: totalAmount,
        colaborador: this.getCollaboratorDisplayName(),
      });
    }

    const periodo = startDate
      ? startDate.toLocaleString('es-PE', { month: 'long' }).toUpperCase()
      : '';

    return {
      fileBaseName: 'planilla_movilidad_consolidada',
      collaborator: this.getCollaboratorDisplayName(),
      collaboratorDni: this.collaboratorDniForPdf(),
      location: this.report?.location,
      generatedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }),
      periodo,
      proyecto: this.getProjectName(),
      rows,
      total: totalAmount,
      signature: this.getCollaboratorSignature(),
    };
  }

  async exportRendicionFullPdf(): Promise<void> {
    const summaryData = this.buildExportData();
    if (!summaryData) {
      this.notificationService.show('No hay datos para exportar', 'error');
      return;
    }
    const expenses = (this.report?.expenseIds || []) as Record<string, unknown>[];
    const pages: ComprobantePage[] = [];
    let facturaIndex = 0;

    const mobilityExpenses = expenses.filter(e => this.getExpenseTypeKey(e) === 'planilla_movilidad');
    let mobilityPageAdded = false;

    for (const exp of expenses) {
      const typeKey = this.getExpenseTypeKey(exp);
      const expType = exp['expenseType'] as string;

      if (typeKey === 'planilla_movilidad') {
        if (!mobilityPageAdded) {
          const consolidated = this.buildConsolidatedMobilityPageData(mobilityExpenses);
          if (consolidated) pages.push({ type: 'mobility', data: consolidated });
          mobilityPageAdded = true;
        }
      } else if (expType === 'recibo_caja') {
        pages.push({ type: 'receipt', data: this.buildReceiptPageData(exp) });
      } else if (typeKey === 'otros_gastos') {
        pages.push({
          type: 'affidavit',
          data: this.buildAffidavitPageData(
            exp,
            'OTROS GASTOS',
            undefined,
            undefined,
            String(exp['description'] || '—'),
          ),
        });
      } else {
        const fileUrl = this.getExpenseFileUrl(exp);
        if (fileUrl) {
          const label = String(exp['expenseType'] || 'Factura');
          if (/\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(fileUrl)) {
            pages.push({ type: 'factura_image', url: fileUrl, label });
          } else {
            pages.push({ type: 'factura_pdf', url: fileUrl, label });
          }
        } else {
          facturaIndex++;
          pages.push({ type: 'factura', data: this.buildFacturaPageData(exp, facturaIndex) });
        }
      }
    }

    this.isExportingFullPdf.set(true);
    try {
      await this.rendicionExportService.exportFullRendicionPdf(summaryData, pages);
      this.notificationService.show('PDF completo descargado', 'success');
    } catch {
      this.notificationService.show('No se pudo generar el PDF completo', 'error');
    } finally {
      this.isExportingFullPdf.set(false);
    }
  }

  affidavitCandidates(): Array<Record<string, unknown> & { _id: string }> {
    const expenses = (this.report?.expenseIds || []) as Array<Record<string, unknown>>;
    return expenses
      .filter(e => this.getExpenseTypeKey(e) === 'otros_gastos')
      .filter(e => typeof e['_id'] === 'string' && !!String(e['_id']).trim())
      .map(e => e as Record<string, unknown> & { _id: string });
  }

  canGenerateAffidavit(): boolean {
    return this.isAdminView && this.report?.status === 'closed';
  }

  openAffidavitModal(): void {
    if (!this.canGenerateAffidavit()) {
      this.notificationService.show(
        'La declaracion jurada solo se habilita cuando la rendicion esta cerrada.',
        'warning'
      );
      return;
    }
    const preselected = this.affidavitCandidates().map(e => e._id);
    this.affidavitSelectedExpenseIds.set(preselected);
    this.affidavitType.set('viaticos_nacionales');
    this.showAffidavitModal.set(true);
  }

  closeAffidavitModal(): void {
    if (this.isGeneratingAffidavit()) return;
    this.showAffidavitModal.set(false);
  }

  toggleAffidavitExpense(expenseId: string): void {
    const current = this.affidavitSelectedExpenseIds();
    if (current.includes(expenseId)) {
      this.affidavitSelectedExpenseIds.set(current.filter(id => id !== expenseId));
    } else {
      this.affidavitSelectedExpenseIds.set([...current, expenseId]);
    }
  }

  isAffidavitExpenseSelected(expenseId: string): boolean {
    return this.affidavitSelectedExpenseIds().includes(expenseId);
  }

  private buildAffidavitExportData(
    selectedExpenses: Array<Record<string, unknown> & { _id: string }>
  ): AffidavitExportData {
    const rows = selectedExpenses.map(exp => ({
      fecha: this.getExpenseDate(exp),
      documento: `${this.dataText(exp, 'serie')} - ${this.dataText(exp, 'correlativo')}`,
      concepto: this.getExpenseDescription(exp),
      categoria: this.getPopulatedName(exp['categoryId']),
      monto: this.getExpenseTotal(exp),
    }));
    const total = rows.reduce((sum, r) => sum + (r.monto || 0), 0);
    return {
      fileBaseName: `declaracion_jurada_${this.id}_${new Date().getTime()}`,
      tipo: this.affidavitType(),
      empresaNombre: this.companyConfigService.getCompanyConfig()?.businessName ?? '',
      empresaRuc: this.companyConfigService.getCompanyConfig()?.businessId ?? '',
      colaborador: this.getCollaboratorDisplayName(),
      documentoColaborador: this.collaboratorDniForPdf(),
      fechaGeneracion: new Date().toLocaleString('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
      total,
      rows,
      signature: this.getCollaboratorSignature(),
    };
  }

  generateAffidavit(): void {
    const selectedIds = this.affidavitSelectedExpenseIds();
    if (selectedIds.length === 0) {
      this.notificationService.show(
        'Selecciona al menos un comprobante para generar la declaracion jurada.',
        'warning'
      );
      return;
    }

    const selectedExpenses = this.affidavitCandidates().filter(e =>
      selectedIds.includes(e._id)
    );
    if (selectedExpenses.length === 0) {
      this.notificationService.show('No se encontraron comprobantes seleccionados.', 'error');
      return;
    }

    this.isGeneratingAffidavit.set(true);
    this.expenseReportsService
      .createAffidavit(this.id, {
        type: this.affidavitType(),
        expenseIds: selectedIds,
      })
      .subscribe({
        next: async () => {
          const data = this.buildAffidavitExportData(selectedExpenses);
          await this.rendicionExportService.exportAffidavitToPdf(data);
          this.isGeneratingAffidavit.set(false);
          this.showAffidavitModal.set(false);
          this.notificationService.show(
            'Declaracion jurada generada y registrada correctamente.',
            'success'
          );
        },
        error: (err) => {
          this.isGeneratingAffidavit.set(false);
          const raw = err?.error?.message;
          const msg = Array.isArray(raw) ? raw.join(', ') : raw;
          this.notificationService.show(
            msg || 'No se pudo generar la declaracion jurada.',
            'error'
          );
        },
      });
  }

  /**
   * Escanea (OCR/visión) un comprobante de depósito/transferencia ya subido y entrega
   * monto, fecha, hora, n° de operación y titular. Reutiliza el mismo endpoint que el
   * pago de anticipo y el depósito de rendición directa.
   */
  private scanComprobante(
    url: string,
    mimeType: string | undefined,
    scanning: WritableSignal<boolean>,
    onResult: (res: { amount: number; fecha?: string; hora?: string; operationNumber?: string; titular?: string }) => void
  ): void {
    scanning.set(true);
    this.expenseReportsService.scanDepositAmount(url, mimeType).subscribe({
      next: (res) => {
        scanning.set(false);
        onResult(res ?? { amount: 0 });
      },
      error: () => {
        scanning.set(false);
        this.notificationService.show('No se pudo escanear el comprobante. Completa los datos manualmente.', 'warning');
      },
    });
  }

  // ─── Cierre: voucher de devolucion (colaborador) ──────────────────────────

  showReturnVoucherModal = signal(false);
  isUploadingReturnVoucher = signal(false);
  isSubmittingReturnVoucher = signal(false);
  returnVoucherUrl = signal<string | null>(null);
  returnVoucherFileName = signal<string | null>(null);
  returnVoucherDepositDate = signal(new Date().toISOString().split('T')[0]);
  returnVoucherBank = signal('');
  returnVoucherOperation = signal('');
  // Datos detectados por el escaneo del comprobante
  isScanningReturnVoucher = signal(false);
  returnVoucherScannedAmount = signal<number | null>(null);
  returnVoucherTitular = signal<string | null>(null);
  returnVoucherOperationDate = signal<string | null>(null);
  returnVoucherOperationTime = signal<string | null>(null);

  /**
   * La rendición se considera cerrada (a efectos de visualización) cuando su
   * saldo pendiente ya fue devuelto por el colaborador mediante comprobante
   * de depósito. En ese caso el label y el badge deben mostrarse como "Cerrada".
   */
  get isEffectivelyClosed(): boolean {
    if (this.report?.status === 'closed') return true;
    if ((this.report as any)?.returnVoucher) return true;
    return false;
  }

  /** Devuelve true cuando el saldo esperado corresponde a una devolución del colaborador. */
  private get isDevolucionExpected(): boolean {
    const settlementType = this.effectiveSettlementType;
    return settlementType === 'devolucion' || (!settlementType && this.saldoLibre > 0.01);
  }

  /** Colaborador puede cargar su comprobante de devolución en cuanto la rendición está aprobada y tiene saldo a devolver. */
  get canUploadReturnVoucher(): boolean {
    if (this.isAdminView) return false;
    const status = this.report?.status;
    if (status !== 'approved' && status !== 'closed') return false;
    if (!this.isDevolucionExpected) return false;
    return !(this.report as any)?.returnVoucher;
  }

  /** Panel informativo para contabilidad: la rendición está aprobada con saldo a devolver pero el colaborador aún no adjuntó el comprobante. */
  get approvedPendingVoucher(): boolean {
    if (!this.isAdminView) return false;
    if (this.report?.status !== 'approved') return false;
    return this.isDevolucionExpected && !(this.report as any)?.returnVoucher;
  }

  /** Devuelve true cuando el saldo esperado corresponde a un reembolso al colaborador. */
  private get isReembolsoExpected(): boolean {
    const settlementType = this.effectiveSettlementType;
    return settlementType === 'reembolso' || (!settlementType && this.saldoLibre < -0.01);
  }

  /**
   * Registrar el reembolso al colaborador es una acción de TESORERÍA (VD-37):
   * lo registra Tesorería o SuperAdmin (o un delegado con L2), nunca Contabilidad
   * ni el Coordinador. Mismo criterio que el backend en
   * register-reimbursement-payment (canPay). No se exige `isAdminView` porque
   * Tesorería no forma parte de esa vista; basta con que no sea su propia
   * rendición y tenga el rol de pago.
   */
  get canAdminRegisterReembolso(): boolean {
    if (this.isOwnReport) return false;
    if (this.userStateService.isCoordinador()) return false;
    // Solo Tesorería (o SuperAdmin como override). NO se usa canApproveL2() porque
    // en el frontend hace short-circuit a true para Contabilidad, que justamente
    // NO debe registrar el reembolso (VD-37); el backend ya excluye a Contabilidad.
    const canPay =
      this.userStateService.isTesoreria() ||
      this.userStateService.isSuperAdmin();
    if (!canPay) return false;
    const status = this.report?.status;
    if (status !== 'approved' && status !== 'reimbursed' && status !== 'closed') return false;
    if (!this.isReembolsoExpected) return false;
    return !this.report?.reimbursementPaymentInfo;
  }

  openReturnVoucherModal(): void {
    this.returnVoucherUrl.set(null);
    this.returnVoucherFileName.set(null);
    this.returnVoucherDepositDate.set(new Date().toISOString().split('T')[0]);
    this.returnVoucherBank.set(this.getCollaboratorBankName() ?? '');
    this.returnVoucherOperation.set('');
    this.returnVoucherScannedAmount.set(null);
    this.returnVoucherTitular.set(null);
    this.returnVoucherOperationDate.set(null);
    this.returnVoucherOperationTime.set(null);
    this.showReturnVoucherModal.set(true);
  }

  get returnVoucherHasDetectedData(): boolean {
    return !!(this.returnVoucherTitular() || this.returnVoucherOperationDate() || this.returnVoucherOperationTime() || this.returnVoucherScannedAmount());
  }

  onReturnVoucherFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      this.notificationService.show('Formato invalido. Usa PDF, JPG o PNG.', 'error');
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.notificationService.show('El archivo no puede superar 10MB.', 'error');
      input.value = '';
      return;
    }
    this.isUploadingReturnVoucher.set(true);
    this.uploadService.upload(file).subscribe({
      next: (res) => {
        this.returnVoucherUrl.set(res.url);
        this.returnVoucherFileName.set(file.name);
        this.notificationService.show('Comprobante subido', 'success');
        this.isUploadingReturnVoucher.set(false);
        this.scanComprobante(res.url, file.type, this.isScanningReturnVoucher, (r) => {
          this.returnVoucherScannedAmount.set(Number(r.amount) > 0 ? Number(r.amount) : null);
          this.returnVoucherTitular.set(r.titular || null);
          this.returnVoucherOperationDate.set(r.fecha || null);
          this.returnVoucherOperationTime.set(r.hora || null);
          if (r.operationNumber && !this.returnVoucherOperation()) this.returnVoucherOperation.set(r.operationNumber);
          if (this.returnVoucherHasDetectedData) {
            this.notificationService.show('Datos detectados del comprobante.', 'success');
          }
        });
      },
      error: () => {
        this.notificationService.show('No se pudo subir el comprobante', 'error');
        this.isUploadingReturnVoucher.set(false);
      },
    });
  }

  submitReturnVoucher(): void {
    const fileUrl = this.returnVoucherUrl();
    if (!fileUrl || !this.returnVoucherDepositDate()) {
      this.notificationService.show('Sube el comprobante e ingresa la fecha de deposito', 'warning');
      return;
    }
    this.isSubmittingReturnVoucher.set(true);
    this.expenseReportsService.registerReturnVoucher(this.id, {
      depositDate: this.returnVoucherDepositDate(),
      bankOrigin: this.returnVoucherBank() || undefined,
      operationNumber: this.returnVoucherOperation() || undefined,
      fileUrl,
      fileName: this.returnVoucherFileName() || undefined,
      scannedAmount: this.returnVoucherScannedAmount() ?? undefined,
      operationDate: this.returnVoucherOperationDate() || undefined,
      operationTime: this.returnVoucherOperationTime() || undefined,
      titular: this.returnVoucherTitular() || undefined,
    }).subscribe({
      next: (res) => {
        this.report = res;
        this.calculateTotals();
        this.showReturnVoucherModal.set(false);
        this.isSubmittingReturnVoucher.set(false);
        this.notificationService.show('Comprobante de devolucion enviado correctamente', 'success');
      },
      error: (err) => {
        this.isSubmittingReturnVoucher.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al enviar el comprobante', 'error');
      },
    });
  }

  // ─── Cierre: reembolso al colaborador (admin) ─────────────────────────────

  showAdminReembolsoModal = signal(false);
  isUploadingAdminReembolso = signal(false);
  isSubmittingAdminReembolso = signal(false);
  adminReembolsoUrl = signal<string | null>(null);
  adminReembolsoFileName = signal<string | null>(null);
  adminReembolsoDate = signal(new Date().toISOString().split('T')[0]);
  adminReembolsoBank = signal('');
  adminReembolsoRef = signal('');
  adminReembolsoMonto = signal<number | null>(null);
  adminReembolsoMethod = signal<'transferencia_bancaria' | 'efectivo' | 'cheque'>('transferencia_bancaria');
  // Datos detectados por el escaneo del comprobante
  isScanningAdminReembolso = signal(false);
  adminReembolsoScannedAmount = signal<number | null>(null);
  adminReembolsoTitular = signal<string | null>(null);
  adminReembolsoOperationDate = signal<string | null>(null);
  adminReembolsoOperationTime = signal<string | null>(null);

  openAdminReembolsoModal(): void {
    this.adminReembolsoUrl.set(null);
    this.adminReembolsoFileName.set(null);
    this.adminReembolsoDate.set(new Date().toISOString().split('T')[0]);
    this.adminReembolsoBank.set('');
    this.adminReembolsoRef.set('');
    // Precarga el monto con el saldo a favor del colaborador (editable).
    const expected = Math.abs(Number(this.saldoLibre) || 0);
    this.adminReembolsoMonto.set(expected > 0.001 ? Number(expected.toFixed(2)) : null);
    this.adminReembolsoMethod.set('transferencia_bancaria');
    this.adminReembolsoScannedAmount.set(null);
    this.adminReembolsoTitular.set(null);
    this.adminReembolsoOperationDate.set(null);
    this.adminReembolsoOperationTime.set(null);
    this.showAdminReembolsoModal.set(true);
  }

  get adminReembolsoHasDetectedData(): boolean {
    return !!(this.adminReembolsoTitular() || this.adminReembolsoOperationDate() || this.adminReembolsoOperationTime() || this.adminReembolsoScannedAmount());
  }

  onAdminReembolsoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      this.notificationService.show('Formato invalido. Usa PDF, JPG o PNG.', 'error');
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.notificationService.show('El archivo no puede superar 10MB.', 'error');
      input.value = '';
      return;
    }
    this.isUploadingAdminReembolso.set(true);
    this.uploadService.upload(file).subscribe({
      next: (res) => {
        this.adminReembolsoUrl.set(res.url);
        this.adminReembolsoFileName.set(file.name);
        this.notificationService.show('Comprobante subido', 'success');
        this.isUploadingAdminReembolso.set(false);
        this.scanComprobante(res.url, file.type, this.isScanningAdminReembolso, (r) => {
          this.adminReembolsoScannedAmount.set(Number(r.amount) > 0 ? Number(r.amount) : null);
          this.adminReembolsoTitular.set(r.titular || null);
          this.adminReembolsoOperationDate.set(r.fecha || null);
          this.adminReembolsoOperationTime.set(r.hora || null);
          if (r.operationNumber && !this.adminReembolsoRef()) this.adminReembolsoRef.set(r.operationNumber);
          if (this.adminReembolsoHasDetectedData) {
            this.notificationService.show('Datos detectados del comprobante.', 'success');
          }
        });
      },
      error: () => {
        this.notificationService.show('No se pudo subir el comprobante', 'error');
        this.isUploadingAdminReembolso.set(false);
      },
    });
  }

  submitAdminReembolso(): void {
    const fileUrl = this.adminReembolsoUrl();
    const method = this.adminReembolsoMethod();
    if (!this.adminReembolsoDate()) {
      this.notificationService.show('Ingresa la fecha de pago', 'warning');
      return;
    }
    const monto = this.adminReembolsoMonto();
    if (monto == null || monto <= 0) {
      this.notificationService.show('Ingresa el monto del reembolso', 'warning');
      return;
    }
    if (method !== 'efectivo' && !fileUrl) {
      this.notificationService.show('Sube el comprobante de pago', 'warning');
      return;
    }
    this.isSubmittingAdminReembolso.set(true);
    this.expenseReportsService.registerReimbursementPayment(this.id, {
      method,
      bankName: this.adminReembolsoBank() || undefined,
      transferDate: this.adminReembolsoDate(),
      reference: this.adminReembolsoRef() || undefined,
      paymentReceiptUrl: fileUrl || undefined,
      paymentReceiptFileName: this.adminReembolsoFileName() || undefined,
      scannedAmount: monto,
      operationNumber: this.adminReembolsoRef() || undefined,
      operationDate: this.adminReembolsoOperationDate() || undefined,
      operationTime: this.adminReembolsoOperationTime() || undefined,
      titular: this.adminReembolsoTitular() || undefined,
    }).subscribe({
      next: (res) => {
        this.report = res;
        this.calculateTotals();
        this.showAdminReembolsoModal.set(false);
        this.isSubmittingAdminReembolso.set(false);
        this.notificationService.show('Reembolso registrado correctamente', 'success');
      },
      error: (err) => {
        this.isSubmittingAdminReembolso.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al registrar el reembolso', 'error');
      },
    });
  }

  // ─── Fase 7 — Devolución de saldo ─────────────────────────────────────────

  showReturnProofModal = signal(false);
  returnProofAdvanceId = signal<string | null>(null);
  isUploadingReturnProof = signal(false);
  isSubmittingReturnProof = signal(false);
  returnProofUrl = signal<string | null>(null);
  returnProofFileName = signal<string | null>(null);
  returnProofDepositDate = signal(new Date().toISOString().split('T')[0]);
  returnProofAmount = signal<number | null>(null);
  returnProofBank = signal('');
  returnProofOperation = signal('');
  returnProofNote = signal('');
  // Datos detectados por el escaneo del comprobante
  isScanningReturnProof = signal(false);
  returnProofScannedAmount = signal<number | null>(null);
  returnProofTitular = signal<string | null>(null);
  returnProofOperationDate = signal<string | null>(null);
  returnProofOperationTime = signal<string | null>(null);

  get returnProofHasDetectedData(): boolean {
    return !!(this.returnProofTitular() || this.returnProofOperationDate() || this.returnProofOperationTime() || this.returnProofScannedAmount());
  }

  get advancesWithPendingReturn(): typeof this.advances {
    return this.advances.filter(
      a => a.returnRecord && ['pending', 'rejected'].includes(a.returnRecord.status)
    );
  }

  returnRecordStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'Pendiente',
      proof_uploaded: 'Comprobante enviado',
      validated: 'Validado',
      rejected: 'Rechazado',
    };
    return map[status] ?? status;
  }

  returnRecordStatusColor(status: string): string {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      proof_uploaded: 'bg-blue-100 text-blue-700',
      validated: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return map[status] ?? 'bg-gray-100 text-gray-600';
  }

  openReturnProofModal(advanceId: string, amountDue: number): void {
    this.returnProofAdvanceId.set(advanceId);
    this.returnProofAmount.set(amountDue);
    this.returnProofUrl.set(null);
    this.returnProofFileName.set(null);
    this.returnProofDepositDate.set(new Date().toISOString().split('T')[0]);
    this.returnProofBank.set(this.getCollaboratorBankName() ?? '');
    this.returnProofOperation.set('');
    this.returnProofNote.set('');
    this.returnProofScannedAmount.set(null);
    this.returnProofTitular.set(null);
    this.returnProofOperationDate.set(null);
    this.returnProofOperationTime.set(null);
    this.showReturnProofModal.set(true);
  }

  onReturnProofFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      this.notificationService.show('Formato invalido. Usa PDF, JPG o PNG.', 'error');
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.notificationService.show('El archivo no puede superar 10MB.', 'error');
      input.value = '';
      return;
    }
    this.isUploadingReturnProof.set(true);
    this.uploadService.upload(file).subscribe({
      next: (res) => {
        this.returnProofUrl.set(res.url);
        this.returnProofFileName.set(file.name);
        this.notificationService.show('Comprobante subido', 'success');
        this.isUploadingReturnProof.set(false);
        this.scanComprobante(res.url, file.type, this.isScanningReturnProof, (r) => {
          this.returnProofScannedAmount.set(Number(r.amount) > 0 ? Number(r.amount) : null);
          this.returnProofTitular.set(r.titular || null);
          this.returnProofOperationDate.set(r.fecha || null);
          this.returnProofOperationTime.set(r.hora || null);
          if (r.operationNumber && !this.returnProofOperation()) this.returnProofOperation.set(r.operationNumber);
          if (this.returnProofHasDetectedData) {
            this.notificationService.show('Datos detectados del comprobante.', 'success');
          }
        });
      },
      error: () => {
        this.notificationService.show('No se pudo subir el comprobante', 'error');
        this.isUploadingReturnProof.set(false);
      },
    });
  }

  submitReturnProof(): void {
    const id = this.returnProofAdvanceId();
    const fileUrl = this.returnProofUrl();
    const amountReturned = this.returnProofAmount();
    if (!id || !fileUrl || !amountReturned || !this.returnProofBank() || !this.returnProofOperation()) {
      this.notificationService.show('Completa todos los campos obligatorios', 'warning');
      return;
    }
    this.isSubmittingReturnProof.set(true);
    this.advanceService.uploadReturnProof(id, {
      depositDate: this.returnProofDepositDate() as any,
      amountReturned,
      bankOrigin: this.returnProofBank(),
      operationNumber: this.returnProofOperation(),
      fileUrl,
      note: this.returnProofNote() || undefined,
      scannedAmount: this.returnProofScannedAmount() ?? undefined,
      operationDate: this.returnProofOperationDate() || undefined,
      operationTime: this.returnProofOperationTime() || undefined,
      titular: this.returnProofTitular() || undefined,
    }).subscribe({
      next: () => {
        this.notificationService.show('Comprobante enviado correctamente', 'success');
        this.showReturnProofModal.set(false);
        this.isSubmittingReturnProof.set(false);
        this.loadAdvances();
      },
      error: (err) => {
        this.isSubmittingReturnProof.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al enviar comprobante', 'error');
      },
    });
  }

  // ─── Fase 8 — Cierre Definitivo ────────────────────────────────────────────

  showCloseModal = signal(false);
  isClosing = signal(false);
  closureErrors = signal<string[]>([]);
  isValidatingClosure = signal(false);

  showReopenRequestModal = signal(false);
  reopenReason = signal('');
  isRequestingReopen = signal(false);

  showReopenApproveModal = signal(false);
  isApprovingReopen = signal(false);

  get closureRecord(): any {
    return (this.report as any)?.closureRecord;
  }

  get isClosed(): boolean {
    return this.report?.status === 'closed';
  }

  get canClose(): boolean {
    const hasClosePermission = this.userStateService.isContabilidad() || this.userStateService.isSuperAdmin();
    if (!hasClosePermission) return false;
    if (this.report?.status !== 'approved' && this.report?.status !== 'reimbursed') return false;
    if (this.isDevolucionExpected && !(this.report as any)?.returnVoucher) return false;
    if (this.isReembolsoExpected && !this.report?.reimbursementPaymentInfo) return false;
    return true;
  }

  get canRequestReopen(): boolean {
    return this.isAdminView && this.isClosed &&
      this.closureRecord?.reopeningStatus === 'none';
  }

  get canApproveReopen(): boolean {
    return this.isAdminView && this.isClosed &&
      this.closureRecord?.reopeningStatus === 'requested';
  }

  openCloseModal(): void {
    this.closureErrors.set([]);
    this.isValidatingClosure.set(true);
    this.expenseReportsService.validateClosure(this.id).subscribe({
      next: (errors) => {
        this.closureErrors.set(errors);
        this.isValidatingClosure.set(false);
        this.showCloseModal.set(true);
      },
      error: () => {
        this.isValidatingClosure.set(false);
        this.notificationService.show('Error al validar condiciones de cierre', 'error');
      },
    });
  }

  closeCloseModal(): void {
    if (this.isClosing()) return;
    this.showCloseModal.set(false);
  }

  confirmClose(): void {
    if (this.closureErrors().length > 0) return;
    this.isClosing.set(true);
    this.expenseReportsService.close(this.id).subscribe({
      next: () => {
        this.isClosing.set(false);
        this.showCloseModal.set(false);
        this.notificationService.show('Rendicion cerrada definitivamente', 'success');
        this.loadReport();
      },
      error: (err) => {
        this.isClosing.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al cerrar la rendicion', 'error');
      },
    });
  }

  openReopenRequestModal(): void {
    this.reopenReason.set('');
    this.showReopenRequestModal.set(true);
  }

  submitReopenRequest(): void {
    const reason = this.reopenReason().trim();
    if (reason.length < 200) {
      this.notificationService.show('El motivo debe tener al menos 200 caracteres', 'warning');
      return;
    }
    this.isRequestingReopen.set(true);
    this.expenseReportsService.requestReopening(this.id, reason).subscribe({
      next: (res) => {
        this.report = res;
        this.isRequestingReopen.set(false);
        this.showReopenRequestModal.set(false);
        this.notificationService.show('Solicitud de reapertura enviada', 'success');
      },
      error: (err) => {
        this.isRequestingReopen.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al solicitar reapertura', 'error');
      },
    });
  }

  confirmReopenApproval(approve: boolean): void {
    this.isApprovingReopen.set(true);
    this.expenseReportsService.approveReopening(this.id, approve).subscribe({
      next: (res) => {
        this.report = res;
        this.isApprovingReopen.set(false);
        this.showReopenApproveModal.set(false);
        this.notificationService.show(
          approve ? 'Reapertura aprobada' : 'Solicitud de reapertura rechazada',
          'success'
        );
      },
      error: (err) => {
        this.isApprovingReopen.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al procesar reapertura', 'error');
      },
    });
  }

  // ─── Editar / Cancelar / Eliminar solicitud de viáticos pendiente ────────────

  editingAdvance = signal<IAdvance | null>(null);
  showEditAdvanceModal = signal(false);
  showCancelAdvanceModal = signal(false);
  cancellingAdvanceId = signal<string | null>(null);
  isCancellingAdvance = signal(false);

  openEditAdvanceModal(adv: IAdvance): void {
    this.editingAdvance.set(adv);
    this.showEditAdvanceModal.set(true);
  }

  onEditAdvanceClosed(success: boolean): void {
    this.editingAdvance.set(null);
    this.showEditAdvanceModal.set(false);
    if (success) this.loadAdvances();
  }

  openCancelAdvanceModal(adv: IAdvance): void {
    this.cancellingAdvanceId.set(adv._id);
    this.showCancelAdvanceModal.set(true);
  }

  confirmCancelAdvance(): void {
    const id = this.cancellingAdvanceId();
    if (!id) return;
    this.isCancellingAdvance.set(true);
    this.advanceService.cancelAdvance(id).subscribe({
      next: () => {
        this.isCancellingAdvance.set(false);
        this.showCancelAdvanceModal.set(false);
        this.cancellingAdvanceId.set(null);
        this.notificationService.show('Solicitud de viaticos cancelada', 'success');
        this.loadAdvances();
      },
      error: (err) => {
        this.isCancellingAdvance.set(false);
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al cancelar la solicitud', 'error');
      },
    });
  }

  // ─── Cancelar / Eliminar rendición solicitada ────────────────────────────────

  /** Colaborador puede cancelar o eliminar solo cuando la rendición está pendiente de aprobación. */
  get canCancelOrDelete(): boolean {
    return !this.isAdminView && this.report?.status === 'solicited';
  }

  showCancelModal = signal(false);
  cancelReason = signal('');
  isCancelling = signal(false);

  openCancelModal(): void {
    this.cancelReason.set('');
    this.showCancelModal.set(true);
  }

  confirmCancelReport(): void {
    this.isCancelling.set(true);
    this.expenseReportsService
      .cancelRendicion(this.id, this.cancelReason().trim() || undefined)
      .subscribe({
        next: (res) => {
          this.report = res;
          this.isCancelling.set(false);
          this.showCancelModal.set(false);
          this.notificationService.show('Rendicion cancelada correctamente', 'success');
        },
        error: (err) => {
          this.isCancelling.set(false);
          const raw = err?.error?.message;
          const msg = Array.isArray(raw) ? raw.join(', ') : raw;
          this.notificationService.show(msg || 'Error al cancelar la rendicion', 'error');
        },
      });
  }

  async exportMobilitySheet(expense: Record<string, unknown>): Promise<void> {
    if (this.getExpenseTypeKey(expense) !== 'planilla_movilidad') return;
    await this.rendicionExportService.exportMobilitySheetToPdf(this.buildMobilityPageData(expense));
    this.notificationService.show('Planilla de movilidad descargada en PDF', 'success');
  }

  async exportMobilitySheetExcel(expense: Record<string, unknown>): Promise<void> {
    if (this.getExpenseTypeKey(expense) !== 'planilla_movilidad') return;
    const rows = this.mobilityRows(expense).map(r => ({
      fecha: String(r['fecha'] || ''),
      origen: String(r['origen'] || ''),
      destino: String(r['destino'] || ''),
      gestion: String(r['gestion'] || ''),
      total: this.mobilityRowTotal(r),
      proyecto: this.resolveRowProjectLabel(r['proyectId']),
      colaborador: String(r['colaboradorNombre'] || this.getCollaboratorDisplayName() || ''),
    }));
    const total = rows.reduce((sum, r) => sum + (r.total || 0), 0);
    const firstFecha = rows.find(r => r.fecha)?.fecha;
    let periodo = '';
    if (firstFecha) {
      const d = new Date(firstFecha);
      if (!isNaN(d.getTime())) {
        periodo = d.toLocaleString('es-PE', { month: 'long' }).toUpperCase();
      }
    }
    const data: MobilitySheetExportData = {
      fileBaseName: `planilla_movilidad_${String(expense['_id'] || 'sin_id')}`,
      collaborator: this.getCollaboratorDisplayName(),
      collaboratorDni: this.collaboratorDniForPdf(),
      internalCode: typeof expense['internalCode'] === 'string' ? expense['internalCode'] : undefined,
      location: this.report?.location,
      generatedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }),
      periodo,
      proyecto: this.getExpenseProjectName(expense),
      rows,
      total,
      signature: this.getCollaboratorSignature(),
    };
    await this.rendicionExportService.exportMobilitySheetToExcel(data);
    this.notificationService.show('Planilla de movilidad descargada en Excel', 'success');
  }

  async exportMobilityAffidavit(expense: Record<string, unknown>): Promise<void> {
    if (this.getExpenseTypeKey(expense) !== 'planilla_movilidad') return;
    const rows = this.mobilityRows(expense).map(r => ({
      fecha: String(r['fecha'] || ''),
      origen: String(r['origen'] || ''),
      destino: String(r['destino'] || ''),
      gestion: String(r['gestion'] || ''),
      total: this.mobilityRowTotal(r),
      colaborador: String(r['colaboradorNombre'] || this.getCollaboratorDisplayName() || ''),
    }));
    const total = rows.reduce((sum, r) => sum + (r.total || 0), 0);
    const client = this.userStateService.getUser()?.client;
    const data: SingleExpenseAffidavitData = {
      fileBaseName: `dj_planilla_movilidad_${String(expense['_id'] || 'sin_id')}`,
      titulo: 'PLANILLA DE MOVILIDAD',
      colaborador: this.getCollaboratorDisplayName(),
      colaboradorDni: this.collaboratorDniForPdf(),
      empresaNombre: client?.businessName,
      fechaGeneracion: new Date().toLocaleDateString('es-PE'),
      total,
      mobilityRows: rows,
      signature: this.getCollaboratorSignature(),
    };
    await this.rendicionExportService.exportSingleExpenseAffidavitToPdf(data);
    this.notificationService.show('Declaración jurada descargada', 'success');
  }

  async exportReceiptPdf(expense: Record<string, unknown>): Promise<void> {
    if (expense['expenseType'] !== 'recibo_caja') return;
    const dataObj = this.getExpenseDataObject(expense);
    const fecha = this.emissionDateText(expense);
    const data: ReceiptExportData = {
      fileBaseName: `recibo_caja_${String(expense['_id'] || 'sin_id')}`,
      collaborator: this.getCollaboratorDisplayName(),
      collaboratorDni: this.collaboratorDniForPdf(),
      razonSocial: String(dataObj['razonSocial'] || '—'),
      ruc: dataObj['ruc'] ? String(dataObj['ruc']) : undefined,
      numeroDocumento: dataObj['numeroDocumento'] ? String(dataObj['numeroDocumento']) : undefined,
      concepto: String(dataObj['concepto'] || this.getExpenseDescription(expense)),
      fecha,
      monto: this.getExpenseTotal(expense),
      signature: this.getCollaboratorSignature(),
    };
    await this.rendicionExportService.exportReceiptToPdf(data);
    this.notificationService.show('Recibo de caja descargado en PDF', 'success');
  }

  async exportReceiptAffidavit(expense: Record<string, unknown>): Promise<void> {
    if (expense['expenseType'] !== 'recibo_caja') return;
    const dataObj = this.getExpenseDataObject(expense);
    const fecha = this.emissionDateText(expense);
    const client = this.userStateService.getUser()?.client;
    const receiptFields = [
      { label: 'Proveedor', value: String(dataObj['razonSocial'] || '—') },
      { label: 'RUC', value: String(dataObj['ruc'] || '—') },
      { label: 'N° Documento', value: String(dataObj['numeroDocumento'] || '—') },
      { label: 'Concepto', value: String(dataObj['concepto'] || '—') },
      { label: 'Fecha', value: fecha },
    ];
    const data: SingleExpenseAffidavitData = {
      fileBaseName: `dj_recibo_caja_${String(expense['_id'] || 'sin_id')}`,
      titulo: 'RECIBO DE CAJA',
      colaborador: this.getCollaboratorDisplayName(),
      colaboradorDni: this.collaboratorDniForPdf(),
      empresaNombre: client?.businessName,
      fechaGeneracion: new Date().toLocaleDateString('es-PE'),
      total: this.getExpenseTotal(expense),
      receiptFields,
      signature: this.getCollaboratorSignature(),
    };
    await this.rendicionExportService.exportSingleExpenseAffidavitToPdf(data);
    this.notificationService.show('Declaración jurada descargada', 'success');
  }

  async exportOtherExpenseAffidavit(expense: Record<string, unknown>): Promise<void> {
    if (this.getExpenseTypeKey(expense) !== 'otros_gastos') return;
    const client = this.userStateService.getUser()?.client;
    const data: SingleExpenseAffidavitData = {
      fileBaseName: `dj_otros_gastos_${String(expense['_id'] || 'sin_id')}`,
      titulo: 'OTROS GASTOS',
      colaborador: String(expense['declaracionJuradaFirmante'] || this.getCollaboratorDisplayName()),
      colaboradorDni: this.collaboratorDniForPdf(),
      empresaNombre: client?.businessName,
      fechaGeneracion: new Date().toLocaleDateString('es-PE'),
      total: this.getExpenseTotal(expense),
      descripcion: String(expense['description'] || '—'),
      signature: this.getCollaboratorSignature(),
    };
    await this.rendicionExportService.exportSingleExpenseAffidavitToPdf(data);
    this.notificationService.show('Declaración jurada descargada', 'success');
  }

  // ─── Aprobación dual de comprobantes ─────────────────────────────────────────

  get canApproveExpenseAsCoord(): boolean {
    return this.userStateService.isCoordinador() && this.userStateService.hasModulePermission('rendiciones')
      || this.userStateService.isAdmin() || this.userStateService.isSuperAdmin();
  }

  get canApproveExpenseAsCont(): boolean {
    return this.userStateService.isContabilidad() || this.userStateService.isSuperAdmin();
  }

  get canReopen(): boolean {
    return this.userStateService.isContabilidad() || this.userStateService.isSuperAdmin();
  }

  get batchApproveCount(): number {
    const expenses = this.expensesPage()?.data ?? [];
    return expenses.filter((e: any) => {
      const contStatus = e.approvalCont?.status ?? 'pending';
      const coordStatus = e.approvalCoord?.status ?? 'pending';
      return contStatus === 'approved' && coordStatus !== 'approved';
    }).length;
  }

  get collaboratorBatchCount(): number {
    const expenses = this.expensesPage()?.data ?? [];
    return expenses.filter((e: any) => {
      const contStatus = e.approvalCont?.status ?? 'pending';
      return contStatus === 'approved' && e.status !== 'approved';
    }).length;
  }

  getExpenseApprovalCoord(expense: any): { status: string; userName?: string } {
    return expense.approvalCoord ?? { status: 'pending' };
  }

  getExpenseApprovalCont(expense: any): { status: string; userName?: string } {
    return expense.approvalCont ?? { status: 'pending' };
  }

  approveExpenseByRole(expenseId: string, role: 'coord' | 'cont'): void {
    const label = role === 'coord' ? 'Coordinador' : 'Contabilidad';
    this.confirmationService.show(
      `¿Aprobar este comprobante como ${label}? Esta acción no se puede deshacer.`,
      () => this._doApproveExpenseByRole(expenseId, role)
    );
  }

  private _doApproveExpenseByRole(expenseId: string, role: 'coord' | 'cont'): void {
    this.approvingExpenseRoleId.set(`${role}:${expenseId}`);
    const call$ = role === 'coord'
      ? this.invoicesService.approveByCoord(expenseId)
      : this.invoicesService.approveByContabilidad(expenseId);
    call$.subscribe({
      next: () => {
        this.approvingExpenseRoleId.set(null);
        this.loadExpensesPage(this.expensesPage()?.page ?? 1);
        this.refreshReport();
      },
      error: (e) => {
        this.approvingExpenseRoleId.set(null);
        this.notificationService.show(e?.error?.message ?? 'Error al aprobar', 'error');
      },
    });
  }

  openRejectRoleModal(expenseId: string, role: 'coord' | 'cont'): void {
    this.pendingRejectRoleExpenseId.set(expenseId);
    this.pendingRejectRole.set(role);
    this.rejectRoleReason.set('');
    this.showRejectRoleModal.set(true);
  }

  closeRejectRoleModal(): void {
    this.showRejectRoleModal.set(false);
    this.pendingRejectRoleExpenseId.set(null);
    this.pendingRejectRole.set(null);
    this.rejectRoleReason.set('');
  }

  confirmRejectExpenseByRole(): void {
    const id = this.pendingRejectRoleExpenseId();
    const role = this.pendingRejectRole();
    const reason = this.rejectRoleReason().trim();
    if (!id || !role || !reason) return;
    this.rejectingExpenseRoleId.set(`${role}:${id}`);
    const call$ = role === 'coord'
      ? this.invoicesService.rejectByCoord(id, reason)
      : this.invoicesService.rejectByContabilidad(id, reason);
    call$.subscribe({
      next: () => {
        this.rejectingExpenseRoleId.set(null);
        this.closeRejectRoleModal();
        this.loadExpensesPage(this.expensesPage()?.page ?? 1);
        this.refreshReport();
      },
      error: (e) => {
        this.rejectingExpenseRoleId.set(null);
        this.notificationService.show(e?.error?.message ?? 'Error al rechazar', 'error');
      },
    });
  }

  batchApproveByCoord(): void {
    this.confirmationService.show(
      `¿Aprobar como Coordinador todos los comprobantes ya validados por Contabilidad? Esta acción no se puede deshacer.`,
      () => this._doBatchApproveByCoord()
    );
  }

  private _doBatchApproveByCoord(): void {
    this.isBatchApproving.set(true);
    this.expenseReportsService.batchApproveByCoord(this.id).subscribe({
      next: (res) => {
        this.isBatchApproving.set(false);
        this.notificationService.show(
          `${res.approved} comprobante(s) aprobados por Coordinador`,
          'success'
        );
        this.loadExpensesPage(this.expensesPage()?.page ?? 1);
        this.refreshReport();
      },
      error: (e) => {
        this.isBatchApproving.set(false);
        this.notificationService.show(e?.error?.message ?? 'Error al aprobar en lote', 'error');
      },
    });
  }

  batchApproveByCollab(): void {
    this.confirmationService.show(
      `¿Confirmar todos los comprobantes aprobados por Contabilidad? Esta acción no se puede deshacer.`,
      () => this._doBatchApproveByCollab()
    );
  }

  private _doBatchApproveByCollab(): void {
    this.isBatchApprovingCollab.set(true);
    this.expenseReportsService.batchApproveByCollab(this.id).subscribe({
      next: (res) => {
        this.isBatchApprovingCollab.set(false);
        this.notificationService.show(
          `${res.approved} comprobante(s) confirmados`,
          'success'
        );
        this.loadExpensesPage(this.expensesPage()?.page ?? 1);
        this.refreshReport();
      },
      error: (e) => {
        this.isBatchApprovingCollab.set(false);
        this.notificationService.show(e?.error?.message ?? 'Error al confirmar comprobantes', 'error');
      },
    });
  }

  // ─── Reapertura ───────────────────────────────────────────────────────────────

  openReopenModal(): void {
    this.reopenReason.set('');
    this.showReopenModal.set(true);
  }

  closeReopenModal(): void {
    this.showReopenModal.set(false);
    this.reopenReason.set('');
  }

  confirmReopen(): void {
    const reason = this.reopenReason().trim();
    if (!reason) {
      this.notificationService.show('El motivo es obligatorio', 'error');
      return;
    }
    this.isReopening.set(true);
    this.expenseReportsService.reopen(this.id, reason).subscribe({
      next: () => {
        this.isReopening.set(false);
        this.closeReopenModal();
        this.notificationService.show('Rendición reabierta correctamente', 'success');
        this.loadReport();
      },
      error: (e) => {
        this.isReopening.set(false);
        this.notificationService.show(e?.error?.message ?? 'Error al reabrir', 'error');
      },
    });
  }

  confirmDeleteExpense(expense: Record<string, unknown> & { _id?: string }): void {
    const id = expense._id;
    if (!id) return;
    const label = this.getExpenseDescription(expense).slice(0, 60) || 'este comprobante';
    if (!confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return;
    this.deletingExpenseId.set(id);
    this.invoicesService.deleteInvoice(id).subscribe({
      next: () => {
        this.notificationService.show('Comprobante eliminado', 'success');
        this.deletingExpenseId.set(null);
        this.loadReport();
      },
      error: (e) => {
        const msg = e?.error?.message;
        this.notificationService.show(
          typeof msg === 'string' ? msg : 'No se pudo eliminar el comprobante',
          'error',
        );
        this.deletingExpenseId.set(null);
      },
    });
  }
}
