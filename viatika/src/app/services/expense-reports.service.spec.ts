import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ExpenseReportsService } from './expense-reports.service';
import { environment } from '../../environments/environment';

const API = `${environment.api}/expense-report`;
const ID = '674000000000000000000001';

describe('ExpenseReportsService', () => {
  let service: ExpenseReportsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ExpenseReportsService],
    });
    service = TestBed.inject(ExpenseReportsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('create sends POST', () => {
    service.create({ name: 'Test' } as any).subscribe();
    http.expectOne(API).flush({});
  });

  it('findAllByClient sends GET with clientId', () => {
    service.findAllByClient('c1').subscribe();
    http.expectOne(`${API}/client/c1`).flush([]);
  });

  it('findAllByUser sends GET with userId and clientId', () => {
    service.findAllByUser('u1', 'c1').subscribe();
    http.expectOne(`${API}/user/u1/client/c1`).flush([]);
  });

  it('findOne sends GET by id', () => {
    service.findOne(ID).subscribe();
    http.expectOne(`${API}/${ID}`).flush({});
  });

  it('update sends PATCH by id', () => {
    service.update(ID, { name: 'Updated' } as any).subscribe();
    const req = http.expectOne(`${API}/${ID}`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('delete sends DELETE by id', () => {
    service.delete(ID).subscribe();
    const req = http.expectOne(`${API}/${ID}`);
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('findPendingReimbursements sends GET', () => {
    service.findPendingReimbursements('c1').subscribe();
    http.expectOne(`${API}/pending-reimbursements/client/c1`).flush([]);
  });

  it('findMyDocuments sends GET', () => {
    service.findMyDocuments().subscribe();
    http.expectOne(`${API}/documents/my`).flush({ items: [] });
  });

  it('registerReimbursementPayment sends PATCH', () => {
    service.registerReimbursementPayment(ID, { method: 'transfer' } as any).subscribe();
    http.expectOne(`${API}/${ID}/register-reimbursement-payment`).flush({});
  });

  it('cancelRendicion sends PATCH with reason', () => {
    service.cancelRendicion(ID, 'duplicado').subscribe();
    const req = http.expectOne(`${API}/${ID}/cancel`);
    expect(req.request.body).toEqual({ reason: 'duplicado' });
    req.flush({});
  });

  it('validateClosure sends GET', () => {
    service.validateClosure(ID).subscribe();
    http.expectOne(`${API}/${ID}/close/validate`).flush([]);
  });

  it('close sends PATCH', () => {
    service.close(ID).subscribe();
    http.expectOne(`${API}/${ID}/close`).flush({});
  });

  it('requestReopening sends POST with reason', () => {
    service.requestReopening(ID, 'error en datos').subscribe();
    const req = http.expectOne(`${API}/${ID}/reopen-request`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'error en datos' });
    req.flush({});
  });

  it('approveReopening sends PATCH with approve flag', () => {
    service.approveReopening(ID, true).subscribe();
    const req = http.expectOne(`${API}/${ID}/reopen-approve`);
    expect(req.request.body).toEqual({ approve: true });
    req.flush({});
  });

  it('registerReturnVoucher sends POST', () => {
    const payload = { depositDate: '2026-01-01', fileUrl: 'http://x' };
    service.registerReturnVoucher(ID, payload).subscribe();
    const req = http.expectOne(`${API}/${ID}/return-voucher`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('createAffidavit sends POST to /affidavit', () => {
    const payload = { type: 'viaticos_nacionales' as const, expenseIds: ['e1'] };
    service.createAffidavit(ID, payload).subscribe();
    const req = http.expectOne(`${API}/${ID}/affidavit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ reportId: ID, type: payload.type, expenseIds: payload.expenseIds, generatedBy: 'u1', generatedAt: '' });
  });

  describe('findExpensesPaginated', () => {
    it('sends GET to /expense-report/:id/expenses without query string when no params', () => {
      service.findExpensesPaginated(ID, {}).subscribe();
      http.expectOne(`${API}/${ID}/expenses`).flush({ data: [], total: 0, page: 1, limit: 10, pages: 0 });
    });

    it('sends GET with page and limit query params', () => {
      service.findExpensesPaginated(ID, { page: 2, limit: 20 }).subscribe();
      http.expectOne(`${API}/${ID}/expenses?page=2&limit=20`).flush({ data: [], total: 0, page: 2, limit: 20, pages: 0 });
    });

    it('sends GET with type filter when type is not "all"', () => {
      service.findExpensesPaginated(ID, { type: 'factura' }).subscribe();
      http.expectOne(`${API}/${ID}/expenses?type=factura`).flush({ data: [], total: 0, page: 1, limit: 10, pages: 0 });
    });

    it('omits type filter when type is "all"', () => {
      service.findExpensesPaginated(ID, { type: 'all' }).subscribe();
      const req = http.expectOne(`${API}/${ID}/expenses`);
      expect(req.request.urlWithParams).not.toContain('type');
      req.flush({ data: [], total: 0, page: 1, limit: 10, pages: 0 });
    });

    it('sends GET with status filter when status is not "all"', () => {
      service.findExpensesPaginated(ID, { status: 'approved' }).subscribe();
      http.expectOne(`${API}/${ID}/expenses?status=approved`).flush({ data: [], total: 0, page: 1, limit: 10, pages: 0 });
    });

    it('sends GET with search param when search is not empty', () => {
      service.findExpensesPaginated(ID, { search: 'hotel' }).subscribe();
      http.expectOne(`${API}/${ID}/expenses?search=hotel`).flush({ data: [], total: 0, page: 1, limit: 10, pages: 0 });
    });

    it('omits search param when search is whitespace only', () => {
      service.findExpensesPaginated(ID, { search: '   ' }).subscribe();
      const req = http.expectOne(`${API}/${ID}/expenses`);
      expect(req.request.urlWithParams).not.toContain('search');
      req.flush({ data: [], total: 0, page: 1, limit: 10, pages: 0 });
    });
  });
});
