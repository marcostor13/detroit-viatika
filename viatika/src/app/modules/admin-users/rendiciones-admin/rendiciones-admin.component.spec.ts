import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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
  let router: jasmine.SpyObj<Router>;

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
    projectId: { _id: 'p1', code: 'CC-01', name: 'Proyecto 1' },
    viaticoOrdenTrabajoId: { _id: 'ot1', nombre: 'LIM-SMI-1946' },
    viaticoAmount: 100,
    viaticoApprovalLevel: 0,
    viaticoRequiredLevels: 1,
    viaticoApproverChain: [
      { level: 2, projectId: 'p1', projectRole: 'seleccionado', approverIds: ['u2'] },
    ],
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
      'findAllByClient', 'getDeletionPreview', 'delete', 'findOne',
      'approveViatico', 'approveViaticoContabilidad',
      'rejectViatico',
    ]);
    adminUsersService = jasmine.createSpyObj('AdminUsersService', ['getUsers']);
    invoicesService = jasmine.createSpyObj('InvoicesService', ['getProjects']);
    userStateService = jasmine.createSpyObj('UserStateService', [
      'getUser', 'isSuperAdmin', 'isCoordinador', 'isApprover', 'isContabilidad', 'canApproveL2',
      'canAccessPagos',
    ]);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    advanceService = jasmine.createSpyObj('AdvanceService', ['findOrphaned', 'approve', 'reject']);
    categoriaService = jasmine.createSpyObj('CategoriaService', ['getAllFlat']);

    userStateService.getUser.and.returnValue({ _id: 'u2', companyId: 'c1' } as any);
    userStateService.isSuperAdmin.and.returnValue(false);
    userStateService.isCoordinador.and.returnValue(false);
    userStateService.isApprover.and.returnValue(false);
    userStateService.isContabilidad.and.returnValue(false);
    userStateService.canApproveL2.and.returnValue(false);
    userStateService.canAccessPagos.and.returnValue(false);

    expenseReportsService.findAllByClient.and.returnValue(of([mockReport]));
    expenseReportsService.findOne.and.returnValue(of(mockReport));
    advanceService.findOrphaned.and.returnValue(of([mockAdvance]));
    adminUsersService.getUsers.and.returnValue(of([]));
    invoicesService.getProjects.and.returnValue(of([]));
    categoriaService.getAllFlat.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [RendicionesAdminComponent],
      providers: [
        // SuplenciaBannerComponent (VD-124) inyecta HttpClient al crearse el padre.
        provideHttpClient(),
        provideHttpClientTesting(),
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
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
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
          // SuplenciaBannerComponent (VD-124) inyecta HttpClient al crearse el padre.
          provideHttpClient(),
          provideHttpClientTesting(),
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

    it('excludes isDirecta reports for non-approver users', () => {
      const directaReport = { ...mockReport, _id: 'rep2', isDirecta: true };
      expenseReportsService.findAllByClient.and.returnValue(of([mockReport, directaReport]));
      component.ngOnInit();
      expect(component.filteredItems.some((i) => i._id === 'rep2')).toBeFalse();
    });

    it('keeps isDirecta reports when the user is an approver', () => {
      userStateService.isApprover.and.returnValue(true);
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

    // VD-113: en el desplegado salía solo el nombre del centro de costo.
    it('muestra el centro de costo con su código', () => {
      const reportItem = component.filteredItems.find((i) => i._id === 'rep1')!;
      expect(reportItem.projectName).toBe('CC-01 — Proyecto 1');
    });

    it('cae al nombre solo cuando el centro de costo no tiene código', () => {
      expenseReportsService.findAllByClient.and.returnValue(
        of([{ ...mockReport, projectId: { _id: 'p1', name: 'Proyecto 1' } } as any])
      );
      component.ngOnInit();

      expect(component.filteredItems.find((i) => i._id === 'rep1')!.projectName).toBe('Proyecto 1');
    });

    it('expone la orden de trabajo del viático y de la directa (VD-113)', () => {
      const viatico = component.filteredItems.find((i) => i._id === 'rep1')!;
      expect(component.itemOrdenTrabajo(viatico)).toBe('LIM-SMI-1946');

      const directa = {
        ...viatico,
        raw: { ...(viatico.raw as any), viaticoOrdenTrabajoId: undefined, directaOrdenTrabajoId: { _id: 'ot2', nombre: 'LIM-COM-22' } },
      } as any;
      expect(component.itemOrdenTrabajo(directa)).toBe('LIM-COM-22');
    });

    it('devuelve un guion cuando la rendición no tiene orden de trabajo', () => {
      const item = component.filteredItems.find((i) => i._id === 'rep1')!;
      const sinOt = { ...item, raw: { ...(item.raw as any), viaticoOrdenTrabajoId: undefined } } as any;
      expect(component.itemOrdenTrabajo(sinOt)).toBe('—');
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
    // `rep1` está en solicitud (pending_l1): solo su dueño puede eliminarla,
    // así que el actor de estas pruebas es u1 (createdBy del mock).
    beforeEach(() => {
      userStateService.getUser.and.returnValue({ _id: 'u1', companyId: 'c1' } as any);
      component.ngOnInit();
    });

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

  // Eliminar es del dueño: ni aprobadores ni Contabilidad ven el botón sobre
  // rendiciones ajenas, en ningún estado.
  describe('canDeleteItem', () => {
    const deletableOf = (id: string) =>
      component.filteredItems.find((i) => i._id === id)!.canDeleteItem;

    const loadAs = (userId: string, status?: IExpenseReport['status']) => {
      if (status) {
        expenseReportsService.findAllByClient.and.returnValue(
          of([{ ...mockReport, status } as IExpenseReport]),
        );
      }
      userStateService.getUser.and.returnValue({ _id: userId, companyId: 'c1' } as any);
      component.ngOnInit();
    };

    it('shows delete to the owner while the report is a solicitud', () => {
      for (const status of ['pending_l1', 'solicited'] as IExpenseReport['status'][]) {
        loadAs('u1', status);
        expect(deletableOf('rep1')).withContext(`status ${status}`).toBeTrue();
      }
    });

    it('hides delete from the owner once the report left the solicitud', () => {
      const statuses: IExpenseReport['status'][] = [
        'open', 'submitted', 'pending_contabilidad', 'viatico_approved',
        'approved', 'closed',
      ];
      for (const status of statuses) {
        loadAs('u1', status);
        expect(deletableOf('rep1')).withContext(`status ${status}`).toBeFalse();
      }
    });

    it('hides delete from an approver who is not the owner', () => {
      loadAs('u2');
      expect(deletableOf('rep1')).toBeFalse();
    });

    it('hides delete from Contabilidad in every status', () => {
      const statuses: IExpenseReport['status'][] = [
        'pending_l1', 'solicited', 'open', 'pending_contabilidad',
        'viatico_approved', 'approved', 'closed',
      ];
      userStateService.isContabilidad.and.returnValue(true);
      for (const status of statuses) {
        loadAs('u9', status);
        expect(deletableOf('rep1')).withContext(`status ${status}`).toBeFalse();
      }
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

    // Mientras el documento es una solicitud, el ojo abre el modal para
    // cualquiera —aunque no sea su turno—: la vista completa está vacía.
    describe('while the report is still a solicitud', () => {
      const openFirstItem = (report: Partial<IExpenseReport>) => {
        expenseReportsService.findAllByClient.and.returnValue(
          of([{ ...mockReport, ...report } as IExpenseReport]),
        );
        component.ngOnInit();
        component.goToDetail(component.filteredItems.find((i) => i._id === 'rep1')!);
      };

      it('opens the modal for a viewer who cannot approve nor reject', () => {
        // u9 no está en la cadena y no es Contabilidad: sin canApproveNow/canReject.
        userStateService.getUser.and.returnValue({ _id: 'u9', companyId: 'c1' } as any);
        openFirstItem({ status: 'pending_l1' });
        expect(component.showDetailModal()).toBeTrue();
        expect(router.navigate).not.toHaveBeenCalled();
      });

      it('opens the modal for an approved viatico still awaiting the Tesoreria payment', () => {
        userStateService.getUser.and.returnValue({ _id: 'u9', companyId: 'c1' } as any);
        openFirstItem({ status: 'viatico_approved', viaticoPaidAmount: 0 });
        expect(component.showDetailModal()).toBeTrue();
        expect(router.navigate).not.toHaveBeenCalled();
      });

      it('navigates to the rendicion once the collaborator is registering gastos', () => {
        userStateService.getUser.and.returnValue({ _id: 'u9', companyId: 'c1' } as any);
        openFirstItem({ status: 'open' });
        expect(component.showDetailModal()).toBeFalse();
        expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'rep1', 'detalle']);
      });

      it('navigates for a paid viatico even before it leaves viatico_approved', () => {
        userStateService.getUser.and.returnValue({ _id: 'u9', companyId: 'c1' } as any);
        openFirstItem({ status: 'viatico_approved', viaticoPaidAmount: 30 });
        expect(component.showDetailModal()).toBeFalse();
        expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'rep1', 'detalle']);
      });
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
