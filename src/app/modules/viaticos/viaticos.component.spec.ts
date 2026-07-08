import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ViaticosComponent } from './viaticos.component';
import { AdvanceService } from '../../services/advance.service';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { IAdvance } from '../../interfaces/advance.interface';
import { IExpenseReport } from '../../interfaces/expense-report.interface';

describe('ViaticosComponent', () => {
  let component: ViaticosComponent;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let router: jasmine.SpyObj<Router>;

  const baseAdvance: IAdvance = {
    _id: 'adv-1',
    userId: { _id: 'user-1', name: 'Juan Perez', email: 'juan@test.com' },
    clientId: 'client-1',
    approverChain: [
      { _id: 'appr-1', name: 'Ana Aprobadora', email: 'ana@test.com' },
      { _id: 'appr-2', name: 'Beto Aprobador', email: 'beto@test.com' },
    ],
    projectId: { _id: 'proj-1', code: 'PRJ1', name: 'Proyecto Uno' },
    place: 'Lima',
    startDate: '2026-01-01',
    endDate: '2026-01-05',
    lines: [],
    amount: 300,
    description: 'Viaje a Lima',
    status: 'pending_l1',
    approvalLevel: 0,
    requiredLevels: 2,
    approvalHistory: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const baseViaticoReport: IExpenseReport = {
    _id: 'via-1',
    title: 'Viatico 1',
    budget: 0,
    userId: { _id: 'user-2', name: 'Maria Lopez', email: 'maria@test.com' },
    clientId: 'client-1',
    type: 'viatico',
    status: 'pending_l1',
    viaticoAmount: 600,
    viaticoPlace: 'Cusco',
    viaticoStartDate: '2026-02-01',
    viaticoEndDate: '2026-02-05',
    viaticoApprovalLevel: 0,
    viaticoRequiredLevels: 2,
    viaticoApproverChain: [
      { _id: 'appr-1', name: 'Ana Aprobadora', email: 'ana@test.com' },
    ],
    projectId: { _id: 'proj-2', code: 'PRJ2', name: 'Proyecto Dos' },
    expenseIds: [],
    createdBy: 'user-2',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  };

  function setup() {
    TestBed.configureTestingModule({
      imports: [ViaticosComponent],
      providers: [
        { provide: AdvanceService, useValue: advanceService },
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: UserStateService, useValue: userState },
        { provide: NotificationService, useValue: notifications },
        { provide: Router, useValue: router },
      ],
    });
    const fixture = TestBed.createComponent(ViaticosComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    advanceService = jasmine.createSpyObj('AdvanceService', ['findForViaticosPage', 'approve', 'reject']);
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', [
      'getViaticosList', 'approveViatico', 'approveViaticoContabilidad', 'rejectViatico',
    ]);
    userState = jasmine.createSpyObj('UserStateService', ['getUser', 'isSuperAdmin', 'isContabilidad']);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    advanceService.findForViaticosPage.and.returnValue(of([]));
    expenseReportsService.getViaticosList.and.returnValue(of([]));
    userState.getUser.and.returnValue({ _id: 'current-user' } as any);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
  });

  describe('ngOnInit / load', () => {
    beforeEach(() => setup());

    it('builds rejectForm with required + minLength validators and loads data', () => {
      component.ngOnInit();
      expect(component.rejectForm).toBeDefined();
      const control = component.rejectForm.get('rejectionReason')!;
      control.setValue('');
      expect(control.valid).toBeFalse();
      control.setValue('short');
      expect(control.valid).toBeFalse();
      control.setValue('long enough reason');
      expect(control.valid).toBeTrue();
      expect(advanceService.findForViaticosPage).toHaveBeenCalled();
      expect(expenseReportsService.getViaticosList).toHaveBeenCalled();
    });

    it('load() populates allAdvances and clears isLoading on success', () => {
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      expect(component.allAdvances()).toEqual([baseAdvance]);
      expect(component.isLoading()).toBeFalse();
    });

    it('load() clears list and isLoading on error', () => {
      advanceService.findForViaticosPage.and.returnValue(throwError(() => new Error('fail')));
      component.load();
      expect(component.allAdvances()).toEqual([]);
      expect(component.isLoading()).toBeFalse();
    });

    it('loadViaticoReports() populates allViaticoReports on success', () => {
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      expect(component.allViaticoReports()).toEqual([baseViaticoReport]);
      expect(component.viaticoReportsLoading()).toBeFalse();
    });

    it('loadViaticoReports() clears list on error', () => {
      expenseReportsService.getViaticosList.and.returnValue(throwError(() => new Error('fail')));
      component.loadViaticoReports();
      expect(component.allViaticoReports()).toEqual([]);
      expect(component.viaticoReportsLoading()).toBeFalse();
    });

    it('reloadAll() calls both load and loadViaticoReports', () => {
      spyOn(component, 'load');
      spyOn(component, 'loadViaticoReports');
      component.reloadAll();
      expect(component.load).toHaveBeenCalled();
      expect(component.loadViaticoReports).toHaveBeenCalled();
    });

    it('applyFilters() reloads both lists', () => {
      spyOn(component, 'load');
      spyOn(component, 'loadViaticoReports');
      component.applyFilters();
      expect(component.load).toHaveBeenCalled();
      expect(component.loadViaticoReports).toHaveBeenCalled();
    });
  });

  describe('filters', () => {
    beforeEach(() => setup());

    it('clearFilters resets all filter signals', () => {
      component.filterStatus.set('approved');
      component.filterSearch.set('juan');
      component.filterDateFrom.set('2026-01-01');
      component.filterDateTo.set('2026-01-31');
      component.clearFilters();
      expect(component.filterStatus()).toBe('all');
      expect(component.filterSearch()).toBe('');
      expect(component.filterDateFrom()).toBe('');
      expect(component.filterDateTo()).toBe('');
    });

    it('onStatusChange sets filterStatus from event target value', () => {
      const event = { target: { value: 'approved' } } as unknown as Event;
      component.onStatusChange(event);
      expect(component.filterStatus()).toBe('approved');
    });

    it('onSearchChange sets filterSearch from event target value', () => {
      const event = { target: { value: 'maria' } } as unknown as Event;
      component.onSearchChange(event);
      expect(component.filterSearch()).toBe('maria');
    });

    it('onDateFromChange sets filterDateFrom from event target value', () => {
      const event = { target: { value: '2026-01-01' } } as unknown as Event;
      component.onDateFromChange(event);
      expect(component.filterDateFrom()).toBe('2026-01-01');
    });

    it('onDateToChange sets filterDateTo from event target value', () => {
      const event = { target: { value: '2026-01-31' } } as unknown as Event;
      component.onDateToChange(event);
      expect(component.filterDateTo()).toBe('2026-01-31');
    });
  });

  describe('stats', () => {
    beforeEach(() => setup());

    it('counts pending_l1, in_progress, approved and paid across advances and viatico reports', () => {
      const advances: IAdvance[] = [
        { ...baseAdvance, _id: 'a1', status: 'pending_l1', approvalLevel: 0 },
        { ...baseAdvance, _id: 'a2', status: 'pending_l1', approvalLevel: 1 },
        { ...baseAdvance, _id: 'a3', status: 'approved' },
        { ...baseAdvance, _id: 'a4', status: 'paid' },
      ];
      const reports: IExpenseReport[] = [
        { ...baseViaticoReport, _id: 'v1', status: 'pending_l1', viaticoApprovalLevel: 0 },
        { ...baseViaticoReport, _id: 'v2', status: 'pending_l1', viaticoApprovalLevel: 1 },
        { ...baseViaticoReport, _id: 'v3', status: 'viatico_approved' },
      ];
      advanceService.findForViaticosPage.and.returnValue(of(advances));
      expenseReportsService.getViaticosList.and.returnValue(of(reports));
      component.load();
      component.loadViaticoReports();

      const stats = component.stats();
      expect(stats.pending_l1).toBe(2);
      expect(stats.in_progress).toBe(2);
      expect(stats.approved).toBe(2);
      expect(stats.paid).toBe(1);
    });
  });

  describe('unifiedFiltered', () => {
    beforeEach(() => setup());

    it('maps advances and viatico reports, sorted by createdAt desc', () => {
      const olderAdvance: IAdvance = { ...baseAdvance, _id: 'old', createdAt: '2025-01-01T00:00:00Z' };
      const newerReport: IExpenseReport = { ...baseViaticoReport, _id: 'new', createdAt: '2026-05-01T00:00:00Z' };
      advanceService.findForViaticosPage.and.returnValue(of([olderAdvance]));
      expenseReportsService.getViaticosList.and.returnValue(of([newerReport]));
      component.load();
      component.loadViaticoReports();

      const result = component.unifiedFiltered();
      expect(result.length).toBe(2);
      expect(result[0]._id).toBe('new');
      expect(result[1]._id).toBe('old');
    });

    it('filters by search term across name, email and place', () => {
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.load();
      component.loadViaticoReports();

      component.filterSearch.set('cusco');
      expect(component.unifiedFiltered().length).toBe(1);
      expect(component.unifiedFiltered()[0]._id).toBe('via-1');

      component.filterSearch.set('nomatch');
      expect(component.unifiedFiltered().length).toBe(0);
    });

    it('filters by status', () => {
      const approvedAdvance: IAdvance = { ...baseAdvance, _id: 'approved-1', status: 'approved' };
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance, approvedAdvance]));
      component.load();

      component.filterStatus.set('approved');
      const result = component.unifiedFiltered();
      expect(result.length).toBe(1);
      expect(result[0]._id).toBe('approved-1');
    });

    it('filters by date range (dateFrom/dateTo)', () => {
      const inRange: IAdvance = { ...baseAdvance, _id: 'in-range', createdAt: '2026-03-15T00:00:00Z' };
      const outOfRange: IAdvance = { ...baseAdvance, _id: 'out-of-range', createdAt: '2026-06-01T00:00:00Z' };
      advanceService.findForViaticosPage.and.returnValue(of([inRange, outOfRange]));
      component.load();

      component.filterDateFrom.set('2026-03-01');
      component.filterDateTo.set('2026-03-31');
      const result = component.unifiedFiltered();
      expect(result.length).toBe(1);
      expect(result[0]._id).toBe('in-range');
    });

    it('canApproveNow/canReject true for advance pending_l1 when current user is the expected approver', () => {
      userState.getUser.and.returnValue({ _id: 'appr-1' } as any);
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      expect(item.canApproveNow).toBeTrue();
      expect(item.canReject).toBeTrue();
      expect(item.pendingApproverName).toBe('Ana Aprobadora');
    });

    it('canApproveNow false for advance pending_l1 when current user is not the expected approver', () => {
      userState.getUser.and.returnValue({ _id: 'someone-else' } as any);
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      expect(item.canApproveNow).toBeFalse();
      expect(item.canReject).toBeFalse();
    });

    it('canApproveNow true for any pending_l1 item when user is SuperAdmin', () => {
      userState.getUser.and.returnValue({ _id: 'irrelevant' } as any);
      userState.isSuperAdmin.and.returnValue(true);
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      expect(item.canApproveNow).toBeTrue();
    });

    it('marks isContabilidadGate and requires isContabilidad/SuperAdmin for pending_contabilidad viatico reports', () => {
      const contabilidadReport: IExpenseReport = { ...baseViaticoReport, _id: 'contab-1', status: 'pending_contabilidad' };
      expenseReportsService.getViaticosList.and.returnValue(of([contabilidadReport]));
      component.loadViaticoReports();

      let item = component.unifiedFiltered()[0];
      expect(item.isContabilidadGate).toBeTrue();
      expect(item.canApproveNow).toBeFalse();
      expect(item.pendingApproverName).toBe('Contabilidad');

      // `unifiedFiltered` is an Angular `computed()`, memoized on its signal deps
      // (allViaticoReports, filters). `isContabilidad()` is a plain method call, not
      // a signal, so toggling it alone won't invalidate the cache — a tracked signal
      // must change too. Re-emitting the exact same array reference via `of()` would
      // not do it either (signals use Object.is equality), so we emit a fresh array.
      userState.isContabilidad.and.returnValue(true);
      expenseReportsService.getViaticosList.and.returnValue(of([{ ...contabilidadReport }]));
      component.loadViaticoReports();
      item = component.unifiedFiltered()[0];
      expect(item.canApproveNow).toBeTrue();
      expect(item.canReject).toBeTrue();
    });
  });

  describe('approve modal / confirmApprove', () => {
    beforeEach(() => setup());

    it('openApproveModal sets pendingApproveItem and shows modal', () => {
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      component.openApproveModal(item);
      expect(component.pendingApproveItem()).toBe(item);
      expect(component.showApproveModal()).toBeTrue();
    });

    it('confirmApprove does nothing when there is no pending item', () => {
      component.confirmApprove();
      expect(advanceService.approve).not.toHaveBeenCalled();
      expect(expenseReportsService.approveViatico).not.toHaveBeenCalled();
    });

    it('confirmApprove calls advanceService.approve for advance items and shows success', () => {
      advanceService.approve.and.returnValue(of(baseAdvance));
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      spyOn(component, 'reloadAll');
      component.openApproveModal(item);
      component.confirmApprove();

      expect(advanceService.approve).toHaveBeenCalledWith('adv-1', {});
      expect(component.showApproveModal()).toBeFalse();
      expect(component.isActing()).toBeFalse();
      expect(notifications.show).toHaveBeenCalledWith(
        `Solicitud aprobada (nivel ${baseAdvance.approvalLevel + 1} de ${baseAdvance.requiredLevels})`,
        'success',
      );
      expect(component.reloadAll).toHaveBeenCalled();
    });

    it('confirmApprove calls approveViatico for non-contabilidad-gate viatico reports', () => {
      expenseReportsService.approveViatico.and.returnValue(of(baseViaticoReport));
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      spyOn(component, 'reloadAll');
      component.openApproveModal(item);
      component.confirmApprove();

      expect(expenseReportsService.approveViatico).toHaveBeenCalledWith('via-1');
      expect(expenseReportsService.approveViaticoContabilidad).not.toHaveBeenCalled();
    });

    it('confirmApprove calls approveViaticoContabilidad for pending_contabilidad reports with contabilidad message', () => {
      const contabilidadReport: IExpenseReport = { ...baseViaticoReport, _id: 'contab-1', status: 'pending_contabilidad' };
      expenseReportsService.approveViaticoContabilidad.and.returnValue(of(contabilidadReport));
      expenseReportsService.getViaticosList.and.returnValue(of([contabilidadReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      spyOn(component, 'reloadAll');
      component.openApproveModal(item);
      component.confirmApprove();

      expect(expenseReportsService.approveViaticoContabilidad).toHaveBeenCalledWith('contab-1');
      expect(notifications.show).toHaveBeenCalledWith(
        'Solicitud aprobada por Contabilidad — lista para pago',
        'success',
      );
    });

    it('confirmApprove shows backend error message and resets acting state on failure', () => {
      advanceService.approve.and.returnValue(throwError(() => ({ error: { message: 'Nivel de aprobación inválido' } })));
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      component.openApproveModal(item);
      component.confirmApprove();

      expect(component.showApproveModal()).toBeFalse();
      expect(component.isActing()).toBeFalse();
      expect(notifications.show).toHaveBeenCalledWith('Nivel de aprobación inválido', 'error');
    });

    it('confirmApprove shows fallback error message when backend has none', () => {
      advanceService.approve.and.returnValue(throwError(() => ({})));
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      component.openApproveModal(item);
      component.confirmApprove();

      expect(notifications.show).toHaveBeenCalledWith('Error al aprobar', 'error');
    });
  });

  describe('reject modal / confirmReject', () => {
    beforeEach(() => {
      setup();
      component.ngOnInit();
    });

    it('openRejectModal sets selectedItem, resets form and shows modal', () => {
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      component.rejectForm.patchValue({ rejectionReason: 'stale value here' });
      component.openRejectModal(item);
      expect(component.selectedItem()).toBe(item);
      expect(component.showRejectModal()).toBeTrue();
      expect(component.rejectForm.value.rejectionReason).toBeFalsy();
    });

    it('confirmReject does nothing when there is no selected item', () => {
      component.confirmReject();
      expect(advanceService.reject).not.toHaveBeenCalled();
    });

    it('confirmReject does nothing when the form is invalid', () => {
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      component.openRejectModal(item);
      component.rejectForm.patchValue({ rejectionReason: 'short' });
      component.confirmReject();
      expect(advanceService.reject).not.toHaveBeenCalled();
    });

    it('confirmReject calls advanceService.reject with reason for advance items', () => {
      advanceService.reject.and.returnValue(of({ ...baseAdvance, status: 'rejected' }));
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      spyOn(component, 'reloadAll');
      component.openRejectModal(item);
      component.rejectForm.patchValue({ rejectionReason: 'No cumple politica de viaticos' });
      component.confirmReject();

      expect(advanceService.reject).toHaveBeenCalledWith('adv-1', { rejectionReason: 'No cumple politica de viaticos' });
      expect(notifications.show).toHaveBeenCalledWith('Solicitud rechazada', 'success');
      expect(component.showRejectModal()).toBeFalse();
      expect(component.isActing()).toBeFalse();
      expect(component.reloadAll).toHaveBeenCalled();
    });

    it('confirmReject calls expenseReportsService.rejectViatico for new source items', () => {
      expenseReportsService.rejectViatico.and.returnValue(of({ ...baseViaticoReport, status: 'rejected' }));
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      component.openRejectModal(item);
      component.rejectForm.patchValue({ rejectionReason: 'No cumple politica de viaticos' });
      component.confirmReject();

      expect(expenseReportsService.rejectViatico).toHaveBeenCalledWith('via-1', 'No cumple politica de viaticos');
    });

    it('confirmReject shows backend error message on failure', () => {
      advanceService.reject.and.returnValue(throwError(() => ({ error: { message: 'No autorizado' } })));
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      const item = component.unifiedFiltered()[0];
      component.openRejectModal(item);
      component.rejectForm.patchValue({ rejectionReason: 'No cumple politica de viaticos' });
      component.confirmReject();

      expect(notifications.show).toHaveBeenCalledWith('No autorizado', 'error');
      expect(component.isActing()).toBeFalse();
    });
  });

  describe('openDetail navigation', () => {
    beforeEach(() => setup());

    it('navigates to /viaticos/:id for advance-sourced items', () => {
      advanceService.findForViaticosPage.and.returnValue(of([baseAdvance]));
      component.load();
      component.openDetail(component.unifiedFiltered()[0]);
      expect(router.navigate).toHaveBeenCalledWith(['/viaticos', 'adv-1']);
    });

    it('navigates to /mis-rendiciones/:id/detalle for new-sourced items', () => {
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      component.openDetail(component.unifiedFiltered()[0]);
      expect(router.navigate).toHaveBeenCalledWith(
        ['/mis-rendiciones', 'via-1', 'detalle'],
        { queryParams: { from: 'rendiciones' } },
      );
    });
  });
});
