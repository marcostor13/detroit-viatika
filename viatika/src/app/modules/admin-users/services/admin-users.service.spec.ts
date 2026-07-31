import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminUsersService } from './admin-users.service';
import { UserStateService } from '../../../services/user-state.service';
import { environment } from '../../../../environments/environment';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let httpMock: HttpTestingController;
  let userState: jasmine.SpyObj<UserStateService>;

  const API = `${environment.api}/user`;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['getToken', 'getUser', 'isSuperAdmin']);
    userState.getToken.and.returnValue('mock-token');
    userState.getUser.and.returnValue({ companyId: 'c1' } as any);
    userState.isSuperAdmin.and.returnValue(false);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AdminUsersService,
        { provide: UserStateService, useValue: userState },
      ],
    });
    service = TestBed.inject(AdminUsersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getUser sends GET with Authorization header', () => {
    service.getUser('u1').subscribe();
    const req = httpMock.expectOne(`${API}/details/u1`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer mock-token');
    req.flush({});
  });

  it('getUsers sends GET to client endpoint', () => {
    service.getUsers().subscribe();
    const req = httpMock.expectOne(`${API}/client/c1`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getUsersPaginated sends page and limit params', () => {
    service.getUsersPaginated({ page: 2, limit: 5 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${API}/client/c1`);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('5');
    req.flush({ data: [], total: 0 });
  });

  it('getUsersPaginated includes search param when provided', () => {
    service.getUsersPaginated({ search: 'john' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${API}/client/c1`);
    expect(req.request.params.get('search')).toBe('john');
    req.flush({ data: [], total: 0 });
  });

  it('createUser sends POST with clientId set from companyId', () => {
    service.createUser({ name: 'New', companyId: 'c1' } as any).subscribe();
    const req = httpMock.expectOne(API);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.clientId).toBe('c1');
    req.flush({});
  });

  it('updateUser sends PATCH by id', () => {
    service.updateUser('u1', { name: 'Updated' }).subscribe();
    const req = httpMock.expectOne(`${API}/u1`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('updatePermissions sends PATCH to /permissions endpoint', () => {
    service.updatePermissions('u1', { modules: ['tesoreria'], canApproveL1: false, canApproveL2: false }).subscribe();
    const req = httpMock.expectOne(`${API}/u1/permissions`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('deleteUser sends DELETE by id', () => {
    service.deleteUser('u1').subscribe();
    const req = httpMock.expectOne(`${API}/u1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('resetPassword sends POST to /reset-password', () => {
    service.resetPassword('u1').subscribe();
    const req = httpMock.expectOne(`${API}/u1/reset-password`);
    expect(req.request.method).toBe('POST');
    req.flush({ temporaryPassword: 'tmp123' });
  });

  it('bulkImportUsers sends POST with FormData', () => {
    const fd = new FormData();
    service.bulkImportUsers(fd).subscribe();
    const req = httpMock.expectOne(`${API}/bulk-import`);
    expect(req.request.method).toBe('POST');
    req.flush({ created: 1, skipped: [], errors: [] });
  });

  it('downloadUserTemplate sends GET to bulk-import/template', () => {
    service.downloadUserTemplate().subscribe();
    const req = httpMock.expectOne(`${API}/bulk-import/template`);
    expect(req.request.method).toBe('GET');
    req.flush({ file: 'base64data', filename: 'template.xlsx' });
  });

  it('getRoles sends GET to /role/for-admin when not superadmin', () => {
    userState.isSuperAdmin.and.returnValue(false);
    service.getRoles().subscribe();
    const req = httpMock.expectOne(`${environment.api}/role/for-admin`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getRoles sends GET to /role when superadmin', () => {
    userState.isSuperAdmin.and.returnValue(true);
    service.getRoles().subscribe();
    const req = httpMock.expectOne(`${environment.api}/role`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getClients sends GET to /client', () => {
    service.getClients().subscribe();
    httpMock.expectOne(`${environment.api}/client`).flush([]);
  });
});
