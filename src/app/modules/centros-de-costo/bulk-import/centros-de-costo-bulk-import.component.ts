import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService } from '../../../services/notification.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { UserStateService } from '../../../services/user-state.service';
import { ButtonComponent } from '../../../design-system/button/button.component';

@Component({
  selector: 'app-centros-de-costo-bulk-import',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './centros-de-costo-bulk-import.component.html',
})
export class CentrosDeCostoBulkImportComponent {
  private router = inject(Router);
  private notification = inject(NotificationService);
  private invoicesService = inject(InvoicesService);
  private userStateService = inject(UserStateService);

  file: File | null = null;
  loading = false;
  result: { created: number; skipped: string[]; errors: string[] } | null = null;

  back() {
    this.router.navigate(['/centros-de-costo']);
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0] ?? null;
    this.result = null;
  }

  downloadTemplate() {
    this.invoicesService.downloadProjectTemplate().subscribe({
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
    this.invoicesService.bulkImportProjects(fd).subscribe({
      next: (res) => {
        this.loading = false;
        this.result = res;
        this.notification.show(`Importación completada: ${res.created} creados`, 'success');
      },
      error: () => {
        this.loading = false;
        this.notification.show('Error al importar centros de costo', 'error');
      },
    });
  }
}
