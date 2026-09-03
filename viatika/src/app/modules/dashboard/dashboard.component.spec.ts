import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { DashboardComponent } from './dashboard.component';
import {
  DashboardService,
  IDashboardResponse,
} from './services/dashboard.service';
import { InvoicesService } from '../invoices/services/invoices.service';
import { AdminUsersService } from '../admin-users/services/admin-users.service';
import { OrdenTrabajoService } from '../../services/orden-trabajo.service';
import { NotificationService } from '../../services/notification.service';

const RESPUESTA: IDashboardResponse = {
  range: { dateFrom: '2026-01-01', dateTo: '2026-12-31' },
  currency: 'PEN',
  scope: { restricted: false, projectIds: [] },
  kpis: {
    totalGasto: 1000,
    gastoCount: 4,
    totalGastoPrev: 800,
    totalGastoDeltaPct: 25,
    anticipoSolicitado: 3000,
    anticipoSolicitadoCount: 2,
    devolucionesPendientesAmount: 150,
    devolucionesPendientesCount: 1,
    porRendirAmount: 2000,
    porRendirCount: 2,
    porRendirVencidoAmount: 500,
    porRendirVencidoCount: 1,
  },
  diasParaRendir: 20,
  porRendirBuckets: [
    { label: 'Al día (≤ 20 d)', amount: 1500, count: 1, vencido: false },
    { label: '21–40 d', amount: 500, count: 1, vencido: true },
    { label: '41–60 d', amount: 0, count: 0, vencido: true },
    { label: '+ 60 d', amount: 0, count: 0, vencido: true },
  ],
  monthlySeries: [
    {
      month: '2026-07',
      solicitudes: 1000,
      rendicionSolicitud: 820,
      directas: 200,
      cajaChica: 50,
    },
  ],
  topCategories: [
    {
      name: 'Alimentación',
      amount: 600,
      count: 3,
      cerrado: 400,
      enProceso: 200,
      pct: 60,
      categoryId: 'c1',
    },
    {
      name: 'Combustible',
      amount: 400,
      count: 1,
      cerrado: 0,
      enProceso: 400,
      pct: 40,
      categoryId: 'c2',
    },
  ],
  topOrdenesTrabajo: [
    { name: 'OT-1', amount: 500, count: 2, cerrado: 300, enProceso: 200, ordenTrabajoId: 'o1' },
  ],
  topProjects: [
    { name: 'CC 123', amount: 700, count: 3, cerrado: 500, enProceso: 200, projectId: 'p1' },
  ],
  topCollaborators: [
    { name: 'Ana', amount: 700, count: 3, cerrado: 500, enProceso: 200, userId: 'u1' },
  ],
  topLocations: [
    { place: 'Sin departamento', count: 5, amount: 9000, solicitado: 9000, identificado: false },
    { place: 'Loreto', count: 2, amount: 800, solicitado: 1200, identificado: true, lat: -3.7, lng: -73.2 },
    { place: 'Lima', count: 1, amount: 200, solicitado: 300, identificado: true, lat: -12, lng: -77 },
  ],
  departments: ['Lima', 'Loreto'],
  pendientes: {
    devoluciones: [
      { reportId: 'r1', codigo: 'RD-1', place: 'Loreto', userName: 'Ana', amount: 150, dias: 3 },
    ],
    porRendir: [
      { reportId: 'r2', codigo: 'RD-2', place: 'Lima', userName: 'Beto', amount: 500, dias: 40 },
      { reportId: 'r3', codigo: 'RD-3', place: 'Loreto', userName: 'Ana', amount: 1500, dias: 5 },
    ],
  },
  expenseByType: [{ type: 'factura', amount: 1000, count: 4 }],
};

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let dashboardService: jasmine.SpyObj<DashboardService>;

  const montar = (respuesta: IDashboardResponse = RESPUESTA) => {
    dashboardService = jasmine.createSpyObj('DashboardService', ['getDashboard']);
    dashboardService.getDashboard.and.returnValue(of(respuesta));

    const invoicesService = jasmine.createSpyObj('InvoicesService', [
      'getProjects',
      'getCategories',
    ]);
    invoicesService.getProjects.and.returnValue(of([]));
    invoicesService.getCategories.and.returnValue(
      of([{ _id: 'c1', name: 'Alimentación', cuenta: '9101' }])
    );

    const adminUsersService = jasmine.createSpyObj('AdminUsersService', ['getUsers']);
    adminUsersService.getUsers.and.returnValue(
      of([
        { _id: 'u1', name: 'Ana', email: 'ana@x.pe', dni: '12345678' },
        { _id: '', name: 'Sin id' },
      ])
    );

    const ordenTrabajoService = jasmine.createSpyObj('OrdenTrabajoService', ['getAll']);
    ordenTrabajoService.getAll.and.returnValue(
      of([
        {
          _id: 'o1',
          nombre: 'OT-1',
          costCenterId: { _id: 'p1', code: 'CC-006', name: 'Cerro Verde' },
        },
      ])
    );

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: DashboardService, useValue: dashboardService },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: OrdenTrabajoService, useValue: ordenTrabajoService },
        {
          provide: NotificationService,
          useValue: jasmine.createSpyObj('NotificationService', ['show']),
        },
      ],
    });

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('carga el dashboard al iniciar', () => {
    montar();
    expect(dashboardService.getDashboard).toHaveBeenCalled();
    expect(component.kpis().totalGasto).toBe(1000);
  });

  it('manda los filtros nuevos de OT y departamento al backend', () => {
    montar();
    component.filterOrdenTrabajo.set('o1');
    component.filterDepartment.set('Loreto');
    component.onFilterChange();

    const filtros = dashboardService.getDashboard.calls.mostRecent().args[0];
    expect(filtros?.ordenTrabajoId).toBe('o1');
    expect(filtros?.department).toBe('Loreto');
  });

  it('cuenta OT y departamento como filtros activos', () => {
    montar();
    expect(component.activeFilterCount()).toBe(0);
    component.filterOrdenTrabajo.set('o1');
    expect(component.activeFilterCount()).toBe(1);
    component.filterDepartment.set('Lima');
    expect(component.activeFilterCount()).toBe(2);
  });

  it('limpiar filtros borra también OT y departamento', () => {
    montar();
    component.filterOrdenTrabajo.set('o1');
    component.filterDepartment.set('Lima');
    component.clearFilters();
    expect(component.filterOrdenTrabajo()).toBe('');
    expect(component.filterDepartment()).toBe('');
  });

  it('ofrece como departamentos los que devuelve el backend', () => {
    montar();
    expect(component.departments()).toEqual(['Lima', 'Loreto']);
  });

  // El cliente pidió ver monto y porcentaje sin tener que pasar el mouse.
  it('la lista de categorías trae monto y porcentaje', () => {
    montar();
    const filas = component.categoryRows();
    expect(filas.length).toBe(2);
    expect(filas[0].amount).toBe(600);
    expect(filas[0].pct).toBe(60);
  });

  // El corte cerrado / en proceso es lo que pidió el cliente para los cuatro
  // rankings; las dos mitades tienen que sumar el total de la fila.
  it('cada fila de un ranking se parte en cerrado y en proceso', () => {
    montar();
    for (const fila of [
      ...component.categoryRows(),
      ...(component.data()?.topOrdenesTrabajo ?? []),
      ...(component.data()?.topProjects ?? []),
      ...(component.data()?.topCollaborators ?? []),
    ]) {
      expect(fila.cerrado + fila.enProceso).toBe(fila.amount);
    }
  });

  // El grafico de antiguedad y el KPI salen del mismo conjunto: si no cuadran,
  // uno de los dos esta mirando una lista truncada.
  it('los tramos de antigüedad suman lo mismo que el KPI', () => {
    montar();
    const tramos = component.data()?.porRendirBuckets ?? [];
    const suma = tramos.reduce((s, t) => s + t.amount, 0);
    expect(suma).toBe(component.kpis().porRendirAmount);
    expect(tramos.filter((t) => t.vencido).length).toBe(3);
  });

  it('marca vencido lo que pasa del plazo para rendir', () => {
    montar();
    expect(component.isVencido(40)).toBe(true);
    expect(component.isVencido(20)).toBe(false);
  });

  // "Sin departamento" agrupa los destinos que no se pudieron resolver: sigue en
  // el grafico, pero contarlo daba un departamento de mas y podia salir como
  // "destino principal" con solo tener destinos mal escritos.
  it('los indicadores de destino ignoran "Sin departamento"', () => {
    montar();
    expect(component.uniqueDestinos).toBe(2);
    expect(component.topLocationName).toBe('Loreto');
    expect(component.topLocationAmount).toBe(800);
    expect(component.avgGastoPorDestino).toBe(500);
  });

  // Las listas de Detroit son largas: los selectores llevan buscador y el
  // buscador mira label + subLabel, de ahi que la OT arrastre su centro de costo
  // y la categoria su cuenta contable.
  it('las OT se ofrecen con su centro de costo como segunda línea', () => {
    montar();
    const opciones = component.ordenTrabajoOptions;
    expect(opciones.length).toBe(1);
    expect(opciones[0].value).toBe('o1');
    expect(opciones[0].label).toBe('OT-1');
    expect(opciones[0].subLabel).toContain('CC-006');
  });

  it('las categorías se ofrecen con su cuenta contable', () => {
    montar();
    const opciones = component.categoryOptions;
    expect(opciones[0].label).toBe('Alimentación');
    expect(opciones[0].subLabel).toBe('9101');
  });

  it('los departamentos del backend se ofrecen como opciones', () => {
    montar();
    expect(component.departmentOptions).toEqual([
      { value: 'Lima', label: 'Lima' },
      { value: 'Loreto', label: 'Loreto' },
    ]);
  });

  // app-worker-select espera `_id`; un usuario sin id romperia la seleccion.
  it('los colaboradores se mapean para el selector y se descartan los que no tienen id', () => {
    montar();
    expect(component.collaborators).toEqual([
      { _id: 'u1', name: 'Ana', email: 'ana@x.pe', dni: '12345678' },
    ]);
  });

  it('avisa cuando la vista está recortada al alcance del usuario', () => {
    montar({
      ...RESPUESTA,
      scope: { restricted: true, projectIds: ['p1'] },
    });
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('solo los centros de costo');
  });

  it('no avisa de recorte a quien ve la empresa completa', () => {
    montar();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('solo los centros de costo');
  });
});
