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
import { buildReportFlowSteps, FlowStep } from '../../shared/flow-steps.util';
import { FlowTimelineComponent } from '../../design-system/flow-timeline/flow-timeline.component';
import { FondoCajaChicaService } from '../../services/fondo-caja-chica.service';
import { UploadService } from '../../services/upload.service';
import {
  IFondoCajaChica,
  ISolicitudCajaChica,
  FONDO_STATUS_LABELS,
  SOLICITUD_CAJA_CHICA_STATUS_LABELS,
  SOLICITUD_CAJA_CHICA_STATUS_COLORS,
  rendicionCajaChicaStatusLabel,
  rendicionCajaChicaStatusColor,
  SOLICITUD_EN_CURSO_STATUSES,
  presupuestoSolicitado,
  saldoDisponible,
} from '../../interfaces/fondo-caja-chica.interface';
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
import { expenseAmountBase, expenseAmountInReport, monedaSymbol } from '../../constants/moneda';
import { SuplenciaService } from '../../services/suplencia.service';

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
  currencySymbol: string;
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
  imports: [CommonModule, FormsModule, RouterModule, CreateRendicionModalComponent, DataTableComponent, ColumnDirective, ModalComponent, ButtonComponent, IconComponent, EmptyStateComponent, FlowTimelineComponent],
  templateUrl: './mis-rendiciones.component.html',
  styleUrls: ['./mis-rendiciones.component.scss']
})
export class MisRendicionesComponent implements OnInit {
  private expenseReportsService = inject(ExpenseReportsService);
  private expenseService = inject(ExpenseService);
  private userStateService = inject(UserStateService);
  private suplenciaService = inject(SuplenciaService);
  private advanceService = inject(AdvanceService);
  private notificationService = inject(NotificationService);
  private cajaChicaReportService = inject(CajaChicaReportService);
  private fondoCajaChicaService = inject(FondoCajaChicaService);
  private uploadService = inject(UploadService);
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

  // Bolsa del responsable (tope, gastado, disponible)
  fondo = signal<IFondoCajaChica | null>(null);
  fondoLoading = signal(false);
  solicitudesCajaChica = signal<ISolicitudCajaChica[]>([]);
  readonly FONDO_STATUS_LABELS = FONDO_STATUS_LABELS;

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

  /** Solo el módulo "caja-chica"; el rol ya no entra en la decisión. */
  get canAccessCajaChica(): boolean {
    return this.userStateService.canAccessCajaChica();
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
    this.loadFondo();
  }

  /** Presupuesto del responsable: tope, gastado y saldo disponible. */
  loadFondo(): void {
    this.fondoLoading.set(true);
    this.fondoCajaChicaService.findMyActive().subscribe({
      next: (fondo) => {
        this.fondo.set(fondo);
        this.fondoLoading.set(false);
      },
      error: () => this.fondoLoading.set(false),
    });
    // Las solicitudes de caja chica ya no salen en "Solicitudes de fondos", así
    // que su seguimiento vive acá.
    this.fondoCajaChicaService.misSolicitudes().subscribe({
      next: (list) => {
        this.solicitudesCajaChica.set(list);
        // La solicitud que sigue en trámite arranca con su cronología abierta:
        // es justo el dato que el responsable viene a buscar, y dejarla cerrada
        // obligaba a descubrir que la fila se despliega. Las ya cerradas no,
        // para no alargar la tabla con historial que nadie está mirando.
        const enCurso = list.find(s =>
          SOLICITUD_EN_CURSO_STATUSES.includes(s.status)
        );
        this.solicitudCronologiaId.set(enCurso?._id ?? null);
      },
      error: () => this.solicitudesCajaChica.set([]),
    });
  }

  solicitudStatusLabel(status: string): string {
    return SOLICITUD_CAJA_CHICA_STATUS_LABELS[status] ?? status;
  }

  solicitudStatusColor(status: string): string {
    return (
      SOLICITUD_CAJA_CHICA_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'
    );
  }

  /**
   * Solicitud cuya cronología está abierta. El responsable solo entra a
   * /mis-rendiciones: sin esto no tenía dónde ver en qué paso quedó su
   * solicitud, que es justo lo que el aprobador sí ve en /rendiciones.
   */
  solicitudCronologiaId = signal<string | null>(null);

  toggleSolicitudCronologia(id: string): void {
    this.solicitudCronologiaId.set(
      this.solicitudCronologiaId() === id ? null : id
    );
  }

