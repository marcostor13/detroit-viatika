import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { CategoryGroupService } from '../../services/category-group.service';
import { ICategoryGroup } from '../categorias/interfaces/category-group.interface';
import { ButtonComponent } from '../../design-system/button/button.component';

@Component({
  selector: 'app-perfiles-categoria',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './perfiles-categoria.component.html',
})
export class PerfilesCategoriaComponent implements OnInit {
  private router = inject(Router);
  private notification = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);
  private groupService = inject(CategoryGroupService);

  perfiles: ICategoryGroup[] = [];
  loading = false;

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.groupService.getAll().subscribe({
      next: (list) => {
        this.perfiles = list ?? [];
        this.loading = false;
      },
      error: (e: HttpErrorResponse) => {
        this.loading = false;
        this.notification.show('Error al cargar perfiles: ' + e.message, 'error');
      },
    });
  }

  navigateToForm(id?: string) {
    this.router.navigate(
      id ? ['/perfiles-categoria', id, 'editar'] : ['/perfiles-categoria/nueva']
    );
  }

  delete(perfil: ICategoryGroup) {
    this.confirmationService.confirm({
      title: 'Eliminar Perfil de Categoría',
      message: `¿Eliminar "${perfil.name}"? Los centros de costo y usuarios que lo usen quedarán sin perfil.`,
      accept: () => {
        if (!perfil._id) return;
        this.groupService.remove(perfil._id).subscribe({
          next: () => {
            this.notification.show('Perfil eliminado', 'success');
            this.load();
          },
          error: (e: HttpErrorResponse) =>
            this.notification.show('Error al eliminar: ' + e.message, 'error'),
        });
      },
    });
  }
}
