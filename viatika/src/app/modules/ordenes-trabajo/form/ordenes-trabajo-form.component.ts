import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { NotificationService } from '../../../services/notification.service';
import { IOrdenTrabajo, OT_DEPARTAMENTOS, otDepartamentoLabel } from '../../../interfaces/orden-trabajo.interface';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { InputComponent } from '../../../design-system/input/input.component';
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
    InputComponent,
    FormFieldComponent,
    CardComponent,
  ],
  templateUrl: './ordenes-trabajo-form.component.html',
})
export class OrdenesTrabajoFormComponent implements OnInit {
  private ordenTrabajoService = inject(OrdenTrabajoService);
  private notificationService = inject(NotificationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly departamentos = OT_DEPARTAMENTOS;
  readonly departamentoLabel = otDepartamentoLabel;

  isEditMode = signal(false);
  loading = signal(false);
  saving = signal(false);
  ordenId = signal<string | null>(null);

  codigo = signal('');
  departamento = signal('');
  descripcion = signal('');
  isActive = signal(true);

  departamentoError = signal('');

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode.set(true);
      this.ordenId.set(id);
      this.load(id);
    }
  }

  private load(id: string) {
    this.loading.set(true);
    this.ordenTrabajoService.getById(id).subscribe({
      next: (orden: IOrdenTrabajo) => {
        this.codigo.set(orden.codigo);
        this.departamento.set(orden.departamento);
        this.descripcion.set(orden.descripcion || '');
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

  onDepartamentoChange(value: string) {
    this.departamento.set(value);
    this.departamentoError.set('');
  }

  save() {
    if (this.isEditMode()) {
      this.saving.set(true);
      this.ordenTrabajoService
        .update(this.ordenId()!, {
          descripcion: this.descripcion().trim() || undefined,
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

    if (!this.departamento()) {
      this.departamentoError.set('Selecciona un departamento');
      return;
    }

    this.saving.set(true);
    this.ordenTrabajoService
      .create({
        departamento: this.departamento(),
        descripcion: this.descripcion().trim() || undefined,
        isActive: this.isActive(),
      })
      .subscribe({
        next: (created) => {
          this.notificationService.show(`Orden de trabajo ${created.codigo} creada`, 'success');
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
