import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  signal,
  computed,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  DashboardService,
  IDashboardResponse,
  IDashboardKpis,
  ILocationPoint,
  INamedAmount,
} from './services/dashboard.service';
import { InvoicesService } from '../invoices/services/invoices.service';
import { AdminUsersService } from '../admin-users/services/admin-users.service';
import { OrdenTrabajoService } from '../../services/orden-trabajo.service';
import { IProject } from '../invoices/interfaces/project.interface';
import { ICategory } from '../invoices/interfaces/category.interface';
import {
  IOrdenTrabajo,
  otCentroCostoLabel,
} from '../../interfaces/orden-trabajo.interface';
import { IUserResponse } from '../../interfaces/user.interface';
import { NotificationService } from '../../services/notification.service';
import { ButtonComponent } from '../../design-system/button/button.component';
import { CardComponent } from '../../design-system/card/card.component';
import { FilterPanelComponent } from '../../design-system/filter-panel/filter-panel.component';
import { FormFieldComponent } from '../../design-system/form-field/form-field.component';
import { IconComponent } from '../../design-system/icon/icon.component';
import { EmptyStateComponent } from '../../design-system/empty-state/empty-state.component';
import { ProjectSelectComponent } from '../../design-system/project-select/project-select.component';
import {
  SearchSelectComponent,
  SearchSelectOption,
} from '../../design-system/search-select/search-select.component';
import {
  WorkerSelectComponent,
  WorkerOption,
} from '../../design-system/worker-select/worker-select.component';

declare var Chart: any;
declare var L: any;

