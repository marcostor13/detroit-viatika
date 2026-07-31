import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthTesoreroGuard } from './auth-tesorero.guard';
import { UserStateService } from '../services/user-state.service';

describe('AuthTesoreroGuard', () => {
  let guard: AuthTesoreroGuard;
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['isAuthenticated', 'canAccessTesoreria', 'getRole']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        AuthTesoreroGuard,
        { provide: UserStateService, useValue: userState },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(AuthTesoreroGuard);
  });

  it('returns false and navigates to /login when not authenticated', () => {
    userState.isAuthenticated.and.returnValue(false);
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('returns true when can access tesoreria', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.canAccessTesoreria.and.returnValue(true);
    expect(guard.canActivate()).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('redirects Colaborador to /inicio when no tesoreria access', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.canAccessTesoreria.and.returnValue(false);
    userState.getRole.and.returnValue('Colaborador');
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/inicio']);
  });

  it('redirects Administrador to /admin-users when no tesoreria access', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.canAccessTesoreria.and.returnValue(false);
    userState.getRole.and.returnValue('Administrador');
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/admin-users']);
  });

  it('redirects other roles to /login when no tesoreria access', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.canAccessTesoreria.and.returnValue(false);
    userState.getRole.and.returnValue('Otro');
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
