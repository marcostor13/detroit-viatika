import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CategoriaService } from '../../../services/categoria.service';
import { CategoryGroupService } from '../../../services/category-group.service';
import { NotificationService } from '../../../services/notification.service';
import { ICategory } from '../../invoices/interfaces/category.interface';
import { ICategoryGroup } from '../interfaces/category-group.interface';
import { HttpErrorResponse } from '@angular/common/http';

interface CategoryForm {
  name: string;
  description: string;
  cuenta: string;
  cuentaDestino6x: string;
  observaciones: string;
  limit: number | null;
}

@Component({
  selector: 'app-categoria-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './categoria-form.component.html',
})
export class CategoriaFormComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private categoriaService = inject(CategoriaService);
  private groupService = inject(CategoryGroupService);
  private notification = inject(NotificationService);

  id = signal<string | null>(null);
  loading = signal(false);
  saving = signal(false);

  form: CategoryForm = { name: '', description: '', cuenta: '', cuentaDestino6x: '', observaciones: '', limit: null };

  perfiles: ICategoryGroup[] = [];
  selectedPerfiles = new Set<string>();

  ngOnInit() {
    this.loadPerfiles();
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.id.set(id);
      this.loadCategory(id);
    }
  }

  loadPerfiles() {
    this.groupService.getAll().subscribe({
      next: (list) => {
        this.perfiles = list ?? [];
        this.syncSelectedFromPerfiles();
      },
      error: () => { this.perfiles = []; },
    });
  }

  /** Marca como seleccionados los perfiles que ya contienen esta categoría (edición). */
  private syncSelectedFromPerfiles() {
    const id = this.id();
    if (!id) return;
    this.selectedPerfiles = new Set(
      this.perfiles
        .filter((p) => (p.categoryIds ?? []).map(String).includes(id))
        .map((p) => p._id!)
        .filter(Boolean)
    );
  }

  isPerfilChecked(id: string): boolean {
    return this.selectedPerfiles.has(id);
  }

  togglePerfil(id: string, checked: boolean) {
    if (checked) this.selectedPerfiles.add(id);
    else this.selectedPerfiles.delete(id);
  }

  loadCategory(id: string) {
    this.loading.set(true);
    this.categoriaService.getOne(id).subscribe({
      next: (cat: ICategory) => {
        this.form = {
          name: cat.name,
          description: cat.description ?? '',
          cuenta: cat.cuenta ?? '',
          cuentaDestino6x: cat.cuentaDestino6x ?? '',
          observaciones: cat.observaciones ?? '',
          limit: cat.limit ?? null,
        };
        this.loading.set(false);
      },
      error: () => {
        this.notification.show('Error al cargar la categoría', 'error');
        this.loading.set(false);
        this.goBack();
      },
    });
  }

  save() {
    if (!this.form.name.trim()) {
      this.notification.show('El nombre es obligatorio', 'error');
      return;
    }
    const dto = {
      name: this.form.name.trim(),
      description: this.form.description.trim() || undefined,
      cuenta: this.form.cuenta.trim() || undefined,
      cuentaDestino6x: this.form.cuentaDestino6x.trim() || undefined,
      observaciones: this.form.observaciones.trim() || undefined,
      limit: this.form.limit,
      perfilIds: Array.from(this.selectedPerfiles),
    };
    this.saving.set(true);
    const id = this.id();
    if (id) {
      this.categoriaService.update(id, dto).subscribe({
        next: () => {
          this.notification.show('Categoría actualizada', 'success');
          this.saving.set(false);
          this.goBack();
        },
        error: (err: HttpErrorResponse) => {
          this.notification.show('Error: ' + (err.error?.message || err.message), 'error');
          this.saving.set(false);
        },
      });
    } else {
      this.categoriaService.create(dto).subscribe({
        next: () => {
          this.notification.show('Categoría creada', 'success');
          this.saving.set(false);
          this.goBack();
        },
        error: (err: HttpErrorResponse) => {
          this.notification.show('Error: ' + (err.error?.message || err.message), 'error');
          this.saving.set(false);
        },
      });
    }
  }

  goBack() {
    this.router.navigate(['/categorias']);
  }

  get title(): string {
    return this.id() ? 'Editar Categoría' : 'Nueva Categoría';
  }
}
