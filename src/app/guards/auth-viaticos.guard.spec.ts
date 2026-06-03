import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthViaticosGuard } from './auth-viaticos.guard';
import { UserStateService } from '../services/user-state.service';

describe('AuthViaticosGuard', () => {
  let guard: AuthViaticosGuard;
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', [
      'isAuthenticated', 'isSuperAdmin', 'canApproveL1', 'hasModulePermission', 'getRole',
    ]);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        AuthViaticosGuard,
        { provide: UserStateService, useValue: userState },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(AuthViaticosGuard);
  });

  it('returns false and navigates to /login when not authenticated', () => {
    userState.isAuthenticated.and.returnValue(false);
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('returns true when superadmin', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(true);
    userState.canApproveL1.and.returnValue(false);
    userState.hasModulePermission.and.returnValue(false);
    expect(guard.canActivate()).toBeTrue();
  });

  it('returns true when canApproveL1', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.canApproveL1.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    expect(guard.canActivate()).toBeTrue();
  });

  it('returns true when has viaticos module permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.canApproveL1.and.returnValue(false);
    userState.hasModulePermission.and.returnValue(true);
    expect(guard.canActivate()).toBeTrue();
  });

  it('redirects Colaborador without permission to /mis-rendiciones', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.canApproveL1.and.returnValue(false);
    userState.hasModulePermission.and.returnValue(false);
    userState.getRole.and.returnValue('Colaborador');
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones']);
  });

  it('redirects Administrador without permission to /admin-users', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.canApproveL1.and.returnValue(false);
    userState.hasModulePermission.and.returnValue(false);
    userState.getRole.and.returnValue('Administrador');
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/admin-users']);
  });

  it('redirects other roles to /login when no permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.canApproveL1.and.returnValue(false);
    userState.hasModulePermission.and.returnValue(false);
    userState.getRole.and.returnValue('OtroRol');
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
