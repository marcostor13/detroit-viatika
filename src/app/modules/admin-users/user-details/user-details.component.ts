import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminUsersService } from '../services/admin-users.service';
import { IUserResponse } from '../../../interfaces/user.interface';
import { ERoles } from '../interfaces/roles.enum';
import { NotificationService } from '../../../services/notification.service';

@Component({
  selector: 'app-user-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-details.component.html',
  styleUrls: ['./user-details.component.scss']
})
export class UserDetailsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private adminUsersService = inject(AdminUsersService);
  private notificationService = inject(NotificationService);

  id: string = this.route.snapshot.params['id'];
  user: IUserResponse | null = null;
  roleName = '';

  isTogglingNotifications = signal(false);

  ngOnInit(): void {
    if (this.id) this.getUserData();
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
