import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { defaultRedirectGuard } from './default-redirect.guard';
import { UserStateService } from '../services/user-state.service';

describe('defaultRedirectGuard', () => {
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', [
      'isAuthenticated', 'isColaborador', 'isSuperAdmin',
      'isAdmin', 'isAdminInCompany', 'isContabilidad', 'isContabilidadInCompany',
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

  function run(): any {
    return TestBed.runInInjectionContext(() => defaultRedirectGuard({} as any, {} as any));
  }

  it('redirects to /login when not authenticated', () => {
    userState.isAuthenticated.and.returnValue(false);
    run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });

  it('redirects colaborador to /inicio', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isColaborador.and.returnValue(true);
    run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/inicio']);
  });

  it('redirects superadmin to /clients-admin', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isColaborador.and.returnValue(false);
    userState.isSuperAdmin.and.returnValue(true);
    run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/clients-admin']);
  });

  it('redirects admin in company to /admin-users', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isColaborador.and.returnValue(false);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isAdmin.and.returnValue(true);
    userState.isAdminInCompany.and.returnValue(true);
    run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/admin-users']);
  });

  it('redirects admin not in company to /hub', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isColaborador.and.returnValue(false);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isAdmin.and.returnValue(true);
    userState.isAdminInCompany.and.returnValue(false);
    run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/hub']);
  });

  it('redirects contabilidad in company to /dashboard', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isColaborador.and.returnValue(false);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(true);
    userState.isContabilidadInCompany.and.returnValue(true);
    run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });

  it('redirects contabilidad not in company to /hub', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isColaborador.and.returnValue(false);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(true);
    userState.isContabilidadInCompany.and.returnValue(false);
    run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/hub']);
  });

  it('redirects coordinador (and other roles) to /inicio by default', () => {
    userState.isAuthenticated.and.returnValue(true);
    userState.isColaborador.and.returnValue(false);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
    run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/inicio']);
  });
});
