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
  monthlySeries: [
    { month: '2026-07', solicitudes: 1000, directas: 200, cajaChica: 50 },
  ],
  topCategories: [
    { name: 'Alimentación', amount: 600, count: 3, pct: 60, categoryId: 'c1' },
    { name: 'Combustible', amount: 400, count: 1, pct: 40, categoryId: 'c2' },
  ],
  topOrdenesTrabajo: [{ name: 'OT-1', amount: 500, count: 2, ordenTrabajoId: 'o1' }],
  topProjects: [{ name: 'CC 123', amount: 700, count: 3, projectId: 'p1' }],
  topCollaborators: [{ name: 'Ana', amount: 700, count: 3, userId: 'u1' }],
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
  reportByStatus: [
    { status: 'pending_accounting', count: 3, budget: 0 },
    { status: 'pending_contabilidad', count: 2, budget: 0 },
    { status: 'open', count: 7, budget: 0 },
  ],
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
    invoicesService.getCategories.and.returnValue(of([]));

    const adminUsersService = jasmine.createSpyObj('AdminUsersService', ['getUsers']);
    adminUsersService.getUsers.and.returnValue(of([]));

    const ordenTrabajoService = jasmine.createSpyObj('OrdenTrabajoService', ['getAll']);
    ordenTrabajoService.getAll.and.returnValue(
      of([{ _id: 'o1', nombre: 'OT-1', costCenterId: 'p1' }])
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
  it('la leyenda de categorías trae color, monto y porcentaje', () => {
    montar();
    const filas = component.categoryRows();
    expect(filas.length).toBe(2);
    expect(filas[0].color).toBeTruthy();
    expect(filas[0].amount).toBe(600);
    expect(filas[0].pct).toBe(60);
  });

  // `pending_accounting` y `pending_contabilidad` son el mismo paso y salían
  // como dos filas con la misma etiqueta.
  it('une los estados de rendición que comparten etiqueta', () => {
    montar();
    const filas = component.reportStatusRows();
    const pendientes = filas.filter((r) => r.label === 'Pend. contabilidad');
    expect(pendientes.length).toBe(1);
    expect(pendientes[0].count).toBe(5);
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
