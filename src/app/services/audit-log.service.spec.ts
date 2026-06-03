import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuditLogService } from './audit-log.service';
import { environment } from '../../environments/environment';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let httpMock: HttpTestingController;

  const API = `${environment.api}/audit-log`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuditLogService],
    });
    service = TestBed.inject(AuditLogService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('findAll sends GET with default page=1 and limit=20', () => {
    service.findAll().subscribe();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush({ data: [], total: 0 });
  });

  it('findAll sends custom page and limit', () => {
    service.findAll({ page: 3, limit: 5 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('limit')).toBe('5');
    req.flush({ data: [], total: 0 });
  });

  it('findAll includes module param when provided', () => {
    service.findAll({ module: 'user' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('module')).toBe('user');
    req.flush({ data: [], total: 0 });
  });

  it('findAll includes search param when provided', () => {
    service.findAll({ search: 'login' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.get('search')).toBe('login');
    req.flush({ data: [], total: 0 });
  });

  it('findAll omits module and search when not provided', () => {
    service.findAll({ page: 1 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === API);
    expect(req.request.params.has('module')).toBeFalse();
    expect(req.request.params.has('search')).toBeFalse();
    req.flush({ data: [], total: 0 });
  });
});
