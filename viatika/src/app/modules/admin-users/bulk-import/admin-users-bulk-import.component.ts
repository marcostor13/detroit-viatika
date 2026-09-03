import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationService } from '../../../services/notification.service';
import {
  AdminUsersService,
  IUserBulkImportResult,
  IUserBulkImportRow,
} from '../services/admin-users.service';
import { UserStateService } from '../../../services/user-state.service';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { BadgeComponent } from '../../../design-system/badge/badge.component';
import { ModalComponent } from '../../../design-system/modal/modal.component';

/** Lo que le pasa a una fila del Excel en la carga masiva. */
type AccionImport = IUserBulkImportRow['accion'];

@Component({
  selector: 'app-admin-users-bulk-import',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    IconComponent,
    BadgeComponent,
    ModalComponent,
  ],
  templateUrl: './admin-users-bulk-import.component.html',
})
export class AdminUsersBulkImportComponent {
  private router = inject(Router);
  private notification = inject(NotificationService);
  private adminUsersService = inject(AdminUsersService);
  private userStateService = inject(UserStateService);

  file = signal<File | null>(null);
  /** La plantilla baja con los colaboradores actuales: hay que ir a buscarlos. */
  downloadingTemplate = signal(false);
  /** Resultado de la carga real (ya escrita). */
  result = signal<IUserBulkImportResult | null>(null);
  importing = signal(false);
  /**
   * Plan de la carga (lo que el archivo HARÍA), pendiente de aceptar. Mientras
   * haya uno, el modal de revisión está abierto y no se escribió nada todavía.
   */
  importPreview = signal<IUserBulkImportResult | null>(null);
  previewing = signal(false);

  /** Chips del filtro, en el orden en que se leen los contadores. */
  readonly chipsAccion: { accion: AccionImport; label: string }[] = [
    { accion: 'crear', label: 'a crear' },
    { accion: 'actualizar', label: 'a modificar' },
    { accion: 'sin-cambios', label: 'sin cambios' },
    { accion: 'error', label: 'con error' },
  ];
  /** Acción por la que se está filtrando la revisión (null = todas). */
  filtroAccion = signal<AccionImport | null>(null);
  busquedaPreview = signal('');
  /**
   * En un archivo de cientos de filas no tiene sentido pintarlas todas: los
   * contadores de arriba siguen siendo del total y para llegar a una fila
   * concreta están el filtro y el buscador.
   */
  readonly MAX_FILAS_VISIBLES = 300;

  filasFiltradas = computed<IUserBulkImportRow[]>(() => {
    const plan = this.importPreview();
    if (!plan) return [];
    const accion = this.filtroAccion();
    const texto = this.busquedaPreview().trim().toLowerCase();
    const soloNumero = /^[0-9]+$/.test(texto);
    return plan.rows.filter((fila) => {
      if (accion && fila.accion !== accion) return false;
      if (!texto) return true;
      if (soloNumero) {
        return String(fila.row) === texto || fila.email.includes(texto);
      }
      return (
        fila.email.toLowerCase().includes(texto) ||
        (fila.detalle || '').toLowerCase().includes(texto) ||
        (fila.reason || '').toLowerCase().includes(texto)
      );
    });
  });

  filasVisibles = computed<IUserBulkImportRow[]>(() =>
    this.filasFiltradas().slice(0, this.MAX_FILAS_VISIBLES)
  );

  filasOcultas = computed(
    () => this.filasFiltradas().length - this.filasVisibles().length
  );

  hayFiltroActivo = computed(
    () => this.filtroAccion() !== null || this.busquedaPreview().trim() !== ''
  );

  conteoAccion(accion: AccionImport): number {
    const plan = this.importPreview();
    if (!plan) return 0;
    return {
      crear: plan.created,
      actualizar: plan.updated,
      'sin-cambios': plan.unchanged,
      error: plan.errors.length,
    }[accion];
  }

  /** Volver a pulsar el chip activo quita el filtro. */
  toggleFiltroAccion(accion: AccionImport) {
    this.filtroAccion.set(this.filtroAccion() === accion ? null : accion);
  }

  limpiarFiltrosPreview() {
    this.filtroAccion.set(null);
    this.busquedaPreview.set('');
  }

  back() {
    this.router.navigate(['/admin-users']);
  }

  private companyId(): string {
    return this.userStateService.getUser()?.companyId || '';
  }