  /**
   * Misma línea de tiempo que ve el aprobador (VD-31), con el vocabulario de
   * caja chica en el último paso: el depósito de Tesorería no deja la solicitud
   * "Pagada" sino el presupuesto aplicado, que es como se rotula su estado en
   * la tabla.
   */
  solicitudFlowSteps(s: ISolicitudCajaChica): FlowStep[] {
    return buildReportFlowSteps(s, this.suplenciaService.contextoParaLineaDeTiempo()).map(step =>
      step.label === 'Pagada'
        ? { ...step, label: 'Presupuesto aplicado' }
        : step
    );
  }

  /** Presupuesto pedido, con respaldo para las solicitudes anteriores al campo. */
  solicitudMonto(s: ISolicitudCajaChica): number {
    return presupuestoSolicitado(s);
  }

  /** Saldo que le queda para seguir cargando comprobantes. */
  get saldoDisponible(): number {
    return saldoDisponible(this.fondo());
  }

  /**
   * Estado de la SOLICITUD mientras la bolsa aún no está fondeada. Decir solo
   * "pendiente de depósito" era engañoso cuando todavía falta que la apruebe el
   * jefe o Contabilidad.
   */
  get estadoSolicitudFondo(): string {
    const f = this.fondo();
    if (!f || f.status !== 'pending_funding') return '';
    const solicitud = f.solicitudReportId;
    if (!solicitud || typeof solicitud === 'string') {
      return 'Esperando el depósito de Tesorería';
    }
    const label =
      VIATICO_REPORT_STATUS_LABELS[
        solicitud.status as keyof typeof VIATICO_REPORT_STATUS_LABELS
      ];
    switch (solicitud.status) {
      case 'pending_l1':
      case 'pending_l2':
        return 'Solicitud pendiente de aprobación';
      case 'pending_contabilidad':
        return 'Solicitud en Contabilidad';
      case 'viatico_approved':
      case 'partially_paid':
        return 'Aprobada, esperando el depósito de Tesorería';
      case 'rejected':
        return 'Solicitud rechazada';
      default:
        return label ?? 'Esperando el depósito de Tesorería';
    }
  }

  /**
   * Sin una bolsa activa no hay contra qué cargar gastos, así que la rendición
   * de caja chica no se puede crear todavía.
   */
  get puedeRendirCajaChica(): boolean {
    return this.fondo()?.status === 'active';
  }

  navigateToSolicitudCajaChica(): void {
    this.router.navigate(['/mis-rendiciones/solicitud-caja-chica']);
  }

  // ── Devolución del sobrante ────────────────────────────────────────────────

  /** Sobrante que quedó por devolver tras bajar el presupuesto. */
  get sobrantePorDevolver(): number {
    return Number(this.fondo()?.pendingReturnAmount ?? 0);
  }

  /**
   * Mismo formulario que el comprobante de devolucion de saldo de una rendicion
   * (modal "Comprobante de devolucion" de `rendicion-detail`): comprobante con
   * escaneo, fecha del deposito, monto, banco origen y n. de operacion. Para el
   * colaborador es la misma operacion, no tiene por que pedirle otros datos ni
   * verse distinta.
   */
  showDevolucionModal = signal(false);
  /** `app-input` trabaja con string; el numero se parsea al guardar. */
  devolucionMonto = '';
  devolucionOperacion = '';
  devolucionFecha = '';
  devolucionBanco = '';
  devolucionReceiptUrl: string | null = null;
  devolucionReceiptName: string | null = null;
  isUploadingDevolucion = signal(false);
  isSavingDevolucion = signal(false);
  // Datos leidos del comprobante, igual que en la devolucion de saldo.
  isScanningDevolucion = signal(false);
  devolucionScannedAmount = signal<number | null>(null);
  devolucionTitular = signal<string | null>(null);
  devolucionScanFecha = signal<string | null>(null);
  devolucionScanHora = signal<string | null>(null);
  devolucionScanBanco = signal<string | null>(null);

  /** Banco de la cuenta registrada en el perfil del responsable del fondo. */
  private bancoDelPerfil(): string {
    const responsable = this.fondo()?.responsibleId;
    if (responsable && typeof responsable === 'object') {
      return responsable.bankAccount?.bankName?.trim() ?? '';
    }
    return '';
  }

  get devolucionHasDetectedData(): boolean {
    return !!(
      this.devolucionScannedAmount() ||
      this.devolucionTitular() ||
      this.devolucionScanFecha() ||
      this.devolucionScanHora() ||
      this.devolucionScanBanco()
    );
  }

