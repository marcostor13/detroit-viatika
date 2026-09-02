import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TesoreriaComponent } from './tesoreria.component';
import { AdvanceService, IReconcileResult } from '../../services/advance.service';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { UploadService } from '../../services/upload.service';
import { FondoCajaChicaService } from '../../services/fondo-caja-chica.service';
import { IAdvance } from '../../interfaces/advance.interface';
import { IExpenseReport } from '../../interfaces/expense-report.interface';

describe('TesoreriaComponent', () => {
  let component: TesoreriaComponent;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let uploadService: jasmine.SpyObj<UploadService>;
  let fondoCajaChicaService: jasmine.SpyObj<FondoCajaChicaService>;
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
      'reconcilePayments',
    ]);
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', [
      'findPendingReimbursements', 'findPendingReturnReports', 'findAllByClient',
      'findDirectaDepositReports', 'scanDepositAmount', 'registerViaticoPayment',
      'registerReimbursementPayment', 'registerReturnVoucher',
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
    expenseReportsService.findPendingReturnReports.and.returnValue(of([]));
    expenseReportsService.findAllByClient.and.returnValue(of([]));
    expenseReportsService.findDirectaDepositReports.and.returnValue(of([]));
    userState.getUser.and.returnValue({ companyId: 'c1' } as any);
    userState.canApproveL2.and.returnValue(true);
    userState.isSuperAdmin.and.returnValue(false);
    userState.isAdmin.and.returnValue(false);
    userState.isContabilidad.and.returnValue(false);

    // El componente lista los fondos de caja chica al cargar; sin este doble
    // el spec pedia el HttpClient real y toda la suite moria en el inyector.
    fondoCajaChicaService = jasmine.createSpyObj('FondoCajaChicaService', ['findAllByClient']);
    fondoCajaChicaService.findAllByClient.and.returnValue(of([]));

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
        { provide: FondoCajaChicaService, useValue: fondoCajaChicaService },
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
        { provide: FondoCajaChicaService, useValue: fondoCajaChicaService },
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
      // VD-37: "Reembolsos" (lo que se le paga al colaborador) y "Devoluciones"
      // (lo que él devuelve) son pestañas separadas.
      expect(tabs.map(t => t.value)).toEqual([
        'pendientes', 'aprobados', 'reembolsos', 'devoluciones', 'rendiciones-directas',
      ]);
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

  describe('canSeePaymentInfo', () => {
    it('shows payment info for approved/partially_paid/paid when canPayAndSettle', () => {
      userState.canApproveL2.and.returnValue(true);
      expect(component.canSeePaymentInfo(makeAdvance({ status: 'approved' }))).toBeTrue();
      expect(component.canSeePaymentInfo(makeAdvance({ status: 'partially_paid' }))).toBeTrue();
      expect(component.canSeePaymentInfo(makeAdvance({ status: 'paid' }))).toBeTrue();
      expect(component.canSeePaymentInfo(makeAdvance({ status: 'pending_l2' }))).toBeFalse();
    });

    it('hides payment info when user cannot pay and settle', () => {
      userState.canApproveL2.and.returnValue(false);
      expect(component.canSeePaymentInfo(makeAdvance({ status: 'approved' }))).toBeFalse();
    });

  });

  describe('viatico payment helpers', () => {
    it('viaticoRemaining computes amount minus paid, floored at 0', () => {
      const report = makeReport({ viaticoAmount: 500, viaticoPaidAmount: 150 });
      expect(component.viaticoRemaining(report)).toBe(350);
    });

    // VD-129: la ficha es informativa, asi que NO se esconde cuando ya no queda
    // saldo — es justo cuando hay algo que consultar (el N° de operacion del
    // banco). Solo manda el permiso.
    it('canSeeViaticoPaymentInfo sigue al permiso de pago, no al saldo', () => {
      userState.canApproveL2.and.returnValue(true);
      expect(component.canSeeViaticoPaymentInfo()).toBeTrue();
    });

    it('canSeeViaticoPaymentInfo es false sin permiso de pago', () => {
      userState.canApproveL2.and.returnValue(false);
      expect(component.canSeeViaticoPaymentInfo()).toBeFalse();
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

  // VD-129: el modal de la solicitud de fondos es una ficha de solo lectura. El
  // abono sale de la planilla BBVA y el N° de operación lo trae la conciliación
  // del PDF del banco, no un campo que alguien escriba.
  describe('openViaticoPaymentModal (ficha informativa, VD-129)', () => {
    beforeEach(() => component.initForms());

    it('deja el formulario deshabilitado', () => {
      component.openViaticoPaymentModal(makeReport({ _id: 'r1' }));
      expect(component.showViaticoPaymentModal).toBeTrue();
      expect(component.paymentForm.disabled).toBeTrue();
    });

    it('muestra el centro de costo con su código y la OT', () => {
      const rep = makeReport({
        _id: 'r1',
        projectId: { _id: 'p1', code: 'CC-001', name: 'Proyecto Minera Antamina' },
        viaticoOrdenTrabajoId: { _id: 'ot1', nombre: 'SMI-123' },
      } as any);
      expect(component.viaticoCentroCosto(rep)).toBe('CC-001 — Proyecto Minera Antamina');
      expect(component.viaticoOrdenTrabajo(rep)).toBe('SMI-123');
    });

    it('sin OT no inventa una fila, y sin poblar no muestra el id crudo', () => {
      expect(component.viaticoOrdenTrabajo(makeReport({ _id: 'r1' }))).toBe('');
      const sinPoblar = makeReport({ _id: 'r1', projectId: 'p1' } as any);
      expect(component.viaticoCentroCosto(sinPoblar)).toBe('—');
    });

    // Misma prioridad que la columna Descripción de la lista: si la ficha
    // nombrara distinto a la fila que se acaba de pulsar, desorienta.
    it('el título usa el lugar de destino y deja el title de respaldo', () => {
      expect(
        component.viaticoTitulo(
          makeReport({ _id: 'r1', title: 'Rendicion', viaticoPlace: 'Lima, Perú' } as any)
        )
      ).toBe('Lima, Perú');
      expect(
        component.viaticoTitulo(
          makeReport({ _id: 'r1', title: 'Caja chica', viaticoPlace: undefined } as any)
        )
      ).toBe('Caja chica');
    });

    it('sin pago aún no hay N° de operación que mostrar', () => {
      expect(component.viaticoOperationReference(makeReport({ _id: 'r1' }))).toBeNull();
      expect(component.viaticoPaymentDate(makeReport({ _id: 'r1' }))).toBeNull();
    });

    it('toma el N° de operación del último pago registrado', () => {
      const rep = makeReport({
        _id: 'r1',
        viaticoPayments: [
          { reference: '000025710', transferDate: '2026-08-18' },
          { operationNumber: '000025714', transferDate: '2026-08-19' },
        ],
      } as any);
      expect(component.viaticoOperationReference(rep)).toBe('000025714');
      expect(component.viaticoPaymentDate(rep)).toBe('2026-08-19');
    });

    // `paymentForm` es compartido por los modales de Tesorería y `reset()` NO
    // cambia habilitado/deshabilitado: cada apertura tiene que fijarlo, o hereda
    // el estado del modal anterior. Conviven fichas de solo lectura y el registro
    // manual del pago urgente, así que el fallo puede caer de los dos lados —una
    // ficha escribible o un formulario en gris—: se comprueba el ciclo completo.
    it('cada modal fija el estado del formulario compartido', () => {
      const rep = makeReport({ _id: 'r1' });
      const reembolso = makeReport({
        _id: 'r2',
        settlement: { type: 'reembolso', difference: -50 },
      } as any);

      component.openViaticoPaymentModal(rep);
      expect(component.paymentForm.disabled).toBeTrue();

      component.openReimbursementModal(reembolso);
      expect(component.paymentForm.disabled).toBeTrue();

      // El registro manual del pago urgente sí escribe...
      component.openManualViaticoPaymentModal(rep);
      expect(component.paymentForm.enabled).toBeTrue();

      // ...y volver a la ficha del mismo pago tiene que dejarlo en gris otra vez.
      component.openViaticoPaymentModal(rep);
      expect(component.paymentForm.disabled).toBeTrue();

      component.openPaymentModal(makeAdvance({ _id: 'a1' }), false);
      expect(component.paymentForm.enabled).toBeTrue();

      component.openReimbursementModal(reembolso);
      expect(component.paymentForm.disabled).toBeTrue();
    });

    it('cae a viaticoPaymentInfo cuando no hay pagos parciales', () => {
      const rep = makeReport({
        _id: 'r1',
        viaticoPaymentInfo: { reference: '000025714', transferDate: '2026-08-19' },
      } as any);
      expect(component.viaticoOperationReference(rep)).toBe('000025714');
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
      expect(notifications.show).toHaveBeenCalledWith('Pago de fondos registrado correctamente', 'success');
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

  // El registro manual vuelve para el viaje urgente que Tesorería paga desde el
  // BCP, fuera de la planilla BBVA. Se comprueba lo que lo separa del pago por
  // planilla: formulario escribible, comprobante que NO se escanea y un N° de
  // operación que viaja en `reference`, nunca en `operationNumber` (ese lo
  // escribe la conciliación del PDF del banco).
  describe('pago manual del viaje urgente', () => {
    beforeEach(() => component.initForms());

    function fileEvent(file: File): Event {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [file] });
      return { target: input } as unknown as Event;
    }

    it('abre el formulario escribible con el saldo pendiente', () => {
      const rep = makeReport({ _id: 'r1', viaticoAmount: 500, viaticoPaidAmount: 200 } as any);
      component.openManualViaticoPaymentModal(rep);
      expect(component.viaticoPaymentManual).toBeTrue();
      expect(component.paymentForm.enabled).toBeTrue();
      expect(component.paymentForm.value.amount).toBe(300);
      expect(component.showViaticoPaymentModal).toBeTrue();
    });

    it('la ficha de consulta no entra en modo registro', () => {
      component.openViaticoPaymentModal(makeReport({ _id: 'r1' }));
      expect(component.viaticoPaymentManual).toBeFalse();
    });

    it('propone los datos bancarios de la solicitud', () => {
      const rep = makeReport({
        _id: 'r1',
        viaticoAmount: 500,
        viaticoBankName: 'BCP',
        viaticoAccountNumber: '191-1234567-0-99',
        viaticoCci: '00219100123456789099',
      } as any);
      component.openManualViaticoPaymentModal(rep);
      expect(component.paymentForm.value.bankName).toBe('BCP');
      expect(component.paymentForm.value.accountNumber).toBe('191-1234567-0-99');
      expect(component.paymentForm.value.cci).toBe('00219100123456789099');
    });

    // El comprobante es una foto de otro banco y el lector está calibrado para
    // el formato de BBVA: leerlo solo servía para rellenar mal el monto.
    it('adjunta el comprobante sin escanearlo ni tocar el monto', () => {
      uploadService.upload.and.returnValue(of({ url: 'http://s3/bcp.jpg' }));
      component.openManualViaticoPaymentModal(makeReport({ _id: 'r1', viaticoAmount: 500 } as any));
      component.onViaticoPaymentReceiptSelected(fileEvent(new File(['x'], 'bcp.jpg', { type: 'image/jpeg' })));
      expect(component.viaticoPaymentReceiptUrl).toBe('http://s3/bcp.jpg');
      expect(expenseReportsService.scanDepositAmount).not.toHaveBeenCalled();
      expect(component.paymentForm.value.amount).toBe(500);
    });

    it('el N° de operación digitado viaja en reference, no en operationNumber', () => {
      expenseReportsService.registerViaticoPayment.and.returnValue(of(makeReport()));
      component.openManualViaticoPaymentModal(makeReport({ _id: 'r1', viaticoAmount: 500 } as any));
      component.viaticoPaymentReceiptUrl = 'http://s3/bcp.jpg';
      component.paymentForm.patchValue({ amount: 500, reference: '000030112' });
      component.confirmViaticoPayment();
      const payload = expenseReportsService.registerViaticoPayment.calls.mostRecent().args[1] as any;
      expect(payload.reference).toBe('000030112');
      expect(payload.operationNumber).toBeUndefined();
      expect(payload.scannedAmount).toBeUndefined();
      expect(payload.paymentReceiptUrl).toBe('http://s3/bcp.jpg');
    });

    describe('canRegisterViaticoPayment', () => {
      it('deja registrar mientras quede saldo por depositar', () => {
        expect(component.canRegisterViaticoPayment(
          makeReport({ _id: 'r1', status: 'viatico_approved', viaticoAmount: 500 } as any)
        )).toBeTrue();
        expect(component.canRegisterViaticoPayment(
          makeReport({ _id: 'r1', status: 'partially_paid', viaticoAmount: 500, viaticoPaidAmount: 200 } as any)
        )).toBeTrue();
      });

      it('lo cierra con la solicitud ya cubierta o fuera de la fase de pago', () => {
        expect(component.canRegisterViaticoPayment(
          makeReport({ _id: 'r1', status: 'viatico_approved', viaticoAmount: 500, viaticoPaidAmount: 500 } as any)
        )).toBeFalse();
        expect(component.canRegisterViaticoPayment(
          makeReport({ _id: 'r1', status: 'open', viaticoAmount: 500 } as any)
        )).toBeFalse();
      });

      it('lo cierra para quien no paga ni liquida', () => {
        userState.canApproveL2.and.returnValue(false);
        expect(component.canRegisterViaticoPayment(
          makeReport({ _id: 'r1', status: 'viatico_approved', viaticoAmount: 500 } as any)
        )).toBeFalse();
      });
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

    // VD-129: el pago se hace por la planilla BBVA; desde la lista solo se
    // consulta. Un formulario habilitado aquí es un pago marcable a mano.
    it('openPaymentInfo opens the modal read-only and disables the form', () => {
      component.openPaymentInfo(makeAdvance());
      expect(component.showPaymentModal).toBeTrue();
      expect(component.paymentModalReadOnly).toBeTrue();
      expect(component.paymentForm.disabled).toBeTrue();
    });

    it('openPaymentModal re-enables the form when it is not read-only', () => {
      component.openPaymentInfo(makeAdvance());
      component.openPaymentModal(makeAdvance());
      expect(component.paymentModalReadOnly).toBeFalse();
      expect(component.paymentForm.enabled).toBeTrue();
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

    // `goToNuevaRendicionDirecta` se retiró del componente: Tesorería ya no
    // crea la rendición directa desde esta pantalla.

    it('directaUserName resolves populated user name or email', () => {
      expect(component.directaUserName({ userId: { name: 'Luis' } })).toBe('Luis');
      expect(component.directaUserName({ userId: { email: 'x@test.com' } })).toBe('x@test.com');
      expect(component.directaUserName({ userId: 'u1' })).toBe('—');
    });
  });

  describe('conciliación del reporte del banco (varias páginas)', () => {
    const pdf = (name: string, size = 1024) =>
      new File([new Uint8Array(size)], name, { type: 'application/pdf' });
    const evento = (files: File[]) =>
      ({ target: { files, value: 'x' } }) as unknown as Event;

    it('elegir archivos NO concilia todavía: los deja en la lista', () => {
      // Conciliar en cuanto se elige un archivo llevaba a subir las páginas de
      // una en una, y un archivo suelto nunca cuadra contra el total del lote.
      component.onReconcileFileSelected(evento([pdf('pagina1.pdf')]));

      expect(advanceService.reconcilePayments).not.toHaveBeenCalled();
      expect(component.showReconcileFilesModal()).toBeTrue();
      expect(component.reconcilePendingFiles().map((f) => f.name)).toEqual(['pagina1.pdf']);
    });

    it('acumula las páginas elegidas en varias tandas', () => {
      component.onReconcileFileSelected(evento([pdf('pagina1.pdf')]));
      component.onReconcileFileSelected(evento([pdf('pagina2.pdf'), pdf('pagina3.pdf')]));

      expect(component.reconcilePendingFiles().map((f) => f.name)).toEqual([
        'pagina1.pdf', 'pagina2.pdf', 'pagina3.pdf',
      ]);
    });

    it('no agrega dos veces el mismo archivo', () => {
      // Repetir una página duplicaría sus abonos y el lote dejaría de cuadrar.
      component.onReconcileFileSelected(evento([pdf('pagina1.pdf')]));
      component.onReconcileFileSelected(evento([pdf('pagina1.pdf'), pdf('pagina2.pdf')]));

      expect(component.reconcilePendingFiles().length).toBe(2);
      expect(notifications.show).toHaveBeenCalledWith(
        jasmine.stringMatching(/ya estaban en la lista/), 'warning'
      );
    });

    it('permite quitar un archivo y cierra la lista al vaciarla', () => {
      component.onReconcileFileSelected(evento([pdf('pagina1.pdf'), pdf('pagina2.pdf')]));
      component.removeReconcileFile(0);
      expect(component.reconcilePendingFiles().map((f) => f.name)).toEqual(['pagina2.pdf']);

      component.removeReconcileFile(0);
      expect(component.reconcilePendingFiles().length).toBe(0);
      expect(component.showReconcileFilesModal()).toBeFalse();
    });

    it('manda TODAS las páginas juntas al confirmar', () => {
      advanceService.reconcilePayments.and.returnValue(of({
        moneda: 'PEN', advertencias: [], conciliados: [], sinConciliar: [], noAbonados: [],
      } as unknown as IReconcileResult));
      component.onReconcileFileSelected(evento([pdf('pagina1.pdf')]));
      component.onReconcileFileSelected(evento([pdf('pagina2.pdf')]));
      component.confirmReconcileFiles();

      const [files] = advanceService.reconcilePayments.calls.mostRecent().args;
      expect((files as File[]).map((f) => f.name)).toEqual(['pagina1.pdf', 'pagina2.pdf']);
      expect(component.reconcilePendingFiles().length).toBe(0);
      expect(component.showReconcileFilesModal()).toBeFalse();
    });

    it('cancelar descarta la selección sin conciliar', () => {
      component.onReconcileFileSelected(evento([pdf('pagina1.pdf')]));
      component.cancelReconcileFiles();

      expect(advanceService.reconcilePayments).not.toHaveBeenCalled();
      expect(component.reconcilePendingFiles().length).toBe(0);
      expect(component.showReconcileFilesModal()).toBeFalse();
    });

    it('rechaza un archivo que no sea PDF', () => {
      const noPdf = new File([new Uint8Array(10)], 'foto.png', { type: 'image/png' });
      component.onReconcileFileSelected(evento([noPdf]));

      expect(component.reconcilePendingFiles().length).toBe(0);
      expect(component.showReconcileFilesModal()).toBeFalse();
      expect(notifications.show).toHaveBeenCalledWith(
        jasmine.stringMatching(/Consulta de Pagos Masivos/), 'error'
      );
    });
  });

  /**
   * La devolucion solo la podia cargar el colaborador desde su rendicion. Si el
   * deposito entra por fuera de la app, Tesoreria no tenia como asentarlo y la
   * rendicion se quedaba sin poder cerrar.
   */
  describe('devolucion manual', () => {
    // Los formularios se arman en ngOnInit; estas pruebas abren el modal sin
    // pasar por la carga, asi que hay que construirlos aparte.
    beforeEach(() => component.initForms());

    const reporteConSaldo = (overrides: Partial<IExpenseReport> = {}) =>
      makeReport({
        _id: 'rep-dev',
        title: 'Viaje a Tacna',
        status: 'approved',
        settlement: { advanceTotal: 500, expenseTotal: 380, difference: 120, type: 'devolucion' },
        ...overrides,
      } as Partial<IExpenseReport>);

    it('carga las rendiciones con saldo por devolver', () => {
      expenseReportsService.findPendingReturnReports.and.returnValue(of([reporteConSaldo()]));
      component.ngOnInit();
      expect(component.pendingReturnReports.length).toBe(1);
    });

    it('no las pide si el usuario no puede pagar ni liquidar', () => {
      userState.canApproveL2.and.returnValue(false);
      component.ngOnInit();
      expect(expenseReportsService.findPendingReturnReports).not.toHaveBeenCalled();
      expect(component.pendingReturnReports).toEqual([]);
    });

    it('las cuenta en el badge de la pestaña Devoluciones', () => {
      component.pendingReturnReports = [reporteConSaldo()];
      const devoluciones = component.tabsList.find(t => t.value === 'devoluciones');
      expect(devoluciones?.badge).toBe(1);
    });

    it('propone el saldo pendiente como monto a devolver', () => {
      component.openManualReturnModal(reporteConSaldo());
      expect(component.showManualReturnModal).toBeTrue();
      expect(component.manualReturnForm.value.amountReturned).toBe(120);
    });

    // `settlement.difference` viene en moneda base: mostrar 120 junto al simbolo
    // de dolares le diria a Tesoreria que cobre soles como si fueran dolares.
    it('convierte el saldo a la moneda de la rendicion', () => {
      const enDolares = reporteConSaldo({ viaticoMoneda: 'USD', tipoCambio: 4 } as Partial<IExpenseReport>);
      expect(component.returnReportAmount(enDolares)).toBe(30);
      expect(component.reimbursementSymbol(enDolares)).toBe('$');
    });

    it('exige la constancia del deposito antes de registrar', () => {
      component.openManualReturnModal(reporteConSaldo());
      component.confirmManualReturn();

      expect(expenseReportsService.registerReturnVoucher).not.toHaveBeenCalled();
      expect(notifications.show).toHaveBeenCalledWith(
        jasmine.stringMatching(/constancia/), 'error'
      );
    });

    it('registra la devolucion con los datos del formulario', () => {
      expenseReportsService.registerReturnVoucher.and.returnValue(of(reporteConSaldo()));
      component.openManualReturnModal(reporteConSaldo());
      component.manualReturnReceiptUrl = 'https://s3/constancia.pdf';
      component.manualReturnReceiptName = 'constancia.pdf';
      component.manualReturnForm.patchValue({
        depositDate: '2026-09-01',
        bankOrigin: 'BCP',
        operationNumber: '000123',
      });
      component.confirmManualReturn();

      const [reportId, payload] = expenseReportsService.registerReturnVoucher.calls.mostRecent().args;
      expect(reportId).toBe('rep-dev');
      expect(payload).toEqual(jasmine.objectContaining({
        depositDate: '2026-09-01',
        amountReturned: 120,
        bankOrigin: 'BCP',
        operationNumber: '000123',
        fileUrl: 'https://s3/constancia.pdf',
      }));
      expect(component.showManualReturnModal).toBeFalse();
    });

    it('deja el modal abierto si el backend rechaza el registro', () => {
      expenseReportsService.registerReturnVoucher.and.returnValue(
        throwError(() => ({ error: { message: 'Ya se ha cargado un comprobante' } }))
      );
      component.openManualReturnModal(reporteConSaldo());
      component.manualReturnReceiptUrl = 'https://s3/constancia.pdf';
      component.confirmManualReturn();

      expect(component.showManualReturnModal).toBeTrue();
      expect(component.isActing()).toBeFalse();
      expect(notifications.show).toHaveBeenCalledWith('Ya se ha cargado un comprobante', 'error');
    });
  });
});
