import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminUsersService } from '../services/admin-users.service';
import { NotificationService } from '../../../services/notification.service';
import { CategoriaService } from '../../../services/categoria.service';
import { CategoryProfileService } from '../../../services/category-profile.service';
import { UserStateService } from '../../../services/user-state.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { IUserResponse, IUserPermissions } from '../../../interfaces/user.interface';
import { ICategory } from '../../invoices/interfaces/category.interface';
import { ICategoryProfile } from '../../../interfaces/category-profile.interface';
import { IProject } from '../../invoices/interfaces/project.interface';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { CardComponent } from '../../../design-system/card/card.component';

interface ModuleOption {
  key: string;
  label: string;
  description: string;
}

@Component({
  selector: 'app-user-permissions',
  standalone: true,
  imports: [CommonModule, ButtonComponent, IconComponent, CardComponent],
  templateUrl: './user-permissions.component.html',
  styleUrls: ['./user-permissions.component.scss'],
})
export class UserPermissionsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private adminUsersService = inject(AdminUsersService);
  private notification = inject(NotificationService);
  private categoriaService = inject(CategoriaService);
  private categoryProfileService = inject(CategoryProfileService);
  private userState = inject(UserStateService);
  private invoicesService = inject(InvoicesService);

  id: string = this.route.snapshot.params['id'];
  user: IUserResponse | null = null;
  saving = false;

  allCategories = signal<ICategory[]>([]);
  categoryProfiles = signal<ICategoryProfile[]>([]);
  categorySearch = signal('');
  categoriesLoading = signal(false);
  /** Catálogo de centros de costo de la empresa. */
  allProjects = signal<IProject[]>([]);

  readonly availableModules: ModuleOption[] = [
    { key: 'colaboradores', label: 'Colaboradores', description: 'Gestionar usuarios y permisos de la empresa' },
    { key: 'rendiciones', label: 'Rendiciones', description: 'Ver y gestionar rendiciones de todos los colaboradores' },
    { key: 'mis-rendiciones', label: 'Mis Rendiciones', description: 'Ver y gestionar rendiciones propias' },
    { key: 'nueva-rendicion', label: 'Rendición directa', description: 'Crear nuevas rendiciones directas desde la pantalla de Tesorería' },
    { key: 'viaticos', label: 'Viáticos', description: 'Acceder a la gestión y seguimiento de anticipos de viáticos' },
    { key: 'consolidated-invoices', label: 'Dashboard', description: 'Ver el dashboard con KPIs y reportes consolidados de gastos' },
    { key: 'tesoreria', label: 'Pagos', description: 'Registrar comprobantes de pago de viáticos' },
    { key: 'configuracion', label: 'Configuración', description: 'Configurar parámetros de la empresa' },
    { key: 'audit-log', label: 'Actividad', description: 'Ver el registro de actividad de la empresa' },
    { key: 'caja-chica', label: 'Rendicion Caja Chica', description: 'Crear y subir comprobantes de caja chica propios' },
  ];

  permissions: IUserPermissions = {
    modules: [],
    canApproveL1: false,
    canApproveL2: false,
    categoryIds: [],
    projectIds: [],
    primaryProjectId: undefined,
  };

  ngOnInit(): void {
    this.loadUser();
    this.loadCategoryData();
    this.loadCategoryProfiles();
    this.loadProjects();
  }

  loadCategoryProfiles() {
    this.categoryProfileService.getAll().subscribe({
      next: (list) => this.categoryProfiles.set(list ?? []),
      error: () => this.categoryProfiles.set([]),
    });
  }

  loadUser() {
    this.adminUsersService.getUser(this.id).subscribe({
      next: (user) => {
        this.user = user;
        this.permissions = {
          modules: user.permissions?.modules ?? [],
          canApproveL1: user.permissions?.canApproveL1 ?? false,
          canApproveL2: user.permissions?.canApproveL2 ?? false,
          categoryIds: user.permissions?.categoryIds ?? [],
          projectIds: user.permissions?.projectIds ?? [],
          primaryProjectId: user.permissions?.primaryProjectId ?? undefined,
        };
      },
      error: () => this.notification.show('Error al cargar el usuario', 'error'),
    });
  }

  private resolveCompanyId(): string {
    const u = this.userState.getUser() as Record<string, unknown> | null;
    if (!u) return '';
    return (
      (u['companyId'] as string) ||
      ((u['client'] as { _id?: string })?._id ?? '') ||
      ((u['clientId'] as { _id?: string })?._id ?? '') ||
      (typeof u['clientId'] === 'string' ? (u['clientId'] as string) : '') ||
      ''
    );
  }

  loadProjects() {
    const clientId = this.resolveCompanyId();
    if (!clientId) return;
    this.invoicesService.getProjects(clientId).subscribe({
      next: (list) => this.allProjects.set((list || []).filter((p) => p.isActive !== false)),
      error: () => this.allProjects.set([]),
    });
  }

  // --- Centros de costo asignados (ordenados; el primero es el principal) ---

  get assignedProjects(): IProject[] {
    const ids = this.permissions.projectIds ?? [];
    const byId = new Map(this.allProjects().map((p) => [String(p._id), p]));
    return ids.map((id) => byId.get(id)).filter((p): p is IProject => !!p);
  }

  /** Centros de costo aún no agregados a la lista asignada. */
  get availableProjectCandidates(): IProject[] {
    const assigned = new Set(this.permissions.projectIds ?? []);
    return this.allProjects().filter((p) => !assigned.has(String(p._id)));
  }

  addProject(id: string) {
    if (!id) return;
    const current = this.permissions.projectIds ?? [];
    if (current.includes(id)) return;
    this.permissions.projectIds = [...current, id];
  }

  removeProject(index: number) {
    const current = this.permissions.projectIds ?? [];
    const removedId = current[index];
    this.permissions.projectIds = current.filter((_, i) => i !== index);
    if (removedId && this.permissions.primaryProjectId === removedId) {
      this.permissions.primaryProjectId = undefined;
    }
  }

  /** Principal explícito si el usuario lo marcó; si no, cae al primero de la lista. */
  get effectivePrimaryProjectId(): string | undefined {
    return this.permissions.primaryProjectId ?? this.permissions.projectIds?.[0];
  }

  isPrimary(id?: string): boolean {
    return !!id && this.effectivePrimaryProjectId === id;
  }

  setPrimary(id: string) {
    this.permissions.primaryProjectId = id;
  }

  moveProjectUp(index: number) {
    if (index <= 0) return;
    const arr = [...(this.permissions.projectIds ?? [])];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    this.permissions.projectIds = arr;
  }

  moveProjectDown(index: number) {
    const current = this.permissions.projectIds ?? [];
    if (index >= current.length - 1) return;
    const arr = [...current];
    [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
    this.permissions.projectIds = arr;
  }

  projectLabel(p: IProject): string {
    return p.code ? `${p.code} — ${p.name}` : p.name;
  }

  loadCategoryData() {
    this.categoriesLoading.set(true);
    this.categoriaService.getAllFlatAdmin().subscribe({
      next: (cats) => {
        this.allCategories.set(cats ?? []);
        this.categoriesLoading.set(false);
      },
      error: () => {
        this.notification.show('Error al cargar categorías', 'error');
        this.categoriesLoading.set(false);
      },
    });
  }

  // --- Módulos ---

  hasModule(key: string): boolean {
    return this.permissions.modules.includes(key);
  }

  toggleModule(key: string, checked: boolean) {
    if (checked) {
      if (!this.permissions.modules.includes(key)) {
        this.permissions.modules = [...this.permissions.modules, key];
      }
    } else {
      this.permissions.modules = this.permissions.modules.filter((m) => m !== key);
    }
  }

  // --- Categorías ---

  get filteredCategories(): ICategory[] {
    const q = this.categorySearch().toLowerCase();
    if (!q) return this.allCategories();
    return this.allCategories().filter(
      (c) => c.name.toLowerCase().includes(q) || (c.cuenta ?? '').toLowerCase().includes(q)
    );
  }

  hasCategory(id: string): boolean {
    return (this.permissions.categoryIds ?? []).includes(id);
  }

  toggleCategory(id: string, checked: boolean) {
    const current = this.permissions.categoryIds ?? [];
    if (checked) {
      if (!current.includes(id)) {
        this.permissions.categoryIds = [...current, id];
      }
    } else {
      this.permissions.categoryIds = current.filter((x) => x !== id);
    }
  }

  /** Marca todas las categorías VISIBLES según el filtro actual (une con lo ya seleccionado). */
  selectAllCategories() {
    const current = new Set(this.permissions.categoryIds ?? []);
    for (const c of this.filteredCategories) {
      if (c._id) current.add(c._id);
    }
    this.permissions.categoryIds = [...current];
  }

  /** Desmarca las categorías VISIBLES según el filtro actual (conserva el resto). */
  clearAllCategories() {
    const remove = new Set(this.filteredCategories.map((c) => c._id).filter(Boolean));
    this.permissions.categoryIds = (this.permissions.categoryIds ?? []).filter(
      (id) => !remove.has(id)
    );
  }

  get selectedCount(): number {
    return (this.permissions.categoryIds ?? []).length;
  }

  get totalCount(): number {
    return this.allCategories().length;
  }

  // --- Perfiles de categoría (VD-38): marcar de una vez todas las categorías del perfil ---

  private profileCategoryIds(p: ICategoryProfile): string[] {
    return (p.categoryIds ?? []).map(String).filter(Boolean);
  }

  profileCount(p: ICategoryProfile): number {
    return this.profileCategoryIds(p).length;
  }

  /** Todas las categorías del perfil están seleccionadas. */
  isProfileSelected(p: ICategoryProfile): boolean {
    const ids = this.profileCategoryIds(p);
    if (ids.length === 0) return false;
    const current = this.permissions.categoryIds ?? [];
    return ids.every((id) => current.includes(id));
  }

  /** Al menos una (pero no todas) categoría del perfil está seleccionada. */
  isProfilePartial(p: ICategoryProfile): boolean {
    const ids = this.profileCategoryIds(p);
    const current = this.permissions.categoryIds ?? [];
    const some = ids.some((id) => current.includes(id));
    return some && !ids.every((id) => current.includes(id));
  }

  /** Marca/desmarca de golpe todas las categorías del perfil. */
  toggleProfile(p: ICategoryProfile) {
    const ids = this.profileCategoryIds(p);
    const current = this.permissions.categoryIds ?? [];
    if (this.isProfileSelected(p)) {
      this.permissions.categoryIds = current.filter((id) => !ids.includes(id));
    } else {
      this.permissions.categoryIds = [...new Set([...current, ...ids])];
    }
  }

  // --- Save ---

  save() {
    this.saving = true;
    this.adminUsersService.updatePermissions(this.id, this.permissions).subscribe({
      next: () => {
        this.notification.show(
          'Permisos actualizados. El usuario debe volver a iniciar sesión para que los cambios se reflejen.',
          'success'
        );
        this.saving = false;
      },
      error: (err: Error) => {
        this.notification.show(err.message || 'Error al actualizar los permisos', 'error');
        this.saving = false;
      },
    });
  }

  goBack() {
    this.router.navigate([`/admin-users/${this.id}/details`]);
  }
}
