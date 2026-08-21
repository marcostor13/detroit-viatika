import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  AdvanceService,
  IGeneratePaymentsTxt,
  IReconcileResult,
} from '../../services/advance.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { UploadService } from '../../services/upload.service';
import {
  IAdvance,
  IAdvanceStats,
  ADVANCE_STATUS_LABELS,
  ADVANCE_STATUS_COLORS,
} from '../../interfaces/advance.interface';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { IExpenseReport } from '../../interfaces/expense-report.interface';
import { FondoCajaChicaService } from '../../services/fondo-caja-chica.service';
import {
  IFondoCajaChica,
  IFondoMovement,
} from '../../interfaces/fondo-caja-chica.interface';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { ButtonComponent } from '../../design-system/button/button.component';
import { IconComponent } from '../../design-system/icon/icon.component';
import { TabsComponent, TabItem } from '../../design-system/tabs/tabs.component';
import { monedaSymbol, normalizeMonedaCode, DEFAULT_MONEDA } from '../../constants/moneda';
type Tab = 'pendientes' | 'aprobados' | 'reembolsos' | 'devoluciones' | 'rendiciones-directas';

@Component({
  selector: 'app-tesoreria',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, ButtonComponent, IconComponent, TabsComponent],
  templateUrl: './tesoreria.component.html',
})
export class TesoreriaComponent implements OnInit {
  private advanceService = inject(AdvanceService);
  private expenseReportsService = inject(ExpenseReportsService);
  private userStateService = inject(UserStateService);
  private notificationService = inject(NotificationService);
  private uploadService = inject(UploadService);
  private fondoCajaChicaService = inject(FondoCajaChicaService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  activeTab = signal<Tab>('pendientes');

  get tabsList(): TabItem[] {
    const tabs: TabItem[] = [
      // VD-32: se renombran las etiquetas visibles (no los `value`, que se usan en la lógica).
      { value: 'pendientes', label: 'Fondos' },
      { value: 'aprobados', label: 'Pagar' },
    ];
    if (this.canPayAndSettle) {
      // VD-37: la pestaña "Reembolsos" muestra los reembolsos al colaborador
      // (pendingReimbursements). Las devoluciones (saldo que devuelve el colaborador)
      // recuperan su propia pestaña "Devoluciones".
      tabs.push({ value: 'reembolsos', label: 'Reembolsos', badge: this.pendingReimbursements.length || undefined });
      tabs.push({
        value: 'devoluciones',
        label: 'Devoluciones',
        badge:
          this.pendingReturns.length + this.cajaChicaConDevoluciones().length ||
          undefined,
      });
    }
    if (this.canManageDirectaDeposit) {
      tabs.push({ value: 'rendiciones-directas', label: 'Rendiciones Directas' });
    }
    return tabs;
  }

  onTabChange(value: string): void {
    this.activeTab.set(value as Tab);
  }
  isLoading = signal(false);
  isActing = signal(false);

  stats: IAdvanceStats | null = null;
  allAdvances: IAdvance[] = [];
  pendingAdvances: IAdvance[] = [];
  /** Rendiciones aprobadas con reembolso al colaborador pendiente de comprobante (Fase 6) */
  pendingReimbursements: IExpenseReport[] = [];
  /** Viáticos con status viatico_approved o partially_paid pendientes de pago. */
  pendingViaticoPayments: IExpenseReport[] = [];
  /** Viáticos con al menos un pago de contabilidad registrado (pestaña "En pago"). */
  paidViaticoPayments: IExpenseReport[] = [];
  // VD-82: agregados de dinero YA desembolsado, para las tarjetas "Pagados" y
  // "Total desembolsado" (el stats legacy solo cubría la colección `advances`).
  viaticoDesembolsado = 0;     // Σ viaticoPaidAmount de los viáticos
  reembolsoPagadoCount = 0;    // # rendiciones con reembolso ya pagado
  reembolsoDesembolsado = 0;   // Σ monto de reembolsos ya pagados

  selectedAdvance: IAdvance | null = null;
  selectedReportReimbursement: IExpenseReport | null = null;
  selectedViaticoReport: IExpenseReport | null = null;
  showViaticoPaymentModal = false;
  viaticoPaymentReceiptUrl: string | null = null;
  viaticoPaymentReceiptName: string | null = null;
  viaticoPaymentReceiptMimeType: string | null = null;
  viaticoPaymentReceiptSizeBytes: number | null = null;
  isUploadingViaticoReceipt = signal(false);
  isScanningViaticoPayment = signal(false);
  viaticoScannedAmount: number | null = null;
  viaticoOperationNumber: string | null = null;
  viaticoOperationDate: string | null = null;
  viaticoOperationTime: string | null = null;
  showReimbursementModal = false;
  reimbursementReceiptUrl: string | null = null;
  reimbursementReceiptName: string | null = null;
  reimbursementReceiptMimeType: string | null = null;
  reimbursementReceiptSizeBytes: number | null = null;
  // Reembolso: escaneo del comprobante (OCR) — solo autocompleta, sin alerta
  isScanningReimbursement = signal(false);
  reimbursementScannedAmount: number | null = null;
  reimbursementTitular: string | null = null;
  reimbursementOperationNumber: string | null = null;
  reimbursementOperationDate: string | null = null;
  reimbursementOperationTime: string | null = null;
  showPaymentModal = false;
  /**
   * VD-129: el modal de pago individual es de SOLO LECTURA. Los abonos se hacen
   * por la planilla BBVA ("Generar archivo de pagos") y se dan por pagados al
   * conciliar el PDF del banco ("Cargar pagos"); marcarlos a mano desde aquí
   * dejaba pagos reales con datos que el banco nunca emitió. El flag queda para
   * poder reabrir el registro manual si el cliente lo vuelve a pedir.
   */
  paymentModalReadOnly = false;
  showReturnModal = false;
  showHistoryModal = false;
  pendingReturns: IAdvance[] = [];
  selectedReturnAdvance: IAdvance | null = null;
  showValidateReturnModal = false;
  returnRejectReason = signal('');
  isValidatingReturn = signal(false);
  returnProofForm!: FormGroup;
  showReturnProofModal = false;
  returnProofReceiptUrl: string | null = null;
  returnProofReceiptName: string | null = null;
  isUploadingReturnProof = signal(false);
  isUploadingReceipt = signal(false);
  paymentReceiptUrl: string | null = null;
  paymentReceiptName: string | null = null;
  paymentReceiptMimeType: string | null = null;
  paymentReceiptSizeBytes: number | null = null;

  // Pago de viático: escaneo del comprobante (OCR), alerta y pago parcial
  isScanningPayment = signal(false);
  paymentScannedAmount: number | null = null;
  paymentScannedTitular: string | null = null;
  paymentOperationNumber: string | null = null;
  paymentOperationDate: string | null = null;
  paymentOperationTime: string | null = null;
  showPaymentAlert = signal(false);
  paymentAlert = signal<{
    titularMismatch: boolean;
    amountMismatch: boolean;
    scannedTitular: string;
    scannedAmount: number;
    expectedName: string;
    expectedAmount: number;
  } | null>(null);

  paymentForm!: FormGroup;
  returnForm!: FormGroup;

  readonly STATUS_LABELS = ADVANCE_STATUS_LABELS;
  readonly STATUS_COLORS = ADVANCE_STATUS_COLORS;

  get isSuperAdmin() { return this.userStateService.isSuperAdmin(); }
  get isAdmin() { return this.userStateService.isAdmin(); }
  get isContabilidad() { return this.userStateService.isContabilidad(); }
  get canPayAndSettle() { return this.userStateService.canApproveL2(); }
  /** Solo Contabilidad (y super) puede iniciar rendiciones directas con saldo. */
  get canManageDirectaDeposit() { return this.isContabilidad || this.isSuperAdmin; }

  /**
   * VD-82: contador "Pend. Pago". Debe reflejar TODOS los pagos que Tesorería tiene
   * por ejecutar, no solo la colección `advances` (en desuso). Antes usaba
   * `stats.pending_l2 + stats.approved` (solo anticipos legacy) y salía 0 aunque en
   * la lista hubiera viáticos por pagar — p. ej. un colaborador SIN CCI (el CCI no
   * influye: `pendingViaticoPayments` no filtra por datos bancarios). Ahora suma las
   * tres colas de pago saliente del módulo: viáticos por pagar + reembolsos +
   * anticipos legacy pendientes. Los estados son mutuamente excluyentes entre las
   * tres fuentes → no hay doble conteo.
   */
  get pendPagoCount(): number {
    return (
      this.pendingViaticoPayments.length +
      this.pendingReimbursements.length +
      this.pendingAdvances.length
    );
  }

  /** VD-82: "Pagados" = viáticos con pago + reembolsos pagados + anticipos legacy pagados. */
  get pagadosCount(): number {
    return this.paidViaticoPayments.length + this.reembolsoPagadoCount + (this.stats?.paid ?? 0);
  }

  /** VD-82: "Total desembolsado" = dinero real pagado (viáticos + reembolsos + anticipos legacy). */
  get totalDesembolsado(): number {
    return this.viaticoDesembolsado + this.reembolsoDesembolsado + (this.stats?.totalApprovedAmount ?? 0);
  }

  // ─── Rendiciones Directas iniciadas por Contabilidad (con saldo) ─────────────
  directaReports = signal<any[]>([]);
  isLoadingDirectas = signal(false);

  ngOnInit() {
    this.initForms();
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'rendiciones-directas' && this.canManageDirectaDeposit) {
      this.activeTab.set('rendiciones-directas');
    }
    this.loadData();
  }

