import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { GastoDetalleComponent } from './gasto-detalle.component';
import { ExpenseService } from '../../../services/expense.service';
import { UserStateService } from '../../../services/user-state.service';
import { NotificationService } from '../../../services/notification.service';

describe('GastoDetalleComponent', () => {
  let component: GastoDetalleComponent;
  let expenseService: jasmine.SpyObj<ExpenseService>;
  let userState: jasmine.SpyObj<UserStateService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let router: jasmine.SpyObj<Router>;
  let paramMapGet: jasmine.Spy;

  beforeEach(() => {
    expenseService = jasmine.createSpyObj('ExpenseService', ['getById', 'updateDesglose', 'deleteExpense']);
    userState = jasmine.createSpyObj('UserStateService', ['isContabilidad', 'isColaborador']);
    notifications = jasmine.createSpyObj('NotificationService', ['show']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    paramMapGet = jasmine.createSpy('get').and.returnValue('e1');

    userState.isContabilidad.and.returnValue(false);
    userState.isColaborador.and.returnValue(true);
    expenseService.getById.and.returnValue(of({ _id: 'e1', expenseType: 'factura', total: 50 }));

    TestBed.configureTestingModule({
      imports: [GastoDetalleComponent],
      providers: [
        { provide: ExpenseService, useValue: expenseService },
        { provide: UserStateService, useValue: userState },
        { provide: NotificationService, useValue: notifications },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: paramMapGet } } } },
      ],
    });

    component = TestBed.createComponent(GastoDetalleComponent).componentInstance;
  });

  it('should create and read the id from the route', () => {
    expect(component).toBeTruthy();
    expect(component.id).toBe('e1');
  });

  describe('ngOnInit', () => {
    it('loads the expense on success', () => {
      component.ngOnInit();
      expect(expenseService.getById).toHaveBeenCalledWith('e1');
      expect(component.expense()).toEqual({ _id: 'e1', expenseType: 'factura', total: 50 } as any);
      expect(component.loading()).toBeFalse();
    });

    it('shows an error notification when the expense fails to load', () => {
      expenseService.getById.and.returnValue(throwError(() => new Error('fail')));
      component.ngOnInit();
      expect(notifications.show).toHaveBeenCalledWith('No se pudo cargar el documento.', 'error');
      expect(component.loading()).toBeFalse();
    });

    it('redirects to mis-rendiciones when there is no id', () => {
      paramMapGet.and.returnValue(null);
      const fresh = TestBed.createComponent(GastoDetalleComponent).componentInstance;
      fresh.ngOnInit();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones'], { queryParams: { tab: 'directas' } });
    });
  });

  describe('goBack / editExpense', () => {
    it('goes back to mis-rendiciones for a non-contabilidad user', () => {
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones'], { queryParams: { tab: 'directas' } });
    });

    it('goes back to /rendiciones for contabilidad', () => {
      userState.isContabilidad.and.returnValue(true);
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/rendiciones'], { queryParams: { tab: 'directas' } });
    });

    it('navigates to the edit screen with the right "from" query param', () => {
      component.editExpense();
      expect(router.navigate).toHaveBeenCalledWith(['/invoices/edit', 'e1'], {
        queryParams: { mode: 'directa', from: 'colaborador' },
      });
    });
  });

  describe('desglose form', () => {
    it('editDesglose seeds the form from the current expense', () => {
      component.expense.set({ baseAfecta: 10, igv: 2, tasaIgv: 18, inafecto: 0 });
      component.editDesglose();
      expect(component.desgloseForm.baseAfecta).toBe(10);
      expect(component.showDesgloseForm()).toBeTrue();
    });

    it('desgloseSuma sums base + igv + inafecto', () => {
      component.desgloseForm = { baseAfecta: 10, igv: 2, tasaIgv: 18, inafecto: 3 };
      expect(component.desgloseSuma).toBe(15);
    });

    it('saveDesglose updates the expense and closes the form on success', () => {
      component.expense.set({ _id: 'e1' });
      component.desgloseForm = { baseAfecta: 10, igv: 2, tasaIgv: 18, inafecto: 0 };
      expenseService.updateDesglose.and.returnValue(of({ baseAfecta: 10, igv: 2, tasaIgv: 18, inafecto: 0 }));
      component.saveDesglose();
      expect(expenseService.updateDesglose).toHaveBeenCalled();
      expect(component.showDesgloseForm()).toBeFalse();
      expect(notifications.show).toHaveBeenCalledWith('Desglose contable actualizado.', 'success');
    });

    it('saveDesglose shows an error notification on failure', () => {
      component.desgloseForm = { baseAfecta: 10, igv: 2, tasaIgv: 18, inafecto: 0 };
      expenseService.updateDesglose.and.returnValue(throwError(() => new Error('fail')));
      component.saveDesglose();
      expect(notifications.show).toHaveBeenCalledWith('Error al guardar el desglose.', 'error');
      expect(component.savingDesglose()).toBeFalse();
    });
  });

  describe('doDelete', () => {
    it('does nothing when there is no loaded expense', () => {
      component.expense.set(null);
      component.doDelete();
      expect(expenseService.deleteExpense).not.toHaveBeenCalled();
    });

    it('deletes the expense and navigates back on success', () => {
      component.expense.set({ _id: 'e1', clientId: 'c1' });
      expenseService.deleteExpense.and.returnValue(of({}));
      component.doDelete();
      expect(expenseService.deleteExpense).toHaveBeenCalledWith('e1', 'c1');
      expect(notifications.show).toHaveBeenCalledWith('Documento eliminado.', 'success');
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones'], { queryParams: { tab: 'directas' } });
    });

    it('shows an error notification on failure', () => {
      component.expense.set({ _id: 'e1', clientId: 'c1' });
      expenseService.deleteExpense.and.returnValue(throwError(() => ({ error: { message: 'no se pudo' } })));
      component.doDelete();
      expect(notifications.show).toHaveBeenCalledWith('no se pudo', 'error');
      expect(component.deleting()).toBeFalse();
    });
  });

  describe('display helpers', () => {
    it('getTypeCode maps expense types to their short code', () => {
      expect(component.getTypeCode({ expenseType: 'planilla_movilidad' })).toBe('PM');
      expect(component.getTypeCode({ expenseType: 'recibo_caja' })).toBe('H');
      expect(component.getTypeCode({ expenseType: 'factura', data: { tipoComprobante: '01' } })).toBe('FE');
    });

    it('getTotal parses numeric-looking strings', () => {
      expect(component.getTotal({ total: '42.5' })).toBe(42.5);
      expect(component.getTotal({ total: 'abc' })).toBe(0);
    });

    it('hasFile/getFileUrl reflect the presence of a file url', () => {
      expect(component.hasFile({ file: 'https://x/y.pdf' })).toBeTrue();
      expect(component.hasFile({})).toBeFalse();
    });

    it('canEdit blocks non-colaboradores and approved expenses', () => {
      userState.isColaborador.and.returnValue(false);
      expect(component.canEdit({ status: 'pending' })).toBeFalse();
      userState.isColaborador.and.returnValue(true);
      expect(component.canEdit({ status: 'approved' })).toBeFalse();
      expect(component.canEdit({ status: 'pending' })).toBeTrue();
    });

    it('getStatusForUi marks observado documents distinctly', () => {
      expect(component.getStatusForUi({ observado: true })).toBe('Observado');
      expect(component.getStatusForUi({ status: 'approved' })).toBe('Aprobado');
    });
  });
});
