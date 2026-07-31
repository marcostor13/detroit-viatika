import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { LineaNegocioService } from '../../services/linea-negocio.service';
import { ILineaNegocio } from '../../interfaces/linea-negocio.interface';
import { ButtonComponent } from '../../design-system/button/button.component';
import { EmptyStateComponent } from '../../design-system/empty-state/empty-state.component';
import { BadgeComponent } from '../../design-system/badge/badge.component';

@Component({
  selector: 'app-lineas-negocio',
  standalone: true,
  imports: [CommonModule, ButtonComponent, EmptyStateComponent, BadgeComponent],
  templateUrl: './lineas-negocio.component.html',
})
export class LineasNegocioComponent implements OnInit {
  private router = inject(Router);
  private notification = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);
  private lineaNegocioService = inject(LineaNegocioService);

  lineas: ILineaNegocio[] = [];
  loading = false;

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.lineaNegocioService.getAll().subscribe({
      next: (lineas) => {
        this.lineas = lineas ?? [];
        this.loading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        if (error.status !== 404) {
          this.notification.show(
            'Error al cargar las líneas de negocio: ' + error.message,
            'error'
          );
        }
      },
    });
  }

  navigateToForm(id?: string) {
    this.router.navigate(
      id ? ['/lineas-negocio', id, 'editar'] : ['/lineas-negocio/nueva']
    );
  }

  delete(linea: ILineaNegocio) {
    this.confirmationService.confirm({
      title: 'Eliminar Línea de Negocio',
      message: `¿Eliminar "${linea.name}"?`,
      accept: () => {
        if (!linea._id) return;
        this.lineaNegocioService.delete(linea._id).subscribe({
          next: () => {
            this.notification.show('Línea de negocio eliminada', 'success');
            this.load();
          },
          error: (error: HttpErrorResponse) => {
            this.notification.show('Error al eliminar: ' + error.message, 'error');
          },
        });
      },
    });
  }
}
