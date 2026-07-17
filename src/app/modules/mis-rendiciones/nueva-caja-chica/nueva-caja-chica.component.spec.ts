import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NuevaCajaChicaComponent } from './nueva-caja-chica.component';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { IExpenseReport } from '../../../interfaces/expense-report.interface';

describe('NuevaCajaChicaComponent', () => {
  let component: NuevaCajaChicaComponent;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', ['create']);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    userState = jasmine.createSpyObj('UserStateService', ['getUser']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    userState.getUser.and.returnValue({ _id: 'u1', companyId: 'c1' } as any);

    TestBed.configureTestingModule({
      imports: [NuevaCajaChicaComponent],
      providers: [
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: NotificationService, useValue: notifications },
        { provide: UserStateService, useValue: userState },
        { provide: Router, useValue: router },
      ],
    });

    component = TestBed.createComponent(NuevaCajaChicaComponent).componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('goBack', () => {
    it('navigates back to the caja-chica tab', () => {
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones'], { queryParams: { tab: 'caja-chica' } });
    });
  });

  describe('submit', () => {
    it('marks the form touched and does not submit when invalid', () => {
      component.submit();
      expect(expenseReportsService.create).not.toHaveBeenCalled();
      expect(component.form.get('title')?.touched).toBeTrue();
    });

    it('shows an error when the user/company cannot be identified', () => {
      userState.getUser.and.returnValue(null as any);
      component.form.patchValue({ title: 'Caja chica obra' });
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('No se pudo identificar al usuario o empresa.', 'error');
    });

    it('creates the report and navigates to its detail on success', () => {
      component.form.patchValue({ title: 'Caja chica obra' });
      expenseReportsService.create.and.returnValue(of({ _id: 'r1' } as IExpenseReport));
      component.submit();
      expect(expenseReportsService.create).toHaveBeenCalledWith(jasmine.objectContaining({
        title: 'Caja chica obra', isCajaChica: true, userId: 'u1', clientId: 'c1',
      }));
      expect(notifications.show).toHaveBeenCalledWith('Rendicion de caja chica creada.', 'success');
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'r1', 'detalle']);
      expect(component.submitting()).toBeFalse();
    });

    it('shows an error notification on failure', () => {
      component.form.patchValue({ title: 'Caja chica obra' });
      expenseReportsService.create.and.returnValue(throwError(() => ({ error: { message: ['a', 'b'] } })));
      component.submit();
      expect(notifications.show).toHaveBeenCalledWith('a, b', 'error');
      expect(component.submitting()).toBeFalse();
    });
  });
});
