import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { IProject } from '../../invoices/interfaces/project.interface';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { IOrdenTrabajo } from '../../../interfaces/orden-trabajo.interface';
import { FormFieldComponent } from '../../../design-system/form-field/form-field.component';
import { ProjectSelectComponent } from '../../../design-system/project-select/project-select.component';

@Component({
  selector: 'app-nueva-rendicion-directa',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormFieldComponent, ProjectSelectComponent],
  templateUrl: './nueva-rendicion-directa.component.html',
})
export class NuevaRendicionDirectaComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private expenseReportsService = inject(ExpenseReportsService);
  private notifications = inject(NotificationService);
  private userState = inject(UserStateService);
  private invoicesService = inject(InvoicesService);
  private ordenTrabajoService = inject(OrdenTrabajoService);

  submitting = signal(false);

  // Centros de costo asignables: el colaborador elige uno al crear la rendición;
  // sus documentos heredarán ese centro de costo (ya no se elige por-comprobante).
  projects = signal<IProject[]>([]);

  // Órdenes de Trabajo: se eligen al crear (filtradas por el centro de costo) y
  // se heredan por todos los comprobantes de la rendición (ya no se elige por-comprobante).
  ordenesTrabajo = signal<IOrdenTrabajo[]>([]);
  filteredOrdenesTrabajo = computed<IOrdenTrabajo[]>(() => {
    const pid = this.form?.get('projectId')?.value;
    if (!pid) return [];
    return this.ordenesTrabajo().filter(ot => this.otCostCenterId(ot) === pid);
  });

  form: FormGroup = this.fb.group({
    gestion: ['', [Validators.required, Validators.minLength(3)]],
    projectId: ['', Validators.required],
    ordenTrabajoId: ['', Validators.required],
  });

  ngOnInit(): void {
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

    // Si cambia el centro de costo, limpia la OT si ya no pertenece a él.
    this.form.get('projectId')?.valueChanges.subscribe(pid => {
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
    const user = this.userState.getUser() as any;
    return (
      user?.companyId ||
      user?.client?._id ||
      (typeof user?.clientId === 'string' ? user.clientId : user?.clientId?._id) ||
      ''
    );
  }

  goBack(): void {
    this.router.navigate(['/mis-rendiciones']);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const user = this.userState.getUser() as any;
    const userId = user?._id ?? '';
    const clientId = this.resolveClientId();

    if (!userId || !clientId) {
      this.notifications.show('No se pudo identificar al usuario o empresa.', 'error');
      return;
    }

    this.submitting.set(true);
    this.expenseReportsService
      .create({
        gestion: this.form.value.gestion?.trim(),
        isDirecta: true,
        userId,
        clientId,
        projectId: this.form.value.projectId,
        ordenTrabajoId: this.form.value.ordenTrabajoId,
      })
      .subscribe({
        next: (report) => {
          this.submitting.set(false);
          this.notifications.show('Rendición creada correctamente.', 'success');
          this.router.navigate(['/mis-rendiciones', report._id, 'detalle']);
        },
        error: (err) => {
          this.submitting.set(false);
          const raw = err?.error?.message;
          const msg = Array.isArray(raw) ? raw.join(', ') : raw;
          this.notifications.show(msg || 'Error al crear la rendición.', 'error');
        },
      });
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }
}
