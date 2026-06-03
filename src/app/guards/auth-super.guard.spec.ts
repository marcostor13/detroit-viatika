import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthSuperGuard } from './auth-super.guard';
import { UserStateService } from '../services/user-state.service';

describe('AuthSuperGuard', () => {
  let guard: AuthSuperGuard;
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['isAuthenticated', 'isSuperAdmin', 'isAdmin', 'isContabilidad']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        AuthSuperGuard,
        { provide: UserStateService, useValue: userState },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(AuthSuperGuard);
  });

  it('returns false and navigates to /login when not authenticated', () => {
    userState.isAuthenticated.and.returnValue(false);
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('returns true when authenticated as superadmin', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(true);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
    expect(guard.canActivate()).toBeTrue();
  });

  it('returns true when authenticated as admin', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isAdmin.and.returnValue(true);
    userState.isContabilidad.and.returnValue(false);
    expect(guard.canActivate()).toBeTrue();
  });

  it('returns true when authenticated as contabilidad', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(true);
    expect(guard.canActivate()).toBeTrue();
  });

  it('returns false for other roles and navigates to /login', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
