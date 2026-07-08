import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TesoreriaComponent } from './tesoreria.component';
import { AdvanceService } from '../../services/advance.service';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { UploadService } from '../../services/upload.service';
import { IAdvance } from '../../interfaces/advance.interface';
import { IExpenseReport } from '../../interfaces/expense-report.interface';

describe('TesoreriaComponent', () => {
  let component: TesoreriaComponent;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let uploadService: jasmine.SpyObj<UploadService>;
  let router: jasmine.SpyObj<Router>;

  function makeAdvance(overrides: Partial<IAdvance> = {}): IAdvance {
    return {
      _id: 'adv1',
      userId: { _id: 'u1', name: 'Juan Perez', email: 'juan@test.com' },
      clientId: 'c1',
      amount: 1000,
      description: 'Viatico',
      status: 'approved',
      approvalLevel: 2,
      requiredLevels: 2,
      approvalHistory: [],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      ...overrides,
    } as IAdvance;
  }

  function makeReport(overrides: Partial<IExpenseReport> = {}): IExpenseReport {
    return {
      _id: 'r1',
      title: 'Rendicion',
      budget: 100,
      userId: { _id: 'u1', name: 'Juan Perez' },
      clientId: 'c1',
      status: 'viatico_approved',
      type: 'viatico',
      expenseIds: [],
      createdBy: 'u1',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      ...overrides,
    } as IExpenseReport;
  }

  beforeEach(() => {
    advanceService = jasmine.createSpyObj('AdvanceService', [
      'getStats', 'findAll', 'findPendingReturns', 'registerPayment', 'registerReturn', 'validateReturn',
    ]);
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', [
      'findPendingReimbursements', 'findAllByClient', 'findDirectaDepositReports',
      'scanDepositAmount', 'registerViaticoPayment', 'registerReimbursementPayment',
    ]);
    userState = jasmine.createSpyObj('UserStateService', [
      'getUser', 'isSuperAdmin', 'isAdmin', 'isContabilidad', 'canApproveL2',
    ]);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    uploadService = jasmine.createSpyObj('UploadService', ['upload']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    advanceService.getStats.and.returnValue(of({
      pending_l1: 0, pending_l2: 0, approved: 0, paid: 0, settled: 0, totalApprovedAmount: 0,
    }));
    advanceService.findAll.and.returnValue(of([]));
    advanceService.findPendingReturns.and.returnValue(of([]));
    expenseReportsService.findPendingReimbursements.and.returnValue(of([]));
    expenseReportsService.findAllByClient.and.returnValue(of([]));
    expenseReportsService.findDirectaDepositReports.and.returnValue(of([]));
    userState.getUser.and.returnValue({ companyId: 'c1' } as any);
    userState.canApproveL2.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);

    const activatedRoute = { snapshot: { queryParamMap: { get: () => null } } };

    TestBed.configureTestingModule({
      imports: [TesoreriaComponent],
      providers: [
        { provide: AdvanceService, useValue: advanceService },
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: UserStateService, useValue: userState },
        { provide: NotificationService, useValue: notifications },
        { provide: UploadService, useValue: uploadService },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: activatedRoute },
      ],
    });

    const fixture = TestBed.createComponent(TesoreriaComponent);
    component = fixture.componentInstance;
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit / loadData', () => {
    it('loads stats, advances, reimbursements, returns and directa reports', () => {
      const advances = [makeAdvance({ status: 'pending_l2' }), makeAdvance({ status: 'paid' })];
      advanceService.findAll.and.returnValue(of(advances));
      component.ngOnInit();
      expect(component.allAdvances).toEqual(advances);
      expect(component.pendingAdvances.length).toBe(1);
      expect(component.isLoading()).toBeFalse();
    });

    it('activates rendiciones-directas tab from query param when allowed', () => {
      userState.isContabilidad.and.returnValue(true);
      const activatedRoute = { snapshot: { queryParamMap: { get: () => 'rendiciones-directas' } } };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [TesoreriaComponent],
        providers: [
          { provide: AdvanceService, useValue: advanceService },
          { provide: ExpenseReportsService, useValue: expenseReportsService },
          { provide: UserStateService, useValue: userState },
          { provide: NotificationService, useValue: notifications },
          { provide: UploadService, useValue: uploadService },
          { provide: Router, useValue: router },
          { provide: ActivatedRoute, useValue: activatedRoute },
        ],
      });
      const fixture = TestBed.createComponent(TesoreriaComponent);
      const comp = fixture.componentInstance;
      comp.ngOnInit();
      expect(comp.activeTab()).toBe('rendiciones-directas');
    });

    it('handles findAll error gracefully without throwing', () => {
      advanceService.findAll.and.returnValue(throwError(() => new Error('fail')));
      expect(() => component.ngOnInit()).not.toThrow();
      expect(component.isLoading()).toBeFalse();
    });

    it('clears pending reimbursements/returns when user cannot pay and settle', () => {
      userState.canApproveL2.and.returnValue(false);
      component.ngOnInit();
      expect(component.pendingReimbursements).toEqual([]);
      expect(component.pendingReturns).toEqual([]);
    });
  });

  describe('tabsList / onTabChange', () => {
    it('includes devoluciones and rendiciones-directas tabs when permitted', () => {
      userState.canApproveL2.and.returnValue(true);
      userState.isContabilidad.and.returnValue(true);
      component.pendingReturns = [makeAdvance()];
      const tabs = component.tabsList;
      expect(tabs.map(t => t.value)).toEqual(['pendientes', 'aprobados', 'devoluciones', 'rendiciones-directas']);
      expect(tabs.find(t => t.value === 'devoluciones')?.badge).toBe(1);
    });

    it('omits devoluciones and rendiciones-directas when not permitted', () => {
      userState.canApproveL2.and.returnValue(false);
      userState.isContabilidad.and.returnValue(false);
      userState.isSuperAdmin.and.returnValue(false);
      const tabs = component.tabsList;
      expect(tabs.map(t => t.value)).toEqual(['pendientes', 'aprobados']);
    });

    it('onTabChange updates activeTab signal', () => {
      component.onTabChange('devoluciones');
      expect(component.activeTab()).toBe('devoluciones');
    });
  });

  describe('filteredAdvances', () => {
    beforeEach(() => {
      component.allAdvances = [
        makeAdvance({ _id: 'a1', status: 'pending_l2' }),
        makeAdvance({ _id: 'a2', status: 'approved' }),
        makeAdvance({ _id: 'a3', status: 'partially_paid' }),
        makeAdvance({ _id: 'a4', status: 'paid' }),
        makeAdvance({ _id: 'a5', status: 'rejected' }),
      ];
    });

    it('filters pendientes tab', () => {
      component.activeTab.set('pendientes');
      expect(component.filteredAdvances.map(a => a._id)).toEqual(['a1', 'a2', 'a3']);
    });

    it('filters aprobados tab', () => {
      component.activeTab.set('aprobados');
      expect(component.filteredAdvances.map(a => a._id)).toEqual(['a2', 'a3', 'a4']);
    });

    it('returns all advances for other tabs', () => {
      component.activeTab.set('devoluciones');
      expect(component.filteredAdvances.length).toBe(5);
    });
  });

  describe('amount helpers', () => {
    it('advancePaid defaults to 0 when missing', () => {
      expect(component.advancePaid(makeAdvance({ paidAmount: undefined }))).toBe(0);
    });

    it('advanceRemaining computes amount minus paid, floored at 0', () => {
      const adv = makeAdvance({ amount: 500, paidAmount: 200 });
      expect(component.advanceRemaining(adv)).toBe(300);
    });

    it('advanceRemaining never goes negative', () => {
      const adv = makeAdvance({ amount: 100, paidAmount: 300 });
      expect(component.advanceRemaining(adv)).toBe(0);
    });
  });

  describe('canRegisterPayment / payButtonLabel', () => {
    it('allows registering payment for approved/partially_paid/paid when canPayAndSettle', () => {
      userState.canApproveL2.and.returnValue(true);
      expect(component.canRegisterPayment(makeAdvance({ status: 'approved' }))).toBeTrue();
      expect(component.canRegisterPayment(makeAdvance({ status: 'partially_paid' }))).toBeTrue();
      expect(component.canRegisterPayment(makeAdvance({ status: 'paid' }))).toBeTrue();
      expect(component.canRegisterPayment(makeAdvance({ status: 'pending_l2' }))).toBeFalse();
    });

    it('denies registering payment when user cannot pay and settle', () => {
      userState.canApproveL2.and.returnValue(false);
      expect(component.canRegisterPayment(makeAdvance({ status: 'approved' }))).toBeFalse();
    });

    it('returns correct label per status', () => {
      expect(component.payButtonLabel(makeAdvance({ status: 'partially_paid' }))).toBe('Registrar pago');
      expect(component.payButtonLabel(makeAdvance({ status: 'paid' }))).toBe('Pago adicional');
      expect(component.payButtonLabel(makeAdvance({ status: 'approved' }))).toBe('Registrar pago');
    });
  });

  describe('viatico payment helpers', () => {
    it('viaticoRemaining computes amount minus paid, floored at 0', () => {
      const report = makeReport({ viaticoAmount: 500, viaticoPaidAmount: 150 });
      expect(component.viaticoRemaining(report)).toBe(350);
    });

    it('canCompleteViaticoPayment true when remaining > 0 and status eligible', () => {
      userState.canApproveL2.and.returnValue(true);
      const report = makeReport({ viaticoAmount: 500, viaticoPaidAmount: 0, status: 'viatico_approved' });
      expect(component.canCompleteViaticoPayment(report)).toBeTrue();
    });

    it('canCompleteViaticoPayment false when fully paid', () => {
      userState.canApproveL2.and.returnValue(true);
      const report = makeReport({ viaticoAmount: 500, viaticoPaidAmount: 500, status: 'viatico_approved' });
      expect(component.canCompleteViaticoPayment(report)).toBeFalse();
    });

    it('canCompleteViaticoPayment false when status not eligible', () => {
      userState.canApproveL2.and.returnValue(true);
      const report = makeReport({ viaticoAmount: 500, viaticoPaidAmount: 0, status: 'rejected' });
      expect(component.canCompleteViaticoPayment(report)).toBeFalse();
    });

    it('viaticoUserName resolves populated user name', () => {
      const report = makeReport({ userId: { _id: 'u1', name: 'Maria Lopez' } });
      expect(component.viaticoUserName(report)).toBe('Maria Lopez');
    });

    it('viaticoUserName defaults when user is not populated', () => {
      const report = makeReport({ userId: 'u1' });
      expect(component.viaticoUserName(report)).toBe('—');
    });
  });

  describe('confirmViaticoPayment', () => {
    beforeEach(() => {
      component.initForms();
      component.selectedViaticoReport = makeReport({ _id: 'r1' });
      component.paymentForm.patchValue({
        amount: 100,
        method: 'transferencia_bancaria',
        reference: 'ref1',
      });
      component.viaticoPaymentReceiptUrl = 'http://file.pdf';
    });

    it('does nothing without a selected report', () => {
      component.selectedViaticoReport = null;
      component.confirmViaticoPayment();
      expect(expenseReportsService.registerViaticoPayment).not.toHaveBeenCalled();
    });

    it('does nothing when form invalid', () => {
      component.paymentForm.patchValue({ amount: null });
      component.confirmViaticoPayment();
      expect(expenseReportsService.registerViaticoPayment).not.toHaveBeenCalled();
    });

    it('blocks non-cash payment without a receipt', () => {
      component.viaticoPaymentReceiptUrl = null;
      component.confirmViaticoPayment();
      expect(notifications.show).toHaveBeenCalledWith('Debes adjuntar el comprobante de pago.', 'error');
      expect(expenseReportsService.registerViaticoPayment).not.toHaveBeenCalled();
    });

    it('allows cash payment without a receipt', () => {
      component.viaticoPaymentReceiptUrl = null;
      component.paymentForm.patchValue({ method: 'efectivo' });
      expenseReportsService.registerViaticoPayment.and.returnValue(of(makeReport()));
      component.confirmViaticoPayment();
      expect(expenseReportsService.registerViaticoPayment).toHaveBeenCalled();
    });

    it('registers payment successfully and reloads data', () => {
      expenseReportsService.registerViaticoPayment.and.returnValue(of(makeReport()));
      spyOn(component, 'loadData');
      component.confirmViaticoPayment();
      expect(expenseReportsService.registerViaticoPayment).toHaveBeenCalledWith('r1', jasmine.objectContaining({ amount: 100 }));
      expect(notifications.show).toHaveBeenCalledWith('Pago de viático registrado correctamente', 'success');
      expect(component.showViaticoPaymentModal).toBeFalse();
      expect(component.isActing()).toBeFalse();
      expect(component.loadData).toHaveBeenCalled();
    });

    it('shows backend error message on failure', () => {
      expenseReportsService.registerViaticoPayment.and.returnValue(
        throwError(() => ({ error: { message: 'Monto invalido' } }))
      );
      component.confirmViaticoPayment();
      expect(notifications.show).toHaveBeenCalledWith('Monto invalido', 'error');
      expect(component.isActing()).toBeFalse();
    });

    it('shows generic error message when backend gives none', () => {
      expenseReportsService.registerViaticoPayment.and.returnValue(throwError(() => ({})));
      component.confirmViaticoPayment();
      expect(notifications.show).toHaveBeenCalledWith('Error al registrar el pago', 'error');
    });
  });

  describe('openPaymentModal', () => {
    beforeEach(() => component.initForms());

    it('prefills amount with remaining balance and bank data from user', () => {
      const advance = makeAdvance({
        amount: 500,
        paidAmount: 100,
        userId: { _id: 'u1', name: 'Juan', email: 'j@test.com', bankAccount: { bankName: 'BCP', accountNumber: '123', cci: '456', accountType: 'ahorros' } },
      });
      component.openPaymentModal(advance);
      expect(component.selectedAdvance).toBe(advance);
      expect(component.paymentForm.value.amount).toBe(400);
      expect(component.paymentForm.value.bankName).toBe('BCP');
      expect(component.showPaymentModal).toBeTrue();
    });

    it('resets receipt/scan state', () => {
      component.paymentReceiptUrl = 'old-url';
      component.paymentScannedAmount = 999;
      component.openPaymentModal(makeAdvance());
      expect(component.paymentReceiptUrl).toBeNull();
      expect(component.paymentScannedAmount).toBeNull();
    });
  });

  describe('confirmPayment', () => {
    beforeEach(() => {
      component.initForms();
      component.selectedAdvance = makeAdvance({ _id: 'adv1' });
      component.paymentForm.patchValue({ amount: 100, method: 'transferencia_bancaria', reference: 'ref1' });
      component.paymentReceiptUrl = 'http://file.pdf';
    });

    it('does nothing without selected advance', () => {
      component.selectedAdvance = null;
      component.confirmPayment();
      expect(advanceService.registerPayment).not.toHaveBeenCalled();
    });

    it('does nothing when form invalid', () => {
      component.paymentForm.patchValue({ reference: '' });
      component.confirmPayment();
      expect(advanceService.registerPayment).not.toHaveBeenCalled();
    });

    it('requires a receipt for non-cash methods', () => {
      component.paymentReceiptUrl = null;
      component.confirmPayment();
      expect(notifications.show).toHaveBeenCalledWith('Debes adjuntar el comprobante de pago.', 'error');
      expect(advanceService.registerPayment).not.toHaveBeenCalled();
    });

    it('registers payment successfully', () => {
      advanceService.registerPayment.and.returnValue(of(makeAdvance()));
      spyOn(component, 'loadData');
      component.confirmPayment();
      expect(advanceService.registerPayment).toHaveBeenCalledWith('adv1', jasmine.objectContaining({ amount: 100 }));
      expect(notifications.show).toHaveBeenCalledWith('Pago registrado correctamente', 'success');
      expect(component.showPaymentModal).toBeFalse();
      expect(component.loadData).toHaveBeenCalled();
      expect(component.isActing()).toBeFalse();
    });

    it('shows backend error message on failure', () => {
      advanceService.registerPayment.and.returnValue(throwError(() => ({ error: { message: 'Fondos insuficientes' } })));
      component.confirmPayment();
      expect(notifications.show).toHaveBeenCalledWith('Fondos insuficientes', 'error');
      expect(component.isActing()).toBeFalse();
    });
  });

  describe('confirmReimbursementPayment', () => {
    beforeEach(() => {
      component.initForms();
      component.selectedReportReimbursement = makeReport({ _id: 'r1', settlement: { advanceTotal: 100, expenseTotal: 80, difference: 20, type: 'reembolso' } });
      component.paymentForm.patchValue({ amount: 20, method: 'transferencia_bancaria', reference: 'ref1' });
      component.reimbursementReceiptUrl = 'http://file.pdf';
    });

    it('blocks non-cash without receipt', () => {
      component.reimbursementReceiptUrl = null;
      component.confirmReimbursementPayment();
      expect(notifications.show).toHaveBeenCalledWith('Debes adjuntar el comprobante de pago del reembolso.', 'error');
      expect(expenseReportsService.registerReimbursementPayment).not.toHaveBeenCalled();
    });

    it('registers reimbursement successfully', () => {
      expenseReportsService.registerReimbursementPayment.and.returnValue(of(makeReport()));
      spyOn(component, 'loadData');
      component.confirmReimbursementPayment();
      expect(expenseReportsService.registerReimbursementPayment).toHaveBeenCalledWith('r1', jasmine.objectContaining({ amount: 20 }));
      expect(notifications.show).toHaveBeenCalledWith('Reembolso registrado correctamente', 'success');
      expect(component.showReimbursementModal).toBeFalse();
    });

    it('shows backend error message on failure', () => {
      expenseReportsService.registerReimbursementPayment.and.returnValue(throwError(() => ({ error: { message: 'Error backend' } })));
      component.confirmReimbursementPayment();
      expect(notifications.show).toHaveBeenCalledWith('Error backend', 'error');
    });
  });

  describe('openReimbursementModal', () => {
    it('sets amount to absolute settlement difference', () => {
      component.initForms();
      const report = makeReport({ settlement: { advanceTotal: 100, expenseTotal: 130, difference: -30, type: 'reembolso' } });
      component.openReimbursementModal(report);
      expect(component.paymentForm.value.amount).toBe(30);
      expect(component.showReimbursementModal).toBeTrue();
    });
  });

  describe('reimbursementAmount / collaboratorReportName', () => {
    it('formats absolute difference with two decimals', () => {
      const report = makeReport({ settlement: { advanceTotal: 100, expenseTotal: 130, difference: -30.456, type: 'reembolso' } });
      expect(component.reimbursementAmount(report)).toBe('30.46');
    });

    it('returns dash when no settlement', () => {
      const report = makeReport({ settlement: undefined });
      expect(component.reimbursementAmount(report)).toBe('—');
    });

    it('resolves collaborator name from populated userId', () => {
      const report = makeReport({ userId: { _id: 'u1', name: 'Ana Torres' } });
      expect(component.collaboratorReportName(report)).toBe('Ana Torres');
    });
  });

  describe('confirmReturn', () => {
    beforeEach(() => {
      component.initForms();
      component.selectedAdvance = makeAdvance({ _id: 'adv1' });
      component.returnForm.patchValue({ returnedAmount: 50 });
    });

    it('does nothing without selected advance', () => {
      component.selectedAdvance = null;
      component.confirmReturn();
      expect(advanceService.registerReturn).not.toHaveBeenCalled();
    });

    it('registers a return successfully', () => {
      advanceService.registerReturn.and.returnValue(of(makeAdvance()));
      spyOn(component, 'loadData');
      component.confirmReturn();
      expect(advanceService.registerReturn).toHaveBeenCalledWith('adv1', 50);
      expect(notifications.show).toHaveBeenCalledWith('Devolución registrada correctamente', 'success');
      expect(component.showReturnModal).toBeFalse();
    });

    it('shows error on failure', () => {
      advanceService.registerReturn.and.returnValue(throwError(() => ({ error: { message: 'No permitido' } })));
      component.confirmReturn();
      expect(notifications.show).toHaveBeenCalledWith('No permitido', 'error');
    });
  });

  describe('confirmValidateReturn', () => {
    beforeEach(() => {
      component.selectedReturnAdvance = makeAdvance({ _id: 'adv1' });
    });

    it('requires at least 50 characters when rejecting', () => {
      component.returnRejectReason.set('too short');
      component.confirmValidateReturn(false);
      expect(notifications.show).toHaveBeenCalledWith('El motivo debe tener al menos 50 caracteres', 'warning');
      expect(advanceService.validateReturn).not.toHaveBeenCalled();
    });

    it('approves without requiring a reason', () => {
      advanceService.validateReturn.and.returnValue(of(makeAdvance()));
      spyOn(component, 'loadData');
      component.confirmValidateReturn(true);
      expect(advanceService.validateReturn).toHaveBeenCalledWith('adv1', true, undefined);
      expect(notifications.show).toHaveBeenCalledWith('Devolución validada', 'success');
      expect(component.showValidateReturnModal).toBeFalse();
    });

    it('rejects with a sufficiently long reason', () => {
      const reason = 'x'.repeat(60);
      component.returnRejectReason.set(reason);
      advanceService.validateReturn.and.returnValue(of(makeAdvance()));
      component.confirmValidateReturn(false);
      expect(advanceService.validateReturn).toHaveBeenCalledWith('adv1', false, reason);
      expect(notifications.show).toHaveBeenCalledWith('Comprobante rechazado', 'success');
    });

    it('shows backend error on failure', () => {
      advanceService.validateReturn.and.returnValue(throwError(() => ({ error: { message: 'Error validando' } })));
      component.confirmValidateReturn(true);
      expect(notifications.show).toHaveBeenCalledWith('Error validando', 'error');
      expect(component.isValidatingReturn()).toBeFalse();
    });
  });

  describe('return status helpers', () => {
    it('maps known statuses to labels', () => {
      expect(component.returnStatusLabel('pending')).toBe('Pendiente');
      expect(component.returnStatusLabel('validated')).toBe('Validado');
      expect(component.returnStatusLabel('unknown')).toBe('unknown');
    });

    it('maps known statuses to colors', () => {
      expect(component.returnStatusColor('validated')).toContain('green');
      expect(component.returnStatusColor('unknown')).toContain('gray');
    });
  });

  describe('display helpers', () => {
    it('getUserName resolves populated user', () => {
      expect(component.getUserName(makeAdvance({ userId: { _id: 'u1', name: 'Pedro', email: 'p@test.com' } }))).toBe('Pedro');
    });

    it('getUserName defaults for unpopulated user', () => {
      expect(component.getUserName(makeAdvance({ userId: 'u1' }))).toBe('—');
    });

    it('getReportTitle/getReportId resolve populated report', () => {
      const advance = makeAdvance({ expenseReportId: { _id: 'r1', title: 'Mi rendicion', status: 'open' } });
      expect(component.getReportTitle(advance)).toBe('Mi rendicion');
      expect(component.getReportId(advance)).toBe('r1');
    });

    it('getReportId returns plain string id when not populated', () => {
      const advance = makeAdvance({ expenseReportId: 'r2' });
      expect(component.getReportId(advance)).toBe('r2');
    });

    it('getLevelsBadge formats required levels', () => {
      expect(component.getLevelsBadge(makeAdvance({ requiredLevels: 2 }))).toBe('L2');
    });

    it('approvalActionLabel maps known actions', () => {
      expect(component.approvalActionLabel('approved')).toBe('Aprobación');
      expect(component.approvalActionLabel('other')).toBe('other');
    });

    it('formatHistoryDate formats a valid ISO date and falls back for invalid input', () => {
      expect(component.formatHistoryDate('')).toBe('—');
      expect(component.formatHistoryDate('not-a-date')).toBe('not-a-date');
      expect(component.formatHistoryDate('2024-01-01T00:00:00.000Z')).not.toBe('—');
    });
  });

  describe('history modal', () => {
    it('opens and closes the history modal', () => {
      const advance = makeAdvance();
      component.openHistoryModal(advance);
      expect(component.selectedAdvance).toBe(advance);
      expect(component.showHistoryModal).toBeTrue();
      component.closeHistoryModal();
      expect(component.showHistoryModal).toBeFalse();
    });
  });

  describe('receipt upload validation', () => {
    beforeEach(() => component.initForms());

    function fileEvent(file: File): Event {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [file] });
      return { target: input } as unknown as Event;
    }

    it('rejects invalid file types for payment receipt', () => {
      const file = new File(['x'], 'a.txt', { type: 'text/plain' });
      component.onPaymentReceiptSelected(fileEvent(file));
      expect(notifications.show).toHaveBeenCalledWith('Formato inválido. Usa PDF, JPG o PNG.', 'error');
      expect(uploadService.upload).not.toHaveBeenCalled();
    });

    it('rejects oversized payment receipt files', () => {
      const bigContent = new Uint8Array(11 * 1024 * 1024);
      const file = new File([bigContent], 'a.pdf', { type: 'application/pdf' });
      component.onPaymentReceiptSelected(fileEvent(file));
      expect(notifications.show).toHaveBeenCalledWith('El comprobante no puede superar 10MB.', 'error');
      expect(uploadService.upload).not.toHaveBeenCalled();
    });

    it('uploads and scans a valid payment receipt, autofilling the amount', () => {
      component.selectedAdvance = makeAdvance({ amount: 250, userId: { _id: 'u1', name: 'Juan Perez', email: 'j@test.com' } });
      uploadService.upload.and.returnValue(of({ url: 'http://s3/file.pdf' }));
      expenseReportsService.scanDepositAmount.and.returnValue(of({ amount: 250, titular: 'Juan Perez', operationNumber: 'OP1' }));
      const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      component.onPaymentReceiptSelected(fileEvent(file));
      expect(component.paymentReceiptUrl).toBe('http://s3/file.pdf');
      expect(component.paymentForm.value.amount).toBe(250);
      expect(component.showPaymentAlert()).toBeFalse();
    });

    it('flags a payment alert when scanned titular/amount mismatch the request', () => {
      component.selectedAdvance = makeAdvance({ amount: 250, userId: { _id: 'u1', name: 'Juan Perez', email: 'j@test.com' } });
      uploadService.upload.and.returnValue(of({ url: 'http://s3/file.pdf' }));
      expenseReportsService.scanDepositAmount.and.returnValue(of({ amount: 999, titular: 'Otra Persona' }));
      const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      component.onPaymentReceiptSelected(fileEvent(file));
      expect(component.showPaymentAlert()).toBeTrue();
      expect(component.paymentAlert()?.amountMismatch).toBeTrue();
      expect(component.paymentAlert()?.titularMismatch).toBeTrue();
    });

    it('dismissPaymentAlert hides the alert', () => {
      component.showPaymentAlert.set(true);
      component.dismissPaymentAlert();
      expect(component.showPaymentAlert()).toBeFalse();
    });

    it('removePaymentReceipt clears receipt and scan state, restores remaining amount', () => {
      component.selectedAdvance = makeAdvance({ amount: 300, paidAmount: 100 });
      component.paymentReceiptUrl = 'url';
      component.paymentScannedAmount = 300;
      component.removePaymentReceipt();
      expect(component.paymentReceiptUrl).toBeNull();
      expect(component.paymentScannedAmount).toBeNull();
      expect(component.paymentForm.value.amount).toBe(200);
    });
  });

  describe('directa deposit reports', () => {
    it('clears directaReports when not permitted', () => {
      userState.isContabilidad.and.returnValue(false);
      userState.isSuperAdmin.and.returnValue(false);
      component.loadDirectaDepositReports();
      expect(component.directaReports()).toEqual([]);
      expect(expenseReportsService.findDirectaDepositReports).not.toHaveBeenCalled();
    });

    it('loads directaReports when permitted and clientId is resolvable', () => {
      userState.isContabilidad.and.returnValue(true);
      userState.getUser.and.returnValue({ companyId: 'c1' } as any);
      expenseReportsService.findDirectaDepositReports.and.returnValue(of([{ _id: 'd1' }]));
      component.loadDirectaDepositReports();
      expect(component.directaReports()).toEqual([{ _id: 'd1' }]);
    });

    it('goToNuevaRendicionDirecta navigates to the creation route', () => {
      component.goToNuevaRendicionDirecta();
      expect(router.navigate).toHaveBeenCalledWith(['/tesoreria/rendicion-directa/nueva']);
    });

    it('directaUserName resolves populated user name or email', () => {
      expect(component.directaUserName({ userId: { name: 'Luis' } })).toBe('Luis');
      expect(component.directaUserName({ userId: { email: 'x@test.com' } })).toBe('x@test.com');
      expect(component.directaUserName({ userId: 'u1' })).toBe('—');
    });
  });
});
