import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { IOrdenTrabajo } from '../../../interfaces/orden-trabajo.interface';
import { IProject } from '../../invoices/interfaces/project.interface';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { InputComponent } from '../../../design-system/input/input.component';
import { FormFieldComponent } from '../../../design-system/form-field/form-field.component';
import { CardComponent } from '../../../design-system/card/card.component';
import { ProjectSelectComponent } from '../../../design-system/project-select/project-select.component';

@Component({
  selector: 'app-ordenes-trabajo-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    IconComponent,
    InputComponent,
    FormFieldComponent,
    CardComponent,
    ProjectSelectComponent,
  ],
  templateUrl: './ordenes-trabajo-form.component.html',
})
export class OrdenesTrabajoFormComponent implements OnInit {
  private ordenTrabajoService = inject(OrdenTrabajoService);
  private invoicesService = inject(InvoicesService);
  private notificationService = inject(NotificationService);
  private userStateService = inject(UserStateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  projects = signal<IProject[]>([]);

  isEditMode = signal(false);
  loading = signal(false);
  saving = signal(false);
  ordenId = signal<string | null>(null);

  nombre = signal('');
  costCenterId = signal('');
  isActive = signal(true);

  nombreError = signal('');
  costCenterError = signal('');

  ngOnInit() {
    this.loadProjects();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.ordenId.set(id);
      this.load(id);
    }
  }

  private loadProjects() {
    const companyId = this.userStateService.getUser()?.companyId;
    if (!companyId) return;
    this.invoicesService.getProjects(companyId).subscribe({
      next: (list) => this.projects.set((list || []).filter((p) => p.isActive !== false)),
      error: () => this.projects.set([]),
    });
  }

  private load(id: string) {
    this.loading.set(true);
    this.ordenTrabajoService.getById(id).subscribe({
      next: (orden: IOrdenTrabajo) => {
        this.nombre.set(orden.nombre);
        const cc = orden.costCenterId;
        this.costCenterId.set(cc && typeof cc === 'object' ? cc._id : String(cc ?? ''));
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
      this.nombreError.set('El nombre es obligatorio');
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

    if (this.isEditMode()) {
      this.ordenTrabajoService
        .update(this.ordenId()!, {
          nombre: this.nombre().trim(),
          costCenterId: this.costCenterId(),
          isActive: this.isActive(),
        })
        .subscribe({
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

    this.ordenTrabajoService
      .create({
        nombre: this.nombre().trim(),
        costCenterId: this.costCenterId(),
        isActive: this.isActive(),
      })
      .subscribe({
        next: (created) => {
          this.notificationService.show(`Orden de trabajo "${created.nombre}" creada`, 'success');
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
