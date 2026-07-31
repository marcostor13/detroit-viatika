import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CreateRendicionModalComponent } from './create-rendicion-modal.component';
import { ExpenseReportsService } from '../../../../services/expense-reports.service';
import { NotificationService } from '../../../../services/notification.service';
import { UserStateService } from '../../../../services/user-state.service';
import { InvoicesService } from '../../../../modules/invoices/services/invoices.service';
import { IProject } from '../../../../modules/invoices/interfaces/project.interface';
import { IExpenseReport } from '../../../../interfaces/expense-report.interface';

describe('CreateRendicionModalComponent', () => {
  let component: CreateRendicionModalComponent;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let userStateService: jasmine.SpyObj<UserStateService>;
  let invoicesService: jasmine.SpyObj<InvoicesService>;

  const mockProjects: IProject[] = [{ _id: 'p1', name: 'Proyecto 1' }];

  const mockReport = { _id: 'r1' } as IExpenseReport;

  beforeEach(() => {
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', ['create']);
    notificationService = jasmine.createSpyObj('NotificationService', ['show']);
    userStateService = jasmine.createSpyObj('UserStateService', ['getUser']);
    invoicesService = jasmine.createSpyObj('InvoicesService', ['getProjects']);

    userStateService.getUser.and.returnValue({ companyId: 'c1' } as any);
    invoicesService.getProjects.and.returnValue(of(mockProjects));

    TestBed.configureTestingModule({
      imports: [CreateRendicionModalComponent],
      providers: [
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: NotificationService, useValue: notificationService },
        { provide: UserStateService, useValue: userStateService },
        { provide: InvoicesService, useValue: invoicesService },
      ],
    });

    component = TestBed.createComponent(CreateRendicionModalComponent).componentInstance;
    component.collaboratorId = 'u1';
  });

  it('creates with a valid initial form (invalid until required fields are filled)', () => {
    expect(component).toBeTruthy();
    expect(component.form.valid).toBeFalse();
  });

  describe('loadProjects', () => {
    it('loads projects using the resolved companyId', () => {
      component.loadProjects();
      expect(invoicesService.getProjects).toHaveBeenCalledWith('c1');
      expect(component.projects).toEqual(mockProjects);
    });

    it('does nothing when there is no logged-in user', () => {
      userStateService.getUser.and.returnValue(null);
      component.loadProjects();
      expect(invoicesService.getProjects).not.toHaveBeenCalled();
    });
  });

  describe('people names FormArray', () => {
    it('starts with a single empty control', () => {
      expect(component.peopleNames.length).toBe(1);
    });

    it('addPersonName appends a control', () => {
      component.addPersonName();
      expect(component.peopleNames.length).toBe(2);
    });

    it('removePersonName removes a control when there is more than one', () => {
      component.addPersonName();
      component.removePersonName(0);
      expect(component.peopleNames.length).toBe(1);
    });

    it('removePersonName clears the value instead of removing the last control', () => {
      component.peopleNames.at(0).setValue('Someone');
      component.removePersonName(0);
      expect(component.peopleNames.length).toBe(1);
      expect(component.peopleNames.at(0).value).toBe('');
    });
  });

  describe('budget items FormArray', () => {
    it('addBudgetItem appends an item group', () => {
      component.addBudgetItem();
      expect(component.items.length).toBe(1);
    });

    it('computes the item total and rolls it up into the general budget', () => {
      component.addBudgetItem();
      const itemForm = component.items.at(0);
      itemForm.patchValue({ amount: 10, peopleCount: 2, fuelAmount: 5, daysCount: 3 });
      // total = (10*2*3) + (5*3) = 60 + 15 = 75
      expect(itemForm.get('total')?.value).toBe(75);
      expect(component.form.get('budget')?.value).toBe(75);
    });

    it('removeBudgetItem removes the item and recalculates the budget', () => {
      component.addBudgetItem();
      component.items.at(0).patchValue({ amount: 10, peopleCount: 1, fuelAmount: 0, daysCount: 1 });
      component.addBudgetItem();
      component.items.at(1).patchValue({ amount: 20, peopleCount: 1, fuelAmount: 0, daysCount: 1 });
      expect(component.form.get('budget')?.value).toBe(30);

      component.removeBudgetItem(0);

      expect(component.items.length).toBe(1);
      expect(component.form.get('budget')?.value).toBe(20);
    });
  });

  describe('closeModal', () => {
    it('resets the form and arrays, then emits the success flag', () => {
      component.form.patchValue({ title: 'X', budget: 99 });
      component.addBudgetItem();
      component.addPersonName();
      spyOn(component.close, 'emit');

      component.closeModal(true);

      expect(component.form.get('title')?.value).toBe('');
      expect(component.items.length).toBe(0);
      expect(component.peopleNames.length).toBe(1);
      expect(component.close.emit).toHaveBeenCalledWith(true);
    });
  });

  describe('onPlaceSelected', () => {
    it('patches the location field with the selected address', () => {
      component.onPlaceSelected({ address: 'Av. Siempre Viva 123' } as any);
      expect(component.form.get('location')?.value).toBe('Av. Siempre Viva 123');
    });
  });

  describe('onSubmit', () => {
    it('shows a validation error and does not call the service when the form is invalid', () => {
      component.onSubmit();
      expect(notificationService.show).toHaveBeenCalledWith('Por favor completa todos los campos requeridos', 'error');
      expect(expenseReportsService.create).not.toHaveBeenCalled();
    });

    it('submits the payload with clientId and collaboratorId, then closes on success', () => {
      component.form.patchValue({ title: 'Viaje', budget: 100, projectId: 'p1' });
      spyOn(component, 'closeModal');
      expenseReportsService.create.and.returnValue(of(mockReport));

      component.onSubmit();

      expect(expenseReportsService.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ userId: 'u1', clientId: 'c1', title: 'Viaje' })
      );
      expect(notificationService.show).toHaveBeenCalledWith('Rendición creada exitosamente', 'success');
      expect(component.closeModal).toHaveBeenCalledWith(true);
    });

    it('shows an error notification when the current user session is missing', () => {
      component.form.patchValue({ title: 'Viaje', budget: 100, projectId: 'p1' });
      userStateService.getUser.and.returnValue(null);

      component.onSubmit();

      expect(notificationService.show).toHaveBeenCalledWith('Error con la sesión actual', 'error');
      expect(expenseReportsService.create).not.toHaveBeenCalled();
    });

    it('shows an error notification when clientId cannot be resolved', () => {
      component.form.patchValue({ title: 'Viaje', budget: 100, projectId: 'p1' });
      userStateService.getUser.and.returnValue({} as any);

      component.onSubmit();

      expect(notificationService.show).toHaveBeenCalledWith('No se pudo identificar la empresa asociada a tu usuario', 'error');
      expect(expenseReportsService.create).not.toHaveBeenCalled();
    });

    it('shows an error notification when creation fails', () => {
      component.form.patchValue({ title: 'Viaje', budget: 100, projectId: 'p1' });
      expenseReportsService.create.and.returnValue(throwError(() => new Error('fail')));

      component.onSubmit();

      expect(notificationService.show).toHaveBeenCalledWith('Ocurrió un error al crear la rendición', 'error');
    });
  });
});
