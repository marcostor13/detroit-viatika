import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import * as ExcelJS from 'exceljs';
import { OrdenTrabajoService, IBulkImportResult } from '../../services/orden-trabajo.service';
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
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

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
  importResult = signal<IBulkImportResult | null>(null);
  importing = signal(false);

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

  // --- Import / Template ---

  triggerFileInput() {
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importing.set(true);
    this.importResult.set(null);
    this.ordenTrabajoService.importFromExcel(file).subscribe({
      next: (res) => {
        this.importing.set(false);
        this.importResult.set(res);
        if (res.created > 0) {
          this.notificationService.show(`${res.created} orden(es) de trabajo importada(s)`, 'success');
          this.load();
        }
        if (res.errors.length > 0) {
          this.notificationService.show(`${res.errors.length} fila(s) con error`, 'warning');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.importing.set(false);
        this.notificationService.show('Error al importar: ' + (err.error?.message || err.message), 'error');
      },
    });
  }

  async downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Viatika';

    const sheet = workbook.addWorksheet('Ordenes de Trabajo');
    const headers = ['Nombre*', 'Código Centro de Costo*', 'Activo'];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sheet.columns = [
      { key: 'Nombre*', width: 28 },
      { key: 'Código Centro de Costo*', width: 26 },
      { key: 'Activo', width: 12 },
    ];
    headerRow.height = 22;

    const sampleCode = this.centrosCosto()[0]?.code || 'CC-001';
    sheet.addRow(['Lim-Com-1', sampleCode, 'Sí']);
    sheet.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };

    const instrSheet = workbook.addWorksheet('Instrucciones');
    instrSheet.addRow(['Campo', 'Requerido', 'Descripción']);
    instrSheet.getRow(1).font = { bold: true };
    instrSheet.addRow(['Nombre*', 'Sí', 'Nombre/código único de la OT dentro de la empresa (ej. "Lim-Com-1")']);
    instrSheet.addRow(['Código Centro de Costo*', 'Sí', 'Código (o nombre) de un centro de costo existente en la empresa']);
    instrSheet.addRow(['Activo', 'No', '"Sí" o "No" (vacío = Sí)']);
    instrSheet.columns = [
      { key: 'Campo', width: 26 },
      { key: 'Requerido', width: 12 },
      { key: 'Descripción', width: 55 },
    ];
    instrSheet.addRow([]);

    const codesSheet = workbook.addWorksheet('Centros de Costo Disponibles');
    codesSheet.addRow(['Código', 'Nombre']);
    codesSheet.getRow(1).font = { bold: true };
    for (const cc of this.centrosCosto()) {
      codesSheet.addRow([cc.code, cc.name]);
    }
    codesSheet.columns = [{ key: 'Código', width: 20 }, { key: 'Nombre', width: 32 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_ordenes_trabajo.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }
}
