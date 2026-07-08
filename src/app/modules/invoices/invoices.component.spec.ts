import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import InvoicesComponent from './invoices.component';
import { InvoicesService } from './services/invoices.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { UserStateService } from '../../services/user-state.service';
import { ExpenseReportsService } from '../../services/expense-reports.service';

describe('InvoicesComponent', () => {
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let router: jasmine.SpyObj<Router>;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let confirmationService: jasmine.SpyObj<ConfirmationService>;
  let userStateService: jasmine.SpyObj<UserStateService>;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;

  const emptyResult = { data: [], total: 0, page: 1, pages: 0, limit: 20 };

  beforeEach(() => {
    invoicesService = jasmine.createSpyObj('InvoicesService', [
      'getProjects',
      'getInvoices',
      'getSunatValidation',
      'approveInvoice',
      'rejectInvoice',
      'deleteInvoice',
    ]);
    invoicesService.getProjects.and.returnValue(of([]));
    invoicesService.getInvoices.and.returnValue(of(emptyResult as any));

    router = jasmine.createSpyObj('Router', ['navigate']);
    notificationService = jasmine.createSpyObj('NotificationService', ['show']);
    confirmationService = jasmine.createSpyObj('ConfirmationService', ['show']);
    userStateService = jasmine.createSpyObj('UserStateService', ['isColaborador', 'getUser']);
    userStateService.isColaborador.and.returnValue(false);
    userStateService.getUser.and.returnValue({ _id: 'u1', companyId: 'c1' } as any);
    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', ['findAllByUser']);
    expenseReportsService.findAllByUser.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [InvoicesComponent],
      providers: [
        { provide: InvoicesService, useValue: invoicesService },
        { provide: Router, useValue: router },
        { provide: NotificationService, useValue: notificationService },
        { provide: ConfirmationService, useValue: confirmationService },
        { provide: UserStateService, useValue: userStateService },
        { provide: ExpenseReportsService, useValue: expenseReportsService },
      ],
    });
  });

  function createComponent(): InvoicesComponent {
    const fixture = TestBed.createComponent(InvoicesComponent);
    return fixture.componentInstance;
  }

  it('creates the component with hasRendiciones defaulting to true', () => {
    const component = createComponent();
    expect(component).toBeTruthy();
    expect(component.hasRendiciones).toBeTrue();
  });

  describe('ngOnInit / checkRendiciones', () => {
    it('skips the rendiciones check for non-colaborador roles', () => {
      const component = createComponent();
      component.ngOnInit();
      expect(expenseReportsService.findAllByUser).not.toHaveBeenCalled();
    });

    it('sets hasRendiciones from the colaborador reports count', () => {
      userStateService.isColaborador.and.returnValue(true);
      expenseReportsService.findAllByUser.and.returnValue(of([]));
      const component = createComponent();
      component.ngOnInit();
      expect(component.hasRendiciones).toBeFalse();
    });

    it('does nothing when the colaborador has no userId/clientId', () => {
      userStateService.isColaborador.and.returnValue(true);
      userStateService.getUser.and.returnValue({} as any);
      const component = createComponent();
      component.ngOnInit();
      expect(expenseReportsService.findAllByUser).not.toHaveBeenCalled();
    });

    it('loads projects then invoices', () => {
      invoicesService.getProjects.and.returnValue(of([{ _id: 'p1', name: 'Proy 1' } as any]));
      const component = createComponent();
      component.ngOnInit();
      expect(component.projects.length).toBe(1);
      expect(invoicesService.getInvoices).toHaveBeenCalled();
    });
  });

  describe('getInvoices', () => {
    it('filters by createdBy for colaboradores', () => {
      userStateService.isColaborador.and.returnValue(true);
      const component = createComponent();
      component.getInvoices();
      const filters = invoicesService.getInvoices.calls.mostRecent().args[0];
      expect(filters).toEqual({ createdBy: 'u1' });
    });

    it('sends no filters for non-colaboradores', () => {
      const component = createComponent();
      component.getInvoices();
      const filters = invoicesService.getInvoices.calls.mostRecent().args[0];
      expect(filters).toBeUndefined();
    });

    it('populates result and formatted invoices', () => {
      invoicesService.getInvoices.and.returnValue(
        of({
          data: [
            {
              _id: 'inv1',
              proyectId: { name: 'Proy 1' },
              categoryId: { name: 'Cat 1' },
              total: 100,
              status: 'pending',
              createdAt: '2026-02-01T00:00:00.000Z',
              data: JSON.stringify({ razonSocial: 'Acme', rucEmisor: '20123' }),
            },
          ],
          total: 1,
          page: 1,
          pages: 1,
          limit: 20,
        } as any)
      );
      const component = createComponent();
      component.getInvoices();
      expect(component.invoices.length).toBe(1);
      expect(component.invoices[0].provider).toBe('Acme');
      expect(component.invoices[0].ruc).toBe('20123');
    });
  });

  describe('paging', () => {
    it('onPageChange updates the page signal and reloads invoices', () => {
      const component = createComponent();
      invoicesService.getInvoices.calls.reset();
      component.onPageChange(3);
      expect(component.page()).toBe(3);
      expect(invoicesService.getInvoices).toHaveBeenCalled();
    });

    it('onLimitChange updates the limit, resets the page to 1, and reloads', () => {
      const component = createComponent();
      component.page.set(4);
      invoicesService.getInvoices.calls.reset();
      component.onLimitChange(50);
      expect(component.limit()).toBe(50);
      expect(component.page()).toBe(1);
      expect(invoicesService.getInvoices).toHaveBeenCalled();
    });
  });

  describe('downloadInvoice', () => {
    it('opens the file url when the invoice is found', () => {
      const component = createComponent();
      component.invoices = [{ _id: 'inv1', file: 'http://file-url' } as any];
      spyOn(window, 'open');
      component.downloadInvoice('inv1');
      expect(window.open).toHaveBeenCalledWith('http://file-url', '_blank');
    });

    it('shows an error notification when the invoice is not found', () => {
      const component = createComponent();
      component.invoices = [];
      component.downloadInvoice('missing');
      expect(notificationService.show).toHaveBeenCalledWith('No se pudo descargar la factura', 'error');
    });
  });

  describe('formatResponse', () => {
    it('returns [] for a non-array input', () => {
      const component = createComponent();
      expect(component.formatResponse(null as any)).toEqual([]);
    });

    it('maps invoice data with fallbacks for missing fields', () => {
      const component = createComponent();
      const result = component.formatResponse([
        {
          _id: 'inv1',
          proyectId: null,
          categoryId: null,
          total: 50,
          status: undefined,
          createdAt: '2026-02-01T00:00:00.000Z',
          data: null,
        } as any,
      ]);
      expect(result[0].proyect).toBe('No disponible');
      expect(result[0].provider).toBe('No disponible');
      expect(result[0].status).toBe('pending');
      expect(result[0].total).toBe('50');
    });

    it('handles data already parsed as an object', () => {
      const component = createComponent();
      const result = component.formatResponse([
        {
          _id: 'inv1',
          total: 20,
          createdAt: '2026-02-01T00:00:00.000Z',
          data: { razonSocial: 'Acme', moneda: 'S/' },
        } as any,
      ]);
      expect(result[0].provider).toBe('Acme');
      expect(result[0].total).toBe('S/ 20');
    });
  });

  describe('capitalizeFirstLetter', () => {
    it('capitalizes the first letter and lowercases the rest', () => {
      const component = createComponent();
      expect(component.capitalizeFirstLetter('hELLO')).toBe('Hello');
    });

    it('returns an empty string for falsy input', () => {
      const component = createComponent();
      expect(component.capitalizeFirstLetter('')).toBe('');
    });
  });

  describe('formatSunatStatus', () => {
    it('maps known statuses to their display info', () => {
      const component = createComponent();
      expect(component.formatSunatStatus('sunat_valid')).toEqual({ text: 'Válido', icon: 'check', color: 'green' });
      expect(component.formatSunatStatus('sunat_not_found')).toEqual({ text: 'No encontrado', icon: 'x', color: 'red' });
    });

    it('returns "Sin validar" for unknown statuses', () => {
      const component = createComponent();
      expect(component.formatSunatStatus('pending')).toEqual({ text: 'Sin validar', icon: 'question', color: 'gray' });
    });
  });

  describe('editInvoice / gotToAddInvoice', () => {
    it('editInvoice navigates to the edit route', () => {
      const component = createComponent();
      component.editInvoice('inv1');
      expect(router.navigate).toHaveBeenCalledWith(['/invoices/edit', 'inv1']);
    });

    it('gotToAddInvoice blocks navigation and warns when there are no rendiciones', () => {
      const component = createComponent();
      component.hasRendiciones = false;
      component.gotToAddInvoice();
      expect(notificationService.show).toHaveBeenCalledWith(
        'Necesitas tener una rendición asignada para subir facturas.',
        'error'
      );
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('gotToAddInvoice navigates to /invoices/add when allowed', () => {
      const component = createComponent();
      component.hasRendiciones = true;
      component.gotToAddInvoice();
      expect(router.navigate).toHaveBeenCalledWith(['/invoices/add']);
    });
  });

  describe('clickOptions', () => {
    it('routes to the details page on view', () => {
      const component = createComponent();
      component.clickOptions({ option: 'view', _id: 'inv1' });
      expect(router.navigate).toHaveBeenCalledWith(['/invoices', 'inv1', 'details']);
    });

    it('routes to the edit page on edit', () => {
      const component = createComponent();
      component.clickOptions({ option: 'edit', _id: 'inv1' });
      expect(router.navigate).toHaveBeenCalledWith(['/invoices/edit', 'inv1']);
    });

    it('asks for confirmation before deleting', () => {
      const component = createComponent();
      component.clickOptions({ option: 'delete', _id: 'inv1' });
      expect(confirmationService.show).toHaveBeenCalledWith('¿Desea eliminar esta factura?', jasmine.any(Function));
    });

    it('downloads the invoice on download', () => {
      const component = createComponent();
      component.invoices = [{ _id: 'inv1', file: 'http://file-url' } as any];
      spyOn(window, 'open');
      component.clickOptions({ option: 'download', _id: 'inv1' });
      expect(window.open).toHaveBeenCalledWith('http://file-url', '_blank');
    });

    it('fetches SUNAT info on sunat-info', () => {
      invoicesService.getSunatValidation.and.returnValue(
        of({ status: 'sunat_valid', message: 'ok' } as any)
      );
      const component = createComponent();
      component.clickOptions({ option: 'sunat-info', _id: 'inv1' });
      expect(invoicesService.getSunatValidation).toHaveBeenCalledWith('inv1', 'c1');
    });
  });

  describe('showSunatInfo / displaySunatValidationInfo', () => {
    it('shows a success notification for a valid SUNAT result', () => {
      invoicesService.getSunatValidation.and.returnValue(
        of({ status: 'sunat_valid', message: 'Todo bien', extractedData: { rucEmisor: '20123' } } as any)
      );
      const component = createComponent();
      component.showSunatInfo('inv1');
      expect(notificationService.show).toHaveBeenCalledWith(
        jasmine.stringMatching(/RUC: 20123/),
        'success'
      );
    });

    it('shows an error notification when the SUNAT status indicates an error', () => {
      invoicesService.getSunatValidation.and.returnValue(
        of({ status: 'sunat_error', message: 'fallo' } as any)
      );
      const component = createComponent();
      component.showSunatInfo('inv1');
      expect(notificationService.show).toHaveBeenCalledWith(jasmine.stringMatching(/fallo/), 'error');
    });

    it('shows an error notification when the request fails', () => {
      invoicesService.getSunatValidation.and.returnValue(throwError(() => new Error('network')));
      const component = createComponent();
      component.showSunatInfo('inv1');
      expect(notificationService.show).toHaveBeenCalledWith('Error al obtener información de SUNAT', 'error');
    });

    it('does nothing when there is no companyId', () => {
      userStateService.getUser.and.returnValue({ _id: 'u1' } as any);
      const component = createComponent();
      component.showSunatInfo('inv1');
      expect(invoicesService.getSunatValidation).not.toHaveBeenCalled();
    });
  });

  describe('approveInvoice / rejectInvoice / deleteInvoice', () => {
    it('approveInvoice shows success and reloads on success', () => {
      invoicesService.approveInvoice.and.returnValue(of({ _id: 'inv1' } as any));
      const component = createComponent();
      invoicesService.getInvoices.calls.reset();
      component.approveInvoice('inv1');
      expect(notificationService.show).toHaveBeenCalledWith('Factura aprobada correctamente', 'success');
      expect(invoicesService.getInvoices).toHaveBeenCalled();
    });

    it('approveInvoice shows an error notification on failure', () => {
      invoicesService.approveInvoice.and.returnValue(throwError(() => new Error('fail')));
      const component = createComponent();
      component.approveInvoice('inv1');
      expect(notificationService.show).toHaveBeenCalledWith('Error al aprobar la factura', 'error');
    });

    it('rejectInvoice shows success and reloads on success', () => {
      invoicesService.rejectInvoice.and.returnValue(of({ _id: 'inv1' } as any));
      const component = createComponent();
      component.rejectInvoice('inv1', 'motivo');
      expect(notificationService.show).toHaveBeenCalledWith('Factura rechazada correctamente', 'success');
    });

    it('rejectInvoice shows an error notification on failure', () => {
      invoicesService.rejectInvoice.and.returnValue(throwError(() => new Error('fail')));
      const component = createComponent();
      component.rejectInvoice('inv1', 'motivo');
      expect(notificationService.show).toHaveBeenCalledWith('Error al rechazar la factura', 'error');
    });

    it('deleteInvoice shows success and reloads on success', () => {
      invoicesService.deleteInvoice.and.returnValue(of({}));
      const component = createComponent();
      component.deleteInvoice('inv1');
      expect(notificationService.show).toHaveBeenCalledWith('Factura eliminada correctamente', 'success');
    });

    it('deleteInvoice shows an error notification on failure', () => {
      invoicesService.deleteInvoice.and.returnValue(throwError(() => new Error('fail')));
      const component = createComponent();
      component.deleteInvoice('inv1');
      expect(notificationService.show).toHaveBeenCalledWith('Error al eliminar la factura', 'error');
    });
  });

  describe('status helpers', () => {
    it('getStatusName maps known statuses', () => {
      const component = createComponent();
      expect(component.getStatusName('pending')).toBe('Pendiente');
      expect(component.getStatusName('APPROVED')).toBe('Aprobada');
      expect(component.getStatusName(undefined)).toBe('Pendiente');
      expect(component.getStatusName('weird' as any)).toBe('weird');
    });

    it('getStatusColor maps known statuses to tailwind classes', () => {
      const component = createComponent();
      expect(component.getStatusColor('approved')).toBe('bg-green-100 text-green-800');
      expect(component.getStatusColor(undefined)).toBe('bg-yellow-100 text-yellow-800');
    });

    it('getStatusInfo returns descriptive text for SUNAT statuses only', () => {
      const component = createComponent();
      expect(component.getStatusInfo('sunat_valid')).toBe('Factura Válida y emitida a la empresa');
      expect(component.getStatusInfo('pending')).toBe('');
      expect(component.getStatusInfo(undefined)).toBe('');
    });
  });
});
