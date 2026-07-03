import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from '../../../services/notification.service';
import { LineaNegocioService } from '../../../services/linea-negocio.service';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { ILineaNegocio } from '../../../interfaces/linea-negocio.interface';

@Component({
  selector: 'app-lineas-negocio-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, IconComponent],
  templateUrl: './lineas-negocio-form.component.html',
})
export class LineasNegocioFormComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private notification = inject(NotificationService);
  private lineaNegocioService = inject(LineaNegocioService);

  isEditing = false;
  lineaId: string | null = null;
  saving = false;
  form = { name: '', code: '', isActive: true };

  private getErrorMessage(error: HttpErrorResponse, fallback: string) {
    const apiMessage = Array.isArray(error.error?.message)
      ? error.error.message.join(', ')
      : error.error?.message;
    return apiMessage || error.message || fallback;
  }

  ngOnInit() {
    this.lineaId = this.route.snapshot.paramMap.get('id');
    if (this.lineaId) {
      this.isEditing = true;
      this.load(this.lineaId);
    }
  }

  load(id: string) {
    this.lineaNegocioService.getById(id).subscribe({
      next: (l) => {
        this.form = {
          name: l.name ?? '',
          code: l.code ?? '',
          isActive: l.isActive ?? true,
        };
      },
      error: (error: HttpErrorResponse) => {
        this.notification.show(
          this.getErrorMessage(error, 'Error al cargar la línea de negocio'),
          'error'
        );
        this.back();
      },
    });
  }

  back() {
    this.router.navigate(['/lineas-negocio']);
  }

  save() {
    if (!this.form.name.trim()) {
      this.notification.show('El nombre es obligatorio', 'error');
      return;
    }
    if (!this.form.code.trim()) {
      this.notification.show('El código es obligatorio', 'error');
      return;
    }
    this.saving = true;
    const payload: Partial<ILineaNegocio> = {
      name: this.form.name.trim(),
      code: this.form.code.trim(),
      isActive: this.form.isActive,
    };

    if (this.isEditing && this.lineaId) {
      this.lineaNegocioService.update(this.lineaId, payload).subscribe({
        next: () => {
          this.notification.show('Línea de negocio actualizada', 'success');
          this.back();
        },
        error: (e: HttpErrorResponse) => {
          this.notification.show(
            this.getErrorMessage(e, 'No se pudo actualizar la línea de negocio'),
            'error'
          );
          this.saving = false;
        },
      });
    } else {
      this.lineaNegocioService.create(payload).subscribe({
        next: () => {
          this.notification.show('Línea de negocio creada', 'success');
          this.back();
        },
        error: (e: HttpErrorResponse) => {
          this.notification.show(
            this.getErrorMessage(e, 'No se pudo crear la línea de negocio'),
            'error'
          );
          this.saving = false;
        },
      });
    }
  }
}
