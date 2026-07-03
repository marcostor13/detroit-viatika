import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CategoriaService, IBulkImportResult } from '../../services/categoria.service';
import { CategoryGroupService } from '../../services/category-group.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { ICategory } from '../invoices/interfaces/category.interface';
import { ICategoryGroup } from './interfaces/category-group.interface';
import { IPaginatedResult } from '../../interfaces/paginated-result.interface';
import { ButtonComponent } from '../../design-system/button/button.component';
import { PaginatorComponent } from '../../design-system/paginator/paginator.component';
import { HttpErrorResponse } from '@angular/common/http';
import * as ExcelJS from 'exceljs';

interface GroupForm {
  name: string;
  description: string;
  categoryIds: string[];
}

@Component({
  selector: 'app-categorias',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, PaginatorComponent],
  templateUrl: './categorias.component.html',
})
export class CategoriasComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private categoriaService = inject(CategoriaService);
  private groupService = inject(CategoryGroupService);
  private notificationService = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);
  private router = inject(Router);

  activeTab = signal<'categorias' | 'grupos'>('categorias');

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

  // --- Group state ---
  groups = signal<ICategoryGroup[]>([]);
  allCategories = signal<ICategory[]>([]);
  groupsLoading = signal(false);
  showGroupForm = signal(false);
  editingGroupId = signal<string | null>(null);
  groupForm: GroupForm = { name: '', description: '', categoryIds: [] };
  groupSearch = signal('');
  categorySearchInGroup = signal('');

  ngOnInit() {
    this.load();
    // Precargar perfiles (grupos) para mostrar la columna "Perfiles de Categoría".
    this.groupService.getAll().subscribe({
      next: (g) => this.groups.set(g ?? []),
      error: () => {},
    });
  }

  setTab(tab: 'categorias' | 'grupos') {
    this.activeTab.set(tab);
    if (tab === 'grupos' && this.allCategories().length === 0) {
      this.loadGroups();
    }
  }

  /** Nombres de los perfiles de categoría que contienen esta categoría. */
  perfilesForCategory(catId?: string): string[] {
    if (!catId) return [];
    const id = String(catId);
    return this.groups()
      .filter((g) => (g.categoryIds ?? []).map(String).includes(id))
      .map((g) => g.name);
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

    const perfilNames = this.groups().map((g) => g.name).filter(Boolean);
    const perfilList = perfilNames.length ? perfilNames : ['PROYECTO', 'ADMINISTRACION', 'COMERCIAL'];

    const sheet = workbook.addWorksheet('Categorías');
    const headers = ['Nombre*', 'Cuenta', 'Descripción', 'Observaciones', 'Límite', 'Perfil de Categoría'];
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
      { key: 'Perfil de Categoría', width: 24 },
    ];
    headerRow.height = 22;

    // Sample row
    sheet.addRow(['Viáticos de transporte', '6310', 'Gastos de movilidad del colaborador', 'Solo traslados locales', 500, perfilList[0]]);
    sheet.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };

    // Lista desplegable de perfiles en la columna F (filas 2..200)
    const formula = '"' + perfilList.join(',').slice(0, 250) + '"';
    for (let r = 2; r <= 200; r++) {
      sheet.getCell(`F${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
      };
    }

    const instrSheet = workbook.addWorksheet('Instrucciones');
    instrSheet.addRow(['Campo', 'Requerido', 'Descripción']);
    instrSheet.getRow(1).font = { bold: true };
    instrSheet.addRow(['Nombre*', 'Sí', 'Nombre único de la categoría']);
    instrSheet.addRow(['Cuenta', 'No', 'Número de cuenta contable (ej. 6310)']);
    instrSheet.addRow(['Descripción', 'No', 'Descripción breve de la categoría']);
    instrSheet.addRow(['Observaciones', 'No', 'Notas adicionales o restricciones']);
    instrSheet.addRow(['Límite', 'No', 'Límite de gasto en soles (solo número, sin S/)']);
    instrSheet.addRow(['Perfil de Categoría', 'No', 'Perfil al que se asignará la categoría (debe existir)']);
    instrSheet.columns = [
      { key: 'Campo', width: 22 },
      { key: 'Requerido', width: 12 },
      { key: 'Descripción', width: 50 },
    ];
    instrSheet.addRow([]);
    instrSheet.addRow(['Perfiles disponibles:', perfilList.join(', ')]);
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

  // ==================== GRUPOS ====================

  loadGroups() {
    this.groupsLoading.set(true);
    Promise.all([
      this.groupService.getAll().toPromise(),
      this.categoriaService.getAllFlatAdmin().toPromise(),
    ]).then(([groups, cats]) => {
      this.groups.set(groups ?? []);
      this.allCategories.set(cats ?? []);
      this.groupsLoading.set(false);
    }).catch((err: HttpErrorResponse) => {
      this.notificationService.show('Error al cargar grupos', 'error');
      this.groupsLoading.set(false);
    });
  }

  get filteredGroups(): ICategoryGroup[] {
    const q = this.groupSearch().toLowerCase();
    if (!q) return this.groups();
    return this.groups().filter((g) => g.name.toLowerCase().includes(q));
  }

  get filteredCategoriesInGroup(): ICategory[] {
    const q = this.categorySearchInGroup().toLowerCase();
    if (!q) return this.allCategories();
    return this.allCategories().filter((c) => c.name.toLowerCase().includes(q) || (c.cuenta ?? '').toLowerCase().includes(q));
  }

  openAddGroup() {
    this.groupForm = { name: '', description: '', categoryIds: [] };
    this.editingGroupId.set(null);
    this.showGroupForm.set(true);
    this.categorySearchInGroup.set('');
  }

  openEditGroup(group: ICategoryGroup) {
    this.groupForm = {
      name: group.name,
      description: group.description ?? '',
      categoryIds: [...(group.categoryIds ?? [])],
    };
    this.editingGroupId.set(group._id ?? null);
    this.showGroupForm.set(true);
    this.categorySearchInGroup.set('');
  }

  closeGroupForm() {
    this.showGroupForm.set(false);
    this.editingGroupId.set(null);
    this.groupForm = { name: '', description: '', categoryIds: [] };
    this.categorySearchInGroup.set('');
  }

  toggleCategoryInGroup(id: string) {
    if (this.groupForm.categoryIds.includes(id)) {
      this.groupForm.categoryIds = this.groupForm.categoryIds.filter((x) => x !== id);
    } else {
      this.groupForm.categoryIds = [...this.groupForm.categoryIds, id];
    }
  }

  isCategoryInGroup(id: string): boolean {
    return this.groupForm.categoryIds.includes(id);
  }

  selectAllCategories() {
    this.groupForm.categoryIds = this.allCategories().map((c) => c._id!).filter(Boolean);
  }

  clearAllCategories() {
    this.groupForm.categoryIds = [];
  }

  saveGroup() {
    if (!this.groupForm.name.trim()) {
      this.notificationService.show('El nombre del grupo es obligatorio', 'error');
      return;
    }
    const dto = {
      name: this.groupForm.name,
      description: this.groupForm.description || undefined,
      categoryIds: this.groupForm.categoryIds,
    };
    const id = this.editingGroupId();
    if (id) {
      this.groupService.update(id, dto).subscribe({
        next: (updated) => {
          this.groups.update((gs) => gs.map((g) => (g._id === id ? updated : g)));
          this.notificationService.show('Grupo actualizado', 'success');
          this.closeGroupForm();
        },
        error: (err: HttpErrorResponse) => this.notificationService.show('Error: ' + err.message, 'error'),
      });
    } else {
      this.groupService.create(dto).subscribe({
        next: (created) => {
          this.groups.update((gs) => [...gs, created]);
          this.notificationService.show('Grupo creado', 'success');
          this.closeGroupForm();
        },
        error: (err: HttpErrorResponse) => this.notificationService.show('Error: ' + err.message, 'error'),
      });
    }
  }

  removeGroup(group: ICategoryGroup) {
    this.confirmationService.confirm({
      title: 'Eliminar grupo',
      message: `¿Eliminar el grupo "${group.name}"? Las categorías no se eliminarán.`,
      accept: () => {
        this.groupService.remove(group._id!).subscribe({
          next: () => {
            this.groups.update((gs) => gs.filter((g) => g._id !== group._id));
            this.notificationService.show('Grupo eliminado', 'success');
          },
          error: (err: HttpErrorResponse) => this.notificationService.show('Error: ' + err.message, 'error'),
        });
      },
    });
  }

  getCategoryName(id: string): string {
    return this.allCategories().find((c) => c._id === id)?.name ?? id;
  }

  get groupFormTitle(): string {
    return this.editingGroupId() ? 'Editar grupo' : 'Nuevo grupo';
  }
}
