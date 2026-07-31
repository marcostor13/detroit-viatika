import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { OrdenTrabajoService } from '../../services/orden-trabajo.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { IOrdenTrabajo, OT_DEPARTAMENTOS, otDepartamentoLabel } from '../../interfaces/orden-trabajo.interface';
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
  private router = inject(Router);

  readonly departamentos = OT_DEPARTAMENTOS;
  readonly departamentoLabel = otDepartamentoLabel;

  result = signal<IPaginatedResult<IOrdenTrabajo>>({ data: [], total: 0, page: 1, pages: 0, limit: 20 });
  loading = signal(false);
  page = signal(1);
  limit = signal(20);
  search = signal('');
  filterDepartamento = signal('');

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.ordenTrabajoService
      .getAllPaginated({
        page: this.page(),
        limit: this.limit(),
        search: this.search() || undefined,
        departamento: this.filterDepartamento() || undefined,
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

  onFilterDepartamento(value: string) {
    this.filterDepartamento.set(value);
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
      message: `¿Eliminar "${orden.codigo}"? El correlativo no se reutilizará.`,
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
