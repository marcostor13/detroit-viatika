import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpRequest, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { throwError, of } from 'rxjs';
import { errorInterceptor } from './error.interceptor';
import { UserStateService } from '../services/user-state.service';
import { Router } from '@angular/router';
import { NotificationService } from '../services/notification.service';

describe('errorInterceptor', () => {
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;
  let notificationService: jasmine.SpyObj<NotificationService>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['clearUser']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    notificationService = jasmine.createSpyObj('NotificationService', ['show']);

    TestBed.configureTestingModule({
      providers: [
        { provide: UserStateService, useValue: userState },
        { provide: Router, useValue: router },
        { provide: NotificationService, useValue: notificationService },
      ],
    });
  });

  function run(req: HttpRequest<any>, next: any) {
    return TestBed.runInInjectionContext(() => errorInterceptor(req, next));
  }

  it('passes through successful responses unchanged', (done) => {
    const req = new HttpRequest('GET', '/api/test');
    const next = () => of(new HttpResponse({ status: 200, body: { ok: true } }));
    run(req, next).subscribe({
      next: (res: any) => { expect(res.body.ok).toBeTrue(); done(); },
    });
  });

  it('clears user and navigates to /login on 401', fakeAsync(() => {
    const req = new HttpRequest('GET', '/api/test');
    const error = new HttpErrorResponse({ status: 401 });
    const next = () => throwError(() => error);
    run(req, next).subscribe({ error: () => {} });
    expect(userState.clearUser).toHaveBeenCalled();
    expect(notificationService.show).toHaveBeenCalledWith(
      'Su sesión ha expirado, vuelva a iniciar sesión', 'warning'
    );
    tick(200);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  }));

  it('shows error notification with backend message on non-401 error', () => {
    const req = new HttpRequest('GET', '/api/test');
    const error = new HttpErrorResponse({ status: 500, error: { message: 'Server error' } });
    const next = () => throwError(() => error);
    run(req, next).subscribe({ error: () => {} });
    expect(notificationService.show).toHaveBeenCalledWith('Server error', 'error');
  });

  it('uses fallback message when error.error.message is absent', () => {
    const req = new HttpRequest('GET', '/api/test');
    const error = new HttpErrorResponse({ status: 422 });
    const next = () => throwError(() => error);
    run(req, next).subscribe({ error: () => {} });
    expect(notificationService.show).toHaveBeenCalledWith(jasmine.any(String), 'error');
  });

  it('rethrows error after handling', (done) => {
    const req = new HttpRequest('GET', '/api/test');
    const error = new HttpErrorResponse({ status: 400, error: { message: 'Bad' } });
    const next = () => throwError(() => error);
    run(req, next).subscribe({
      error: (e) => { expect(e).toBe(error); done(); },
    });
  });
});
