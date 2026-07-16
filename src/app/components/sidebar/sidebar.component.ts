import {
  Component,
  inject,
  OnDestroy,
  OnInit,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { Router, NavigationEnd, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { UserStateService } from '../../services/user-state.service';
import { CompanyConfigService } from '../../services/company-config.service';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ICompanyConfig } from '../../interfaces/company-config.interface';
import { IconComponent } from '../../design-system/icon/icon.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() sidebarVisible = false;
  @Output() sidebarToggle = new EventEmitter<void>();

  private router = inject(Router);
  private authService = inject(AuthService);
  private confirmationService = inject(ConfirmationService);
  private userStateService = inject(UserStateService);
  private companyConfigService = inject(CompanyConfigService);
  private routerSubscription!: Subscription;
  private configSubscription!: Subscription;

  companyConfig: ICompanyConfig | null = null;
  currentPath = '';
  configOpen = false;

  isConfigSection(): boolean {
    return ['/configuracion', '/mi-firma', '/categorias', '/perfiles-categorias', '/centros-de-costo', '/lineas-negocio', '/audit-log', '/mi-perfil']
      .some(p => this.currentPath.startsWith(p));
  }

  toggleConfig(): void {
    this.configOpen = !this.configOpen;
  }

  constructor() {
    this.detectPath();
    this.loadCompanyConfig();
  }

  ngOnInit() {
    this.loadCompanyConfig();
    this.companyConfigService.refreshConfig();
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    if (this.configSubscription) {
      this.configSubscription.unsubscribe();
    }
  }

  private loadCompanyConfig() {
    this.configSubscription =
      this.companyConfigService.companyConfig$.subscribe((config) => {
        this.companyConfig = config;
      });
  }

  detectPath() {
    this.routerSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.currentPath = event.url;
      }
    });
  }

  navigateToPath(path: string) {
    this.router.navigate([path]);
  }

  isSelected(path: string) {
    // Ignorar query string / fragment (ej: /rendiciones?tab=directas) para no perder el activo al cambiar de tab
    const current = this.currentPath.split('?')[0].split('#')[0];
    // Paths que pueden ser prefijo de otros necesitan match más estricto
    if (path === '/rendiciones') {
      return current === '/rendiciones' || current.startsWith('/rendiciones/');
    }
    if (path === '/mis-rendiciones') {
      return current === '/mis-rendiciones' || current.startsWith('/mis-rendiciones/');
    }
    return current.includes(path);
  }

  toggleSidebar() {
    this.sidebarToggle.emit();
  }

  confirmation() {
    this.confirmationService.show(
      '¿Estás seguro de querer cerrar sesión?',
      () => {
        this.logout();
      }
    );
  }

  isAdmin(): boolean {
    return this.userStateService.isAdmin();
  }

  isAnyAdmin(): boolean {
    return this.userStateService.isAnyAdmin();
  }

  isContabilidadInCompany(): boolean {
    return this.userStateService.isContabilidadInCompany();
  }

  isAdminInCompany(): boolean {
    return this.userStateService.isAdminInCompany();
  }

  goBackToHub() {
    this.userStateService.restoreHubState();
    this.router.navigate(['/hub']);
  }

  isSuperAdmin(): boolean {
    return this.userStateService.isSuperAdmin();
  }

  isSuper(): boolean {
    return this.userStateService.isSuperAdmin();
  }

  isColaborador(): boolean {
    return this.userStateService.isColaborador();
  }

  isContabilidad(): boolean {
    return this.userStateService.isContabilidad();
  }

  isApprover(): boolean {
    return this.userStateService.isApprover();
  }

  canAccessTesoreria(): boolean {
    return this.userStateService.canAccessTesoreria();
  }

  canAccessViaticos(): boolean {
    return (
      this.userStateService.isSuperAdmin() ||
      this.userStateService.canApproveL1() ||
      this.userStateService.hasModulePermission('viaticos')
    );
  }

  hasModulePermission(module: string): boolean {
    return this.userStateService.hasModulePermission(module);
  }

  logout() {
    this.toggleSidebar();
    this.authService.logout();
  }

  getCompanyName(): string {
    return this.companyConfig?.name || 'Tema Litoclean';
  }

  getCompanyLogo(): string {
    return this.companyConfig?.logo || '';
  }

  get user() {
    return this.userStateService.getUser();
  }
}
