import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ViaticosComponent } from './viaticos.component';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { IExpenseReport, IChainStep } from '../../interfaces/expense-report.interface';

describe('ViaticosComponent', () => {
  let component: ViaticosComponent;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let router: jasmine.SpyObj<Router>;

  const chainStep = (approverIds: { _id: string; name: string; email: string }[]): IChainStep => ({
    level: 2,
    projectId: { _id: 'proj-2', code: 'PRJ2', name: 'Proyecto Dos' },
    projectRole: 'seleccionado',
    approverIds,
  });

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
      chainStep([{ _id: 'appr-1', name: 'Ana Aprobadora', email: 'ana@test.com' }]),
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
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', [
      'getViaticosList', 'approveViatico', 'approveViaticoContabilidad', 'rejectViatico',
    ]);
    userState = jasmine.createSpyObj('UserStateService', ['getUser', 'isSuperAdmin', 'isContabilidad']);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    expenseReportsService.getViaticosList.and.returnValue(of([]));
    userState.getUser.and.returnValue({ _id: 'current-user' } as any);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
  });

  describe('ngOnInit / loadViaticoReports', () => {
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
      expect(expenseReportsService.getViaticosList).toHaveBeenCalled();
    });

    it('loadViaticoReports() populates allViaticoReports on success', () => {
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      expect(component.allViaticoReports()).toEqual([baseViaticoReport]);
      expect(component.isLoading()).toBeFalse();
    });

    it('loadViaticoReports() clears list on error', () => {
      expenseReportsService.getViaticosList.and.returnValue(throwError(() => new Error('fail')));
      component.loadViaticoReports();
      expect(component.allViaticoReports()).toEqual([]);
      expect(component.isLoading()).toBeFalse();
    });

    it('reloadAll() calls loadViaticoReports', () => {
      spyOn(component, 'loadViaticoReports');
      component.reloadAll();
      expect(component.loadViaticoReports).toHaveBeenCalled();
    });

    it('applyFilters() reloads the list', () => {
      spyOn(component, 'loadViaticoReports');
      component.applyFilters();
      expect(component.loadViaticoReports).toHaveBeenCalled();
    });
  });

  describe('filters', () => {
    beforeEach(() => setup());

    it('clearFilters resets all filter signals', () => {
      component.filterStatus.set('viatico_approved');
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
      const event = { target: { value: 'viatico_approved' } } as unknown as Event;
      component.onStatusChange(event);
      expect(component.filterStatus()).toBe('viatico_approved');
    });

    it('onSearchChange sets filterSearch from event target value', () => {
      const event = { target: { value: 'maria' } } as unknown as Event;
      component.onSearchChange(event);
      expect(component.filterSearch()).toBe('maria');
    });
  });

  describe('stats', () => {
    beforeEach(() => setup());

    it('counts pending_l1, in_progress, approved and paid across viatico reports', () => {
      const reports: IExpenseReport[] = [
        { ...baseViaticoReport, _id: 'v1', status: 'pending_l1', viaticoApprovalLevel: 0 },
        { ...baseViaticoReport, _id: 'v2', status: 'pending_l1', viaticoApprovalLevel: 1 },
        { ...baseViaticoReport, _id: 'v3', status: 'viatico_approved' },
        { ...baseViaticoReport, _id: 'v4', status: 'paid' },
      ];
      expenseReportsService.getViaticosList.and.returnValue(of(reports));
      component.loadViaticoReports();

      const stats = component.stats();
      expect(stats.pending_l1).toBe(1);
      expect(stats.in_progress).toBe(1);
      expect(stats.approved).toBe(1);
      expect(stats.paid).toBe(1);
    });
  });

  describe('unifiedFiltered', () => {
    beforeEach(() => setup());

    it('maps viatico reports, sorted by createdAt desc', () => {
      const olderReport: IExpenseReport = { ...baseViaticoReport, _id: 'old', createdAt: '2025-01-01T00:00:00Z' };
      const newerReport: IExpenseReport = { ...baseViaticoReport, _id: 'new', createdAt: '2026-05-01T00:00:00Z' };
      expenseReportsService.getViaticosList.and.returnValue(of([olderReport, newerReport]));
      component.loadViaticoReports();

      const result = component.unifiedFiltered();
      expect(result.length).toBe(2);
      expect(result[0]._id).toBe('new');
      expect(result[1]._id).toBe('old');
    });

    it('filters by search term across name, email and place', () => {
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();

      component.filterSearch.set('cusco');
      expect(component.unifiedFiltered().length).toBe(1);
      expect(component.unifiedFiltered()[0]._id).toBe('via-1');

      component.filterSearch.set('nomatch');
      expect(component.unifiedFiltered().length).toBe(0);
    });

    it('filters by status', () => {
      const approvedReport: IExpenseReport = { ...baseViaticoReport, _id: 'approved-1', status: 'viatico_approved' };
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport, approvedReport]));
      component.loadViaticoReports();

      component.filterStatus.set('viatico_approved');
      const result = component.unifiedFiltered();
      expect(result.length).toBe(1);
      expect(result[0]._id).toBe('approved-1');
    });

    it('filters by date range (dateFrom/dateTo)', () => {
      const inRange: IExpenseReport = { ...baseViaticoReport, _id: 'in-range', createdAt: '2026-03-15T00:00:00Z' };
      const outOfRange: IExpenseReport = { ...baseViaticoReport, _id: 'out-of-range', createdAt: '2026-06-01T00:00:00Z' };
      expenseReportsService.getViaticosList.and.returnValue(of([inRange, outOfRange]));
      component.loadViaticoReports();

      component.filterDateFrom.set('2026-03-01');
      component.filterDateTo.set('2026-03-31');
      const result = component.unifiedFiltered();
      expect(result.length).toBe(1);
      expect(result[0]._id).toBe('in-range');
    });

    it('canApproveNow/canReject true when current user is among the pending step approverIds', () => {
      userState.getUser.and.returnValue({ _id: 'appr-1' } as any);
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      expect(item.canApproveNow).toBeTrue();
      expect(item.canReject).toBeTrue();
      expect(item.pendingApproverName).toBe('Ana Aprobadora');
    });

    it('canApproveNow true when the pending step has several approvers and the user is any of them', () => {
      const multiApproverReport: IExpenseReport = {
        ...baseViaticoReport,
        _id: 'multi-1',
        viaticoApproverChain: [
          chainStep([
            { _id: 'appr-1', name: 'Ana Aprobadora', email: 'ana@test.com' },
            { _id: 'appr-2', name: 'Beto Aprobador', email: 'beto@test.com' },
          ]),
        ],
      };
      userState.getUser.and.returnValue({ _id: 'appr-2' } as any);
      expenseReportsService.getViaticosList.and.returnValue(of([multiApproverReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      expect(item.canApproveNow).toBeTrue();
      expect(item.pendingApproverName).toBe('Ana Aprobadora / Beto Aprobador');
    });

    it('canApproveNow false when current user is not among the pending step approverIds', () => {
      userState.getUser.and.returnValue({ _id: 'someone-else' } as any);
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      expect(item.canApproveNow).toBeFalse();
      expect(item.canReject).toBeFalse();
    });

    it('canApproveNow true for any pending_l1 item when user is SuperAdmin', () => {
      userState.getUser.and.returnValue({ _id: 'irrelevant' } as any);
      userState.isSuperAdmin.and.returnValue(true);
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
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
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      component.openApproveModal(item);
      expect(component.pendingApproveItem()).toBe(item);
      expect(component.showApproveModal()).toBeTrue();
    });

    it('confirmApprove does nothing when there is no pending item', () => {
      component.confirmApprove();
      expect(expenseReportsService.approveViatico).not.toHaveBeenCalled();
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
      expect(component.showApproveModal()).toBeFalse();
      expect(component.isActing()).toBeFalse();
      expect(notifications.show).toHaveBeenCalledWith(
        `Solicitud aprobada (nivel ${(baseViaticoReport.viaticoApprovalLevel ?? 0) + 1} de ${baseViaticoReport.viaticoRequiredLevels})`,
        'success',
      );
      expect(component.reloadAll).toHaveBeenCalled();
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
      expenseReportsService.approveViatico.and.returnValue(throwError(() => ({ error: { message: 'Nivel de aprobación inválido' } })));
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      component.openApproveModal(item);
      component.confirmApprove();

      expect(component.showApproveModal()).toBeFalse();
      expect(component.isActing()).toBeFalse();
      expect(notifications.show).toHaveBeenCalledWith('Nivel de aprobación inválido', 'error');
    });

    it('confirmApprove shows fallback error message when backend has none', () => {
      expenseReportsService.approveViatico.and.returnValue(throwError(() => ({})));
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
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
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      component.rejectForm.patchValue({ rejectionReason: 'stale value here' });
      component.openRejectModal(item);
      expect(component.selectedItem()).toBe(item);
      expect(component.showRejectModal()).toBeTrue();
      expect(component.rejectForm.value.rejectionReason).toBeFalsy();
    });

    it('confirmReject does nothing when there is no selected item', () => {
      component.confirmReject();
      expect(expenseReportsService.rejectViatico).not.toHaveBeenCalled();
    });

    it('confirmReject does nothing when the form is invalid', () => {
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      component.openRejectModal(item);
      component.rejectForm.patchValue({ rejectionReason: 'short' });
      component.confirmReject();
      expect(expenseReportsService.rejectViatico).not.toHaveBeenCalled();
    });

    it('confirmReject calls expenseReportsService.rejectViatico with reason', () => {
      expenseReportsService.rejectViatico.and.returnValue(of({ ...baseViaticoReport, status: 'rejected' }));
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
      const item = component.unifiedFiltered()[0];
      spyOn(component, 'reloadAll');
      component.openRejectModal(item);
      component.rejectForm.patchValue({ rejectionReason: 'No cumple politica de viaticos' });
      component.confirmReject();

      expect(expenseReportsService.rejectViatico).toHaveBeenCalledWith('via-1', 'No cumple politica de viaticos');
      expect(notifications.show).toHaveBeenCalledWith('Solicitud rechazada', 'success');
      expect(component.showRejectModal()).toBeFalse();
      expect(component.isActing()).toBeFalse();
      expect(component.reloadAll).toHaveBeenCalled();
    });

    it('confirmReject shows backend error message on failure', () => {
      expenseReportsService.rejectViatico.and.returnValue(throwError(() => ({ error: { message: 'No autorizado' } })));
      expenseReportsService.getViaticosList.and.returnValue(of([baseViaticoReport]));
      component.loadViaticoReports();
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

    it('navigates to /mis-rendiciones/:id/detalle', () => {
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
