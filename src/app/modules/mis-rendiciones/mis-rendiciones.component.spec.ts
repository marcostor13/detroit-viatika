import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { MisRendicionesComponent } from './mis-rendiciones.component';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { ExpenseService } from '../../services/expense.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { AdvanceService } from '../../services/advance.service';
import { CajaChicaReportService } from '../../services/caja-chica-report.service';
import { InvoicesService } from '../invoices/services/invoices.service';
import { IExpenseReport } from '../../interfaces/expense-report.interface';
import { IAdvance } from '../../interfaces/advance.interface';

describe('MisRendicionesComponent', () => {
  let component: MisRendicionesComponent;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let expenseService: jasmine.SpyObj<ExpenseService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let notification: jasmine.SpyObj<NotificationService>;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let cajaChicaReportService: jasmine.SpyObj<CajaChicaReportService>;
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let router: jasmine.SpyObj<Router>;
  let queryParamMapGet: jasmine.Spy;

  function makeReport(overrides: Partial<IExpenseReport> = {}): IExpenseReport {
    return {
      _id: 'r1',
      title: 'Rendicion 1',
      budget: 100,
      userId: 'u1',
      clientId: 'c1',
      status: 'open',
      expenseIds: [],
      createdBy: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    } as IExpenseReport;
  }

  function makeAdvance(overrides: Partial<IAdvance> = {}): IAdvance {
    return {
      _id: 'a1',
      userId: 'u1',
      clientId: 'c1',
      amount: 200,
      description: 'Viatico',
      status: 'pending_l1',
      approvalLevel: 0,
      requiredLevels: 1,
      approvalHistory: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    } as IAdvance;
  }

  beforeEach(() => {
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', [
      'findAllByUser', 'getMyViaticos', 'getMyCajaChica', 'cancelRendicion', 'delete',
    ]);
    expenseService = jasmine.createSpyObj('ExpenseService', [
      'getMyDirectExpenses', 'submitMyDirectExpenses',
    ]);
    userState = jasmine.createSpyObj('UserStateService', [
      'getUser', 'canCreateRendicion', 'isColaborador', 'hasModulePermission', 'canAccessCajaChica',
    ]);
    notification = jasmine.createSpyObj('NotificationService', ['show']);
    advanceService = jasmine.createSpyObj('AdvanceService', ['findMy', 'delete']);
    cajaChicaReportService = jasmine.createSpyObj('CajaChicaReportService', ['findAll']);
    invoicesService = jasmine.createSpyObj('InvoicesService', ['getProjects']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    invoicesService.getProjects.and.returnValue(of([]));
    queryParamMapGet = jasmine.createSpy('get').and.returnValue(null);

    userState.getUser.and.returnValue({ _id: 'u1', companyId: 'c1' } as any);
    userState.canCreateRendicion.and.returnValue(true);
    userState.isColaborador.and.returnValue(true);
    userState.hasModulePermission.and.returnValue(false);
    userState.canAccessCajaChica.and.returnValue(true);

    expenseReportsService.findAllByUser.and.returnValue(of([]));
    expenseReportsService.getMyViaticos.and.returnValue(of([]));
    expenseReportsService.getMyCajaChica.and.returnValue(of([]));
    advanceService.findMy.and.returnValue(of([]));
    expenseService.getMyDirectExpenses.and.returnValue(of({ data: [], total: 0, page: 1, limit: 50, pages: 0 }));

    TestBed.configureTestingModule({
      imports: [MisRendicionesComponent],
      providers: [
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: ExpenseService, useValue: expenseService },
        { provide: UserStateService, useValue: userState },
        { provide: NotificationService, useValue: notification },
        { provide: AdvanceService, useValue: advanceService },
        { provide: CajaChicaReportService, useValue: cajaChicaReportService },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: queryParamMapGet } } },
        },
      ],
    });

    component = TestBed.createComponent(MisRendicionesComponent).componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('loads reports, advances and viaticos, and selects the first available tab', () => {
      component.ngOnInit();
      expect(expenseReportsService.findAllByUser).toHaveBeenCalledWith('u1', 'c1');
      expect(advanceService.findMy).toHaveBeenCalled();
      expect(expenseReportsService.getMyViaticos).toHaveBeenCalled();
      expect(component.activeTab()).toBe('viaticos');
    });

    it('respects the ?tab= query param when the user has access to it', () => {
      queryParamMapGet.and.returnValue('directas');
      component.ngOnInit();
      expect(component.activeTab()).toBe('directas');
    });

    it('falls back to the first available tab when the requested tab is not accessible', () => {
      queryParamMapGet.and.returnValue('caja-chica');
      userState.canAccessCajaChica.and.returnValue(false);
      component.ngOnInit();
      expect(component.activeTab()).toBe('viaticos');
    });

    it('loads caja chica reports when caja-chica is the initial tab', () => {
      queryParamMapGet.and.returnValue('caja-chica');
      component.ngOnInit();
      expect(expenseReportsService.getMyCajaChica).toHaveBeenCalled();
    });
  });

  describe('loadMyReports', () => {
    it('populates expenseReports on success', () => {
      const reports = [makeReport()];
      expenseReportsService.findAllByUser.and.returnValue(of(reports));
      component.loadMyReports();
      expect(component.expenseReports).toEqual(reports);
      expect(component.isLoading).toBeFalse();
    });

    it('stops loading without calling the service when clientId is missing', () => {
      userState.getUser.and.returnValue({ _id: 'u1' } as any);
      component.loadMyReports();
      expect(expenseReportsService.findAllByUser).not.toHaveBeenCalled();
      expect(component.isLoading).toBeFalse();
    });

    it('stops loading on error', () => {
      expenseReportsService.findAllByUser.and.returnValue(throwError(() => new Error('fail')));
      spyOn(console, 'error');
      component.loadMyReports();
      expect(component.isLoading).toBeFalse();
    });

    it('stops loading when there is no user', () => {
      userState.getUser.and.returnValue(null as any);
      component.loadMyReports();
      expect(component.isLoading).toBeFalse();
    });
  });

  describe('loadMyViaticoReports', () => {
    it('populates myViaticoReports on success', () => {
      const reports = [makeReport({ type: 'viatico' })];
      expenseReportsService.getMyViaticos.and.returnValue(of(reports));
      component.loadMyViaticoReports();
      expect(component.myViaticoReports()).toEqual(reports);
      expect(component.viaticoReportsLoading()).toBeFalse();
    });

    it('clears the loading flag on error', () => {
      expenseReportsService.getMyViaticos.and.returnValue(throwError(() => new Error('fail')));
      component.loadMyViaticoReports();
      expect(component.viaticoReportsLoading()).toBeFalse();
    });
  });

  describe('loadCajaChicaReports', () => {
    it('populates cajaChicaReports and marks it loaded', () => {
      const reports = [makeReport({ isCajaChica: true })];
      expenseReportsService.getMyCajaChica.and.returnValue(of(reports));
      component.loadCajaChicaReports();
      expect(component.cajaChicaReports()).toEqual(reports as any);
      expect(component.cajaChicaLoading()).toBeFalse();
      expect(component.cajaChicaLoaded).toBeTrue();
    });

    it('clears the loading flag on error without marking as loaded', () => {
      expenseReportsService.getMyCajaChica.and.returnValue(throwError(() => new Error('fail')));
      component.loadCajaChicaReports();
      expect(component.cajaChicaLoading()).toBeFalse();
      expect(component.cajaChicaLoaded).toBeFalse();
    });
  });

  describe('setTab', () => {
    it('sets the active tab', () => {
      component.setTab('directas');
      expect(component.activeTab()).toBe('directas');
    });

    it('loads caja chica reports only the first time the tab is selected', () => {
      component.setTab('caja-chica');
      expect(expenseReportsService.getMyCajaChica).toHaveBeenCalledTimes(1);
      component.setTab('viaticos');
      component.setTab('caja-chica');
      expect(expenseReportsService.getMyCajaChica).toHaveBeenCalledTimes(1);
    });
  });

  describe('directaReports', () => {
    it('returns only isDirecta reports, sorted by createdAt desc', () => {
      component.expenseReports = [
        makeReport({ _id: 'd1', isDirecta: true, createdAt: '2026-01-01T00:00:00.000Z' }),
        makeReport({ _id: 'd2', isDirecta: true, createdAt: '2026-02-01T00:00:00.000Z' }),
        makeReport({ _id: 'd3', isDirecta: false }),
      ];
      expect(component.directaReports.map(r => r._id)).toEqual(['d2', 'd1']);
    });
  });

  describe('viaticosReports', () => {
    it('excludes directa reports', () => {
      component.expenseReports = [
        makeReport({ _id: 'v1', isDirecta: false }),
        makeReport({ _id: 'd1', isDirecta: true }),
      ];
      expect(component.viaticosReports.map(r => r._id)).toEqual(['v1']);
    });
  });

  describe('loosePendingCount / loosePendingTotal', () => {
    it('counts and sums only expenses without an expenseReportId', () => {
      component.directaExpenses.set([
        { total: '10.5', expenseReportId: null },
        { total: '5', expenseReportId: 'r1' },
        { total: '4.5', expenseReportId: null },
      ]);
      expect(component.loosePendingCount).toBe(2);
      expect(component.loosePendingTotal).toBe(15);
    });
  });

  describe('submitDirectas', () => {
    beforeEach(() => {
      component.directaExpenses.set([{ total: 10, expenseReportId: null }]);
    });

    it('does nothing when there are no loose pending expenses', () => {
      component.directaExpenses.set([]);
      component.submitDirectas();
      expect(expenseService.submitMyDirectExpenses).not.toHaveBeenCalled();
    });

    it('submits and reloads on success', () => {
      expenseService.submitMyDirectExpenses.and.returnValue(of({ reportId: 'r1', expensesSubmitted: 1 }));
      component.submitDirectas();
      expect(notification.show).toHaveBeenCalledWith('Documentos enviados a Contabilidad.', 'success');
      expect(component.isSubmittingDirectas()).toBeFalse();
      expect(expenseReportsService.findAllByUser).toHaveBeenCalled();
    });

    it('shows an error notification on failure', () => {
      expenseService.submitMyDirectExpenses.and.returnValue(
        throwError(() => ({ error: { message: 'boom' } }))
      );
      component.submitDirectas();
      expect(notification.show).toHaveBeenCalledWith('boom', 'error');
      expect(component.isSubmittingDirectas()).toBeFalse();
    });

    it('joins array error messages', () => {
      expenseService.submitMyDirectExpenses.and.returnValue(
        throwError(() => ({ error: { message: ['a', 'b'] } }))
      );
      component.submitDirectas();
      expect(notification.show).toHaveBeenCalledWith('a, b', 'error');
    });
  });

  describe('getDirectaTipoCode', () => {
    it('maps planilla_movilidad to PM', () => {
      expect(component.getDirectaTipoCode({ expenseType: 'planilla_movilidad' })).toBe('PM');
    });

    it('maps recibo_caja to H', () => {
      expect(component.getDirectaTipoCode({ expenseType: 'recibo_caja' })).toBe('H');
    });

    it('maps otros_gastos sub-types', () => {
      expect(component.getDirectaTipoCode({ expenseType: 'otros_gastos', subTipo: 'TK' })).toBe('TK');
      expect(component.getDirectaTipoCode({ expenseType: 'otros_gastos', subTipo: 'BV' })).toBe('BV');
      expect(component.getDirectaTipoCode({ expenseType: 'otros_gastos' })).toBe('SC');
    });

    it('maps factura tipoComprobante codes', () => {
      expect(component.getDirectaTipoCode({ expenseType: 'factura', data: { tipoComprobante: '03' } })).toBe('BV');
      expect(component.getDirectaTipoCode({ expenseType: 'factura', data: { tipoComprobante: '12' } })).toBe('TK');
      expect(component.getDirectaTipoCode({ expenseType: 'factura', data: { tipoComprobante: '01' } })).toBe('FE');
      expect(component.getDirectaTipoCode({ expenseType: 'factura', data: {} })).toBe('FT');
    });
  });

  describe('getDirectaEstado', () => {
    it('returns "Sin enviar" when there is no linked report', () => {
      expect(component.getDirectaEstado({}).label).toBe('Sin enviar');
    });

    it('maps _reportStatus to the right label', () => {
      expect(component.getDirectaEstado({ expenseReportId: 'r1', _reportStatus: 'pending_accounting' }).label).toBe('En revision');
      expect(component.getDirectaEstado({ expenseReportId: 'r1', _reportStatus: 'approved' }).label).toBe('Aprobado');
      expect(component.getDirectaEstado({ expenseReportId: 'r1', _reportStatus: 'rejected' }).label).toBe('Rechazado');
    });

    it('falls back to "Revisado" when approvalCont is approved', () => {
      expect(component.getDirectaEstado({ expenseReportId: 'r1', approvalCont: { status: 'approved' } }).label).toBe('Revisado');
    });

    it('defaults to "Enviado"', () => {
      expect(component.getDirectaEstado({ expenseReportId: 'r1' }).label).toBe('Enviado');
    });
  });

  describe('canDeleteReport', () => {
    it('allows deletion for a solicited report without approvals', () => {
      const report = makeReport({ status: 'solicited' });
      expect(component.canDeleteReport(report)).toBeTrue();
    });

    it('blocks deletion when the report has a coordinator approval', () => {
      const report = makeReport({ status: 'solicited', coordinatorApprovedBy: 'u2' });
      expect(component.canDeleteReport(report)).toBeFalse();
    });

    it('blocks deletion when an expense was already approved', () => {
      const report = makeReport({ status: 'solicited', hasApprovedExpense: true });
      expect(component.canDeleteReport(report)).toBeFalse();
    });

    it('blocks deletion of a directa created by someone else', () => {
      const report = makeReport({ status: 'solicited', isDirecta: true, createdByOther: true });
      expect(component.canDeleteReport(report)).toBeFalse();
    });

    it('blocks deletion of a directa with inherited balance and existing expenses', () => {
      const report = makeReport({
        status: 'open', isDirecta: true, inheritedBalance: true, expenseIds: [{ _id: 'e1' }],
      });
      expect(component.canDeleteReport(report)).toBeFalse();
    });

    it('blocks deletion of caja chica already referenced by contabilidad', () => {
      const report = makeReport({ status: 'open', isCajaChica: true, referencedByCajaChica: true });
      expect(component.canDeleteReport(report)).toBeFalse();
    });

    it('blocks deletion when the linked advance was already approved', () => {
      const report = makeReport({ status: 'open', hasApprovedLinkedAdvance: true });
      expect(component.canDeleteReport(report)).toBeFalse();
    });

    it('blocks deletion of a paid viatico not pending approval', () => {
      const report = makeReport({ status: 'open', type: 'viatico', viaticoPaidAmount: 100 } as any);
      expect(component.canDeleteReport(report)).toBeFalse();
    });

    it('allows deletion of a viatico pending approval even if prefinanced', () => {
      const report = makeReport({ status: 'pending_l1', type: 'viatico', viaticoPaidAmount: 100, expenseIds: [] } as any);
      expect(component.canDeleteReport(report)).toBeTrue();
    });

    it('allows deletion of pending_l1 viatico without expenses', () => {
      const report = makeReport({ status: 'pending_l1', expenseIds: [] });
      expect(component.canDeleteReport(report)).toBeTrue();
    });

    it('blocks deletion for statuses outside the deletable set', () => {
      const report = makeReport({ status: 'approved' });
      expect(component.canDeleteReport(report)).toBeFalse();
    });
  });

  describe('confirmDeleteReport', () => {
    it('does nothing when no report is set for deletion', () => {
      component.confirmDeleteReport();
      expect(expenseReportsService.delete).not.toHaveBeenCalled();
    });

    it('deletes and reloads viaticos data when the active tab is viaticos', () => {
      const report = makeReport();
      component.deletingReport.set(report);
      expenseReportsService.delete.and.returnValue(of({}));
      component.activeTab.set('viaticos');
      component.confirmDeleteReport();
      expect(expenseReportsService.delete).toHaveBeenCalledWith('r1');
      expect(notification.show).toHaveBeenCalledWith('Solicitud eliminada correctamente', 'success');
      expect(component.showDeleteReportModal()).toBeFalse();
      expect(expenseReportsService.getMyViaticos).toHaveBeenCalled();
      expect(advanceService.findMy).toHaveBeenCalled();
    });

    it('reloads caja chica reports when the active tab is caja-chica', () => {
      const report = makeReport();
      component.deletingReport.set(report);
      expenseReportsService.delete.and.returnValue(of({}));
      component.activeTab.set('caja-chica');
      component.confirmDeleteReport();
      expect(expenseReportsService.getMyCajaChica).toHaveBeenCalled();
    });

    it('shows an error notification on failure', () => {
      const report = makeReport();
      component.deletingReport.set(report);
      expenseReportsService.delete.and.returnValue(throwError(() => ({ error: { message: 'nope' } })));
      component.confirmDeleteReport();
      expect(notification.show).toHaveBeenCalledWith('nope', 'error');
      expect(component.isDeletingReport()).toBeFalse();
    });
  });

  describe('confirmCancelReport', () => {
    it('does nothing without a report set', () => {
      component.confirmCancelReport();
      expect(expenseReportsService.cancelRendicion).not.toHaveBeenCalled();
    });

    it('cancels the report and reloads on success', () => {
      const report = makeReport();
      component.cancellingReport.set(report);
      component.cancelReportReason.set('motivo');
      expenseReportsService.cancelRendicion.and.returnValue(of(report));
      component.confirmCancelReport();
      expect(expenseReportsService.cancelRendicion).toHaveBeenCalledWith('r1', 'motivo');
      expect(notification.show).toHaveBeenCalledWith('Rendicion cancelada correctamente', 'success');
      expect(component.showCancelReportModal()).toBeFalse();
    });

    it('shows an error notification on failure', () => {
      const report = makeReport();
      component.cancellingReport.set(report);
      expenseReportsService.cancelRendicion.and.returnValue(throwError(() => ({ error: { message: ['x', 'y'] } })));
      component.confirmCancelReport();
      expect(notification.show).toHaveBeenCalledWith('x, y', 'error');
      expect(component.isCancellingReport()).toBeFalse();
    });
  });

  describe('canDeleteAdvance', () => {
    it('allows deletion of a pending advance without approvals', () => {
      expect(component.canDeleteAdvance(makeAdvance({ status: 'pending_l1', approvalHistory: [] }))).toBeTrue();
    });

    it('blocks deletion when there is an approval entry', () => {
      const adv = makeAdvance({
        status: 'pending_l1',
        approvalHistory: [{ level: 1, approvedBy: 'u2', action: 'approved', date: '2026-01-01' }],
      });
      expect(component.canDeleteAdvance(adv)).toBeFalse();
    });

    it('blocks deletion for non-deletable statuses', () => {
      expect(component.canDeleteAdvance(makeAdvance({ status: 'approved' }))).toBeFalse();
    });

    it('allows deletion of a rejected advance', () => {
      expect(component.canDeleteAdvance(makeAdvance({ status: 'rejected' }))).toBeTrue();
    });
  });

  describe('confirmDeleteAdvance', () => {
    it('does nothing without an advance set', () => {
      component.confirmDeleteAdvance();
      expect(advanceService.delete).not.toHaveBeenCalled();
    });

    it('deletes and reloads advances on success', () => {
      const adv = makeAdvance();
      component.deletingAdvance.set(adv);
      advanceService.delete.and.returnValue(of(adv));
      component.confirmDeleteAdvance();
      expect(advanceService.delete).toHaveBeenCalledWith('a1');
      expect(notification.show).toHaveBeenCalledWith('Solicitud eliminada correctamente', 'success');
      expect(advanceService.findMy).toHaveBeenCalled();
    });

    it('shows an error notification on failure', () => {
      const adv = makeAdvance();
      component.deletingAdvance.set(adv);
      advanceService.delete.and.returnValue(throwError(() => ({ error: { message: 'fail' } })));
      component.confirmDeleteAdvance();
      expect(notification.show).toHaveBeenCalledWith('fail', 'error');
      expect(component.isDeletingAdvance()).toBeFalse();
    });
  });

  describe('filteredMyViaticoReports', () => {
    it('filters by status and date range and sorts by createdAt desc', () => {
      component.myViaticoReports.set([
        makeReport({ _id: 'v1', status: 'pending_l1', createdAt: '2026-01-01T00:00:00.000Z' }),
        makeReport({ _id: 'v2', status: 'approved', createdAt: '2026-02-01T00:00:00.000Z' }),
      ]);
      component.viaticosStatusFilter.set('approved');
      expect(component.filteredMyViaticoReports.map(r => r._id)).toEqual(['v2']);
    });
  });

  describe('filteredPendingAdvances', () => {
    it('excludes advances already linked to an expense report', () => {
      component.myAdvances = [
        makeAdvance({ _id: 'a1' }),
        makeAdvance({ _id: 'a2', expenseReportId: { _id: 'r1', title: 't', status: 'open' } }),
      ];
      expect(component.filteredPendingAdvances.map(a => a._id)).toEqual(['a1']);
    });
  });

  describe('unifiedViaticoList', () => {
    it('merges new viaticos, pending advances and legacy rendiciones', () => {
      component.myViaticoReports.set([makeReport({ _id: 'v1', type: 'viatico', createdAt: '2026-03-01T00:00:00.000Z' })]);
      component.myAdvances = [makeAdvance({ _id: 'a1', createdAt: '2026-02-01T00:00:00.000Z' })];
      component.expenseReports = [makeReport({ _id: 'r1', type: 'rendicion', createdAt: '2026-01-01T00:00:00.000Z' })];

      const list = component.unifiedViaticoList;
      expect(list.map(i => i._id)).toEqual(['v1', 'a1', 'r1']);
      expect(list[0].source).toBe('new');
      expect(list[1].source).toBe('advance');
      expect(list[2].source).toBe('rendicion');
    });

    it('filters by status across all sources', () => {
      component.myViaticoReports.set([makeReport({ _id: 'v1', type: 'viatico', status: 'approved' })]);
      component.myAdvances = [makeAdvance({ _id: 'a1', status: 'pending_l1' })];
      component.viaticosStatusFilter.set('approved');
      expect(component.unifiedViaticoList.map(i => i._id)).toEqual(['v1']);
    });
  });

  describe('navigateToUnifiedItem', () => {
    const event = { preventDefault: () => {}, stopPropagation: () => {} } as Event;

    it('navigates to detail for new/rendicion sources', () => {
      component.navigateToUnifiedItem(
        { _id: 'v1', source: 'new' } as any, event
      );
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'v1', 'detalle'], { queryParams: { tab: 'viaticos' } });
    });

    it('opens resubmit for editable/resubmittable advances', () => {
      const adv = makeAdvance();
      component.navigateToUnifiedItem(
        { _id: 'a1', source: 'advance', canEdit: true, canResubmit: false, raw: adv } as any, event
      );
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones/solicitud-viaticos', 'a1', 'editar']);
    });

    it('does nothing for a non-editable, non-resubmittable advance', () => {
      const adv = makeAdvance();
      component.navigateToUnifiedItem(
        { _id: 'a1', source: 'advance', canEdit: false, canResubmit: false, raw: adv } as any, event
      );
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('canDeleteUnifiedItem', () => {
    it('delegates to canDeleteAdvance for advance items', () => {
      const adv = makeAdvance({ status: 'pending_l1', approvalHistory: [] });
      expect(component.canDeleteUnifiedItem({ source: 'advance', raw: adv } as any)).toBeTrue();
    });

    it('delegates to canDeleteReport for new items', () => {
      const report = makeReport({ status: 'solicited' });
      expect(component.canDeleteUnifiedItem({ source: 'new', raw: report } as any)).toBeTrue();
    });

    it('returns false for rendicion items (no delete supported)', () => {
      const report = makeReport({ status: 'solicited' });
      expect(component.canDeleteUnifiedItem({ source: 'rendicion', raw: report } as any)).toBeFalse();
    });
  });

  describe('getSaldoLibre / getTotalGastado', () => {
    it('sums expense totals and subtracts from budget', () => {
      const report = makeReport({ budget: 100, expenseIds: [{ total: '30' }, { total: '20' }] });
      expect(component.getTotalGastado(report)).toBe(50);
      expect(component.getSaldoLibre(report)).toBe(50);
    });

    it('returns 0 total when there are no expenses', () => {
      const report = makeReport({ expenseIds: [] });
      expect(component.getTotalGastado(report)).toBe(0);
    });
  });

  describe('isReportInProgress', () => {
    it('is false when status is not open', () => {
      const report = makeReport({ status: 'approved' });
      expect(component.isReportInProgress(report)).toBeFalse();
    });

    it('is true when a linked advance is paid/partially_paid/settled', () => {
      const report = makeReport({ _id: 'r1', status: 'open' });
      component.myAdvances = [
        makeAdvance({ status: 'paid', expenseReportId: { _id: 'r1', title: 't', status: 'open' } }),
      ];
      expect(component.isReportInProgress(report)).toBeTrue();
    });
  });

  describe('hasExpenseReportLink / getExpenseReportId', () => {
    it('resolves the id from a populated object', () => {
      const adv = makeAdvance({ expenseReportId: { _id: 'r9', title: 't', status: 'open' } });
      expect(component.getExpenseReportId(adv)).toBe('r9');
      expect(component.hasExpenseReportLink(adv)).toBeTrue();
    });

    it('resolves the id from a plain string', () => {
      const adv = makeAdvance({ expenseReportId: 'r9' });
      expect(component.getExpenseReportId(adv)).toBe('r9');
    });

    it('returns null when there is no link', () => {
      const adv = makeAdvance({ expenseReportId: undefined });
      expect(component.getExpenseReportId(adv)).toBeNull();
      expect(component.hasExpenseReportLink(adv)).toBeFalse();
    });
  });

  describe('navigation helpers', () => {
    it('openNuevaRendicionDirecta navigates to the creation route', () => {
      component.openNuevaRendicionDirecta();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones/nueva']);
    });

    it('navigateToNuevaCajaChica navigates to the caja chica creation route', () => {
      component.navigateToNuevaCajaChica();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones/nueva-caja-chica']);
    });

    it('openViaticosModal navigates to the new viatico request route', () => {
      component.openViaticosModal();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones/solicitud-viaticos/nueva']);
    });

    it('selectGastoType navigates with the chosen tipo and directa mode', () => {
      component.selectGastoType('factura');
      expect(router.navigate).toHaveBeenCalledWith(['/invoices/add'], { queryParams: { tipo: 'factura', mode: 'directa' } });
      expect(component.showTypeModal).toBeFalse();
    });

    it('navigateToAdvanceReport navigates only when a linked report exists', () => {
      const adv = makeAdvance({ expenseReportId: { _id: 'r5', title: 't', status: 'open' } });
      component.navigateToAdvanceReport(adv);
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'r5', 'detalle']);
    });

    it('navigateToAdvanceReport does nothing without a linked report', () => {
      const adv = makeAdvance({ expenseReportId: undefined });
      component.navigateToAdvanceReport(adv);
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('onModalClose', () => {
    it('reloads reports when the modal closed successfully', () => {
      component.onModalClose(true);
      expect(component.showCreateModal).toBeFalse();
      expect(expenseReportsService.findAllByUser).toHaveBeenCalled();
    });

    it('does not reload when the modal was cancelled', () => {
      expenseReportsService.findAllByUser.calls.reset();
      component.onModalClose(false);
      expect(expenseReportsService.findAllByUser).not.toHaveBeenCalled();
    });
  });

  describe('toggleGuidelines', () => {
    it('toggles the guidelines flag', () => {
      expect(component.showGuidelines()).toBeFalse();
      component.toggleGuidelines();
      expect(component.showGuidelines()).toBeTrue();
      component.toggleGuidelines();
      expect(component.showGuidelines()).toBeFalse();
    });
  });

  describe('panelStatusText / getLegacyReportLabel', () => {
    it('shows "EN PROGRESO" text when the report is in progress', () => {
      const report = makeReport({ _id: 'r1', status: 'open' });
      component.myAdvances = [makeAdvance({ status: 'paid', expenseReportId: { _id: 'r1', title: 't', status: 'open' } })];
      expect(component.panelStatusText(report)).toBe('EN PROGRESO - REGISTRANDO GASTOS');
    });

    it('maps known statuses to their spanish label', () => {
      expect(component.panelStatusText(makeReport({ status: 'rejected' }))).toBe('RECHAZADA');
    });

    it('getLegacyReportLabel reflects effectively-closed reports', () => {
      const report = makeReport({ status: 'closed' });
      expect(component.getLegacyReportLabel(report)).toBe('Cerrada');
    });
  });

  describe('currentUserId / canCreateRendicion / canViewViaticos / canAccessCajaChica', () => {
    it('reads values through the injected services', () => {
      expect(component.currentUserId).toBe('u1');
      expect(component.canCreateRendicion).toBeTrue();
      expect(component.canViewViaticos).toBeTrue();
      expect(component.canAccessCajaChica).toBeTrue();
    });
  });
});