  initForms() {
    this.returnProofForm = this.fb.group({
      depositDate: [new Date().toISOString().split('T')[0], Validators.required],
      amountReturned: [null, [Validators.required, Validators.min(0.01)]],
      bankOrigin: ['', Validators.required],
      operationNumber: ['', Validators.required],
      note: [''],
    });
    this.paymentForm = this.fb.group({
      amount: [null, [Validators.required, Validators.min(0.01)]],
      method: ['transferencia_bancaria', Validators.required],
      bankName: [''],
      accountNumber: [''],
      cci: [''],
      transferDate: [new Date().toISOString().split('T')[0], Validators.required],
      reference: ['', Validators.required],
    });
    this.returnForm = this.fb.group({
      returnedAmount: [null, [Validators.required, Validators.min(0.01)]],
    });
  }

  loadData() {
    this.isLoading.set(true);
    this.advanceService.getStats().subscribe({
      next: (s) => { this.stats = s; },
      error: () => {},
    });
    this.advanceService.findAll().subscribe({
      next: (advances) => {
        this.allAdvances = advances;
        this.pendingAdvances = advances.filter(a =>
          ['pending_l2', 'approved', 'partially_paid'].includes(a.status)
        );
        this.isLoading.set(false);
        this.loadPendingReimbursements();
        this.loadPendingReturns();
        this.loadFondosCajaChica();
        this.loadDirectaDepositReports();
        this.loadPendingViaticoPayments();
      },
      error: () => {
        this.isLoading.set(false);
        this.loadPendingReimbursements();
        this.loadPendingReturns();
        this.loadFondosCajaChica();
        this.loadDirectaDepositReports();
        this.loadPendingViaticoPayments();
      },
    });
  }

  private loadPendingReimbursements(): void {
    const cid = this.userStateService.getUser()?.companyId;
    if (!cid || !this.canPayAndSettle) {
      this.pendingReimbursements = [];
      return;
    }
    this.expenseReportsService.findPendingReimbursements(String(cid)).subscribe({
      next: rows => {
        this.pendingReimbursements = rows ?? [];
      },
      error: () => {
        this.pendingReimbursements = [];
      },
    });
  }

  private loadPendingReturns(): void {
    const cid = this.userStateService.getUser()?.companyId;
    if (!cid || !this.canPayAndSettle) {
      this.pendingReturns = [];
      return;
    }
    this.advanceService.findPendingReturns(String(cid)).subscribe({
      next: rows => { this.pendingReturns = rows ?? []; },
      error: () => { this.pendingReturns = []; },
    });
  }

  // -- Caja chica: sobrantes por devolver y comprobantes ya cargados ----------

  /**
   * Cajas chicas de la empresa. La devolucion del sobrante no vive en una
   * rendicion sino como movimiento del fondo, asi que Tesoreria no tenia donde
   * ver el comprobante que sube el responsable: aparece aqui, junto a las
   * devoluciones de saldo, que es la misma conciliacion bancaria.
   */
  fondosCajaChica = signal<IFondoCajaChica[]>([]);

  cajaChicaConDevoluciones = computed(() =>
    this.fondosCajaChica().filter(
      f =>
        Number(f.pendingReturnAmount ?? 0) > 0 ||
        (f.movements ?? []).some(m => m.type === 'devolucion')
    )
  );

  private loadFondosCajaChica(): void {
    if (!this.canPayAndSettle) {
      this.fondosCajaChica.set([]);
      return;
    }
    this.fondoCajaChicaService.findAllByClient().subscribe({
      next: rows => this.fondosCajaChica.set(rows ?? []),
      error: () => this.fondosCajaChica.set([]),
    });
  }

  fondoResponsableName(f: IFondoCajaChica): string {
    const r = f.responsibleId;
    return r && typeof r === 'object' ? r.name : '-';
  }

  /** Devoluciones registradas contra un fondo, de la mas reciente a la mas antigua. */
  fondoDevoluciones(f: IFondoCajaChica): IFondoMovement[] {
    return (f.movements ?? [])
      .filter(m => m.type === 'devolucion')
      .slice()
      .reverse();
  }

