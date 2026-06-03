import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PettyCashService } from './petty-cash.service';
import { UserStateService } from './user-state.service';
import { environment } from '../../environments/environment';

describe('PettyCashService', () => {
  let service: PettyCashService;
  let httpMock: HttpTestingController;
  let userState: jasmine.SpyObj<UserStateService>;

  const BASE = `${environment.api}/petty-cash`;

  beforeEach(() => {
    userState = jasmine.createSpyObj('UserStateService', ['getUser']);
    userState.getUser.and.returnValue({ companyId: 'c1' } as any);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PettyCashService,
        { provide: UserStateService, useValue: userState },
      ],
    });
    service = TestBed.inject(PettyCashService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('create sends POST', () => {
    service.create({ name: 'Caja chica' } as any).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('findAllByClient sends GET with clientId', () => {
    service.findAllByClient().subscribe();
    httpMock.expectOne(`${BASE}/client/c1`).flush([]);
  });

  it('findMine sends GET', () => {
    service.findMine().subscribe();
    httpMock.expectOne(`${BASE}/my/client/c1`).flush([]);
  });

  it('findOne sends GET by id', () => {
    service.findOne('pc1').subscribe();
    httpMock.expectOne(`${BASE}/pc1`).flush({});
  });

  it('registerFunding sends PATCH', () => {
    const payload = { transferDate: '2026-01-01', amount: 1000, operationNumber: 'OP1', receiptUrl: 'http://x' };
    service.registerFunding('pc1', payload).subscribe();
    const req = httpMock.expectOne(`${BASE}/pc1/register-funding`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush({});
  });

  it('addExpense sends PATCH with expenseId, amount, and category', () => {
    service.addExpense('pc1', 'e1', 50, 'food').subscribe();
    const req = httpMock.expectOne(`${BASE}/pc1/add-expense`);
    expect(req.request.body).toEqual({ expenseId: 'e1', amount: 50, category: 'food' });
    req.flush({});
  });

  it('close sends PATCH', () => {
    service.close('pc1').subscribe();
    httpMock.expectOne(`${BASE}/pc1/close`).flush({});
  });
});
