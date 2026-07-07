import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { OrdenTrabajoService } from '../../services/orden-trabajo.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { UserStateService } from '../../services/user-state.service';
import { IOrdenTrabajo, otCentroCostoLabel } from '../../interfaces/orden-trabajo.interface';
import { IProject } from '../invoices/interfaces/project.interface';
import { InvoicesService } from '../invoices/services/invoices.service';
import { IPaginatedResult } from '../../interfaces/paginated-result.interface';
import { ButtonComponent } from '../../design-system/button/button.component';
import { IconComponent } from '../../design-system/icon/icon.component';
import { BadgeComponent } from '../../design-system/badge/badge.component';
import { EmptyStateComponent } from '../../design-system/empty-state/empty-state.component';
import { DataTableComponent } from '../../design-system/data-table/data-table.component';
import { ColumnDirective } from '../../design-system/data-table/column.directive';
import { PaginatorComponent } from '../../design-system/paginator/paginator.component';

@Component({
  selector: 'app-ordenes-trabajo',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    IconComponent,
    BadgeComponent,
    EmptyStateComponent,
    DataTableComponent,
    ColumnDirective,
    PaginatorComponent,
  ],
  templateUrl: './ordenes-trabajo.component.html',
})
export class OrdenesTrabajoComponent implements OnInit {
  private ordenTrabajoService = inject(OrdenTrabajoService);
  private notificationService = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);
  private invoicesService = inject(InvoicesService);
  private userStateService = inject(UserStateService);
  private router = inject(Router);

  readonly centroCostoLabel = otCentroCostoLabel;

  /** Centros de costo activos, para el filtro. */
  centrosCosto = signal<IProject[]>([]);

  result = signal<IPaginatedResult<IOrdenTrabajo>>({ data: [], total: 0, page: 1, pages: 0, limit: 20 });
  loading = signal(false);
  page = signal(1);
  limit = signal(20);
  search = signal('');
  filterCostCenter = signal('');

  ngOnInit() {
    this.loadCentrosCosto();
    this.load();
  }

  private companyId(): string {
    return this.userStateService.getUser()?.companyId || '';
  }

  private loadCentrosCosto() {
    this.invoicesService.getProjects(this.companyId()).subscribe({
      next: (list) => this.centrosCosto.set((list || []).filter((c) => c.isActive !== false)),
      error: () => this.centrosCosto.set([]),
    });
  }

  load() {
    this.loading.set(true);
    this.ordenTrabajoService
      .getAllPaginated({
        page: this.page(),
        limit: this.limit(),
        search: this.search() || undefined,
        costCenterId: this.filterCostCenter() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.result.set(res);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.notificationService.show('Error al cargar las órdenes de trabajo: ' + error.message, 'error');
          this.loading.set(false);
        },
      });
  }

  onSearch(value: string) {
    this.search.set(value);
    this.page.set(1);
    this.load();
  }

  onFilterCostCenter(value: string) {
    this.filterCostCenter.set(value);
    this.page.set(1);
    this.load();
  }

  onPageChange(p: number) {
    this.page.set(p);
    this.load();
  }

  onLimitChange(l: number) {
    this.limit.set(l);
    this.page.set(1);
    this.load();
  }

  navigateToForm(id?: string) {
    this.router.navigate(id ? ['/ordenes-trabajo', id, 'editar'] : ['/ordenes-trabajo/nueva']);
  }

  delete(orden: IOrdenTrabajo) {
    this.confirmationService.confirm({
      title: 'Eliminar Orden de Trabajo',
      message: `¿Eliminar "${orden.nombre}"? Esta acción no se puede deshacer.`,
      accept: () => {
        this.ordenTrabajoService.delete(orden._id!).subscribe({
          next: () => {
            this.notificationService.show('Orden de trabajo eliminada', 'success');
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
