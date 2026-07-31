import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from '../../../services/notification.service';
import { CategoryGroupService } from '../../../services/category-group.service';
import { CategoriaService } from '../../../services/categoria.service';
import { ICategoryGroup } from '../../categorias/interfaces/category-group.interface';
import { ICategory } from '../../invoices/interfaces/category.interface';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';

@Component({
  selector: 'app-perfiles-categoria-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, IconComponent],
  templateUrl: './perfiles-categoria-form.component.html',
})
export class PerfilesCategoriaFormComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private notification = inject(NotificationService);
  private groupService = inject(CategoryGroupService);
  private categoriaService = inject(CategoriaService);

  isEditing = false;
  perfilId: string | null = null;
  saving = false;
  loading = signal(false);

  form = { name: '', description: '' };
  categories: ICategory[] = [];
  selected = new Set<string>();
  search = '';

  ngOnInit() {
    this.perfilId = this.route.snapshot.paramMap.get('id');
    this.isEditing = !!this.perfilId;
    this.loadData();
  }

  loadData() {
    this.loading.set(true);
    this.categoriaService.getAllFlatAdmin().subscribe({
      next: (cats) => {
        this.categories = cats ?? [];
        if (this.perfilId) this.loadPerfil(this.perfilId);
        else this.loading.set(false);
      },
      error: () => {
        this.notification.show('Error al cargar categorías', 'error');
        this.loading.set(false);
      },
    });
  }

  private loadPerfil(id: string) {
    this.groupService.getAll().subscribe({
      next: (list) => {
        const p = (list ?? []).find((g) => g._id === id);
        if (p) {
          this.form = { name: p.name, description: p.description ?? '' };
          this.selected = new Set((p.categoryIds ?? []).map((x) => String(x)));
        }
        this.loading.set(false);
      },
      error: () => {
        this.notification.show('Error al cargar el perfil', 'error');
        this.loading.set(false);
      },
    });
  }

  get filteredCategories(): ICategory[] {
    const q = this.search.toLowerCase().trim();
    if (!q) return this.categories;
    return this.categories.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.cuenta ?? '').toLowerCase().includes(q)
    );
  }

  isChecked(id: string): boolean {
    return this.selected.has(id);
  }

  toggle(id: string, checked: boolean) {
    if (checked) this.selected.add(id);
    else this.selected.delete(id);
  }

  back() {
    this.router.navigate(['/perfiles-categoria']);
  }

  save() {
    if (!this.form.name.trim()) {
      this.notification.show('El nombre es obligatorio', 'error');
      return;
    }
    this.saving = true;
    const dto = {
      name: this.form.name.trim(),
      description: this.form.description.trim() || undefined,
      categoryIds: Array.from(this.selected),
    };
    const obs =
      this.isEditing && this.perfilId
        ? this.groupService.update(this.perfilId, dto)
        : this.groupService.create(dto);
    obs.subscribe({
      next: () => {
        this.notification.show(
          this.isEditing ? 'Perfil actualizado' : 'Perfil creado',
          'success'
        );
        this.back();
      },
      error: (e: HttpErrorResponse) => {
        const raw = e.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notification.show(msg || 'No se pudo guardar el perfil', 'error');
        this.saving = false;
      },
    });
  }
}
