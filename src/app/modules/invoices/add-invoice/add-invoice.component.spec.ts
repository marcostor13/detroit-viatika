import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Validators } from '@angular/forms';
import { of, throwError } from 'rxjs';

import AddInvoiceComponent from './add-invoice.component';
import { InvoicesService } from '../services/invoices.service';
import { NotificationService } from '../../../services/notification.service';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { AdvanceService } from '../../../services/advance.service';
import { UserStateService } from '../../../services/user-state.service';
import { ExpenseService } from '../../../services/expense.service';
import { UploadService } from '../../../services/upload.service';
import { CompanyConfigService } from '../../../services/company-config.service';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';

describe('AddInvoiceComponent', () => {
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let router: jasmine.SpyObj<Router>;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let advanceService: jasmine.SpyObj<AdvanceService>;
  let userStateService: jasmine.SpyObj<UserStateService>;
  let uploadService: jasmine.SpyObj<UploadService>;
  let expenseService: jasmine.SpyObj<ExpenseService>;
  let ordenTrabajoService: jasmine.SpyObj<OrdenTrabajoService>;
  let companyConfigService: { companyConfig$: any };

  const currentUser = {
    _id: 'u1',
    companyId: 'c1',
    name: 'John Doe',
    email: 'john@test.com',
    signature: 'sig.png',
  };

  beforeEach(() => {
    invoicesService = jasmine.createSpyObj('InvoicesService', [
      'getCategories',
      'getProjects',
      'getInvoiceById',
      'getClientUsers',
      'getRucInfo',
      'createCashReceipt',
      'createMobilitySheet',
      'createOtherExpense',
      'updateInvoice',
      'analyzeInvoice',
      'analyzePdf',
      'getSunatValidation',
      'validateWithSunatData',
    ]);
    invoicesService.getCategories.and.returnValue(of([]));
    invoicesService.getProjects.and.returnValue(of([]));
    invoicesService.getClientUsers.and.returnValue(of([]));
    invoicesService.updateInvoice.and.returnValue(of({}));
    invoicesService.validateWithSunatData.and.returnValue(of({ status: 'ERROR_SUNAT' } as any));
    invoicesService.getSunatValidation.and.returnValue(of({} as any));
    invoicesService.createCashReceipt.and.returnValue(of({} as any));
    invoicesService.createMobilitySheet.and.returnValue(of({} as any));
    invoicesService.createOtherExpense.and.returnValue(of({} as any));
    invoicesService.getRucInfo.and.returnValue(of({ razonSocial: null, fuente: '' }));
    invoicesService.analyzeInvoice.and.returnValue(of({} as any));
    invoicesService.analyzePdf.and.returnValue(of({} as any));

    router = jasmine.createSpyObj('Router', ['navigate']);

    notificationService = jasmine.createSpyObj('NotificationService', ['show']);

    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', ['findAllByUser', 'findOne']);
    expenseReportsService.findAllByUser.and.returnValue(of([]));

    advanceService = jasmine.createSpyObj('AdvanceService', ['findMy']);
    advanceService.findMy.and.returnValue(of([]));

    userStateService = jasmine.createSpyObj('UserStateService', [
      'isColaborador',
      'canCreateRendicion',
      'getUser',
      'isContabilidad',
    ]);
    userStateService.isColaborador.and.returnValue(false);
    userStateService.isContabilidad.and.returnValue(false);
    userStateService.canCreateRendicion.and.returnValue(false);
    userStateService.getUser.and.returnValue(currentUser as any);

    uploadService = jasmine.createSpyObj('UploadService', ['uploadFile']);
    uploadService.uploadFile.and.returnValue({
      uploadProgress$: of(100),
      downloadUrl$: of('http://file-url'),
    });

    expenseService = jasmine.createSpyObj('ExpenseService', ['submitMyDirectExpenses']);
    expenseService.submitMyDirectExpenses.and.returnValue(of({ reportId: 'r1', expensesSubmitted: 1 }));

    ordenTrabajoService = jasmine.createSpyObj('OrdenTrabajoService', ['getAll']);
    ordenTrabajoService.getAll.and.returnValue(of([]));

    companyConfigService = { companyConfig$: of({ limits: { movilidadDiario: 500 } }) };
  });

  function createComponent(routeParams: any = {}, queryParams: any = {}): AddInvoiceComponent {
    const activatedRouteStub: any = {
      snapshot: {
        params: routeParams,
        queryParamMap: convertToParamMap(queryParams),
      },
      queryParamMap: of(convertToParamMap(queryParams)),
    };

    TestBed.configureTestingModule({
      imports: [AddInvoiceComponent],
      providers: [
        { provide: InvoicesService, useValue: invoicesService },
        { provide: Router, useValue: router },
        { provide: NotificationService, useValue: notificationService },
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: AdvanceService, useValue: advanceService },
        { provide: UserStateService, useValue: userStateService },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
        { provide: UploadService, useValue: uploadService },
        { provide: CompanyConfigService, useValue: companyConfigService },
        { provide: ExpenseService, useValue: expenseService },
        { provide: OrdenTrabajoService, useValue: ordenTrabajoService },
      ],
    });

    const fixture = TestBed.createComponent(AddInvoiceComponent);
    return fixture.componentInstance;
  }

  it('creates and initializes the form with controls for every expense type', () => {
    const component = createComponent();
    expect(component).toBeTruthy();
    expect(component.form.get('proyectId')).toBeTruthy();
    expect(component.form.get('mobilityRows')).toBeTruthy();
    expect(component.form.get('receiptConcepto')).toBeTruthy();
    expect(component.form.get('declaracionJurada')?.value).toBeFalse();
  });

  describe('ngOnInit (create mode)', () => {
    it('loads categories, projects, active ordenes de trabajo, and workers', () => {
      invoicesService.getCategories.and.returnValue(of([{ _id: 'cat1', name: 'Viajes' } as any]));
      invoicesService.getProjects.and.returnValue(of([{ _id: 'p1', name: 'Proy 1' } as any]));
      invoicesService.getClientUsers.and.returnValue(
        of([{ _id: 'w1', name: 'Worker 1', email: 'w1@test.com' }])
      );
      ordenTrabajoService.getAll.and.returnValue(
        of([
          { _id: 'ot1', nombre: 'OT1', costCenterId: 'p1', isActive: true } as any,
          { _id: 'ot2', nombre: 'OT2', costCenterId: 'p1', isActive: false } as any,
        ])
      );

      const component = createComponent();
      component.ngOnInit();

      expect(component.categories.length).toBe(1);
      expect(component.proyects.length).toBe(1);
      expect(component.workers).toEqual([
        { _id: 'w1', name: 'Worker 1', email: 'w1@test.com', dni: undefined },
      ]);
      expect(component.ordenesTrabajo.length).toBe(1);
      expect(component.ordenesTrabajo[0]._id).toBe('ot1');
    });

    it('requires a file when creating (not editing)', () => {
      const component = createComponent();
      component.ngOnInit();
      expect(component.form.get('file')?.hasValidator(Validators.required)).toBeTrue();
    });

    it('applies the tipo query param to set the expense type', () => {
      const component = createComponent({}, { tipo: 'recibo_caja' });
      component.ngOnInit();
      expect(component.expenseType()).toBe('recibo_caja');
    });

    it('redirects a colaborador with no rendiciones to /invoices', () => {
      userStateService.isColaborador.and.returnValue(true);
      expenseReportsService.findAllByUser.and.returnValue(of([]));
      const component = createComponent();
      component.ngOnInit();
      expect(notificationService.show).toHaveBeenCalledWith(
        'Necesitas tener una rendición asignada para subir facturas.',
        'error'
      );
      expect(router.navigate).toHaveBeenCalledWith(['/invoices']);
    });

    it('does not redirect a colaborador that already has rendiciones', () => {
      userStateService.isColaborador.and.returnValue(true);
      expenseReportsService.findAllByUser.and.returnValue(of([{ _id: 'r1' } as any]));
      const component = createComponent();
      component.ngOnInit();
      expect(router.navigate).not.toHaveBeenCalledWith(['/invoices']);
    });

    it('skips the rendiciones guard when editing an existing invoice', () => {
      userStateService.isColaborador.and.returnValue(true);
      invoicesService.getInvoiceById.and.returnValue(of({ _id: 'inv1', data: '{}' } as any));
      const component = createComponent({ id: 'inv1' });
      component.ngOnInit();
      expect(expenseReportsService.findAllByUser).not.toHaveBeenCalled();
    });
  });

  describe('ngOnInit (edit mode) per expenseType', () => {
    it('patches factura fields, disables proyectId, and clears the file validator', () => {
      const invoice = {
        _id: 'inv1',
        expenseType: 'factura',
        proyectId: { _id: 'p1' },
        categoryId: { _id: 'cat1' },
        data: JSON.stringify({
          rucEmisor: '20123',
          serie: 'F001',
          correlativo: '123',
          fechaEmision: '01/02/2026',
          razonSocial: 'Acme SAC',
        }),
      };
      invoicesService.getInvoiceById.and.returnValue(of(invoice as any));
      const component = createComponent({ id: 'inv1' });
      component.ngOnInit();

      expect(component.expenseType()).toBe('factura');
      expect(component.form.get('rucEmisor')?.value).toBe('20123');
      expect(component.form.get('serie')?.value).toBe('F001');
      expect(component.fetchedRazonSocial()).toBe('Acme SAC');
      expect(component.form.get('proyectId')?.disabled).toBeTrue();
      expect(component.form.get('file')?.hasValidator(Validators.required)).toBeFalse();
    });

    it('patches recibo_caja fields from the receipt data', () => {
      const invoice = {
        _id: 'inv1',
        expenseType: 'recibo_caja',
        proyectId: 'p1',
        categoryId: 'cat1',
        total: '150',
        date: '2026-02-01',
        data: JSON.stringify({ razonSocial: 'Prov X', ruc: '10111', numeroDocumento: 'NC-1', concepto: 'Taxi' }),
      };
      invoicesService.getInvoiceById.and.returnValue(of(invoice as any));
      const component = createComponent({ id: 'inv1' });
      component.ngOnInit();

      expect(component.form.get('receiptConcepto')?.value).toBe('Taxi');
      expect(component.form.get('receiptMonto')?.value).toBe('150');
      expect(component.form.get('receiptRuc')?.value).toBe('10111');
    });

    it('patches otros_gastos description/total and forces declaracionJurada true', () => {
      const invoice = {
        _id: 'inv1',
        expenseType: 'otros_gastos',
        proyectId: 'p1',
        categoryId: 'cat1',
        total: 80,
        data: JSON.stringify({ description: 'Peaje', subTipo: 'DJ' }),
      };
      invoicesService.getInvoiceById.and.returnValue(of(invoice as any));
      const component = createComponent({ id: 'inv1' });
      component.ngOnInit();

      expect(component.form.get('description')?.value).toBe('Peaje');
      expect(component.form.get('declaracionJurada')?.value).toBeTrue();
      expect(component.otrosSubTipo()).toBe('DJ');
    });

    it('rebuilds the mobilityRows FormArray for planilla_movilidad', () => {
      const invoice = {
        _id: 'inv1',
        expenseType: 'planilla_movilidad',
        proyectId: 'p1',
        categoryId: 'cat1',
        mobilityRows: [
          { fecha: '2026-02-01', total: 20, origen: 'A', destino: 'B', gestion: 'g1', colaboradorId: 'u1' },
        ],
      };
      invoicesService.getInvoiceById.and.returnValue(of(invoice as any));
      const component = createComponent({ id: 'inv1' });
      component.ngOnInit();

      expect(component.mobilityRowsArray.length).toBe(1);
      expect(component.mobilityRowsArray.at(0).get('total')?.value).toBe(20);
      expect(component.mobilityRowsArray.at(0).get('colaboradorEsTercero')?.value).toBeFalse();
    });
  });

  describe('setExpenseType', () => {
    it('requires the file only for factura', () => {
      const component = createComponent();
      component.setExpenseType('factura');
      expect(component.form.get('file')?.hasValidator(Validators.required)).toBeTrue();

      component.setExpenseType('recibo_caja');
      expect(component.form.get('file')?.hasValidator(Validators.required)).toBeFalse();
    });

    it('clears the selected file and preview when the type changes', () => {
      const component = createComponent();
      component.selectedFile = new File([''], 'a.png');
      component.previewImage = 'blob:x' as any;
      component.setExpenseType('otros_gastos');
      expect(component.selectedFile).toBeUndefined();
      expect(component.previewImage).toBeNull();
    });
  });

  describe('isFormValid - planilla_movilidad', () => {
    it('is false with no rows', () => {
      const component = createComponent();
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1' });
      component.setExpenseType('planilla_movilidad');
      expect(component.isFormValid()).toBeFalse();
    });

    it('is true with a complete row under the daily limit', () => {
      const component = createComponent();
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1' });
      component.setExpenseType('planilla_movilidad');
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({
        fecha: '2026-02-01',
        total: 10,
        origen: 'A',
        destino: 'B',
        gestion: 'g1',
      });
      expect(component.isFormValid()).toBeTrue();
    });

    it('is false when the daily limit is exceeded', () => {
      const component = createComponent();
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.mobilityDailyLimit = 15;
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1' });
      component.setExpenseType('planilla_movilidad');
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({
        fecha: '2026-02-01',
        total: 20,
        origen: 'A',
        destino: 'B',
        gestion: 'g1',
      });
      expect(component.isFormValid()).toBeFalse();
    });

    it('is false when no movilidad category is assigned to the collaborator', () => {
      const component = createComponent();
      component.categories = [{ _id: 'catOther', name: 'Viajes' } as any];
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1' });
      component.setExpenseType('planilla_movilidad');
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({
        fecha: '2026-02-01',
        total: 10,
        origen: 'A',
        destino: 'B',
        gestion: 'g1',
      });
      expect(component.isFormValid()).toBeFalse();
    });
  });

  describe('movilidad category selection', () => {
    it('auto-assigns the categoryId when exactly one movilidad category matches (case-insensitive)', () => {
      const component = createComponent();
      component.categories = [{ _id: 'catMov', name: 'PLANILLA DE MOVILIDAD - Lima' } as any];
      component.setExpenseType('planilla_movilidad');
      expect(component.form.get('categoryId')?.value).toBe('catMov');
      expect(component.showMovilidadCategorySelect).toBeFalse();
    });

    it('requires manual selection when more than one movilidad category is assigned', () => {
      const component = createComponent();
      component.categories = [
        { _id: 'cat1', name: 'Planilla de movilidad Lima' } as any,
        { _id: 'cat2', name: 'planilla de movilidad Provincias' } as any,
      ];
      component.setExpenseType('planilla_movilidad');
      expect(component.showMovilidadCategorySelect).toBeTrue();
      expect(component.form.get('categoryId')?.value).toBeFalsy();
      expect(component.form.get('categoryId')?.hasValidator(Validators.required)).toBeTrue();
    });

    it('does not show the selector nor auto-assign when no movilidad category is assigned', () => {
      const component = createComponent();
      component.categories = [{ _id: 'cat1', name: 'Viajes' } as any];
      component.setExpenseType('planilla_movilidad');
      expect(component.showMovilidadCategorySelect).toBeFalse();
      expect(component.movilidadCategories.length).toBe(0);
      expect(component.form.get('categoryId')?.value).toBeFalsy();
    });

    it('does not apply to other expense types', () => {
      const component = createComponent();
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.setExpenseType('otros_gastos');
      expect(component.form.get('categoryId')?.value).toBeFalsy();
    });
  });

  describe('isFormValid - otros_gastos', () => {
    it('DJ sub-type requires the declaracionJurada checkbox', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', totalOtros: 50 });
      component.setExpenseType('otros_gastos');
      component.otrosSubTipo.set('DJ');
      component.selectedFile = new File([''], 'a.png');
      expect(component.isFormValid()).toBeFalse();
      component.form.patchValue({ declaracionJurada: true });
      expect(component.isFormValid()).toBeTrue();
    });

    it('BV sub-type requires ruc/serie/correlativo instead of the DJ checkbox', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', totalOtros: 50 });
      component.setExpenseType('otros_gastos');
      component.otrosSubTipo.set('BV');
      component.selectedFile = new File([''], 'a.png');
      expect(component.isFormValid()).toBeFalse();
      component.form.patchValue({ rucEmisor: '20123456789', serie: 'B001', correlativo: '1' });
      expect(component.isFormValid()).toBeTrue();
    });

    it('requires an attached file when creating', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', totalOtros: 50, declaracionJurada: true });
      component.setExpenseType('otros_gastos');
      component.otrosSubTipo.set('DJ');
      expect(component.isFormValid()).toBeFalse();
    });
  });

  describe('isFormValid - recibo_caja', () => {
    it('requires fecha, concepto, monto, and an attached file', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1' });
      component.setExpenseType('recibo_caja');
      expect(component.isFormValid()).toBeFalse();

      component.selectedFile = new File([''], 'r.png');
      component.form.patchValue({ receiptFecha: '2026-02-01', receiptConcepto: 'Taxi', receiptMonto: 30 });
      expect(component.isFormValid()).toBeTrue();
    });
  });

  describe('saveCashReceipt', () => {
    it('shows an error when there is no attached file', () => {
      const component = createComponent();
      component.saveCashReceipt();
      expect(notificationService.show).toHaveBeenCalledWith('Debes adjuntar el archivo del recibo', 'error');
      expect(invoicesService.createCashReceipt).not.toHaveBeenCalled();
    });

    it('shows an error when required fields are missing', () => {
      const component = createComponent();
      component.selectedFile = new File([''], 'r.png');
      component.saveCashReceipt();
      expect(notificationService.show).toHaveBeenCalledWith('Completa los campos obligatorios del recibo', 'error');
    });

    it('uploads the file and creates the cash receipt on success', () => {
      invoicesService.createCashReceipt.and.returnValue(of({ _id: 'e1' } as any));
      const component = createComponent();
      component.selectedFile = new File([''], 'r.png');
      component.form.patchValue({
        proyectId: 'p1',
        categoryId: 'cat1',
        receiptFecha: '2026-02-01',
        receiptConcepto: 'Taxi',
        receiptMonto: 30,
      });
      component.saveCashReceipt();

      expect(uploadService.uploadFile).toHaveBeenCalled();
      const payload = invoicesService.createCashReceipt.calls.mostRecent().args[0];
      expect(payload.total).toBe(30);
      expect(payload.imageUrl).toBe('http://file-url');
      expect(notificationService.show).toHaveBeenCalledWith('Recibo de caja guardado correctamente', 'success');
      expect(router.navigate).toHaveBeenCalledWith(['/invoices']);
    });

    it('shows an error notification when createCashReceipt fails', () => {
      invoicesService.createCashReceipt.and.returnValue(throwError(() => ({ error: { message: 'boom' } })));
      const component = createComponent();
      component.selectedFile = new File([''], 'r.png');
      component.form.patchValue({
        proyectId: 'p1',
        categoryId: 'cat1',
        receiptFecha: '2026-02-01',
        receiptConcepto: 'Taxi',
        receiptMonto: 30,
      });
      component.saveCashReceipt();
      expect(notificationService.show).toHaveBeenCalledWith('Error al guardar recibo: boom', 'error');
      expect(component.isLoading()).toBeFalse();
    });
  });

  describe('saveOtherExpense', () => {
    it('requires proyectId/categoryId', () => {
      const component = createComponent();
      component.saveOtherExpense();
      expect(notificationService.show).toHaveBeenCalledWith('Completa los campos requeridos', 'error');
    });

    it('DJ sub-type requires a registered signature', () => {
      userStateService.getUser.and.returnValue({ ...currentUser, signature: undefined } as any);
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1' });
      component.otrosSubTipo.set('DJ');
      component.saveOtherExpense();
      expect(notificationService.show).toHaveBeenCalledWith(
        'Debes registrar tu firma digital antes de enviar una Declaracion Jurada. Ve a Mi Firma en el menu.',
        'error'
      );
    });

    it('DJ sub-type requires the declaracionJurada checkbox to be checked', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1' });
      component.otrosSubTipo.set('DJ');
      component.saveOtherExpense();
      expect(notificationService.show).toHaveBeenCalledWith('Debes aceptar y firmar la declaración jurada', 'error');
    });

    it('requires a positive amount', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', declaracionJurada: true, totalOtros: 0 });
      component.otrosSubTipo.set('DJ');
      component.saveOtherExpense();
      expect(notificationService.show).toHaveBeenCalledWith('Ingresa un monto válido', 'error');
    });

    it('requires an attached file', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', declaracionJurada: true, totalOtros: 50 });
      component.otrosSubTipo.set('DJ');
      component.saveOtherExpense();
      expect(notificationService.show).toHaveBeenCalledWith('Debes adjuntar el comprobante', 'error');
    });

    it('BV sub-type requires rucEmisor', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', totalOtros: 50 });
      component.otrosSubTipo.set('BV');
      component.selectedFile = new File([''], 'a.png');
      component.saveOtherExpense();
      expect(notificationService.show).toHaveBeenCalledWith('Debes ingresar el RUC del emisor', 'error');
    });

    it('creates the DJ expense with declaracionJuradaFirmante auto-set to the current user name', () => {
      invoicesService.createOtherExpense.and.returnValue(of({ _id: 'e1' } as any));
      const component = createComponent();
      component.form.patchValue({
        proyectId: 'p1',
        categoryId: 'cat1',
        declaracionJurada: true,
        totalOtros: 50,
        description: 'Peaje',
      });
      component.otrosSubTipo.set('DJ');
      component.selectedFile = new File([''], 'a.png');
      component.saveOtherExpense();

      const payload = invoicesService.createOtherExpense.calls.mostRecent().args[0];
      expect(payload.declaracionJurada).toBeTrue();
      expect(payload.declaracionJuradaFirmante).toBe('John Doe');
      expect(payload.total).toBe(50);
      expect(notificationService.show).toHaveBeenCalledWith('Gasto guardado correctamente', 'success');
    });

    it('creates a non-DJ expense without declaracionJuradaFirmante', () => {
      invoicesService.createOtherExpense.and.returnValue(of({ _id: 'e1' } as any));
      const component = createComponent();
      component.form.patchValue({
        proyectId: 'p1',
        categoryId: 'cat1',
        totalOtros: 30,
        rucEmisor: '20123456789',
      });
      component.otrosSubTipo.set('TK');
      component.selectedFile = new File([''], 'a.png');
      component.saveOtherExpense();

      const payload = invoicesService.createOtherExpense.calls.mostRecent().args[0];
      expect(payload.declaracionJurada).toBeFalse();
      expect(payload.declaracionJuradaFirmante).toBeUndefined();
    });
  });

  describe('saveMobilitySheet', () => {
    it('shows an error when there are no rows', () => {
      const component = createComponent();
      component.saveMobilitySheet();
      expect(notificationService.show).toHaveBeenCalledWith('Debes agregar al menos una fila', 'error');
    });

    it('shows an error when the collaborator has no movilidad category assigned', () => {
      const component = createComponent();
      component.addMobilityRow();
      component.saveMobilitySheet();
      expect(notificationService.show).toHaveBeenCalledWith(
        'No tienes asignada ninguna categoría de Planilla de movilidad. Contacta a un administrador para que te asigne una.',
        'error'
      );
      expect(invoicesService.createMobilitySheet).not.toHaveBeenCalled();
    });

    it('requires proyecto, categoria, and orden de trabajo', () => {
      const component = createComponent();
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.addMobilityRow();
      component.saveMobilitySheet();
      expect(notificationService.show).toHaveBeenCalledWith(
        'Completa los campos requeridos (incluida la Orden de Trabajo)',
        'error'
      );
    });

    it('requires a worker to be selected on rows flagged as tercero', () => {
      const component = createComponent();
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', ordenTrabajoId: 'ot1' });
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({ colaboradorEsTercero: true });
      component.saveMobilitySheet();
      expect(notificationService.show).toHaveBeenCalledWith(
        'Selecciona el trabajador en las filas marcadas como tercero',
        'error'
      );
    });

    it('creates the mobility sheet on success', () => {
      invoicesService.createMobilitySheet.and.returnValue(of({ _id: 'e1' } as any));
      const component = createComponent();
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', ordenTrabajoId: 'ot1' });
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({
        fecha: '2026-02-01',
        total: 10,
        origen: 'A',
        destino: 'B',
        gestion: 'g1',
      });
      component.saveMobilitySheet();

      expect(invoicesService.createMobilitySheet).toHaveBeenCalled();
      expect(notificationService.show).toHaveBeenCalledWith('Planilla guardada correctamente', 'success');
    });

    it('blocks submission when the daily limit is exceeded', () => {
      const component = createComponent();
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.mobilityDailyLimit = 15;
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', ordenTrabajoId: 'ot1' });
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({
        fecha: '2026-02-01',
        total: 20,
        origen: 'A',
        destino: 'B',
        gestion: 'g1',
      });
      component.saveMobilitySheet();
      expect(notificationService.show).toHaveBeenCalledWith(
        jasmine.stringMatching(/supera el límite configurado/),
        'error'
      );
      expect(invoicesService.createMobilitySheet).not.toHaveBeenCalled();
    });
  });

  describe('saveOrUpdate', () => {
    it('delegates to update() when editing an existing invoice', () => {
      invoicesService.getInvoiceById.and.returnValue(of({ _id: 'inv1', expenseType: 'factura', data: '{}' } as any));
      const component = createComponent({ id: 'inv1' });
      component.ngOnInit();
      spyOn(component, 'update');
      component.saveOrUpdate();
      expect(component.update).toHaveBeenCalled();
    });

    it('calls saveMobilitySheet for planilla_movilidad', () => {
      const component = createComponent();
      component.setExpenseType('planilla_movilidad');
      spyOn(component, 'saveMobilitySheet');
      component.saveOrUpdate();
      expect(component.saveMobilitySheet).toHaveBeenCalled();
    });

    it('calls saveOtherExpense for otros_gastos', () => {
      const component = createComponent();
      component.setExpenseType('otros_gastos');
      spyOn(component, 'saveOtherExpense');
      component.saveOrUpdate();
      expect(component.saveOtherExpense).toHaveBeenCalled();
    });

    it('calls saveCashReceipt for recibo_caja', () => {
      const component = createComponent();
      component.setExpenseType('recibo_caja');
      spyOn(component, 'saveCashReceipt');
      component.saveOrUpdate();
      expect(component.saveCashReceipt).toHaveBeenCalled();
    });

    it('requires a file for factura', () => {
      const component = createComponent();
      component.setExpenseType('factura');
      component.saveOrUpdate();
      expect(notificationService.show).toHaveBeenCalledWith('Debes seleccionar un archivo de factura', 'error');
    });
  });

  describe('update', () => {
    function setupEdit(invoice: any): AddInvoiceComponent {
      invoicesService.getInvoiceById.and.returnValue(of(invoice));
      const component = createComponent({ id: invoice._id });
      component.ngOnInit();
      return component;
    }

    it('does nothing without an original invoice loaded', () => {
      const component = createComponent({ id: 'inv1' });
      component.update();
      expect(invoicesService.updateInvoice).not.toHaveBeenCalled();
    });

    it('shows an error when the form is invalid', () => {
      const component = setupEdit({ _id: 'inv1', expenseType: 'recibo_caja', data: '{}' });
      component.update();
      expect(notificationService.show).toHaveBeenCalledWith('Completa los campos requeridos', 'error');
    });

    it('updates a factura invoice, marking the amount as edited when changed', () => {
      invoicesService.updateInvoice.and.returnValue(of({}));
      const component = setupEdit({
        _id: 'inv1',
        expenseType: 'factura',
        total: '100',
        data: JSON.stringify({ rucEmisor: '20123', serie: 'F1', correlativo: '1', fechaEmision: '01/02/2026' }),
      });
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1' });
      component.startEditInvoiceAmount();
      component.editedInvoiceTotal.set(150);
      component.update();

      const payload = invoicesService.updateInvoice.calls.mostRecent().args[1] as any;
      expect(payload.total).toBe(150);
      const data = JSON.parse(payload.data);
      expect(data.amountEdited).toBeTrue();
      expect(data.originalOcrTotal).toBe(100);
    });

    it('updates a recibo_caja invoice from the receipt fields', () => {
      invoicesService.updateInvoice.and.returnValue(of({}));
      const component = setupEdit({ _id: 'inv1', expenseType: 'recibo_caja', total: 30, data: '{}' });
      component.form.patchValue({
        proyectId: 'p1',
        categoryId: 'cat1',
        receiptFecha: '2026-02-01',
        receiptConcepto: 'Taxi',
        receiptMonto: 45,
      });
      component.update();

      const payload = invoicesService.updateInvoice.calls.mostRecent().args[1] as any;
      expect(payload.total).toBe(45);
      expect(payload.fechaEmision).toBe('2026-02-01');
    });

    it('updates an otros_gastos invoice preserving unrelated previous data', () => {
      invoicesService.updateInvoice.and.returnValue(of({}));
      const component = setupEdit({
        _id: 'inv1',
        expenseType: 'otros_gastos',
        total: 30,
        data: JSON.stringify({ description: 'old', foo: 'bar' }),
      });
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', totalOtros: 60, description: 'Peaje nuevo' });
      component.update();

      const payload = invoicesService.updateInvoice.calls.mostRecent().args[1] as any;
      expect(payload.total).toBe(60);
      const data = JSON.parse(payload.data);
      expect(data.description).toBe('Peaje nuevo');
      expect(data.foo).toBe('bar');
    });

    it('blocks the update when a mobility row is flagged as tercero without a selected worker', () => {
      const component = setupEdit({
        _id: 'inv1',
        expenseType: 'planilla_movilidad',
        data: '{}',
        mobilityRows: [{ fecha: '2026-02-01', total: 10, origen: 'A', destino: 'B', gestion: 'g1' }],
      });
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1' });
      component.mobilityRowsArray.at(0).patchValue({ colaboradorEsTercero: true, colaboradorId: '' });
      component.update();
      expect(notificationService.show).toHaveBeenCalledWith(
        'Selecciona el trabajador en las filas marcadas como tercero',
        'error'
      );
      expect(invoicesService.updateInvoice).not.toHaveBeenCalled();
    });

    it('triggers SUNAT validation after a successful factura update when all SUNAT fields are present', () => {
      invoicesService.updateInvoice.and.returnValue(of({}));
      invoicesService.validateWithSunatData.and.returnValue(of({ status: 'VALIDO_ACEPTADO' } as any));
      const component = setupEdit({
        _id: 'inv1',
        expenseType: 'factura',
        total: '100',
        clientId: 'c1',
        data: JSON.stringify({ rucEmisor: '20123', serie: 'F1', correlativo: '1', fechaEmision: '01/02/2026' }),
      });
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1' });
      component.update();

      expect(invoicesService.validateWithSunatData).toHaveBeenCalled();
      expect(notificationService.show).toHaveBeenCalledWith('Factura Válida y emitida a la empresa', 'success');
    });
  });

  describe('mobility row helpers', () => {
    it('addMobilityRow seeds the row with the top-level proyectId', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1' });
      component.addMobilityRow();
      expect(component.mobilityRowsArray.length).toBe(1);
      expect(component.mobilityRowsArray.at(0).get('proyectId')?.value).toBe('p1');
    });

    it('removeMobilityRow removes the row at the given index', () => {
      const component = createComponent();
      component.addMobilityRow();
      component.addMobilityRow();
      component.removeMobilityRow(0);
      expect(component.mobilityRowsArray.length).toBe(1);
    });

    it('getMobilityTotal sums all row totals', () => {
      const component = createComponent();
      component.addMobilityRow();
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({ total: 10 });
      component.mobilityRowsArray.at(1).patchValue({ total: 25 });
      expect(component.getMobilityTotal()).toBe(35);
    });

    it('getMobilityDateTotal sums totals only for the given date', () => {
      const component = createComponent();
      component.addMobilityRow();
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({ fecha: '2026-02-01', total: 10 });
      component.mobilityRowsArray.at(1).patchValue({ fecha: '2026-02-02', total: 25 });
      expect(component.getMobilityDateTotal('2026-02-01')).toBe(10);
    });

    it('isMobilityRowDateOverLimit / hasAnyMobilityLimitExceeded reflect the configured daily limit', () => {
      const component = createComponent();
      component.mobilityDailyLimit = 20;
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({ fecha: '2026-02-01', total: 25 });
      expect(component.isMobilityRowDateOverLimit(0)).toBeTrue();
      expect(component.hasAnyMobilityLimitExceeded()).toBeTrue();
    });

    it('onColaboradorTerceroToggle clears the selected worker when unchecked', () => {
      const component = createComponent();
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({ colaboradorEsTercero: false, colaboradorId: 'w1' });
      component.onColaboradorTerceroToggle(0);
      expect(component.mobilityRowsArray.at(0).get('colaboradorId')?.value).toBe('');
    });

    it('isRowColaboradorInvalid is true only when tercero is checked, unselected, and touched', () => {
      const component = createComponent();
      component.addMobilityRow();
      const row = component.mobilityRowsArray.at(0);
      row.patchValue({ colaboradorEsTercero: true });
      expect(component.isRowColaboradorInvalid(0)).toBeFalse();
      row.get('colaboradorId')?.markAsTouched();
      expect(component.isRowColaboradorInvalid(0)).toBeTrue();
    });
  });

  describe('lookupRazonSocial', () => {
    it('ignores RUCs that are not 11 digits', () => {
      const component = createComponent();
      component.lookupRazonSocial('123');
      expect(invoicesService.getRucInfo).not.toHaveBeenCalled();
    });

    it('sets fetchedRazonSocial on success', () => {
      invoicesService.getRucInfo.and.returnValue(of({ razonSocial: 'Acme SAC', fuente: 'sunat' }));
      const component = createComponent();
      component.lookupRazonSocial('20123456789');
      expect(component.fetchedRazonSocial()).toBe('Acme SAC');
      expect(component.rucNotFound()).toBeFalse();
    });

    it('marks rucNotFound on error', () => {
      invoicesService.getRucInfo.and.returnValue(throwError(() => new Error('fail')));
      const component = createComponent();
      component.lookupRazonSocial('20123456789');
      expect(component.rucNotFound()).toBeTrue();
    });
  });

  describe('getButtonLabel', () => {
    it('returns the update label when editing', () => {
      invoicesService.getInvoiceById.and.returnValue(of({ _id: 'inv1', data: '{}' } as any));
      const component = createComponent({ id: 'inv1' });
      component.ngOnInit();
      expect(component.getButtonLabel()).toBe('Actualizar');
    });

    it('returns the create label per expense type', () => {
      const component = createComponent();
      component.setExpenseType('planilla_movilidad');
      expect(component.getButtonLabel()).toBe('Guardar Planilla');
      component.setExpenseType('otros_gastos');
      expect(component.getButtonLabel()).toBe('Guardar Gasto');
      component.setExpenseType('recibo_caja');
      expect(component.getButtonLabel()).toBe('Guardar Recibo de Caja');
      component.setExpenseType('factura');
      expect(component.getButtonLabel()).toBe('Subir factura');
    });
  });

  describe('onFileSelected', () => {
    it('sets selectedFile and generates a preview for images', () => {
      const component = createComponent();
      const file = new File(['abc'], 'photo.png', { type: 'image/png' });
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file] });
      component.onFileSelected({ target: input } as unknown as Event);
      expect(component.selectedFile).toBe(file);
      expect(component.previewImage).not.toBeNull();
    });

    it('does not generate a preview for non-image files', () => {
      const component = createComponent();
      const file = new File(['abc'], 'doc.pdf', { type: 'application/pdf' });
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file] });
      component.onFileSelected({ target: input } as unknown as Event);
      expect(component.previewImage).toBeNull();
    });
  });

  describe('back / navigateAfterExpenseSave', () => {
    it('navigates to /rendiciones (directas tab) when coming from contabilidad', () => {
      userStateService.isContabilidad.and.returnValue(true);
      const component = createComponent({}, { from: 'contabilidad' });
      component.ngOnInit();
      component.back();
      expect(router.navigate).toHaveBeenCalledWith(['/rendiciones'], { queryParams: { tab: 'directas' } });
    });

    it('submits direct expenses and navigates to /mis-rendiciones in directa mode', () => {
      const component = createComponent({}, { mode: 'directa' });
      component.ngOnInit();
      component.back();
      expect(expenseService.submitMyDirectExpenses).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones'], { queryParams: { tab: 'directas' } });
    });

    it('navigates to the rendicion detail when rendicionId is set', () => {
      expenseReportsService.findOne.and.returnValue(of({ _id: 'r1', projectId: 'p1' } as any));
      const component = createComponent({}, { rendicionId: 'r1' });
      component.ngOnInit();
      component.back();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'r1', 'detalle']);
    });

    it('navigates to /invoices by default', () => {
      const component = createComponent();
      component.back();
      expect(router.navigate).toHaveBeenCalledWith(['/invoices']);
    });
  });

  describe('loadRendicionProject / loadRendicionAdvances', () => {
    it('inherits the OT and disables selection for direct reports that already have one', () => {
      expenseReportsService.findOne.and.returnValue(
        of({
          _id: 'r1',
          projectId: 'p1',
          isDirecta: true,
          directaOrdenTrabajoId: 'ot1',
          expenseIds: [],
          settlement: null,
        } as any)
      );
      const component = createComponent({}, { rendicionId: 'r1' });
      component.ngOnInit();

      expect(component.isDirectaReport()).toBeTrue();
      expect(component.directaOrdenTrabajoInherited()).toBeTrue();
      expect(component.form.get('ordenTrabajoId')?.disabled).toBeTrue();
      expect(component.form.get('proyectId')?.disabled).toBeTrue();
    });

    it('computes rendicionSpent from report expenses and rendicionBudget from paid/settled advances of that report', () => {
      expenseReportsService.findOne.and.returnValue(
        of({
          _id: 'r1',
          projectId: 'p1',
          expenseIds: [{ total: '10' }, { total: '5' }],
          settlement: null,
        } as any)
      );
      advanceService.findMy.and.returnValue(
        of([
          { expenseReportId: 'r1', status: 'paid', paidAmount: 100, amount: 100 } as any,
          { expenseReportId: 'other', status: 'paid', paidAmount: 999, amount: 999 } as any,
          { expenseReportId: 'r1', status: 'approved', amount: 50 } as any,
        ])
      );
      const component = createComponent({}, { rendicionId: 'r1' });
      component.ngOnInit();

      expect(component.rendicionSpent()).toBe(15);
      expect(component.rendicionBudget()).toBe(100);
      expect(component.rendicionAvailable()).toBe(85);
    });
  });

  describe('OCR / invoice amount editing state', () => {
    it('ocrAmountWasEdited and invoiceAmountWasEdited reflect edited amounts', () => {
      const component = createComponent();
      expect(component.ocrAmountWasEdited).toBeFalse();
      component.ocrTotalAmount.set(100);
      component.startEditOcrAmount();
      component.editedOcrTotal.set(120);
      expect(component.ocrAmountWasEdited).toBeTrue();

      component.originalInvoice = { total: 50 };
      expect(component.invoiceAmountWasEdited).toBeFalse();
      component.startEditInvoiceAmount();
      component.editedInvoiceTotal.set(70);
      expect(component.invoiceAmountWasEdited).toBeTrue();
    });
  });
});
