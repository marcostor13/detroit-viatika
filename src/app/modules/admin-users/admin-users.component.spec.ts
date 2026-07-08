import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import AdminUsersComponent from './admin-users.component';
import { AdminUsersService } from './services/admin-users.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { UserStateService } from '../../services/user-state.service';
import { IUserResponse } from '../../interfaces/user.interface';
import { IPaginatedResult } from '../../interfaces/paginated-result.interface';

describe('AdminUsersComponent', () => {
  let component: AdminUsersComponent;
  let adminUsersService: jasmine.SpyObj<AdminUsersService>;
  let notification: jasmine.SpyObj<NotificationService>;
  let confirmationService: jasmine.SpyObj<ConfirmationService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  const mockUsers: IUserResponse[] = [
    {
      _id: 'u1', name: 'Alice', email: 'alice@test.com', isActive: true,
      createdAt: new Date(), updatedAt: new Date(),
      role: { _id: 'r1', name: 'Colaborador', active: true, createdAt: new Date(), updatedAt: new Date() },
    },
    {
      _id: 'u2', name: 'Bob', email: 'bob@test.com', isActive: false,
      createdAt: new Date(), updatedAt: new Date(),
      role: { _id: 'r2', name: 'Administrador', active: true, createdAt: new Date(), updatedAt: new Date() },
    },
  ];

  const mockResult: IPaginatedResult<IUserResponse> = { data: mockUsers, total: 2, page: 1, pages: 1, limit: 20 };

  beforeEach(() => {
    adminUsersService = jasmine.createSpyObj('AdminUsersService', [
      'getUsersPaginated', 'deleteUser', 'updateUser', 'resetPassword',
    ]);
    notification = jasmine.createSpyObj('NotificationService', ['show']);
    confirmationService = jasmine.createSpyObj('ConfirmationService', ['show']);
    userState = jasmine.createSpyObj('UserStateService', ['isSuperAdmin', 'getUser']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    userState.isSuperAdmin.and.returnValue(false);
    userState.getUser.and.returnValue({ _id: 'logged-in' } as any);
    adminUsersService.getUsersPaginated.and.returnValue(of(mockResult));

    TestBed.configureTestingModule({
      imports: [AdminUsersComponent],
      providers: [
        { provide: Router, useValue: router },
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: NotificationService, useValue: notification },
        { provide: ConfirmationService, useValue: confirmationService },
        { provide: UserStateService, useValue: userState },
      ],
    });

    component = TestBed.createComponent(AdminUsersComponent).componentInstance;
  });

  it('creates and loads users on init', () => {
    component.ngOnInit();
    expect(adminUsersService.getUsersPaginated).toHaveBeenCalled();
    expect(component.result().data.length).toBe(2);
  });

  describe('loadUsers', () => {
    it('maps role names to their ERoles label', () => {
      component.loadUsers();
      expect(component.result().data[0].roleName).toBe('Colaborador');
    });

    it('shows an error notification on failure', () => {
      adminUsersService.getUsersPaginated.and.returnValue(throwError(() => new Error('fail')));
      component.loadUsers();
      expect(notification.show).toHaveBeenCalledWith('Error al cargar usuarios', 'error');
    });
  });

  describe('filters', () => {
    it('applyFilters resets to page 1 and reloads', () => {
      component.page.set(3);
      component.applyFilters();
      expect(component.page()).toBe(1);
      expect(adminUsersService.getUsersPaginated).toHaveBeenCalled();
    });

    it('clearFilters resets all filter fields and reloads from page 1', () => {
      component.searchText = 'x';
      component.filterRole = 'Administrador';
      component.filterStatus = 'active';
      component.page.set(2);

      component.clearFilters();

      expect(component.searchText).toBe('');
      expect(component.filterRole).toBe('');
      expect(component.filterStatus).toBe('');
      expect(component.page()).toBe(1);
    });

    it('hasActiveFilters reflects whether any filter is set', () => {
      expect(component.hasActiveFilters).toBeFalse();
      component.searchText = 'x';
      expect(component.hasActiveFilters).toBeTrue();
    });

    it('onPageChange and onLimitChange update signals and reload', () => {
      component.onPageChange(2);
      expect(component.page()).toBe(2);

      component.onLimitChange(50);
      expect(component.limit()).toBe(50);
      expect(component.page()).toBe(1);
    });
  });

  describe('deleteUser', () => {
    it('blocks deleting your own account', () => {
      component.deleteUser('logged-in');
      expect(notification.show).toHaveBeenCalledWith('No puedes eliminar tu propio usuario', 'error');
      expect(confirmationService.show).not.toHaveBeenCalled();
    });

    it('confirms and deletes another user, then reloads', () => {
      confirmationService.show.and.callFake((_msg: string, cb: () => void) => cb());
      adminUsersService.deleteUser.and.returnValue(of(undefined));

      component.deleteUser('u2');

      expect(adminUsersService.deleteUser).toHaveBeenCalledWith('u2');
      expect(notification.show).toHaveBeenCalledWith('Usuario eliminado correctamente', 'success');
    });

    it('shows an error notification when deletion fails', () => {
      confirmationService.show.and.callFake((_msg: string, cb: () => void) => cb());
      adminUsersService.deleteUser.and.returnValue(throwError(() => new Error('fail')));

      component.deleteUser('u2');

      expect(notification.show).toHaveBeenCalledWith('Error al eliminar el usuario', 'error');
    });
  });

  describe('clickOptionsEvent', () => {
    beforeEach(() => component.loadUsers());

    it('navigates to details on "view"', () => {
      component.clickOptionsEvent({ option: 'view', _id: 'u1' });
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users/u1/details']);
    });

    it('navigates to edit on "edit"', () => {
      component.clickOptionsEvent({ option: 'edit', _id: 'u1' });
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users/create-user/u1']);
    });

    it('deletes on "delete"', () => {
      spyOn(component, 'deleteUser');
      component.clickOptionsEvent({ option: 'delete', _id: 'u1' });
      expect(component.deleteUser).toHaveBeenCalledWith('u1');
    });

    it('toggles active state on "activate"', () => {
      spyOn(component, 'toggleUserActive');
      component.clickOptionsEvent({ option: 'activate', _id: 'u1' });
      expect(component.toggleUserActive).toHaveBeenCalledWith('u1');
    });
  });

  describe('toggleUserActive', () => {
    beforeEach(() => component.loadUsers());

    it('does nothing when the user is not found', () => {
      component.toggleUserActive('missing');
      expect(adminUsersService.updateUser).not.toHaveBeenCalled();
    });

    it('flips isActive and shows the activation message', () => {
      adminUsersService.updateUser.and.returnValue(of({} as any));
      component.toggleUserActive('u1');
      expect(adminUsersService.updateUser).toHaveBeenCalledWith('u1', { isActive: false });
      expect(notification.show).toHaveBeenCalledWith('Usuario desactivado correctamente', 'success');
    });

    it('shows the activation message when reactivating an inactive user', () => {
      adminUsersService.updateUser.and.returnValue(of({} as any));
      component.toggleUserActive('u2');
      expect(adminUsersService.updateUser).toHaveBeenCalledWith('u2', { isActive: true });
      expect(notification.show).toHaveBeenCalledWith('Usuario activado correctamente', 'success');
    });

    it('shows an error notification on failure', () => {
      adminUsersService.updateUser.and.returnValue(throwError(() => new Error('fail')));
      component.toggleUserActive('u1');
      expect(notification.show).toHaveBeenCalledWith('Error al actualizar el estado del usuario', 'error');
    });
  });

  describe('navigation helpers', () => {
    it('redirectToCreateUser navigates without id for creation', () => {
      component.redirectToCreateUser();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users/create-user']);
    });

    it('redirectToCreateUser navigates with id for editing', () => {
      component.redirectToCreateUser('u1');
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users/create-user/u1']);
    });

    it('navigateToBulkImport navigates to the bulk import screen', () => {
      component.navigateToBulkImport();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users/bulk-import']);
    });
  });

  describe('resetPassword', () => {
    it('confirms and shows the temporary password modal on success', () => {
      confirmationService.show.and.callFake((_msg: string, cb: () => void) => cb());
      adminUsersService.resetPassword.and.returnValue(of({ temporaryPassword: 'tmp123' }));

      component.resetPassword('u1');

      expect(component.resetPasswordTemp).toBe('tmp123');
      expect(component.showResetPasswordModal).toBeTrue();
    });

    it('shows an error notification on failure', () => {
      confirmationService.show.and.callFake((_msg: string, cb: () => void) => cb());
      adminUsersService.resetPassword.and.returnValue(throwError(() => new Error('fail')));

      component.resetPassword('u1');

      expect(notification.show).toHaveBeenCalledWith('Error al resetear la contrasena', 'error');
    });
  });

  describe('closeResetPasswordModal', () => {
    it('hides the modal', () => {
      component.showResetPasswordModal = true;
      component.closeResetPasswordModal();
      expect(component.showResetPasswordModal).toBeFalse();
    });
  });

  describe('getInitials', () => {
    it('returns "U" for an empty name', () => {
      expect(component.getInitials('')).toBe('U');
    });

    it('returns up to two uppercase initials', () => {
      expect(component.getInitials('john doe')).toBe('JD');
      expect(component.getInitials('cher')).toBe('C');
    });
  });

  describe('getRoleLabel', () => {
    it('translates a known role name via ERoles', () => {
      expect(component.getRoleLabel('Colaborador')).toBe('Colaborador');
    });

    it('falls back to the raw value for unknown roles', () => {
      expect(component.getRoleLabel('Unknown')).toBe('Unknown');
    });
  });
});