  private loadPendingViaticoPayments(): void {
    const cid = this.clientId;
    if (!cid || !this.canPayAndSettle) {
      this.resetPaymentAggregates();
      return;
    }
    // scope 'all': Tesorería paga los viáticos de toda la empresa. Sin esto, un
    // tesorero/contable que además es aprobador de algún centro de costo recibía
    // solo su cadena y la cola de pagos le salía incompleta.
    this.expenseReportsService.findAllByClient(cid, 'all').subscribe({
      next: reports => {
        const all = reports ?? [];
        const viaticos = all.filter(r => r.type === 'viatico');
        // "Por pagar": aprobados o con pago parcial pendiente de completar.
        this.pendingViaticoPayments = viaticos.filter(
          r => ['viatico_approved', 'partially_paid'].includes(r.status)
        );
        // "En pago": tienen al menos un pago de contabilidad registrado. Se filtra
        // por viaticoPayments (no por estado/viaticoPaidAmount) para excluir los
        // cubiertos 100% con saldo, que se abren sin pago de contabilidad.
        this.paidViaticoPayments = viaticos.filter(
          r => Array.isArray(r.viaticoPayments) && r.viaticoPayments.length > 0
        );
        // VD-82: agregados de lo ya desembolsado desde la MISMA lista (sin llamada
        // extra). Viáticos por su acumulado pagado; reembolsos ya pagados por el
        // |settlement.difference| de las rendiciones con comprobante registrado.
        // El acumulado se muestra en soles, pero un viático puede estar pagado
        // en dólares: sumar `viaticoPaidAmount` crudo mezclaría monedas. Se
        // valora con el TC congelado del viático (1 si ya estaba en soles).
        this.viaticoDesembolsado = viaticos.reduce(
          (s, r) => s + Number(r.viaticoPaidAmount ?? 0) * (Number(r.tipoCambio) || 1), 0
        );
        const reembolsados = all.filter(r => !!r.reimbursementPaymentInfo);
        this.reembolsoPagadoCount = reembolsados.length;
        this.reembolsoDesembolsado = reembolsados.reduce(
          (s, r) => s + Math.abs(Number(r.settlement?.difference ?? 0)), 0
        );
      },
      error: () => this.resetPaymentAggregates(),
    });
  }

  private resetPaymentAggregates(): void {
    this.pendingViaticoPayments = [];
    this.paidViaticoPayments = [];
    this.viaticoDesembolsado = 0;
    this.reembolsoPagadoCount = 0;
    this.reembolsoDesembolsado = 0;
  }

  viaticoUserName(report: IExpenseReport): string {
    const u = report.userId;
    if (u && typeof u === 'object' && 'name' in u) return (u as { name: string }).name || '—';
    return '—';
  }

  viaticoRemaining(report: IExpenseReport): number {
    return Math.max(Number(report.viaticoAmount ?? 0) - Number(report.viaticoPaidAmount ?? 0), 0);
  }

  viaticoCurrencySymbol(report: IExpenseReport | null | undefined): string {
    return monedaSymbol(report?.viaticoMoneda);
  }

  /**
   * Contabilidad puede completar el pago de un viático con saldo del anticipo
   * pendiente. Incluye los estados posteriores al envío del colaborador
   * (submitted/pending_accounting), donde el pago restante sigue siendo válido.
   */
  canCompleteViaticoPayment(report: IExpenseReport): boolean {
    return (
      this.canPayAndSettle &&
      this.viaticoRemaining(report) > 0.009 &&
      ['viatico_approved', 'partially_paid', 'submitted', 'pending_accounting'].includes(report.status)
    );
  }

  /**
   * VD-129: ficha informativa del pago de la solicitud de fondos. Ya no se
   * registra el abono a mano — lo hace la planilla BBVA y se da por pagado al
   * conciliar el PDF del banco, que es de donde sale el N° de operación. El
   * formulario se sigue rellenando porque de él salen los datos bancarios que
   * se muestran; queda deshabilitado para que nadie escriba sobre ellos.
   */
  openViaticoPaymentModal(report: IExpenseReport): void {
    this.selectedViaticoReport = report;
    const remaining = this.viaticoRemaining(report);
    this.paymentForm.reset({
      amount: remaining > 0 ? remaining : null,
      method: 'transferencia_bancaria',
      bankName: '',
      accountNumber: '',
      cci: '',
      transferDate: new Date().toISOString().split('T')[0],
      reference: '',
    });
    // Prefer bank data from the solicitud itself; fall back to user profile.
    if (report.viaticoAccountNumber) {
      this.paymentForm.patchValue({
        bankName: report.viaticoBankName ?? '',
        accountNumber: report.viaticoAccountNumber,
        cci: report.viaticoCci ?? '',
      });
    } else {
      const u = typeof report.userId === 'object' ? report.userId : null;
      const bankAccount = u && typeof u === 'object' && 'bankAccount' in u
        ? (u as { bankAccount?: { bankName?: string; accountNumber?: string; cci?: string } }).bankAccount
        : undefined;
      if (bankAccount) {
        this.paymentForm.patchValue({
          bankName: bankAccount.bankName,
          accountNumber: bankAccount.accountNumber,
          cci: bankAccount.cci,
        });
      }
    }
    this.viaticoPaymentReceiptUrl = null;
    this.viaticoPaymentReceiptName = null;
    this.viaticoPaymentReceiptMimeType = null;
    this.viaticoPaymentReceiptSizeBytes = null;
    this.viaticoScannedAmount = null;
    this.viaticoOperationNumber = null;
    this.viaticoOperationDate = null;
    this.viaticoOperationTime = null;
    this.paymentForm.disable({ emitEvent: false });
    this.showViaticoPaymentModal = true;
  }

  removeViaticoPaymentReceipt(): void {
    this.viaticoPaymentReceiptUrl = null;
    this.viaticoPaymentReceiptName = null;
    this.viaticoPaymentReceiptMimeType = null;
    this.viaticoPaymentReceiptSizeBytes = null;
    this.viaticoScannedAmount = null;
    this.viaticoOperationNumber = null;
    this.viaticoOperationDate = null;
    this.viaticoOperationTime = null;
    const remaining = this.selectedViaticoReport ? this.viaticoRemaining(this.selectedViaticoReport) : null;
    this.paymentForm.patchValue({ amount: remaining && remaining > 0 ? remaining : null });
  }

  onViaticoPaymentReceiptSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      this.notificationService.show('Formato inválido. Usa PDF, JPG o PNG.', 'error');
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.notificationService.show('El comprobante no puede superar 10MB.', 'error');
      input.value = '';
      return;
    }
    this.isUploadingViaticoReceipt.set(true);
    this.uploadService.upload(file).subscribe({
      next: res => {
        this.viaticoPaymentReceiptUrl = res.url;
        this.viaticoPaymentReceiptName = file.name;
        this.viaticoPaymentReceiptMimeType = file.type;
        this.viaticoPaymentReceiptSizeBytes = file.size;
        this.isUploadingViaticoReceipt.set(false);
        this.isScanningViaticoPayment.set(true);
        this.expenseReportsService.scanDepositAmount(res.url, file.type).subscribe({
          next: scan => {
            this.isScanningViaticoPayment.set(false);
            const amount = Number(scan?.amount) || 0;
            this.viaticoScannedAmount = amount > 0 ? amount : null;
            this.viaticoOperationNumber = scan?.operationNumber || null;
            this.viaticoOperationDate = scan?.fecha || null;
            this.viaticoOperationTime = scan?.hora || null;
            const patch: Record<string, unknown> = {};
            if (amount > 0) patch['amount'] = amount;
            if (scan?.operationNumber && !this.paymentForm.value.reference) patch['reference'] = scan.operationNumber;
            if (Object.keys(patch).length) this.paymentForm.patchValue(patch);
          },
          error: () => {
            this.isScanningViaticoPayment.set(false);
            this.notificationService.show('No se pudo escanear el comprobante. Ingresa el monto manualmente.', 'warning');
          },
        });
      },
      error: () => {
        this.notificationService.show('No se pudo subir el comprobante', 'error');
        this.isUploadingViaticoReceipt.set(false);
      },
    });
  }

  /**
   * Registro manual del pago de una solicitud de fondos. VD-129 lo sacó de la
   * interfaz —la ficha del modal es de solo lectura— pero el método se conserva,
   * igual que `paymentModalReadOnly`: si el cliente vuelve a pedir el registro a
   * mano, es volver a colgarlo de un botón. Sus pruebas siguen cubriéndolo.
   */
  confirmViaticoPayment(): void {
    if (!this.selectedViaticoReport || this.paymentForm.invalid) return;
    const method = this.paymentForm.get('method')?.value;
    if (method !== 'efectivo' && !this.viaticoPaymentReceiptUrl) {
      this.notificationService.show('Debes adjuntar el comprobante de pago.', 'error');
      return;
    }
    this.isActing.set(true);
    this.expenseReportsService.registerViaticoPayment(this.selectedViaticoReport._id, {
      ...this.paymentForm.value,
      amount: Number(this.paymentForm.value.amount),
      paymentReceiptUrl: this.viaticoPaymentReceiptUrl || undefined,
      paymentReceiptFileName: this.viaticoPaymentReceiptName || undefined,
      paymentReceiptMimeType: this.viaticoPaymentReceiptMimeType || undefined,
      paymentReceiptSizeBytes: this.viaticoPaymentReceiptSizeBytes || undefined,
      scannedAmount: this.viaticoScannedAmount ?? undefined,
      operationNumber: this.viaticoOperationNumber || undefined,
      operationDate: this.viaticoOperationDate || undefined,
      operationTime: this.viaticoOperationTime || undefined,
    }).subscribe({
      next: () => {
        this.notificationService.show('Pago de fondos registrado correctamente', 'success');
        this.showViaticoPaymentModal = false;
        this.loadData();
        this.isActing.set(false);
      },
      error: e => {
        this.notificationService.show(e.error?.message || 'Error al registrar el pago', 'error');
        this.isActing.set(false);
      },
    });
  }

  get filteredAdvances(): IAdvance[] {
    switch (this.activeTab()) {
      case 'pendientes':
        return this.allAdvances.filter(a => ['pending_l2', 'approved', 'partially_paid'].includes(a.status));
      case 'aprobados':
        return this.allAdvances.filter(a => ['approved', 'partially_paid', 'paid'].includes(a.status));
      default:
        return this.allAdvances;
    }
  }

  openPaymentModal(advance: IAdvance, readOnly = false) {
    this.selectedAdvance = advance;
    this.paymentModalReadOnly = readOnly;
    this.paymentForm.reset({
      amount: this.advanceRemaining(advance) > 0 ? this.advanceRemaining(advance) : null,
      method: 'transferencia_bancaria',
      bankName: '',
      accountNumber: '',
      cci: '',
      transferDate: new Date().toISOString().split('T')[0],
      reference: '',
    });
    this.paymentReceiptUrl = null;
    this.paymentReceiptName = null;
    this.paymentReceiptMimeType = null;
    this.paymentReceiptSizeBytes = null;
    this.resetPaymentScanState();
    const user = typeof advance.userId === 'object' ? advance.userId : null;
    if (user?.bankAccount) {
      this.paymentForm.patchValue({
        bankName: user.bankAccount.bankName,
        accountNumber: user.bankAccount.accountNumber,
        cci: user.bankAccount.cci,
      });
    }
    // Un formulario deshabilitado no aporta su valor a `paymentForm.value`, así
    // que hay que devolverlo a habilitado si algún día se reabre el registro.
    if (readOnly) this.paymentForm.disable({ emitEvent: false });
    else this.paymentForm.enable({ emitEvent: false });
    this.showPaymentModal = true;
  }

  /**
   * Centro de costo de la solicitud, como "CC-001 — Proyecto Minera Antamina".
   * `findAllByClient` lo popula con `code name`; si llegara sin poblar se
   * devuelve vacío antes que un id crudo, que no le dice nada a Tesorería.
   */
  viaticoCentroCosto(report: IExpenseReport | null): string {
    const p = (report as any)?.projectId;
    if (!p || typeof p !== 'object' || !p.name) return '—';
    return p.code ? `${p.code} — ${p.name}` : p.name;
  }

  /** Orden de trabajo imputada. Cadena vacía cuando la solicitud no lleva OT. */
  viaticoOrdenTrabajo(report: IExpenseReport | null): string {
    const ot = (report as any)?.viaticoOrdenTrabajoId;
    if (!ot || typeof ot !== 'object') return '';
    return ot.nombre ?? '';
  }

  /**
   * Título de la solicitud. El lugar de destino manda: es lo que la lista de
   * Fondos ya muestra (`viaticoPlace || title`) y abrir la ficha con otro
   * nombre distinto del de la fila que se acaba de pulsar desorienta. El
   * `title` queda de respaldo para la caja chica, que sí lo guarda y no tiene
   * destino.
   */
  viaticoTitulo(report: IExpenseReport | null): string {
    return (report as any)?.viaticoPlace || report?.title || '—';
  }

  /**
   * N° de operación del abono, tal como lo dejó la conciliación del PDF de BBVA
   * (`reference`/`operationNumber`). Se prefiere el último pago registrado: un
   * viático admite pagos parciales y el vigente es el más reciente.
   */
  viaticoOperationReference(report: IExpenseReport | null): string | null {
    if (!report) return null;
    const pagos = ((report as any).viaticoPayments ?? []) as Array<{
      reference?: string;
      operationNumber?: string;
    }>;
    for (let i = pagos.length - 1; i >= 0; i--) {
      const ref = pagos[i]?.operationNumber || pagos[i]?.reference;
      if (ref) return ref;
    }
    const info = (report as any).viaticoPaymentInfo as { reference?: string } | undefined;
    return info?.reference || null;
  }

  /** Fecha del abono, para la ficha informativa. */
  viaticoPaymentDate(report: IExpenseReport | null): string | Date | null {
    if (!report) return null;
    const pagos = ((report as any).viaticoPayments ?? []) as Array<{ transferDate?: string }>;
    const ultimo = pagos.length ? pagos[pagos.length - 1]?.transferDate : undefined;
    return ultimo ?? (report as any).viaticoPaymentInfo?.transferDate ?? null;
  }

  /** VD-129: abre el modal de pago como ficha informativa, sin registrar nada. */
  openPaymentInfo(advance: IAdvance) {
    this.openPaymentModal(advance, true);
  }

  // ─── Pago de viático: acumulado y pagos parciales ────────────────────────────

  advancePaid(advance: IAdvance): number {
    return Number(advance?.paidAmount ?? 0);
  }

  advanceRemaining(advance: IAdvance): number {
    return Math.max(Number(advance?.amount ?? 0) - this.advancePaid(advance), 0);
  }

  advanceCurrencySymbol(advance: IAdvance | null | undefined): string {
    return monedaSymbol(advance?.moneda);
  }

  /**
   * Quién ve la ficha de pago de una solicitud ya aprobada. Mismo permiso que
   * antes habilitaba el registro manual (VD-129, ver `paymentModalReadOnly`).
   */
  canSeePaymentInfo(advance: IAdvance): boolean {
    return (
      this.canPayAndSettle &&
      ['approved', 'partially_paid', 'paid'].includes(advance.status)
    );
  }

  private resetPaymentScanState(): void {
    this.paymentScannedAmount = null;
    this.paymentScannedTitular = null;
    this.paymentOperationNumber = null;
    this.paymentOperationDate = null;
    this.paymentOperationTime = null;
    this.showPaymentAlert.set(false);
    this.paymentAlert.set(null);
  }

  private scanPaymentReceipt(url: string, mimeType?: string): void {
    this.isScanningPayment.set(true);
    this.expenseReportsService.scanDepositAmount(url, mimeType).subscribe({
      next: res => {
        this.isScanningPayment.set(false);
        const amount = Number(res?.amount) || 0;
        this.paymentScannedAmount = amount;
        this.paymentScannedTitular = res?.titular || null;
        this.paymentOperationNumber = res?.operationNumber || null;
        this.paymentOperationDate = res?.fecha || null;
        this.paymentOperationTime = res?.hora || null;
        const patch: Record<string, unknown> = {};
        if (amount > 0) patch['amount'] = amount;
        if (res?.operationNumber && !this.paymentForm.value.reference) patch['reference'] = res.operationNumber;
        if (Object.keys(patch).length) this.paymentForm.patchValue(patch);
        this.evaluatePaymentAlert();
      },
      error: () => {
        this.isScanningPayment.set(false);
        this.notificationService.show('No se pudo escanear el comprobante. Ingresa el monto manualmente.', 'warning');
      },
    });
  }

  /** Compara titular/monto escaneados contra el colaborador y el monto solicitado. Alerta no bloqueante. */
  private evaluatePaymentAlert(): void {
    const adv = this.selectedAdvance;
    if (!adv) return;
    const expectedName = this.getUserName(adv);
    const expectedAmount = Number(adv.amount ?? 0);
    const scannedTitular = this.paymentScannedTitular || '';
    const scannedAmount = Number(this.paymentScannedAmount ?? 0);

    const titularMismatch = !!scannedTitular && !this.namesRoughlyMatch(scannedTitular, expectedName);
    const amountMismatch = scannedAmount > 0 && Math.abs(scannedAmount - expectedAmount) >= 0.01;

    if (titularMismatch || amountMismatch) {
      this.paymentAlert.set({ titularMismatch, amountMismatch, scannedTitular, scannedAmount, expectedName, expectedAmount });
      this.showPaymentAlert.set(true);
    }
  }

  /** Coincidencia laxa de nombres: ignora orden, mayúsculas y tildes; basta con que compartan tokens significativos. */
  private namesRoughlyMatch(a: string, b: string): boolean {
    const norm = (s: string) => s
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
    const ta = norm(a);
    const tb = norm(b);
    if (!ta.length || !tb.length) return false;
    const setB = new Set(tb);
    const shared = ta.filter(t => setB.has(t)).length;
    // Coincide si comparten al menos 2 tokens, o todos los de la cadena más corta.
    return shared >= 2 || shared === Math.min(ta.length, tb.length);
  }

  dismissPaymentAlert(): void {
    this.showPaymentAlert.set(false);
  }

  /** Quita el comprobante y limpia los datos escaneados y el monto autocompletado. */
  removePaymentReceipt(): void {
    this.paymentReceiptUrl = null;
    this.paymentReceiptName = null;
    this.paymentReceiptMimeType = null;
    this.paymentReceiptSizeBytes = null;
    this.resetPaymentScanState();
    this.paymentForm.patchValue({ amount: this.selectedAdvance && this.advanceRemaining(this.selectedAdvance) > 0 ? this.advanceRemaining(this.selectedAdvance) : null });
  }

  onPaymentReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      this.notificationService.show('Formato inválido. Usa PDF, JPG o PNG.', 'error');
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.notificationService.show('El comprobante no puede superar 10MB.', 'error');
      input.value = '';
      return;
    }

    this.isUploadingReceipt.set(true);
    this.uploadService.upload(file).subscribe({
      next: (res) => {
        this.paymentReceiptUrl = res.url;
        this.paymentReceiptName = file.name;
        this.paymentReceiptMimeType = file.type;
        this.paymentReceiptSizeBytes = file.size;
        this.isUploadingReceipt.set(false);
        // Escanea el comprobante: autocompleta el monto y verifica titular/monto.
        this.scanPaymentReceipt(res.url, file.type);
      },
      error: () => {
        this.notificationService.show('No se pudo subir el comprobante', 'error');
        this.isUploadingReceipt.set(false);
      },
    });
  }

  openReimbursementModal(report: IExpenseReport): void {
    this.selectedReportReimbursement = report;
    // `paymentForm` es COMPARTIDO con las fichas de solo lectura de VD-129, que
    // lo dejan deshabilitado — y `reset()` no lo vuelve a habilitar. Sin esto,
    // abrir una ficha de pago antes que este modal dejaba el reembolso mudo:
    // los campos en gris y "Confirmar reembolso" siempre inhabilitado.
    this.paymentForm.enable({ emitEvent: false });
    // El monto del reembolso es fijo (= |settlement.difference|). El modal no
    // tiene input de monto, así que lo seteamos aquí; de lo contrario el control
    // `amount` (requerido) quedaría en null y el formulario nunca sería válido,
    // bloqueando "Confirmar reembolso" incluso en efectivo.
    const reembolsoAmount = Math.abs(Number(report.settlement?.difference ?? 0)) || null;
    this.paymentForm.reset({
      amount: reembolsoAmount,
      method: 'transferencia_bancaria',
      bankName: '',
      accountNumber: '',
      cci: '',
      transferDate: new Date().toISOString().split('T')[0],
      reference: '',
    });
    this.reimbursementReceiptUrl = null;
    this.reimbursementReceiptName = null;
    this.reimbursementReceiptMimeType = null;
    this.reimbursementReceiptSizeBytes = null;
    this.resetReimbursementScanState();
    const user = typeof report.userId === 'object' ? report.userId : null;
    const bankAccount = user && typeof user === 'object' && 'bankAccount' in user
      ? (user as { bankAccount?: { bankName?: string; accountNumber?: string; cci?: string } }).bankAccount
      : undefined;
    if (bankAccount) {
      this.paymentForm.patchValue({
        bankName: bankAccount.bankName,
        accountNumber: bankAccount.accountNumber,
        cci: bankAccount.cci,
      });
    }
    this.showReimbursementModal = true;
  }

  onReimbursementReceiptSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      this.notificationService.show('Formato inválido. Usa PDF, JPG o PNG.', 'error');
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.notificationService.show('El comprobante no puede superar 10MB.', 'error');
      input.value = '';
      return;
    }
    this.isUploadingReceipt.set(true);
    this.uploadService.upload(file).subscribe({
      next: res => {
        this.reimbursementReceiptUrl = res.url;
        this.reimbursementReceiptName = file.name;
        this.reimbursementReceiptMimeType = file.type;
        this.reimbursementReceiptSizeBytes = file.size;
        this.notificationService.show('Comprobante cargado correctamente', 'success');
        this.isUploadingReceipt.set(false);
        this.scanReimbursementReceipt(res.url, file.type);
      },
      error: () => {
        this.notificationService.show('No se pudo subir el comprobante', 'error');
        this.isUploadingReceipt.set(false);
      },
    });
  }

  private resetReimbursementScanState(): void {
    this.reimbursementScannedAmount = null;
    this.reimbursementTitular = null;
    this.reimbursementOperationNumber = null;
    this.reimbursementOperationDate = null;
    this.reimbursementOperationTime = null;
  }

  /** Escanea el comprobante del reembolso y autocompleta los datos (sin alerta de discrepancia). */
  private scanReimbursementReceipt(url: string, mimeType?: string): void {
    this.isScanningReimbursement.set(true);
    this.expenseReportsService.scanDepositAmount(url, mimeType).subscribe({
      next: res => {
        this.isScanningReimbursement.set(false);
        const amount = Number(res?.amount) || 0;
        this.reimbursementScannedAmount = amount > 0 ? amount : null;
        this.reimbursementTitular = res?.titular || null;
        this.reimbursementOperationNumber = res?.operationNumber || null;
        this.reimbursementOperationDate = res?.fecha || null;
        this.reimbursementOperationTime = res?.hora || null;
        if (res?.operationNumber && !this.paymentForm.value.reference) {
          this.paymentForm.patchValue({ reference: res.operationNumber });
        }
      },
      error: () => {
        this.isScanningReimbursement.set(false);
        this.notificationService.show('No se pudo escanear el comprobante. Completa los datos manualmente.', 'warning');
      },
    });
  }

  confirmReimbursementPayment(): void {
    if (!this.selectedReportReimbursement || this.paymentForm.invalid) return;
    const method = this.paymentForm.get('method')?.value;
    if (method !== 'efectivo' && !this.reimbursementReceiptUrl) {
      this.notificationService.show('Debes adjuntar el comprobante de pago del reembolso.', 'error');
      return;
    }
    this.isActing.set(true);
    this.expenseReportsService
      .registerReimbursementPayment(this.selectedReportReimbursement._id, {
        ...this.paymentForm.value,
        paymentReceiptUrl: this.reimbursementReceiptUrl || undefined,
        paymentReceiptFileName: this.reimbursementReceiptName || undefined,
        paymentReceiptMimeType: this.reimbursementReceiptMimeType || undefined,
        paymentReceiptSizeBytes: this.reimbursementReceiptSizeBytes || undefined,
        scannedAmount: this.reimbursementScannedAmount ?? undefined,
        operationNumber: this.reimbursementOperationNumber || this.paymentForm.value.reference || undefined,
        operationDate: this.reimbursementOperationDate || undefined,
        operationTime: this.reimbursementOperationTime || undefined,
        titular: this.reimbursementTitular || undefined,
      })
      .subscribe({
        next: () => {
          this.notificationService.show('Reembolso registrado correctamente', 'success');
          this.showReimbursementModal = false;
          this.loadData();
          this.isActing.set(false);
        },
        error: e => {
          this.notificationService.show(
            e.error?.message || 'Error al registrar el reembolso',
            'error'
          );
          this.isActing.set(false);
        },
      });
  }

  collaboratorReportName(report: IExpenseReport): string {
    const u = report.userId;
    if (u && typeof u === 'object' && 'name' in u && (u as { name?: string }).name) {
      return (u as { name: string }).name;
    }
    return '—';
  }

  /**
   * Importe del reembolso en la moneda de su rendición, que es la moneda en la
   * que se paga y en la que sale la planilla del banco.
   *
   * `settlement.difference` se guarda en moneda base porque la liquidación
   * suma los `montoBase` de los gastos. Para una rendición en dólares hay que
   * deshacer esa conversión con el TC que congeló al crearse, o Tesorería
   * vería la cifra en soles junto al símbolo de dólares.
   */
  reimbursementAmount(report: IExpenseReport): string {
    const d = report.settlement?.difference;
    if (d == null) return '—';
    const base = Math.abs(Number(d));
    if (normalizeMonedaCode(report.viaticoMoneda) === DEFAULT_MONEDA) {
      return base.toFixed(2);
    }
    const tc = Number(report.tipoCambio);
    if (!tc || tc <= 0) return '—';
    return (base / tc).toFixed(2);
  }

  /** Símbolo de un código de moneda ISO, para los importes de un lote de pagos. */
  monedaSimbolo(codigo?: string | null): string {
    return monedaSymbol(codigo);
  }

  /** Símbolo de la moneda en la que se paga ese reembolso. */
  reimbursementSymbol(report: IExpenseReport): string {
    return monedaSymbol(report.viaticoMoneda);
  }

  confirmPayment() {
    if (!this.selectedAdvance || this.paymentForm.invalid) return;
    const method = this.paymentForm.get('method')?.value;
    if (method !== 'efectivo' && !this.paymentReceiptUrl) {
      this.notificationService.show('Debes adjuntar el comprobante de pago.', 'error');
      return;
    }
    this.isActing.set(true);
    this.advanceService.registerPayment(this.selectedAdvance._id, {
      ...this.paymentForm.value,
      amount: Number(this.paymentForm.value.amount),
      paymentReceiptUrl: this.paymentReceiptUrl || undefined,
      paymentReceiptFileName: this.paymentReceiptName || undefined,
      paymentReceiptMimeType: this.paymentReceiptMimeType || undefined,
      paymentReceiptSizeBytes: this.paymentReceiptSizeBytes || undefined,
      scannedAmount: this.paymentScannedAmount ?? undefined,
      scannedTitular: this.paymentScannedTitular || undefined,
      operationNumber: this.paymentOperationNumber || undefined,
      operationDate: this.paymentOperationDate || undefined,
      operationTime: this.paymentOperationTime || undefined,
    }).subscribe({
      next: () => {
        this.notificationService.show('Pago registrado correctamente', 'success');
        this.showPaymentModal = false;
        this.loadData();
        this.isActing.set(false);
      },
      error: (e) => {
        this.notificationService.show(e.error?.message || 'Error al registrar pago', 'error');
        this.isActing.set(false);
      },
    });
  }

  openReturnModal(advance: IAdvance) {
    this.selectedAdvance = advance;
    this.returnForm.reset({ returnedAmount: advance.settlement?.difference || advance.amount });
    this.showReturnModal = true;
  }

  confirmReturn() {
    if (!this.selectedAdvance || this.returnForm.invalid) return;
    this.isActing.set(true);
    this.advanceService.registerReturn(this.selectedAdvance._id, this.returnForm.value.returnedAmount).subscribe({
      next: () => {
        this.notificationService.show('Devolución registrada correctamente', 'success');
        this.showReturnModal = false;
        this.loadData();
        this.isActing.set(false);
      },
      error: (e) => {
        this.notificationService.show(e.error?.message || 'Error', 'error');
        this.isActing.set(false);
      },
    });
  }

  getUserName(advance: IAdvance): string {
    if (typeof advance.userId === 'object') return advance.userId.name;
    return '—';
  }

  getReportTitle(advance: IAdvance): string {
    if (typeof advance.expenseReportId === 'object' && advance.expenseReportId) {
      return advance.expenseReportId.title;
    }
    return '—';
  }

  getReportId(advance: IAdvance): string | null {
    if (typeof advance.expenseReportId === 'object' && advance.expenseReportId) {
      return advance.expenseReportId._id;
    }
    return typeof advance.expenseReportId === 'string' ? advance.expenseReportId : null;
  }

  getLevelsBadge(advance: IAdvance): string {
    return `L${advance.requiredLevels}`;
  }

  openHistoryModal(advance: IAdvance) {
    this.selectedAdvance = advance;
    this.showHistoryModal = true;
  }

  closeHistoryModal() {
    this.showHistoryModal = false;
  }

  approvalActionLabel(action: string): string {
    const map: Record<string, string> = {
      approved: 'Aprobación',
      rejected: 'Rechazo',
      resubmitted: 'Reenvío',
    };
    return map[action] ?? action;
  }

  formatHistoryDate(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-PE');
  }

  // ─── Fase 7 — Devoluciones ─────────────────────────────────────────────────

  returnStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'Pendiente',
      proof_uploaded: 'Comprobante cargado',
      validated: 'Validado',
      rejected: 'Rechazado',
    };
    return map[status] ?? status;
  }

  returnStatusColor(status: string): string {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      proof_uploaded: 'bg-blue-100 text-blue-700',
      validated: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return map[status] ?? 'bg-gray-100 text-gray-600';
  }

  openValidateReturnModal(advance: IAdvance): void {
    this.selectedReturnAdvance = advance;
    this.returnRejectReason.set('');
    this.showValidateReturnModal = true;
  }

  confirmValidateReturn(approved: boolean): void {
    if (!this.selectedReturnAdvance) return;
    if (!approved && this.returnRejectReason().trim().length < 50) {
      this.notificationService.show('El motivo debe tener al menos 50 caracteres', 'warning');
      return;
    }
    this.isValidatingReturn.set(true);
    this.advanceService.validateReturn(
      this.selectedReturnAdvance._id,
      approved,
      approved ? undefined : this.returnRejectReason().trim()
    ).subscribe({
      next: () => {
        this.notificationService.show(approved ? 'Devolución validada' : 'Comprobante rechazado', 'success');
        this.showValidateReturnModal = false;
        this.isValidatingReturn.set(false);
        this.loadData();
      },
      error: (e) => {
        this.notificationService.show(e.error?.message || 'Error al validar', 'error');
        this.isValidatingReturn.set(false);
      },
    });
  }

  // ─── Rendiciones Directas con saldo (iniciadas por Contabilidad) ─────────────

  private get clientId(): string {
    const user = this.userStateService.getUser() as any;
    return (
      user?.companyId ||
      user?.client?._id ||
      (typeof user?.clientId === 'string' ? user.clientId : user?.clientId?._id) ||
      ''
    );
  }

  loadDirectaDepositReports(): void {
    if (!this.canManageDirectaDeposit) {
      this.directaReports.set([]);
      return;
    }
    const cid = this.clientId;
    if (!cid) {
      this.directaReports.set([]);
      return;
    }
    this.isLoadingDirectas.set(true);
    this.expenseReportsService.findDirectaDepositReports(cid).subscribe({
      next: rows => {
        this.directaReports.set(rows ?? []);
        this.isLoadingDirectas.set(false);
      },
      error: () => {
        this.directaReports.set([]);
        this.isLoadingDirectas.set(false);
      },
    });
  }

  directaUserName(rep: any): string {
    const u = rep?.userId;
    if (u && typeof u === 'object') return u.name || u.email || '—';
    return '—';
  }

  // ─── Pagos por lote BBVA (VD-7) ─────────────────────────────────────────────

  showBatchModal = signal(false);
  batchMode = signal<'generate' | 'reconcile'>('generate');
  isGeneratingTxt = signal(false);
  isReconciling = signal(false);
  generateResult = signal<IGeneratePaymentsTxt | null>(null);
  reconcileResult = signal<IReconcileResult | null>(null);

  /** Solo quien paga (Tesorería/Contabilidad/Admin/Super) usa el lote BBVA. */
  get canUseBatchPayments(): boolean {
    return this.canPayAndSettle;
  }

  /**
   * Moneda de la última planilla generada. El PDF de retorno del banco no
   * declara la moneda, así que hay que decirle al conciliar de qué planilla
   * viene; sin esto, un PDF de la planilla en dólares no cruzaría con nada.
   */
  monedaPlanilla = signal<string | null>(null);

  /**
   * Monedas con pagos pendientes distintas a la de la planilla recién generada.
   * El formato BBVA admite una sola moneda por archivo, así que estas quedan
   * fuera y hay que emitirlas en su propia planilla.
   */
  monedasPorEmitir = computed(() => {
    const res = this.generateResult();
    if (!res) return [];
    // Las monedas que YA se emitieron en esta misma tanda no siguen pendientes:
    // el aviso "quedan pagos en otra moneda" con su botón sobraba y hacía
    // pensar que algo había quedado sin pagar.
    const emitidas = new Set(
      this.archivosGenerados().filter((a) => a.count > 0).map((a) => a.moneda)
    );
    return (res.monedasPendientes ?? []).filter(
      (m) => m.moneda !== res.moneda && !emitidas.has(m.moneda)
    );
  });

  /** Planillas de esta tanda que sí llevan pagos. */
  archivosConPagos = computed(() => this.archivosGenerados().filter((a) => a.count > 0));

  /** Pagos incluidos sumando TODAS las planillas emitidas. */
  pagosIncluidosTotal = computed(() =>
    this.archivosConPagos().reduce((n, a) => n + a.count, 0)
  );

  /**
   * Total emitido, desglosado por moneda ("S/ 45.00 · $ 212.41"). Un solo
   * número no representaría nada: sumar soles con dólares da una cifra que no
   * existe.
   */
  totalGeneradoPorMoneda = computed(() =>
    this.archivosConPagos()
      .map((a) => `${monedaSymbol(a.moneda)} ${a.totalSoles.toFixed(2)}`)
      .join(' · ')
  );

  /** Nombres de los archivos descargados, para el encabezado del resumen. */
  nombresArchivosGenerados = computed(() => {
    const nombres = this.archivosConPagos().map((a) => a.fileName);
    if (nombres.length <= 1) return nombres[0] ?? '';
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  });

  /**
   * Por qué salió vacío el archivo. El texto fijo culpaba a los datos
   * bancarios, pero el motivo más común es otro: los pendientes están en otra
   * moneda y el archivo BBVA admite una sola. Decirle a Tesorería que corrija
   * cuentas que están bien la manda a buscar un problema inexistente.
   */
  motivoArchivoVacio = computed(() => {
    const res = this.generateResult();
    const excluidos = res?.excluded ?? [];
    if (!excluidos.length) return 'No hay pagos pendientes para incluir en el archivo.';
    const otraMoneda = excluidos.filter((e) => e.moneda && e.moneda !== res?.moneda);
    if (otraMoneda.length === excluidos.length) {
      const monedas = [...new Set(otraMoneda.map((e) => e.moneda))].join(', ');
      return `Todos los pagos pendientes están en ${monedas} y este archivo es en ${res?.moneda}. El archivo BBVA admite una sola moneda por planilla: genera la de ${monedas}.`;
    }
    if (otraMoneda.length > 0) {
      return 'Ninguno de los pagos entró: unos están en otra moneda y otros tienen datos bancarios incompletos. Revisa el detalle de abajo.';
    }
    return 'Hay pagos pendientes, pero ninguno tiene datos bancarios completos. Corrige los datos de los beneficiarios y vuelve a intentarlo.';
  });

  /**
   * Excluidos de TODAS las planillas de la tanda, no solo de la primera. Cada
   * uno trae su moneda, así que se listan juntos sin mezclar nada.
   */
  excluidosTodos = computed(() => {
    const archivos = this.archivosGenerados();
    if (archivos.length) return archivos.flatMap((a) => a.excluded ?? []);
    return this.generateResult()?.excluded ?? [];
  });

  /** Importe excluido por moneda ("S/ 45.00 · $ 212.41"), para dimensionar el aviso. */
  totalExcluidoPorMoneda = computed(() => {
    const porMoneda = new Map<string, number>();
    for (const e of this.excluidosTodos()) {
      const codigo = e.moneda ?? this.generateResult()?.moneda ?? DEFAULT_MONEDA;
      porMoneda.set(codigo, (porMoneda.get(codigo) ?? 0) + Number(e.amount ?? 0));
    }
    return [...porMoneda.entries()]
      .map(([codigo, total]) => `${monedaSymbol(codigo)} ${total.toFixed(2)}`)
      .join(' · ');
  });

  /** Genera el TXT, lo descarga y muestra el resumen (excluidos por datos incompletos). */
  /**
   * Emite TODAS las planillas pendientes de una vez, una por moneda.
   *
   * El formato BBVA declara una moneda y una cuenta de cargo por archivo, así
   * que se separan; lo que ya no hace falta es pedirlas de a una. Antes se
   * emitía la de soles y recién en el resumen aparecía un aviso de que
   * quedaban pagos en dólares: quien no lo leía dejaba a esa gente sin cobrar.
   */
  generateAllPaymentsTxt(): void {
    if (this.isGeneratingTxt()) return;
    this.isGeneratingTxt.set(true);
    this.reconcileResult.set(null);
    this.advanceService.generateAllPaymentsTxt().subscribe({
      next: (res) => {
        this.isGeneratingTxt.set(false);
        this.archivosGenerados.set(res.archivos);
        this.monedasSinEmitir.set(res.fallidos);
        // El detalle de abajo (excluidos, totales) muestra una planilla a la
        // vez: se abre en la primera con pagos, o en la primera a secas.
        const principal = res.archivos.find((a) => a.count > 0) ?? res.archivos[0] ?? null;
        this.generateResult.set(principal);
        this.monedaPlanilla.set(principal?.moneda ?? null);
        this.batchMode.set('generate');
        this.showBatchModal.set(true);

        for (const a of res.archivos) {
          if (a.count > 0) this.downloadTxtFile(a.fileBase64, a.fileName);
        }

        const emitidos = res.archivos.filter((a) => a.count > 0);
        const excluidos = res.archivos.reduce((n, a) => n + a.excluded.length, 0);
        if (!emitidos.length) {
          this.notificationService.show(
            `No se generó ningún archivo: ${excluidos} beneficiario(s) sin poder pagar. Revisa el detalle.`,
            'warning'
          );
        } else if (excluidos > 0 || res.fallidos.length > 0) {
          this.notificationService.show(
            `${emitidos.length} archivo(s) generado(s), pero quedaron pagos fuera. Revisa el detalle antes de subirlos al banco.`,
            'warning'
          );
        } else {
          this.notificationService.show(
            `${emitidos.length} archivo(s) generado(s): ${emitidos.map((a) => `${a.moneda} ${a.count} pago(s)`).join(' · ')}.`,
            'success'
          );
        }
      },
      error: (e) => {
        this.isGeneratingTxt.set(false);
        this.notificationService.show(
          e.error?.message || 'No se pudo generar el archivo de pagos.',
          'error'
        );
      },
    });
  }

  /** Planillas emitidas en la última generación, una por moneda. */
  archivosGenerados = signal<IGeneratePaymentsTxt[]>([]);

  /** Monedas que no se pudieron emitir (p. ej. sin cuenta de cargo registrada). */
  monedasSinEmitir = signal<Array<{ moneda: string; count: number; total: number; motivo: string }>>([]);

  generatePaymentsTxt(moneda?: string): void {
    if (this.isGeneratingTxt()) return;
    this.isGeneratingTxt.set(true);
    this.reconcileResult.set(null);
    this.advanceService.generatePaymentsTxt(moneda).subscribe({
      next: (res) => {
        this.isGeneratingTxt.set(false);
        this.generateResult.set(res);
        this.monedaPlanilla.set(res.moneda);
        this.batchMode.set('generate');
        this.showBatchModal.set(true);
        if (res.count > 0) {
          this.downloadTxtFile(res.fileBase64, res.fileName);
          // Con excluidos el archivo es válido pero incompleto: el banco lo
          // acepta y esa gente no cobra. Un toast verde lo daba por bueno.
          if (res.excluded.length > 0) {
            this.notificationService.show(
              `Archivo generado con ${res.count} pago(s), pero ${res.excluded.length} quedaron FUERA por datos bancarios incompletos. Revísalos antes de subirlo al banco.`,
              'warning'
            );
          } else {
            this.notificationService.show(
              `Archivo generado: ${res.count} pago(s) por ${res.moneda} ${res.totalSoles.toFixed(2)}.`,
              'success'
            );
          }
        } else {
          this.notificationService.show(
            `No se generó el archivo: ${res.excluded.length} beneficiario(s) con datos bancarios incompletos.`,
            'warning'
          );
        }
      },
      error: (e) => {
        this.isGeneratingTxt.set(false);
        this.notificationService.show(
          e.error?.message || 'No se pudo generar el archivo de pagos.',
          'error'
        );
      },
    });
  }

  /** Decodifica el base64 Latin-1 a bytes y dispara la descarga del .txt. */
  private downloadTxtFile(base64: string, fileName: string): void {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'BBVAREND.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Sube el PDF de BBVA y muestra el resultado de la conciliación. */
  onReconcileFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      this.notificationService.show('Debes subir el PDF de "Consulta de Pagos Masivos" de BBVA.', 'error');
      input.value = '';
      return;
    }
    this.reconcileFile(file);
    input.value = '';
  }

  /** Envía el PDF (real o simulado) a conciliación y procesa el resultado. */
  private reconcileFile(file: File): void {
    this.isReconciling.set(true);
    // Se concilia contra la moneda de la última planilla generada. Sin este
    // dato el backend asume la moneda base y un PDF de la planilla en dólares
    // no cruzaría con ningún pendiente.
    const moneda = this.monedaPlanilla() ?? undefined;
    this.generateResult.set(null);
    this.advanceService.reconcilePayments(file, moneda).subscribe({
      next: (res) => {
        this.isReconciling.set(false);
        this.reconcileResult.set(res);
        this.batchMode.set('reconcile');
        this.showBatchModal.set(true);
        const n = res.conciliados.length;
        this.notificationService.show(
          n > 0 ? `${n} pago(s) conciliado(s) y marcado(s) como pagados.` : 'No se conció ningún pago. Revisa el resumen.',
          n > 0 ? 'success' : 'warning'
        );
        this.loadData();
      },
      error: (e) => {
        this.isReconciling.set(false);
        this.notificationService.show(
          e.error?.message || 'No se pudo procesar el PDF de BBVA.',
          'error'
        );
      },
    });
  }

  closeBatchModal(): void {
    this.showBatchModal.set(false);
  }
}
