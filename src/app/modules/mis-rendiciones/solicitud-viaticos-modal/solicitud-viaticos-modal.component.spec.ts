import { TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { of, throwError } from 'rxjs';
import { SolicitudViaticosModalComponent } from './solicitud-viaticos-modal.component';
import { AdvanceService } from '../../../services/advance.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { IAdvance } from '../../../interfaces/advance.interface';

describe('SolicitudViaticosModalComponent', () => {
  let component: SolicitudViaticosModalComponent;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let invoicesService: jasmine.SpyObj<InvoicesService>;

  function makeAdvance(overrides: Partial<IAdvance> = {}): IAdvance {
    return {
      _id: 'a1', userId: 'u1', clientId: 'c1', amount: 100, description: 'x',
      status: 'pending_l1', approvalLevel: 0, requiredLevels: 1, approvalHistory: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    } as IAdvance;
  }

  beforeEach(() => {
    advanceService = jasmine.createSpyObj('AdvanceService', ['create', 'resubmit']);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    userState = jasmine.createSpyObj('UserStateService', ['getUser']);
    invoicesService = jasmine.createSpyObj('InvoicesService', ['getProjects']);

    userState.getUser.and.returnValue({ _id: 'u1', companyId: 'c1' } as any);
    invoicesService.getProjects.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [SolicitudViaticosModalComponent],
      providers: [
        { provide: AdvanceService, useValue: advanceService },
        { provide: NotificationService, useValue: notifications },
        { provide: UserStateService, useValue: userState },
        { provide: InvoicesService, useValue: invoicesService },
      ],
    });

    component = TestBed.createComponent(SolicitudViaticosModalComponent).componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnChanges', () => {
    it('resets the form and loads projects when opening for a new request', () => {
      component.initialProjectId = 'p1';
      component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
      expect(component.form.value.projectId).toBe('p1');
      expect(invoicesService.getProjects).toHaveBeenCalled();
    });

    it('bootstraps from an advance to resubmit', () => {
      component.advanceToResubmit = makeAdvance({ place: 'Cusco', amount: 500 });
      component.ngOnChanges({ isOpen: new SimpleChange(false, true, false) });
      expect(component.form.value.place).toBe('Cusco');
      expect(component.form.value.amount).toBe(500);
    });

    it('does nothing when isOpen did not change to true', () => {
      invoicesService.getProjects.calls.reset();
      component.ngOnChanges({ isOpen: new SimpleChange(true, false, false) });
      expect(invoicesService.getProjects).not.toHaveBeenCalled();
    });
  });

  describe('dismiss / overlayClick', () => {
    it('emits closed with the given value', () => {
      const spy = spyOn(component.closed, 'emit');
      component.dismiss(true);
      expect(spy).toHaveBeenCalledWith(true);
    });

    it('overlayClick dismisses only when not submitting', () => {
      const spy = spyOn(component, 'dismiss');
      component.submitting.set(true);
      component.overlayClick();
      expect(spy).not.toHaveBeenCalled();
      component.submitting.set(false);
      component.overlayClick();
      expect(spy).toHaveBeenCalledWith(false);
    });
  });

  describe('totalGeneral', () => {
    it('rounds the amount to 2 decimals', () => {
      component.form.patchValue({ amount: 10.005 });
      expect(component.totalGeneral()).toBeCloseTo(10.01, 2);
    });
  });

  describe('submit', () => {
    function fillValidForm() {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const ymd = future.toISOString().slice(0, 10);
      component.form.patchValue({ place: 'Lima', startDate: ymd, endDate: ymd, projectId: 'p1', amount: 100 });
    }

    it('warns and marks fields touched when the form is invalid', () => {
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('Complete los campos obligatorios', 'error');
      expect(advanceService.create).not.toHaveBeenCalled();
    });

    it('creates a new advance and dismisses with success', () => {
      fillValidForm();
      advanceService.create.and.returnValue(of(makeAdvance()));
      const dismissSpy = spyOn(component, 'dismiss');
      component.submit();
      expect(advanceService.create).toHaveBeenCalled();
      expect(notifications.show).toHaveBeenCalledWith('Solicitud de viáticos enviada correctamente', 'success');
      expect(dismissSpy).toHaveBeenCalledWith(true);
    });

    it('resubmits when advanceToResubmit is set', () => {
      fillValidForm();
      component.advanceToResubmit = makeAdvance();
      advanceService.resubmit.and.returnValue(of(makeAdvance()));
      component.submit();
      expect(advanceService.resubmit).toHaveBeenCalledWith('a1', jasmine.any(Object));
      expect(notifications.show).toHaveBeenCalledWith('Solicitud corregida y reenviada correctamente', 'success');
    });

    it('includes expenseReportId only for a brand-new request', () => {
      fillValidForm();
      component.expenseReportId = 'r1';
      advanceService.create.and.returnValue(of(makeAdvance()));
      component.submit();
      expect(advanceService.create).toHaveBeenCalledWith(jasmine.objectContaining({ expenseReportId: 'r1' }));
    });

    it('shows an error notification on failure', () => {
      fillValidForm();
      advanceService.create.and.returnValue(throwError(() => ({ error: { message: 'boom' } })));
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('boom', 'error');
      expect(component.submitting()).toBeFalse();
    });
  });

  it('projectLabel includes the code when present', () => {
    expect(component.projectLabel({ _id: 'p1', name: 'Proyecto', code: 'PR' } as any)).toBe('PR — Proyecto');
  });
});