const EMPTY_KPIS: IDashboardKpis = {
  totalGasto: 0,
  gastoCount: 0,
  totalGastoPrev: 0,
  totalGastoDeltaPct: 0,
  anticipoSolicitado: 0,
  anticipoSolicitadoCount: 0,
  devolucionesPendientesAmount: 0,
  devolucionesPendientesCount: 0,
  porRendirAmount: 0,
  porRendirCount: 0,
  porRendirVencidoAmount: 0,
  porRendirVencidoCount: 0,
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    CardComponent,
    FilterPanelComponent,
    FormFieldComponent,
    IconComponent,
    EmptyStateComponent,
    ProjectSelectComponent,
    SearchSelectComponent,
    WorkerSelectComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('monthlyChart') monthlyChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryChart') categoryChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('projectChart') projectChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('otChart') otChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('collaboratorChart')
  collaboratorChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('typeChart') typeChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('locationChart')
  locationChartRef!: ElementRef<HTMLCanvasElement>;

  private dashboardService = inject(DashboardService);
  private invoicesService = inject(InvoicesService);
  private adminUsersService = inject(AdminUsersService);
  private ordenTrabajoService = inject(OrdenTrabajoService);
  private notificationService = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);

  loading = signal(true);
  data = signal<IDashboardResponse | null>(null);
  kpis = signal<IDashboardKpis>(EMPTY_KPIS);
  /** Valores con animación de conteo para las tarjetas KPI. */
  animated = signal<IDashboardKpis>(EMPTY_KPIS);

  projects: IProject[] = [];
  categories: ICategory[] = [];
  collaborators: WorkerOption[] = [];
  ordenesTrabajo: IOrdenTrabajo[] = [];

  filterDateFrom = signal(this.defaultStartDate());
  filterDateTo = signal(this.defaultEndDate());
  filterProject = signal('');
  filterCategory = signal('');
  filterCollaborator = signal('');
  filterOrdenTrabajo = signal('');
  filterDepartment = signal('');

  activeFilterCount = computed(
    () =>
      [
        this.filterProject(),
        this.filterCategory(),
        this.filterCollaborator(),
        this.filterOrdenTrabajo(),
        this.filterDepartment(),
      ].filter((v) => !!v).length
  );

  /** Departamentos con destinos registrados; el backend los devuelve ordenados. */
  departments = computed(() => this.data()?.departments ?? []);

  /**
   * Opciones de los selectores con buscador. Las listas de Detroit son largas
   * (~53 categorias, cientos de OT) y un select nativo obliga a recorrerlas a
   * ojo, de ahi `app-search-select` en vez de `<select>`.
   */
  get ordenTrabajoOptions(): SearchSelectOption[] {
    return this.ordenesTrabajo.map((o) => ({
      value: o._id as string,
      label: o.nombre,
      subLabel: otCentroCostoLabel(o),
    }));
  }

  get categoryOptions(): SearchSelectOption[] {
    return this.categories
      .filter((c) => !!c._id)
      .map((c) => ({
        value: c._id as string,
        label: c.name,
        subLabel: c.cuenta,
      }));
  }

  get departmentOptions(): SearchSelectOption[] {
    return this.departments().map((d) => ({ value: d, label: d }));
  }

  /**
   * Ajuste del disparador de los selectores para que iguale la altura de los
   * campos de fecha de la misma rejilla; por defecto vienen mas altos.
   */
  readonly selectTrigger = '!rounded-lg !border-divider !px-3 !py-2';

  private chartLibraryLoaded = false;
  private leafletLoaded = false;
  private charts: Record<string, any> = {};
  private mapInstance: any = null;
  /** Marcadores del mapa indexados por departamento, para enfocarlos desde el chart. */
  private markersByPlace: Record<string, any> = {};
  private tweenHandles: Record<string, number> = {};
  /** rAF del repintado pendiente. Ver `tryRenderCharts`. */
  private renderHandle = 0;
  /** Frames esperados a que el contenedor tenga tamaño. */
  private renderIntentos = 0;

  /**
   * Paleta del dashboard: un solo tono azul-petroleo, del gris claro al oscuro.
   *
   * Siete de los ocho graficos son monocromaticos porque lo que codifican es
   * magnitud o avance, que es justo para lo que sirve una rampa de un tono. El
   * unico que no puede serlo es la evolucion mensual: ahi las cuatro series son
   * cosas distintas, no grados de la misma. Un solo tono en cuatro pasos mide
   * dE 13-14 entre pasos vecinos contra un piso de 15, o sea que ni con vision
   * de color completa se distinguen; por eso ese grafico usa dos tonos y no uno,
   * emparejados de a dos (los azules son la solicitud y su rendicion; los
   * verdes, los otros dos canales. El segundo par paso por bronce y por violeta
   * antes de quedar en verde: el paso oscuro de un dorado es marron y ensucia,
   * y el violeta desentonaba. El verde es el unico que ademas del piso de
   * separacion clava el contraste, asi que ninguna serie queda dependiendo de
   * la regla de alivio.
   *
   * Todas las escalas estan validadas con el script de la guia de visualizacion
   * contra el blanco de las tarjetas: banda de luminosidad, piso de croma,
   * separacion para protanopia/deuteranopia/tritanopia, piso de vision normal y
   * contraste >= 3:1. No tocar un hex suelto sin volver a correrla.
   */

  /** Rampa base. Todo lo monocromatico del tablero sale de aqui. */
  readonly rampa = {
    claro: '#7FB3D5',
    medio: '#4A93C2',
    oscuro: '#005E92',
  };

  /** Las cuatro vias por las que se mueve el dinero, en la serie mensual. */
  readonly seriesColors = {
    solicitudes: '#005E92',
    // Mismo tono que su solicitud: son la misma plata en dos momentos y lo que
    // se lee es la distancia entre las dos barras.
    rendicionSolicitud: '#4A93C2',
    directas: '#0F6338',
    cajaChica: '#479E6D',
  };

  /**
   * Corte cerrado / en proceso de los cuatro rankings. Escala ordinal de un solo
   * tono: el oscuro lee como "esto ya no se mueve" y el claro como "todavia
   * esta en camino".
   */
  readonly estadoColors = {
    cerrado: '#005E92',
    enProceso: '#7FB3D5',
  };

  /** Escala del mapa, de menor a mayor gasto. */
  readonly mapaColors = ['#7FB3D5', '#4A93C2', '#005E92'];

  /** Barras de una sola serie: el titulo ya dice que son, no hace falta leyenda. */
  readonly serieUnica = '#4A93C2';

  private readonly expenseTypeLabels: Record<string, string> = {
    factura: 'Factura',
    planilla_movilidad: 'Movilidad',
    otros_gastos: 'Otros gastos',
    recibo_caja: 'Recibo de caja',
  };

  ngOnInit() {
    this.loadFilterSources();
    this.loadChartLibrary();
    this.loadLeaflet();
    this.loadDashboard();
  }

  ngAfterViewInit() {
    this.tryRenderCharts();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.renderHandle);
    Object.values(this.tweenHandles).forEach((h) => cancelAnimationFrame(h));
    Object.values(this.charts).forEach((c) => c?.destroy?.());
    if (this.mapInstance) {
      this.mapInstance.remove();
      this.mapInstance = null;
    }
  }

  // ─── Data loading ─────────────────────────────────────────────────────────

  loadFilterSources() {
    forkJoin([
      this.invoicesService.getProjects().pipe(catchError(() => of([]))),
      this.invoicesService.getCategories().pipe(catchError(() => of([]))),
      this.adminUsersService.getUsers().pipe(catchError(() => of([]))),
      this.ordenTrabajoService.getAll().pipe(catchError(() => of([]))),
    ]).subscribe(([projects, categories, users, ordenes]) => {
      this.projects = (projects as IProject[]) || [];
      this.categories = (categories as ICategory[]) || [];
      this.collaborators = ((users as IUserResponse[]) || [])
        .filter((u) => !!u._id)
        .map((u) => ({
          _id: u._id as string,
          name: u.name || u.email || 'Sin nombre',
          email: u.email,
          dni: u.dni,
        }));
      this.ordenesTrabajo = ((ordenes as IOrdenTrabajo[]) || []).filter(
        (o) => !!o._id
      );
    });
  }

  loadDashboard() {
    this.loading.set(true);
    this.dashboardService
      .getDashboard({
        dateFrom: this.filterDateFrom(),
        dateTo: this.filterDateTo(),
        projectId: this.filterProject(),
        categoryId: this.filterCategory(),
        collaboratorId: this.filterCollaborator(),
        ordenTrabajoId: this.filterOrdenTrabajo(),
        department: this.filterDepartment(),
      })
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.kpis.set(res.kpis);
          this.loading.set(false);
          this.animateKpis(res.kpis);
          this.cdr.detectChanges();
          this.tryRenderCharts();
          // El mapa necesita un tick para que exista su contenedor en el DOM.
          setTimeout(() => this.tryRenderMap(), 50);
        },
        error: (err) => {
          this.loading.set(false);
          this.notificationService.show(
            'Error al cargar el dashboard: ' + (err?.message || ''),
            'error'
          );
        },
      });
  }

  onFilterChange() {
    this.loadDashboard();
  }

  clearFilters() {
    this.filterProject.set('');
    this.filterCategory.set('');
    this.filterCollaborator.set('');
    this.filterOrdenTrabajo.set('');
    this.filterDepartment.set('');
    this.filterDateFrom.set(this.defaultStartDate());
    this.filterDateTo.set(this.defaultEndDate());
    this.loadDashboard();
  }

  // ─── KPI counter animation ────────────────────────────────────────────────

  private animateKpis(target: IDashboardKpis) {
    const start = { ...EMPTY_KPIS };
    const keys = Object.keys(target) as (keyof IDashboardKpis)[];
    const duration = 700;
    let startTime: number | null = null;

    if (this.tweenHandles['kpis']) {
      cancelAnimationFrame(this.tweenHandles['kpis']);
    }

    const step = (ts: number) => {
      if (startTime === null) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current: any = {};
      keys.forEach((k) => {
        current[k] = start[k] + (target[k] - start[k]) * eased;
      });
      this.animated.set(current as IDashboardKpis);
      if (progress < 1) {
        this.tweenHandles['kpis'] = requestAnimationFrame(step);
      } else {
        this.animated.set(target);
      }
    };
    this.tweenHandles['kpis'] = requestAnimationFrame(step);
  }

  // ─── Charts ────────────────────────────────────────────────────────────────

  private loadChartLibrary() {
    if (typeof Chart !== 'undefined') {
      this.chartLibraryLoaded = true;
      this.tryRenderCharts();
      return;
    }
    const existing = document.getElementById('chartjs-cdn');
    if (existing) {
      existing.addEventListener('load', () => {
        this.chartLibraryLoaded = true;
        this.tryRenderCharts();
      });
      return;
    }
    const script = document.createElement('script');
    script.id = 'chartjs-cdn';
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = () => {
      this.chartLibraryLoaded = true;
      this.tryRenderCharts();
    };
    document.body.appendChild(script);
  }

  /**
   * Pide un repintado. Se agenda en el siguiente frame y se cancela el anterior:
   * a este metodo lo llaman cuatro caminos distintos (el AfterViewInit, la
   * respuesta del API y las cargas de Chart.js y Leaflet) y dos pasadas encimadas
   * sobre el mismo canvas lo dejan a medio dibujar.
   */
  private tryRenderCharts() {
    if (
      !this.chartLibraryLoaded ||
      typeof Chart === 'undefined' ||
      !this.data() ||
      !this.monthlyChartRef
    ) {
      return;
    }
    cancelAnimationFrame(this.renderHandle);
    this.renderHandle = requestAnimationFrame(() => this.renderCharts());
  }

  private renderCharts() {
    // Un canvas cuyo contenedor todavia mide cero se dibuja vacio y no se
    // recupera solo: es lo que pasa al abrir el dashboard en una pestaña que
    // esta en segundo plano, donde el layout no se resuelve hasta que la pestaña
    // se muestra. Se espera a que el contenedor tenga tamaño antes de crear
    // nada, con un tope para no quedarse girando si la tarjeta nunca se muestra.
    const host = this.monthlyChartRef?.nativeElement?.parentElement;
    if (host && (host.clientWidth === 0 || host.clientHeight === 0)) {
      if (this.renderIntentos++ < 120) {
        this.renderHandle = requestAnimationFrame(() => this.renderCharts());
      }
      return;
    }
    this.renderIntentos = 0;

    this.renderMonthlyChart();
    this.renderCategoryChart();
    this.renderProjectChart();
    this.renderOtChart();
    this.renderCollaboratorChart();
    this.renderTypeChart();
    this.renderLocationChart();
    this.tryRenderMap();
  }

  private baseAnimation() {
    return { duration: 900, easing: 'easeOutQuart' };
  }

  private destroyChart(key: string) {
    if (this.charts[key]) {
      this.charts[key].destroy();
      this.charts[key] = null;
    }
  }

  /**
   * Tres barras por mes: solicitado, gastado en rendición directa y consumido
   * de caja chica. Son las tres vías por las que sale dinero y el cliente las
   * quiere comparables mes a mes.
   */
  /**
   * Cuatro barras por mes. Solicitado y rendido van al lado porque la distancia
   * entre los dos es lo que falta sustentar; directa y caja chica completan las
   * otras dos vias por las que sale plata.
   */
  private renderMonthlyChart() {
    const ref = this.monthlyChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('monthly');
    const series = this.data()!.monthlySeries;
    const labels = series.map((s) => this.formatMonthLabel(s.month));
    const dataset = (
      label: string,
      key: 'solicitudes' | 'rendicionSolicitud' | 'directas' | 'cajaChica'
    ) => ({
      label,
      data: series.map((s) => s[key]),
      backgroundColor: this.seriesColors[key],
      borderRadius: 4,
    });

    this.charts['monthly'] = new Chart(ref, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          dataset('Solicitud de fondos', 'solicitudes'),
          dataset('Rendición de solicitud', 'rendicionSolicitud'),
          dataset('Rendición directa', 'directas'),
          dataset('Caja chica', 'cajaChica'),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: this.baseAnimation(),
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                ctx.dataset.label + ': ' + this.formatCurrency(ctx.parsed.y),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (v: any) => this.formatCompact(v) },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }

  /**
   * Ranking horizontal partido en cerrado / en proceso. Es el formato que pidio
   * el cliente para categorias, OT, centros de costo y colaboradores: de un
   * vistazo se ve cuanto de cada fila ya esta liquidado y cuanto sigue abierto.
   *
   * Las barras van apiladas porque lo que interesa comparar entre filas es el
   * total, y el corte se lee dentro de cada barra.
   */
  private renderRankingChart(
    key: string,
    ref: HTMLCanvasElement | undefined,
    rows: INamedAmount[],
    unidad = 'comprobantes'
  ) {
    if (!ref) return;
    this.destroyChart(key);
    if (!rows.length) return;

    this.charts[key] = new Chart(ref, {
      type: 'bar',
      data: {
        labels: rows.map((r) =>
          r.name.length > 24 ? r.name.slice(0, 24) + '…' : r.name
        ),
        datasets: [
          {
            label: 'Cerrado',
            data: rows.map((r) => r.cerrado),
            backgroundColor: this.estadoColors.cerrado,
            borderRadius: 3,
            // Filo del color de la tarjeta: separa los dos tramos de la barra
            // para que no se lean como un bloque continuo.
            borderColor: '#ffffff',
            borderWidth: 2,
          },
          {
            label: 'En proceso',
            data: rows.map((r) => r.enProceso),
            backgroundColor: this.estadoColors.enProceso,
            borderRadius: 3,
            borderColor: '#ffffff',
            borderWidth: 2,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: this.baseAnimation(),
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                ctx.dataset.label + ': ' + this.formatCurrency(ctx.parsed.x),
              footer: (items: any[]) => {
                const fila = rows[items[0]?.dataIndex];
                if (!fila) return '';
                return (
                  'Total ' +
                  this.formatCurrency(fila.amount) +
                  ' · ' +
                  fila.count +
                  ' ' +
                  unidad
                );
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            beginAtZero: true,
            ticks: { callback: (v: any) => this.formatCompact(v) },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
          y: { stacked: true, grid: { display: false } },
        },
      },
    });
  }

  private renderCategoryChart() {
    this.renderRankingChart(
      'category',
      this.categoryChartRef?.nativeElement,
      this.data()!.topCategories
    );
  }

  private renderProjectChart() {
    this.renderRankingChart(
      'project',
      this.projectChartRef?.nativeElement,
      this.data()!.topProjects
    );
  }

  private renderOtChart() {
    this.renderRankingChart(
      'ot',
      this.otChartRef?.nativeElement,
      this.data()!.topOrdenesTrabajo
    );
  }

  private renderCollaboratorChart() {
    this.renderRankingChart(
      'collaborator',
      this.collaboratorChartRef?.nativeElement,
      this.data()!.topCollaborators
    );
  }

  /** Gasto por tipo de comprobante. Era una lista de numeros; ahora es grafico. */
  private renderTypeChart() {
    const ref = this.typeChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('type');
    const rows = this.data()!.expenseByType;
    if (!rows.length) return;

    this.charts['type'] = new Chart(ref, {
      type: 'bar',
      data: {
        labels: rows.map((r) => this.expenseTypeLabel(r.type)),
        datasets: [
          {
            label: 'Gasto',
            data: rows.map((r) => r.amount),
            backgroundColor: this.serieUnica,
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: this.baseAnimation(),
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                this.formatCurrency(ctx.parsed.x) +
                ' · ' +
                (rows[ctx.dataIndex]?.count ?? 0) +
                ' comprobantes',
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { callback: (v: any) => this.formatCompact(v) },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
          y: { grid: { display: false } },
        },
      },
    });
  }

  /** Los destinos no llevan el corte por estado: solo monto gastado. */
  private renderLocationChart() {
    const ref = this.locationChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('location');
    const rows = (this.data()?.topLocations ?? []).slice(0, 8);
    if (!rows.length) return;

    this.charts['location'] = new Chart(ref, {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.place),
        datasets: [
          {
            label: 'Gastado',
            data: rows.map((r) => r.amount),
            backgroundColor: this.serieUnica,
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: this.baseAnimation(),
        onHover: (event: any, elements: any[]) => {
          event.native.target.style.cursor = elements?.length
            ? 'pointer'
            : 'default';
        },
        onClick: (_event: any, elements: any[]) => {
          const idx = elements?.[0]?.index;
          if (idx != null && rows[idx]) this.focusLocation(rows[idx].place);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                this.formatCurrency(ctx.parsed.x) +
                ' · solicitado ' +
                this.formatCurrency(rows[ctx.dataIndex]?.solicitado ?? 0),
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { callback: (v: any) => this.formatCompact(v) },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
          y: { grid: { display: false } },
        },
      },
    });
  }


  // ─── Leaflet map ─────────────────────────────────────────────────────────

  private loadLeaflet() {
    if (typeof L !== 'undefined') {
      this.leafletLoaded = true;
      return;
    }
    const existingLink = document.getElementById('leaflet-css');
    if (!existingLink) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const existing = document.getElementById('leaflet-js');
    if (existing) {
      existing.addEventListener('load', () => {
        this.leafletLoaded = true;
        this.tryRenderMap();
      });
      return;
    }
    const script = document.createElement('script');
    script.id = 'leaflet-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      this.leafletLoaded = true;
      this.tryRenderMap();
    };
    document.body.appendChild(script);
  }

  /**
   * El backend agrupa los destinos por departamento y ya manda sus coordenadas,
   * así que el mapa no geocodifica nada: antes se le pedía a Google la posición
   * de cada dirección suelta y fallaba con los destinos escritos a mano.
   */
  private tryRenderMap() {
    const locations = (this.data()?.topLocations ?? []).filter(
      (l) => l.lat != null && l.lng != null
    );
    if (!this.leafletLoaded || typeof L === 'undefined' || !locations.length) {
      return;
    }
    const el = document.getElementById('viaticos-map');
    if (!el) return;

    if (this.mapInstance) {
      this.mapInstance.remove();
      this.mapInstance = null;
    }

    this.mapInstance = L.map('viaticos-map', {
      zoomControl: true,
      scrollWheelZoom: false,
    });

    // Tiles de OpenStreetMap: los de CARTO empezaron a exigir API key y el mapa
    // se veía con el sello "API KEY REQUIRED" encima.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      subdomains: 'abc',
      maxZoom: 19,
    }).addTo(this.mapInstance);

    this.markersByPlace = {};
    const maxAmount = Math.max(...locations.map((l) => l.amount), 1);
    locations.forEach((p) => this.addLocationMarker(p, maxAmount));
    this.fitToMarkers();
    setTimeout(() => this.mapInstance?.invalidateSize(), 0);
  }

  private addLocationMarker(p: ILocationPoint, maxAmount: number) {
    if (!this.mapInstance || p.lat == null || p.lng == null) return;
    const marker = L.marker([p.lat, p.lng], {
      icon: this.createLeafletIcon(p.amount, maxAmount),
    });
    const popup = `
        <div style="font-family:sans-serif;min-width:170px">
          <div style="font-weight:700;font-size:14px;color:#21262B;margin-bottom:6px">${p.place}</div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#7A8087;margin-bottom:2px">
            <span>Gastado</span><strong style="color:#005E92">${this.formatCurrency(p.amount)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#7A8087">
            <span>Solicitado</span><strong style="color:#21262B">${this.formatCurrency(p.solicitado)}</strong>
          </div>
        </div>
      `;
    marker.bindPopup(popup, { maxWidth: 220 });
    marker.addTo(this.mapInstance);
    this.markersByPlace[p.place] = marker;
  }

  private fitToMarkers() {
    if (!this.mapInstance) return;
    const latLngs = Object.values(this.markersByPlace).map((m) => m.getLatLng());
    if (latLngs.length) {
      // maxZoom: con un solo departamento el encuadre automático se iba al
      // nivel de calle y se perdía la referencia del país.
      this.mapInstance.fitBounds(L.latLngBounds(latLngs), {
        padding: [30, 30],
        maxZoom: 7,
      });
    } else {
      this.mapInstance.setView([-9.19, -75.0152], 4);
    }
  }

  /** Centra el mapa en el departamento indicado y abre su globo. */
  focusLocation(place: string) {
    const marker = this.markersByPlace[place];
    if (!marker || !this.mapInstance) return;
    const el = document.getElementById('viaticos-map');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    this.mapInstance.invalidateSize();
    this.mapInstance.setView(
      marker.getLatLng(),
      Math.max(this.mapInstance.getZoom(), 7),
      { animate: true }
    );
    marker.openPopup();
  }

  /** Pin cuyo tamaño y color escalan con el monto gastado en el departamento. */
  private createLeafletIcon(amount: number, maxAmount: number): any {
    const ratio = amount / maxAmount;
    const size = Math.round(24 + ratio * 18);
    const color =
      ratio > 0.66
        ? this.mapaColors[2]
        : ratio > 0.33
          ? this.mapaColors[1]
          : this.mapaColors[0];

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 1.3)}" viewBox="0 0 40 52">
      <path d="M20 1C11.16 1 4 8.16 4 17C4 28.5 20 51 20 51S36 28.5 36 17C36 8.16 28.84 1 20 1Z"
            fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="20" cy="17" r="6" fill="white" opacity="0.95"/>
    </svg>`;

    return L.divIcon({
      html: svg,
      className: '',
      iconSize: [size, Math.round(size * 1.3)],
      iconAnchor: [size / 2, Math.round(size * 1.3)],
      popupAnchor: [0, -Math.round(size * 1.3)],
    });
  }

  // ─── Helpers de plantilla ─────────────────────────────────────────────────

  /** Categorías con su porcentaje, para la lista que acompaña al gráfico. */
  categoryRows(): INamedAmount[] {
    return this.data()?.topCategories ?? [];
  }

  /**
   * Destinos que resolvieron a un departamento real. El agrupado "Sin
   * departamento" sigue en el gráfico (esa plata se gastó), pero queda fuera de
   * los tres indicadores: contarlo daba "11 departamentos" habiendo 10, y con
   * destinos mal escritos llegaba a salir como "destino principal".
   */
  private destinosIdentificados() {
    return (this.data()?.topLocations ?? []).filter((l) => l.identificado);
  }

  get topLocationName(): string {
    return this.destinosIdentificados()[0]?.place ?? '—';
  }

  get topLocationAmount(): number {
    return this.destinosIdentificados()[0]?.amount ?? 0;
  }

  get uniqueDestinos(): number {
    return this.destinosIdentificados().length;
  }

  get avgGastoPorDestino(): number {
    const locs = this.destinosIdentificados();
    if (!locs.length) return 0;
    return locs.reduce((s, l) => s + l.amount, 0) / locs.length;
  }

  hasData(): boolean {
    const k = this.kpis();
    return (
      !!this.data() &&
      (k.gastoCount > 0 ||
        k.anticipoSolicitadoCount > 0 ||
        k.porRendirCount > 0 ||
        k.devolucionesPendientesCount > 0)
    );
  }

  expenseTypeLabel(type: string): string {
    return this.expenseTypeLabels[type] || type;
  }

  /** true si el anticipo ya pasó el plazo pactado para rendir. */
  isVencido(dias: number): boolean {
    return dias > (this.data()?.diasParaRendir ?? 20);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      maximumFractionDigits: 2,
    }).format(value || 0);
  }

  formatCompact(value: number): string {
    const v = value || 0;
    if (Math.abs(v) >= 1000) {
      return 'S/ ' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
    }
    return 'S/ ' + v.toFixed(0);
  }

  formatInt(value: number): string {
    return Math.round(value || 0).toLocaleString('es-PE');
  }

  formatPct(value: number): string {
    return (value || 0).toFixed(1) + '%';
  }

  private formatMonthLabel(monthKey: string): string {
    const [year, month] = monthKey.split('-');
    const names = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
    ];
    const idx = parseInt(month, 10) - 1;
    return `${names[idx] ?? month} ${year?.slice(2) ?? ''}`;
  }

  private defaultStartDate(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return this.toInputDate(d);
  }

  private defaultEndDate(): string {
    return this.toInputDate(new Date());
  }

  private toInputDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