  openDevolucion(): void {
    this.devolucionMonto = String(this.sobrantePorDevolver);
    this.devolucionOperacion = '';
    this.devolucionFecha = new Date().toISOString().split('T')[0];
    // El banco sale del perfil del colaborador, que es desde donde deposita.
    // El escaneo del comprobante solo lo completa si el perfil no lo trae.
    this.devolucionBanco = this.bancoDelPerfil();
    this.devolucionReceiptUrl = null;
    this.devolucionReceiptName = null;
    this.devolucionScannedAmount.set(null);
    this.devolucionTitular.set(null);
    this.devolucionScanFecha.set(null);
    this.devolucionScanHora.set(null);
    this.devolucionScanBanco.set(null);
    this.showDevolucionModal.set(true);
  }

  onDevolucionFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // Mismas restricciones que el comprobante de devolucion de saldo.
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
    this.isUploadingDevolucion.set(true);
    this.uploadService.upload(file, 'raw').subscribe({
      next: (res) => {
        this.devolucionReceiptUrl = res.url;
        this.devolucionReceiptName = file.name;
        this.isUploadingDevolucion.set(false);
        this.scanDevolucionComprobante(res.url, file.type);
      },
      error: () => {
        this.isUploadingDevolucion.set(false);
        this.notificationService.show('No se pudo subir el comprobante.', 'error');
      },
    });
  }

  /** Mismo endpoint de escaneo que el resto de comprobantes de deposito. */
  private scanDevolucionComprobante(url: string, mimeType?: string): void {
    this.isScanningDevolucion.set(true);
    this.expenseReportsService.scanDepositAmount(url, mimeType).subscribe({
      next: (res) => {
        this.isScanningDevolucion.set(false);
        const amount = Number(res?.amount ?? 0);
        this.devolucionScannedAmount.set(amount > 0 ? amount : null);
        this.devolucionTitular.set(res?.titular || null);
        this.devolucionScanFecha.set(res?.fecha || null);
        this.devolucionScanHora.set(res?.hora || null);
        this.devolucionScanBanco.set(res?.banco || null);
        if (res?.operationNumber && !this.devolucionOperacion) {
          this.devolucionOperacion = res.operationNumber;
        }
        if (res?.banco && !this.devolucionBanco) {
          this.devolucionBanco = res.banco;
        }
        if (this.devolucionHasDetectedData) {
          this.notificationService.show('Datos detectados del comprobante.', 'success');
        }
      },
      error: () => {
        this.isScanningDevolucion.set(false);
        this.notificationService.show(
          'No se pudo escanear el comprobante. Completa los datos manualmente.',
          'warning'
        );
      },
    });
  }

  guardarDevolucion(): void {
    const fondo = this.fondo();
    const monto = Number(this.devolucionMonto);
    if (!fondo || !Number.isFinite(monto) || monto <= 0) {
      this.notificationService.show('Indique el monto devuelto.', 'error');
      return;
    }
    if (!this.devolucionReceiptUrl || !this.devolucionFecha) {
      this.notificationService.show(
        'Sube el comprobante e ingresa la fecha del deposito.',
        'error'
      );
      return;
    }
    this.isSavingDevolucion.set(true);
    this.fondoCajaChicaService
      .devolverSobrante(fondo._id, {
        amount: monto,
        receiptUrl: this.devolucionReceiptUrl,
        operationNumber: this.devolucionOperacion?.trim() || undefined,
        depositDate: this.devolucionFecha,
        bankOrigin: this.devolucionBanco?.trim() || undefined,
      })
      .subscribe({
        next: (actualizado) => {
          this.fondo.set(actualizado);
          this.isSavingDevolucion.set(false);
          this.showDevolucionModal.set(false);
          this.notificationService.show('Devolución registrada.', 'success');
        },
        error: (err) => {
          this.isSavingDevolucion.set(false);
          const msg = err?.error?.message ?? 'No se pudo registrar la devolución.';
          this.notificationService.show(
            Array.isArray(msg) ? msg.join(', ') : msg,
            'error'
          );
        },
      });
  }

  navigateToNuevaCajaChica(): void {
    this.router.navigate(['/mis-rendiciones/nueva-caja-chica']);
  }

  cajaChicaTotalExpenses(report: any): number {
    if (!Array.isArray(report?.expenseIds)) return 0;
    // La caja chica va solo en soles, así que hoy `expenseAmountInReport` cae
    // en `total`; se usa igual para no repetir el error de sumar monedas
    // distintas si algún día deja de ser así.
    return report.expenseIds.reduce((s: number, e: any) => s + expenseAmountInReport(e), 0);
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
      .reduce((sum, e) => sum + expenseAmountBase(e), 0);
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
      if (sub === 'DJE') return 'DJE';
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
    if (code === 'DJ' || code === 'DJE') return 'bg-amber-100 text-amber-800';
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
    if (e.contabilidadStatus === 'approved') return { label: 'Revisado', cls: 'bg-teal-100 text-teal-700' };
    return { label: 'Enviado', cls: 'bg-blue-100 text-blue-700' };
  }

  get directaTotalMonto(): number {
    return this.directaExpenses().reduce((sum, e) => sum + expenseAmountBase(e), 0);
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

  /**
   * Total gastado en la moneda de la rendición. Un viático en dólares puede
   * contener boletas en soles: sumar `total` a secas daría una cifra que no es
   * ni una moneda ni la otra.
   */
  getTotalGastado(report: IExpenseReport): number {
    if (!report.expenseIds?.length) return 0;
    return report.expenseIds.reduce(
      (sum: number, e: any) => sum + expenseAmountInReport(e),
      0
    );
  }

  /** Símbolo de la moneda en que está expresada la rendición. */
  reportSymbol(report: IExpenseReport): string {
    return monedaSymbol(report.viaticoMoneda);
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
   * Una rendición se considera cerrada (a efectos del label) cuando llegó a un
   * estado final o fue devuelta con comprobante. Mismo criterio que el detalle
   * (`isEffectivelyClosed`).
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

  /**
   * Estado de una RENDICIÓN de caja chica, con las palabras que usa el
   * responsable. No reusa `getLegacyReportLabel` porque el vocabulario cambia:
   * lo que ahí es "Reembolsada" acá es "Repuesta" (Tesorería devuelve a la caja
   * lo aprobado), y "Enviada" no dice quién la tiene.
   *
   * El diccionario vive en `rendicionCajaChicaStatusLabel` y lo comparte con la
   * bandeja de /rendiciones y con el detalle: responsable, Contabilidad y
   * Tesorería tienen que leer el mismo estado, sobre todo después de la
   * aprobación, donde faltan el reembolso/devolución y el cierre de Tesorería.
   */
  cajaChicaStatusLabel(report: IExpenseReport): string {
    return rendicionCajaChicaStatusLabel(report as any);
  }

  cajaChicaStatusColor(report: IExpenseReport): string {
    return rendicionCajaChicaStatusColor(report as any);
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

  private get allViaticoItems(): UnifiedViaticoItem[] {
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
        currencySymbol: monedaSymbol(r.viaticoMoneda),
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
        currencySymbol: monedaSymbol(adv.moneda),
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
        currencySymbol: monedaSymbol(undefined),
        expensesCount: (r.expenseIds || []).length,
        canEdit: false,
        canResubmit: false,
        isInExpensePhase: this.isReportInProgress(r),
        rawStatus: r.status,
        raw: r,
      });
    }

    return items;
  }

  /**
   * Opciones del filtro por estado HOMOLOGADAS con la columna Estado de la tabla
   * (VD-30): las etiquetas realmente presentes en la lista, sin duplicar y ordenadas.
   * Así el desplegable ofrece exactamente lo que se ve en la tabla (p. ej. "En
   * solicitud", "Cerrada") en vez de una lista fija que no coincide.
   */
  get viaticoStatusOptions(): string[] {
    const labels = new Set<string>();
    for (const it of this.allViaticoItems) labels.add(it.statusLabel);
    return [...labels].sort((a, b) => a.localeCompare(b));
  }

  get unifiedViaticoList(): UnifiedViaticoItem[] {
    // Se filtra por la etiqueta visible (no por el status crudo) para que coincida
    // 1:1 con lo que muestra la columna Estado. VD-30.
    const status = this.viaticosStatusFilter();
    const from = this.viaticosDateFrom();
    const to = this.viaticosDateTo();
    let filtered = this.allViaticoItems;
    if (status) filtered = filtered.filter(i => i.statusLabel === status);
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

  /**
   * Opciones del filtro por estado de rendiciones directas, homologadas con la
   * columna Estado de la tabla (panelStatusText). VD-30.
   */
  get directaStatusOptions(): string[] {
    const labels = new Set<string>();
    for (const r of this.expenseReports.filter(r => r.isDirecta)) {
      labels.add(this.panelStatusText(r));
    }
    return [...labels].sort((a, b) => a.localeCompare(b));
  }

  get filteredDirectaReports(): IExpenseReport[] {
    let reports = this.expenseReports.filter(r => r.isDirecta);
    const status = this.directasStatusFilter();
    const from = this.directasDateFrom();
    const to = this.directasDateTo();
    // Filtrado por la etiqueta visible, homologado con la tabla. VD-30.
    if (status) reports = reports.filter(r => this.panelStatusText(r) === status);
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
    return report.description || report.title || 'Rendicion de fondos';
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
