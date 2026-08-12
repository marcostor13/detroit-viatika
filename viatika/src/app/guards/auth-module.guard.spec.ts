import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { authModuleGuard } from './auth-module.guard';
import { UserStateService } from '../services/user-state.service';

describe('authModuleGuard', () => {
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', [
      'isAuthenticated', 'hasModulePermission',
      'isTesoreria', 'refreshApproverStatus', 'defaultRoute',
    ]);
    userState.isTesoreria.and.returnValue(false);
    userState.refreshApproverStatus.and.returnValue(of(false));
    userState.defaultRoute.and.returnValue('/inicio');
    router = jasmine.createSpyObj('Router', ['createUrlTree']);
    router.createUrlTree.and.callFake((commands: string[]) => ({ commands } as any));

    TestBed.configureTestingModule({
      providers: [
        { provide: UserStateService, useValue: userState },
        { provide: Router, useValue: router },
      ],
    });
  });

  function run(module: string): any {
    return TestBed.runInInjectionContext(() => authModuleGuard(module)({} as any, {} as any));
  }

  it('redirects to /login when not authenticated', () => {
    userState.isAuthenticated.and.returnValue(false);
    run('tesoreria');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('returns true when user has module permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(true);
    expect(run('tesoreria')).toBeTrue();
  });

  it('allows tesoreria into /rendiciones without the module permission (VD-66)', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isTesoreria.and.returnValue(true);
    expect(run('rendiciones')).toBeTrue();
  });

  it('allows an approver into /rendiciones without the module permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.refreshApproverStatus.and.returnValue(of(true));
    run('rendiciones').subscribe((result: any) => {
      expect(result).toBeTrue();
    });
  });

  it('redirects to defaultRoute() when the module is not granted', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.defaultRoute.and.returnValue('/mis-rendiciones');
    run('tesoreria').subscribe(() => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/mis-rendiciones']);
    });
  });

  it('does NOT let tesoreria into other modules via the rendiciones shortcut', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isTesoreria.and.returnValue(true);
    userState.defaultRoute.and.returnValue('/rendiciones');
    run('tesoreria').subscribe(() => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/rendiciones']);
    });
  });
});
