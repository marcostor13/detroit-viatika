import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AdvanceService } from '../../services/advance.service';
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
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { ButtonComponent } from '../../design-system/button/button.component';
import { IconComponent } from '../../design-system/icon/icon.component';
import { TabsComponent, TabItem } from '../../design-system/tabs/tabs.component';
type Tab = 'pendientes' | 'aprobados' | 'devoluciones' | 'rendiciones-directas';

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
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  activeTab = signal<Tab>('pendientes');

  get tabsList(): TabItem[] {
    const tabs: TabItem[] = [
      { value: 'pendientes', label: 'Pendientes' },
      { value: 'aprobados', label: 'En pago' },
    ];
    if (this.canPayAndSettle) {
      tabs.push({ value: 'devoluciones', label: 'Devoluciones', badge: this.pendingReturns.length || undefined });
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
        this.loadDirectaDepositReports();
        this.loadPendingViaticoPayments();
      },
      error: () => {
        this.isLoading.set(false);
        this.loadPendingReimbursements();
        this.loadPendingReturns();
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

  private loadPendingViaticoPayments(): void {
    const cid = this.clientId;
    if (!cid || !this.canPayAndSettle) {
      this.pendingViaticoPayments = [];
      this.paidViaticoPayments = [];
      return;
    }
    this.expenseReportsService.findAllByClient(cid).subscribe({
      next: reports => {
        const viaticos = (reports ?? []).filter(r => r.type === 'viatico');
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
      },
      error: () => {
        this.pendingViaticoPayments = [];
        this.paidViaticoPayments = [];
      },
    });
  }

  viaticoUserName(report: IExpenseReport): string {
    const u = report.userId;
    if (u && typeof u === 'object' && 'name' in u) return (u as { name: string }).name || '—';
    return '—';
  }

  viaticoRemaining(report: IExpenseReport): number {
    return Math.max(Number(report.viaticoAmount ?? 0) - Number(report.viaticoPaidAmount ?? 0), 0);
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
        this.notificationService.show('Pago de viático registrado correctamente', 'success');
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

  openPaymentModal(advance: IAdvance) {
    this.selectedAdvance = advance;
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
    this.showPaymentModal = true;
  }

  // ─── Pago de viático: acumulado y pagos parciales ────────────────────────────

  advancePaid(advance: IAdvance): number {
    return Number(advance?.paidAmount ?? 0);
  }

  advanceRemaining(advance: IAdvance): number {
    return Math.max(Number(advance?.amount ?? 0) - this.advancePaid(advance), 0);
  }

  /** Contabilidad puede registrar/seguir registrando pagos mientras no se haya liquidado. */
  canRegisterPayment(advance: IAdvance): boolean {
    return (
      this.canPayAndSettle &&
      ['approved', 'partially_paid', 'paid'].includes(advance.status)
    );
  }

  payButtonLabel(advance: IAdvance): string {
    if (advance.status === 'partially_paid') return 'Registrar pago';
    if (advance.status === 'paid') return 'Pago adicional';
    return 'Registrar pago';
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

  reimbursementAmount(report: IExpenseReport): string {
    const d = report.settlement?.difference;
    if (d == null) return '—';
    return Math.abs(Number(d)).toFixed(2);
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
}
