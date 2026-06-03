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
import { RouterModule } from '@angular/router';
type Tab = 'pendientes' | 'aprobados' | 'devoluciones';

@Component({
  selector: 'app-tesoreria',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './tesoreria.component.html',
})
export class TesoreriaComponent implements OnInit {
  private advanceService = inject(AdvanceService);
  private expenseReportsService = inject(ExpenseReportsService);
  private userStateService = inject(UserStateService);
  private notificationService = inject(NotificationService);
  private uploadService = inject(UploadService);
  private fb = inject(FormBuilder);

  activeTab = signal<Tab>('pendientes');
  isLoading = signal(false);
  isActing = signal(false);

  stats: IAdvanceStats | null = null;
  allAdvances: IAdvance[] = [];
  pendingAdvances: IAdvance[] = [];
  /** Rendiciones aprobadas con reembolso al colaborador pendiente de comprobante (Fase 6) */
  pendingReimbursements: IExpenseReport[] = [];

  selectedAdvance: IAdvance | null = null;
  selectedReportReimbursement: IExpenseReport | null = null;
  showReimbursementModal = false;
  reimbursementReceiptUrl: string | null = null;
  reimbursementReceiptName: string | null = null;
  reimbursementReceiptMimeType: string | null = null;
  reimbursementReceiptSizeBytes: number | null = null;
  showPaymentModal = false;
  showRejectModal = false;
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

  paymentForm!: FormGroup;
  rejectForm!: FormGroup;
  returnForm!: FormGroup;

  readonly STATUS_LABELS = ADVANCE_STATUS_LABELS;
  readonly STATUS_COLORS = ADVANCE_STATUS_COLORS;

  get isSuperAdmin() { return this.userStateService.isSuperAdmin(); }
  get isAdmin() { return this.userStateService.isAdmin(); }
  get isContabilidad() { return this.userStateService.isContabilidad(); }
  get canPayAndSettle() { return this.userStateService.canApproveL2(); }

  ngOnInit() {
    this.initForms();
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
      method: ['transferencia_bancaria', Validators.required],
      bankName: [''],
      accountNumber: [''],
      cci: [''],
      transferDate: [new Date().toISOString().split('T')[0], Validators.required],
      reference: ['', Validators.required],
    });
    this.rejectForm = this.fb.group({
      rejectionReason: [
        '',
        [Validators.required, Validators.minLength(10)],
      ],
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
          ['pending_l2', 'approved'].includes(a.status)
        );
        this.isLoading.set(false);
        this.loadPendingReimbursements();
        this.loadPendingReturns();
      },
      error: () => {
        this.isLoading.set(false);
        this.loadPendingReimbursements();
        this.loadPendingReturns();
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

  get filteredAdvances(): IAdvance[] {
    switch (this.activeTab()) {
      case 'pendientes':
        return this.allAdvances.filter(a => ['pending_l2', 'approved'].includes(a.status));
      case 'aprobados':
        return this.allAdvances.filter(a => ['approved', 'paid'].includes(a.status));
      default:
        return this.allAdvances;
    }
  }

  approveL2(advance: IAdvance) {
    this.isActing.set(true);
    this.advanceService.approveL2(advance._id, {}).subscribe({
      next: () => {
        this.notificationService.show('Viático aprobado (Nivel 2 — Tesorería)', 'success');
        this.loadData();
        this.isActing.set(false);
      },
      error: (e) => {
        this.notificationService.show(e.error?.message || 'Error al aprobar', 'error');
        this.isActing.set(false);
      },
    });
  }

  openRejectModal(advance: IAdvance) {
    this.selectedAdvance = advance;
    this.rejectForm.reset();
    this.showRejectModal = true;
  }

  confirmReject() {
    if (!this.selectedAdvance || this.rejectForm.invalid) return;
    this.isActing.set(true);
    this.advanceService.reject(this.selectedAdvance._id, this.rejectForm.value).subscribe({
      next: () => {
        this.notificationService.show('Viático rechazado', 'success');
        this.showRejectModal = false;
        this.loadData();
        this.isActing.set(false);
      },
      error: (e) => {
        this.notificationService.show(e.error?.message || 'Error', 'error');
        this.isActing.set(false);
      },
    });
  }

  openPaymentModal(advance: IAdvance) {
    this.selectedAdvance = advance;
    this.paymentForm.reset({
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
        this.notificationService.show('Comprobante cargado correctamente', 'success');
        this.isUploadingReceipt.set(false);
      },
      error: () => {
        this.notificationService.show('No se pudo subir el comprobante', 'error');
        this.isUploadingReceipt.set(false);
      },
    });
  }

  openReimbursementModal(report: IExpenseReport): void {
    this.selectedReportReimbursement = report;
    this.paymentForm.reset({
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
      },
      error: () => {
        this.notificationService.show('No se pudo subir el comprobante', 'error');
        this.isUploadingReceipt.set(false);
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
    if (!this.paymentReceiptUrl) {
      this.notificationService.show('Debes adjuntar el comprobante de pago.', 'error');
      return;
    }
    this.isActing.set(true);
    this.advanceService.registerPayment(this.selectedAdvance._id, {
      ...this.paymentForm.value,
      paymentReceiptUrl: this.paymentReceiptUrl,
      paymentReceiptFileName: this.paymentReceiptName || undefined,
      paymentReceiptMimeType: this.paymentReceiptMimeType || undefined,
      paymentReceiptSizeBytes: this.paymentReceiptSizeBytes || undefined,
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
}
