import { Component, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';
import { CompanyConfigService } from '../../services/company-config.service';
import { finalize } from 'rxjs';
import { ButtonComponent } from '../../design-system/button/button.component';
import { InputComponent } from '../../design-system/input/input.component';
import { IconComponent } from '../../design-system/icon/icon.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, InputComponent, IconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  email = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');
  showPassword = signal(false);

  private userStateService = inject(UserStateService);
  private notificationService = inject(NotificationService);
  private authService = inject(AuthService);
  private companyConfigService = inject(CompanyConfigService);

  constructor(private router: Router) { }

  redirect() {
    this.router.navigate(['/']);
  }

  login() {
    if (!this.email() || !this.password()) {
      this.notificationService.show('Por favor ingresa email y contraseña', 'error');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.authService
      .login(this.email(), this.password())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((res) => {
        if (res && res.isActive === false) {
          this.notificationService.show('Tu usuario aún no ha sido activado. Contacta al administrador.', 'error');
          return;
        }

        // Multi-company or Contabilidad hub flow
        if (res?.requiresClientSelection) {
          if (res.isContabilidad || res.isAdmin) {
            // Store hub token & user state so hub page can use it
            this.userStateService.saveHubState(res);
            this.userStateService.setUser(res);
            if (res.mustChangePassword) {
              this.notificationService.show('Debes cambiar tu contraseña antes de continuar', 'warning');
              this.router.navigate(['/cambiar-contrasena']);
              return;
            }
          }
          // Navigate to hub, passing companies + credentials via router state
          this.router.navigate(['/hub'], {
            state: {
              companies: res.companies,
              email: this.email(),
              password: this.password(),
              isContabilidad: !!res.isContabilidad,
            },
          });
          return;
        }

        this.userStateService.setUser(res);
        this.companyConfigService.reloadConfigOnAuth();

        if (res.mustChangePassword) {
          this.notificationService.show('Debes cambiar tu contraseña antes de continuar', 'warning');
          this.router.navigate(['/cambiar-contrasena']);
          return;
        }
        this.notificationService.show('Bienvenid@ ' + res.name, 'success');
        this.redirect();
      });
  }
}
