import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { IOrdenTrabajo } from '../../../interfaces/orden-trabajo.interface';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { IProject } from '../../invoices/interfaces/project.interface';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { FormFieldComponent } from '../../../design-system/form-field/form-field.component';
import { CardComponent } from '../../../design-system/card/card.component';

@Component({
  selector: 'app-ordenes-trabajo-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    IconComponent,
    FormFieldComponent,
    CardComponent,
  ],
  templateUrl: './ordenes-trabajo-form.component.html',
})
export class OrdenesTrabajoFormComponent implements OnInit {
  private ordenTrabajoService = inject(OrdenTrabajoService);
  private notificationService = inject(NotificationService);
  private invoicesService = inject(InvoicesService);
  private userStateService = inject(UserStateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isEditMode = signal(false);
  loading = signal(false);
  saving = signal(false);
  ordenId = signal<string | null>(null);

  /** Centros de costo activos de la empresa, para el selector. */
  centrosCosto = signal<IProject[]>([]);

  nombre = signal('');
  costCenterId = signal('');
  isActive = signal(true);

  nombreError = signal('');
  costCenterError = signal('');

  ngOnInit() {
    this.loadCentrosCosto();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.ordenId.set(id);
      this.load(id);
    }
  }

  private companyId(): string {
    return this.userStateService.getUser()?.companyId || '';
  }

  private loadCentrosCosto() {
    this.invoicesService.getProjects(this.companyId()).subscribe({
      next: (list) => this.centrosCosto.set((list || []).filter((c) => c.isActive !== false)),
      error: () => this.centrosCosto.set([]),
    });
  }

  private load(id: string) {
    this.loading.set(true);
    this.ordenTrabajoService.getById(id).subscribe({
      next: (orden: IOrdenTrabajo) => {
        this.nombre.set(orden.nombre);
        const cc = orden.costCenterId;
        this.costCenterId.set(cc && typeof cc === 'object' ? (cc._id || '') : String(cc || ''));
        this.isActive.set(orden.isActive ?? true);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.notificationService.show('Error al cargar la orden de trabajo: ' + error.message, 'error');
        this.loading.set(false);
        this.goBack();
      },
    });
  }

  onNombreChange(value: string) {
    this.nombre.set(value);
    this.nombreError.set('');
  }

  onCostCenterChange(value: string) {
    this.costCenterId.set(value);
    this.costCenterError.set('');
  }

  private validate(): boolean {
    let ok = true;
    if (!this.nombre().trim()) {
      this.nombreError.set('Ingresa el nombre de la OT');
      ok = false;
    }
    if (!this.costCenterId()) {
      this.costCenterError.set('Selecciona un centro de costo');
      ok = false;
    }
    return ok;
  }

  save() {
    if (!this.validate()) return;
    this.saving.set(true);

    const payload = {
      nombre: this.nombre().trim(),
      costCenterId: this.costCenterId(),
      isActive: this.isActive(),
    };

    if (this.isEditMode()) {
      this.ordenTrabajoService.update(this.ordenId()!, payload).subscribe({
        next: () => {
          this.notificationService.show('Orden de trabajo actualizada', 'success');
          this.saving.set(false);
          this.goBack();
        },
        error: (error: HttpErrorResponse) => {
          this.notificationService.show('Error al guardar: ' + (error.error?.message || error.message), 'error');
          this.saving.set(false);
        },
      });
      return;
    }

    this.ordenTrabajoService.create(payload).subscribe({
      next: (created) => {
        this.notificationService.show(`Orden de trabajo ${created.nombre} creada`, 'success');
        this.saving.set(false);
        this.goBack();
      },
      error: (error: HttpErrorResponse) => {
        this.notificationService.show('Error al crear: ' + (error.error?.message || error.message), 'error');
        this.saving.set(false);
      },
    });
  }

  goBack() {
    this.router.navigate(['/ordenes-trabajo']);
  }
}