  /**
   * Elegir el archivo NO carga nada: primero se pide el plan al backend
   * (dryRun) y se muestra para que el usuario lo acepte. La carga real ocurre
   * en `confirmImport()`.
   */
  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.file.set(file);
    this.result.set(null);
    if (file) this.previewImport();
  }

  /** Pide al backend el plan del archivo elegido, sin escribir nada. */
  previewImport() {
    const file = this.file();
    if (!file) {
      this.notification.show('Selecciona un archivo Excel primero', 'error');
      return;
    }
    this.previewing.set(true);
    this.adminUsersService
      .bulkImportUsers(this.formData(file, true))
      .subscribe({
        next: (res) => {
          this.previewing.set(false);
          this.limpiarFiltrosPreview();
          this.importPreview.set(this.normalizeResult(res));
        },
        error: () => {
          this.previewing.set(false);
          this.notification.show('Error al revisar el archivo', 'error');
        },
      });
  }

  private formData(file: File, dryRun = false): FormData {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('clientId', this.companyId());
    if (dryRun) fd.append('dryRun', 'true');
    return fd;
  }

  /** Un backend anterior puede no mandar el plan; el modal no debe romperse. */
  private normalizeResult(res: IUserBulkImportResult): IUserBulkImportResult {
    return {
      ...res,
      updated: res.updated ?? 0,
      unchanged: res.unchanged ?? 0,
      errors: res.errors ?? [],
      rows: res.rows ?? [],
      credentials: res.credentials ?? [],
    };
  }

  /** Sin nada que crear ni modificar, no hay carga que aceptar. */
  get puedeConfirmarImport(): boolean {
    const plan = this.importPreview();
    return !!plan && plan.created + plan.updated > 0;
  }

  cancelImport() {
    this.importPreview.set(null);
    this.limpiarFiltrosPreview();
  }

  /** Recién aquí se escribe: el usuario ya vio qué se crea y qué se modifica. */
  confirmImport() {
    const file = this.file();
    if (!file || !this.puedeConfirmarImport) return;
    this.importing.set(true);
    this.adminUsersService.bulkImportUsers(this.formData(file)).subscribe({
      next: (res) => {
        this.importing.set(false);
        this.importPreview.set(null);
        this.result.set(this.normalizeResult(res));
        const partes = [
          res.created > 0 ? `${res.created} creado(s)` : '',
          res.updated > 0 ? `${res.updated} con permisos actualizados` : '',
        ].filter(Boolean);
        if (partes.length) {
          this.notification.show(
            `Importación completada: ${partes.join(' y ')}`,
            'success'
          );
        }
        if (res.errors?.length) {
          this.notification.show(
            `${res.errors.length} fila(s) con error`,
            'warning'
          );
        }
      },
      error: () => {
        this.importing.set(false);
        this.notification.show('Error al importar usuarios', 'error');
      },
    });
  }

  /** Color de la fila en la revisión, según lo que le va a pasar. */
  accionVariant(accion: AccionImport): 'success' | 'info' | 'neutral' | 'error' {
    if (accion === 'crear') return 'success';
    if (accion === 'actualizar') return 'info';
    if (accion === 'error') return 'error';
    return 'neutral';
  }

  accionLabel(accion: AccionImport): string {
    return {
      crear: 'Se crea',
      actualizar: 'Se modifica',
      'sin-cambios': 'Sin cambios',
      error: 'Error',
    }[accion];
  }

  /**
   * Descarga el Excel YA CARGADO con los colaboradores de la empresa y sus
   * permisos actuales: se edita y al volver a subirlo las filas existentes
   * actualizan sus permisos (la llave es el email) y las nuevas se crean.
   */
  downloadTemplate() {
    this.downloadingTemplate.set(true);
    this.adminUsersService.downloadUserTemplate().subscribe({
      next: (res) => {
        this.downloadingTemplate.set(false);
        const bytes = Uint8Array.from(atob(res.file), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.downloadingTemplate.set(false);
        this.notification.show('Error al descargar plantilla', 'error');
      },
    });
  }

  downloadCredentials() {
    const creds = this.result()?.credentials ?? [];
    if (!creds.length) return;
    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = 'Nombre,Email,Contraseña temporal';
    const rows = creds.map(
      (c) => `${escape(c.name)},${escape(c.email)},${escape(c.temporaryPassword)}`,
    );
    const csv = '﻿' + [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'credenciales_colaboradores.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
