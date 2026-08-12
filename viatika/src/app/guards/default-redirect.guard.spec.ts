import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { defaultRedirectGuard } from './default-redirect.guard';
import { UserStateService } from '../services/user-state.service';

describe('defaultRedirectGuard', () => {
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['defaultRoute']);
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

  it('redirects to the route resolved from the assigned modules', () => {
    userState.defaultRoute.and.returnValue('/rendiciones');
    run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/rendiciones']);
  });

  it('redirects to /login when defaultRoute() says so', () => {
    userState.defaultRoute.and.returnValue('/login');
    run();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
