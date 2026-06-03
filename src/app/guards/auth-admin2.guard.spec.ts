import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthAdmin2Guard } from './auth-admin2.guard';
import { UserStateService } from '../services/user-state.service';

describe('AuthAdmin2Guard', () => {
  let guard: AuthAdmin2Guard;
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['isAuthenticated', 'isAdmin', 'isContabilidad']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        AuthAdmin2Guard,
        { provide: UserStateService, useValue: userState },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(AuthAdmin2Guard);
  });

  it('returns false and navigates to /login when not authenticated', () => {
    userState.isAuthenticated.and.returnValue(false);
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('returns false and navigates to /inicio when authenticated but not admin or contabilidad', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
    expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/inicio']);
  });

  it('returns true when authenticated and admin', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isAdmin.and.returnValue(true);
    userState.isContabilidad.and.returnValue(false);
    expect(guard.canActivate()).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('returns true when authenticated as contabilidad', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(true);
    expect(guard.canActivate()).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
