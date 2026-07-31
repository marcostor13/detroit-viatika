import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CategoriaService } from './categoria.service';
import { UserStateService } from './user-state.service';
import { environment } from '../../environments/environment';
import { IPaginatedResult } from '../interfaces/paginated-result.interface';
import { ICategory } from '../modules/invoices/interfaces/category.interface';

const COMPANY_ID = 'comp-123';
const BASE_URL = `${environment.api}/category`;

describe('CategoriaService', () => {
  let service: CategoriaService;
  let http: HttpTestingController;
  let userState: jasmine.SpyObj<UserStateService>;

  beforeEach(() => {
    const userStateMock = jasmine.createSpyObj<UserStateService>('UserStateService', ['getUser']);
    userStateMock.getUser.and.returnValue({ companyId: COMPANY_ID } as any);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        CategoriaService,
        { provide: UserStateService, useValue: userStateMock },
      ],
    });

    service = TestBed.inject(CategoriaService);
    http = TestBed.inject(HttpTestingController);
    userState = TestBed.inject(UserStateService) as jasmine.SpyObj<UserStateService>;
  });

  afterEach(() => http.verify());

  describe('getAll', () => {
    it('calls GET /:companyId with no params by default', () => {
      const mockResult: IPaginatedResult<ICategory> = {
        data: [], total: 0, page: 1, pages: 0, limit: 20,
      };
      service.getAll().subscribe(res => expect(res).toEqual(mockResult));
      const req = http.expectOne(`${BASE_URL}/${COMPANY_ID}`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResult);
    });

    it('appends page, limit and search query params', () => {
      service.getAll({ page: 2, limit: 10, search: 'test' }).subscribe();
      const req = http.expectOne(r => r.url === `${BASE_URL}/${COMPANY_ID}`);
      expect(req.request.params.get('page')).toBe('2');
      expect(req.request.params.get('limit')).toBe('10');
      expect(req.request.params.get('search')).toBe('test');
      req.flush({ data: [], total: 0, page: 2, pages: 0, limit: 10 });
    });
  });

  describe('getAllFlat', () => {
    it('calls GET /:companyId/flat', () => {
      service.getAllFlat().subscribe();
      const req = http.expectOne(`${BASE_URL}/${COMPANY_ID}/flat`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  describe('create', () => {
    it('posts with name and clientId', () => {
      service.create({ name: 'Alimentos' }).subscribe();
      const req = http.expectOne(BASE_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Alimentos', clientId: COMPANY_ID });
      req.flush({ _id: '1', name: 'Alimentos' });
    });

    it('includes optional fields when provided', () => {
      service.create({ name: 'Sub', description: 'A sub category' }).subscribe();
      const req = http.expectOne(BASE_URL);
      expect(req.request.body).toEqual({ name: 'Sub', description: 'A sub category', clientId: COMPANY_ID });
      req.flush({ _id: '2', name: 'Sub' });
    });
  });

  describe('update', () => {
    it('calls PATCH /:id/:companyId', () => {
      service.update('cat-id', { name: 'Updated' }).subscribe();
      const req = http.expectOne(`${BASE_URL}/cat-id/${COMPANY_ID}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Updated' });
      req.flush({ _id: 'cat-id', name: 'Updated' });
    });
  });

  describe('remove', () => {
    it('calls DELETE /:id/:companyId', () => {
      service.remove('cat-id').subscribe();
      const req = http.expectOne(`${BASE_URL}/cat-id/${COMPANY_ID}`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('companyId fallback', () => {
    it('uses empty string when user has no companyId', () => {
      userState.getUser.and.returnValue(null as any);
      service.getAllFlat().subscribe();
      const req = http.expectOne(`${BASE_URL}//flat`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });
});
