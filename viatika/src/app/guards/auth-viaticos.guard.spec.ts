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
      'isAuthenticated', 'isSuperAdmin', 'canApproveL1', 'hasModulePermission', 'defaultRoute',
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

  it('redirects to defaultRoute() when there is no viaticos access', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.canApproveL1.and.returnValue(false);
    userState.hasModulePermission.and.returnValue(false);
    userState.defaultRoute.and.returnValue('/mis-rendiciones');
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones']);
  });

  it('uses the landing page resolved from the modules, not the role', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.canApproveL1.and.returnValue(false);
    userState.hasModulePermission.and.returnValue(false);
    userState.defaultRoute.and.returnValue('/rendiciones');
    guard.canActivate();
    expect(router.navigate).toHaveBeenCalledWith(['/rendiciones']);
  });
});
