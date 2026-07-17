import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CreateUserComponent } from './create-user.component';
import { AdminUsersService } from '../services/admin-users.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { CategoriaService } from '../../../services/categoria.service';
import { IRoleResponse, IUserResponse } from '../../../interfaces/user.interface';
import { ICategory } from '../../invoices/interfaces/category.interface';

describe('CreateUserComponent', () => {
  let component: CreateUserComponent;
  let adminUsersService: jasmine.SpyObj<AdminUsersService>;
  let notification: jasmine.SpyObj<NotificationService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let categoriaService: jasmine.SpyObj<CategoriaService>;
  let router: jasmine.SpyObj<Router>;

  const mockRoles: IRoleResponse[] = [
    { _id: 'r-admin', name: 'Administrador', active: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: 'r-colab', name: 'Colaborador', active: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: 'r-coord', name: 'Coordinador', active: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: 'r-cont', name: 'Contabilidad', active: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: 'r-tes', name: 'Tesoreria', active: true, createdAt: new Date(), updatedAt: new Date() },
    { _id: 'r-super', name: 'Superadministrador', active: true, createdAt: new Date(), updatedAt: new Date() },
  ];

  const mockCategories: ICategory[] = [
    { _id: 'cat1', name: 'Alimentos', cuenta: '601' },
    { _id: 'cat2', name: 'Transporte', cuenta: '602' },
  ];

  function setup(id: string | null = '') {
    TestBed.resetTestingModule();
    adminUsersService = jasmine.createSpyObj('AdminUsersService', ['getRoles', 'getUser', 'createUser', 'updateUser']);
    notification = jasmine.createSpyObj('NotificationService', ['show']);
    userState = jasmine.createSpyObj('UserStateService', ['getUser', 'setUser']);
    categoriaService = jasmine.createSpyObj('CategoriaService', ['getAllFlatAdmin']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    adminUsersService.getRoles.and.returnValue(of(mockRoles));
    categoriaService.getAllFlatAdmin.and.returnValue(of(mockCategories));

    TestBed.configureTestingModule({
      imports: [CreateUserComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id } } } },
        { provide: Router, useValue: router },
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: NotificationService, useValue: notification },
        { provide: UserStateService, useValue: userState },
        { provide: CategoriaService, useValue: categoriaService },
      ],
    });

    component = TestBed.createComponent(CreateUserComponent).componentInstance;
  }

  beforeEach(() => setup());

  it('creates and filters roles to the allowed list', () => {
    component.ngOnInit();
    expect(component.roles.map((r) => r.name).sort()).toEqual(
      ['Administrador', 'Colaborador', 'Coordinador', 'Contabilidad', 'Tesoreria'].sort()
    );
    expect(component.roles.some((r) => r.name === 'Superadministrador')).toBeFalse();
  });

  it('loads categories on init', () => {
    component.ngOnInit();
    expect(component.allCategories()).toEqual(mockCategories);
    expect(component.categoriesLoading()).toBeFalse();
  });

  it('does not fetch an existing user when there is no id', () => {
    component.ngOnInit();
    expect(adminUsersService.getUser).not.toHaveBeenCalled();
  });

  describe('edit mode', () => {
    beforeEach(() => setup('u1'));

    it('fetches and assigns the existing user to the form', () => {
      const user: IUserResponse = {
        _id: 'u1',
        name: 'Jane',
        email: 'jane@test.com',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: mockRoles[1],
        dni: '12345678',
        bankAccount: { bankName: 'BCP', accountNumber: '123', cci: '456', accountType: 'ahorros' },
      };
      adminUsersService.getUser.and.returnValue(of(user));

      component.ngOnInit();

      expect(adminUsersService.getUser).toHaveBeenCalledWith('u1');
      expect(component.form.get('name')?.value).toBe('Jane');
      expect(component.form.get('roleId')?.value).toBe('r-colab');
      expect(component.form.get('bankName')?.value).toBe('BCP');
    });
  });

  describe('form validity getters', () => {
    it('exposes name, email and roleId form controls', () => {
      expect(component.name).toBe(component.form.get('name'));
      expect(component.email).toBe(component.form.get('email'));
      expect(component.roleId).toBe(component.form.get('roleId'));
    });
  });

  describe('role-derived getters', () => {
    beforeEach(() => {
      component.roles = mockRoles;
    });

    it('selectedRoleIsCollaborador is true for the Colaborador role', () => {
      component.form.patchValue({ roleId: 'r-colab' });
      expect(component.selectedRoleIsCollaborador).toBeTrue();
    });

    it('selectedRoleIsCollaborador is false for other roles', () => {
      component.form.patchValue({ roleId: 'r-admin' });
      expect(component.selectedRoleIsCollaborador).toBeFalse();
    });

    it('selectedRoleNeedsPermissions is true for roles with a permissions model', () => {
      for (const id of ['r-colab', 'r-coord', 'r-cont', 'r-admin', 'r-tes']) {
        component.form.patchValue({ roleId: id });
        expect(component.selectedRoleNeedsPermissions).toBeTrue();
      }
    });

    it('selectedRoleNeedsPermissions is false for Superadministrador', () => {
      component.form.patchValue({ roleId: 'r-super' });
      expect(component.selectedRoleNeedsPermissions).toBeFalse();
    });

    it('step2Modules restricts to collaborator modules for Colaborador', () => {
      component.form.patchValue({ roleId: 'r-colab' });
      expect(component.step2Modules.map((m) => m.key)).toEqual(['mis-rendiciones', 'nueva-rendicion', 'viaticos']);
    });

    it('step2Modules excludes mis-rendiciones for non-collaborator roles', () => {
      component.form.patchValue({ roleId: 'r-admin' });
      expect(component.step2Modules.some((m) => m.key === 'mis-rendiciones')).toBeFalse();
    });

    it('showApprovalPermissions is true only for Coordinador and Contabilidad', () => {
      component.form.patchValue({ roleId: 'r-coord' });
      expect(component.showApprovalPermissions).toBeTrue();
      component.form.patchValue({ roleId: 'r-cont' });
      expect(component.showApprovalPermissions).toBeTrue();
      component.form.patchValue({ roleId: 'r-admin' });
      expect(component.showApprovalPermissions).toBeFalse();
    });

    it('selectedRoleIsAdmin is true only for Superadministrador', () => {
      component.form.patchValue({ roleId: 'r-super' });
      expect(component.selectedRoleIsAdmin).toBeTrue();
      component.form.patchValue({ roleId: 'r-admin' });
      expect(component.selectedRoleIsAdmin).toBeFalse();
    });
  });

  describe('goToStep2 and default permissions', () => {
    beforeEach(() => {
      component.roles = mockRoles;
      component.form.patchValue({ name: 'Test', email: 'test@test.com' });
    });

    it('does not advance and marks the form touched when invalid', () => {
      component.form.patchValue({ roleId: '' });
      component.goToStep2();
      expect(component.step).toBe(1);
      expect(component.roleId?.touched).toBeTrue();
    });

    it('advances to step 2 and sets Colaborador defaults', () => {
      component.form.patchValue({ roleId: 'r-colab' });
      component.goToStep2();
      expect(component.step).toBe(2);
      expect(component.permissions).toEqual({
        modules: ['mis-rendiciones', 'nueva-rendicion', 'viaticos'],
        canApproveL1: false,
        canApproveL2: false,
        categoryIds: [],
      });
    });

    it('sets Coordinador defaults with canApproveL1 true', () => {
      component.form.patchValue({ roleId: 'r-coord' });
      component.goToStep2();
      expect(component.permissions.canApproveL1).toBeTrue();
      expect(component.permissions.canApproveL2).toBeFalse();
      expect(component.permissions.modules).toEqual(['rendiciones', 'viaticos', 'tesoreria']);
    });

    it('sets Contabilidad defaults with both approval levels true', () => {
      component.form.patchValue({ roleId: 'r-cont' });
      component.goToStep2();
      expect(component.permissions.canApproveL1).toBeTrue();
      expect(component.permissions.canApproveL2).toBeTrue();
    });

    it('sets Tesoreria defaults', () => {
      component.form.patchValue({ roleId: 'r-tes' });
      component.goToStep2();
      expect(component.permissions.modules).toEqual(['tesoreria']);
      expect(component.permissions.canApproveL1).toBeFalse();
      expect(component.permissions.canApproveL2).toBeFalse();
    });

    it('sets Administrador defaults with no approval flags', () => {
      component.form.patchValue({ roleId: 'r-admin' });
      component.goToStep2();
      expect(component.permissions.canApproveL1).toBeFalse();
      expect(component.permissions.canApproveL2).toBeFalse();
      expect(component.permissions.modules.length).toBeGreaterThan(0);
    });
  });

  describe('module toggles', () => {
    it('hasModule reflects presence in permissions.modules', () => {
      component.permissions.modules = ['tesoreria'];
      expect(component.hasModule('tesoreria')).toBeTrue();
      expect(component.hasModule('configuracion')).toBeFalse();
    });

    it('toggleModule adds and removes modules', () => {
      component.permissions.modules = [];
      component.toggleModule('tesoreria', true);
      expect(component.permissions.modules).toEqual(['tesoreria']);
      component.toggleModule('tesoreria', true);
      expect(component.permissions.modules).toEqual(['tesoreria']);
      component.toggleModule('tesoreria', false);
      expect(component.permissions.modules).toEqual([]);
    });

    it('resetPermissions clears everything', () => {
      component.permissions = { modules: ['a'], canApproveL1: true, canApproveL2: true, categoryIds: ['c1'] };
      component.resetPermissions();
      expect(component.permissions).toEqual({ modules: [], canApproveL1: false, canApproveL2: false, categoryIds: [] });
    });
  });

  describe('category helpers', () => {
    beforeEach(() => {
      component.allCategories.set(mockCategories);
    });

    it('filteredCategories filters by name or cuenta', () => {
      component.categorySearch.set('trans');
      expect(component.filteredCategories.map((c) => c._id)).toEqual(['cat2']);
    });

    it('toggleCategory adds and removes ids', () => {
      component.permissions.categoryIds = [];
      component.toggleCategory('cat1', true);
      expect(component.permissions.categoryIds).toEqual(['cat1']);
      component.toggleCategory('cat1', false);
      expect(component.permissions.categoryIds).toEqual([]);
    });

    it('selectAllCategories/clearAllCategories toggle full selection', () => {
      component.selectAllCategories();
      expect(component.permissions.categoryIds).toEqual(['cat1', 'cat2']);
      component.clearAllCategories();
      expect(component.permissions.categoryIds).toEqual([]);
    });

    it('selectedCategoryCount and totalCategoryCount report sizes', () => {
      component.permissions.categoryIds = ['cat1'];
      expect(component.selectedCategoryCount).toBe(1);
      expect(component.totalCategoryCount).toBe(2);
    });
  });

  describe('createUser', () => {
    beforeEach(() => {
      component.roles = mockRoles;
      component.form.patchValue({ name: 'New User', email: 'new@test.com', roleId: 'r-colab' });
    });

    it('does not call the service when the form is invalid', () => {
      component.form.patchValue({ email: '' });
      component.createUser();
      expect(adminUsersService.createUser).not.toHaveBeenCalled();
    });

    it('submits the form and includes permissions for roles that need them', () => {
      component.permissions = { modules: ['mis-rendiciones'], canApproveL1: false, canApproveL2: false, categoryIds: [] };
      adminUsersService.createUser.and.returnValue(of({ ...({} as IUserResponse), temporaryPassword: 'temp123' } as any));

      component.createUser();

      expect(adminUsersService.createUser).toHaveBeenCalled();
      const payload = adminUsersService.createUser.calls.mostRecent().args[0] as any;
      expect(payload.permissions).toEqual(component.permissions);
      expect(component.temporaryPassword).toBe('temp123');
      expect(component.showPasswordModal).toBeTrue();
    });

    it('adds bankAccount to the payload when bank fields are present', () => {
      component.form.patchValue({ bankName: 'BCP', accountNumber: '123', cci: '456' });
      adminUsersService.createUser.and.returnValue(of({ temporaryPassword: 'x' } as any));

      component.createUser();

      const payload = adminUsersService.createUser.calls.mostRecent().args[0] as any;
      expect(payload.bankAccount).toEqual({ bankName: 'BCP', accountNumber: '123', cci: '456', accountType: undefined });
    });

    it('omits permissions for Superadministrador', () => {
      component.form.patchValue({ roleId: 'r-super' });
      adminUsersService.createUser.and.returnValue(of({ temporaryPassword: 'x' } as any));

      component.createUser();

      const payload = adminUsersService.createUser.calls.mostRecent().args[0] as any;
      expect(payload.permissions).toBeUndefined();
    });
  });

  describe('updateUser', () => {
    beforeEach(() => setup('u1'));

    it('does nothing when the form is invalid', () => {
      component.form.patchValue({ name: '', email: '', roleId: '' });
      component.updateUser();
      expect(adminUsersService.updateUser).not.toHaveBeenCalled();
    });

    it('calls updateUser and shows a success notification', () => {
      component.form.patchValue({ name: 'Updated', email: 'updated@test.com', roleId: 'r-colab' });
      userState.getUser.and.returnValue({ _id: 'other', name: 'Other' } as any);
      adminUsersService.updateUser.and.returnValue(of({ name: 'Updated' } as any));

      component.updateUser();

      expect(adminUsersService.updateUser).toHaveBeenCalledWith('u1', jasmine.any(Object));
      expect(notification.show).toHaveBeenCalledWith('Usuario editado correctamente', 'success');
    });

    it('updates the logged-in user state when the edited user is the current session user', () => {
      component.form.patchValue({ name: 'Updated', email: 'updated@test.com', roleId: 'r-colab' });
      userState.getUser.and.returnValue({ _id: 'u1', name: 'Old Name' } as any);
      adminUsersService.updateUser.and.returnValue(of({ name: 'Updated' } as any));

      component.updateUser();

      expect(userState.setUser).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Updated' }));
    });
  });

  describe('copyPassword and modal helpers', () => {
    it('copies the temporary password to the clipboard and flips passwordCopied', async () => {
      spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
      component.temporaryPassword = 'secret';

      component.copyPassword();
      await Promise.resolve();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret');
      expect(component.passwordCopied).toBeTrue();
    });

    it('closePasswordModal hides the modal and navigates to the users list', () => {
      component.showPasswordModal = true;
      component.closePasswordModal();
      expect(component.showPasswordModal).toBeFalse();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users']);
    });

    it('back navigates to the users list', () => {
      component.back();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users']);
    });
  });

  describe('assignUser', () => {
    it('patches the form fields (including bank account) from a user response', () => {
      const user: IUserResponse = {
        _id: 'u2',
        name: 'Assigned',
        email: 'assigned@test.com',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: mockRoles[0],
        bankAccount: { bankName: 'BBVA', accountNumber: '999', cci: '888', accountType: 'corriente' },
      };
      component.assignUser(user);
      expect(component.form.get('name')?.value).toBe('Assigned');
      expect(component.form.get('bankName')?.value).toBe('BBVA');
      expect(component.form.get('accountType')?.value).toBe('corriente');
    });
  });

  describe('getRoleName', () => {
    it('translates a role id to its ERoles label', () => {
      component.roles = mockRoles;
      expect(component.getRoleName('r-colab')).toBe('Colaborador');
    });
  });
});
