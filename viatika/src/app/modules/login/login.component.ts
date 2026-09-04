import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
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
export class LoginComponent implements OnInit, OnDestroy {
  email = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');
  showPassword = signal(false);

  /**
   * El teclado de Android tapa la pantalla de dos maneras distintas segun el
   * equipo: o encoge la WebView, o desplaza toda la ventana hacia arriba
   * dejando media pantalla vacia. `visualViewport` es lo unico que refleja el
   * area realmente visible en los dos casos, asi que de ahi salen el alto
   * (--vvh) y el desplazamiento a compensar (--vvtop) que usa la plantilla.
   */
  private readonly aplicarViewport = () => {
    const vv = window.visualViewport;
    const raiz = document.documentElement;
    if (!vv) return;
    raiz.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    raiz.style.setProperty('--vvtop', `${Math.round(vv.offsetTop)}px`);
  };

  ngOnInit(): void {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    window.visualViewport.addEventListener('resize', this.aplicarViewport);
    window.visualViewport.addEventListener('scroll', this.aplicarViewport);
    this.aplicarViewport();
  }

  ngOnDestroy(): void {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    window.visualViewport.removeEventListener('resize', this.aplicarViewport);
    window.visualViewport.removeEventListener('scroll', this.aplicarViewport);
    document.documentElement.style.removeProperty('--vvh');
    document.documentElement.style.removeProperty('--vvtop');
  }

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
