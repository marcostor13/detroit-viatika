import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from '../../../services/notification.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { UserStateService } from '../../../services/user-state.service';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IProject } from '../../invoices/interfaces/project.interface';

@Component({
  selector: 'app-centros-de-costo-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  templateUrl: './centros-de-costo-form.component.html',
})
export class CentrosDeCostoFormComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private notification = inject(NotificationService);
  private invoicesService = inject(InvoicesService);
  private userStateService = inject(UserStateService);

  isEditing = false;
  projectId: string | null = null;
  saving = false;
  form = { name: '', code: '', isActive: true };

  private getErrorMessage(error: HttpErrorResponse, fallback: string) {
    const apiMessage = Array.isArray(error.error?.message)
      ? error.error.message.join(', ')
      : error.error?.message;
    return apiMessage || error.message || fallback;
  }

  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id');
    if (this.projectId) {
      this.isEditing = true;
      this.loadProject(this.projectId);
    }
  }

  loadProject(id: string) {
    const companyId = this.userStateService.getUser()?.companyId || '';
    this.invoicesService.getProjectById(id, companyId).subscribe({
      next: (p) => {
        this.form = { name: p.name, code: p.code ?? '', isActive: p.isActive ?? true };
      },
      error: (error: HttpErrorResponse) => {
        this.notification.show(this.getErrorMessage(error, 'Error al cargar el centro de costo'), 'error');
        this.back();
      },
    });
  }

  back() {
    this.router.navigate(['/centros-de-costo']);
  }

  save() {
    if (!this.form.name.trim()) {
      this.notification.show('El nombre es obligatorio', 'error');
      return;
    }
    this.saving = true;
    const companyId = this.userStateService.getUser()?.companyId || '';
    const payload: Partial<IProject> = {
      name: this.form.name.trim(),
      code: this.form.code.trim() || undefined,
      isActive: this.form.isActive,
    };

    if (this.isEditing) {
      this.invoicesService.updateProject(this.projectId!, payload, companyId).subscribe({
        next: () => {
          this.notification.show('Centro de costo actualizado', 'success');
          this.back();
        },
        error: (e: HttpErrorResponse) => {
          this.notification.show(
            'Error al actualizar: ' + this.getErrorMessage(e, 'No se pudo actualizar el centro de costo'),
            'error'
          );
          this.saving = false;
        },
      });
    } else {
      this.invoicesService.createProject({ ...payload, name: this.form.name.trim() } as IProject).subscribe({
        next: () => {
          this.notification.show('Centro de costo creado', 'success');
          this.back();
        },
        error: (e: HttpErrorResponse) => {
          this.notification.show(
            'Error al crear: ' + this.getErrorMessage(e, 'No se pudo crear el centro de costo'),
            'error'
          );
          this.saving = false;
        },
      });
    }
  }
}
