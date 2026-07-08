import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RendicionesAdminComponent } from './rendiciones-admin.component';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { AdminUsersService } from '../services/admin-users.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { UserStateService } from '../../../services/user-state.service';
import { NotificationService } from '../../../services/notification.service';
import { AdvanceService } from '../../../services/advance.service';
import { CategoriaService } from '../../../services/categoria.service';
import { IExpenseReport } from '../../../interfaces/expense-report.interface';
import { IAdvance } from '../../../interfaces/advance.interface';

describe('RendicionesAdminComponent', () => {
  let component: RendicionesAdminComponent;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let adminUsersService: jasmine.SpyObj<AdminUsersService>;
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let userStateService: jasmine.SpyObj<UserStateService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let categoriaService: jasmine.SpyObj<CategoriaService>;

  const mockReport: IExpenseReport = {
    _id: 'rep1',
    title: 'Rendicion 1',
    budget: 100,
    userId: { _id: 'u1', name: 'Alice' },
    clientId: 'c1',
    type: 'viatico',
    status: 'pending_l1',
    expenseIds: [],
    createdBy: 'u1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectId: { _id: 'p1', name: 'Proyecto 1' },
    viaticoAmount: 100,
    viaticoApprovalLevel: 0,
    viaticoRequiredLevels: 1,
    viaticoApproverChain: ['u2'],
  };

  const mockAdvance: IAdvance = {
    _id: 'adv1',
    userId: { _id: 'u2', name: 'Bob', email: 'bob@test.com' },
    clientId: 'c1',
    amount: 50,
    description: 'Anticipo',
    status: 'pending_l1',
    approvalLevel: 0,
    requiredLevels: 1,
    approvalHistory: [],
    approverChain: ['u2'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', [
      'findAllByClient', 'getDeletionPreview', 'delete',
      'approveViatico', 'approveViaticoContabilidad', 'approveDirecta',
      'rejectViatico', 'rejectDirecta',
    ]);
    adminUsersService = jasmine.createSpyObj('AdminUsersService', ['getUsers']);
    invoicesService = jasmine.createSpyObj('InvoicesService', ['getProjects']);
    userStateService = jasmine.createSpyObj('UserStateService', [
      'getUser', 'isSuperAdmin', 'isCoordinador', 'isContabilidad', 'canApproveL2',
    ]);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    advanceService = jasmine.createSpyObj('AdvanceService', ['findOrphaned', 'approve', 'reject']);
    categoriaService = jasmine.createSpyObj('CategoriaService', ['getAllFlat']);

    userStateService.getUser.and.returnValue({ _id: 'u2', companyId: 'c1' } as any);
    userStateService.isSuperAdmin.and.returnValue(false);
    userStateService.isCoordinador.and.returnValue(false);
    userStateService.isContabilidad.and.returnValue(false);
    userStateService.canApproveL2.and.returnValue(false);

    expenseReportsService.findAllByClient.and.returnValue(of([mockReport]));
    advanceService.findOrphaned.and.returnValue(of([mockAdvance]));
    adminUsersService.getUsers.and.returnValue(of([]));
    invoicesService.getProjects.and.returnValue(of([]));
    categoriaService.getAllFlat.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [RendicionesAdminComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: UserStateService, useValue: userStateService },
        { provide: NotificationService, useValue: notifications },
        { provide: AdvanceService, useValue: advanceService },
        { provide: CategoriaService, useValue: categoriaService },
      ],
    });

    component = TestBed.createComponent(RendicionesAdminComponent).componentInstance;
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit / loadData', () => {
    it('builds the reject form and loads reports, advances, users, projects and categories', () => {
      component.ngOnInit();
      expect(component.rejectForm).toBeTruthy();
      expect(component.isLoading).toBeFalse();
      expect(component.filteredItems.length).toBe(2);
    });

    it('preselects the userId filter from the query params', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [RendicionesAdminComponent],
        providers: [
          { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => 'u1' } } } },
          { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
          { provide: ExpenseReportsService, useValue: expenseReportsService },
          { provide: AdminUsersService, useValue: adminUsersService },
          { provide: InvoicesService, useValue: invoicesService },
          { provide: UserStateService, useValue: userStateService },
          { provide: NotificationService, useValue: notifications },
          { provide: AdvanceService, useValue: advanceService },
          { provide: CategoriaService, useValue: categoriaService },
        ],
      });
      const c = TestBed.createComponent(RendicionesAdminComponent).componentInstance;
      c.ngOnInit();
      expect(c.filterUserId).toBe('u1');
    });

    it('excludes isDirecta reports for non-coordinador roles', () => {
      const directaReport = { ...mockReport, _id: 'rep2', isDirecta: true };
      expenseReportsService.findAllByClient.and.returnValue(of([mockReport, directaReport]));
      component.ngOnInit();
      expect(component.filteredItems.some((i) => i._id === 'rep2')).toBeFalse();
    });

    it('keeps isDirecta reports when the user is Coordinador', () => {
      userStateService.isCoordinador.and.returnValue(true);
      const directaReport = { ...mockReport, _id: 'rep2', isDirecta: true };
      expenseReportsService.findAllByClient.and.returnValue(of([mockReport, directaReport]));
      component.ngOnInit();
      expect(component.filteredItems.some((i) => i._id === 'rep2')).toBeTrue();
    });

    it('stops loading on error from reports/advances', () => {
      expenseReportsService.findAllByClient.and.returnValue(throwError(() => new Error('fail')));
      component.ngOnInit();
      expect(component.isLoading).toBeFalse();
    });

    it('does nothing when there is no resolvable clientId', () => {
      userStateService.getUser.and.returnValue({ _id: 'u2' } as any);
      component.ngOnInit();
      expect(component.isLoading).toBeFalse();
      expect(expenseReportsService.findAllByClient).not.toHaveBeenCalled();
    });
  });

  describe('applyFilters', () => {
    beforeEach(() => component.ngOnInit());

    it('maps report and advance items with derived fields', () => {
      const reportItem = component.filteredItems.find((i) => i._id === 'rep1')!;
      expect(reportItem.userName).toBe('Alice');
      expect(reportItem.source).toBe('report');
      const advanceItem = component.filteredItems.find((i) => i._id === 'adv1')!;
      expect(advanceItem.userName).toBe('Bob');
      expect(advanceItem.source).toBe('advance');
    });

    it('filters by userId', () => {
      component.filterUserId = 'u1';
      component.applyFilters();
      expect(component.filteredItems.every((i) => i.userId === 'u1')).toBeTrue();
    });

    it('filters by projectId', () => {
      component.filterProjectId = 'p1';
      component.applyFilters();
      expect(component.filteredItems.every((i) => i.projectId === 'p1')).toBeTrue();
    });

    it('clearFilters resets all filter fields', () => {
      component.filterUserId = 'u1';
      component.filterProjectId = 'p1';
      component.filterDateFrom = '2024-01-01';
      component.filterDateTo = '2024-01-31';
      component.clearFilters();
      expect(component.filterUserId).toBe('');
      expect(component.filterProjectId).toBe('');
      expect(component.filterDateFrom).toBe('');
      expect(component.filterDateTo).toBe('');
    });

    it('hasActiveFilters reflects whether any filter is set', () => {
      expect(component.hasActiveFilters).toBeFalse();
      component.filterUserId = 'u1';
      expect(component.hasActiveFilters).toBeTrue();
    });
  });

  describe('approve flow', () => {
    beforeEach(() => component.ngOnInit());

    it('approves a viatico report and reloads data', () => {
      const item = component.filteredItems.find((i) => i._id === 'rep1')!;
      expenseReportsService.approveViatico.and.returnValue(of(mockReport));
      component.openApproveModal(item);
      component.confirmApprove();
      expect(expenseReportsService.approveViatico).toHaveBeenCalledWith('rep1');
      expect(notifications.show).toHaveBeenCalled();
      expect(component.showApproveModal()).toBeFalse();
    });

    it('approves an advance', () => {
      const item = component.filteredItems.find((i) => i._id === 'adv1')!;
      advanceService.approve.and.returnValue(of(mockAdvance));
      component.openApproveModal(item);
      component.confirmApprove();
      expect(advanceService.approve).toHaveBeenCalledWith('adv1', {});
    });

    it('shows an error notification when approval fails', () => {
      const item = component.filteredItems.find((i) => i._id === 'rep1')!;
      expenseReportsService.approveViatico.and.returnValue(throwError(() => ({ error: { message: 'nope' } })));
      component.openApproveModal(item);
      component.confirmApprove();
      expect(notifications.show).toHaveBeenCalledWith('nope', 'error');
    });

    it('does nothing when there is no pending item', () => {
      component.confirmApprove();
      expect(expenseReportsService.approveViatico).not.toHaveBeenCalled();
      expect(advanceService.approve).not.toHaveBeenCalled();
    });
  });

  describe('reject flow', () => {
    beforeEach(() => component.ngOnInit());

    it('does nothing when the reject form is invalid', () => {
      const item = component.filteredItems.find((i) => i._id === 'rep1')!;
      component.openRejectModal(item);
      component.confirmReject();
      expect(expenseReportsService.rejectViatico).not.toHaveBeenCalled();
    });

    it('rejects a viatico report with the given reason', () => {
      const item = component.filteredItems.find((i) => i._id === 'rep1')!;
      expenseReportsService.rejectViatico.and.returnValue(of(mockReport));
      component.openRejectModal(item);
      component.rejectForm.patchValue({ rejectionReason: 'Motivo suficientemente largo' });
      component.confirmReject();
      expect(expenseReportsService.rejectViatico).toHaveBeenCalledWith('rep1', 'Motivo suficientemente largo');
      expect(notifications.show).toHaveBeenCalledWith('Solicitud rechazada', 'success');
    });

    it('rejects an advance', () => {
      const item = component.filteredItems.find((i) => i._id === 'adv1')!;
      advanceService.reject.and.returnValue(of(mockAdvance));
      component.openRejectModal(item);
      component.rejectForm.patchValue({ rejectionReason: 'Motivo suficientemente largo' });
      component.confirmReject();
      expect(advanceService.reject).toHaveBeenCalledWith('adv1', { rejectionReason: 'Motivo suficientemente largo' });
    });
  });

  describe('delete flow', () => {
    beforeEach(() => component.ngOnInit());

    it('loads the deletion preview for a deletable report', () => {
      const item = component.filteredItems.find((i) => i._id === 'rep1')!;
      expenseReportsService.getDeletionPreview.and.returnValue(of({
        allowed: true, isDirecta: false, isCajaChica: false, budget: 100,
        expensesCount: 0, expensesTotal: 0, filesCount: 0, linkedAdvances: [], cajaChicaReferenced: false,
      }));
      component.openDeleteModal(item);
      expect(component.reportToDelete?._id).toBe('rep1');
      expect(component.deletionPreview()?.allowed).toBeTrue();
    });

    it('ignores delete requests for advance items', () => {
      const item = component.filteredItems.find((i) => i._id === 'adv1')!;
      component.openDeleteModal(item);
      expect(component.reportToDelete).toBeNull();
    });

    it('confirmDelete removes the report from the local list on success', () => {
      component.reportToDelete = mockReport;
      expenseReportsService.delete.and.returnValue(of(undefined));
      component.confirmDelete();
      expect(notifications.show).toHaveBeenCalledWith('Rendicion eliminada.', 'success');
      expect(component.reportToDelete).toBeNull();
    });

    it('confirmDelete shows the backend error message on failure', () => {
      component.reportToDelete = mockReport;
      expenseReportsService.delete.and.returnValue(throwError(() => ({ error: { message: 'No se puede' } })));
      component.confirmDelete();
      expect(notifications.show).toHaveBeenCalledWith('No se puede', 'error');
    });

    it('cancelDelete clears the pending report and preview', () => {
      component.reportToDelete = mockReport;
      component.deletionPreview.set({ allowed: true } as any);
      component.cancelDelete();
      expect(component.reportToDelete).toBeNull();
      expect(component.deletionPreview()).toBeNull();
    });
  });

  describe('goToDetail', () => {
    beforeEach(() => component.ngOnInit());

    it('opens the detail modal when the item can be approved/rejected', () => {
      const item = component.filteredItems.find((i) => i._id === 'rep1')!;
      component.goToDetail(item);
      expect(component.showDetailModal()).toBeTrue();
      expect(component.detailItem()).toEqual(item);
    });
  });

  describe('advanceStatusLabel', () => {
    it('returns the localized label for a known status', () => {
      expect(component.advanceStatusLabel('paid')).toBe('Pagado');
    });

    it('falls back to the raw status for unknown values', () => {
      expect(component.advanceStatusLabel('unknown_status')).toBe('unknown_status');
    });
  });

  describe('toggleExpand / isExpanded', () => {
    it('toggles a row id in and out of the expanded set', () => {
      expect(component.isExpanded('rep1')).toBeFalse();
      component.toggleExpand('rep1');
      expect(component.isExpanded('rep1')).toBeTrue();
      component.toggleExpand('rep1');
      expect(component.isExpanded('rep1')).toBeFalse();
    });
  });
});
