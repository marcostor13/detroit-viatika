import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AdminUsersService } from '../services/admin-users.service';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { InputComponent } from '../../../design-system/input/input.component';
import { ModalComponent } from '../../../design-system/modal/modal.component';
import {
  IRoleResponse,
  IUserResponse,
  IUser,
  IUserPermissions,
} from '../../../interfaces/user.interface';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { ERoles } from '../interfaces/roles.enum';
import { CategoriaService } from '../../../services/categoria.service';
import { ICategory } from '../../invoices/interfaces/category.interface';

interface ModuleOption {
  key: string;
  label: string;
  description: string;
}

@Component({
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ButtonComponent, IconComponent, InputComponent, ModalComponent],
  selector: 'app-create-user',
  templateUrl: './create-user.component.html',
  styleUrls: ['./create-user.component.scss'],
  standalone: true,
})
export class CreateUserComponent implements OnInit {
  private router: Router = inject(Router);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private route: ActivatedRoute = inject(ActivatedRoute);
  private adminUsersService: AdminUsersService = inject(AdminUsersService);
  private notificationService: NotificationService =
    inject(NotificationService);
  private userStateService: UserStateService = inject(UserStateService);
  private categoriaService = inject(CategoriaService);
  id: string = this.route.snapshot.params['id'];
  form: FormGroup = this.formBuilder.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    roleId: ['', Validators.required],
    dni: [''],
    employeeCode: [''],
    area: [''],
    cargo: [''],
    address: [''],
    phone: [''],
    bankName: [''],
    accountNumber: [''],
    cci: [''],
    accountType: [''],
  });
  step = 1;
  roles: IRoleResponse[] = [];
  enumRoles = ERoles;
  temporaryPassword: string = '';
  showPasswordModal: boolean = false;
  passwordCopied: boolean = false;
  allCategories = signal<ICategory[]>([]);
  categorySearch = signal('');
  categoriesLoading = signal(false);

  readonly availableModules: ModuleOption[] = [
    { key: 'mis-rendiciones', label: 'Mis Rendiciones', description: 'Ver y gestionar rendiciones propias' },
    { key: 'nueva-rendicion', label: 'Nueva Rendición', description: 'Crear nuevas rendiciones' },
    { key: 'rendiciones', label: 'Rendiciones (todas)', description: 'Ver rendiciones de todos los colaboradores' },
    { key: 'viaticos', label: 'Viáticos', description: 'Gestión y seguimiento de anticipos' },
    { key: 'consolidated-invoices', label: 'Dashboard', description: 'Dashboard con KPIs y reportes consolidados de gastos' },
    { key: 'tesoreria', label: 'Pagos', description: 'Registrar comprobantes de pago' },
    { key: 'configuracion', label: 'Configuración', description: 'Configurar parámetros de la empresa' },
    { key: 'audit-log', label: 'Actividad', description: 'Ver registro de actividad' },
    { key: 'caja-chica', label: 'Rendicion Caja Chica', description: 'Crear y subir comprobantes de caja chica propios' },
  ];

  permissions: IUserPermissions = {
    modules: [],
    canApproveL1: false,
    canApproveL2: false,
    categoryIds: [],
  };

  ngOnInit() {
    if (this.id) {
      this.getUser();
    }
    this.getRoles();
    this.loadCategoryData();
  }

  get selectedRoleIsCollaborador(): boolean {
    const rid = this.form.get('roleId')?.value;
    const r = this.roles.find((x) => x._id === rid);
    return r?.name === 'Colaborador';
  }

  private get selectedRoleName(): string {
    const rid = this.form.get('roleId')?.value;
    return this.roles.find((x) => x._id === rid)?.name ?? '';
  }

  get selectedRoleNeedsPermissions(): boolean {
    const n = this.selectedRoleName;
    return n === 'Colaborador' || n === 'Coordinador' || n === 'Contabilidad' || n === 'Administrador' || n === 'Tesoreria';
  }

  get step2Modules(): ModuleOption[] {
    if (this.selectedRoleIsCollaborador) {
      return this.availableModules.filter((m) =>
        ['mis-rendiciones', 'nueva-rendicion', 'viaticos'].includes(m.key),
      );
    }
    return this.availableModules.filter((m) => m.key !== 'mis-rendiciones');
  }

  get showApprovalPermissions(): boolean {
    const n = this.selectedRoleName;
    return n === 'Coordinador' || n === 'Contabilidad';
  }

  get selectedRoleIsAdmin(): boolean {
    return this.selectedRoleName === 'Superadministrador';
  }

  private setDefaultPermissions() {
    const name = this.selectedRoleName;
    const allStep2 = this.step2Modules.map((m) => m.key);
    if (name === 'Colaborador') {
      this.permissions = { modules: ['mis-rendiciones', 'nueva-rendicion', 'viaticos'], canApproveL1: false, canApproveL2: false, categoryIds: [] };
    } else if (name === 'Coordinador') {
      this.permissions = { modules: ['rendiciones', 'viaticos', 'tesoreria'], canApproveL1: true, canApproveL2: false, categoryIds: [] };
    } else if (name === 'Contabilidad') {
      this.permissions = { modules: allStep2, canApproveL1: true, canApproveL2: true, categoryIds: [] };
    } else if (name === 'Tesoreria') {
      this.permissions = { modules: ['tesoreria'], canApproveL1: false, canApproveL2: false, categoryIds: [] };
    } else if (name === 'Administrador') {
      this.permissions = { modules: allStep2, canApproveL1: false, canApproveL2: false, categoryIds: [] };
    }
  }

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

  resetPermissions() {
    this.permissions = { modules: [], canApproveL1: false, canApproveL2: false, categoryIds: [] };
  }

  getRoleName(roleId: string) {
    return this.enumRoles[
      this.roles.find((role) => role._id === roleId)
        ?.name as keyof typeof ERoles
    ];
  }

  readonly allowedRoles = ['Administrador', 'Colaborador', 'Coordinador', 'Contabilidad', 'Tesoreria'];

  getRoles() {
    this.adminUsersService.getRoles().subscribe((roles) => {
      this.roles = roles.filter((r) => this.allowedRoles.includes(r.name));
    });
  }

  back() {
    this.router.navigate(['/admin-users']);
  }

  assignUser(user: IUserResponse) {
    this.form.patchValue({
      name: user.name,
      email: user.email,
      roleId: user.role._id,
      dni: user.dni || '',
      employeeCode: user.employeeCode || '',
      area: user.area || '',
      cargo: user.cargo || '',
      address: user.address || '',
      phone: user.phone || '',
      bankName: user.bankAccount?.bankName || '',
      accountNumber: user.bankAccount?.accountNumber || '',
      cci: user.bankAccount?.cci || '',
      accountType: user.bankAccount?.accountType || '',
    });
  }

  getUser() {
    this.adminUsersService.getUser(this.id).subscribe((user) => {
      this.assignUser(user);
    });
  }

  createUser() {
    if (this.form.valid) {
      const { bankName, accountNumber, cci, accountType, ...rest } = this.form.value;
      const payload: any = { ...rest };
      if (bankName || accountNumber || cci) {
        payload.bankAccount = { bankName, accountNumber, cci, accountType: accountType || undefined };
      }
      if (this.selectedRoleNeedsPermissions) {
        payload.permissions = { ...this.permissions };
      }
      this.adminUsersService.createUser(payload).subscribe((res) => {
        this.temporaryPassword = res.temporaryPassword;
        this.showPasswordModal = true;
      });
    }
  }

  copyPassword() {
    navigator.clipboard.writeText(this.temporaryPassword).then(() => {
      this.passwordCopied = true;
      setTimeout(() => (this.passwordCopied = false), 2000);
    });
  }

  closePasswordModal() {
    this.showPasswordModal = false;
    this.router.navigate(['/admin-users']);
  }

  updateUser() {
    if (this.form.valid) {
      const { bankName, accountNumber, cci, accountType, ...rest } = this.form.value;
      const updateData: any = { ...rest };
      delete updateData['password'];

      if (bankName || accountNumber || cci) {
        updateData.bankAccount = { bankName, accountNumber, cci, accountType: accountType || undefined };
      }

      this.adminUsersService
        .updateUser(this.id, updateData as Partial<IUser>)
        .subscribe((user) => {
          this.notificationService.show(
            'Usuario editado correctamente',
            'success'
          );

          const currentUser = this.userStateService.getUser();
          if (currentUser && currentUser._id === this.id) {
            this.userStateService.setUser({ ...currentUser, name: user.name });
          }
        });
    }
  }

  get name() {
    return this.form.get('name');
  }

  get email() {
    return this.form.get('email');
  }

  get roleId() {
    return this.form.get('roleId');
  }

  loadCategoryData() {
    this.categoriesLoading.set(true);
    this.categoriaService.getAllFlatAdmin().subscribe({
      next: (cats) => {
        this.allCategories.set(cats ?? []);
        this.categoriesLoading.set(false);
      },
      error: () => this.categoriesLoading.set(false),
    });
  }

  goToStep2() {
    if (this.form.valid) {
      this.setDefaultPermissions();
      this.step = 2;
    } else {
      this.form.markAllAsTouched();
    }
  }

  get filteredCategories(): ICategory[] {
    const q = this.categorySearch().toLowerCase();
    if (!q) return this.allCategories();
    return this.allCategories().filter(
      (c) => c.name.toLowerCase().includes(q) || (c.cuenta ?? '').toLowerCase().includes(q),
    );
  }

  hasCategory(id: string): boolean {
    return (this.permissions.categoryIds ?? []).includes(id);
  }

  toggleCategory(id: string, checked: boolean) {
    const current = this.permissions.categoryIds ?? [];
    if (checked) {
      if (!current.includes(id)) this.permissions.categoryIds = [...current, id];
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

  get selectedCategoryCount(): number {
    return (this.permissions.categoryIds ?? []).length;
  }

  get totalCategoryCount(): number {
    return this.allCategories().length;
  }
}
