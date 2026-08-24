import { Component, computed, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import * as ExcelJS from 'exceljs';
import {
  OrdenTrabajoService,
  IBulkImportResult,
  IBulkImportRow,
} from '../../services/orden-trabajo.service';
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

/** Lo que le pasa a una fila del Excel en la carga masiva. */
type AccionImport = IBulkImportRow['accion'];
import { ButtonComponent } from '../../design-system/button/button.component';
import { IconComponent } from '../../design-system/icon/icon.component';
import { BadgeComponent } from '../../design-system/badge/badge.component';
import { EmptyStateComponent } from '../../design-system/empty-state/empty-state.component';
import { DataTableComponent } from '../../design-system/data-table/data-table.component';
import { ColumnDirective } from '../../design-system/data-table/column.directive';
import { PaginatorComponent } from '../../design-system/paginator/paginator.component';
import { ModalComponent } from '../../design-system/modal/modal.component';

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
    ModalComponent,
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
  /**
   * Plan de la carga (lo que el archivo HARÍA), pendiente de aceptar. Mientras
   * haya uno, el modal de revisión está abierto y no se escribió nada todavía.
   */
  importPreview = signal<IBulkImportResult | null>(null);
  previewing = signal(false);
  /** El archivo elegido, a la espera de que el usuario acepte la carga. */
  private pendingFile: File | null = null;
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
   * En un archivo de miles de filas no tiene sentido pintarlas todas: los
   * contadores de arriba siguen siendo del total y para llegar a una fila
   * concreta están el filtro y el buscador.
   */
  readonly MAX_FILAS_VISIBLES = 300;

  filasFiltradas = computed<IBulkImportRow[]>(() => {
    const plan = this.importPreview();
    if (!plan) return [];
    const accion = this.filtroAccion();
    const texto = this.busquedaPreview().trim().toLowerCase();
    // Un número busca la fila del Excel (exacta) o el nombre de la OT, pero no
    // el detalle: teclear "3" casaría con cualquier "CC-003" o "123".
    const soloNumero = /^[0-9]+$/.test(texto);
    return plan.rows.filter((fila) => {
      if (accion && fila.accion !== accion) return false;
      if (!texto) return true;
      if (soloNumero) {
        return String(fila.row) === texto || fila.nombre.includes(texto);
      }
      return (
        fila.nombre.toLowerCase().includes(texto) ||
        (fila.detalle || '').toLowerCase().includes(texto) ||
        (fila.reason || '').toLowerCase().includes(texto)
      );
    });
  });

  filasVisibles = computed(() =>
    this.filasFiltradas().slice(0, this.MAX_FILAS_VISIBLES)
  );

  /** Filas que la tabla no pinta por el tope (0 = se ven todas las filtradas). */
  filasOcultas = computed(() =>
    Math.max(0, this.filasFiltradas().length - this.MAX_FILAS_VISIBLES)
  );

  hayFiltroActivo = computed(
    () => this.filtroAccion() !== null || this.busquedaPreview().trim() !== ''
  );

  /** Cuántas filas del plan cayeron en cada acción, para los chips del filtro. */
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

  /**
   * Elegir el archivo NO carga nada: primero se pide el plan al backend
   * (dryRun) y se muestra para que el usuario lo acepte. La carga real ocurre
   * en `confirmImport()`.
   */
  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.pendingFile = file;
    this.previewing.set(true);
    this.importResult.set(null);
    this.ordenTrabajoService.importFromExcel(file, { dryRun: true }).subscribe({
      next: (res) => {
        this.previewing.set(false);
        this.limpiarFiltrosPreview();
        this.importPreview.set(this.normalizeResult(res));
      },
      error: (err: HttpErrorResponse) => {
        this.previewing.set(false);
        this.pendingFile = null;
        this.notificationService.show(
          'Error al revisar el archivo: ' + (err.error?.message || err.message),
          'error'
        );
      },
    });
  }

  /** Un backend anterior puede no mandar el plan; el modal no debe romperse. */
  private normalizeResult(res: IBulkImportResult): IBulkImportResult {
    return {
      ...res,
      unchanged: res.unchanged ?? 0,
      errors: res.errors ?? [],
      rows: res.rows ?? [],
    };
  }

  /** Sin nada que crear ni modificar, no hay carga que aceptar. */
  get puedeConfirmarImport(): boolean {
    const plan = this.importPreview();
    return !!plan && plan.created + plan.updated > 0;
  }

  cancelImport() {
    this.importPreview.set(null);
    this.pendingFile = null;
    this.limpiarFiltrosPreview();
  }

  /** Recién aquí se escribe: el usuario ya vio qué se crea y qué se modifica. */
  confirmImport() {
    const file = this.pendingFile;
    if (!file || !this.puedeConfirmarImport) return;
    this.importing.set(true);
    this.ordenTrabajoService.importFromExcel(file).subscribe({
      next: (res) => {
        this.importing.set(false);
        this.importPreview.set(null);
        this.pendingFile = null;
        this.importResult.set(this.normalizeResult(res));
        if (res.created > 0 || res.updated > 0) {
          const partes = [
            res.created > 0 ? `${res.created} creada(s)` : '',
            res.updated > 0 ? `${res.updated} actualizada(s)` : '',
          ].filter(Boolean);
          this.notificationService.show(`Órdenes de trabajo: ${partes.join(' y ')}`, 'success');
          this.load();
        }
        if (res.errors?.length) {
          this.notificationService.show(`${res.errors.length} fila(s) con error`, 'warning');
        }
      },
      error: (err: HttpErrorResponse) => {
        this.importing.set(false);
        this.notificationService.show('Error al importar: ' + (err.error?.message || err.message), 'error');
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
   * Filas del Excel: una por OT existente, con las mismas tres cosas que pide el
   * formulario de alta (nombre completo, centros de costo y si está activa). Sin
   * OT, una fila de ejemplo para que se vea qué va en cada columna.
   */
  private filasParaExcel(ordenes: IOrdenTrabajo[]): string[][] {
    if (!ordenes.length) {
      const ejemplo = this.centrosCosto()[0]?.code || 'CC-001';
      return [['LIM-SMI-1463-G', ejemplo, 'Sí']];
    }
    // Códigos, no nombres: es lo que el usuario ve en el informe del ERP y lo
    // que el importador resuelve primero.
    return ordenes.map((ot) => {
      const codigos = otCentroCostoIds(ot)
        .map((id) => this.centrosCosto().find((cc) => cc._id === id)?.code || '')
        .filter(Boolean)
        .join(', ');
      return [ot.nombre, codigos, ot.isActive === false ? 'No' : 'Sí'];
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
    // Las mismas tres cosas que pide el formulario de alta, ni una más.
    const headers = ['Nombre*', 'Centros de Costo*', 'Activo'];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sheet.columns = [
      { key: 'Nombre*', width: 26 },
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
    instrSheet.addRow(['Nombre*', 'Sí', 'Nombre completo y único de la OT en la empresa, igual que en el formulario (ej. LIM-SMI-1946).']);
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
