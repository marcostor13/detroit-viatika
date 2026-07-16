import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { httpInterceptor } from './http.interceptor';
import { UserStateService } from '../services/user-state.service';
import { LoaderService } from '../services/loader.service';

function makeToken(exp: number): string {
  const payload = btoa(JSON.stringify({ exp, sub: 'u1' })).replace(/=+$/, '');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
}

describe('httpInterceptor', () => {
  let userState: jasmine.SpyObj<UserStateService>;
  let loaderService: jasmine.SpyObj<LoaderService>;

  const validToken = makeToken(Math.floor(Date.now() / 1000) + 3600);
  const expiredToken = makeToken(Math.floor(Date.now() / 1000) - 3600);

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['getUser', 'getToken', 'clearUser', 'isSuperAdmin']);
    loaderService = jasmine.createSpyObj('LoaderService', ['show', 'hide']);

    TestBed.configureTestingModule({
      providers: [
        { provide: UserStateService, useValue: userState },
        { provide: LoaderService, useValue: loaderService },
      ],
    });
  });

  function run(req: HttpRequest<any>, next: any) {
    return TestBed.runInInjectionContext(() => httpInterceptor(req, next));
  }

  it('calls loaderService.show() on each request', () => {
    userState.getUser.and.returnValue(null);
    userState.getToken.and.returnValue(null);
    const req = new HttpRequest('GET', 'http://api/test');
    run(req, () => of(new HttpResponse({ status: 200 }))).subscribe();
    expect(loaderService.show).toHaveBeenCalled();
  });

  it('calls loaderService.hide() when request completes', () => {
    userState.getUser.and.returnValue(null);
    userState.getToken.and.returnValue(null);
    const req = new HttpRequest('GET', 'http://api/test');
    run(req, () => of(new HttpResponse({ status: 200 }))).subscribe();
    expect(loaderService.hide).toHaveBeenCalled();
  });

  it('adds Authorization header for valid token', (done) => {
    userState.getUser.and.returnValue(null);
    userState.getToken.and.returnValue(validToken);
    const req = new HttpRequest('GET', 'http://api/test');
    run(req, (r: HttpRequest<any>) => {
      expect(r.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
      done();
      return of(new HttpResponse({ status: 200 }));
    }).subscribe();
  });

  it('does not add Authorization header when no token', (done) => {
    userState.getUser.and.returnValue(null);
    userState.getToken.and.returnValue(null);
    const req = new HttpRequest('GET', 'http://api/test');
    run(req, (r: HttpRequest<any>) => {
      expect(r.headers.get('Authorization')).toBeNull();
      done();
      return of(new HttpResponse({ status: 200 }));
    }).subscribe();
  });

  it('clears user and omits Authorization when token is expired', (done) => {
    userState.getUser.and.returnValue({ access_token: expiredToken } as any);
    userState.getToken.and.returnValue(expiredToken);
    const req = new HttpRequest('GET', 'http://api/test');
    run(req, (r: HttpRequest<any>) => {
      expect(r.headers.get('Authorization')).toBeNull();
      done();
      return of(new HttpResponse({ status: 200 }));
    }).subscribe();
    expect(userState.clearUser).toHaveBeenCalled();
  });

  it('sets Content-Type application/json for non-FormData POST', (done) => {
    userState.getUser.and.returnValue({ access_token: validToken, companyId: 'c1' } as any);
    userState.getToken.and.returnValue(validToken);
    userState.isSuperAdmin.and.returnValue(false);
    const req = new HttpRequest('POST', 'http://api/auth/login', { email: 'a@b.com' });
    run(req, (r: HttpRequest<any>) => {
      expect(r.headers.get('Content-Type')).toBe('application/json');
      done();
      return of(new HttpResponse({ status: 200 }));
    }).subscribe();
  });

  it('does not set Content-Type for FormData POST', (done) => {
    userState.getUser.and.returnValue({ access_token: validToken, companyId: 'c1' } as any);
    userState.getToken.and.returnValue(validToken);
    userState.isSuperAdmin.and.returnValue(false);
    const formData = new FormData();
    const req = new HttpRequest('POST', 'http://api/upload', formData);
    run(req, (r: HttpRequest<any>) => {
      expect(r.headers.get('Content-Type')).toBeNull();
      done();
      return of(new HttpResponse({ status: 200 }));
    }).subscribe();
  });

  it('appends companyId to a plain GET request', (done) => {
    userState.getUser.and.returnValue({ access_token: validToken, companyId: 'c1' } as any);
    userState.getToken.and.returnValue(validToken);
    userState.isSuperAdmin.and.returnValue(false);
    const req = new HttpRequest('GET', 'http://api/project');
    run(req, (r: HttpRequest<any>) => {
      expect(r.url).toBe('http://api/project/c1');
      done();
      return of(new HttpResponse({ status: 200 }));
    }).subscribe();
  });

  it('does NOT append companyId to /project/me/am-i-approver (skipCompanyIdEndpoints)', (done) => {
    userState.getUser.and.returnValue({ access_token: validToken, companyId: 'c1' } as any);
    userState.getToken.and.returnValue(validToken);
    userState.isSuperAdmin.and.returnValue(false);
    const req = new HttpRequest('GET', 'http://api/project/me/am-i-approver');
    run(req, (r: HttpRequest<any>) => {
      expect(r.url).toBe('http://api/project/me/am-i-approver');
      done();
      return of(new HttpResponse({ status: 200 }));
    }).subscribe();
  });
});
