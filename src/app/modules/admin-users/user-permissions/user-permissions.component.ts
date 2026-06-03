import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminUsersService } from '../services/admin-users.service';
import { NotificationService } from '../../../services/notification.service';
import { CategoriaService } from '../../../services/categoria.service';
import { CategoryGroupService } from '../../../services/category-group.service';
import { IUserResponse, IUserPermissions } from '../../../interfaces/user.interface';
import { ICategory } from '../../invoices/interfaces/category.interface';
import { ICategoryGroup } from '../../categorias/interfaces/category-group.interface';

interface ModuleOption {
  key: string;
  label: string;
  description: string;
}

@Component({
  selector: 'app-user-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-permissions.component.html',
  styleUrls: ['./user-permissions.component.scss'],
})
export class UserPermissionsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private adminUsersService = inject(AdminUsersService);
  private notification = inject(NotificationService);
  private categoriaService = inject(CategoriaService);
  private groupService = inject(CategoryGroupService);

  id: string = this.route.snapshot.params['id'];
  user: IUserResponse | null = null;
  saving = false;

  allCategories = signal<ICategory[]>([]);
  groups = signal<ICategoryGroup[]>([]);
  categorySearch = signal('');
  categoriesLoading = signal(false);

  readonly availableModules: ModuleOption[] = [
    { key: 'colaboradores', label: 'Colaboradores', description: 'Gestionar usuarios y permisos de la empresa' },
    { key: 'rendiciones', label: 'Rendiciones', description: 'Ver y gestionar rendiciones de todos los colaboradores' },
    { key: 'mis-rendiciones', label: 'Mis Rendiciones', description: 'Ver y gestionar rendiciones propias' },
    { key: 'nueva-rendicion', label: 'Nueva Rendición', description: 'Crear nuevas rendiciones desde la pantalla Mis Rendiciones' },
    { key: 'viaticos', label: 'Viáticos', description: 'Acceder a la gestión y seguimiento de anticipos de viáticos' },
    { key: 'consolidated-invoices', label: 'Consolidado', description: 'Ver reportes consolidados de gastos' },
    { key: 'tesoreria', label: 'Pagos', description: 'Registrar comprobantes de pago de viáticos' },
    { key: 'configuracion', label: 'Configuración', description: 'Configurar parámetros de la empresa' },
    { key: 'audit-log', label: 'Actividad', description: 'Ver el registro de actividad de la empresa' },
  ];

  permissions: IUserPermissions = {
    modules: [],
    canApproveL1: false,
    canApproveL2: false,
    categoryIds: [],
  };

  ngOnInit(): void {
    this.loadUser();
    this.loadCategoryData();
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
        };
      },
      error: () => this.notification.show('Error al cargar el usuario', 'error'),
    });
  }

  loadCategoryData() {
    this.categoriesLoading.set(true);
    Promise.all([
      this.categoriaService.getAllFlatAdmin().toPromise(),
      this.groupService.getAll().toPromise(),
    ]).then(([cats, groups]) => {
      this.allCategories.set(cats ?? []);
      this.groups.set(groups ?? []);
      this.categoriesLoading.set(false);
    }).catch(() => {
      this.notification.show('Error al cargar categorías', 'error');
      this.categoriesLoading.set(false);
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

  selectAllCategories() {
    this.permissions.categoryIds = this.allCategories().map((c) => c._id!).filter(Boolean);
  }

  clearAllCategories() {
    this.permissions.categoryIds = [];
  }

  // --- Grupos rápidos ---

  groupIsFullySelected(group: ICategoryGroup): boolean {
    const ids = this.permissions.categoryIds ?? [];
    return (group.categoryIds ?? []).length > 0 && (group.categoryIds ?? []).every((id) => ids.includes(id));
  }

  groupIsPartiallySelected(group: ICategoryGroup): boolean {
    const ids = this.permissions.categoryIds ?? [];
    return !this.groupIsFullySelected(group) && (group.categoryIds ?? []).some((id) => ids.includes(id));
  }

  toggleGroup(group: ICategoryGroup) {
    const groupCatIds = group.categoryIds ?? [];
    if (this.groupIsFullySelected(group)) {
      // quitar todas del grupo
      this.permissions.categoryIds = (this.permissions.categoryIds ?? []).filter(
        (id) => !groupCatIds.includes(id)
      );
    } else {
      // agregar las que faltan
      const current = new Set(this.permissions.categoryIds ?? []);
      groupCatIds.forEach((id) => current.add(id));
      this.permissions.categoryIds = Array.from(current);
    }
  }

  get selectedCount(): number {
    return (this.permissions.categoryIds ?? []).length;
  }

  get totalCount(): number {
    return this.allCategories().length;
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
      error: () => {
        this.notification.show('Error al actualizar los permisos', 'error');
        this.saving = false;
      },
    });
  }

  goBack() {
    this.router.navigate([`/admin-users/${this.id}/details`]);
  }
}
