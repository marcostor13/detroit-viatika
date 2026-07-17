import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { UserDetailsComponent } from './user-details.component';
import { AdminUsersService } from '../services/admin-users.service';
import { NotificationService } from '../../../services/notification.service';
import { IUserResponse } from '../../../interfaces/user.interface';

describe('UserDetailsComponent', () => {
  let component: UserDetailsComponent;
  let adminUsersService: jasmine.SpyObj<AdminUsersService>;
  let notification: jasmine.SpyObj<NotificationService>;
  let router: jasmine.SpyObj<Router>;

  const mockUser: IUserResponse = {
    _id: 'u1',
    name: 'John Doe',
    email: 'john@test.com',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: { _id: 'r1', name: 'Colaborador', active: true, createdAt: new Date(), updatedAt: new Date() },
    emailNotificationsEnabled: false,
  };

  function setup(id: string | null = 'u1') {
    TestBed.resetTestingModule();
    adminUsersService = jasmine.createSpyObj('AdminUsersService', ['getUser', 'toggleEmailNotifications']);
    notification = jasmine.createSpyObj('NotificationService', ['show']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    adminUsersService.getUser.and.returnValue(of(mockUser));

    TestBed.configureTestingModule({
      imports: [UserDetailsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id } } } },
        { provide: Router, useValue: router },
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: NotificationService, useValue: notification },
      ],
    });

    component = TestBed.createComponent(UserDetailsComponent).componentInstance;
  }

  beforeEach(() => setup());

  it('should create and read the id from the route', () => {
    expect(component).toBeTruthy();
    expect(component.id).toBe('u1');
  });

  describe('ngOnInit', () => {
    it('loads user data when id is present', () => {
      component.ngOnInit();
      expect(adminUsersService.getUser).toHaveBeenCalledWith('u1');
      expect(component.user).toEqual(mockUser);
    });

    it('does not call getUserData when id is absent', () => {
      setup(null);
      component.ngOnInit();
      expect(adminUsersService.getUser).not.toHaveBeenCalled();
    });
  });

  describe('getUserData', () => {
    it('maps a known role name via ERoles', () => {
      component.getUserData();
      expect(component.user).toEqual(mockUser);
      expect(component.roleName).toBe('Colaborador');
    });

    it('falls back to the raw role name when not present in ERoles', () => {
      adminUsersService.getUser.and.returnValue(
        of({ ...mockUser, role: { ...mockUser.role, name: 'CustomRole' } })
      );
      component.getUserData();
      expect(component.roleName).toBe('CustomRole');
    });

    it('sets "Sin Rol" when the user has no role name', () => {
      adminUsersService.getUser.and.returnValue(
        of({ ...mockUser, role: { ...mockUser.role, name: '' } })
      );
      component.getUserData();
      expect(component.roleName).toBe('Sin Rol');
    });

    it('shows an error notification on failure', () => {
      adminUsersService.getUser.and.returnValue(throwError(() => new Error('fail')));
      component.getUserData();
      expect(notification.show).toHaveBeenCalledWith('Error al cargar el usuario', 'error');
    });
  });

  describe('navigation helpers', () => {
    it('goBack navigates to the users list', () => {
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users']);
    });

    it('goToPermisos navigates to the permissions screen for this user', () => {
      component.goToPermisos();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users/u1/permisos']);
    });

    it('goToRendiciones navigates to rendiciones filtered by userId', () => {
      component.goToRendiciones();
      expect(router.navigate).toHaveBeenCalledWith(['/rendiciones'], { queryParams: { userId: 'u1' } });
    });

    it('goToEdit navigates to the edit-user screen', () => {
      component.goToEdit();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users/create-user/u1']);
    });
  });

  describe('toggleNotifications', () => {
    beforeEach(() => {
      component.user = { ...mockUser, emailNotificationsEnabled: false };
    });

    it('does nothing when there is no user loaded', () => {
      component.user = null;
      component.toggleNotifications();
      expect(adminUsersService.toggleEmailNotifications).not.toHaveBeenCalled();
    });

    it('flips the flag, calls the service with the new value, and shows a success message', () => {
      adminUsersService.toggleEmailNotifications.and.returnValue(of({ emailNotificationsEnabled: true }));

      component.toggleNotifications();

      expect(adminUsersService.toggleEmailNotifications).toHaveBeenCalledWith('u1', true);
      expect(component.user?.emailNotificationsEnabled).toBeTrue();
      expect(component.isTogglingNotifications()).toBeFalse();
      expect(notification.show).toHaveBeenCalledWith('Notificaciones activadas', 'success');
    });

    it('shows the "desactivadas" message when turning notifications off', () => {
      component.user = { ...mockUser, emailNotificationsEnabled: true };
      adminUsersService.toggleEmailNotifications.and.returnValue(of({ emailNotificationsEnabled: false }));

      component.toggleNotifications();

      expect(adminUsersService.toggleEmailNotifications).toHaveBeenCalledWith('u1', false);
      expect(notification.show).toHaveBeenCalledWith('Notificaciones desactivadas', 'success');
    });

    it('shows an error notification and resets the loading flag on failure', () => {
      adminUsersService.toggleEmailNotifications.and.returnValue(throwError(() => new Error('fail')));

      component.toggleNotifications();

      expect(notification.show).toHaveBeenCalledWith('Error al actualizar las notificaciones', 'error');
      expect(component.isTogglingNotifications()).toBeFalse();
    });
  });
});
