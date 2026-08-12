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

  isTesoreria(): boolean {
    return this.userStateService.isTesoreria();
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

  /**
   * Visibilidad de cada ítem del menú. Cada entrada se decide en UN solo sitio:
   * antes había un bloque por perfil (admin/contabilidad, aprobador, tesorería,
   * colaborador) y quien cumplía dos perfiles a la vez veía el mismo enlace
   * repetido. La regla es "tiene el módulo asignado", salvo el Superadministrador
   * y los accesos que nacen de una asignación (ser aprobador de un centro de
   * costo) o del rol Tesorería, que es exactamente lo que permiten los guards.
   */
  private inCompanyPanel(): boolean {
    return this.isAdminInCompany() || this.isContabilidadInCompany();
  }

  showDashboard(): boolean {
    return this.hasModulePermission('consolidated-invoices');
  }

  /** Contabilidad llama "Inicio" a su tablero; el resto lo ve como "Dashboard". */
  dashboardLabel(): string {
    return this.isContabilidadInCompany() ? 'Inicio' : 'Dashboard';
  }

  /**
   * Portada de pendientes (/inicio). Se oculta si ya hay un ítem "Inicio" (el
   * tablero de Contabilidad usa esa misma etiqueta) para no repetir el nombre.
   */
  showInicio(): boolean {
    if (this.isSuper() || this.showDashboard()) return false;
    return this.isColaborador() || this.isApprover() || this.isTesoreria();
  }

  /** /admin-users solo lo abre AuthAdmin2Guard (Admin/Contabilidad/Super). */
  showColaboradores(): boolean {
    if (this.isSuper()) return true;
    return this.hasModulePermission('colaboradores') && (this.isAdmin() || this.isContabilidad());
  }

  /** Mismo criterio que authModuleGuard('rendiciones'). */
  showRendiciones(): boolean {
    return (
      this.isSuper() ||
      this.isTesoreria() ||
      this.isApprover() ||
      this.hasModulePermission('rendiciones')
    );
  }

  showMisRendiciones(): boolean {
    return this.hasModulePermission('mis-rendiciones') || this.hasModulePermission('nueva-rendicion');
  }

  showMiPerfil(): boolean {
    return this.isColaborador();
  }

  showPagos(): boolean {
    return this.canAccessTesoreria();
  }

  /** Grupo colapsable de Configuración: solo en los paneles de empresa. */
  showConfigGroup(): boolean {
    return this.isSuper() || (this.inCompanyPanel() && this.hasModulePermission('configuracion'));
  }

  showConfigLink(): boolean {
    return !this.showConfigGroup() && this.hasModulePermission('configuracion');
  }

  showActividad(): boolean {
    return !this.showConfigGroup() && !this.hasModulePermission('configuracion') && this.hasModulePermission('audit-log');
  }

  showMiFirma(): boolean {
    return !this.inCompanyPanel() && !this.isSuper();
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
