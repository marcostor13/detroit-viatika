import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdvanceService } from './advance.service';
import { UserStateService } from './user-state.service';
import { environment } from '../../environments/environment';

describe('AdvanceService', () => {
  let service: AdvanceService;
  let httpMock: HttpTestingController;
  let userState: jasmine.SpyObj<UserStateService>;

  const BASE = `${environment.api}/advance`;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['getUser']);
    userState.getUser.and.returnValue({ _id: 'u1', companyId: 'c1' } as any);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AdvanceService,
        { provide: UserStateService, useValue: userState },
      ],
    });

    service = TestBed.inject(AdvanceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('create sends POST', () => {
    service.create({ amount: 100 } as any).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('findMy sends GET with userId and clientId', () => {
    service.findMy().subscribe();
    httpMock.expectOne(`${BASE}/my/u1/client/c1`).flush([]);
  });

  it('findAll sends GET by clientId', () => {
    service.findAll().subscribe();
    httpMock.expectOne(`${BASE}/client/c1`).flush([]);
  });

  it('findPending sends GET', () => {
    service.findPending().subscribe();
    httpMock.expectOne(`${BASE}/pending/client/c1`).flush([]);
  });

  it('getStats sends GET', () => {
    service.getStats().subscribe();
    httpMock.expectOne(`${BASE}/stats/client/c1`).flush({});
  });

  it('findOne sends GET by id', () => {
    service.findOne('a1').subscribe();
    httpMock.expectOne(`${BASE}/a1`).flush({});
  });

  it('approve sends PATCH', () => {
    service.approve('a1', { notes: 'ok' } as any).subscribe();
    const req = httpMock.expectOne(`${BASE}/a1/approve`);
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('reject sends PATCH', () => {
    service.reject('a1', { reason: 'no' } as any).subscribe();
    httpMock.expectOne(`${BASE}/a1/reject`).flush({});
  });

  it('registerPayment sends PATCH', () => {
    service.registerPayment('a1', {} as any).subscribe();
    httpMock.expectOne(`${BASE}/a1/register-payment`).flush({});
  });

  it('registerReturn sends PATCH with returnedAmount', () => {
    service.registerReturn('a1', 200).subscribe();
    const req = httpMock.expectOne(`${BASE}/a1/return`);
    expect(req.request.body).toEqual({ returnedAmount: 200 });
    req.flush({});
  });

  it('resubmit sends PATCH', () => {
    service.resubmit('a1', {} as any).subscribe();
    httpMock.expectOne(`${BASE}/a1/resubmit`).flush({});
  });

  it('cancelAdvance sends PATCH', () => {
    service.cancelAdvance('a1').subscribe();
    httpMock.expectOne(`${BASE}/a1/cancel`).flush({});
  });

  it('initiateReturn sends PATCH', () => {
    service.initiateReturn('a1').subscribe();
    httpMock.expectOne(`${BASE}/a1/return/initiate`).flush({});
  });

  it('uploadReturnProof sends PATCH', () => {
    service.uploadReturnProof('a1', { fileUrl: 'http://x' } as any).subscribe();
    httpMock.expectOne(`${BASE}/a1/return/proof`).flush({});
  });

  it('validateReturn sends PATCH with approved flag', () => {
    service.validateReturn('a1', true).subscribe();
    const req = httpMock.expectOne(`${BASE}/a1/return/validate`);
    expect(req.request.body).toEqual({ approved: true, rejectionReason: undefined });
    req.flush({});
  });

  it('findPendingReturns sends GET by clientId', () => {
    service.findPendingReturns('c1').subscribe();
    httpMock.expectOne(`${BASE}/pending-returns/client/c1`).flush([]);
  });

  it('findForViaticosPage sends GET without params', () => {
    service.findForViaticosPage().subscribe();
    httpMock.expectOne(`${BASE}/viaticos/list`).flush([]);
  });

  it('findForViaticosPage appends status and dateFrom as query string', () => {
    service.findForViaticosPage({ status: 'pending', dateFrom: '2026-01-01' }).subscribe();
    httpMock.expectOne(`${BASE}/viaticos/list?status=pending&dateFrom=2026-01-01`).flush([]);
  });
});
