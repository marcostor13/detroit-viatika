import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { CompanyConfigService } from '../../services/company-config.service';
import { finalize } from 'rxjs';

interface HubCompany {
  clientId: string;
  name: string;
  logo: string | null;
}

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hub.component.html',
})
export class HubComponent implements OnInit {
  private authService = inject(AuthService);
  private userStateService = inject(UserStateService);
  private notificationService = inject(NotificationService);
  private companyConfigService = inject(CompanyConfigService);
  private router = inject(Router);

  companies = signal<HubCompany[]>([]);
  loading = signal(true);
  selecting = signal<string | null>(null);

  get currentUser() { return this.userStateService.getUser(); }
  get isContabilidad() { return this.userStateService.isContabilidad(); }
  get isAdmin() { return this.userStateService.isAdmin(); }
  get isHubUser() { return this.isContabilidad || this.isAdmin; }

  // Stored temporarily for multi-company regular user selection
  private _pendingEmail = '';
  private _pendingPassword = '';

  ngOnInit() {
    const nav = history.state as any;

    if (nav?.companies?.length) {
      // Companies were passed from login response
      this.companies.set(nav.companies);
      this._pendingEmail = nav.email || '';
      this._pendingPassword = nav.password || '';
      this.loading.set(false);
    } else if (this.isHubUser) {
      // Hub user refresh: re-fetch companies from API using stored hub token
      this.authService.getHubCompanies()
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe({
          next: (companies) => this.companies.set(companies),
          error: () => {
            this.notificationService.show('Error al cargar empresas', 'error');
            this.router.navigate(['/login']);
          },
        });
    } else {
      this.loading.set(false);
      this.router.navigate(['/login']);
    }
  }

  selectCompany(company: HubCompany) {
    this.selecting.set(company.clientId);

    const isContabilidad = this.isContabilidad;
    const isAdmin = this.isAdmin;
    const isHubUser = isContabilidad || isAdmin;
    const hubToken = isHubUser ? (this.currentUser?.access_token || localStorage.getItem('token')) : undefined;

    const body = isHubUser
      ? { hubToken: hubToken!, clientId: company.clientId }
      : { email: this._pendingEmail, password: this._pendingPassword, clientId: company.clientId };

    this.authService.selectClient(body)
      .pipe(finalize(() => this.selecting.set(null)))
      .subscribe({
        next: (res) => {
          this.userStateService.setUser(res);
          this.companyConfigService.reloadConfigOnAuth();
          if (res.mustChangePassword) {
            this.router.navigate(['/cambiar-contrasena']);
            return;
          }
          this.notificationService.show('Bienvenid@ ' + res.name, 'success');
          const redirect = isAdmin ? '/admin-users' : isContabilidad ? '/dashboard' : '/';
          this.router.navigate([redirect]);
        },
        error: () => {
          this.notificationService.show('Error al seleccionar empresa', 'error');
        },
      });
  }

  goToClients() {
    this.router.navigate(['/clients-admin']);
  }

  logout() {
    this.userStateService.clearUser();
    this.router.navigate(['/login']);
  }
}
