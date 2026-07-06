import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from '../../../services/notification.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { LineaNegocioService } from '../../../services/linea-negocio.service';
import { CategoryGroupService } from '../../../services/category-group.service';
import { UserStateService } from '../../../services/user-state.service';
import { AdminUsersService } from '../../admin-users/services/admin-users.service';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { IProject } from '../../invoices/interfaces/project.interface';
import { ILineaNegocio } from '../../../interfaces/linea-negocio.interface';
import { ICategoryGroup } from '../../categorias/interfaces/category-group.interface';
import { IUserResponse } from '../../../interfaces/user.interface';

@Component({
  selector: 'app-centros-de-costo-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, IconComponent],
  templateUrl: './centros-de-costo-form.component.html',
})
export class CentrosDeCostoFormComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private notification = inject(NotificationService);
  private invoicesService = inject(InvoicesService);
  private lineaNegocioService = inject(LineaNegocioService);
  private categoryGroupService = inject(CategoryGroupService);
  private userStateService = inject(UserStateService);
  private adminUsersService = inject(AdminUsersService);

  isEditing = false;
  projectId: string | null = null;
  saving = false;
  form = {
    name: '',
    code: '',
    isActive: true,
    lineaNegocioId: '',
    categoryGroupId: '',
    // Mapeo contable (asientos Contanet)
    cuentaAnalitica9x: '',
    cuentaDestino6x: '',
    centroCosto: '',
    subCentroCosto: '',
    area: '',
    esAdministrativo: false,
    approverId: '',
  };
  lineas: ILineaNegocio[] = [];
  perfiles: ICategoryGroup[] = [];
  /** Candidatos a aprobador del centro de costo: cualquier usuario activo de la empresa. */
  approverCandidates: IUserResponse[] = [];

  private getErrorMessage(error: HttpErrorResponse, fallback: string) {
    const apiMessage = Array.isArray(error.error?.message)
      ? error.error.message.join(', ')
      : error.error?.message;
    return apiMessage || error.message || fallback;
  }

  ngOnInit() {
    this.loadLineas();
    this.loadPerfiles();
    this.loadApproverCandidates();
    this.projectId = this.route.snapshot.paramMap.get('id');
    if (this.projectId) {
      this.isEditing = true;
      this.loadProject(this.projectId);
    }
  }

  loadApproverCandidates() {
    this.adminUsersService.getUsers().subscribe({
      next: (users) => { this.approverCandidates = (users ?? []).filter((u) => u.isActive); },
      error: () => { this.approverCandidates = []; },
    });
  }

  loadLineas() {
    this.lineaNegocioService.getAll().subscribe({
      next: (lineas) => { this.lineas = lineas ?? []; },
      error: () => { this.lineas = []; },
    });
  }

  loadPerfiles() {
    this.categoryGroupService.getAll().subscribe({
      next: (perfiles) => { this.perfiles = perfiles ?? []; },
      error: () => { this.perfiles = []; },
    });
  }

  loadProject(id: string) {
    const companyId = this.userStateService.getUser()?.companyId || '';
    this.invoicesService.getProjectById(id, companyId).subscribe({
      next: (p) => {
        this.form = {
          name: p.name,
          code: p.code ?? '',
          isActive: p.isActive ?? true,
          lineaNegocioId: p.lineaNegocioId ?? '',
          categoryGroupId: p.categoryGroupId ?? '',
          cuentaAnalitica9x: p.cuentaAnalitica9x ?? '',
          cuentaDestino6x: p.cuentaDestino6x ?? '',
          centroCosto: p.centroCosto ?? '',
          subCentroCosto: p.subCentroCosto ?? '',
          area: p.area ?? '',
          esAdministrativo: p.esAdministrativo ?? false,
          approverId: p.approverId ?? '',
        };
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
      lineaNegocioId: this.form.lineaNegocioId || '',
      categoryGroupId: this.form.categoryGroupId || '',
      cuentaAnalitica9x: this.form.cuentaAnalitica9x.trim() || undefined,
      cuentaDestino6x: this.form.cuentaDestino6x.trim() || undefined,
      centroCosto: this.form.centroCosto.trim() || undefined,
      subCentroCosto: this.form.subCentroCosto.trim() || undefined,
      area: this.form.area.trim() || undefined,
      esAdministrativo: this.form.esAdministrativo,
      approverId: this.form.approverId || '',
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
