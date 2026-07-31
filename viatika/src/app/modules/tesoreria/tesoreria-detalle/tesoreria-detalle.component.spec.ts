import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TesoreriaDetalleComponent } from './tesoreria-detalle.component';
import { AdvanceService } from '../../../services/advance.service';
import { UserStateService } from '../../../services/user-state.service';
import { NotificationService } from '../../../services/notification.service';
import { UploadService } from '../../../services/upload.service';
import { IAdvance } from '../../../interfaces/advance.interface';

describe('TesoreriaDetalleComponent', () => {
  let component: TesoreriaDetalleComponent;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let uploadService: jasmine.SpyObj<UploadService>;
  let router: jasmine.SpyObj<Router>;

  function makeAdvance(overrides: Partial<IAdvance> = {}): IAdvance {
    return {
      _id: 'adv1',
      userId: { _id: 'u1', name: 'Juan Perez', email: 'juan@test.com' },
      clientId: 'c1',
      amount: 500,
      description: 'Viatico',
      status: 'approved',
      approvalLevel: 2,
      requiredLevels: 2,
      approvalHistory: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    } as IAdvance;
  }

  function setup(paramId = 'adv1', findOneResult = of(makeAdvance())) {
    advanceService = jasmine.createSpyObj('AdvanceService', ['findOne', 'registerPayment']);
    advanceService.findOne.and.returnValue(findOneResult);
    userState = jasmine.createSpyObj('UserStateService', ['canApproveL2']);
    userState.canApproveL2.and.returnValue(true);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    uploadService = jasmine.createSpyObj('UploadService', ['upload']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    const activatedRoute = { snapshot: { paramMap: { get: () => paramId } } };

    TestBed.configureTestingModule({
      imports: [TesoreriaDetalleComponent],
      providers: [
        { provide: AdvanceService, useValue: advanceService },
        { provide: UserStateService, useValue: userState },
        { provide: NotificationService, useValue: notifications },
        { provide: UploadService, useValue: uploadService },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: activatedRoute },
      ],
    });

    const fixture = TestBed.createComponent(TesoreriaDetalleComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => setup());

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('loads the advance by route id and stops loading', () => {
      const advance = makeAdvance();
      advanceService.findOne.and.returnValue(of(advance));
      component.ngOnInit();
      expect(advanceService.findOne).toHaveBeenCalledWith('adv1');
      expect(component.advance()).toEqual(advance);
      expect(component.isLoading()).toBeFalse();
    });

    it('navigates back to /tesoreria and notifies on load error', () => {
      advanceService.findOne.and.returnValue(throwError(() => new Error('not found')));
      component.ngOnInit();
      expect(notifications.show).toHaveBeenCalledWith('No se pudo cargar la solicitud', 'error');
      expect(router.navigate).toHaveBeenCalledWith(['/tesoreria']);
    });

    it('prefills bank data from the solicitud when present', () => {
      const advance = makeAdvance({ requestBankName: 'BBVA', requestAccountNumber: '999', requestCci: '111' });
      advanceService.findOne.and.returnValue(of(advance));
      component.ngOnInit();
      expect(component.paymentForm.value.bankName).toBe('BBVA');
      expect(component.paymentForm.value.accountNumber).toBe('999');
      expect(component.paymentForm.value.cci).toBe('111');
    });

    it('falls back to user bankAccount when no solicitud bank data', () => {
      const advance = makeAdvance({
        requestAccountNumber: undefined,
        userId: { _id: 'u1', name: 'Juan', email: 'j@test.com', bankAccount: { bankName: 'IBK', accountNumber: '222', cci: '333', accountType: 'ahorros' } },
      });
      advanceService.findOne.and.returnValue(of(advance));
      component.ngOnInit();
      expect(component.paymentForm.value.bankName).toBe('IBK');
      expect(component.paymentForm.value.accountNumber).toBe('222');
    });
  });

  describe('canRegisterPayment', () => {
    it('true when status pending_l2 or approved and user can pay', () => {
      component.ngOnInit();
      component.advance.set(makeAdvance({ status: 'pending_l2' }));
      userState.canApproveL2.and.returnValue(true);
      expect(component.canRegisterPayment).toBeTrue();
      component.advance.set(makeAdvance({ status: 'approved' }));
      expect(component.canRegisterPayment).toBeTrue();
    });

    it('false when status is not payable', () => {
      component.ngOnInit();
      component.advance.set(makeAdvance({ status: 'paid' }));
      expect(component.canRegisterPayment).toBeFalse();
    });

    it('false when no advance is loaded', () => {
      component.advance.set(null);
      expect(component.canRegisterPayment).toBeFalse();
    });

    it('false when user cannot pay and settle even if status is payable', () => {
      component.ngOnInit();
      component.advance.set(makeAdvance({ status: 'approved' }));
      userState.canApproveL2.and.returnValue(false);
      expect(component.canRegisterPayment).toBeFalse();
    });
  });

  describe('display helpers', () => {
    beforeEach(() => component.ngOnInit());

    it('collaboratorName/Email resolve populated user', () => {
      component.advance.set(makeAdvance({ userId: { _id: 'u1', name: 'Rosa Diaz', email: 'rosa@test.com' } }));
      expect(component.collaboratorName()).toBe('Rosa Diaz');
      expect(component.collaboratorEmail()).toBe('rosa@test.com');
    });

    it('collaboratorName/Email default when not populated', () => {
      component.advance.set(makeAdvance({ userId: 'u1' }));
      expect(component.collaboratorName()).toBe('—');
      expect(component.collaboratorEmail()).toBe('');
    });

    it('projectLabel formats code and name', () => {
      component.advance.set(makeAdvance({ projectId: { _id: 'p1', code: 'LIM-01', name: 'Proyecto Lima' } }));
      expect(component.projectLabel()).toBe('LIM-01 — Proyecto Lima');
    });

    it('projectLabel returns dash for missing project', () => {
      component.advance.set(makeAdvance({ projectId: undefined }));
      expect(component.projectLabel()).toBe('—');
    });

    it('dateRange formats start and end date', () => {
      component.advance.set(makeAdvance({ startDate: '2024-03-01', endDate: '2024-03-05' }));
      expect(component.dateRange()).toContain('—');
      expect(component.dateRange()).not.toBe('—');
    });

    it('dateRange returns dash when no dates', () => {
      component.advance.set(makeAdvance({ startDate: undefined, endDate: undefined }));
      expect(component.dateRange()).toBe('—');
    });

    it('createdAt formats the creation date', () => {
      component.advance.set(makeAdvance({ createdAt: '2024-01-01T00:00:00.000Z' }));
      expect(component.createdAt()).not.toBe('—');
    });

    it('lines returns the advance lines or empty array', () => {
      expect(component.lines()).toEqual([]);
      component.advance.set(makeAdvance({ lines: [{ categoryId: 'c1', importe: 10, peopleCount: 1, glpPerDay: 1, days: 1, lineTotal: 10 }] }));
      expect(component.lines().length).toBe(1);
    });

    it('categoryName resolves populated category', () => {
      const line = { categoryId: { _id: 'c1', name: 'Transporte' }, importe: 10, peopleCount: 1, glpPerDay: 1, days: 1, lineTotal: 10 };
      expect(component.categoryName(line)).toBe('Transporte');
    });

    it('historyActionLabel maps known actions', () => {
      expect(component.historyActionLabel('approved')).toBe('Aprobado');
      expect(component.historyActionLabel('weird')).toBe('weird');
    });

    it('reportTitle/reportId resolve populated report', () => {
      component.advance.set(makeAdvance({ expenseReportId: { _id: 'r1', title: 'Rendicion X', status: 'open' } }));
      expect(component.reportTitle()).toBe('Rendicion X');
      expect(component.reportId()).toBe('r1');
    });
  });

  describe('openPaymentModal', () => {
    it('resets receipt state and prefills bank data', () => {
      component.ngOnInit();
      component.advance.set(makeAdvance({ requestAccountNumber: '555', requestBankName: 'Scotia' }));
      component.paymentReceiptUrl = 'old';
      component.openPaymentModal();
      expect(component.paymentReceiptUrl).toBeNull();
      expect(component.paymentForm.value.bankName).toBe('Scotia');
      expect(component.showPaymentModal()).toBeTrue();
    });
  });

  describe('onReceiptSelected', () => {
    function fileEvent(file: File): Event {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [file] });
      return { target: input } as unknown as Event;
    }

    it('rejects invalid file type', () => {
      const file = new File(['x'], 'a.txt', { type: 'text/plain' });
      component.onReceiptSelected(fileEvent(file));
      expect(notifications.show).toHaveBeenCalledWith('Formato inválido. Usa PDF, JPG o PNG.', 'error');
      expect(uploadService.upload).not.toHaveBeenCalled();
    });

    it('rejects oversized files', () => {
      const bigContent = new Uint8Array(11 * 1024 * 1024);
      const file = new File([bigContent], 'a.pdf', { type: 'application/pdf' });
      component.onReceiptSelected(fileEvent(file));
      expect(notifications.show).toHaveBeenCalledWith('El comprobante no puede superar 10MB.', 'error');
      expect(uploadService.upload).not.toHaveBeenCalled();
    });

    it('uploads a valid receipt and stores its metadata', () => {
      uploadService.upload.and.returnValue(of({ url: 'http://s3/file.pdf' }));
      const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      component.onReceiptSelected(fileEvent(file));
      expect(component.paymentReceiptUrl).toBe('http://s3/file.pdf');
      expect(component.paymentReceiptName).toBe('a.pdf');
      expect(notifications.show).toHaveBeenCalledWith('Comprobante cargado', 'success');
      expect(component.isUploadingReceipt()).toBeFalse();
    });

    it('shows an error notification when upload fails', () => {
      uploadService.upload.and.returnValue(throwError(() => new Error('network')));
      const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      component.onReceiptSelected(fileEvent(file));
      expect(notifications.show).toHaveBeenCalledWith('No se pudo subir el comprobante', 'error');
      expect(component.isUploadingReceipt()).toBeFalse();
    });
  });

  describe('confirmPayment', () => {
    beforeEach(() => {
      component.ngOnInit();
      component.advance.set(makeAdvance({ _id: 'adv1' }));
      component.paymentForm.patchValue({ method: 'transferencia_bancaria', reference: 'ref1' });
      component.paymentReceiptUrl = 'http://s3/file.pdf';
    });

    it('does nothing without a loaded advance', () => {
      component.advance.set(null);
      component.confirmPayment();
      expect(advanceService.registerPayment).not.toHaveBeenCalled();
    });

    it('does nothing when the form is invalid', () => {
      component.paymentForm.patchValue({ reference: '' });
      component.confirmPayment();
      expect(advanceService.registerPayment).not.toHaveBeenCalled();
    });

    it('requires a receipt before registering payment', () => {
      component.paymentReceiptUrl = null;
      component.confirmPayment();
      expect(notifications.show).toHaveBeenCalledWith('Debes adjuntar el comprobante de pago.', 'error');
      expect(advanceService.registerPayment).not.toHaveBeenCalled();
    });

    it('registers the payment, updates the advance signal and closes the modal', () => {
      const updated = makeAdvance({ _id: 'adv1', status: 'paid' });
      advanceService.registerPayment.and.returnValue(of(updated));
      component.showPaymentModal.set(true);
      component.confirmPayment();
      expect(advanceService.registerPayment).toHaveBeenCalledWith('adv1', jasmine.objectContaining({
        paymentReceiptUrl: 'http://s3/file.pdf',
      }));
      expect(component.advance()).toEqual(updated);
      expect(notifications.show).toHaveBeenCalledWith('Pago registrado correctamente', 'success');
      expect(component.showPaymentModal()).toBeFalse();
      expect(component.isActing()).toBeFalse();
    });

    it('shows the backend error message on failure', () => {
      advanceService.registerPayment.and.returnValue(throwError(() => ({ error: { message: 'Rechazado por banco' } })));
      component.confirmPayment();
      expect(notifications.show).toHaveBeenCalledWith('Rechazado por banco', 'error');
      expect(component.isActing()).toBeFalse();
    });

    it('shows a generic error message when the backend gives none', () => {
      advanceService.registerPayment.and.returnValue(throwError(() => ({})));
      component.confirmPayment();
      expect(notifications.show).toHaveBeenCalledWith('Error al registrar pago', 'error');
    });
  });

  describe('back', () => {
    it('navigates to /tesoreria', () => {
      component.back();
      expect(router.navigate).toHaveBeenCalledWith(['/tesoreria']);
    });
  });
});
