import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CategoriaService, IBulkImportResult } from '../../services/categoria.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { ICategory } from '../invoices/interfaces/category.interface';
import { IPaginatedResult } from '../../interfaces/paginated-result.interface';
import { ButtonComponent } from '../../design-system/button/button.component';
import { PaginatorComponent } from '../../design-system/paginator/paginator.component';
import { IconComponent } from '../../design-system/icon/icon.component';
import { BadgeComponent } from '../../design-system/badge/badge.component';
import { EmptyStateComponent } from '../../design-system/empty-state/empty-state.component';
import { HttpErrorResponse } from '@angular/common/http';
import * as ExcelJS from 'exceljs';

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, PaginatorComponent, IconComponent, BadgeComponent, EmptyStateComponent],
  templateUrl: './categorias.component.html',
})
export class CategoriasComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private categoriaService = inject(CategoriaService);
  private notificationService = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);
  private router = inject(Router);

  // --- Category state ---
  result = signal<IPaginatedResult<ICategory>>({ data: [], total: 0, page: 1, pages: 0, limit: 20 });
  loading = signal(false);

  // ─── Filas expandibles (detalle inline para no cortar columnas) ─────────────
  expandedRows = signal<Set<string>>(new Set<string>());
  toggleExpand(id: string | undefined, event?: Event): void {
    if (!id) return;
    event?.stopPropagation();
    const set = new Set<string>(this.expandedRows());
    set.has(id) ? set.delete(id) : set.add(id);
    this.expandedRows.set(set);
  }
  isExpanded(id: string | undefined): boolean { return !!id && this.expandedRows().has(id); }

  search = signal('');
  page = signal(1);
  limit = signal(20);
  importResult = signal<IBulkImportResult | null>(null);
  importing = signal(false);

  ngOnInit() {
    this.load();
  }

  // ==================== CATEGORÍAS ====================

  load() {
    this.loading.set(true);
    this.categoriaService.getAll({
      page: this.page(),
      limit: this.limit(),
      search: this.search() || undefined,
    }).subscribe({
      next: (res) => { this.result.set(res); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.notificationService.show('Error al cargar categorías: ' + err.message, 'error');
        this.loading.set(false);
      },
    });
  }

  onSearch(value: string) { this.search.set(value); this.page.set(1); this.load(); }
  onPageChange(p: number) { this.page.set(p); this.load(); }
  onLimitChange(l: number) { this.limit.set(l); this.page.set(1); this.load(); }

  openAddCategory() {
    this.router.navigate(['/categorias/nueva']);
  }

  openEdit(cat: ICategory) {
    this.router.navigate(['/categorias', cat._id, 'editar']);
  }

  remove(cat: ICategory) {
    this.confirmationService.confirm({
      title: 'Eliminar categoría',
      message: `¿Eliminar "${cat.name}"?`,
      accept: () => {
        this.categoriaService.remove(cat._id!).subscribe({
          next: () => { this.notificationService.show('Categoría eliminada', 'success'); this.load(); },
          error: (err: HttpErrorResponse) => this.notificationService.show('Error: ' + err.message, 'error'),
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
    this.categoriaService.importFromExcel(file).subscribe({
      next: (res) => {
        this.importing.set(false);
        this.importResult.set(res);
        if (res.created > 0) {
          this.notificationService.show(`${res.created} categoría(s) importada(s)`, 'success');
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

    const sheet = workbook.addWorksheet('Categorías');
    const headers = ['Nombre*', 'Cuenta', 'Descripción', 'Observaciones', 'Límite'];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sheet.columns = [
      { key: 'Nombre*', width: 28 },
      { key: 'Cuenta', width: 18 },
      { key: 'Descripción', width: 30 },
      { key: 'Observaciones', width: 30 },
      { key: 'Límite', width: 14 },
    ];
    headerRow.height = 22;

    // Sample row
    sheet.addRow(['Viáticos de transporte', '6310', 'Gastos de movilidad del colaborador', 'Solo traslados locales', 500]);
    sheet.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };

    const instrSheet = workbook.addWorksheet('Instrucciones');
    instrSheet.addRow(['Campo', 'Requerido', 'Descripción']);
    instrSheet.getRow(1).font = { bold: true };
    instrSheet.addRow(['Nombre*', 'Sí', 'Nombre único de la categoría']);
    instrSheet.addRow(['Cuenta', 'No', 'Número de cuenta contable (ej. 6310)']);
    instrSheet.addRow(['Descripción', 'No', 'Descripción breve de la categoría']);
    instrSheet.addRow(['Observaciones', 'No', 'Notas adicionales o restricciones']);
    instrSheet.addRow(['Límite', 'No', 'Límite de gasto en soles (solo número, sin S/)']);
    instrSheet.columns = [
      { key: 'Campo', width: 22 },
      { key: 'Requerido', width: 12 },
      { key: 'Descripción', width: 50 },
    ];
    instrSheet.addRow([]);
    instrSheet.addRow(['Nota: La fila de ejemplo en la hoja "Categorías" puede eliminarse antes de cargar.']);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_categorias.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }
}
