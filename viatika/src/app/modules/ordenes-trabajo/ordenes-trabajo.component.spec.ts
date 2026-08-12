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
      of({ created: 0, updated: 0, errors: [] })
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

  describe('resultado de la carga', () => {
    it('avisa de creadas y actualizadas, y recarga la lista', () => {
      const component = createComponent();
      ordenTrabajoService.importFromExcel.and.returnValue(
        of({ created: 2, updated: 3, errors: [] })
      );

      component.onFileSelected({ target: { files: [new File([''], 'ot.xlsx')] } } as any);

      expect(notificationService.show).toHaveBeenCalledWith(
        'Órdenes de trabajo: 2 creada(s) y 3 actualizada(s)',
        'success'
      );
      expect(component.importResult()?.updated).toBe(3);
    });

    it('no avisa de éxito cuando el archivo solo trajo errores', () => {
      const component = createComponent();
      ordenTrabajoService.importFromExcel.and.returnValue(
        of({ created: 0, updated: 0, errors: [{ row: 2, reason: 'Indica el código del centro de costo' }] })
      );

      component.onFileSelected({ target: { files: [new File([''], 'ot.xlsx')] } } as any);

      expect(notificationService.show).toHaveBeenCalledWith('1 fila(s) con error', 'warning');
      expect(notificationService.show).not.toHaveBeenCalledWith(
        jasmine.stringMatching(/creada/),
        'success'
      );
    });
  });
});
