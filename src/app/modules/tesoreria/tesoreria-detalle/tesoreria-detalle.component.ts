import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AdvanceService } from '../../../services/advance.service';
import { UserStateService } from '../../../services/user-state.service';
import { NotificationService } from '../../../services/notification.service';
import { UploadService } from '../../../services/upload.service';
import {
  IAdvance,
  IAdvanceLine,
  ADVANCE_STATUS_LABELS,
  ADVANCE_STATUS_COLORS,
} from '../../../interfaces/advance.interface';

@Component({
  selector: 'app-tesoreria-detalle',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './tesoreria-detalle.component.html',
})
export class TesoreriaDetalleComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private advanceService = inject(AdvanceService);
  private userState = inject(UserStateService);
  private notifications = inject(NotificationService);
  private uploadService = inject(UploadService);
  private fb = inject(FormBuilder);

  readonly STATUS_LABELS = ADVANCE_STATUS_LABELS;
  readonly STATUS_COLORS = ADVANCE_STATUS_COLORS;

  isLoading = signal(true);
  isActing = signal(false);
  isUploadingReceipt = signal(false);
  advance = signal<IAdvance | null>(null);

  showRejectModal = signal(false);
  showPaymentModal = signal(false);

  rejectForm!: FormGroup;
  paymentForm!: FormGroup;

  paymentReceiptUrl: string | null = null;
  paymentReceiptName: string | null = null;
  paymentReceiptMimeType: string | null = null;
  paymentReceiptSizeBytes: number | null = null;

  get canPayAndSettle() { return this.userState.canApproveL2(); }

  get canApproveL2Action(): boolean {
    const a = this.advance();
    return !!a && a.status === 'pending_l2' && this.canPayAndSettle;
  }

  get canRegisterPayment(): boolean {
    const a = this.advance();
    return !!a && ['pending_l2', 'approved'].includes(a.status) && this.canPayAndSettle;
  }

  get canReject(): boolean {
    const a = this.advance();
    return !!a && ['pending_l2', 'approved'].includes(a.status) && this.canPayAndSettle;
  }

  ngOnInit() {
    this.rejectForm = this.fb.group({
      rejectionReason: ['', [Validators.required, Validators.minLength(10)]],
    });
    this.paymentForm = this.fb.group({
      method: ['transferencia_bancaria', Validators.required],
      bankName: [''],
      accountNumber: [''],
      cci: [''],
      transferDate: [new Date().toISOString().split('T')[0], Validators.required],
      reference: ['', Validators.required],
    });

    const id = this.route.snapshot.paramMap.get('id')!;
    this.advanceService.findOne(id).subscribe({
      next: (a) => {
        this.advance.set(a);
        this.isLoading.set(false);
        this.prefillBankData(a);
      },
      error: () => {
        this.notifications.show('No se pudo cargar la solicitud', 'error');
        this.router.navigate(['/tesoreria']);
      },
    });
  }

  private prefillBankData(a: IAdvance) {
    const user = typeof a.userId === 'object' ? a.userId : null;
    if (user?.bankAccount) {
      this.paymentForm.patchValue({
        bankName: user.bankAccount.bankName,
        accountNumber: user.bankAccount.accountNumber,
        cci: user.bankAccount.cci,
      });
    }
  }

  back() { this.router.navigate(['/tesoreria']); }

  collaboratorName(): string {
    const u = this.advance()?.userId;
    return u && typeof u === 'object' ? u.name : '—';
  }

  collaboratorEmail(): string {
    const u = this.advance()?.userId;
    return u && typeof u === 'object' ? u.email : '';
  }

  projectLabel(): string {
    const p = this.advance()?.projectId;
    if (!p || typeof p === 'string') return '—';
    return p.code ? `${p.code} — ${p.name}` : p.name;
  }

  dateRange(): string {
    const a = this.advance();
    if (!a) return '—';
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    if (a.startDate && a.endDate) return `${fmt(a.startDate)} — ${fmt(a.endDate)}`;
    if (a.startDate) return fmt(a.startDate);
    return '—';
  }

  createdAt(): string {
    const c = this.advance()?.createdAt;
    if (!c) return '—';
    return new Date(c).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  lines(): IAdvanceLine[] {
    return this.advance()?.lines ?? [];
  }

  categoryName(line: IAdvanceLine): string {
    const c = line.categoryId;
    if (c && typeof c === 'object' && 'name' in c) return (c as { name: string }).name;
    return '—';
  }

  historyActionLabel(action: string): string {
    const map: Record<string, string> = {
      approved: 'Aprobado',
      rejected: 'Rechazado',
      resubmitted: 'Reenviado',
    };
    return map[action] ?? action;
  }

  reportTitle(): string {
    const r = this.advance()?.expenseReportId;
    if (r && typeof r === 'object') return r.title;
    return '—';
  }

  reportId(): string | null {
    const r = this.advance()?.expenseReportId;
    if (r && typeof r === 'object') return r._id;
    return typeof r === 'string' ? r : null;
  }

  openPaymentModal() {
    this.paymentReceiptUrl = null;
    this.paymentReceiptName = null;
    this.paymentReceiptMimeType = null;
    this.paymentReceiptSizeBytes = null;
    this.paymentForm.reset({
      method: 'transferencia_bancaria',
      bankName: '',
      accountNumber: '',
      cci: '',
      transferDate: new Date().toISOString().split('T')[0],
      reference: '',
    });
    const a = this.advance();
    if (a) this.prefillBankData(a);
    this.showPaymentModal.set(true);
  }

  onReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      this.notifications.show('Formato inválido. Usa PDF, JPG o PNG.', 'error');
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.notifications.show('El comprobante no puede superar 10MB.', 'error');
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
        this.notifications.show('Comprobante cargado', 'success');
        this.isUploadingReceipt.set(false);
      },
      error: () => {
        this.notifications.show('No se pudo subir el comprobante', 'error');
        this.isUploadingReceipt.set(false);
      },
    });
  }

  confirmPayment() {
    const a = this.advance();
    if (!a || this.paymentForm.invalid) return;
    if (!this.paymentReceiptUrl) {
      this.notifications.show('Debes adjuntar el comprobante de pago.', 'error');
      return;
    }
    this.isActing.set(true);
    this.advanceService.registerPayment(a._id, {
      ...this.paymentForm.value,
      paymentReceiptUrl: this.paymentReceiptUrl,
      paymentReceiptFileName: this.paymentReceiptName || undefined,
      paymentReceiptMimeType: this.paymentReceiptMimeType || undefined,
      paymentReceiptSizeBytes: this.paymentReceiptSizeBytes || undefined,
    }).subscribe({
      next: (updated) => {
        this.advance.set(updated);
        this.notifications.show('Pago registrado correctamente', 'success');
        this.showPaymentModal.set(false);
        this.isActing.set(false);
      },
      error: (e) => {
        this.notifications.show(e?.error?.message || 'Error al registrar pago', 'error');
        this.isActing.set(false);
      },
    });
  }

  approveL2() {
    const a = this.advance();
    if (!a) return;
    this.isActing.set(true);
    this.advanceService.approveL2(a._id, {}).subscribe({
      next: (updated) => {
        this.advance.set(updated);
        this.notifications.show('Viático aprobado (Nivel 2)', 'success');
        this.isActing.set(false);
      },
      error: (e) => {
        this.notifications.show(e?.error?.message || 'Error al aprobar', 'error');
        this.isActing.set(false);
      },
    });
  }

  confirmReject() {
    const a = this.advance();
    if (!a || this.rejectForm.invalid) return;
    this.isActing.set(true);
    this.advanceService.reject(a._id, this.rejectForm.value).subscribe({
      next: (updated) => {
        this.advance.set(updated);
        this.notifications.show('Viático rechazado', 'success');
        this.showRejectModal.set(false);
        this.isActing.set(false);
      },
      error: (e) => {
        this.notifications.show(e?.error?.message || 'Error al rechazar', 'error');
        this.isActing.set(false);
      },
    });
  }
}
