import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { AdminUsersService } from './services/admin-users.service';
import { IUserResponse } from '../../interfaces/user.interface';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { UserStateService } from '../../services/user-state.service';
import { ERoles } from './interfaces/roles.enum';
import { Router } from '@angular/router';
import { ButtonComponent } from '../../design-system/button/button.component';
import { PaginatorComponent } from '../../design-system/paginator/paginator.component';
import { IPaginatedResult } from '../../interfaces/paginated-result.interface';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, PaginatorComponent],
  templateUrl: './admin-users.component.html',
  styleUrls: ['./admin-users.component.scss'],
})
export default class AdminUsersComponent implements OnInit {
  readonly router = inject(Router);
  private adminUsersService = inject(AdminUsersService);
  private notification = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);
  private userStateService = inject(UserStateService);

  result = signal<IPaginatedResult<IUserResponse>>({ data: [], total: 0, page: 1, pages: 0, limit: 20 });
  get filteredUsers() { return this.result().data; }
  get allUsers() { return this.result().data; }

  searchText = '';
  filterRole = '';
  filterStatus = '';
  page = signal(1);
  limit = signal(20);
  isSuperAdmin = this.userStateService.isSuperAdmin();

  readonly roleOptions = [
    { value: 'Administrador', label: 'Administrador' },
    { value: 'Colaborador', label: 'Colaborador' },
  ];

  get loggedInUserId(): string {
    return this.userStateService.getUser()?._id || '';
  }

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.adminUsersService.getUsersPaginated({
      page: this.page(),
      limit: this.limit(),
      search: this.searchText.trim() || undefined,
      status: this.filterStatus || undefined,
      roleName: this.filterRole || undefined,
    }).subscribe({
      next: (res) => {
        res.data = res.data.map((u) => ({ ...u, roleName: ERoles[(u as any).role?.name as keyof typeof ERoles] ?? (u as any).role?.name }));
        this.result.set(res);
      },
      error: () => this.notification.show('Error al cargar usuarios', 'error'),
    });
  }

  applyFilters() { this.page.set(1); this.loadUsers(); }

  clearFilters() {
    this.searchText = '';
    this.filterRole = '';
    this.filterStatus = '';
    this.page.set(1);
    this.loadUsers();
  }

  onPageChange(p: number) { this.page.set(p); this.loadUsers(); }
  onLimitChange(l: number) { this.limit.set(l); this.page.set(1); this.loadUsers(); }

  get hasActiveFilters(): boolean {
    return !!(this.searchText || this.filterRole || this.filterStatus);
  }

  deleteUser(userId: string) {
    if (userId === this.loggedInUserId) {
      this.notification.show('No puedes eliminar tu propio usuario', 'error');
      return;
    }
    this.confirmationService.show('¿Estás seguro de que deseas eliminar este usuario?', () => {
      this.adminUsersService.deleteUser(userId).subscribe({
        next: () => {
          this.notification.show('Usuario eliminado correctamente', 'success');
          this.loadUsers();
        },
        error: () => this.notification.show('Error al eliminar el usuario', 'error'),
      });
    });
  }

  clickOptionsEvent(event: { option: string; _id: string }) {
    switch (event.option) {
      case 'view':   this.router.navigate([`/admin-users/${event._id}/details`]); break;
      case 'edit':   this.redirectToCreateUser(event._id); break;
      case 'delete': this.deleteUser(event._id); break;
      case 'activate': this.toggleUserActive(event._id); break;
    }
  }

  toggleUserActive(userId: string) {
    const user = this.allUsers.find((u) => u._id === userId);
    if (!user) return;
    const newState = !user.isActive;
    this.adminUsersService.updateUser(userId, { isActive: newState }).subscribe({
      next: () => {
        this.notification.show(
          newState ? 'Usuario activado correctamente' : 'Usuario desactivado correctamente',
          'success'
        );
        this.loadUsers();
      },
      error: () => this.notification.show('Error al actualizar el estado del usuario', 'error'),
    });
  }

  redirectToCreateUser(userId = '') {
    const path = userId ? `/${userId}` : '';
    this.router.navigate([`/admin-users/create-user${path}`]);
  }

  navigateToBulkImport() {
    this.router.navigate(['/admin-users/bulk-import']);
  }

  resetPasswordTemp: string = '';
  showResetPasswordModal: boolean = false;
  resetPasswordCopied: boolean = false;

  resetPassword(userId: string) {
    this.confirmationService.show(
      'Se generara una contrasena temporal y el usuario debera cambiarla al iniciar sesion. ¿Continuar?',
      () => {
        this.adminUsersService.resetPassword(userId).subscribe({
          next: (res) => {
            this.resetPasswordTemp = res.temporaryPassword;
            this.showResetPasswordModal = true;
            this.resetPasswordCopied = false;
          },
          error: () => this.notification.show('Error al resetear la contrasena', 'error'),
        });
      }
    );
  }

  copyResetPassword() {
    navigator.clipboard.writeText(this.resetPasswordTemp).then(() => {
      this.resetPasswordCopied = true;
      setTimeout(() => (this.resetPasswordCopied = false), 2000);
    });
  }

  closeResetPasswordModal() {
    this.showResetPasswordModal = false;
  }

  getInitials(name: string): string {
    if (!name) return 'U';
    return name
      .split(' ')
      .filter((n) => n.trim().length > 0)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join('');
  }

  getRoleLabel(roleName: string): string {
    return ERoles[roleName as keyof typeof ERoles] ?? roleName;
  }
}
