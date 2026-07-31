import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { InvoiceDetailComponent } from './invoice-detail.component';
import { InvoicesService } from '../services/invoices.service';
import { UserStateService } from '../../../services/user-state.service';

describe('InvoiceDetailComponent', () => {
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let router: jasmine.SpyObj<Router>;
  let userStateService: jasmine.SpyObj<UserStateService>;

  beforeEach(() => {
    invoicesService = jasmine.createSpyObj('InvoicesService', ['getInvoiceById']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    userStateService = jasmine.createSpyObj('UserStateService', ['getUser']);
  });

  function createComponent(id: string | undefined): InvoiceDetailComponent {
    const activatedRouteStub: any = {
      snapshot: { params: id ? { id } : {} },
    };

    TestBed.configureTestingModule({
      imports: [InvoiceDetailComponent],
      providers: [
        { provide: InvoicesService, useValue: invoicesService },
        { provide: Router, useValue: router },
        { provide: UserStateService, useValue: userStateService },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    });

    const fixture = TestBed.createComponent(InvoiceDetailComponent);
    return fixture.componentInstance;
  }

  it('creates the component and captures the id from the route', () => {
    const component = createComponent('inv1');
    expect(component).toBeTruthy();
    expect(component.id).toBe('inv1');
  });

  describe('ngOnInit / loadInvoice', () => {
    it('does nothing when there is no id', () => {
      const component = createComponent(undefined);
      component.ngOnInit();
      expect(invoicesService.getInvoiceById).not.toHaveBeenCalled();
    });

    it('loads the invoice, parses its data, and clears isLoading on success', () => {
      const invoice = {
        _id: 'inv1',
        data: JSON.stringify({ razonSocial: 'Acme SAC', montoTotal: 120 }),
        status: 'approved',
      };
      invoicesService.getInvoiceById.and.returnValue(of(invoice as any));
      const component = createComponent('inv1');
      component.ngOnInit();

      expect(component.invoice).toEqual(invoice as any);
      expect(component.invoiceData.razonSocial).toBe('Acme SAC');
      expect(component.invoiceData.montoTotal).toBe(120);
      expect(component.isLoading).toBeFalse();
    });

    it('clears isLoading on error and leaves invoice null', () => {
      invoicesService.getInvoiceById.and.returnValue(throwError(() => new Error('fail')));
      const component = createComponent('inv1');
      component.ngOnInit();

      expect(component.invoice).toBeNull();
      expect(component.isLoading).toBeFalse();
    });
  });

  describe('parseInvoiceData', () => {
    it('sets invoiceData to {} when data is falsy', () => {
      const component = createComponent('inv1');
      component.invoiceData = { stale: true };
      component.parseInvoiceData(null);
      expect(component.invoiceData).toEqual({ stale: true });
    });

    it('parses a JSON string', () => {
      const component = createComponent('inv1');
      component.parseInvoiceData(JSON.stringify({ foo: 'bar' }));
      expect(component.invoiceData).toEqual({ foo: 'bar' });
    });

    it('falls back to {} on invalid JSON', () => {
      const component = createComponent('inv1');
      component.parseInvoiceData('not-json{');
      expect(component.invoiceData).toEqual({});
    });

    it('uses an object payload as-is', () => {
      const component = createComponent('inv1');
      const payload = { foo: 'bar' };
      component.parseInvoiceData(payload);
      expect(component.invoiceData).toBe(payload);
    });
  });

  describe('navigation and downloads', () => {
    it('goBack navigates to /invoices', () => {
      const component = createComponent('inv1');
      component.goBack();
      expect(router.navigate).toHaveBeenCalledWith(['/invoices']);
    });

    it('downloadFile opens the invoice file when present', () => {
      const component = createComponent('inv1');
      component.invoice = { file: 'http://file-url' } as any;
      spyOn(window, 'open');
      component.downloadFile();
      expect(window.open).toHaveBeenCalledWith('http://file-url', '_blank');
    });

    it('downloadFile does nothing when there is no file', () => {
      const component = createComponent('inv1');
      component.invoice = { file: '' } as any;
      spyOn(window, 'open');
      component.downloadFile();
      expect(window.open).not.toHaveBeenCalled();
    });
  });

  describe('getStatusName', () => {
    it('returns Pendiente when no status is given', () => {
      const component = createComponent('inv1');
      expect(component.getStatusName(undefined)).toBe('Pendiente');
    });

    it('maps known statuses (case-insensitively)', () => {
      const component = createComponent('inv1');
      expect(component.getStatusName('approved')).toBe('Aprobada');
      expect(component.getStatusName('REJECTED'.toLowerCase())).toBe('Rechazada');
      expect(component.getStatusName('sunat_not_found')).toBe('No Encontrada');
    });

    it('returns the raw status when unknown', () => {
      const component = createComponent('inv1');
      expect(component.getStatusName('weird_status')).toBe('weird_status');
    });
  });

  describe('getStatusVariant', () => {
    it('returns warning when no status is given', () => {
      const component = createComponent('inv1');
      expect(component.getStatusVariant(undefined)).toBe('warning');
    });

    it('returns success for approved/valid statuses', () => {
      const component = createComponent('inv1');
      expect(component.getStatusVariant('approved')).toBe('success');
      expect(component.getStatusVariant('sunat_valid')).toBe('success');
      expect(component.getStatusVariant('valido_aceptado')).toBe('success');
    });

    it('returns error for rejected/error statuses', () => {
      const component = createComponent('inv1');
      expect(component.getStatusVariant('rejected')).toBe('error');
      expect(component.getStatusVariant('sunat_error')).toBe('error');
    });

    it('returns warning for pending and sunat_valid_not_ours', () => {
      const component = createComponent('inv1');
      expect(component.getStatusVariant('pending')).toBe('warning');
      expect(component.getStatusVariant('sunat_valid_not_ours')).toBe('warning');
    });

    it('returns neutral for unknown statuses', () => {
      const component = createComponent('inv1');
      expect(component.getStatusVariant('weird_status')).toBe('neutral');
    });
  });
});
