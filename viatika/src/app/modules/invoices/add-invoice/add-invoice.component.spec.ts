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
  let companyConfigService: { companyConfig$: any; getCompanyConfig?: () => any };

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
      'createDeclaracionJurada',
      'updateInvoice',
      'analyzeInvoice',
      'analyzePdf',
      'getSunatValidation',
      'validateWithSunatData',
      'validateSunatStateless',
      'createInvoice',
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
    invoicesService.validateSunatStateless.and.returnValue(of({ status: 'ERROR_SUNAT' } as any));
    invoicesService.createInvoice.and.returnValue(of({ _id: 'inv1' } as any));

    router = jasmine.createSpyObj('Router', ['navigate']);

    notificationService = jasmine.createSpyObj('NotificationService', ['show']);

    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', [
      'findAllByUser',
      'findOne',
      // La rendición de caja chica precarga su centro de costo al abrir el
      // formulario; sin el método en el doble, ngOnInit reventaba.
      'findCajaChicaCentroCosto',
    ]);
    expenseReportsService.findAllByUser.and.returnValue(of([]));
    expenseReportsService.findCajaChicaCentroCosto.and.returnValue(of({ projectId: '' } as any));

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

    const limitsPorDefecto = { limits: { movilidadDiario: 500 } };
    companyConfigService = {
      companyConfig$: of(limitsPorDefecto),
      getCompanyConfig: () => limitsPorDefecto,
    };
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
      (component as any).mobilityDailyLimitRaw = 15;
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

  describe('addMobilityRow - orden de inserción (VD-71)', () => {
    it('la fila nueva se renderiza vacía y no hereda el departamento de la anterior', () => {
      const activatedRouteStub: any = {
        snapshot: { params: {}, queryParamMap: convertToParamMap({}) },
        queryParamMap: of(convertToParamMap({})),
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
      const component = fixture.componentInstance;
      component.setExpenseType('planilla_movilidad');

      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({ origenDepartamento: 'Ayacucho' });
      fixture.detectChanges();

      component.addMobilityRow();
      fixture.detectChanges();

      const selects: HTMLSelectElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('select[formControlName="origenDepartamento"]')
      );
      expect(selects.length).toBe(2);
      // La fila nueva está arriba y debe salir sin departamento; la anterior
      // conserva el suyo. Con `track $index` el DOM se reutilizaba por posición
      // y la fila nueva heredaba "Ayacucho".
      expect(selects[0].value).toBe('');
      expect(selects[1].value).toBe('Ayacucho');
    });

    it('el selector de categoría de movilidad muestra la cuenta junto al nombre', () => {
      const activatedRouteStub: any = {
        snapshot: { params: {}, queryParamMap: convertToParamMap({}) },
        queryParamMap: of(convertToParamMap({})),
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
      // Dos categorías de movilidad con el mismo nombre y distinta cuenta:
      // sin la cuenta serían indistinguibles en el desplegable. Se cargan vía el
      // servicio porque ngOnInit (en el primer detectChanges) recarga categories.
      invoicesService.getCategories.and.returnValue(
        of([
          { _id: 'mov91', name: 'Planilla de movilidad', cuenta: '91.3.1.420' },
          { _id: 'mov92', name: 'Planilla de movilidad', cuenta: '92.3.140' },
        ] as any)
      );
      const fixture = TestBed.createComponent(AddInvoiceComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      component.setExpenseType('planilla_movilidad');
      fixture.detectChanges();

      // El selector es `app-search-select`: las opciones solo existen en el DOM
      // con el panel abierto, así que primero se pulsa el disparador.
      // Se filtra por formControlName: en planilla de movilidad también hay un
      // `app-search-select` para la OT.
      const categorySelect: HTMLElement = fixture.nativeElement.querySelector(
        'app-search-select[formControlName="categoryId"]'
      );
      categorySelect.querySelector('button')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
      fixture.detectChanges();

      const options: HTMLElement[] = Array.from(
        categorySelect.querySelectorAll('ul li button')
      );
      // Cada opción son dos líneas: nombre arriba y cuenta debajo.
      const labels = options.map(o =>
        Array.from(o.querySelectorAll('span span')).map(s => s.textContent?.trim())
      );
      expect(labels).toContain(['Planilla de movilidad', '91.3.1.420']);
      expect(labels).toContain(['Planilla de movilidad', '92.3.140']);
    });

    it('inserta la fila nueva al inicio del FormArray', () => {
      const component = createComponent();
      component.setExpenseType('planilla_movilidad');

      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({ gestion: 'primera' });

      component.addMobilityRow();
      // La segunda fila agregada debe quedar en el índice 0 (arriba).
      expect(component.mobilityRowsArray.length).toBe(2);
      expect(component.mobilityRowsArray.at(0).get('gestion')?.value).toBe('');
      expect(component.mobilityRowsArray.at(1).get('gestion')?.value).toBe('primera');
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

    // En rendición directa el centro de costo y la OT se heredan, pero la
    // categoría no se puede deducir con dos asignadas (91x Servicios y 92x
    // Comercial van a cuentas contables distintas). Antes se ocultaba el
    // selector y el guardado moría con "no tienes ninguna asignada".
    describe('in a rendicion directa', () => {
      const asDirecta = (component: any) => {
        spyOn(component, 'isDirectaPlanilla').and.returnValue(true);
        spyOn(component, 'isDirectaContext').and.returnValue(true);
      };

      it('shows the selector when the collaborator has more than one', () => {
        const component = createComponent();
        asDirecta(component);
        component.categories = [
          { _id: 'mov91', name: 'Planilla de movilidad', cuenta: '913111' } as any,
          { _id: 'mov92', name: 'Planilla de movilidad COM', cuenta: '923111' } as any,
        ];
        component.setExpenseType('planilla_movilidad');
        expect(component.showMovilidadCategorySelect).toBeTrue();
        expect(component.form.get('categoryId')?.value).toBeFalsy();
      });

      it('still auto-assigns when the collaborator has exactly one', () => {
        const component = createComponent();
        asDirecta(component);
        component.categories = [{ _id: 'mov91', name: 'Planilla de movilidad' } as any];
        component.setExpenseType('planilla_movilidad');
        expect(component.showMovilidadCategorySelect).toBeFalse();
        expect(component.form.get('categoryId')?.value).toBe('mov91');
      });

      // El bloque superior está oculto en directa (centro de costo y OT se
      // heredan); tiene que reaparecer solo cuando falta resolver la categoría.
      it('reveals the top block only when the category needs resolving', () => {
        const component = createComponent();
        asDirecta(component);
        component.categoriesLoaded.set(true);

        component.categories = [{ _id: 'mov91', name: 'Planilla de movilidad' } as any];
        component.setExpenseType('planilla_movilidad');
        expect(component.showMovilidadCategoryBlock).toBeFalse();

        component.categories = [
          { _id: 'mov91', name: 'Planilla de movilidad' } as any,
          { _id: 'mov92', name: 'Planilla de movilidad COM' } as any,
        ];
        expect(component.showMovilidadCategoryBlock).toBeTrue();

        component.categories = [{ _id: 'c1', name: 'Viajes' } as any];
        expect(component.showMovilidadCategoryBlock).toBeTrue();
      });
    });
  });

  // VD-100: la categoría de Otros Gastos salió del bloque superior y vive dentro
  // del tipo de documento; AL (Alimentación sin documentación) la trae puesta.
  describe('categoría en Otros Gastos (VD-100)', () => {
    const catAli = { _id: 'cat-ali', name: 'Alimentacion', cuenta: '91.3.1.410' } as any;
    const catAliCom = { _id: 'cat-ali-com', name: 'Alimentacion COM', cuenta: '92.3.1.410' } as any;
    // Nombre tal como está cargado en Detroit: el texto explicativo va dentro
    // del propio nombre y menciona "alimentación" (VD-108).
    const catRep = {
      _id: 'cat-rep',
      name: 'Gastos Reparables (gastos sin factura)\n- alimentación en lugares donde no existan proveedores que facturen\n- propinas',
      cuenta: '915998',
    } as any;
    const catRepCom = {
      _id: 'cat-rep-com',
      name: 'Gastos Reparables (gastos sin factura)\n- alimentación en lugares donde no existan proveedores que facturen COM',
      cuenta: '925998',
    } as any;

    it('no muestra la categoría en el bloque superior para otros_gastos', () => {
      const component = createComponent();
      component.setExpenseType('factura');
      expect(component.showTopCategorySelect).toBeTrue();
      component.setExpenseType('recibo_caja');
      expect(component.showTopCategorySelect).toBeTrue();
      component.setExpenseType('otros_gastos');
      expect(component.showTopCategorySelect).toBeFalse();
    });

    describe('comida y tope en AL (VD-109)', () => {
      function componentConTopes(): AddInvoiceComponent {
        companyConfigService = {
          companyConfig$: of({
            limits: { movilidadDiario: 500, alimentacionDesayuno: 15, alimentacionAlmuerzo: 30 },
          }),
          getCompanyConfig: () => ({
            limits: { movilidadDiario: 500, alimentacionDesayuno: 15, alimentacionAlmuerzo: 30 },
          }),
        };
        const component = createComponent();
        component.categories = [catRep];
        component.setExpenseType('otros_gastos');
        component.selectOtrosSubTipo('AL');
        return component;
      }

      it('expone el tope de la comida elegida', () => {
        const component = componentConTopes();
        component.form.patchValue({ tipoComida: 'almuerzo' });

        expect(component.topeComidaSeleccionada).toBe(30);
        expect(component.comidasDisponibles.find((c) => c.key === 'cena')?.tope).toBeNull();
      });

      it('marca el monto que supera el tope y bloquea el guardado', () => {
        const component = componentConTopes();
        component.form.patchValue({ tipoComida: 'almuerzo', totalOtros: 45, declaracionJurada: true });

        expect(component.montoSuperaTopeComida).toBeTrue();
        expect(component.isFormValid()).toBeFalse();

        component.saveOtherExpense();
        expect(invoicesService.createOtherExpense).not.toHaveBeenCalled();
      });

      it('deja guardar el monto que llega justo al tope', () => {
        const component = componentConTopes();
        component.form.patchValue({ tipoComida: 'almuerzo', totalOtros: 30 });

        expect(component.montoSuperaTopeComida).toBeFalse();
      });

      it('sin tope configurado para esa comida no bloquea', () => {
        const component = componentConTopes();
        component.form.patchValue({ tipoComida: 'cena', totalOtros: 500 });

        expect(component.montoSuperaTopeComida).toBeFalse();
      });

      it('no guarda sin declarar la comida', () => {
        const component = componentConTopes();
        component.form.patchValue({ tipoComida: '', totalOtros: 20, declaracionJurada: true });

        expect(component.isFormValid()).toBeFalse();
        component.saveOtherExpense();
        expect(invoicesService.createOtherExpense).not.toHaveBeenCalled();
      });
    });

    it('autoselecciona Gastos Reparables en AL cuando hay una sola (VD-108)', () => {
      const component = createComponent();
      component.categories = [catRep, catAli, { _id: 'c2', name: 'Viajes' } as any];
      component.setExpenseType('otros_gastos');
      component.selectOtrosSubTipo('AL');

      expect(component.gastosReparablesCategoryAuto()?._id).toBe('cat-rep');
      expect(component.form.get('categoryId')?.value).toBe('cat-rep');
    });

    it('con las dos de Gastos Reparables (Servicios y COM) deja elegir entre ellas', () => {
      const component = createComponent();
      component.categories = [catRep, catRepCom, catAli, { _id: 'c2', name: 'Viajes' } as any];
      component.setExpenseType('otros_gastos');
      component.selectOtrosSubTipo('AL');

      expect(component.gastosReparablesCategoryAuto()).toBeNull();
      expect(component.form.get('categoryId')?.value).toBeFalsy();
      expect(component.otrosCategoryOptions.map((o) => o.value)).toEqual(['cat-rep', 'cat-rep-com']);
    });

    it('sin categoría de Gastos Reparables cae al listado completo en vez de bloquear', () => {
      const component = createComponent();
      component.categories = [{ _id: 'c2', name: 'Viajes' } as any];
      component.setExpenseType('otros_gastos');
      component.selectOtrosSubTipo('AL');

      expect(component.gastosReparablesCategoryAuto()).toBeNull();
      expect(component.otrosCategoryOptions.map((o) => o.value)).toEqual(['c2']);
    });

    it('la DJ al extranjero conserva las de Alimentación y no toma Gastos Reparables (VD-108)', () => {
      const component = createComponent();
      component.categories = [catRep, catRepCom, catAli, catAliCom];

      expect(component.djCategoriesFor('alimentacion').map((c) => c._id)).toEqual([
        'cat-ali', 'cat-ali-com',
      ]);
    });

    it('suelta la categoría autoasignada al cambiar de AL a otro tipo de documento', () => {
      const component = createComponent();
      component.categories = [catRep];
      component.setExpenseType('otros_gastos');
      component.selectOtrosSubTipo('AL');
      expect(component.form.get('categoryId')?.value).toBe('cat-rep');

      component.selectOtrosSubTipo('BV');
      expect(component.gastosReparablesCategoryAuto()).toBeNull();
      expect(component.form.get('categoryId')?.value).toBeFalsy();
    });

    it('respeta la categoría elegida a mano al cambiar de tipo de documento', () => {
      const component = createComponent();
      component.categories = [catAli, catAliCom];
      component.setExpenseType('otros_gastos');
      component.selectOtrosSubTipo('BV');
      component.form.get('categoryId')?.setValue('cat-ali-com');

      component.selectOtrosSubTipo('RC');
      expect(component.form.get('categoryId')?.value).toBe('cat-ali-com');
    });

    it('al editar respeta la categoría guardada y no autoasigna', () => {
      const component = createComponent({ id: 'inv1' });
      component.categories = [catRep];
      component.setExpenseType('otros_gastos');
      component.form.get('categoryId')?.setValue('otra-cat');
      component.selectOtrosSubTipo('AL');

      expect(component.gastosReparablesCategoryAuto()).toBeNull();
      expect(component.form.get('categoryId')?.value).toBe('otra-cat');
    });

    // El aviso de "no tienes categoría de Planilla de movilidad" se colaba en
    // Otros Gastos, que no usa esas categorías.
    it('no muestra el aviso de categorías de movilidad en otros_gastos', () => {
      const component = createComponent();
      component.categoriesLoaded.set(true);
      component.categories = [{ _id: 'c2', name: 'Viajes' } as any];
      component.setExpenseType('otros_gastos');
      expect(component.showMovilidadCategoryBlock).toBeFalse();
    });

    // Pruebas sobre el DOM: la categoría tiene que quedar dentro del bloque del
    // tipo de documento, debajo del RUC, y en AL sin selector ni textos extra.
    describe('render', () => {
      function renderComponent(categories: any[]) {
        const activatedRouteStub: any = {
          snapshot: { params: {}, queryParamMap: convertToParamMap({}) },
          queryParamMap: of(convertToParamMap({})),
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
        // Las categorías se cargan por el servicio: ngOnInit corre en el primer
        // detectChanges y sobrescribe lo que se asigne a mano.
        invoicesService.getCategories.and.returnValue(of(categories));
        const fixture = TestBed.createComponent(AddInvoiceComponent);
        fixture.detectChanges();
        fixture.componentInstance.setExpenseType('otros_gastos');
        fixture.detectChanges();
        return fixture;
      }

      it('pinta la categoría debajo del RUC, dentro del bloque del tipo de documento', () => {
        const fixture = renderComponent([catAli, catAliCom]);
        fixture.componentInstance.selectOtrosSubTipo('BV');
        fixture.detectChanges();

        const ruc: HTMLElement = fixture.nativeElement.querySelector('#otrosRucEmisor');
        const categoria: HTMLElement = fixture.nativeElement.querySelector(
          'app-search-select[formControlName="categoryId"]'
        );
        expect(ruc).toBeTruthy();
        expect(categoria).toBeTruthy();
        // Mismo bloque que el selector de tipo de documento…
        const bloque = ruc.closest('div.bg-quaternary')!;
        expect(bloque.textContent).toContain('Tipo de documento');
        expect(bloque.contains(categoria)).toBeTrue();
        // …y después del RUC en el orden del documento.
        const despuesDelRuc = !!(
          ruc.compareDocumentPosition(categoria) & Node.DOCUMENT_POSITION_FOLLOWING
        );
        expect(despuesDelRuc).toBeTrue();
      });

      it('en AL muestra la categoría autoasignada como texto, sin selector ni leyenda', () => {
        const fixture = renderComponent([catRep]);
        fixture.componentInstance.selectOtrosSubTipo('AL');
        fixture.detectChanges();

        const texto: string = fixture.nativeElement.textContent;
        expect(texto).toContain('Gastos Reparables');
        expect(texto).not.toContain('Asignada automáticamente');
        expect(
          fixture.nativeElement.querySelector('app-search-select[formControlName="categoryId"]')
        ).toBeNull();
      });

      it('en AL con las dos de Gastos Reparables sí muestra el selector', () => {
        const fixture = renderComponent([catRep, catRepCom]);
        fixture.componentInstance.selectOtrosSubTipo('AL');
        fixture.detectChanges();

        expect(
          fixture.nativeElement.querySelector('app-search-select[formControlName="categoryId"]')
        ).toBeTruthy();
      });

      // VD-110: el adjunto de AL ya se guardaba sin archivo, pero la etiqueta
      // lo pedía con asterisco y el colaborador lo leía como obligatorio.
      it('en AL el adjunto se rotula como opcional', () => {
        const fixture = renderComponent([catRep]);
        fixture.componentInstance.selectOtrosSubTipo('AL');
        fixture.detectChanges();

        const texto: string = fixture.nativeElement.textContent;
        expect(texto).toContain('Adjunto');
        expect(texto).toContain('(opcional)');
        expect(texto).toContain('Haz clic para adjuntar un respaldo, si lo tienes');
      });

      it('en los demás sub-tipos el adjunto sigue siendo obligatorio', () => {
        const fixture = renderComponent([catRep]);
        fixture.componentInstance.selectOtrosSubTipo('BV');
        fixture.detectChanges();

        const texto: string = fixture.nativeElement.textContent;
        expect(texto).toContain('Haz clic para adjuntar un comprobante');
        expect(fixture.componentInstance.isFormValid()).toBeFalse();
      });

      it('no deja el selector de categoría en el bloque de arriba', () => {
        const fixture = renderComponent([catAli, catAliCom]);
        fixture.componentInstance.selectOtrosSubTipo('BV');
        fixture.detectChanges();

        const selectores = fixture.nativeElement.querySelectorAll(
          'app-search-select[formControlName="categoryId"]'
        );
        expect(selectores.length).toBe(1);
      });
    });

    it('oculta el bloque superior en directa cuando ya no le queda nada', () => {
      const component = createComponent();
      spyOn(component, 'isDirectaContext').and.returnValue(true);
      component.categoriesLoaded.set(true);
      component.categories = [{ _id: 'c2', name: 'Viajes' } as any];

      component.setExpenseType('otros_gastos');
      expect(component.showTopBlock).toBeFalse();

      component.setExpenseType('factura');
      expect(component.showTopBlock).toBeTrue();
    });
  });

  describe('isFormValid - otros_gastos', () => {
    it('DJ sub-type requires the declaracionJurada checkbox', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', totalOtros: 50, fechaEmision: '2026-08-12' });
      component.setExpenseType('otros_gastos');
      component.otrosSubTipo.set('DJ');
      component.selectedFile = new File([''], 'a.png');
      expect(component.isFormValid()).toBeFalse();
      component.form.patchValue({ declaracionJurada: true });
      expect(component.isFormValid()).toBeTrue();
    });

    it('BV sub-type requires ruc/serie/correlativo instead of the DJ checkbox', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', totalOtros: 50, fechaEmision: '2026-08-12' });
      component.setExpenseType('otros_gastos');
      component.otrosSubTipo.set('BV');
      component.selectedFile = new File([''], 'a.png');
      expect(component.isFormValid()).toBeFalse();
      component.form.patchValue({ rucEmisor: '20123456789', serie: 'B001', correlativo: '1' });
      expect(component.isFormValid()).toBeTrue();
    });

    it('requires an attached file when creating', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', totalOtros: 50, declaracionJurada: true, fechaEmision: '2026-08-12' });
      component.setExpenseType('otros_gastos');
      component.otrosSubTipo.set('DJ');
      expect(component.isFormValid()).toBeFalse();
    });

    it('AL (Alimentación sin documentación) is valid without an attached file (VD-91)', () => {
      const component = createComponent();
      component.form.patchValue({
        proyectId: 'p1', categoryId: 'cat1', totalOtros: 50, declaracionJurada: true,
        // VD-109: AL declara la comida.
        tipoComida: 'almuerzo',
        // Sin comprobante, la fecha del gasto se declara y es obligatoria.
        fechaEmision: '2026-08-12',
      });
      component.setExpenseType('otros_gastos');
      component.otrosSubTipo.set('AL');
      // AL no requiere comprobante adjunto, pero sí el checkbox de declaración jurada.
      expect(component.isFormValid()).toBeTrue();
    });

    // Sin comprobante del que leerla, la fecha la pone el colaborador: de ella
    // salen el plazo de presentación y el tipo de cambio congelado del gasto.
    it('AL sin la fecha del gasto no es válido', () => {
      const component = createComponent();
      component.form.patchValue({
        proyectId: 'p1', categoryId: 'cat1', totalOtros: 50, declaracionJurada: true,
        tipoComida: 'almuerzo', fechaEmision: '',
      });
      component.setExpenseType('otros_gastos');
      component.otrosSubTipo.set('AL');
      expect(component.isFormValid()).toBeFalse();

      component.form.patchValue({ fechaEmision: '2026-08-12' });
      expect(component.isFormValid()).toBeTrue();
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
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', declaracionJurada: true, totalOtros: 50, fechaEmision: '2026-08-12' });
      component.otrosSubTipo.set('DJ');
      component.saveOtherExpense();
      expect(notificationService.show).toHaveBeenCalledWith('Debes adjuntar el comprobante', 'error');
    });

    it('BV sub-type requires rucEmisor', () => {
      const component = createComponent();
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', totalOtros: 50, fechaEmision: '2026-08-12' });
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
        fechaEmision: '2026-08-12',
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
        fechaEmision: '2026-08-12',
      });
      component.otrosSubTipo.set('TK');
      component.selectedFile = new File([''], 'a.png');
      component.saveOtherExpense();

      const payload = invoicesService.createOtherExpense.calls.mostRecent().args[0];
      expect(payload.declaracionJurada).toBeFalse();
      expect(payload.declaracionJuradaFirmante).toBeUndefined();
    });

    it('AL (Alimentación sin documentación) creates the expense without a file, as a declaración jurada (VD-91)', () => {
      invoicesService.createOtherExpense.and.returnValue(of({ _id: 'e1' } as any));
      const component = createComponent();
      component.form.patchValue({
        proyectId: 'p1',
        categoryId: 'cat1',
        declaracionJurada: true,
        totalOtros: 40,
        tipoComida: 'almuerzo',
        fechaEmision: '2026-08-12',
      });
      component.otrosSubTipo.set('AL');
      // Sin selectedFile: AL va sin adjunto.
      component.saveOtherExpense();

      const payload = invoicesService.createOtherExpense.calls.mostRecent().args[0] as any;
      expect(payload.subTipo).toBe('AL');
      expect(payload.tipoComida).toBe('almuerzo');
      // La fecha declarada viaja en el formato del resto de comprobantes.
      expect(payload.fechaEmision).toBe('12/08/2026');
      expect(payload.declaracionJurada).toBeTrue();
      expect(payload.declaracionJuradaFirmante).toBe('John Doe');
      expect(payload.imageUrl).toBeUndefined();
      expect(notificationService.show).toHaveBeenCalledWith('Gasto guardado correctamente', 'success');
    });
  });

  describe('Otros Gastos — fecha del gasto', () => {
    it('ningún sub-tipo se guarda sin fecha', () => {
      const component = createComponent();
      component.form.patchValue({
        proyectId: 'p1', categoryId: 'cat1', totalOtros: 30,
        rucEmisor: '20123456789', fechaEmision: '',
      });
      component.otrosSubTipo.set('BV');
      component.form.patchValue({ serie: 'B001', correlativo: '1' });
      component.selectedFile = new File([''], 'a.png');
      component.saveOtherExpense();

      expect(notificationService.show).toHaveBeenCalledWith('Indica la fecha de emisión del comprobante', 'error');
      expect(invoicesService.createOtherExpense).not.toHaveBeenCalled();
    });

    it('la fecha viaja en el alta de un sub-tipo con documento', () => {
      invoicesService.createOtherExpense.and.returnValue(of({ _id: 'e1' } as any));
      const component = createComponent();
      component.form.patchValue({
        proyectId: 'p1', categoryId: 'cat1', totalOtros: 30,
        rucEmisor: '20123456789', serie: 'B001', correlativo: '1',
        fechaEmision: '2026-08-12',
      });
      component.otrosSubTipo.set('BV');
      component.selectedFile = new File([''], 'a.png');
      component.saveOtherExpense();

      const payload = invoicesService.createOtherExpense.calls.mostRecent().args[0] as any;
      expect(payload.fechaEmision).toBe('12/08/2026');
    });

    // La DJ al extranjero declara una fecha por fila en su detalle diario, así
    // que no se le pide una sola para el gasto.
    it('la DJ al extranjero no pide la fecha del gasto', () => {
      const component = createComponent();
      component.setExpenseType('otros_gastos');
      component.selectOtrosSubTipo('DJE');
      expect(component.pideFechaDelGasto).toBeFalse();
    });

    it('no guarda el AL sin la fecha del gasto', () => {
      const component = createComponent();
      component.form.patchValue({
        proyectId: 'p1', categoryId: 'cat1', declaracionJurada: true,
        totalOtros: 40, tipoComida: 'almuerzo', fechaEmision: '',
      });
      component.otrosSubTipo.set('AL');
      component.saveOtherExpense();

      expect(notificationService.show).toHaveBeenCalledWith('Indica la fecha del gasto', 'error');
      expect(invoicesService.createOtherExpense).not.toHaveBeenCalled();
    });
  });

  describe('DJE — Declaración Jurada al extranjero', () => {
    const catAlimentacion = { _id: 'cat-ali', name: 'Alimentacion', cuenta: '91.3.1.410' } as any;
    const catMovilidad = { _id: 'cat-mov', name: 'Planilla de movilidad', cuenta: '91.3.1.411' } as any;

    function djComponent(categories: any[] = [catAlimentacion, catMovilidad]) {
      invoicesService.getCategories.and.returnValue(of(categories));
      const component = createComponent();
      component.ngOnInit();
      component.setExpenseType('otros_gastos');
      component.selectOtrosSubTipo('DJE');
      component.form.patchValue({ proyectId: 'p1', declaracionJurada: true });
      return component;
    }

    it('autoselecciona la categoría de cada rubro cuando hay una sola coincidencia', () => {
      const component = djComponent();
      expect(component.djAlimentacionAuto()?._id).toBe('cat-ali');
      expect(component.djMovilidadAuto()?._id).toBe('cat-mov');
      expect(component.form.get('djAlimentacionCategoryId')?.value).toBe('cat-ali');
      expect(component.form.get('djMovilidadCategoryId')?.value).toBe('cat-mov');
    });

    it('reconoce las variantes COM (Comercial) como categoría del rubro', () => {
      const component = djComponent([
        { _id: 'cat-ali-com', name: 'Alimentacion COM', cuenta: '92.3.1.410' } as any,
        { _id: 'cat-mov-com', name: 'Planilla de movilidad COM', cuenta: '92.3.1.411' } as any,
      ]);
      // Única del rubro aunque sea la variante COM: se autoasigna igual.
      expect(component.djAlimentacionAuto()?._id).toBe('cat-ali-com');
      expect(component.djMovilidadAuto()?._id).toBe('cat-mov-com');
      expect(component.form.get('djAlimentacionCategoryId')?.value).toBe('cat-ali-com');
      expect(component.form.get('djMovilidadCategoryId')?.value).toBe('cat-mov-com');
    });

    it('deja elegir a mano cuando el rubro tiene varias categorías', () => {
      const component = djComponent([
        catAlimentacion,
        { _id: 'cat-ali-com', name: 'Alimentacion COM' },
        catMovilidad,
      ]);
      expect(component.djAlimentacionAuto()).toBeNull();
      expect(component.form.get('djAlimentacionCategoryId')?.value).toBe('');
      expect(component.djCategoriesFor('alimentacion').length).toBe(2);
    });

    it('no es válido sin filas, y sí con una fila completa', () => {
      const component = djComponent();
      expect(component.isFormValid()).toBeFalse();
      component.addDjRow('alimentacion');
      component.djAlimentacionRowsArray.at(0).patchValue({ fecha: '2026-07-10', monto: 40 });
      expect(component.isFormValid()).toBeTrue();
    });

    it('no es válido si el rubro con filas no tiene categoría resuelta', () => {
      const component = djComponent([catMovilidad]);
      component.addDjRow('alimentacion');
      component.djAlimentacionRowsArray.at(0).patchValue({ fecha: '2026-07-10', monto: 40 });
      expect(component.isFormValid()).toBeFalse();
    });

    it('envía un payload con una sección por rubro y no navega (queda el PDF por descargar)', () => {
      invoicesService.createDeclaracionJurada.and.returnValue(
        of({ groupId: 'g1', expenses: [] } as any)
      );
      const component = djComponent();
      component.form.patchValue({ djDestino: 'Quito', djPais: 'Ecuador', djLugarFirma: 'Lima' });
      component.addDjRow('alimentacion');
      component.djAlimentacionRowsArray.at(0).patchValue({ fecha: '2026-07-10', monto: 40 });
      component.addDjRow('movilidad');
      component.djMovilidadRowsArray.at(0).patchValue({ fecha: '2026-07-11', monto: 20 });

      component.saveOrUpdate();

      const payload = invoicesService.createDeclaracionJurada.calls.mostRecent().args[0];
      expect(payload.moneda).toBe('US$');
      expect(payload.destino).toBe('Quito');
      expect(payload.alimentacion).toEqual({
        categoryId: 'cat-ali',
        rows: [{ fecha: '2026-07-10', monto: 40 }],
      });
      expect(payload.movilidad).toEqual({
        categoryId: 'cat-mov',
        rows: [{ fecha: '2026-07-11', monto: 20 }],
      });
      expect(component.savedDeclaracionJurada()?.groupId).toBe('g1');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('omite el rubro sin filas', () => {
      invoicesService.createDeclaracionJurada.and.returnValue(
        of({ groupId: 'g1', expenses: [] } as any)
      );
      const component = djComponent();
      component.addDjRow('movilidad');
      component.djMovilidadRowsArray.at(0).patchValue({ fecha: '2026-07-11', monto: 20 });
      component.saveOrUpdate();

      const payload = invoicesService.createDeclaracionJurada.calls.mostRecent().args[0];
      expect(payload.alimentacion).toBeUndefined();
      expect(payload.movilidad?.rows.length).toBe(1);
    });

    it('exige firma digital registrada antes de guardar', () => {
      userStateService.getUser.and.returnValue({ ...currentUser, signature: '' } as any);
      const component = djComponent();
      component.addDjRow('alimentacion');
      component.djAlimentacionRowsArray.at(0).patchValue({ fecha: '2026-07-10', monto: 40 });
      component.saveOrUpdate();

      expect(invoicesService.createDeclaracionJurada).not.toHaveBeenCalled();
      expect(notificationService.show).toHaveBeenCalledWith(
        jasmine.stringMatching(/firma digital/i),
        'error'
      );
    });
  });

  describe('Viaje en el extranjero — pestaña con Declaración Jurada y Documentos', () => {
    // Nombres reales del catálogo de Detroit (91x Servicios / 92x Comercial).
    const catAlimentacionLima = { _id: 'cat-ali-lim', name: 'Alimentación - LIMA', cuenta: '91.2.5.00' } as any;
    const catAlimentacionProv = { _id: 'cat-ali-pro', name: 'Alimentacion - PROVINCIA', cuenta: '91.3.1.40' } as any;
    const catAlojamiento = { _id: 'cat-alo', name: 'Alojamiento - PROVINCIA', cuenta: '91.3.1.30' } as any;
    const catTransporte = { _id: 'cat-tra', name: 'Transporte de personal', cuenta: '91.3.1.14' } as any;
    const catGastosMenores = { _id: 'cat-men', name: 'Gastos menores - Área de servicios', cuenta: '91.5.9.31' } as any;
    const catCombustible = { _id: 'cat-com', name: 'Combustible (camionetas de la empresa)', cuenta: '91.3.1.60' } as any;
    const catUtiles = { _id: 'cat-uti', name: 'Utiles de Oficina', cuenta: '91.5.6.10' } as any;

    const catalogoCompleto = [
      catAlimentacionLima, catAlimentacionProv, catAlojamiento,
      catTransporte, catGastosMenores, catCombustible, catUtiles,
    ];

    function extranjeroComponent(categories: any[] = catalogoCompleto) {
      invoicesService.getCategories.and.returnValue(of(categories));
      const component = createComponent();
      component.ngOnInit();
      component.setExpenseType('otros_gastos');
      return component;
    }

    it('el selector muestra "Viaje en el extranjero" en vez de la DJ suelta', () => {
      const component = extranjeroComponent();
      const codigos = component.otrosSubTipoOpciones.map((o) => o.code);
      expect(codigos).toContain('EXT');
      expect(codigos).not.toContain('DJE');
      expect(component.otrosSubTipoOpciones.find((o) => o.code === 'EXT')?.label)
        .toBe('Viaje en el extranjero');
    });

    it('al entrar a la pestaña queda preseleccionada la Declaración Jurada', () => {
      const component = extranjeroComponent();
      component.selectOtrosSubTipo('EXT');
      expect(component.otrosSubTipo()).toBe('DJE');
      expect(component.isDj()).toBeTrue();
    });

    it('volver a tocar la pestaña no pisa la opción ya elegida', () => {
      const component = extranjeroComponent();
      component.selectOtrosSubTipo('EXT');
      component.selectOtrosSubTipo('EXD');
      component.selectOtrosSubTipo('EXT');
      expect(component.otrosSubTipo()).toBe('EXD');
    });

    it('el botón de la pestaña queda marcado con cualquiera de sus dos opciones', () => {
      const component = extranjeroComponent();
      component.selectOtrosSubTipo('DJE');
      expect(component.subTipoBotonActivo('EXT')).toBeTrue();
      component.selectOtrosSubTipo('EXD');
      expect(component.subTipoBotonActivo('EXT')).toBeTrue();
      component.selectOtrosSubTipo('OT');
      expect(component.subTipoBotonActivo('EXT')).toBeFalse();
    });

    it('Documentos se rinde en dólares y no es una declaración jurada', () => {
      const component = extranjeroComponent();
      component.selectOtrosSubTipo('EXD');
      expect(component.isExtranjeroDocumento()).toBeTrue();
      expect(component.otrosMonedaSimbolo).toBe('$');
      expect(component.isDj()).toBeFalse();
      // Sin RUC ni serie: el comprobante lo emitió un proveedor del exterior.
      expect(component.otrosSubTipoMuestraDocumento()).toBeFalse();
      expect(component.otrosSubTipoRequiereDeclaracion()).toBeFalse();
    });

    it('Documentos acota las categorías a los rubros del viaje, por nombre', () => {
      const component = extranjeroComponent();
      component.selectOtrosSubTipo('EXD');
      const valores = component.otrosCategoryOptions.map((o) => o.value);
      // Alimentación entra con sus dos variantes; Combustible y Útiles quedan fuera.
      expect(valores).toEqual([
        'cat-ali-lim', 'cat-ali-pro', 'cat-alo', 'cat-tra', 'cat-men',
      ]);
    });

    it('respeta las tildes y las mayúsculas del catálogo', () => {
      // "Alimentación - LIMA" y "Alimentacion - PROVINCIA" están escritas
      // distinto en el Excel de origen y las dos tienen que entrar.
      const component = extranjeroComponent([catAlimentacionLima, catAlimentacionProv]);
      component.selectOtrosSubTipo('EXD');
      expect(component.otrosCategoryOptions.length).toBe(2);
    });

    it('sin ningún rubro asignado se cae al catálogo completo', () => {
      // Antes que dejar al colaborador sin poder registrar el gasto.
      const component = extranjeroComponent([catCombustible, catUtiles]);
      component.selectOtrosSubTipo('EXD');
      expect(component.otrosCategoryOptions.length).toBe(2);
    });

    it('no acota las categorías del resto de sub-tipos', () => {
      const component = extranjeroComponent();
      component.selectOtrosSubTipo('OT');
      expect(component.otrosCategoryOptions.length).toBe(catalogoCompleto.length);
      expect(component.otrosMonedaSimbolo).toBe('S/');
    });
  });

  describe('VD-104: referencia de la dirección guardada', () => {
    const loadSavedSheet = () => {
      invoicesService.getInvoiceById.and.returnValue(
        of({
          _id: 'inv1',
          expenseType: 'planilla_movilidad',
          proyectId: 'p1',
          categoryId: 'cat1',
          mobilityRows: [
            {
              fecha: '2026-02-01',
              total: 20,
              origen: 'Av. Javier Prado 123, Lima',
              destino: 'Aeropuerto Jorge Chávez, Callao',
              gestion: 'g1',
              origenCoords: { lat: -12.1, lng: -77.0 },
            },
          ],
        } as any)
      );
      const component = createComponent({ id: 'inv1' });
      component.ngOnInit();
      return component;
    };

    it('guarda la dirección cargada como referencia al editar', () => {
      const row = loadSavedSheet().mobilityRowsArray.at(0);
      expect(row.get('origenGuardado')?.value).toBe('Av. Javier Prado 123, Lima');
      expect(row.get('destinoGuardado')?.value).toBe('Aeropuerto Jorge Chávez, Callao');
    });

    it('retira la referencia si el buscador de Google sí mostró el valor', () => {
      const component = loadSavedSheet();

      component.onPlacePrefill(true, 0, 'origen');

      const row = component.mobilityRowsArray.at(0);
      expect(row.get('origenGuardado')?.value).toBe('');
      // El destino no se toca: cada campo reporta su propio volcado.
      expect(row.get('destinoGuardado')?.value).toBe('Aeropuerto Jorge Chávez, Callao');
    });

    it('mantiene la referencia si el buscador no pudo mostrar el valor', () => {
      const component = loadSavedSheet();

      component.onPlacePrefill(false, 0, 'destino');

      expect(component.mobilityRowsArray.at(0).get('destinoGuardado')?.value).toBe(
        'Aeropuerto Jorge Chávez, Callao'
      );
    });

    it('retira la referencia al escribir otra dirección', () => {
      const component = loadSavedSheet();

      component.onMobilityPlaceTyped(0, 'origen');

      expect(component.mobilityRowsArray.at(0).get('origenGuardado')?.value).toBe('');
    });

    it('retira la referencia al elegir una dirección del buscador', () => {
      const component = loadSavedSheet();

      component.onOrigenSelected(
        { address: 'Plaza San Martín, Lima', lat: -12.05, lng: -77.03 } as any,
        0
      );

      const row = component.mobilityRowsArray.at(0);
      expect(row.get('origen')?.value).toBe('Plaza San Martín, Lima');
      expect(row.get('origenGuardado')?.value).toBe('');
    });

    it('la fila nueva nace sin referencia (se escribe desde cero)', () => {
      const component = createComponent();
      component.addMobilityRow();
      const row = component.mobilityRowsArray.at(0);
      expect(row.get('origenGuardado')?.value).toBe('');
      expect(row.get('destinoGuardado')?.value).toBe('');
    });
  });

  describe('onMobilityPlaceTyped (VD-104: dirección editada a mano)', () => {
    it('descarta coordenadas y distancia cuando se reescribe el origen', () => {
      const component = createComponent();
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({
        origen: 'A', origenLat: -12.1, origenLng: -77.0,
        destino: 'B', destinoLat: -12.2, destinoLng: -77.1,
        distanciaKm: 5.4,
      });

      component.onMobilityPlaceTyped(0, 'origen');

      const row = component.mobilityRowsArray.at(0);
      expect(row.get('origenLat')?.value).toBeNull();
      expect(row.get('origenLng')?.value).toBeNull();
      expect(row.get('distanciaKm')?.value).toBeNull();
      // El destino no se toca.
      expect(row.get('destinoLat')?.value).toBe(-12.2);
    });

    it('no hace nada en una fila sin coordenadas', () => {
      const component = createComponent();
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({ origen: 'A', distanciaKm: 3 });

      component.onMobilityPlaceTyped(0, 'origen');

      expect(component.mobilityRowsArray.at(0).get('distanciaKm')?.value).toBe(3);
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
      (component as any).mobilityDailyLimitRaw = 15;
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
        subTipo: 'OT',
        total: 30,
        data: JSON.stringify({ description: 'old', foo: 'bar', subTipo: 'OT' }),
      });
      component.form.patchValue({ proyectId: 'p1', categoryId: 'cat1', totalOtros: 60, description: 'Peaje nuevo', fechaEmision: '2026-08-12' });
      component.update();

      const payload = invoicesService.updateInvoice.calls.mostRecent().args[1] as any;
      expect(payload.total).toBe(60);
      const data = JSON.parse(payload.data);
      expect(data.description).toBe('Peaje nuevo');
      expect(data.foo).toBe('bar');
    });

    it('al editar un AL manda la comida y la usa como descripción (VD-109)', () => {
      invoicesService.updateInvoice.and.returnValue(of({}));
      const component = setupEdit({
        _id: 'inv1',
        expenseType: 'otros_gastos',
        subTipo: 'AL',
        total: 20,
        tipoComida: 'desayuno',
        data: JSON.stringify({ description: 'Desayuno', subTipo: 'AL' }),
      });
      component.form.patchValue({
        proyectId: 'p1', categoryId: 'cat1', totalOtros: 12, tipoComida: 'desayuno',
        fechaEmision: '2026-08-12',
      });
      component.update();

      const payload = invoicesService.updateInvoice.calls.mostRecent().args[1] as any;
      expect(payload.tipoComida).toBe('desayuno');
      expect(payload.description).toBe('Desayuno');
    });

    it('al editar un AL manda la fecha del gasto corregida', () => {
      invoicesService.updateInvoice.and.returnValue(of({}));
      const component = setupEdit({
        _id: 'inv1',
        expenseType: 'otros_gastos',
        subTipo: 'AL',
        total: 20,
        tipoComida: 'desayuno',
        fechaEmision: '12/08/2026',
        data: JSON.stringify({ description: 'Desayuno', subTipo: 'AL', fechaEmision: '12/08/2026' }),
      });
      component.form.patchValue({
        proyectId: 'p1', categoryId: 'cat1', totalOtros: 12, tipoComida: 'desayuno',
        fechaEmision: '2026-08-05',
      });
      component.update();

      const payload = invoicesService.updateInvoice.calls.mostRecent().args[1] as any;
      expect(payload.fechaEmision).toBe('05/08/2026');
      expect(JSON.parse(payload.data).fechaEmision).toBe('05/08/2026');
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
  });

  describe('validación SUNAT en el registro de factura (VD-70)', () => {
    it('sunatIsValid solo es true con VALIDO_ACEPTADO', () => {
      const component = createComponent();
      component.sunatStatus.set('ERROR_SUNAT');
      expect(component.sunatIsValid()).toBeFalse();
      component.sunatStatus.set('NO_ENCONTRADO');
      expect(component.sunatIsValid()).toBeFalse();
      component.sunatStatus.set('VALIDO_ACEPTADO');
      expect(component.sunatIsValid()).toBeTrue();
    });

    it('confirmPostOcrReview NO crea la factura si SUNAT no validó', () => {
      const component = createComponent();
      (component as any).postOcrBaseInvoice = { data: '{}', total: 100 };
      (component as any).selectedFile = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
      component.form.patchValue({ comentario: 'gasto de prueba' });
      component.sunatStatus.set('ERROR_SUNAT');

      component.confirmPostOcrReview();

      expect(invoicesService.createInvoice).not.toHaveBeenCalled();
      expect(notificationService.show).toHaveBeenCalledWith(
        jasmine.stringMatching(/SUNAT/i),
        'error'
      );
    });

    it('confirmPostOcrReview sube el archivo y crea la factura cuando SUNAT validó (VD-70 B)', () => {
      const component = createComponent();
      (component as any).postOcrBaseInvoice = { data: '{}', total: 100 };
      (component as any).selectedFile = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
      component.form.patchValue({ proyectId: 'p1', categoryId: 'c1', comentario: 'gasto de prueba' });
      component.sunatStatus.set('VALIDO_ACEPTADO');

      component.confirmPostOcrReview();

      // El archivo se sube recién ahora (no en el escaneo) y luego se crea el gasto.
      expect(uploadService.uploadFile).toHaveBeenCalled();
      expect(invoicesService.createInvoice).toHaveBeenCalled();
      const payload = invoicesService.createInvoice.calls.mostRecent().args[0] as any;
      expect(payload.imageUrl).toBe('http://file-url');
    });

    it('revalidateSunat actualiza el estado con el endpoint stateless (VD-70 B)', () => {
      const component = createComponent();
      (component as any).postOcrBaseInvoice = { data: '{}', total: 100 };
      component.form.patchValue({
        rucEmisor: '20123456789', serie: 'F001', correlativo: '123', fechaEmision: '2026-01-01',
      });
      invoicesService.validateSunatStateless.and.returnValue(of({ status: 'VALIDO_ACEPTADO' } as any));

      component.revalidateSunat();

      expect(invoicesService.validateSunatStateless).toHaveBeenCalled();
      expect(component.sunatStatus()).toBe('VALIDO_ACEPTADO');
      expect(component.sunatIsValid()).toBeTrue();
    });

    it('revalidateSunat envía el tipo de comprobante seleccionado (VD-70)', () => {
      const component = createComponent();
      (component as any).postOcrBaseInvoice = { data: '{}', total: 100 };
      component.form.patchValue({
        rucEmisor: '20123456789', serie: 'B001', correlativo: '123',
        fechaEmision: '2026-01-01', tipoComprobante: 'Boleta',
      });
      invoicesService.validateSunatStateless.and.returnValue(of({ status: 'VALIDO_ACEPTADO' } as any));

      component.revalidateSunat();

      const payload = invoicesService.validateSunatStateless.calls.mostRecent().args[0] as any;
      expect(payload.tipoComprobante).toBe('Boleta');
    });

    it('revalidateSunat envía el monto corregido por el usuario, no el del OCR', () => {
      const component = createComponent();
      (component as any).postOcrBaseInvoice = { data: '{}', total: 346 };
      component.ocrTotalAmount.set(346);
      component.editedOcrTotal.set(336);
      component.form.patchValue({
        rucEmisor: '20612862401', serie: 'F001', correlativo: '00002412', fechaEmision: '2026-08-14',
      });
      invoicesService.validateSunatStateless.and.returnValue(of({ status: 'VALIDO_ACEPTADO' } as any));

      component.revalidateSunat();

      const payload = invoicesService.validateSunatStateless.calls.mostRecent().args[0] as any;
      expect(payload.montoTotal).toBe(336);
    });

    it('onSerieChange deriva el tipo del prefijo de la serie (F/B) (VD-70)', () => {
      const component = createComponent();

      component.form.get('serie')?.setValue('FS10');
      component.onSerieChange();
      expect(component.form.get('tipoComprobante')?.value).toBe('Factura');

      component.form.get('serie')?.setValue('B001');
      component.onSerieChange();
      expect(component.form.get('tipoComprobante')?.value).toBe('Boleta');
    });

    it('onSerieChange no cambia el tipo si la serie no empieza con F ni B', () => {
      const component = createComponent();
      component.form.get('tipoComprobante')?.setValue('Boleta');
      component.form.get('serie')?.setValue('001');
      component.onSerieChange();
      // Serie numérica (físico): se conserva el tipo actual.
      expect(component.form.get('tipoComprobante')?.value).toBe('Boleta');
    });
  });

  describe('openInvoice — Ver en pantalla completa', () => {
    it('abre la URL cruda del blob, no el SafeUrl (evita el redirect a login)', () => {
      const component = createComponent();
      const openSpy = spyOn(window, 'open').and.stub();
      component.previewObjectUrl = 'blob:http://localhost/abc-123';

      component.openInvoice();

      expect(openSpy).toHaveBeenCalledWith('blob:http://localhost/abc-123', '_blank', 'noopener,noreferrer');
    });

    it('no abre nada si no hay vista previa', () => {
      const component = createComponent();
      const openSpy = spyOn(window, 'open').and.stub();
      component.previewObjectUrl = null;

      component.openInvoice();

      expect(openSpy).not.toHaveBeenCalled();
    });

    it('isMobilityRowDateOverLimit / hasAnyMobilityLimitExceeded reflect the configured daily limit', () => {
      const component = createComponent();
      (component as any).mobilityDailyLimitRaw = 20;
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
      // Vuelve al detalle marcando de qué pestaña salió, para que el "Volver"
      // del detalle regrese a la misma lista y no a la primera (33c1c3f).
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'r1', 'detalle'], {
        queryParams: { tab: 'viaticos' },
      });
    });

    it('marca la pestaña de caja chica al volver al detalle de una caja chica', () => {
      expenseReportsService.findOne.and.returnValue(
        of({ _id: 'r1', projectId: 'p1', isCajaChica: true } as any)
      );
      const component = createComponent({}, { rendicionId: 'r1' });
      component.ngOnInit();
      component.back();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'r1', 'detalle'], {
        queryParams: { tab: 'caja-chica' },
      });
    });

    it('marca la pestaña de directas al volver al detalle de una directa', () => {
      expenseReportsService.findOne.and.returnValue(
        of({ _id: 'r1', projectId: 'p1', isDirecta: true } as any)
      );
      const component = createComponent({}, { rendicionId: 'r1' });
      component.ngOnInit();
      component.back();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones', 'r1', 'detalle'], {
        queryParams: { tab: 'directas' },
      });
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

    // La OT del viático puede no estar entre las opciones (otro centro de costo o
    // desactivada): sin añadirla, el selector mostraría el placeholder y el campo
    // parecería vacío aunque la rendición sí tenga OT.
    it('shows the inherited viatico OT even when it is not among the cost center options', () => {
      ordenTrabajoService.getAll.and.returnValue(
        of([{ _id: 'otP1', nombre: 'OT-OP-001', costCenterId: 'p1', isActive: true } as any])
      );
      expenseReportsService.findOne.and.returnValue(
        of({
          _id: 'r1',
          projectId: 'p1',
          type: 'viatico',
          viaticoOrdenTrabajoId: { _id: 'otADM', nombre: 'OT-ADM-001', costCenterId: 'p9' },
          expenseIds: [],
          settlement: null,
        } as any)
      );
      const component = createComponent({}, { rendicionId: 'r1', tipo: 'planilla_movilidad' });
      component.ngOnInit();

      expect(component.viaticoOrdenTrabajoInherited()).toBeTrue();
      expect(component.form.get('ordenTrabajoId')?.value).toBe('otADM');
      expect(component.ordenTrabajoOptions).toContain(
        jasmine.objectContaining({ value: 'otADM', label: 'OT-ADM-001' })
      );
    });

    // La OT es opcional al solicitar el viático: si la solicitud no la lleva, la
    // planilla de movilidad no puede exigir una que no existe.
    it('does not ask for the OT when the viatico has none', () => {
      expenseReportsService.findOne.and.returnValue(
        of({
          _id: 'r1',
          projectId: 'p1',
          type: 'viatico',
          expenseIds: [],
          settlement: null,
        } as any)
      );
      invoicesService.createMobilitySheet.and.returnValue(of({ _id: 'e1' } as any));
      const component = createComponent({}, { rendicionId: 'r1', tipo: 'planilla_movilidad' });
      component.ngOnInit();
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.form.patchValue({ categoryId: 'catMov' });
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({
        fecha: '2026-02-01',
        total: 10,
        origen: 'A',
        destino: 'B',
        gestion: 'g1',
      });

      component.saveMobilitySheet();

      expect(component.viaticoSinOrdenTrabajo()).toBeTrue();
      expect(invoicesService.createMobilitySheet).toHaveBeenCalled();
      const payload = invoicesService.createMobilitySheet.calls.mostRecent().args[0] as any;
      expect(payload.ordenTrabajoId).toBeUndefined();
      expect(notificationService.show).toHaveBeenCalledWith(
        'Planilla guardada correctamente',
        'success'
      );
    });

    // La OT es opcional al crear la rendición directa: si no la lleva, tampoco se
    // ofrece elegirla por comprobante.
    it('does not ask for the OT when the rendicion directa has none', () => {
      expenseReportsService.findOne.and.returnValue(
        of({
          _id: 'r1',
          projectId: 'p1',
          isDirecta: true,
          expenseIds: [],
          settlement: null,
        } as any)
      );
      invoicesService.createMobilitySheet.and.returnValue(of({ _id: 'e1' } as any));
      const component = createComponent({}, { rendicionId: 'r1', tipo: 'planilla_movilidad' });
      component.ngOnInit();
      component.categories = [{ _id: 'catMov', name: 'Planilla de movilidad' } as any];
      component.form.patchValue({ categoryId: 'catMov' });
      component.addMobilityRow();
      component.mobilityRowsArray.at(0).patchValue({
        fecha: '2026-02-01',
        total: 10,
        proyectId: 'p1',
        categoryId: 'catMov',
        origen: 'A',
        destino: 'B',
        gestion: 'g1',
      });

      component.saveMobilitySheet();

      expect(component.directaOrdenTrabajoInherited()).toBeFalse();
      expect(component.directaSinOrdenTrabajo()).toBeTrue();
      expect(invoicesService.createMobilitySheet).toHaveBeenCalled();
      const payload = invoicesService.createMobilitySheet.calls.mostRecent().args[0] as any;
      expect(payload.ordenTrabajoId).toBeUndefined();
      expect(notificationService.show).toHaveBeenCalledWith(
        'Planilla guardada correctamente',
        'success'
      );
    });

    it('keeps asking for the OT when the rendicion directa has one to inherit', () => {
      expenseReportsService.findOne.and.returnValue(
        of({
          _id: 'r1',
          projectId: 'p1',
          isDirecta: true,
          directaOrdenTrabajoId: { _id: 'ot1', nombre: 'OT-LIM-002' },
          expenseIds: [],
          settlement: null,
        } as any)
      );
      const component = createComponent({}, { rendicionId: 'r1', tipo: 'planilla_movilidad' });
      component.ngOnInit();

      expect(component.directaSinOrdenTrabajo()).toBeFalse();
      expect(component.form.get('ordenTrabajoId')?.value).toBe('ot1');
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
