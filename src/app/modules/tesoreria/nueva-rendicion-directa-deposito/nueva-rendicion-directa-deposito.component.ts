import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { SaldoService } from '../../../services/saldo.service';
import { NotificationService } from '../../../services/notification.service';
import { UploadService } from '../../../services/upload.service';
import { UserStateService } from '../../../services/user-state.service';
import { AdminUsersService } from '../../admin-users/services/admin-users.service';
import { IUserResponse } from '../../../interfaces/user.interface';
import { ERoles } from '../../admin-users/interfaces/roles.enum';

@Component({
  selector: 'app-nueva-rendicion-directa-deposito',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './nueva-rendicion-directa-deposito.component.html',
})
export class NuevaRendicionDirectaDepositoComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private expenseReportsService = inject(ExpenseReportsService);
  private saldoService = inject(SaldoService);
  private notificationService = inject(NotificationService);
  private uploadService = inject(UploadService);
  private userStateService = inject(UserStateService);
  private adminUsersService = inject(AdminUsersService);

  targetUsers = signal<IUserResponse[]>([]);
  isUploadingDeposit = signal(false);
  isScanningDeposit = signal(false);
  isCreating = signal(false);

  depositReceiptUrl: string | null = null;
  depositReceiptName: string | null = null;
  depositReceiptMimeType: string | null = null;
  depositReceiptSizeBytes: number | null = null;
  depositScannedAmount: number | null = null;
  depositOperationNumber: string | null = null;
  depositOperationDate: string | null = null;
  depositOperationTime: string | null = null;
  depositTitular: string | null = null;

  form: FormGroup = this.fb.group({
    userId: ['', Validators.required],
    metodoPago: ['deposito', Validators.required],
    gestion: [''],
    amount: [null, [Validators.required, Validators.min(0.01)]],
  });

  /** En efectivo el comprobante es opcional; en depósito sigue siendo obligatorio. */
  get isEfectivo(): boolean {
    return this.form.get('metodoPago')?.value === 'efectivo';
  }

  /** El comprobante solo bloquea el envío cuando el método es depósito. */
  get requiresReceipt(): boolean {
    return !this.isEfectivo;
  }

  get isReceiptMissing(): boolean {
    return this.requiresReceipt && !this.depositReceiptUrl;
  }

  setMetodoPago(metodo: 'deposito' | 'efectivo'): void {
    this.form.patchValue({ metodoPago: metodo });
  }

  ngOnInit(): void {
    this.loadTargetUsers();
  }

  goBack(): void {
    this.router.navigate(['/tesoreria'], { queryParams: { tab: 'rendiciones-directas' } });
  }

  private loadTargetUsers(): void {
    this.adminUsersService.getUsers().subscribe({
      next: users => {
        const allowed = [ERoles.Colaborador, ERoles.Coordinador].map(r => String(r).toLowerCase());
        const filtered = (users ?? []).filter(u => {
          const roleName = String((u as any).roleName || (u as any).role?.name || '').toLowerCase();
          return allowed.includes(roleName);
        });
        this.targetUsers.set(filtered.length ? filtered : (users ?? []));
      },
      error: () => this.targetUsers.set([]),
    });
  }

  targetUserLabel(u: IUserResponse): string {
    const role = String((u as any).roleName || (u as any).role?.name || '');
    return role ? `${u.name} (${role})` : u.name;
  }

  onDepositReceiptSelected(event: Event): void {
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
    this.isUploadingDeposit.set(true);
    this.uploadService.upload(file).subscribe({
      next: res => {
        this.depositReceiptUrl = res.url;
        this.depositReceiptName = file.name;
        this.depositReceiptMimeType = file.type;
        this.depositReceiptSizeBytes = file.size;
        this.isUploadingDeposit.set(false);
        this.scanDepositReceipt(res.url, file.type);
      },
      error: () => {
        this.notificationService.show('No se pudo subir el comprobante', 'error');
        this.isUploadingDeposit.set(false);
      },
    });
  }

  private scanDepositReceipt(url: string, mimeType?: string): void {
    this.isScanningDeposit.set(true);
    this.expenseReportsService.scanDepositAmount(url, mimeType).subscribe({
      next: res => {
        this.isScanningDeposit.set(false);
        const amount = Number(res?.amount) || 0;
        this.depositScannedAmount = amount;
        this.depositOperationNumber = res?.operationNumber || null;
        this.depositOperationDate = res?.fecha || null;
        this.depositOperationTime = res?.hora || null;
        this.depositTitular = res?.titular || null;
        if (amount > 0) {
          this.form.patchValue({ amount });
          this.notificationService.show('Datos detectados del comprobante. Puedes editar el monto si es necesario.', 'success');
        } else {
          this.notificationService.show('No se pudo detectar el monto. Ingrésalo manualmente.', 'warning');
        }
      },
      error: () => {
        this.isScanningDeposit.set(false);
        this.notificationService.show('No se pudo escanear el comprobante. Ingresa el monto manualmente.', 'warning');
      },
    });
  }

  removeDepositReceipt(): void {
    this.depositReceiptUrl = null;
    this.depositReceiptName = null;
    this.depositReceiptMimeType = null;
    this.depositReceiptSizeBytes = null;
    this.depositScannedAmount = null;
    this.depositOperationNumber = null;
    this.depositOperationDate = null;
    this.depositOperationTime = null;
    this.depositTitular = null;
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }

  get hasDetectedData(): boolean {
    return !!(this.depositOperationNumber || this.depositOperationDate || this.depositOperationTime || this.depositTitular);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.isReceiptMissing) {
      this.notificationService.show('Debes adjuntar el comprobante de depósito.', 'error');
      return;
    }
    this.isCreating.set(true);
    const v = this.form.value;
    this.saldoService.createPago({
      userId: v.userId,
      amount: Number(v.amount),
      concepto: v.gestion?.trim() || undefined,
      metodoPago: v.metodoPago,
      scannedAmount: this.depositScannedAmount ?? undefined,
      receiptUrl: this.depositReceiptUrl || undefined,
      receiptFileName: this.depositReceiptName || undefined,
      receiptMimeType: this.depositReceiptMimeType || undefined,
      receiptSizeBytes: this.depositReceiptSizeBytes || undefined,
      operationNumber: this.depositOperationNumber || undefined,
      operationDate: this.depositOperationDate || undefined,
      operationTime: this.depositOperationTime || undefined,
      titular: this.depositTitular || undefined,
    }).subscribe({
      next: () => {
        this.isCreating.set(false);
        this.notificationService.show('Pago registrado y saldo asignado al colaborador.', 'success');
        this.router.navigate(['/tesoreria'], { queryParams: { tab: 'rendiciones-directas' } });
      },
      error: e => {
        this.isCreating.set(false);
        const raw = e?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al registrar el pago.', 'error');
      },
    });
  }
}
