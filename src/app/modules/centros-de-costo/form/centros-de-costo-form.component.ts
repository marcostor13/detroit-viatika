import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from '../../../services/notification.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { LineaNegocioService } from '../../../services/linea-negocio.service';
import { UserStateService } from '../../../services/user-state.service';
import { AdminUsersService } from '../../admin-users/services/admin-users.service';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { IProject } from '../../invoices/interfaces/project.interface';
import { ILineaNegocio } from '../../../interfaces/linea-negocio.interface';
import { IUserResponse } from '../../../interfaces/user.interface';

interface IApproverLevelForm {
  level: number;
  userIds: string[];
}

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
    // Mapeo contable (asientos Contanet)
    cuentaAnalitica9x: '',
    cuentaDestino6x: '',
    centroCosto: '',
    subCentroCosto: '',
    area: '',
    esAdministrativo: false,
  };
  lineas: ILineaNegocio[] = [];
  /** Candidatos a aprobador del centro de costo: cualquier usuario activo de la empresa. */
  approverCandidates: IUserResponse[] = [];

  /** Niveles de aprobación configurados (identidad por número de nivel, no por posición). */
  approverLevels: IApproverLevelForm[] = [];
  addingLevel = false;
  newLevelNumber: number | null = null;
  newLevelUserIds: string[] = [];

  private getErrorMessage(error: HttpErrorResponse, fallback: string) {
    const apiMessage = Array.isArray(error.error?.message)
      ? error.error.message.join(', ')
      : error.error?.message;
    return apiMessage || error.message || fallback;
  }

  ngOnInit() {
    this.loadLineas();
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

  loadProject(id: string) {
    const companyId = this.userStateService.getUser()?.companyId || '';
    this.invoicesService.getProjectById(id, companyId).subscribe({
      next: (p) => {
        this.form = {
          name: p.name,
          code: p.code ?? '',
          isActive: p.isActive ?? true,
          lineaNegocioId: p.lineaNegocioId ?? '',
          cuentaAnalitica9x: p.cuentaAnalitica9x ?? '',
          cuentaDestino6x: p.cuentaDestino6x ?? '',
          centroCosto: p.centroCosto ?? '',
          subCentroCosto: p.subCentroCosto ?? '',
          area: p.area ?? '',
          esAdministrativo: p.esAdministrativo ?? false,
        };
        this.approverLevels = (p.approverLevels ?? []).map((l) => ({
          level: l.level,
          userIds: (l.userIds ?? []).map((u) => (typeof u === 'string' ? u : u._id)),
        }));
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
      cuentaAnalitica9x: this.form.cuentaAnalitica9x.trim() || undefined,
      cuentaDestino6x: this.form.cuentaDestino6x.trim() || undefined,
      centroCosto: this.form.centroCosto.trim() || undefined,
      subCentroCosto: this.form.subCentroCosto.trim() || undefined,
      area: this.form.area.trim() || undefined,
      esAdministrativo: this.form.esAdministrativo,
      approverLevels: this.approverLevels
        .filter((l) => l.userIds.length > 0)
        .map((l) => ({ level: l.level, userIds: l.userIds })),
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

  // --- Niveles de aprobación ---

  get sortedApproverLevels(): IApproverLevelForm[] {
    return [...this.approverLevels].sort((a, b) => a.level - b.level);
  }

  /** Candidatos aún no asignados como aprobadores de este nivel. */
  candidatesForLevel(level: IApproverLevelForm): IUserResponse[] {
    return this.approverCandidates.filter((u) => !level.userIds.includes(u._id!));
  }

  userLabel(id: string): string {
    const u = this.approverCandidates.find((c) => c._id === id);
    return u ? `${u.name} (${u.email})` : id;
  }

  addApproverToLevel(level: IApproverLevelForm, userId: string) {
    if (!userId || level.userIds.includes(userId)) return;
    level.userIds = [...level.userIds, userId];
  }

  removeApproverFromLevel(level: IApproverLevelForm, userId: string) {
    level.userIds = level.userIds.filter((id) => id !== userId);
    if (level.userIds.length === 0) {
      this.removeLevel(level.level);
    }
  }

  removeLevel(levelNumber: number) {
    this.approverLevels = this.approverLevels.filter((l) => l.level !== levelNumber);
  }

  private nextSuggestedLevel(): number {
    const used = new Set(this.approverLevels.map((l) => l.level));
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  startAddLevel() {
    this.addingLevel = true;
    this.newLevelNumber = this.nextSuggestedLevel();
    this.newLevelUserIds = [];
  }

  cancelAddLevel() {
    this.addingLevel = false;
    this.newLevelNumber = null;
    this.newLevelUserIds = [];
  }

  toggleNewLevelUser(userId: string, checked: boolean) {
    if (checked) {
      if (!this.newLevelUserIds.includes(userId)) {
        this.newLevelUserIds = [...this.newLevelUserIds, userId];
      }
    } else {
      this.newLevelUserIds = this.newLevelUserIds.filter((id) => id !== userId);
    }
  }

  confirmAddLevel() {
    const level = this.newLevelNumber;
    if (!level || !Number.isInteger(level) || level < 1) {
      this.notification.show('Ingresa un número de nivel válido', 'error');
      return;
    }
    if (this.approverLevels.some((l) => l.level === level)) {
      this.notification.show(`Ya existe un Nivel ${level} configurado`, 'error');
      return;
    }
    if (this.newLevelUserIds.length === 0) {
      this.notification.show('Selecciona al menos un aprobador para el nivel', 'error');
      return;
    }
    this.approverLevels = [...this.approverLevels, { level, userIds: [...this.newLevelUserIds] }];
    this.cancelAddLevel();
  }
}
