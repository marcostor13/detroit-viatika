import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authModuleGuard } from './auth-module.guard';
import { UserStateService } from '../services/user-state.service';

describe('authModuleGuard', () => {
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', [
      'isAuthenticated', 'hasModulePermission',
      'isColaborador', 'isAdmin', 'isContabilidad', 'isCoordinador',
    ]);
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
    run('tesoreria');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/inicio']);
  });

  it('redirects admin to /admin-users when no permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isColaborador.and.returnValue(false);
    userState.isAdmin.and.returnValue(true);
    run('tesoreria');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/admin-users']);
  });

  it('redirects contabilidad to /tesoreria when no permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isColaborador.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(true);
    run('tesoreria');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/tesoreria']);
  });

  it('redirects coordinador to /viaticos when no permission', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isColaborador.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
    userState.isCoordinador.and.returnValue(true);
    run('tesoreria');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/viaticos']);
  });

  it('redirects to /clients-admin as fallback', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.isColaborador.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
    userState.isCoordinador.and.returnValue(false);
    run('tesoreria');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/clients-admin']);
  });
});
