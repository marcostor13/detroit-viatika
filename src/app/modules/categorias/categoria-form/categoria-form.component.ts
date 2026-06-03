import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CategoriaService } from '../../../services/categoria.service';
import { NotificationService } from '../../../services/notification.service';
import { ICategory } from '../../invoices/interfaces/category.interface';
import { HttpErrorResponse } from '@angular/common/http';

interface CategoryForm {
  name: string;
  description: string;
  cuenta: string;
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
  private notification = inject(NotificationService);

  id = signal<string | null>(null);
  loading = signal(false);
  saving = signal(false);

  form: CategoryForm = { name: '', description: '', cuenta: '', observaciones: '', limit: null };

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.id.set(id);
      this.loadCategory(id);
    }
  }

  loadCategory(id: string) {
    this.loading.set(true);
    this.categoriaService.getOne(id).subscribe({
      next: (cat: ICategory) => {
        this.form = {
          name: cat.name,
          description: cat.description ?? '',
          cuenta: cat.cuenta ?? '',
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
      observaciones: this.form.observaciones.trim() || undefined,
      limit: this.form.limit,
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
