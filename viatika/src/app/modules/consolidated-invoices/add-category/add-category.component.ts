import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NotificationService } from '../../../services/notification.service';
import { CategoriaService } from '../../../services/categoria.service';
import { ICategory } from '../../invoices/interfaces/category.interface';

@Component({
  selector: 'app-add-category',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-category.component.html',
})
export class AddCategoryComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private notificationService = inject(NotificationService);
  private categoriaService = inject(CategoriaService);

  category: ICategory = {
    name: '',
  };

  categoryId: string | null = null;
  isEditing = false;

  ngOnInit() {
    this.categoryId = this.route.snapshot.paramMap.get('id');
    if (this.categoryId) {
      this.isEditing = true;
      this.loadCategory(this.categoryId);
    }
  }

  loadCategory(id: string) {
    this.categoriaService.getAllFlat().subscribe((categories: ICategory[]) => {
      const found = categories.find((c) => c._id === id);
      if (found) {
        this.category = found;
      }
    });
  }

  back() {
    this.router.navigate(['/categorias']);
  }

  save() {
    if (this.isEditing) {
      this.updateCategory();
    } else {
      this.saveCategory();
    }
  }

  validateName() {
    if (!this.category.name) {
      this.notificationService.show(
        'El nombre de la categoría es obligatorio',
        'error'
      );
      return false;
    }
    return true;
  }

  saveCategory() {
    if (!this.validateName()) {
      return;
    }
    this.categoriaService
      .create({ name: this.category.name })
      .subscribe(() => {
        this.notificationService.show(
          'Categoría creada exitosamente',
          'success'
        );
        this.router.navigate(['/categorias']);
      });
  }

  updateCategory() {
    if (!this.validateName()) {
      return;
    }
    this.categoriaService
      .update(this.categoryId!, { name: this.category.name })
      .subscribe(() => {
        this.notificationService.show(
          'Categoría actualizada exitosamente',
          'success'
        );
        this.router.navigate(['/categorias']);
      });
  }
}
