import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NuevaRendicionDirectaDepositoComponent } from './nueva-rendicion-directa-deposito.component';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UploadService } from '../../../services/upload.service';
import { UserStateService } from '../../../services/user-state.service';
import { AdminUsersService } from '../../admin-users/services/admin-users.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { IUserResponse } from '../../../interfaces/user.interface';
import { IProject } from '../../invoices/interfaces/project.interface';
import { IOrdenTrabajo } from '../../../interfaces/orden-trabajo.interface';

describe('NuevaRendicionDirectaDepositoComponent', () => {
  let component: NuevaRendicionDirectaDepositoComponent;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let uploadService: jasmine.SpyObj<UploadService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let adminUsersService: jasmine.SpyObj<AdminUsersService>;
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let ordenTrabajoService: jasmine.SpyObj<OrdenTrabajoService>;
  let router: jasmine.SpyObj<Router>;

  function makeUser(overrides: Partial<IUserResponse> = {}): IUserResponse {
    return {
      _id: 'u1', name: 'Juan Perez', role: { name: 'Colaborador' } as any,
      email: 'juan@test.com', isActive: true, createdAt: new Date(), updatedAt: new Date(),
      ...overrides,
    } as IUserResponse;
  }

  function makeProject(overrides: Partial<IProject> = {}): IProject {
    return { _id: 'p1', name: 'Proyecto Lima', code: 'LIM', isActive: true, ...overrides };
  }

  function makeOt(overrides: Partial<IOrdenTrabajo> = {}): IOrdenTrabajo {
    return { _id: 'ot1', nombre: 'OT-1', costCenterId: 'p1', isActive: true, ...overrides };
  }

  beforeEach(() => {
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', ['scanDepositAmount', 'createDirectaDeposit']);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    uploadService = jasmine.createSpyObj('UploadService', ['upload']);
    userState = jasmine.createSpyObj('UserStateService', ['getUser']);
    adminUsersService = jasmine.createSpyObj('AdminUsersService', ['getUsers']);
    invoicesService = jasmine.createSpyObj('InvoicesService', ['getProjects']);
    ordenTrabajoService = jasmine.createSpyObj('OrdenTrabajoService', ['getAll']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    userState.getUser.and.returnValue({ companyId: 'c1' } as any);
    adminUsersService.getUsers.and.returnValue(of([]));
    invoicesService.getProjects.and.returnValue(of([]));
    ordenTrabajoService.getAll.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [NuevaRendicionDirectaDepositoComponent],
      providers: [
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: NotificationService, useValue: notifications },
        { provide: UploadService, useValue: uploadService },
        { provide: UserStateService, useValue: userState },
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: OrdenTrabajoService, useValue: ordenTrabajoService },
        { provide: Router, useValue: router },
      ],
    });

    const fixture = TestBed.createComponent(NuevaRendicionDirectaDepositoComponent);
    component = fixture.componentInstance;
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  describe('metodoPago helpers', () => {
    it('isEfectivo/requiresReceipt reflect the form control', () => {
      expect(component.isEfectivo).toBeFalse();
      expect(component.requiresReceipt).toBeTrue();
      component.setMetodoPago('efectivo');
      expect(component.isEfectivo).toBeTrue();
      expect(component.requiresReceipt).toBeFalse();
    });

    it('isReceiptMissing true only when receipt required and absent', () => {
      expect(component.isReceiptMissing).toBeTrue();
      component.setMetodoPago('efectivo');
      expect(component.isReceiptMissing).toBeFalse();
      component.setMetodoPago('deposito');
      component.depositReceiptUrl = 'http://s3/file.pdf';
      expect(component.isReceiptMissing).toBeFalse();
    });
  });

  describe('ngOnInit', () => {
    it('loads target users filtered to Colaborador/Coordinador roles', () => {
      const users = [
        makeUser({ _id: 'u1', roleName: 'Colaborador' }),
        makeUser({ _id: 'u2', roleName: 'Administrador' }),
        makeUser({ _id: 'u3', roleName: 'Coordinador' }),
      ];
      adminUsersService.getUsers.and.returnValue(of(users));
      component.ngOnInit();
      expect(component.targetUsers().map(u => u._id)).toEqual(['u1', 'u3']);
    });

    it('falls back to the full user list when none match allowed roles', () => {
      const users = [makeUser({ _id: 'u2', roleName: 'Administrador' })];
      adminUsersService.getUsers.and.returnValue(of(users));
      component.ngOnInit();
      expect(component.targetUsers().length).toBe(1);
    });

    it('clears target users on error', () => {
      adminUsersService.getUsers.and.returnValue(throwError(() => new Error('fail')));
      component.ngOnInit();
      expect(component.targetUsers()).toEqual([]);
    });

    it('loads only active projects for the resolved client', () => {
      const projects = [makeProject({ _id: 'p1', isActive: true }), makeProject({ _id: 'p2', isActive: false })];
      invoicesService.getProjects.and.returnValue(of(projects));
      component.ngOnInit();
      expect(invoicesService.getProjects).toHaveBeenCalledWith('c1');
      expect(component.projects().map(p => p._id)).toEqual(['p1']);
    });

    it('does not call getProjects when clientId cannot be resolved', () => {
      userState.getUser.and.returnValue({} as any);
      component.ngOnInit();
      expect(invoicesService.getProjects).not.toHaveBeenCalled();
    });

    it('clears projects on error', () => {
      invoicesService.getProjects.and.returnValue(throwError(() => new Error('fail')));
      component.ngOnInit();
      expect(component.projects()).toEqual([]);
    });

    it('loads only active ordenes de trabajo', () => {
      const ots = [makeOt({ _id: 'ot1', isActive: true }), makeOt({ _id: 'ot2', isActive: false })];
      ordenTrabajoService.getAll.and.returnValue(of(ots));
      component.ngOnInit();
      expect(component.ordenesTrabajo().map(o => o._id)).toEqual(['ot1']);
    });

    it('clears ordenesTrabajo on error', () => {
      ordenTrabajoService.getAll.and.returnValue(throwError(() => new Error('fail')));
      component.ngOnInit();
      expect(component.ordenesTrabajo()).toEqual([]);
    });
  });

  describe('filteredOrdenesTrabajo', () => {
    it('is empty when no project is selected', () => {
      component.ngOnInit();
      expect(component.filteredOrdenesTrabajo()).toEqual([]);
    });

    it('filters ordenes by the selected project cost center (string form)', () => {
      const ots = [makeOt({ _id: 'ot1', costCenterId: 'p1' }), makeOt({ _id: 'ot2', costCenterId: 'p2' })];
      ordenTrabajoService.getAll.and.returnValue(of(ots));
      component.ngOnInit();
      component.form.patchValue({ projectId: 'p1' });
      expect(component.filteredOrdenesTrabajo().map(o => o._id)).toEqual(['ot1']);
    });

    it('filters ordenes by the selected project cost center (populated object form)', () => {
      const ots = [makeOt({ _id: 'ot1', costCenterId: { _id: 'p1', name: 'CC1' } })];
      ordenTrabajoService.getAll.and.returnValue(of(ots));
      component.ngOnInit();
      component.form.patchValue({ projectId: 'p1' });
      expect(component.filteredOrdenesTrabajo().map(o => o._id)).toEqual(['ot1']);
    });

    it('clears ordenTrabajoId when the current selection no longer belongs to the new project', () => {
      const ots = [makeOt({ _id: 'ot1', costCenterId: 'p1' }), makeOt({ _id: 'ot2', costCenterId: 'p2' })];
      ordenTrabajoService.getAll.and.returnValue(of(ots));
      component.ngOnInit();
      component.form.patchValue({ projectId: 'p1', ordenTrabajoId: 'ot1' });
      component.form.patchValue({ projectId: 'p2' });
      expect(component.form.get('ordenTrabajoId')?.value).toBe('');
    });

    it('keeps ordenTrabajoId when it still belongs to the new project', () => {
      const ots = [makeOt({ _id: 'ot1', costCenterId: 'p1' })];
      ordenTrabajoService.getAll.and.returnValue(of(ots));
      component.ngOnInit();
      component.form.patchValue({ projectId: 'p1', ordenTrabajoId: 'ot1' });
      component.form.patchValue({ projectId: 'p1' });
      expect(component.form.get('ordenTrabajoId')?.value).toBe('ot1');
    });
  });

  describe('otErrorMessage', () => {
    it('prioritizes the "no active OT" message over the generic required error', () => {
      component.ngOnInit();
      component.form.patchValue({ projectId: 'p1' });
      component.form.get('ordenTrabajoId')?.markAsTouched();
      expect(component.otErrorMessage()).toContain('no tiene órdenes de trabajo activas');
    });

    it('shows the generic required message when no project is selected and the field is touched', () => {
      component.ngOnInit();
      component.form.get('ordenTrabajoId')?.markAsTouched();
      expect(component.otErrorMessage()).toBe('Seleccione una orden de trabajo');
    });

    it('is empty when untouched', () => {
      component.ngOnInit();
      expect(component.otErrorMessage()).toBe('');
    });
  });

  describe('targetUserLabel', () => {
    it('appends role when present', () => {
      const user = makeUser({ name: 'Ana', roleName: 'Colaborador' });
      expect(component.targetUserLabel(user)).toBe('Ana (Colaborador)');
    });

    it('returns plain name when no role', () => {
      const user = makeUser({ name: 'Ana', roleName: undefined, role: undefined as any });
      expect(component.targetUserLabel(user)).toBe('Ana');
    });
  });

  describe('goBack', () => {
    it('navigates to /tesoreria with rendiciones-directas tab', () => {
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/tesoreria'], { queryParams: { tab: 'rendiciones-directas' } });
    });
  });

  describe('onDepositReceiptSelected', () => {
    function fileEvent(file: File): Event {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [file] });
      return { target: input } as unknown as Event;
    }

    it('rejects an invalid file type', () => {
      const file = new File(['x'], 'a.txt', { type: 'text/plain' });
      component.onDepositReceiptSelected(fileEvent(file));
      expect(notifications.show).toHaveBeenCalledWith('Formato inválido. Usa PDF, JPG o PNG.', 'error');
      expect(uploadService.upload).not.toHaveBeenCalled();
    });

    it('rejects an oversized file', () => {
      const bigContent = new Uint8Array(11 * 1024 * 1024);
      const file = new File([bigContent], 'a.pdf', { type: 'application/pdf' });
      component.onDepositReceiptSelected(fileEvent(file));
      expect(notifications.show).toHaveBeenCalledWith('El comprobante no puede superar 10MB.', 'error');
      expect(uploadService.upload).not.toHaveBeenCalled();
    });

    it('uploads then scans the receipt, autofilling the amount on success', () => {
      uploadService.upload.and.returnValue(of({ url: 'http://s3/file.pdf' }));
      expenseReportsService.scanDepositAmount.and.returnValue(of({ amount: 150, operationNumber: 'OP1', titular: 'Juan' }));
      const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      component.onDepositReceiptSelected(fileEvent(file));
      expect(component.depositReceiptUrl).toBe('http://s3/file.pdf');
      expect(component.form.value.amount).toBe(150);
      expect(component.hasDetectedData).toBeTrue();
      expect(notifications.show).toHaveBeenCalledWith(
        'Datos detectados del comprobante. Puedes editar el monto si es necesario.', 'success'
      );
    });

    it('warns when scan detects no amount', () => {
      uploadService.upload.and.returnValue(of({ url: 'http://s3/file.pdf' }));
      expenseReportsService.scanDepositAmount.and.returnValue(of({ amount: 0 }));
      const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      component.onDepositReceiptSelected(fileEvent(file));
      expect(notifications.show).toHaveBeenCalledWith('No se pudo detectar el monto. Ingrésalo manualmente.', 'warning');
    });

    it('warns when the scan request fails', () => {
      uploadService.upload.and.returnValue(of({ url: 'http://s3/file.pdf' }));
      expenseReportsService.scanDepositAmount.and.returnValue(throwError(() => new Error('fail')));
      const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      component.onDepositReceiptSelected(fileEvent(file));
      expect(notifications.show).toHaveBeenCalledWith('No se pudo escanear el comprobante. Ingresa el monto manualmente.', 'warning');
    });

    it('shows an error when the upload itself fails', () => {
      uploadService.upload.and.returnValue(throwError(() => new Error('network')));
      const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
      component.onDepositReceiptSelected(fileEvent(file));
      expect(notifications.show).toHaveBeenCalledWith('No se pudo subir el comprobante', 'error');
      expect(component.isUploadingDeposit()).toBeFalse();
    });
  });

  describe('removeDepositReceipt', () => {
    it('clears all receipt and scan fields', () => {
      component.depositReceiptUrl = 'url';
      component.depositScannedAmount = 100;
      component.depositTitular = 'Juan';
      component.removeDepositReceipt();
      expect(component.depositReceiptUrl).toBeNull();
      expect(component.depositScannedAmount).toBeNull();
      expect(component.depositTitular).toBeNull();
      expect(component.hasDetectedData).toBeFalse();
    });
  });

  describe('submit', () => {
    beforeEach(() => {
      component.form.patchValue({
        userId: 'u1', projectId: 'p1', ordenTrabajoId: 'ot1', metodoPago: 'deposito', amount: 100,
      });
      component.depositReceiptUrl = 'http://s3/file.pdf';
    });

    it('marks all fields touched and does not submit when the form is invalid', () => {
      component.form.patchValue({ amount: null });
      component.submit();
      expect(expenseReportsService.createDirectaDeposit).not.toHaveBeenCalled();
      expect(component.form.get('amount')?.touched).toBeTrue();
    });

    it('blocks submission when a receipt is required but missing', () => {
      component.depositReceiptUrl = null;
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('Debes adjuntar el comprobante de depósito.', 'error');
      expect(expenseReportsService.createDirectaDeposit).not.toHaveBeenCalled();
    });

    it('allows submission in efectivo mode without a receipt', () => {
      component.form.patchValue({ metodoPago: 'efectivo' });
      component.depositReceiptUrl = null;
      expenseReportsService.createDirectaDeposit.and.returnValue(of({ _id: 'r1' } as any));
      component.submit();
      expect(expenseReportsService.createDirectaDeposit).toHaveBeenCalled();
    });

    it('creates the rendicion directa and navigates to its detail page', () => {
      expenseReportsService.createDirectaDeposit.and.returnValue(of({ _id: 'r1' } as any));
      component.submit();
      expect(expenseReportsService.createDirectaDeposit).toHaveBeenCalledWith(jasmine.objectContaining({
        userId: 'u1', projectId: 'p1', ordenTrabajoId: 'ot1', amount: 100, metodoPago: 'deposito',
        receiptUrl: 'http://s3/file.pdf',
      }));
      expect(notifications.show).toHaveBeenCalledWith('Rendición directa creada con el depósito registrado.', 'success');
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'r1', 'detalle']);
      expect(component.isCreating()).toBeFalse();
    });

    it('shows a joined error message when the backend returns an array of messages', () => {
      expenseReportsService.createDirectaDeposit.and.returnValue(
        throwError(() => ({ error: { message: ['Campo A requerido', 'Campo B invalido'] } }))
      );
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('Campo A requerido, Campo B invalido', 'error');
      expect(component.isCreating()).toBeFalse();
    });

    it('shows a generic error message when the backend gives none', () => {
      expenseReportsService.createDirectaDeposit.and.returnValue(throwError(() => ({})));
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('Error al crear la rendición.', 'error');
    });
  });
});
