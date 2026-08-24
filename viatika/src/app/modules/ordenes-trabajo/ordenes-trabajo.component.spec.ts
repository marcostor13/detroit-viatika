import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { OrdenesTrabajoComponent } from './ordenes-trabajo.component';
import { OrdenTrabajoService } from '../../services/orden-trabajo.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { UserStateService } from '../../services/user-state.service';
import { InvoicesService } from '../invoices/services/invoices.service';
import { IOrdenTrabajo } from '../../interfaces/orden-trabajo.interface';

describe('OrdenesTrabajoComponent', () => {
  let ordenTrabajoService: jasmine.SpyObj<OrdenTrabajoService>;
  let invoicesService: jasmine.SpyObj<InvoicesService>;
  let notificationService: jasmine.SpyObj<NotificationService>;

  const cc123 = { _id: 'cc123', code: '123', name: 'LIMA - SERVICIO MINERIA' } as any;
  const cc223 = { _id: 'cc223', code: '223', name: 'ANTAMINA - SERVICIO MINERIA' } as any;

  function createComponent() {
    ordenTrabajoService = jasmine.createSpyObj('OrdenTrabajoService', [
      'getAllPaginated',
      'getAll',
      'delete',
      'importFromExcel',
    ]);
    ordenTrabajoService.getAllPaginated.and.returnValue(
      of({ data: [], total: 0, page: 1, pages: 0, limit: 20 })
    );
    ordenTrabajoService.getAll.and.returnValue(of([]));
    ordenTrabajoService.importFromExcel.and.returnValue(
      of({ created: 0, updated: 0, unchanged: 0, errors: [], rows: [], dryRun: false })
    );

    invoicesService = jasmine.createSpyObj('InvoicesService', ['getProjects']);
    invoicesService.getProjects.and.returnValue(of([cc123, cc223]));

    notificationService = jasmine.createSpyObj('NotificationService', ['show']);

    TestBed.configureTestingModule({
      imports: [OrdenesTrabajoComponent],
      providers: [
        { provide: OrdenTrabajoService, useValue: ordenTrabajoService },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: NotificationService, useValue: notificationService },
        { provide: ConfirmationService, useValue: jasmine.createSpyObj('ConfirmationService', ['confirm']) },
        {
          provide: UserStateService,
          useValue: jasmine.createSpyObj('UserStateService', ['getUser'], {}),
        },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
      ],
    });

    const component = TestBed.createComponent(OrdenesTrabajoComponent).componentInstance;
    component.centrosCosto.set([cc123, cc223]);
    return component;
  }

  // VD-101: el Excel baja con las OT que ya existen y con las mismas tres cosas
  // que pide el formulario de alta: nombre completo, centros de costo y activo.
  describe('Excel de órdenes de trabajo', () => {
    it('arma una fila por OT con el nombre completo y los códigos de sus centros', () => {
      const component = createComponent();
      const ordenes: IOrdenTrabajo[] = [
        { nombre: 'LIM-SMI-1463-G', costCenterId: cc123, costCenterIds: [cc123, cc223], isActive: true },
      ];

      expect(component['filasParaExcel'](ordenes)).toEqual([
        ['LIM-SMI-1463-G', '123, 223', 'Sí'],
      ]);
    });

    it('marca "No" en Activo cuando la OT está desactivada', () => {
      const component = createComponent();
      const ordenes: IOrdenTrabajo[] = [
        { nombre: 'LIM-SMI-1', costCenterId: cc123, costCenterIds: [cc123], isActive: false },
      ];

      expect(component['filasParaExcel'](ordenes)[0][2]).toBe('No');
    });

    it('no parte el nombre: va tal cual, siga o no la nomenclatura de Detroit', () => {
      const component = createComponent();
      const ordenes: IOrdenTrabajo[] = [
        { nombre: 'TALLER', costCenterId: cc123, costCenterIds: [cc123] },
      ];

      expect(component['filasParaExcel'](ordenes)).toEqual([['TALLER', '123', 'Sí']]);
    });

    it('sin OT cargadas deja una fila de ejemplo', () => {
      const component = createComponent();
      expect(component['filasParaExcel']([])).toEqual([
        ['LIM-SMI-1463-G', '123', 'Sí'],
      ]);
    });

    it('pide todas las OT al servidor al descargar', async () => {
      const component = createComponent();
      await component.downloadTemplate();
      expect(ordenTrabajoService.getAll).toHaveBeenCalled();
      expect(component.downloadingTemplate()).toBeFalse();
    });
  });

  // Carga masiva con confirmación: elegir el archivo solo pide el plan (dryRun);
  // nada se escribe hasta que el usuario acepta en la revisión.
  describe('revisión antes de cargar', () => {
    const archivo = () =>
      ({ target: { files: [new File([''], 'ot.xlsx')] } }) as unknown as Event;

    const plan = {
      created: 1,
      updated: 1,
      unchanged: 0,
      errors: [{ row: 4, reason: 'Centro de costo "NO" no encontrado en esta empresa' }],
      rows: [
        { row: 2, nombre: 'NUEVA-1', accion: 'crear', detalle: 'Centros de costo: 123 · Activa' },
        { row: 3, nombre: 'LIM-SMI-1', accion: 'actualizar', detalle: 'Estado: Activa → Inactiva' },
        { row: 4, nombre: 'MALA', accion: 'error', reason: 'Centro de costo "NO" no encontrado en esta empresa' },
      ],
      dryRun: true,
    };

    it('al elegir el archivo pide el plan en dryRun y no carga nada', () => {
      const component = createComponent();
      ordenTrabajoService.importFromExcel.and.returnValue(of(plan as any));

      component.onFileSelected(archivo());

      expect(ordenTrabajoService.importFromExcel).toHaveBeenCalledWith(
        jasmine.any(File),
        { dryRun: true }
      );
      expect(component.importPreview()?.rows.length).toBe(3);
      expect(component.importResult()).toBeNull();
      expect(notificationService.show).not.toHaveBeenCalled();
    });

    it('el chip de una acción filtra la tabla, y volver a pulsarlo la restaura', () => {
      const component = createComponent();
      ordenTrabajoService.importFromExcel.and.returnValue(of(plan as any));
      component.onFileSelected(archivo());

      component.toggleFiltroAccion('error');

      expect(component.filasVisibles().map((f) => f.row)).toEqual([4]);
      expect(component.hayFiltroActivo()).toBeTrue();

      component.toggleFiltroAccion('error');

      expect(component.filasVisibles().length).toBe(3);
      expect(component.hayFiltroActivo()).toBeFalse();
    });

    it('el contador de cada chip sale del plan completo', () => {
      const component = createComponent();
      ordenTrabajoService.importFromExcel.and.returnValue(of(plan as any));
      component.onFileSelected(archivo());

      expect(component.conteoAccion('crear')).toBe(1);
      expect(component.conteoAccion('actualizar')).toBe(1);
      expect(component.conteoAccion('sin-cambios')).toBe(0);
      expect(component.conteoAccion('error')).toBe(1);
    });

    it('el buscador encuentra por nombre y por motivo del error', () => {
      const component = createComponent();
      ordenTrabajoService.importFromExcel.and.returnValue(of(plan as any));
      component.onFileSelected(archivo());

      component.busquedaPreview.set('nueva');
      expect(component.filasVisibles().map((f) => f.nombre)).toEqual(['NUEVA-1']);

      component.busquedaPreview.set('no encontrado');
      expect(component.filasVisibles().map((f) => f.row)).toEqual([4]);

      component.busquedaPreview.set('LIM-SMI');
      expect(component.filasVisibles().map((f) => f.row)).toEqual([3]);
    });

    it('el filtro y el buscador se combinan', () => {
      const component = createComponent();
      ordenTrabajoService.importFromExcel.and.returnValue(of(plan as any));
      component.onFileSelected(archivo());

      component.toggleFiltroAccion('crear');
      component.busquedaPreview.set('LIM');

      expect(component.filasVisibles()).toEqual([]);

      component.limpiarFiltrosPreview();

      expect(component.filasVisibles().length).toBe(3);
    });

    it('un archivo nuevo entra sin filtros del anterior', () => {
      const component = createComponent();
      ordenTrabajoService.importFromExcel.and.returnValue(of(plan as any));
      component.onFileSelected(archivo());
      component.toggleFiltroAccion('error');
      component.busquedaPreview.set('mala');

      component.onFileSelected(archivo());

      expect(component.hayFiltroActivo()).toBeFalse();
      expect(component.filasVisibles().length).toBe(3);
    });

    // Un archivo de miles de filas no se pinta entero: los contadores siguen
    // siendo del total y para llegar a una fila están el filtro y el buscador.
    it('la tabla se topa en MAX_FILAS_VISIBLES y avisa cuántas quedan fuera', () => {
      const component = createComponent();
      const muchas = Array.from({ length: 350 }, (_, i) => ({
        row: i + 2,
        nombre: 'OT-' + i,
        accion: 'crear',
        detalle: 'Centros de costo: 123 · Activa',
      }));
      ordenTrabajoService.importFromExcel.and.returnValue(
        of({ created: 350, updated: 0, unchanged: 0, errors: [], rows: muchas, dryRun: true } as any)
      );

      component.onFileSelected(archivo());

      expect(component.filasFiltradas().length).toBe(350);
      expect(component.filasVisibles().length).toBe(component.MAX_FILAS_VISIBLES);
      expect(component.filasOcultas()).toBe(350 - component.MAX_FILAS_VISIBLES);
    });

    it('cancelar descarta el archivo: confirmar después no hace nada', () => {
      const component = createComponent();
      ordenTrabajoService.importFromExcel.and.returnValue(of(plan as any));
      component.onFileSelected(archivo());

      component.cancelImport();
      ordenTrabajoService.importFromExcel.calls.reset();
      component.confirmImport();

      expect(component.importPreview()).toBeNull();
      expect(ordenTrabajoService.importFromExcel).not.toHaveBeenCalled();
    });

    it('sin nada que crear ni modificar no deja confirmar', () => {
      const component = createComponent();
      ordenTrabajoService.importFromExcel.and.returnValue(
        of({ created: 0, updated: 0, unchanged: 3, errors: [], rows: [], dryRun: true } as any)
      );

      component.onFileSelected(archivo());

      expect(component.puedeConfirmarImport).toBeFalse();
      component.confirmImport();
      expect(ordenTrabajoService.importFromExcel).toHaveBeenCalledTimes(1);
    });
  });

  describe('resultado de la carga', () => {
    /** Deja el componente con el archivo ya revisado, listo para confirmar. */
    const revisar = (component: any, resumen: any) => {
      ordenTrabajoService.importFromExcel.and.returnValue(
        of({ ...resumen, rows: [], dryRun: true } as any)
      );
      component.onFileSelected({ target: { files: [new File([''], 'ot.xlsx')] } } as any);
      ordenTrabajoService.importFromExcel.calls.reset();
      notificationService.show.calls.reset();
      ordenTrabajoService.importFromExcel.and.returnValue(
        of({ ...resumen, rows: [], dryRun: false } as any)
      );
    };

    it('avisa de creadas y actualizadas, y recarga la lista', () => {
      const component = createComponent();
      revisar(component, { created: 2, updated: 3, unchanged: 0, errors: [] });

      component.confirmImport();

      expect(notificationService.show).toHaveBeenCalledWith(
        'Órdenes de trabajo: 2 creada(s) y 3 actualizada(s)',
        'success'
      );
      expect(component.importResult()?.updated).toBe(3);
    });

    it('no avisa de éxito cuando el archivo solo trajo errores', () => {
      const component = createComponent();
      // Una fila mala y una buena: con solo errores no habría carga que aceptar.
      revisar(component, {
        created: 1,
        updated: 0,
        unchanged: 0,
        errors: [{ row: 2, reason: 'Indica el código del centro de costo' }],
      });
      ordenTrabajoService.importFromExcel.and.returnValue(
        of({
          created: 0,
          updated: 0,
          unchanged: 0,
          errors: [{ row: 2, reason: 'Indica el código del centro de costo' }],
          rows: [],
          dryRun: false,
        } as any)
      );

      component.confirmImport();

      expect(notificationService.show).toHaveBeenCalledWith('1 fila(s) con error', 'warning');
      expect(notificationService.show).not.toHaveBeenCalledWith(
        jasmine.stringMatching(/creada/),
        'success'
      );
    });
  });
});
