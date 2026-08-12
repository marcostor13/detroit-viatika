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
import { firstValueFrom } from 'rxjs';
import {
  IOrdenTrabajo,
  otCentroCostoIds,
  otCentroCostoLabels,
} from '../../interfaces/orden-trabajo.interface';
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

  /** Una OT puede tener varios centros de costo; el primero es el principal. */
  readonly centroCostoLabels = otCentroCostoLabels;

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
  /** La plantilla trae todas las OT, así que hay que ir a buscarlas al servidor. */
  downloadingTemplate = signal(false);

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
        if (res.created > 0 || res.updated > 0) {
          const partes = [
            res.created > 0 ? `${res.created} creada(s)` : '',
            res.updated > 0 ? `${res.updated} actualizada(s)` : '',
          ].filter(Boolean);
          this.notificationService.show(`Órdenes de trabajo: ${partes.join(' y ')}`, 'success');
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

  /**
   * Parte el nombre de una OT en las tres columnas del informe de Detroit
   * (Suc, Dep, Nº O/T): "LIM-SMI-1463-G" -> LIM | SMI | 1463-G. Si el nombre no
   * tiene esa forma, se deja en la columna Nombre y las otras tres vacías.
   */
  private partirNombreOt(nombre: string): [string, string, string] {
    const partes = /^([^-]+)-([^-]+)-(.+)$/.exec(nombre.trim());
    return partes ? [partes[1], partes[2], partes[3]] : ['', '', ''];
  }

  /**
   * Filas del Excel: una por OT existente. Sin OT, una fila de ejemplo para que
   * se vea qué se espera en cada columna.
   */
  private filasParaExcel(ordenes: IOrdenTrabajo[]): string[][] {
    if (!ordenes.length) {
      const ejemplo = this.centrosCosto()[0]?.code || 'CC-001';
      return [['LIM', 'SMI', '1463-G', 'LIM-SMI-1463-G', ejemplo, 'Sí']];
    }
    // Códigos, no nombres: es lo que el usuario ve en el informe del ERP y lo
    // que el importador resuelve primero.
    return ordenes.map((ot) => {
      const [suc, dep, numero] = this.partirNombreOt(ot.nombre);
      const codigos = otCentroCostoIds(ot)
        .map((id) => this.centrosCosto().find((cc) => cc._id === id)?.code || '')
        .filter(Boolean)
        .join(', ');
      return [suc, dep, numero, ot.nombre, codigos, ot.isActive === false ? 'No' : 'Sí'];
    });
  }

  /**
   * Descarga la plantilla YA CARGADA con las OT de la empresa: se edita en Excel
   * y al volver a subirla las filas existentes se actualizan (la llave es el
   * nombre) y las nuevas se crean.
   */
  async downloadTemplate() {
    this.downloadingTemplate.set(true);
    const ordenes = await firstValueFrom(this.ordenTrabajoService.getAll()).catch(() => [] as IOrdenTrabajo[]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Viatika';

    const sheet = workbook.addWorksheet('Ordenes de Trabajo');
    const headers = ['Suc', 'Dep', 'Nº O/T', 'Nombre', 'Centros de Costo*', 'Activo'];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sheet.columns = [
      { key: 'Suc', width: 8 },
      { key: 'Dep', width: 8 },
      { key: 'Nº O/T', width: 14 },
      { key: 'Nombre', width: 24 },
      { key: 'Centros de Costo*', width: 34 },
      { key: 'Activo', width: 10 },
    ];
    headerRow.height = 22;

    for (const fila of this.filasParaExcel(ordenes)) sheet.addRow(fila);

    if (!ordenes.length) {
      sheet.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };
    }

    const instrSheet = workbook.addWorksheet('Instrucciones');
    instrSheet.addRow(['Campo', 'Requerido', 'Descripción']);
    instrSheet.getRow(1).font = { bold: true };
    instrSheet.addRow(['Suc', 'No', 'Sucursal del informe de Detroit (LIM, ANT, TOQ…). Se usa para armar el nombre.']);
    instrSheet.addRow(['Dep', 'No', 'Departamento del informe (SMI, SCA, COM, TAL, ABA, ICO…).']);
    instrSheet.addRow(['Nº O/T', 'No', 'Número de la orden tal como sale del informe ("00001463-G"). Los ceros de la izquierda se quitan.']);
    instrSheet.addRow(['Nombre', 'Sí (o Suc+Dep+Nº)', 'Nombre único de la OT en la empresa. Si se deja vacío se arma como Suc-Dep-Nº O/T (ej. LIM-SMI-1463-G).']);
    instrSheet.addRow(['Centros de Costo*', 'Sí en OT nuevas', 'Uno o varios códigos de centro de costo separados por coma ("123, 223, 423"). El primero es el principal, el que sale en los reportes. En una OT que ya existe, vacío = no se tocan los que tiene.']);
    instrSheet.addRow(['Activo', 'No', '"Sí" o "No". Vacío = no se cambia (en una OT nueva se crea activa).']);
    instrSheet.columns = [
      { key: 'Campo', width: 26 },
      { key: 'Requerido', width: 18 },
      { key: 'Descripción', width: 80 },
    ];
    instrSheet.addRow([]);
    instrSheet.addRow(['Cómo funciona la carga:']).font = { bold: true };
    instrSheet.addRow(['El archivo baja con las OT que ya existen. Al subirlo, las filas cuyo nombre ya está en la empresa se ACTUALIZAN y las filas nuevas se CREAN.']);
    instrSheet.addRow(['Ninguna fila borra OT: para dar de baja una, pon "No" en Activo.']);
    instrSheet.addRow(['Si una fila falla (por ejemplo, sin centro de costo), solo se reporta esa fila; el resto del archivo se procesa igual.']);

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
    a.download = 'ordenes_trabajo.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    this.downloadingTemplate.set(false);
  }
}
