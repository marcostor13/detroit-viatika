import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NuevaRendicionDirectaComponent } from './nueva-rendicion-directa.component';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { IExpenseReport } from '../../../interfaces/expense-report.interface';
import { IOrdenTrabajo } from '../../../interfaces/orden-trabajo.interface';

describe('NuevaRendicionDirectaComponent', () => {
  let component: NuevaRendicionDirectaComponent;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let ordenTrabajoService: jasmine.SpyObj<OrdenTrabajoService>;
  let router: jasmine.SpyObj<Router>;

  const ordenes: IOrdenTrabajo[] = [
    { _id: 'ot1', nombre: 'OT 1', costCenterId: 'p1', isActive: true },
    { _id: 'ot2', nombre: 'OT 2', costCenterId: 'p2', isActive: true },
  ];

  beforeEach(() => {
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', ['create']);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    userState = jasmine.createSpyObj('UserStateService', ['getUser']);
    invoicesService = jasmine.createSpyObj('InvoicesService', ['getProjects']);
    ordenTrabajoService = jasmine.createSpyObj('OrdenTrabajoService', ['getAll']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    userState.getUser.and.returnValue({ _id: 'u1', companyId: 'c1' } as any);
    invoicesService.getProjects.and.returnValue(of([{ _id: 'p1', name: 'Proyecto 1', code: 'P1', isActive: true }]));
    ordenTrabajoService.getAll.and.returnValue(of(ordenes));

    TestBed.configureTestingModule({
      imports: [NuevaRendicionDirectaComponent],
      providers: [
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: NotificationService, useValue: notifications },
        { provide: UserStateService, useValue: userState },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: OrdenTrabajoService, useValue: ordenTrabajoService },
        { provide: Router, useValue: router },
      ],
    });

    component = TestBed.createComponent(NuevaRendicionDirectaComponent).componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('loads active projects and ordenes de trabajo', () => {
      component.ngOnInit();
      expect(invoicesService.getProjects).toHaveBeenCalledWith('c1');
      expect(component.projects().length).toBe(1);
      expect(component.ordenesTrabajo().length).toBe(2);
    });

    it('clears the ordenTrabajoId when the project changes and the OT no longer belongs to it', () => {
      component.ngOnInit();
      component.form.patchValue({ projectId: 'p1', ordenTrabajoId: 'ot1' });
      component.form.get('projectId')?.setValue('p2');
      expect(component.form.get('ordenTrabajoId')?.value).toBe('');
    });
  });

  describe('filteredOrdenesTrabajo', () => {
    it('only returns ordenes matching the selected project', () => {
      component.ngOnInit();
      component.form.get('projectId')?.setValue('p1');
      expect(component.filteredOrdenesTrabajo().map(o => o._id)).toEqual(['ot1']);
    });
  });

  describe('submit', () => {
    it('marks fields as touched when the form is invalid', () => {
      component.submit();
      expect(expenseReportsService.create).not.toHaveBeenCalled();
      expect(component.form.get('gestion')?.touched).toBeTrue();
    });

    it('shows an error when the user/company cannot be identified', () => {
      userState.getUser.and.returnValue(null as any);
      component.form.patchValue({ gestion: 'Compras', projectId: 'p1', ordenTrabajoId: 'ot1' });
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('No se pudo identificar al usuario o empresa.', 'error');
    });

    it('creates the rendicion and navigates to its detail on success', () => {
      component.form.patchValue({ gestion: 'Compras', projectId: 'p1', ordenTrabajoId: 'ot1' });
      expenseReportsService.create.and.returnValue(of({ _id: 'r1' } as IExpenseReport));
      component.submit();
      expect(expenseReportsService.create).toHaveBeenCalledWith(jasmine.objectContaining({
        gestion: 'Compras', isDirecta: true, userId: 'u1', clientId: 'c1',
      }));
      expect(notifications.show).toHaveBeenCalledWith('Rendición creada correctamente.', 'success');
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'r1', 'detalle']);
    });

    it('shows an error notification on failure', () => {
      component.form.patchValue({ gestion: 'Compras', projectId: 'p1', ordenTrabajoId: 'ot1' });
      expenseReportsService.create.and.returnValue(throwError(() => ({ error: { message: 'boom' } })));
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('boom', 'error');
      expect(component.submitting()).toBeFalse();
    });
  });

  describe('goBack / isInvalid / otErrorMessage', () => {
    it('goBack navigates to mis-rendiciones', () => {
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones']);
    });

    it('isInvalid is true only when the control is invalid and touched', () => {
      const ctrl = component.form.get('gestion')!;
      expect(component.isInvalid('gestion')).toBeFalse();
      ctrl.markAsTouched();
      expect(component.isInvalid('gestion')).toBeTrue();
    });

    it('otErrorMessage warns when the chosen project has no active ordenes', () => {
      component.ngOnInit();
      component.form.get('projectId')?.setValue('p-without-ot');
      expect(component.otErrorMessage()).toContain('no tiene órdenes de trabajo activas');
    });
  });
});
