import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CategoryGroupService } from './category-group.service';
import { UserStateService } from './user-state.service';
import { environment } from '../../environments/environment';

const BASE = `${environment.api}/category-group`;

describe('CategoryGroupService', () => {
  let service: CategoryGroupService;
  let http: HttpTestingController;
  let userState: jasmine.SpyObj<UserStateService>;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['getUser']);
    userState.getUser.and.returnValue({ _id: 'u1', companyId: 'c1' } as any);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        CategoryGroupService,
        { provide: UserStateService, useValue: userState },
      ],
    });

    service = TestBed.inject(CategoryGroupService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getAll', () => {
    it('sends GET request to /category-group/:companyId', () => {
      service.getAll().subscribe();
      http.expectOne(`${BASE}/c1`).flush([]);
    });

    it('returns the list from the server', () => {
      const groups = [{ _id: 'g1', name: 'Group A', categoryIds: [] }];
      service.getAll().subscribe(result => {
        expect(result).toEqual(groups);
      });
      http.expectOne(`${BASE}/c1`).flush(groups);
    });
  });

  describe('create', () => {
    it('sends POST with dto and clientId', () => {
      const dto = { name: 'New Group', description: 'Desc', categoryIds: ['cat1'] };
      service.create(dto).subscribe();
      const req = http.expectOne(BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ ...dto, clientId: 'c1' });
      req.flush({ _id: 'g1', name: 'New Group' });
    });

    it('sends POST without description when omitted', () => {
      service.create({ name: 'Minimal' }).subscribe();
      const req = http.expectOne(BASE);
      expect(req.request.body.clientId).toBe('c1');
      req.flush({});
    });
  });

  describe('update', () => {
    it('sends PATCH to /category-group/:id/:companyId', () => {
      service.update('g1', { name: 'Updated' }).subscribe();
      const req = http.expectOne(`${BASE}/g1/c1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Updated' });
      req.flush({ _id: 'g1', name: 'Updated' });
    });

    it('sends PATCH with categoryIds when provided', () => {
      service.update('g1', { categoryIds: ['cat1', 'cat2'] }).subscribe();
      const req = http.expectOne(`${BASE}/g1/c1`);
      expect(req.request.body.categoryIds).toEqual(['cat1', 'cat2']);
      req.flush({});
    });
  });

  describe('remove', () => {
    it('sends DELETE to /category-group/:id/:companyId', () => {
      service.remove('g1').subscribe();
      const req = http.expectOne(`${BASE}/g1/c1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
