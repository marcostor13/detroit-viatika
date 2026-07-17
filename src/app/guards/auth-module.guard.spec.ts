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
      'isColaborador', 'isAdmin', 'isContabilidad', 'refreshApproverStatus',
    ]);
    userState.refreshApproverStatus.and.returnValue(of(false));
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

  it('redirects colaborador to /inicio when no permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isColaborador.and.returnValue(true);
    run('tesoreria').subscribe((result: any) => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/inicio']);
    });
  });

  it('redirects admin to /admin-users when no permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isColaborador.and.returnValue(false);
    userState.isAdmin.and.returnValue(true);
    run('tesoreria').subscribe(() => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/admin-users']);
    });
  });

  it('redirects contabilidad to /tesoreria when no permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isColaborador.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(true);
    run('tesoreria').subscribe(() => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/tesoreria']);
    });
  });

  it('allows an approver into /rendiciones without the module permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.refreshApproverStatus.and.returnValue(of(true));
    run('rendiciones').subscribe((result: any) => {
      expect(result).toBeTrue();
    });
  });

  it('redirects an approver to /rendiciones when no permission for another module', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isColaborador.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
    userState.refreshApproverStatus.and.returnValue(of(true));
    run('tesoreria').subscribe(() => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/rendiciones']);
    });
  });

  it('redirects to /clients-admin as fallback', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isColaborador.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
    userState.refreshApproverStatus.and.returnValue(of(false));
    run('tesoreria').subscribe(() => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/clients-admin']);
    });
  });
});
