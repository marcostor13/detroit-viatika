import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { NotificationService } from '../../services/notification.service';
import { UserStateService } from '../../services/user-state.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-cambiar-contrasena',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div class="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <h1 class="text-2xl font-bold text-gray-800 mb-2">Cambiar contraseña</h1>
        <p class="text-sm text-gray-500 mb-6">
          Por seguridad debes establecer una nueva contraseña antes de continuar.
        </p>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
            <input
              type="password"
              [(ngModel)]="newPassword"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
            <input
              type="password"
              [(ngModel)]="confirmPassword"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Repite la contraseña"
            />
          </div>
          <button
            (click)="submit()"
            [disabled]="loading()"
            class="w-full bg-primary text-white rounded-lg py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {{ loading() ? 'Guardando...' : 'Guardar contraseña' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class CambiarContrasenaComponent {
  newPassword = '';
  confirmPassword = '';
  loading = signal(false);

  private router = inject(Router);
  private http = inject(HttpClient);
  private notification = inject(NotificationService);
  private userState = inject(UserStateService);

  submit() {
    if (!this.newPassword || this.newPassword.length < 8) {
      this.notification.show('La contraseña debe tener al menos 8 caracteres', 'error');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.notification.show('Las contraseñas no coinciden', 'error');
      return;
    }
    const user = this.userState.getUser();
    if (!user?._id) {
      this.notification.show('Sesión inválida, inicia sesión nuevamente', 'error');
      this.router.navigate(['/login']);
      return;
    }
    this.loading.set(true);
    const token = this.userState.getToken();
    this.http
      .patch(
        `${environment.api}/user/profile/password`,
        { password: this.newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .subscribe({
        next: () => {
          this.loading.set(false);
          const updated = { ...user, mustChangePassword: false };
          this.userState.setUser(updated as any);
          this.notification.show('Contraseña actualizada correctamente', 'success');
          const needsHub = (this.userState.isContabilidad() || this.userState.isAdmin()) && !(updated as any).companyId;
          this.router.navigate([needsHub ? '/hub' : '/']);
        },
        error: () => {
          this.loading.set(false);
          this.notification.show('Error al actualizar la contraseña', 'error');
        },
      });
  }
}
