import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserStateService } from './user-state.service';
import { environment } from '../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['clearUser', 'getToken']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: UserStateService, useValue: userState },
        { provide: Router, useValue: router },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('login sends POST to /auth/login with credentials', () => {
    service.login('a@b.com', 'pass').subscribe();
    const req = httpMock.expectOne(`${environment.api}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'a@b.com', password: 'pass' });
    req.flush({ access_token: 'token' });
  });

  it('selectClient sends POST to /auth/select-client', () => {
    const body = { clientId: 'c1', email: 'a@b.com', password: 'pass' };
    service.selectClient(body).subscribe();
    const req = httpMock.expectOne(`${environment.api}/auth/select-client`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('getHubCompanies sends GET to /auth/companies with Authorization header', () => {
    userState.getToken.and.returnValue('hub-token');
    service.getHubCompanies().subscribe();
    const req = httpMock.expectOne(`${environment.api}/auth/companies`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer hub-token');
    req.flush([]);
  });

  it('logout clears user state and navigates to /login', () => {
    service.logout();
    expect(userState.clearUser).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('getToken returns value from localStorage', () => {
    spyOn(localStorage, 'getItem').and.returnValue('stored-token');
    expect(service.getToken()).toBe('stored-token');
    expect(localStorage.getItem).toHaveBeenCalledWith('token');
  });
});
