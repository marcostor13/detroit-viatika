import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ExpenseService } from './expense.service';
import { environment } from '../../environments/environment';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let httpMock: HttpTestingController;

  const BASE = `${environment.api}/expense`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ExpenseService],
    });
    service = TestBed.inject(ExpenseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getExpenses sends GET without params when no filters', () => {
    service.getExpenses().subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush([]);
  });

  it('getExpenses includes non-empty filters as params', () => {
    service.getExpenses({ status: 'pending', clientId: 'c1' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('status')).toBe('pending');
    expect(req.request.params.get('clientId')).toBe('c1');
    req.flush([]);
  });

  it('getExpenses omits empty, null, and undefined filters', () => {
    service.getExpenses({ status: '', clientId: null, foo: undefined }).subscribe();
    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.params.keys().length).toBe(0);
    req.flush([]);
  });

  it('analyzeExpense sends POST to /analyze-image', () => {
    service.analyzeExpense({ imageUrl: 'http://x' }).subscribe();
    const req = httpMock.expectOne(`${BASE}/analyze-image`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('getSunatValidation sends GET with id and companyId', () => {
    service.getSunatValidation('e1', 'c1').subscribe();
    httpMock.expectOne(`${BASE}/e1/c1/sunat-validation`).flush({});
  });

  it('updateExpense sends PATCH with id and companyId', () => {
    service.updateExpense('e1', 'c1', { amount: 100 }).subscribe();
    const req = httpMock.expectOne(`${BASE}/e1/c1`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('deleteExpense sends DELETE with id and companyId', () => {
    service.deleteExpense('e1', 'c1').subscribe();
    const req = httpMock.expectOne(`${BASE}/e1/c1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });
});
