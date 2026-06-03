import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { InvoicesService } from '../invoices/services/invoices.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { UserStateService } from '../../services/user-state.service';
import { IProject } from '../invoices/interfaces/project.interface';
import { ButtonComponent } from '../../design-system/button/button.component';
import { PaginatorComponent } from '../../design-system/paginator/paginator.component';
import { IPaginatedResult } from '../../interfaces/paginated-result.interface';

@Component({
  selector: 'app-centros-de-costo',
  standalone: true,
  imports: [CommonModule, ButtonComponent, PaginatorComponent],
  templateUrl: './centros-de-costo.component.html',
})
export class CentrosDeCostoComponent implements OnInit {
  private router = inject(Router);
  private invoicesService = inject(InvoicesService);
  private notificationService = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);
  private userStateService = inject(UserStateService);

  result = signal<IPaginatedResult<IProject>>({ data: [], total: 0, page: 1, pages: 0, limit: 20 });
  get projects() { return this.result().data; }
  loading = false;
  page = signal(1);
  limit = signal(20);
  search = signal('');

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    const companyId = this.userStateService.getUser()?.companyId;
    this.invoicesService.getProjectsPaginated(companyId, this.page(), this.limit(), this.search() || undefined).subscribe({
      next: (res) => { this.result.set(res); this.loading = false; },
      error: (error: HttpErrorResponse) => {
        this.notificationService.show('Error al cargar centros de costo: ' + error.message, 'error');
        this.loading = false;
      },
    });
  }

  onSearch(value: string) { this.search.set(value); this.page.set(1); this.load(); }
  onPageChange(p: number) { this.page.set(p); this.load(); }
  onLimitChange(l: number) { this.limit.set(l); this.page.set(1); this.load(); }

  navigateToForm(id?: string) {
    this.router.navigate(id ? ['/centros-de-costo/form', id] : ['/centros-de-costo/form']);
  }

  navigateToBulkImport() {
    this.router.navigate(['/centros-de-costo/bulk-import']);
  }

  delete(project: IProject) {
    this.confirmationService.confirm({
      title: 'Eliminar Centro de Costo',
      message: `¿Eliminar "${project.name}"?`,
      accept: () => {
        const companyId = this.userStateService.getUser()?.companyId || '';
        this.invoicesService.deleteProject(project._id!, companyId).subscribe({
          next: () => {
            this.notificationService.show('Centro de costo eliminado', 'success');
            this.load();
          },
          error: (error: HttpErrorResponse) => {
            this.notificationService.show('Error al eliminar: ' + error.message, 'error');
          },
        });
      },
    });
  }
}
