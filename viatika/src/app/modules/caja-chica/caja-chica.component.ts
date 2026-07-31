import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PettyCashService } from '../../services/petty-cash.service';
import { UploadService } from '../../services/upload.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { AdminUsersService } from '../admin-users/services/admin-users.service';
import { IUserResponse } from '../../interfaces/user.interface';
import {
  IPettyCash,
  PETTY_CASH_STATUS_LABELS,
  PETTY_CASH_STATUS_COLORS,
} from '../../interfaces/petty-cash.interface';

type Tab = 'mis' | 'todos';

@Component({
  selector: 'app-caja-chica',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './caja-chica.component.html',
})
export class CajaChicaComponent implements OnInit {
  private service = inject(PettyCashService);
  private uploadService = inject(UploadService);
  private userState = inject(UserStateService);
  private notif = inject(NotificationService);
  private adminUsersService = inject(AdminUsersService);
  private fb = inject(FormBuilder);

  activeTab = signal<Tab>('mis');
  isLoading = signal(false);
  isActing = signal(false);

  myCajas: IPettyCash[] = [];
  allCajas: IPettyCash[] = [];
  users: IUserResponse[] = [];
  selectedCaja: IPettyCash | null = null;

  showCreateModal = signal(false);
  showDetailModal = signal(false);
  showFundModal = signal(false);

  createForm!: FormGroup;
  fundForm!: FormGroup;

  isUploadingFundReceipt = signal(false);
  fundReceiptUrl: string | null = null;
  fundReceiptName: string | null = null;

  readonly STATUS_LABELS = PETTY_CASH_STATUS_LABELS;
  readonly STATUS_COLORS = PETTY_CASH_STATUS_COLORS;

  get isAdmin(): boolean { return this.userState.isAdmin() || this.userState.isSuperAdmin(); }
  get canFund(): boolean { return this.userState.canApproveL2(); }

  ngOnInit(): void {
    this.initForms();
    this.loadData();
  }

  private initForms(): void {
    this.createForm = this.fb.group({
      responsibleId: ['', Validators.required],
      period: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      fundAmount: [null, [Validators.required, Validators.min(0.01)]],
      maxPerExpense: [null],
      maxPerDay: [null],
      allowedCategories: [''],
    });
    this.fundForm = this.fb.group({
      transferDate: [new Date().toISOString().split('T')[0], Validators.required],
      amount: [null, [Validators.required, Validators.min(0.01)]],
      operationNumber: ['', Validators.required],
    });
  }

  loadData(): void {
    this.isLoading.set(true);
    this.service.findMine().subscribe({
      next: rows => {
        this.myCajas = rows;
        this.isLoading.set(false);
      },
      error: () => { this.isLoading.set(false); },
    });
    if (this.isAdmin) {
      this.service.findAllByClient().subscribe({
        next: rows => { this.allCajas = rows; },
        error: () => {},
      });
      this.adminUsersService.getUsers().subscribe({
        next: users => { this.users = users; },
        error: () => {},
      });
    }
  }

  get displayedList(): IPettyCash[] {
    return this.activeTab() === 'todos' ? this.allCajas : this.myCajas;
  }

  get currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  openCreateModal(): void {
    const userId = (this.userState.getUser() as any)?._id || '';
    this.createForm.reset({
      responsibleId: userId,
      period: this.currentPeriod,
      fundAmount: null,
      maxPerExpense: null,
      maxPerDay: null,
      allowedCategories: '',
    });
    this.showCreateModal.set(true);
  }

  submitCreate(): void {
    if (this.createForm.invalid) return;
    const val = this.createForm.value;
    const payload = {
      ...val,
      allowedCategories: val.allowedCategories
        ? String(val.allowedCategories).split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
    };
    this.isActing.set(true);
    this.service.create(payload).subscribe({
      next: () => {
        this.notif.show('Caja chica creada', 'success');
        this.showCreateModal.set(false);
        this.isActing.set(false);
        this.loadData();
      },
      error: (e) => {
        const msg = e?.error?.message;
        this.notif.show(Array.isArray(msg) ? msg.join(', ') : msg || 'Error al crear', 'error');
        this.isActing.set(false);
      },
    });
  }

  openDetail(caja: IPettyCash): void {
    this.selectedCaja = caja;
    this.showDetailModal.set(true);
  }

  openFundModal(caja: IPettyCash): void {
    this.selectedCaja = caja;
    this.fundForm.reset({
      transferDate: new Date().toISOString().split('T')[0],
      amount: caja.fundAmount,
      operationNumber: '',
    });
    this.fundReceiptUrl = null;
    this.fundReceiptName = null;
    this.showFundModal.set(true);
  }

  onFundReceiptSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      this.notif.show('Formato invalido. Usa PDF, JPG o PNG.', 'error');
      input.value = '';
      return;
    }
    this.isUploadingFundReceipt.set(true);
    this.uploadService.upload(file).subscribe({
      next: (res) => {
        this.fundReceiptUrl = res.url;
        this.fundReceiptName = file.name;
        this.notif.show('Comprobante subido', 'success');
        this.isUploadingFundReceipt.set(false);
      },
      error: () => {
        this.notif.show('No se pudo subir el comprobante', 'error');
        this.isUploadingFundReceipt.set(false);
      },
    });
  }

  confirmFund(): void {
    if (!this.selectedCaja || this.fundForm.invalid || !this.fundReceiptUrl) {
      this.notif.show('Completa todos los campos y adjunta el comprobante', 'warning');
      return;
    }
    this.isActing.set(true);
    this.service.registerFunding(this.selectedCaja._id, {
      ...this.fundForm.value,
      receiptUrl: this.fundReceiptUrl,
    }).subscribe({
      next: (updated) => {
        this.notif.show('Fondeo registrado. Caja chica activa.', 'success');
        this.selectedCaja = updated;
        this.showFundModal.set(false);
        this.isActing.set(false);
        this.loadData();
      },
      error: (e) => {
        this.notif.show(e?.error?.message || 'Error al registrar fondeo', 'error');
        this.isActing.set(false);
      },
    });
  }

  closeCaja(caja: IPettyCash): void {
    this.isActing.set(true);
    this.service.close(caja._id).subscribe({
      next: () => {
        this.notif.show('Caja chica cerrada', 'success');
        this.isActing.set(false);
        if (this.selectedCaja?._id === caja._id) {
          this.showDetailModal.set(false);
        }
        this.loadData();
      },
      error: (e) => {
        this.notif.show(e?.error?.message || 'Error al cerrar', 'error');
        this.isActing.set(false);
      },
    });
  }

  getName(field: unknown): string {
    if (field && typeof field === 'object' && 'name' in field) {
      return String((field as { name: string }).name);
    }
    return '—';
  }

  formatPeriod(period: string): string {
    if (!period || period.length !== 6) return period;
    return `${period.slice(0, 4)}/${period.slice(4)}`;
  }

  availableBalance(caja: IPettyCash): number {
    return caja.fundAmount - caja.spentAmount;
  }

  spentPercent(caja: IPettyCash): number {
    if (!caja.fundAmount) return 0;
    return Math.min(100, (caja.spentAmount / caja.fundAmount) * 100);
  }

  formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
