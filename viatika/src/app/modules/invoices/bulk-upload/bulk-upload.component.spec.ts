import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { BulkUploadComponent, BulkInvoiceItem } from './bulk-upload.component';
import { InvoicesService } from '../services/invoices.service';
import { NotificationService } from '../../../services/notification.service';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { ExpenseService } from '../../../services/expense.service';
import { UserStateService } from '../../../services/user-state.service';
import { UploadService } from '../../../services/upload.service';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';

describe('BulkUploadComponent', () => {
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let router: jasmine.SpyObj<Router>;
  let notificationService: jasmine.SpyObj<NotificationService>;
  let expenseReportsService: jasmine.SpyObj<ExpenseReportsService>;
  let expenseService: jasmine.SpyObj<ExpenseService>;
  let userStateService: jasmine.SpyObj<UserStateService>;
  let uploadService: jasmine.SpyObj<UploadService>;
  let ordenTrabajoService: jasmine.SpyObj<OrdenTrabajoService>;

  /** Respuesta típica del escaneo: OCR completo y SUNAT aceptando. */
  const scanAceptado = {
    data: JSON.stringify({
      rucEmisor: '20519875411',
      razonSocial: 'HOTEL BOLOGNESI TACNA S.A.C.',
      serie: 'F001',
      correlativo: '0004512',
      fechaEmision: '24/08/2026',
      tipoComprobante: 'Factura',
      comentario: 'Hospedaje',
      moneda: 'PEN',
      sunatValidation: { status: 'VALIDO_ACEPTADO' },
    }),
    total: 285,
    status: 'sunat_valid',
  };

  function archivo(nombre = 'factura.jpg', tipo = 'image/jpeg', bytes = 1024): File {
    const file = new File(['x'], nombre, { type: tipo });
    Object.defineProperty(file, 'size', { value: bytes });
    return file;
  }

  beforeEach(() => {
    invoicesService = jasmine.createSpyObj('InvoicesService', [
      'getCategories',
      'getProjects',
      'analyzeInvoice',
      'analyzePdf',
      'validateSunatStateless',
      'createInvoice',
    ]);
    invoicesService.getCategories.and.returnValue(of([]));
    invoicesService.getProjects.and.returnValue(of([]));
    invoicesService.analyzeInvoice.and.returnValue(of(scanAceptado as any));
    invoicesService.analyzePdf.and.returnValue(of(scanAceptado as any));
    invoicesService.validateSunatStateless.and.returnValue(
      of({ status: 'VALIDO_ACEPTADO' } as any)
    );
    invoicesService.createInvoice.and.returnValue(of({ _id: 'inv1' } as any));

    router = jasmine.createSpyObj('Router', ['navigate']);
    notificationService = jasmine.createSpyObj('NotificationService', ['show']);

    expenseReportsService = jasmine.createSpyObj('ExpenseReportsService', [
      'findOne',
      'findCajaChicaCentroCosto',
    ]);
    expenseReportsService.findOne.and.returnValue(
      of({ _id: 'r1', projectId: 'p1' } as any)
    );
    expenseReportsService.findCajaChicaCentroCosto.and.returnValue(
      of({ projectId: 'p9' } as any)
    );

    expenseService = jasmine.createSpyObj('ExpenseService', ['submitMyDirectExpenses']);
    expenseService.submitMyDirectExpenses.and.returnValue(
      of({ reportId: 'r1', expensesSubmitted: 1 })
    );

    userStateService = jasmine.createSpyObj('UserStateService', ['isContabilidad']);
    userStateService.isContabilidad.and.returnValue(false);

    uploadService = jasmine.createSpyObj('UploadService', ['upload', 'uploadFile']);
    uploadService.upload.and.returnValue(of({ url: 'http://firma-url' }));
    uploadService.uploadFile.and.returnValue({
      uploadProgress$: of(100),
      downloadUrl$: of('http://file-url'),
    } as any);

    ordenTrabajoService = jasmine.createSpyObj('OrdenTrabajoService', ['getAll']);
    ordenTrabajoService.getAll.and.returnValue(of([]));
  });

  function createComponent(queryParams: any = {}): BulkUploadComponent {
    const activatedRouteStub: any = {
      snapshot: { params: {}, queryParamMap: convertToParamMap(queryParams) },
      queryParamMap: of(convertToParamMap(queryParams)),
    };

    TestBed.configureTestingModule({
      imports: [BulkUploadComponent],
      providers: [
        { provide: InvoicesService, useValue: invoicesService },
        { provide: Router, useValue: router },
        { provide: NotificationService, useValue: notificationService },
        { provide: ExpenseReportsService, useValue: expenseReportsService },
        { provide: ExpenseService, useValue: expenseService },
        { provide: UserStateService, useValue: userStateService },
        { provide: UploadService, useValue: uploadService },
        { provide: OrdenTrabajoService, useValue: ordenTrabajoService },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    });

    const fixture = TestBed.createComponent(BulkUploadComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();
    return component;
  }

  /** Mete archivos en el lote sin pasar por el input del navegador. */
  function cargar(component: BulkUploadComponent, files: File[]): void {
    component.onFilesDropped(files);
  }

  it('lee todos los archivos del lote de una sola vez', () => {
    const component = createComponent({ rendicionId: 'r1' });

    cargar(component, [archivo('a.jpg'), archivo('b.jpg'), archivo('c.jpg')]);

    expect(invoicesService.analyzeInvoice).toHaveBeenCalledTimes(3);
    expect(component.items.length).toBe(3);
    expect(component.items.every((i) => i.state === 'leido')).toBeTrue();
  });

  it('manda los PDF al endpoint de PDF y las imágenes al de imagen', () => {
    const component = createComponent({ rendicionId: 'r1' });

    cargar(component, [archivo('a.pdf', 'application/pdf'), archivo('b.jpg')]);

    expect(invoicesService.analyzePdf).toHaveBeenCalledTimes(1);
    expect(invoicesService.analyzeInvoice).toHaveBeenCalledTimes(1);
  });

  it('un archivo ilegible no detiene al resto del lote', () => {
    const component = createComponent({ rendicionId: 'r1' });
    invoicesService.analyzeInvoice.and.returnValues(
      throwError(() => ({ error: { message: 'OCR caído' } })),
      of(scanAceptado as any)
    );

    cargar(component, [archivo('a.jpg'), archivo('b.jpg')]);

    expect(component.items[0].state).toBe('error_lectura');
    expect(component.items[0].errorMessage).toBe('OCR caído');
    expect(component.items[1].state).toBe('leido');
  });

  it('un PDF se puede abrir aunque no tenga vista previa incrustada', () => {
    const component = createComponent({ rendicionId: 'r1' });
    spyOn(window, 'open');

    cargar(component, [archivo('rendicion.pdf', 'application/pdf')]);
    const item = component.items[0];

    expect(item.isPdf).toBeTrue();
    expect(item.previewUrl).toBeNull();
    expect(item.objectUrl).toBeTruthy();

    component.abrirArchivo(item);
    expect(window.open).toHaveBeenCalledWith(
      item.objectUrl!,
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('descarta los archivos que pasan del tope de tamaño y avisa', () => {
    const component = createComponent({ rendicionId: 'r1' });

    cargar(component, [archivo('gigante.jpg', 'image/jpeg', 11 * 1024 * 1024)]);

    expect(component.items.length).toBe(0);
    expect(notificationService.show).toHaveBeenCalledWith(
      jasmine.stringMatching(/más de 10 MB/),
      'error'
    );
  });

  it('corta el lote en el máximo de archivos y avisa cuántos quedaron fuera', () => {
    const component = createComponent({ rendicionId: 'r1' });
    const muchos = Array.from({ length: component.MAX_ARCHIVOS + 3 }, (_, i) =>
      archivo(`f${i}.jpg`)
    );

    cargar(component, muchos);

    expect(component.items.length).toBe(component.MAX_ARCHIVOS);
    expect(notificationService.show).toHaveBeenCalledWith(
      jasmine.stringMatching(/quedaron fuera/),
      'warning'
    );
  });

  describe('qué se pide por comprobante', () => {
    it('en solicitud de fondos solo falta la categoría', () => {
      const component = createComponent({ rendicionId: 'r1' });
      cargar(component, [archivo()]);
      const item = component.items[0];

      expect(component.faltaEn(item)).toBe('Falta la categoría');

      item.categoryId = 'cat1';
      expect(component.estaListo(item)).toBeTrue();
    });

    it('en rendición directa tampoco pide centro de costo por comprobante', () => {
      expenseReportsService.findOne.and.returnValue(
        of({ _id: 'r1', projectId: 'p1', isDirecta: true } as any)
      );
      const component = createComponent({ rendicionId: 'r1' });
      cargar(component, [archivo()]);
      const item = component.items[0];
      item.categoryId = 'cat1';

      expect(component.isCajaChica()).toBeFalse();
      expect(component.estaListo(item)).toBeTrue();
    });

    it('en caja chica exige además la firma del comprobante', () => {
      expenseReportsService.findOne.and.returnValue(
        of({ _id: 'r1', isCajaChica: true } as any)
      );
      const component = createComponent({ rendicionId: 'r1' });
      cargar(component, [archivo()]);
      const item = component.items[0];
      item.categoryId = 'cat1';

      expect(component.isCajaChica()).toBeTrue();
      expect(component.faltaEn(item)).toBe('Falta la firma');

      item.firmaUrl = 'http://firma';
      expect(component.estaListo(item)).toBeTrue();
    });

    it('caja chica precarga el centro de costo de la caja en cada comprobante', () => {
      expenseReportsService.findOne.and.returnValue(
        of({ _id: 'r1', isCajaChica: true } as any)
      );
      const component = createComponent({ rendicionId: 'r1' });

      cargar(component, [archivo()]);

      expect(component.items[0].proyectId).toBe('p9');
    });

    it('un comprobante que SUNAT no aceptó no está listo', () => {
      const component = createComponent({ rendicionId: 'r1' });
      cargar(component, [archivo()]);
      const item = component.items[0];
      item.categoryId = 'cat1';
      item.sunatStatus = 'NO_ENCONTRADO';

      expect(component.faltaEn(item)).toBe('SUNAT no lo validó');
    });

    it('sin comentario no está listo: el backend lo exige igual que en la carga suelta', () => {
      const component = createComponent({ rendicionId: 'r1' });
      cargar(component, [archivo()]);
      const item = component.items[0];
      item.categoryId = 'cat1';
      item.comentario = '   ';

      expect(component.faltaEn(item)).toBe('Falta el comentario');
    });
  });

  describe('repetidos dentro del lote', () => {
    it('marca la segunda copia y deja limpia la primera', () => {
      const component = createComponent({ rendicionId: 'r1' });

      cargar(component, [archivo('foto1.jpg'), archivo('foto2.jpg')]);

      expect(component.items[0].duplicadoDe).toBe('');
      expect(component.items[1].duplicadoDe).toBe('foto1.jpg');
      expect(component.repetidos).toBe(1);
    });

    it('el repetido no se puede guardar ni entra en el lote a guardar', () => {
      const component = createComponent({ rendicionId: 'r1' });
      cargar(component, [archivo('foto1.jpg'), archivo('foto2.jpg')]);
      component.items.forEach((i) => (i.categoryId = 'cat1'));

      expect(component.faltaEn(component.items[1])).toBe('Repetido en el lote');
      expect(component.listos.length).toBe(1);

      component.guardarListos();
      expect(invoicesService.createInvoice).toHaveBeenCalledTimes(1);
    });

    it('avisa al terminar de leer, no al guardar', () => {
      const component = createComponent({ rendicionId: 'r1' });

      cargar(component, [archivo('foto1.jpg'), archivo('foto2.jpg')]);

      expect(notificationService.show).toHaveBeenCalledWith(
        jasmine.stringMatching(/ya está en el lote/),
        'warning'
      );
    });

    it('corregir el correlativo mal leído deshace la marca', () => {
      const component = createComponent({ rendicionId: 'r1' });
      cargar(component, [archivo('foto1.jpg'), archivo('foto2.jpg')]);
      const copia = component.items[1];

      copia.correlativo = '0004513';
      component.onIdentidadChange();

      expect(copia.duplicadoDe).toBe('');
      expect(component.repetidos).toBe(0);
    });

    it('quitar el original libera a la copia', () => {
      const component = createComponent({ rendicionId: 'r1' });
      cargar(component, [archivo('foto1.jpg'), archivo('foto2.jpg')]);

      component.quitar(component.items[0]);

      expect(component.items.length).toBe(1);
      expect(component.items[0].duplicadoDe).toBe('');
    });

    it('sin RUC, serie o correlativo no se declara repetido: no hay con qué compararlos', () => {
      const component = createComponent({ rendicionId: 'r1' });
      invoicesService.analyzeInvoice.and.returnValue(
        of({
          data: JSON.stringify({ comentario: 'ilegible' }),
          total: 0,
          status: 'pending',
        } as any)
      );

      cargar(component, [archivo('a.jpg'), archivo('b.jpg')]);

      expect(component.repetidos).toBe(0);
    });

    it('un comprobante ya guardado sigue bloqueando a su copia', () => {
      const component = createComponent({ rendicionId: 'r1' });
      cargar(component, [archivo('foto1.jpg')]);
      component.items[0].categoryId = 'cat1';
      component.guardarListos();
      expect(component.guardados.length).toBe(1);

      cargar(component, [archivo('foto1-otra-vez.jpg')]);

      expect(component.items[1].duplicadoDe).toBe('foto1.jpg');
    });
  });

  it('asigna la categoría a todos los seleccionados de una vez', () => {
    const component = createComponent({ rendicionId: 'r1' });
    cargar(component, [archivo('a.jpg'), archivo('b.jpg'), archivo('c.jpg')]);
    component.items[0].selected = true;
    component.items[2].selected = true;

    component.asignarASeleccionados('categoryId', 'cat9');

    expect(component.items[0].categoryId).toBe('cat9');
    expect(component.items[1].categoryId).toBe('');
    expect(component.items[2].categoryId).toBe('cat9');
    expect(component.seleccionados.length).toBe(0);
  });

  it('revalida con SUNAT los datos corregidos del comprobante', () => {
    const component = createComponent({ rendicionId: 'r1' });
    cargar(component, [archivo()]);
    const item = component.items[0];
    item.sunatStatus = 'NO_ENCONTRADO';
    item.correlativo = '0000912';

    component.revalidate(item);

    expect(invoicesService.validateSunatStateless).toHaveBeenCalledWith(
      jasmine.objectContaining({
        correlativo: '0000912',
        fechaEmision: '24/08/2026',
      })
    );
    expect(item.sunatStatus).toBe('VALIDO_ACEPTADO');
  });

  it('no llama a SUNAT si faltan datos para consultar', () => {
    const component = createComponent({ rendicionId: 'r1' });
    cargar(component, [archivo()]);
    const item = component.items[0];
    item.correlativo = '';
    invoicesService.validateSunatStateless.calls.reset();

    component.revalidate(item);

    expect(invoicesService.validateSunatStateless).not.toHaveBeenCalled();
    expect(notificationService.show).toHaveBeenCalledWith(
      jasmine.stringMatching(/Completa RUC, serie, correlativo y fecha/),
      'error'
    );
  });

  describe('guardado', () => {
    /**
     * Lote de comprobantes DISTINTOS y listos. Cada lectura devuelve su propio
     * correlativo: con el mismo en todos, el control de repetidos dejaría fuera
     * a todos menos al primero.
     */
    function loteListo(component: BulkUploadComponent, cuantos: number): BulkInvoiceItem[] {
      let n = 0;
      invoicesService.analyzeInvoice.and.callFake(() => {
        const datos = JSON.parse(scanAceptado.data);
        datos.correlativo = `000451${n++}`;
        return of({ ...scanAceptado, data: JSON.stringify(datos) } as any);
      });
      cargar(
        component,
        Array.from({ length: cuantos }, (_, i) => archivo(`f${i}.jpg`))
      );
      component.items.forEach((i) => (i.categoryId = 'cat1'));
      return component.items;
    }

    it('guarda solo los listos y deja los pendientes en la lista', () => {
      const component = createComponent({ rendicionId: 'r1' });
      loteListo(component, 3);
      // El del medio queda rechazado por SUNAT.
      component.items[1].sunatStatus = 'NO_ENCONTRADO';

      component.guardarListos();

      expect(invoicesService.createInvoice).toHaveBeenCalledTimes(2);
      expect(component.items.length).toBe(3);
      expect(component.guardados.length).toBe(2);
      expect(component.items[1].state).toBe('leido');
    });

    it('manda el centro de costo de la rendición y la categoría de cada comprobante', () => {
      const component = createComponent({ rendicionId: 'r1' });
      loteListo(component, 1);
      component.items[0].categoryId = 'cat7';

      component.guardarListos();

      expect(invoicesService.createInvoice).toHaveBeenCalledWith(
        jasmine.objectContaining({
          proyectId: 'p1',
          categoryId: 'cat7',
          expenseReportId: 'r1',
          total: 285,
          fechaEmision: '24/08/2026',
        })
      );
    });

    it('en caja chica manda el centro de costo, la OT y la firma del comprobante', () => {
      expenseReportsService.findOne.and.returnValue(
        of({ _id: 'r1', isCajaChica: true } as any)
      );
      const component = createComponent({ rendicionId: 'r1' });
      loteListo(component, 1);
      const item = component.items[0];
      item.proyectId = 'p3';
      item.ordenTrabajoId = 'ot3';
      item.firmaUrl = 'http://firma';

      component.guardarListos();

      expect(invoicesService.createInvoice).toHaveBeenCalledWith(
        jasmine.objectContaining({
          proyectId: 'p3',
          ordenTrabajoId: 'ot3',
          firmaUrl: 'http://firma',
        })
      );
    });

    it('un fallo al guardar deja ese comprobante en la lista con su error', () => {
      const component = createComponent({ rendicionId: 'r1' });
      loteListo(component, 2);
      invoicesService.createInvoice.and.returnValues(
        throwError(() => ({ error: { message: 'Comprobante duplicado' } })),
        of({ _id: 'inv2' } as any)
      );

      component.guardarListos();

      expect(component.items[0].state).toBe('leido');
      expect(component.items[0].errorMessage).toBe('Comprobante duplicado');
      expect(component.guardados.length).toBe(1);
    });

    it('vuelve a la rendición cuando el lote queda sin pendientes', () => {
      const component = createComponent({ rendicionId: 'r1' });
      loteListo(component, 1);

      component.guardarListos();

      expect(router.navigate).toHaveBeenCalledWith(
        ['/mis-rendiciones', 'r1', 'detalle'],
        { queryParams: { tab: 'viaticos' } }
      );
    });

    it('la rendición directa sin rendición previa se autoenvía a contabilidad', () => {
      const component = createComponent({ mode: 'directa' });
      loteListo(component, 1);
      component.loteProyectId = 'p5';

      component.guardarListos();

      expect(expenseService.submitMyDirectExpenses).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/mis-rendiciones'], {
        queryParams: { tab: 'directas' },
      });
    });

    it('sin centro de costo del lote no hay nada listo para guardar', () => {
      const component = createComponent({ mode: 'directa' });
      loteListo(component, 1);

      expect(component.faltaEn(component.items[0])).toBe(
        'Falta el centro de costo del lote'
      );
      expect(component.listos.length).toBe(0);
    });
  });
});
