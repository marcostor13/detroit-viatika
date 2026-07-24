import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RendicionDetailComponent } from './rendicion-detail.component';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { AdvanceService } from '../../../services/advance.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { CompanyConfigService } from '../../../services/company-config.service';
import { ConfirmationService } from '../../../services/confirmation.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { UploadService } from '../../../services/upload.service';
import { AccountingEntriesService } from '../../../services/accounting-entries.service';
import { RendicionExportService } from '../../../services/rendicion-export.service';
import { IExpenseReport } from '../../../interfaces/expense-report.interface';
import { IAdvance } from '../../../interfaces/advance.interface';

describe('RendicionDetailComponent', () => {
  let component: RendicionDetailComponent;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let notification: jasmine.SpyObj<NotificationService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let companyConfigService: jasmine.SpyObj<CompanyConfigService>;
  let confirmationService: jasmine.SpyObj<ConfirmationService>;
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let uploadService: jasmine.SpyObj<UploadService>;
  let accountingEntriesService: jasmine.SpyObj<AccountingEntriesService>;
  let rendicionExportService: jasmine.SpyObj<RendicionExportService>;
  let router: jasmine.SpyObj<Router>;

  function makeReport(overrides: Partial<IExpenseReport> = {}): IExpenseReport {
    return {
      _id: 'r1',
      title: 'Rendicion 1',
      budget: 100,
      userId: { _id: 'u1', name: 'Juan' } as any,
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
      status: 'paid',
      approvalLevel: 1,
      requiredLevels: 1,
      approvalHistory: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    } as IAdvance;
  }

  beforeEach(() => {
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', [
      'findOne', 'update', 'findExpensesPaginated', 'close', 'cancelRendicion',
      'validateClosure', 'requestReopening',
      'approveReopening', 'registerReturnVoucher', 'registerReimbursementPayment',
      'reopen', 'batchApproveByCoord', 'batchApproveByCollab', 'createAffidavit',
      'scanDepositAmount',
    ]);
    advanceService = jasmine.createSpyObj('AdvanceService', [
      'findAll', 'findMy', 'uploadReturnProof', 'cancelAdvance',
    ]);
    notification = jasmine.createSpyObj('NotificationService', ['show']);
    userState = jasmine.createSpyObj('UserStateService', [
      'getUser', 'isAdmin', 'isSuperAdmin', 'isContabilidad', 'isApprover',
      'isTesoreria', 'hasModulePermission', 'canApproveL1', 'canApproveL2',
    ]);
    companyConfigService = jasmine.createSpyObj('CompanyConfigService', ['refreshConfig', 'getCompanyConfig']);
    confirmationService = jasmine.createSpyObj('ConfirmationService', ['show']);
    invoicesService = jasmine.createSpyObj('InvoicesService', [
      'getProjects', 'approveInvoice', 'rejectInvoice', 'approveByCoord', 'rejectByCoord',
      'approveByContabilidad', 'rejectByContabilidad', 'deleteInvoice',
    ]);
    uploadService = jasmine.createSpyObj('UploadService', ['upload']);
    accountingEntriesService = jasmine.createSpyObj('AccountingEntriesService', ['generate', 'downloadBase64']);
    rendicionExportService = jasmine.createSpyObj('RendicionExportService', [
      'exportToExcel', 'exportToPdf', 'exportFullRendicionPdf', 'exportAffidavitToPdf',
    ]);
    router = jasmine.createSpyObj('Router', ['navigate']);

    userState.getUser.and.returnValue({ _id: 'u1', companyId: 'c1' } as any);
    userState.isAdmin.and.returnValue(false);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);
    userState.isTesoreria.and.returnValue(false);
    userState.isApprover.and.returnValue(false);
    userState.hasModulePermission.and.returnValue(false);
    userState.canApproveL1.and.returnValue(false);
    userState.canApproveL2.and.returnValue(false);

    invoicesService.getProjects.and.returnValue(of([]));
    expenseReportsService.findOne.and.returnValue(of(makeReport()));
    expenseReportsService.findExpensesPaginated.and.returnValue(
      of({ data: [], total: 0, page: 1, limit: 10, pages: 0 })
    );
    advanceService.findMy.and.returnValue(of([]));
    advanceService.findAll.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [RendicionDetailComponent],
      providers: [
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: AdvanceService, useValue: advanceService },
        { provide: NotificationService, useValue: notification },
        { provide: UserStateService, useValue: userState },
        { provide: CompanyConfigService, useValue: companyConfigService },
        { provide: ConfirmationService, useValue: confirmationService },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: UploadService, useValue: uploadService },
        { provide: AccountingEntriesService, useValue: accountingEntriesService },
        { provide: RendicionExportService, useValue: rendicionExportService },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { id: 'r1' }, queryParamMap: { get: () => null } } },
        },
      ],
    });

    component = TestBed.createComponent(RendicionDetailComponent).componentInstance;
  });

  it('should create and read the id from the route', () => {
    expect(component).toBeTruthy();
    expect(component.id).toBe('r1');
  });

  describe('getExpenseConceptoColumn (VD-64)', () => {
    it('muestra el comentario del gasto cuando existe', () => {
      const expense = {
        expenseType: 'factura',
        comentario: 'Almuerzo con cliente',
        data: JSON.stringify({ razonSocial: 'ACME SAC' }),
      };
      expect(component.getExpenseConceptoColumn(expense)).toBe('Almuerzo con cliente');
    });

    it('cae al concepto original (razón social) cuando no hay comentario', () => {
      const expense = {
        expenseType: 'factura',
        data: JSON.stringify({ razonSocial: 'ACME SAC' }),
      };
      expect(component.getExpenseConceptoColumn(expense)).toBe('ACME SAC');
    });
  });

  describe('sortMobilityExportRows (VD-71)', () => {
    it('ordena las filas por fecha ascendente para la exportación', () => {
      const rows = [
        { fecha: '2026-02-10', total: 3 },
        { fecha: '2026-02-01', total: 1 },
        { fecha: '2026-02-05', total: 2 },
      ];
      const sorted = (component as any).sortMobilityExportRows(rows);
      expect(sorted.map((r: any) => r.fecha)).toEqual([
        '2026-02-01',
        '2026-02-05',
        '2026-02-10',
      ]);
    });

    it('deja las filas sin fecha al final conservando su orden', () => {
      const rows = [
        { fecha: '', total: 9 },
        { fecha: '2026-02-03', total: 1 },
        { fecha: '', total: 8 },
      ];
      const sorted = (component as any).sortMobilityExportRows(rows);
      expect(sorted.map((r: any) => r.total)).toEqual([1, 9, 8]);
    });
  });

  describe('ngOnInit', () => {
    it('refreshes config and loads report + advances', () => {
      component.ngOnInit();
      expect(companyConfigService.refreshConfig).toHaveBeenCalled();
      expect(expenseReportsService.findOne).toHaveBeenCalledWith('r1');
      expect(advanceService.findMy).toHaveBeenCalled();
    });
  });

  describe('loadReport', () => {
    it('populates the report and stops loading on success', () => {
      const report = makeReport();
      expenseReportsService.findOne.and.returnValue(of(report));
      component.loadReport();
      expect(component.report).toEqual(report);
      expect(component.isLoading).toBeFalse();
      expect(expenseReportsService.findExpensesPaginated).toHaveBeenCalled();
    });

    it('stops loading on error', () => {
      expenseReportsService.findOne.and.returnValue(throwError(() => new Error('fail')));
      spyOn(console, 'error');
      component.loadReport();
      expect(component.isLoading).toBeFalse();
    });

    it('auto-closes an equilibrado viatico stuck in approved when viewed by contabilidad', () => {
      userState.isContabilidad.and.returnValue(true);
      const report = makeReport({ type: 'viatico', status: 'approved', viaticoPaidAmount: 50, expenseIds: [{ total: '50' }] } as any);
      expenseReportsService.findOne.and.returnValue(of(report));
      const closed = { ...report, status: 'closed' } as IExpenseReport;
      expenseReportsService.close.and.returnValue(of(closed));
      component.loadReport();
      expect(expenseReportsService.close).toHaveBeenCalledWith('r1');
      expect(component.report).toEqual(closed);
    });
  });

  describe('loadAdvances', () => {
    it('uses findMy for a non-admin view and filters by linked report id', () => {
      const advances = [
        makeAdvance({ _id: 'a1', expenseReportId: { _id: 'r1', title: 't', status: 'open' } }),
        makeAdvance({ _id: 'a2', expenseReportId: { _id: 'other', title: 't', status: 'open' } }),
      ];
      advanceService.findMy.and.returnValue(of(advances));
      component.loadAdvances();
      expect(component.advances.map(a => a._id)).toEqual(['a1']);
    });

    it('uses findAll when viewing as admin', () => {
      component.report = makeReport({ userId: { _id: 'other', name: 'x' } as any });
      userState.isAdmin.and.returnValue(true);
      advanceService.findAll.and.returnValue(of([]));
      component.loadAdvances();
      expect(advanceService.findAll).toHaveBeenCalled();
      expect(advanceService.findMy).not.toHaveBeenCalled();
    });
  });

  describe('isOwnReport / isAdminView', () => {
    it('is own report when the report userId matches the current user', () => {
      component.report = makeReport({ userId: { _id: 'u1', name: 'Juan' } as any });
      expect(component.isOwnReport).toBeTrue();
      expect(component.isAdminView).toBeFalse();
    });

    it('is not own report and is admin view for an admin looking at someone else\'s report', () => {
      component.report = makeReport({ userId: { _id: 'other', name: 'x' } as any });
      userState.isAdmin.and.returnValue(true);
      expect(component.isOwnReport).toBeFalse();
      expect(component.isAdminView).toBeTrue();
    });

    it('approver with rendiciones permission acts as admin on others\' reports', () => {
      component.report = makeReport({ userId: { _id: 'other', name: 'x' } as any });
      userState.isApprover.and.returnValue(true);
      userState.hasModulePermission.and.returnValue(true);
      expect(component.isAdminView).toBeTrue();
    });
  });

  describe('saldoLibre / totalAnticipado', () => {
    it('uses viaticoPaidAmount minus totalGastado for viaticos', () => {
      component.report = makeReport({ type: 'viatico', viaticoPaidAmount: 100 } as any);
      component.totalGastado = 40;
      expect(component.saldoLibre).toBe(60);
    });

    it('uses directaSaldo when the report has a directa deposit', () => {
      component.report = makeReport({
        isDirecta: true,
        directaDeposit: { amount: 80 } as any,
      });
      component.totalGastado = 30;
      expect(component.saldoLibre).toBe(50);
    });

    it('uses settlement.difference when present', () => {
      component.report = makeReport({ settlement: { difference: 15 } as any });
      expect(component.saldoLibre).toBe(15);
    });

    it('falls back to totalAnticipado minus totalGastado', () => {
      component.report = makeReport();
      component.advances = [makeAdvance({ status: 'paid', paidAmount: 200 })];
      component.totalGastado = 50;
      expect(component.saldoLibre).toBe(150);
    });

    it('totalAnticipado includes directaDeposit amount when present', () => {
      component.report = makeReport({ isDirecta: true, directaDeposit: { amount: 80 } as any });
      component.advances = [];
      expect(component.totalAnticipado).toBe(80);
    });
  });

  describe('hasPaidAdvanceForReport', () => {
    it('is true when any advance is paid/partially_paid/settled', () => {
      component.advances = [makeAdvance({ status: 'partially_paid' })];
      expect(component.hasPaidAdvanceForReport).toBeTrue();
    });

    it('is true for a viatico with a positive viaticoPaidAmount', () => {
      component.advances = [];
      component.report = makeReport({ type: 'viatico', viaticoPaidAmount: 10 } as any);
      expect(component.hasPaidAdvanceForReport).toBeTrue();
    });

    it('is false otherwise', () => {
      component.advances = [];
      component.report = makeReport();
      expect(component.hasPaidAdvanceForReport).toBeFalse();
    });
  });

  describe('canApproveExpenses', () => {
    it('is false for contabilidad', () => {
      userState.isContabilidad.and.returnValue(true);
      expect(component.canApproveExpenses).toBeFalse();
    });

    it('is true for an approver with the rendiciones permission', () => {
      userState.isApprover.and.returnValue(true);
      userState.hasModulePermission.and.returnValue(true);
      expect(component.canApproveExpenses).toBeTrue();
    });

    it('falls back to canApproveL1', () => {
      userState.canApproveL1.and.returnValue(true);
      expect(component.canApproveExpenses).toBeTrue();
    });
  });

  describe('isSolicitudPhase / canResendSolicitud / canResubmitReport / collaboratorCanEdit', () => {
    it('is in solicitud phase when status is solicited', () => {
      component.report = makeReport({ status: 'solicited' });
      expect(component.isSolicitudPhase).toBeTrue();
    });

    it('is in solicitud phase when rejected with no expenses', () => {
      component.report = makeReport({ status: 'rejected', expenseIds: [] });
      expect(component.isSolicitudPhase).toBeTrue();
      expect(component.canResendSolicitud).toBeTrue();
      expect(component.canResubmitReport).toBeFalse();
    });

    it('canResubmitReport is true when rejected with expenses', () => {
      component.report = makeReport({ status: 'rejected', expenseIds: [{ _id: 'e1' }] });
      expect(component.canResubmitReport).toBeTrue();
      expect(component.canResendSolicitud).toBeFalse();
    });
  });

  describe('canAddExpenses', () => {
    it('is false without a report or in admin view', () => {
      component.report = null;
      expect(component.canAddExpenses).toBeFalse();
    });

    it('is true for a directa report regardless of paid advance', () => {
      component.report = makeReport({ isDirecta: true, status: 'open' });
      expect(component.canAddExpenses).toBeTrue();
    });

    it('is false when locked by caja chica', () => {
      component.report = makeReport({ status: 'open', lockedByCajaChica: true });
      expect(component.canAddExpenses).toBeFalse();
    });

    it('requires a paid advance for a regular open report', () => {
      component.report = makeReport({ status: 'open' });
      component.advances = [];
      expect(component.canAddExpenses).toBeFalse();
      component.advances = [makeAdvance({ status: 'paid' })];
      expect(component.canAddExpenses).toBeTrue();
    });

    it('allows a partially paid viatico that has a positive viaticoPaidAmount', () => {
      component.report = makeReport({ status: 'partially_paid', type: 'viatico', viaticoPaidAmount: 10 } as any);
      expect(component.canAddExpenses).toBeTrue();
    });
  });

  describe('canSubmitReport', () => {
    it('is false for caja chica reports', () => {
      component.report = makeReport({ status: 'open', isCajaChica: true, expenseIds: [{ _id: 'e1' }] });
      expect(component.canSubmitReport).toBeFalse();
    });

    it('is false without expenses', () => {
      component.report = makeReport({ status: 'open', expenseIds: [] });
      expect(component.canSubmitReport).toBeFalse();
    });

    it('is true when open with at least one expense', () => {
      component.report = makeReport({ status: 'open', expenseIds: [{ _id: 'e1' }] });
      expect(component.canSubmitReport).toBeTrue();
    });
  });

  describe('confirmApproveReport', () => {
    it('moves a solicited report to open', () => {
      component.report = makeReport({ status: 'solicited' });
      const updated = { ...component.report, status: 'open' } as IExpenseReport;
      expenseReportsService.update.and.returnValue(of(updated));
      component.confirmApproveReport();
      expect(expenseReportsService.update).toHaveBeenCalledWith('r1', { status: 'open' });
      expect(notification.show).toHaveBeenCalledWith(
        'Solicitud aprobada. El colaborador ya puede agregar sus gastos.', 'success'
      );
    });

    it('moves a submitted report to pending_accounting', () => {
      component.report = makeReport({ status: 'submitted' });
      expenseReportsService.update.and.returnValue(of({ ...component.report, status: 'pending_accounting' } as IExpenseReport));
      component.confirmApproveReport();
      expect(expenseReportsService.update).toHaveBeenCalledWith('r1', { status: 'pending_accounting' });
    });

    it('moves any other status to approved', () => {
      component.report = makeReport({ status: 'pending_accounting' });
      expenseReportsService.update.and.returnValue(of({ ...component.report, status: 'approved' } as IExpenseReport));
      component.confirmApproveReport();
      expect(expenseReportsService.update).toHaveBeenCalledWith('r1', { status: 'approved' });
    });

    it('shows an error notification on failure', () => {
      component.report = makeReport({ status: 'solicited' });
      expenseReportsService.update.and.returnValue(throwError(() => new Error('fail')));
      component.confirmApproveReport();
      expect(notification.show).toHaveBeenCalledWith('Error al aprobar', 'error');
      expect(component.isApprovingReport()).toBeFalse();
    });
  });

  describe('reenviarSolicitudDirecto', () => {
    it('resends the solicitud and clears the rejection reason', () => {
      component.report = makeReport({ status: 'rejected' });
      expenseReportsService.update.and.returnValue(of({ ...component.report, status: 'solicited' } as IExpenseReport));
      component.reenviarSolicitudDirecto();
      expect(expenseReportsService.update).toHaveBeenCalledWith('r1', { status: 'solicited', rejectionReason: '' });
      expect(notification.show).toHaveBeenCalledWith('Solicitud reenviada correctamente', 'success');
    });

    it('shows an error notification on failure', () => {
      expenseReportsService.update.and.returnValue(throwError(() => new Error('fail')));
      component.reenviarSolicitudDirecto();
      expect(notification.show).toHaveBeenCalledWith('Error al reenviar la solicitud', 'error');
    });
  });

  describe('submitAdminRejection', () => {
    it('requires a rejection reason', () => {
      component.adminRejectionReason.set('');
      component.submitAdminRejection();
      expect(notification.show).toHaveBeenCalledWith('Debe ingresar un motivo de rechazo', 'error');
      expect(expenseReportsService.update).not.toHaveBeenCalled();
    });

    it('rejects the report with the trimmed reason', () => {
      component.adminRejectionReason.set('  no cumple  ');
      expenseReportsService.update.and.returnValue(of(makeReport({ status: 'rejected' })));
      component.submitAdminRejection();
      expect(expenseReportsService.update).toHaveBeenCalledWith('r1', {
        status: 'rejected', rejectionReason: 'no cumple',
      });
      expect(notification.show).toHaveBeenCalledWith('Rendición rechazada', 'success');
    });

    it('shows a backend error message on failure', () => {
      component.adminRejectionReason.set('motivo');
      expenseReportsService.update.and.returnValue(throwError(() => ({ error: { message: 'no autorizado' } })));
      component.submitAdminRejection();
      expect(notification.show).toHaveBeenCalledWith('no autorizado', 'error');
    });
  });

  describe('approveExpense / confirmRejectExpense', () => {
    it('approves and reloads the report', () => {
      invoicesService.approveInvoice.and.returnValue(of({} as any));
      component.approveExpense('e1');
      expect(invoicesService.approveInvoice).toHaveBeenCalledWith('e1', { status: 'approved' });
      expect(notification.show).toHaveBeenCalledWith('Documento aprobado', 'success');
      expect(component.approvingExpenseId()).toBeNull();
    });

    it('shows an error notification when approval fails', () => {
      invoicesService.approveInvoice.and.returnValue(throwError(() => ({ error: { message: 'no se pudo' } })));
      component.approveExpense('e1');
      expect(notification.show).toHaveBeenCalledWith('no se pudo', 'error');
    });

    it('confirmRejectExpense does nothing without a target id', () => {
      component.confirmRejectExpense();
      expect(invoicesService.rejectInvoice).not.toHaveBeenCalled();
    });

    it('confirmRejectExpense rejects the targeted expense', () => {
      component.expenseRejectTargetId.set('e1');
      component.expenseRejectReason.set('malo');
      invoicesService.rejectInvoice.and.returnValue(of({} as any));
      component.confirmRejectExpense();
      expect(invoicesService.rejectInvoice).toHaveBeenCalledWith('e1', { status: 'rejected', reason: 'malo' });
      expect(notification.show).toHaveBeenCalledWith('Documento rechazado', 'success');
      expect(component.showExpenseRejectModal()).toBeFalse();
    });
  });

  describe('openSubmitModal / confirmSubmitReport', () => {
    it('warns instead of opening the modal when the report cannot be submitted', () => {
      component.report = makeReport({ status: 'open', expenseIds: [] });
      component.openSubmitModal();
      expect(notification.show).toHaveBeenCalledWith(
        'Debes agregar al menos un gasto antes de enviar la rendición.', 'warning'
      );
      expect(component.showSubmitModal).toBeFalse();
    });

    it('opens the modal when the report can be submitted', () => {
      component.report = makeReport({ status: 'open', expenseIds: [{ _id: 'e1' }] });
      component.openSubmitModal();
      expect(component.showSubmitModal).toBeTrue();
    });

    it('confirmSubmitReport submits and shows the resend message when previously rejected', () => {
      component.report = makeReport({ status: 'rejected' });
      expenseReportsService.update.and.returnValue(of({ ...component.report, status: 'submitted' } as IExpenseReport));
      component.confirmSubmitReport();
      expect(expenseReportsService.update).toHaveBeenCalledWith('r1', { status: 'submitted' });
      expect(notification.show).toHaveBeenCalledWith('Rendición reenviada correctamente', 'success');
    });

    it('confirmSubmitReport shows an error on failure', () => {
      component.report = makeReport({ status: 'open' });
      expenseReportsService.update.and.returnValue(throwError(() => new Error('fail')));
      component.confirmSubmitReport();
      expect(notification.show).toHaveBeenCalledWith('Error al enviar la rendición', 'error');
    });
  });

  describe('canCorrectRejectedExpense / canMutateOwnExpense / canMutateExpense', () => {
    it('is true for correctable statuses and false when locked by caja chica', () => {
      component.report = makeReport({ status: 'submitted' });
      expect(component.canCorrectRejectedExpense).toBeTrue();
      component.report = makeReport({ status: 'submitted', lockedByCajaChica: true });
      expect(component.canCorrectRejectedExpense).toBeFalse();
    });

    it('canMutateOwnExpense blocks a non-owner', () => {
      component.report = makeReport({ status: 'open' });
      expect(component.canMutateOwnExpense({ createdBy: 'other', status: 'pending' })).toBeFalse();
    });

    it('canMutateOwnExpense blocks an approved expense', () => {
      component.report = makeReport({ status: 'open' });
      expect(component.canMutateOwnExpense({ createdBy: 'u1', status: 'approved' })).toBeFalse();
    });

    it('canMutateOwnExpense allows the owner to edit a pending expense while collaboratorCanEdit', () => {
      component.report = makeReport({ status: 'open' });
      component.advances = [makeAdvance({ status: 'paid' })];
      expect(component.canMutateOwnExpense({ createdBy: 'u1', status: 'pending' })).toBeTrue();
    });

    it('canMutateExpense allows admins to mutate pending expenses on non-finalized reports', () => {
      component.report = makeReport({ status: 'submitted', userId: { _id: 'other', name: 'x' } as any });
      userState.isContabilidad.and.returnValue(true);
      expect(component.canMutateExpense({ createdBy: 'other', status: 'pending' })).toBeTrue();
    });

    it('canMutateExpense bloquea al aprobador N1/N2 sobre comprobantes ajenos (VD-69)', () => {
      component.report = makeReport({ status: 'submitted', userId: { _id: 'other', name: 'x' } as any });
      userState.isContabilidad.and.returnValue(false);
      userState.isApprover.and.returnValue(true);
      userState.hasModulePermission.and.returnValue(true);
      expect(component.canMutateExpense({ createdBy: 'other', status: 'pending' })).toBeFalse();
    });
  });

  describe('goBack', () => {
    it('navigates to admin-users details when viewing as an admin who can see it', () => {
      component.report = makeReport({ userId: { _id: 'other', name: 'x' } as any });
      userState.isAdmin.and.returnValue(true);
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/admin-users', 'other', 'details']);
    });

    it('navigates to /rendiciones for contabilidad viewing a directa', () => {
      component.report = makeReport({ userId: { _id: 'other', name: 'x' } as any, isDirecta: true });
      userState.isContabilidad.and.returnValue(true);
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/rendiciones'], { queryParams: { tab: 'directas' } });
    });

    it('navigates to /mis-rendiciones for the report owner', () => {
      component.report = makeReport({ userId: { _id: 'u1', name: 'Juan' } as any });
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones'], {});
    });
  });

  describe('confirmCancelReport / canCancelOrDelete', () => {
    it('canCancelOrDelete is true only for the owner while solicited', () => {
      component.report = makeReport({ userId: { _id: 'u1', name: 'Juan' } as any, status: 'solicited' });
      expect(component.canCancelOrDelete).toBeTrue();
    });

    it('cancels the report and shows a success notification', () => {
      component.report = makeReport();
      component.cancelReason.set('motivo');
      expenseReportsService.cancelRendicion.and.returnValue(of(makeReport({ status: 'cancelled' })));
      component.confirmCancelReport();
      expect(expenseReportsService.cancelRendicion).toHaveBeenCalledWith('r1', 'motivo');
      expect(notification.show).toHaveBeenCalledWith('Rendicion cancelada correctamente', 'success');
    });
  });

  describe('isEffectivelyClosed / canClose', () => {
    it('is effectively closed when status is closed or a return voucher exists', () => {
      component.report = makeReport({ status: 'closed' });
      expect(component.isEffectivelyClosed).toBeTrue();
      component.report = makeReport({ status: 'approved', returnVoucher: { url: 'x' } as any });
      expect(component.isEffectivelyClosed).toBeTrue();
    });

    it('canClose requires tesoreria/superadmin role and an approved/reimbursed status (VD-66)', () => {
      component.report = makeReport({ status: 'approved' });
      expect(component.canClose).toBeFalse();
      // Contabilidad ya no puede cerrar (VD-66): el cierre es de Tesorería.
      userState.isContabilidad.and.returnValue(true);
      expect(component.canClose).toBeFalse();
      userState.isTesoreria.and.returnValue(true);
      expect(component.canClose).toBeTrue();
    });
  });

  describe('downloadAsientos', () => {
    it('does nothing without a report id', () => {
      component.report = null;
      component.downloadAsientos();
      expect(accountingEntriesService.generate).not.toHaveBeenCalled();
    });

    it('generates and downloads files on success', fakeAsync(() => {
      component.report = makeReport({ expenseIds: [{ _id: 'e1' }] });
      accountingEntriesService.generate.and.returnValue(
        of({ files: [{ filename: 'a.xlsx', base64: '', tipo: 'compra', asientosCount: 1, cuadreErrors: [] }] })
      );
      component.downloadAsientos();
      tick(1000);
      expect(accountingEntriesService.downloadBase64).toHaveBeenCalled();
      expect(component.downloadingAsientos).toBeFalse();
      component.closeAsientosModal();
    }));

    it('shows an error message when no files are generated', fakeAsync(() => {
      component.report = makeReport();
      accountingEntriesService.generate.and.returnValue(of({ files: [] }));
      component.downloadAsientos();
      tick(1000);
      expect(component.asientosError()).toBe('No hay asientos que generar para esta rendición.');
    }));

    it('sets an error message on failure', fakeAsync(() => {
      component.report = makeReport();
      accountingEntriesService.generate.and.returnValue(throwError(() => ({ error: { message: 'boom' } })));
      component.downloadAsientos();
      tick(1000);
      expect(component.asientosError()).toBe('boom');
      expect(component.downloadingAsientos).toBeFalse();
    }));
  });

  describe('exportRendicionExcel / exportRendicionPdf', () => {
    it('shows an error when there is no report to export', async () => {
      component.report = null;
      await component.exportRendicionExcel();
      expect(notification.show).toHaveBeenCalledWith('No hay datos para exportar', 'error');
    });

    it('exports to excel and shows a success notification', async () => {
      component.report = makeReport();
      rendicionExportService.exportToExcel.and.returnValue(Promise.resolve());
      await component.exportRendicionExcel();
      expect(rendicionExportService.exportToExcel).toHaveBeenCalled();
      expect(notification.show).toHaveBeenCalledWith('Excel descargado correctamente', 'success');
      expect(component.isExportingExcel()).toBeFalse();
    });

    it('shows an error notification when the excel export throws', async () => {
      component.report = makeReport();
      rendicionExportService.exportToExcel.and.returnValue(Promise.reject(new Error('fail')));
      await component.exportRendicionExcel();
      expect(notification.show).toHaveBeenCalledWith('No se pudo generar el Excel', 'error');
    });

    it('exportRendicionPdf shows an error when there is no report', () => {
      component.report = null;
      component.exportRendicionPdf();
      expect(notification.show).toHaveBeenCalledWith('No hay datos para exportar', 'error');
    });
  });

  describe('confirmDeleteExpense', () => {
    it('does nothing without an id', () => {
      component.confirmDeleteExpense({});
      expect(invoicesService.deleteInvoice).not.toHaveBeenCalled();
    });

    it('does nothing when the user cancels the browser confirm', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.confirmDeleteExpense({ _id: 'e1' });
      expect(invoicesService.deleteInvoice).not.toHaveBeenCalled();
    });

    it('deletes the expense and reloads when confirmed', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      invoicesService.deleteInvoice.and.returnValue(of({}));
      component.confirmDeleteExpense({ _id: 'e1' });
      expect(invoicesService.deleteInvoice).toHaveBeenCalledWith('e1');
      expect(notification.show).toHaveBeenCalledWith('Comprobante eliminado', 'success');
    });
  });

  describe('generateAffidavit', () => {
    it('requires at least one selected expense', () => {
      component.affidavitSelectedExpenseIds.set([]);
      component.generateAffidavit();
      expect(notification.show).toHaveBeenCalledWith(
        'Selecciona al menos un comprobante para generar la declaracion jurada.', 'warning'
      );
      expect(expenseReportsService.createAffidavit).not.toHaveBeenCalled();
    });
  });

  describe('getExpenseUnifiedStatus', () => {
    it('a comprobante recien registrado (sin approverChain, rendicion no enviada) no salta a Contabilidad', () => {
      component.report = makeReport({ status: 'open' });
      const expense = { _id: 'e1', status: 'pending' }; // approverChain nunca se construyo (no enviada)
      const result = component.getExpenseUnifiedStatus(expense);
      expect(result.phase).toBe('not_submitted');
    });

    it('con approverChain vacio (regla 1.6, omitido) pasa directo a Contabilidad', () => {
      component.report = makeReport({ status: 'submitted' });
      const expense = { _id: 'e1', status: 'pending', approverChain: [], requiredLevels: 0, approvalLevel: 0 };
      const result = component.getExpenseUnifiedStatus(expense);
      expect(result.phase).toBe('pending_cont');
    });

    it('con approverChain pendiente muestra pending_coord, no approved', () => {
      component.report = makeReport({ status: 'submitted' });
      const expense = {
        _id: 'e1',
        status: 'pending',
        approverChain: [{ level: 1, approverIds: [{ _id: 'a1', name: 'Ana' }] }],
        requiredLevels: 1,
        approvalLevel: 0,
      };
      const result = component.getExpenseUnifiedStatus(expense);
      expect(result.phase).toBe('pending_coord');
      expect(result.pendingApproverNames).toContain('Ana');
    });
  });

  describe('ngOnDestroy', () => {
    it('clears any pending asientos timer without throwing', () => {
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
