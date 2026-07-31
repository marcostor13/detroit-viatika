import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UploadService } from '../../../services/upload.service';
import { UserStateService } from '../../../services/user-state.service';
import { AdminUsersService } from '../../admin-users/services/admin-users.service';
import { IUserResponse } from '../../../interfaces/user.interface';
import { ERoles } from '../../admin-users/interfaces/roles.enum';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { IProject } from '../../invoices/interfaces/project.interface';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { IOrdenTrabajo } from '../../../interfaces/orden-trabajo.interface';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { FormFieldComponent } from '../../../design-system/form-field/form-field.component';
import { ProjectSelectComponent } from '../../../design-system/project-select/project-select.component';

@Component({
  selector: 'app-nueva-rendicion-directa-deposito',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, IconComponent, FormFieldComponent, ProjectSelectComponent],
  templateUrl: './nueva-rendicion-directa-deposito.component.html',
})
export class NuevaRendicionDirectaDepositoComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private expenseReportsService = inject(ExpenseReportsService);
  private notificationService = inject(NotificationService);
  private uploadService = inject(UploadService);
  private userStateService = inject(UserStateService);
  private adminUsersService = inject(AdminUsersService);
  private invoicesService = inject(InvoicesService);
  private ordenTrabajoService = inject(OrdenTrabajoService);

  targetUsers = signal<IUserResponse[]>([]);
  isUploadingDeposit = signal(false);
  isScanningDeposit = signal(false);
  isCreating = signal(false);

  // Centro de costo + OT: fijan el destino de todos los comprobantes de la rendición.
  projects = signal<IProject[]>([]);
  ordenesTrabajo = signal<IOrdenTrabajo[]>([]);
  // Espejo en signal del valor de `projectId`: un `computed()` solo reacciona a
  // lecturas de OTRAS signals, no a `form.get(...).value` (no es reactivo), así
  // que sin este signal el filtro quedaba "congelado" con el primer valor leído.
  private selectedProjectId = signal<string>('');
  filteredOrdenesTrabajo = computed<IOrdenTrabajo[]>(() => {
    const pid = this.selectedProjectId();
    if (!pid) return [];
    return this.ordenesTrabajo().filter(ot => this.otCostCenterId(ot) === pid);
  });

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
    projectId: ['', Validators.required],
    ordenTrabajoId: ['', Validators.required],
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

    const clientId = this.resolveClientId();
    if (clientId) {
      this.invoicesService.getProjects(clientId).subscribe({
        next: list => this.projects.set((list || []).filter(p => p.isActive !== false)),
        error: () => this.projects.set([]),
      });
    }

    this.ordenTrabajoService.getAll().subscribe({
      next: list => this.ordenesTrabajo.set((list || []).filter(o => o.isActive !== false)),
      error: () => this.ordenesTrabajo.set([]),
    });

    this.selectedProjectId.set(this.form.get('projectId')?.value ?? '');
    // Si cambia el centro de costo, limpia la OT si ya no pertenece a él.
    this.form.get('projectId')?.valueChanges.subscribe(pid => {
      this.selectedProjectId.set(pid ?? '');
      const otId = this.form.get('ordenTrabajoId')?.value;
      if (!otId) return;
      const stillValid = this.ordenesTrabajo().some(
        ot => ot._id === otId && this.otCostCenterId(ot) === pid
      );
      if (!stillValid) this.form.get('ordenTrabajoId')?.setValue('');
    });
  }

  /** Id del centro de costo de una OT (soporta el ref poblado o el id plano). */
  private otCostCenterId(ot: IOrdenTrabajo): string {
    const cc = ot.costCenterId;
    return cc && typeof cc === 'object' ? String(cc._id ?? '') : String(cc ?? '');
  }

  private resolveClientId(): string {
    const user = this.userStateService.getUser() as any;
    return (
      user?.companyId ||
      user?.client?._id ||
      (typeof user?.clientId === 'string' ? user.clientId : user?.clientId?._id) ||
      ''
    );
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

  /**
   * Mensaje de error de la OT: si el centro de costo elegido no tiene ninguna
   * OT activa, se prioriza esa explicación por sobre el error genérico de
   * "campo requerido" (que aparece apenas se toca el select y, si no, tapaba
   * la razón real de por qué el desplegable está vacío).
   */
  otErrorMessage(): string {
    const projectId = this.form.get('projectId')?.value;
    if (projectId && this.filteredOrdenesTrabajo().length === 0) {
      return 'El centro de costo elegido no tiene órdenes de trabajo activas. Créalas en Configuración → Órdenes de Trabajo.';
    }
    const ctrl = this.form.get('ordenTrabajoId');
    return ctrl?.invalid && ctrl?.touched ? 'Seleccione una orden de trabajo' : '';
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
    this.expenseReportsService.createDirectaDeposit({
      userId: v.userId,
      projectId: v.projectId,
      ordenTrabajoId: v.ordenTrabajoId,
      gestion: v.gestion?.trim() || undefined,
      amount: Number(v.amount),
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
      next: (report) => {
        this.isCreating.set(false);
        this.notificationService.show('Rendición directa creada con el depósito registrado.', 'success');
        this.router.navigate(['/mis-rendiciones', report._id, 'detalle']);
      },
      error: e => {
        this.isCreating.set(false);
        const raw = e?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(msg || 'Error al crear la rendición.', 'error');
      },
    });
  }
}
