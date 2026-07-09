import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CategoryProfileService } from '../../services/category-profile.service';
import { CategoriaService } from '../../services/categoria.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { ICategoryProfile } from '../../interfaces/category-profile.interface';
import { ICategory } from '../invoices/interfaces/category.interface';
import { ButtonComponent } from '../../design-system/button/button.component';
import { IconComponent } from '../../design-system/icon/icon.component';

@Component({
  selector: 'app-perfiles-categorias',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, IconComponent],
  templateUrl: './perfiles-categorias.component.html',
})
export class PerfilesCategoriasComponent implements OnInit {
  private profileService = inject(CategoryProfileService);
  private categoriaService = inject(CategoriaService);
  private notification = inject(NotificationService);
  private confirmation = inject(ConfirmationService);

  profiles = signal<ICategoryProfile[]>([]);
  categories = signal<ICategory[]>([]);
  loading = signal(false);
  saving = signal(false);

  // Estado del editor (crear/editar)
  editing = signal(false);
  editingId = signal<string | null>(null);
  formName = signal('');
  selectedIds = signal<Set<string>>(new Set<string>());
  categorySearch = signal('');

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.categoriaService.getAllFlatAdmin().subscribe({
      next: (cats) => this.categories.set(cats ?? []),
      error: () => {},
    });
    this.profileService.getAll().subscribe({
      next: (list) => { this.profiles.set(list ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.notification.show('Error al cargar perfiles', 'error'); },
    });
  }

  categoryName(id: string): string {
    return this.categories().find((c) => c._id === id)?.name ?? '—';
  }

  /** Chips por defecto antes de mostrar "+N más". */
  readonly PROFILE_CHIP_LIMIT = 12;
  expandedProfiles = signal<Set<string>>(new Set<string>());

  profileCategoryList(p: ICategoryProfile): string[] {
    return (p.categoryIds ?? []).map((id) => this.categoryName(id));
  }

  isProfileExpanded(id?: string): boolean {
    return !!id && this.expandedProfiles().has(id);
  }

  toggleProfileExpanded(id?: string) {
    if (!id) return;
    const set = new Set(this.expandedProfiles());
    set.has(id) ? set.delete(id) : set.add(id);
    this.expandedProfiles.set(set);
  }

  visibleProfileCategories(p: ICategoryProfile): string[] {
    const all = this.profileCategoryList(p);
    return this.isProfileExpanded(p._id) ? all : all.slice(0, this.PROFILE_CHIP_LIMIT);
  }

  get filteredCategories(): ICategory[] {
    const q = this.categorySearch().toLowerCase();
    if (!q) return this.categories();
    return this.categories().filter(
      (c) => c.name.toLowerCase().includes(q) || (c.cuenta ?? '').toLowerCase().includes(q)
    );
  }

  isChecked(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggle(id: string, checked: boolean) {
    const set = new Set(this.selectedIds());
    if (checked) set.add(id); else set.delete(id);
    this.selectedIds.set(set);
  }

  /** Marca todas las categorías VISIBLES según el filtro actual (une con lo ya seleccionado). */
  selectAll() {
    const set = new Set(this.selectedIds());
    for (const c of this.filteredCategories) {
      if (c._id) set.add(c._id);
    }
    this.selectedIds.set(set);
  }

  /** Desmarca las categorías VISIBLES según el filtro actual (conserva el resto). */
  clearAll() {
    const set = new Set(this.selectedIds());
    for (const c of this.filteredCategories) {
      if (c._id) set.delete(c._id);
    }
    this.selectedIds.set(set);
  }

  newProfile() {
    this.editingId.set(null);
    this.formName.set('');
    this.selectedIds.set(new Set<string>());
    this.categorySearch.set('');
    this.editing.set(true);
  }

  editProfile(p: ICategoryProfile) {
    this.editingId.set(p._id ?? null);
    this.formName.set(p.name);
    this.selectedIds.set(new Set(p.categoryIds ?? []));
    this.categorySearch.set('');
    this.editing.set(true);
  }

  cancelEdit() {
    this.editing.set(false);
  }

  save() {
    const name = this.formName().trim();
    if (!name) {
      this.notification.show('El nombre del perfil es obligatorio', 'error');
      return;
    }
    const dto = { name, categoryIds: [...this.selectedIds()] };
    this.saving.set(true);
    const id = this.editingId();
    const req = id ? this.profileService.update(id, dto) : this.profileService.create(dto);
    req.subscribe({
      next: () => {
        this.notification.show(id ? 'Perfil actualizado' : 'Perfil creado', 'success');
        this.saving.set(false);
        this.editing.set(false);
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.notification.show('Error: ' + (err.error?.message || err.message), 'error');
      },
    });
  }

  remove(p: ICategoryProfile) {
    this.confirmation.confirm({
      title: 'Eliminar perfil',
      message: `¿Eliminar el perfil "${p.name}"? Esto no elimina las categorías, solo el perfil.`,
      accept: () => {
        this.profileService.remove(p._id!).subscribe({
          next: () => { this.notification.show('Perfil eliminado', 'success'); this.load(); },
          error: (err: HttpErrorResponse) => this.notification.show('Error: ' + err.message, 'error'),
        });
      },
    });
  }
}
