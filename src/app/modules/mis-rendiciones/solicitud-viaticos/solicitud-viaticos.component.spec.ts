import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SolicitudViaticosComponent } from './solicitud-viaticos.component';
import { AdvanceService } from '../../../services/advance.service';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { IAdvance } from '../../../interfaces/advance.interface';
import { IExpenseReport } from '../../../interfaces/expense-report.interface';

describe('SolicitudViaticosComponent', () => {
  let component: SolicitudViaticosComponent;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let ordenTrabajoService: jasmine.SpyObj<OrdenTrabajoService>;
  let router: jasmine.SpyObj<Router>;
  let paramMapGet: jasmine.Spy;

  function makeAdvance(overrides: Partial<IAdvance> = {}): IAdvance {
    return {
      _id: 'a1', userId: 'u1', clientId: 'c1', amount: 100, description: 'x',
      status: 'pending_l1', approvalLevel: 0, requiredLevels: 1, approvalHistory: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    } as IAdvance;
  }

  beforeEach(() => {
    advanceService = jasmine.createSpyObj('AdvanceService', ['findOne', 'resubmit']);
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', [
      'findOne', 'resubmitViatico', 'createViatico',
    ]);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    userState = jasmine.createSpyObj('UserStateService', ['getUser']);
    invoicesService = jasmine.createSpyObj('InvoicesService', ['getProjects']);
    ordenTrabajoService = jasmine.createSpyObj('OrdenTrabajoService', ['getAll']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    paramMapGet = jasmine.createSpy('get').and.returnValue(null);

    userState.getUser.and.returnValue({ _id: 'u1', companyId: 'c1' } as any);
    invoicesService.getProjects.and.returnValue(of([]));
    ordenTrabajoService.getAll.and.returnValue(of([]));
    expenseReportsService.findOne.and.returnValue(of({} as IExpenseReport));
    advanceService.findOne.and.returnValue(of(makeAdvance()));

    TestBed.configureTestingModule({
      imports: [SolicitudViaticosComponent],
      providers: [
        { provide: AdvanceService, useValue: advanceService },
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: NotificationService, useValue: notifications },
        { provide: UserStateService, useValue: userState },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: OrdenTrabajoService, useValue: ordenTrabajoService },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: paramMapGet } } } },
      ],
    });

    component = TestBed.createComponent(SolicitudViaticosComponent).componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('isResubmit is false when there is no id in the route', () => {
    expect(component.isResubmit).toBeFalse();
  });

  it('isResubmit is true when the route carries an id', () => {
    paramMapGet.and.returnValue('adv1');
    expect(component.isResubmit).toBeTrue();
  });

  describe('ngOnInit', () => {
    it('loads catalogues for a new request (no id)', () => {
      component.ngOnInit();
      expect(invoicesService.getProjects).toHaveBeenCalled();
      expect(ordenTrabajoService.getAll).toHaveBeenCalled();
    });

    it('loads a unified viatico for resubmit and bootstraps the form', () => {
      paramMapGet.and.returnValue('r1');
      expenseReportsService.findOne.and.returnValue(
        of({ _id: 'r1', type: 'viatico', viaticoAmount: 250, viaticoPlace: 'Lima' } as any)
      );
      component.ngOnInit();
      expect(component.viaticoToResubmit()?._id).toBe('r1');
      expect(component.form.value.amount).toBe(250);
    });

    it('falls back to the legacy Advance endpoint when the report is not a viatico', () => {
      paramMapGet.and.returnValue('a1');
      expenseReportsService.findOne.and.returnValue(of({ _id: 'a1', type: 'rendicion' } as any));
      advanceService.findOne.and.returnValue(of(makeAdvance({ amount: 300 })));
      component.ngOnInit();
      expect(component.advanceToResubmit()?.amount).toBe(300);
    });

    it('navigates away when neither endpoint can load the solicitud', () => {
      paramMapGet.and.returnValue('bad-id');
      expenseReportsService.findOne.and.returnValue(throwError(() => new Error('404')));
      advanceService.findOne.and.returnValue(throwError(() => new Error('404')));
      component.ngOnInit();
      expect(notifications.show).toHaveBeenCalledWith('No se pudo cargar la solicitud', 'error');
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones']);
    });
  });

  describe('totalGeneral', () => {
    it('rounds the entered amount to 2 decimals', () => {
      component.form.patchValue({ amount: 123.456 });
      expect(component.totalGeneral()).toBe(123.46);
    });

    it('returns 0 for a non-numeric amount', () => {
      component.form.patchValue({ amount: null });
      expect(component.totalGeneral()).toBe(0);
    });
  });

  describe('goBack / toggleCustomBank', () => {
    it('navigates back to mis-rendiciones', () => {
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones']);
    });

    it('clears bank fields when custom bank is toggled off', () => {
      component.form.patchValue({ bankName: 'BCP', accountNumber: '123', cci: '456' });
      component.useCustomBank.set(true);
      component.toggleCustomBank();
      expect(component.useCustomBank()).toBeFalse();
      expect(component.form.value.bankName).toBe('');
    });
  });

  describe('submit', () => {
    function fillValidForm() {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const ymd = future.toISOString().slice(0, 10);
      component.form.patchValue({
        place: 'Lima', startDate: ymd, endDate: ymd, projectId: 'p1', amount: 100,
      });
    }

    it('marks all fields touched and warns when the form is invalid', () => {
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('Complete los campos obligatorios', 'error');
      expect(expenseReportsService.createViatico).not.toHaveBeenCalled();
    });

    it('rejects when the end date is before the start date', () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const laterYmd = future.toISOString().slice(0, 10);
      const earlier = new Date();
      earlier.setDate(earlier.getDate() + 1);
      component.form.patchValue({
        place: 'Lima', startDate: laterYmd, endDate: earlier.toISOString().slice(0, 10),
        projectId: 'p1', amount: 100,
      });
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith(
        'La fecha fin debe ser mayor o igual a la fecha inicio', 'error'
      );
    });

    it('creates a new viatico when there is nothing to resubmit', () => {
      fillValidForm();
      expenseReportsService.createViatico.and.returnValue(of({} as IExpenseReport));
      component.submit();
      expect(expenseReportsService.createViatico).toHaveBeenCalled();
      expect(notifications.show).toHaveBeenCalledWith('Solicitud de viáticos enviada correctamente', 'success');
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones'], { queryParams: { tab: 'viaticos' } });
    });

    it('resubmits a unified viatico when one is set', () => {
      fillValidForm();
      component.viaticoToResubmit.set({ _id: 'r1' } as IExpenseReport);
      expenseReportsService.resubmitViatico.and.returnValue(of({} as IExpenseReport));
      component.submit();
      expect(expenseReportsService.resubmitViatico).toHaveBeenCalledWith('r1', jasmine.any(Object));
      expect(notifications.show).toHaveBeenCalledWith('Solicitud corregida y reenviada correctamente', 'success');
    });

    it('resubmits a legacy advance when one is set', () => {
      fillValidForm();
      component.advanceToResubmit.set(makeAdvance());
      advanceService.resubmit.and.returnValue(of(makeAdvance()));
      component.submit();
      expect(advanceService.resubmit).toHaveBeenCalledWith('a1', jasmine.any(Object));
    });

    it('shows an error notification when the request fails', () => {
      fillValidForm();
      expenseReportsService.createViatico.and.returnValue(throwError(() => ({ error: { message: 'boom' } })));
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('boom', 'error');
      expect(component.submitting()).toBeFalse();
    });
  });

  it('projectLabel includes the code when present', () => {
    expect(component.projectLabel({ _id: 'p1', name: 'Proyecto', code: 'PR' } as any)).toBe('PR — Proyecto');
  });

  it('projectLabel falls back to the name only', () => {
    expect(component.projectLabel({ _id: 'p1', name: 'Proyecto' } as any)).toBe('Proyecto');
  });
});
