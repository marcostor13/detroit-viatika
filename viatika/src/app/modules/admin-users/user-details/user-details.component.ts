import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminUsersService } from '../services/admin-users.service';
import { IUserResponse } from '../../../interfaces/user.interface';
import { ERoles } from '../interfaces/roles.enum';
import { NotificationService } from '../../../services/notification.service';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { BadgeComponent } from '../../../design-system/badge/badge.component';
import {
  SearchSelectComponent,
  SearchSelectOption,
} from '../../../design-system/search-select/search-select.component';
import {
  SuplenciaService,
  IColaboradorBasico,
} from '../../../services/suplencia.service';

@Component({
  selector: 'app-user-details',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    IconComponent,
    BadgeComponent,
    SearchSelectComponent,
  ],
  templateUrl: './user-details.component.html',
  styleUrls: ['./user-details.component.scss']
})
export class UserDetailsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private adminUsersService = inject(AdminUsersService);
  private notificationService = inject(NotificationService);
  private suplenciaService = inject(SuplenciaService);

  id: string = this.route.snapshot.params['id'];
  user: IUserResponse | null = null;
  roleName = '';

  isTogglingNotifications = signal(false);

  // ── Vacaciones y reemplazo (VD-124) ──────────────────────────────
  // El caso típico es que la persona se fue sin dejarlo configurado, así que
  // un administrador tiene que poder ponerlo por ella. Es lo mismo que hace el
  // aprobador desde Mi Perfil, contra `PATCH /user/:id/vacaciones`.
  colaboradores: IColaboradorBasico[] = [];
  showVacacionesForm = false;
  vacDesde = '';
  vacHasta = '';
  vacSuplenteId = '';
  isSavingVacaciones = signal(false);

  ngOnInit(): void {
    if (this.id) {
      this.getUserData();
      this.cargarColaboradores();
    }
  }

  getUserData() {
    this.adminUsersService.getUser(this.id).subscribe({
      next: (userData) => {
        this.user = userData;
        this.roleName = userData.role?.name
          ? (ERoles[userData.role.name as keyof typeof ERoles] || userData.role.name)
          : 'Sin Rol';
      },
      error: () => this.notificationService.show('Error al cargar el usuario', 'error'),
    });
  }

  /** Opciones de suplente: cualquiera de la empresa menos el propio titular. */
  get opcionesSuplente(): SearchSelectOption[] {
    return this.colaboradores
      .filter((c) => c._id !== this.id)
      .map((c) => ({ value: c._id, label: c.name, subLabel: c.email }));
  }

  get nombreSuplenteActual(): string {
    const suplenteId = this.user?.vacaciones?.suplenteId;
    if (!suplenteId) return '';
    return this.colaboradores.find((c) => c._id === suplenteId)?.name || 'otro usuario';
  }

  /** `YYYY-MM-DD` de una fecha que el backend devuelve como ISO completo. */
  private soloFecha(valor: string | undefined): string {
    return (valor || '').slice(0, 10);
  }

  editVacaciones() {
    const actual = this.user?.vacaciones;
    this.vacDesde = this.soloFecha(actual?.desde);
    this.vacHasta = this.soloFecha(actual?.hasta);
    this.vacSuplenteId = actual?.suplenteId || '';
    this.showVacacionesForm = true;
    if (this.colaboradores.length === 0) this.cargarColaboradores();
  }

  cancelVacacionesEdit() {
    this.showVacacionesForm = false;
    this.vacDesde = '';
    this.vacHasta = '';
    this.vacSuplenteId = '';
  }

  /** También sin abrir el formulario: la ficha muestra el nombre del suplente. */
  private cargarColaboradores() {
    this.suplenciaService.getColaboradores().subscribe({
      next: (lista) => {
        this.colaboradores = lista ?? [];
      },
      error: () =>
        this.notificationService.show('No se pudo cargar la lista de colaboradores', 'error'),
    });
  }

  saveVacaciones() {
    if (!this.vacDesde || !this.vacHasta) {
      this.notificationService.show('Indica el período de vacaciones', 'error');
      return;
    }
    if (this.vacHasta < this.vacDesde) {
      this.notificationService.show('La fecha de fin no puede ser anterior a la de inicio', 'error');
      return;
    }
    if (!this.vacSuplenteId) {
      this.notificationService.show('Elige quién lo reemplazará', 'error');
      return;
    }
    this.isSavingVacaciones.set(true);
    this.suplenciaService
      .setVacaciones(this.id, {
        desde: this.vacDesde,
        hasta: this.vacHasta,
        suplenteId: this.vacSuplenteId,
      })
      .subscribe({
        next: () => {
          this.isSavingVacaciones.set(false);
          this.notificationService.show('Vacaciones programadas correctamente', 'success');
          this.cancelVacacionesEdit();
          this.getUserData();
        },
        error: (err) => {
          this.isSavingVacaciones.set(false);
          this.notificationService.show(
            err?.error?.message || 'Error al programar las vacaciones',
            'error'
          );
        },
      });
  }

  borrarVacaciones() {
    this.isSavingVacaciones.set(true);
    this.suplenciaService.borrarVacaciones(this.id).subscribe({
      next: () => {
        this.isSavingVacaciones.set(false);
        this.notificationService.show('Se canceló el período de vacaciones', 'success');
        this.getUserData();
      },
      error: () => {
        this.isSavingVacaciones.set(false);
        this.notificationService.show('Error al cancelar las vacaciones', 'error');
      },
    });
  }

  goBack() {
    this.router.navigate(['/admin-users']);
  }

  goToPermisos() {
    this.router.navigate([`/admin-users/${this.id}/permisos`]);
  }

  goToRendiciones() {
    this.router.navigate(['/rendiciones'], { queryParams: { userId: this.id } });
  }

  goToEdit() {
    this.router.navigate([`/admin-users/create-user/${this.id}`]);
  }

  // ── Notificaciones por correo ────────────────────────────────────
  toggleNotifications() {
    if (!this.user) return;
    const newValue = !this.user.emailNotificationsEnabled;
    this.isTogglingNotifications.set(true);
    this.adminUsersService.toggleEmailNotifications(this.id, newValue).subscribe({
      next: (res) => {
        this.user = { ...this.user!, emailNotificationsEnabled: res.emailNotificationsEnabled };
        this.isTogglingNotifications.set(false);
        this.notificationService.show(
          newValue ? 'Notificaciones activadas' : 'Notificaciones desactivadas',
          'success'
        );
      },
      error: () => {
        this.notificationService.show('Error al actualizar las notificaciones', 'error');
        this.isTogglingNotifications.set(false);
      },
    });
  }
}
