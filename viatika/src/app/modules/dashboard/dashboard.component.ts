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

  readonly palette = [
    '#D31212',
    '#3B82F6',
    '#05CD99',
    '#FFB547',
    '#8B5CF6',
    '#EC4899',
    '#14B8A6',
    '#9B1B22',
    '#F59E0B',
    '#6366F1',
  ];

  /** Un color por serie de la evolución mensual. */
  readonly seriesColors = {
    solicitudes: '#3B82F6',
    directas: '#D31212',
    cajaChica: '#05CD99',
  };

  private readonly statusColorMap: Record<string, string> = {
    approved: '#05CD99',
    sunat_valid: '#05CD99',
    paid: '#3B82F6',
    settled: '#14B8A6',
    pending: '#FFB547',
    pending_l1: '#FFB547',
    pending_l2: '#F59E0B',
    rejected: '#D31212',
    returned: '#8B5CF6',
    cancelled: '#9CA3AF',
    draft: '#CBD5E1',
    solicited: '#6366F1',
    open: '#94A3B8',
    submitted: '#3B82F6',
    pending_accounting: '#F59E0B',
    pending_contabilidad: '#F59E0B',
    viatico_approved: '#05CD99',
    reimbursed: '#10B981',
    closed: '#0EA5E9',
  };

  private readonly reportStatusLabels: Record<string, string> = {
    solicited: 'Solicitada',
    open: 'Registrando gastos',
    submitted: 'Enviada',
    pending_accounting: 'Pend. contabilidad',
    pending_contabilidad: 'Pend. contabilidad',
    pending_l1: 'Pend. Nivel 1',
    pending_l2: 'Pend. Nivel 2',
    viatico_approved: 'Aprobada',
    approved: 'Aprobada',
    partially_paid: 'Pago parcial',
    paid: 'Pagada',
    settled: 'Liquidada',
    returned: 'Devuelta',
    rejected: 'Rechazada',
    reimbursed: 'Reembolsada',
    closed: 'Cerrada',
    cancelled: 'Cancelada',
  };

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

  private tryRenderCharts() {
    if (
      !this.chartLibraryLoaded ||
      typeof Chart === 'undefined' ||
      !this.data() ||
      !this.monthlyChartRef
    ) {
      return;
    }
    this.renderMonthlyChart();
    this.renderCategoryChart();
    this.renderProjectChart();
    this.renderOtChart();
    this.renderCollaboratorChart();
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
  private renderMonthlyChart() {
    const ref = this.monthlyChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('monthly');
    const series = this.data()!.monthlySeries;
    const labels = series.map((s) => this.formatMonthLabel(s.month));
    const dataset = (
      label: string,
      key: 'solicitudes' | 'directas' | 'cajaChica'
    ) => ({
      label,
      data: series.map((s) => s[key]),
      backgroundColor: this.seriesColors[key],
      borderRadius: 6,
    });

    this.charts['monthly'] = new Chart(ref, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          dataset('Solicitudes de fondos', 'solicitudes'),
          dataset('Rendiciones directas', 'directas'),
          dataset('Caja chica', 'cajaChica'),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: this.baseAnimation(),
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                `${ctx.dataset.label}: ${this.formatCurrency(ctx.parsed.y)}`,
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
   * Sin leyenda de Chart.js: el cliente no le veía valor a poder ocultar
   * categorías y sí quería el monto y el porcentaje a la vista, que van en la
   * lista del costado (`categoryRows`).
   */
  private renderCategoryChart() {
    const ref = this.categoryChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('category');
    const rows = this.data()!.topCategories;
    this.charts['category'] = new Chart(ref, {
      type: 'doughnut',
      data: {
        labels: rows.map((r) => r.name),
        datasets: [
          {
            data: rows.map((r) => r.amount),
            backgroundColor: this.palette.slice(0, rows.length),
            borderWidth: 2,
            borderColor: '#fff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: { ...this.baseAnimation(), animateRotate: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                `${ctx.label}: ${this.formatCurrency(ctx.parsed)} · ${this.formatPct(
                  rows[ctx.dataIndex]?.pct ?? 0
                )}`,
            },
          },
        },
      },
    });
  }

  /** Barra horizontal reutilizable para los tres rankings. */
  private renderRankingChart(
    key: string,
    ref: HTMLCanvasElement | undefined,
    rows: { name: string; amount: number; count: number }[],
    opts: {
      color?: string;
      /** Qué cuenta `count` en el tooltip: comprobantes, viáticos, etc. */
      unidad?: string;
      onClick?: (index: number) => void;
    } = {}
  ) {
    const { color, unidad = 'comprobantes', onClick } = opts;
    if (!ref) return;
    this.destroyChart(key);
    this.charts[key] = new Chart(ref, {
      type: 'bar',
      data: {
        labels: rows.map((r) =>
          r.name.length > 22 ? r.name.slice(0, 22) + '…' : r.name
        ),
        datasets: [
          {
            label: 'Gasto',
            data: rows.map((r) => r.amount),
            backgroundColor: color
              ? color
              : rows.map((_, i) => this.palette[i % this.palette.length]),
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: this.baseAnimation(),
        onHover: onClick
          ? (event: any, elements: any[]) => {
              event.native.target.style.cursor = elements?.length
                ? 'pointer'
                : 'default';
            }
          : undefined,
        onClick: onClick
          ? (_event: any, elements: any[]) => {
              const idx = elements?.[0]?.index;
              if (idx != null) onClick(idx);
            }
          : undefined,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                `${this.formatCurrency(ctx.parsed.x)} · ${
                  rows[ctx.dataIndex]?.count ?? 0
                } ${unidad}`,
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
      this.data()!.topCollaborators,
      { color: '#3B82F6' }
    );
  }

  private renderLocationChart() {
    const rows = (this.data()?.topLocations ?? []).slice(0, 8);
    if (!rows.length) return;
    this.renderRankingChart(
      'location',
      this.locationChartRef?.nativeElement,
      rows.map((r) => ({ name: r.place, amount: r.amount, count: r.count })),
      { unidad: 'viáticos', onClick: (idx) => this.focusLocation(rows[idx].place) }
    );
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
            <span>Gastado</span><strong style="color:#D31212">${this.formatCurrency(p.amount)}</strong>
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
      ratio > 0.66 ? '#D31212' : ratio > 0.33 ? '#F59E0B' : '#3B82F6';

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

  /** Filas de la leyenda de categorías: color, monto y porcentaje a la vista. */
  categoryRows() {
    return (this.data()?.topCategories ?? []).map((r, i) => ({
      ...r,
      color: this.palette[i % this.palette.length],
    }));
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

  reportStatusLabel(status: string): string {
    return this.reportStatusLabels[status] || status;
  }

  /**
   * Rendiciones por estado, sumando los estados que comparten etiqueta:
   * `pending_accounting` y `pending_contabilidad` son el mismo paso, igual que
   * `approved` y `viatico_approved`, y salían como filas repetidas.
   */
  reportStatusRows() {
    const porEtiqueta = new Map<string, { status: string; label: string; count: number }>();
    for (const r of this.data()?.reportByStatus ?? []) {
      const label = this.reportStatusLabel(r.status);
      const cur = porEtiqueta.get(label);
      if (cur) {
        cur.count += r.count;
      } else {
        porEtiqueta.set(label, { status: r.status, label, count: r.count });
      }
    }
    return Array.from(porEtiqueta.values()).sort((a, b) => b.count - a.count);
  }

  expenseTypeLabel(type: string): string {
    return this.expenseTypeLabels[type] || type;
  }

  statusColor(status: string): string {
    return this.statusColorMap[status] || '#9CA3AF';
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
