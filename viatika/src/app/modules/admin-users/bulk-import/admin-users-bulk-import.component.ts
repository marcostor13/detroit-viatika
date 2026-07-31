import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService } from '../../../services/notification.service';
import { AdminUsersService } from '../services/admin-users.service';
import { UserStateService } from '../../../services/user-state.service';
import { ButtonComponent } from '../../../design-system/button/button.component';

@Component({
  selector: 'app-admin-users-bulk-import',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './admin-users-bulk-import.component.html',
})
export class AdminUsersBulkImportComponent {
  private router = inject(Router);
  private notification = inject(NotificationService);
  private adminUsersService = inject(AdminUsersService);
  private userStateService = inject(UserStateService);

  file: File | null = null;
  loading = false;
  result: {
    created: number;
    skipped: string[];
    errors: string[];
    credentials: { name: string; email: string; temporaryPassword: string }[];
  } | null = null;

  back() {
    this.router.navigate(['/admin-users']);
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
    this.result = null;
  }

  downloadTemplate() {
    this.adminUsersService.downloadUserTemplate().subscribe({
      next: (res) => {
        const bytes = Uint8Array.from(atob(res.file), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = res.filename; a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.notification.show('Error al descargar plantilla', 'error'),
    });
  }

  import() {
    if (!this.file) {
      this.notification.show('Selecciona un archivo Excel primero', 'error');
      return;
    }
    const companyId = this.userStateService.getUser()?.companyId || '';
    const fd = new FormData();
    fd.append('file', this.file);
    fd.append('clientId', companyId);
    this.loading = true;
    this.adminUsersService.bulkImportUsers(fd).subscribe({
      next: (res) => {
        this.loading = false;
        this.result = res;
        this.notification.show(`Importación completada: ${res.created} creados`, 'success');
      },
      error: () => {
        this.loading = false;
        this.notification.show('Error al importar usuarios', 'error');
      },
    });
  }

  downloadCredentials() {
    const creds = this.result?.credentials ?? [];
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
