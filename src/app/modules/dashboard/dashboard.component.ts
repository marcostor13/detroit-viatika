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
import { IProject } from '../invoices/interfaces/project.interface';
import { ICategory } from '../invoices/interfaces/category.interface';
import { IUserResponse } from '../../interfaces/user.interface';
import { NotificationService } from '../../services/notification.service';
import { GoogleMapsLoaderService } from '../../services/google-maps-loader.service';

declare var Chart: any;
declare var L: any;
declare var google: any;

const EMPTY_KPIS: IDashboardKpis = {
  totalGasto: 0,
  gastoCount: 0,
  ticketPromedio: 0,
  totalGastoPrev: 0,
  totalGastoDeltaPct: 0,
  gastoApprovedAmount: 0,
  gastoPendingAmount: 0,
  gastoPendingCount: 0,
  gastoRejectedAmount: 0,
  tasaAprobacionGastos: 0,
  anticipoSolicitado: 0,
  anticipoSolicitadoCount: 0,
  anticipoAprobadoAmount: 0,
  anticipoPagadoAmount: 0,
  anticipoPendienteAprobAmount: 0,
  anticipoPendienteAprobCount: 0,
  devolucionesPendientesAmount: 0,
  devolucionesPendientesCount: 0,
  rendicionesTotal: 0,
  rendicionesPendientes: 0,
  rendicionesAprobadas: 0,
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('monthlyChart') monthlyChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryChart') categoryChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('projectChart') projectChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('statusChart') statusChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('advanceChart') advanceChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('collaboratorChart')
  collaboratorChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('locationChart')
  locationChartRef!: ElementRef<HTMLCanvasElement>;

  private dashboardService = inject(DashboardService);
  private invoicesService = inject(InvoicesService);
  private adminUsersService = inject(AdminUsersService);
  private notificationService = inject(NotificationService);
  private mapsLoader = inject(GoogleMapsLoaderService);
  private cdr = inject(ChangeDetectorRef);

  loading = signal(true);
  data = signal<IDashboardResponse | null>(null);
  kpis = signal<IDashboardKpis>(EMPTY_KPIS);
  /** Valores con animación de conteo para las tarjetas KPI. */
  animated = signal<IDashboardKpis>(EMPTY_KPIS);

  projects: IProject[] = [];
  categories: ICategory[] = [];
  collaborators: { id: string; name: string }[] = [];

  filterDateFrom = signal(this.defaultStartDate());
  filterDateTo = signal(this.defaultEndDate());
  filterProject = signal('');
  filterCategory = signal('');
  filterCollaborator = signal('');

  activeFilterCount = computed(
    () =>
      [
        this.filterProject(),
        this.filterCategory(),
        this.filterCollaborator(),
      ].filter((v) => !!v).length
  );

  private chartLibraryLoaded = false;
  private leafletLoaded = false;
  private charts: Record<string, any> = {};
  private mapInstance: any = null;
  /** Marcadores del mapa indexados por nombre de destino, para enfocarlos desde la lista/chart. */
  private markersByPlace: Record<string, any> = {};
  /** Caché de geocodificación (place -> [lat, lng]) para no repetir llamadas a Google. */
  private geocodeCache: Record<string, [number, number] | null> = {};
  private geocoder: any = null;
  /** Token incremental: invalida marcadores geocodificados de un render anterior. */
  private mapRenderToken = 0;
  private tweenHandles: Record<string, number> = {};

  // Coordinates for Peruvian departments/cities used as fallback
  private readonly peruCityCoords: Record<string, [number, number]> = {
    'lima': [-12.0464, -77.0428],
    'arequipa': [-16.409, -71.5375],
    'cusco': [-13.532, -71.9675],
    'cuzco': [-13.532, -71.9675],
    'trujillo': [-8.112, -79.0288],
    'chiclayo': [-6.7714, -79.8409],
    'piura': [-5.1945, -80.6328],
    'iquitos': [-3.7491, -73.2538],
    'huancayo': [-12.0651, -75.2049],
    'puno': [-15.8402, -70.0219],
    'tacna': [-18.0146, -70.2536],
    'ica': [-14.0674, -75.7286],
    'pucallpa': [-8.3791, -74.5539],
    'ayacucho': [-13.1588, -74.2236],
    'juliaca': [-15.4997, -70.133],
    'cajamarca': [-7.1639, -78.5003],
    'huaraz': [-9.527, -77.5278],
    'tarapoto': [-6.4853, -76.3607],
    'moquegua': [-17.1939, -70.9355],
    'tumbes': [-3.5669, -80.4515],
    'moyobamba': [-6.034, -76.9724],
    'cerro de pasco': [-10.6882, -76.2588],
    'pasco': [-10.6882, -76.2588],
    'huanuco': [-9.9306, -76.2401],
    'huánuco': [-9.9306, -76.2401],
    'abancay': [-13.6354, -72.8814],
    'puerto maldonado': [-12.5931, -69.1891],
    'chimbote': [-9.0746, -78.5936],
    'sullana': [-4.9048, -80.6855],
    'ilo': [-17.6394, -71.3369],
    'nazca': [-14.8296, -74.9436],
    'nasc': [-14.8296, -74.9436],
    'andahuaylas': [-13.6569, -73.3808],
    'huancavelica': [-12.7842, -74.9731],
    'amazonas': [-6.2299, -77.8697],
    'chachapoyas': [-6.2299, -77.8697],
    'loreto': [-3.7491, -73.2538],
    'madre de dios': [-12.5931, -69.1891],
    'san martin': [-6.4853, -76.3607],
    'san martín': [-6.4853, -76.3607],
    'ucayali': [-8.3791, -74.5539],
    'apurimac': [-13.6354, -72.8814],
    'apurímac': [-13.6354, -72.8814],
    'miraflores': [-12.1219, -77.0295],
    'san isidro': [-12.0974, -77.0365],
    'barranco': [-12.1531, -77.0216],
    'surco': [-12.1484, -76.9898],
    'callao': [-12.0565, -77.1181],
    'ate': [-12.0186, -76.9246],
    'villa el salvador': [-12.2138, -76.9313],
  };

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

  private readonly statusColorMap: Record<string, string> = {
    approved: '#05CD99',
    sunat_valid: '#05CD99',
    paid: '#3B82F6',
    settled: '#14B8A6',
    pending: '#FFB547',
    pending_l1: '#FFB547',
    pending_l2: '#F59E0B',
    sunat_valid_not_ours: '#FCD34D',
    sunat_not_found: '#9CA3AF',
    rejected: '#D31212',
    sunat_error: '#D31212',
    returned: '#8B5CF6',
    cancelled: '#9CA3AF',
    draft: '#CBD5E1',
    // Estados de rendición (expense-report)
    solicited: '#6366F1',
    open: '#94A3B8',
    submitted: '#3B82F6',
    pending_accounting: '#F59E0B',
    reimbursed: '#10B981',
    closed: '#0EA5E9',
  };

  private readonly expenseStatusLabels: Record<string, string> = {
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    sunat_valid: 'Válida SUNAT',
    sunat_valid_not_ours: 'Válida externa',
    sunat_not_found: 'No encontrada',
    sunat_error: 'Error SUNAT',
  };

  private readonly advanceStatusLabels: Record<string, string> = {
    draft: 'Borrador',
    pending_l1: 'Pend. Nivel 1',
    pending_l2: 'Pend. Nivel 2',
    pending_contabilidad: 'Pend. Contabilidad',
    approved: 'Aprobado',
    viatico_approved: 'Aprobado',
    partially_paid: 'Pago parcial',
    paid: 'Pagado',
    settled: 'Liquidado',
    rejected: 'Rechazado',
    returned: 'Devuelto',
    cancelled: 'Cancelado',
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
    ]).subscribe(([projects, categories, users]) => {
      this.projects = (projects as IProject[]) || [];
      this.categories = (categories as ICategory[]) || [];
      this.collaborators = ((users as IUserResponse[]) || [])
        .map((u) => ({ id: u._id || '', name: u.name || u.email || 'Sin nombre' }))
        .filter((u) => !!u.id);
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
      })
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.kpis.set(res.kpis);
          this.loading.set(false);
          this.animateKpis(res.kpis);
          this.cdr.detectChanges();
          this.tryRenderCharts();
          // Map needs a tick for the DOM element to exist
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
    this.renderStatusChart();
    this.renderAdvanceChart();
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

  private renderMonthlyChart() {
    const ref = this.monthlyChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('monthly');
    const series = this.data()!.monthlySeries;
    const labels = series.map((s) => this.formatMonthLabel(s.month));

    this.charts['monthly'] = new Chart(ref, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Gasto',
            data: series.map((s) => s.gasto),
            backgroundColor: 'rgba(211, 18, 18, 0.85)',
            borderRadius: 6,
            order: 2,
          },
          {
            label: 'Anticipos',
            type: 'line',
            data: series.map((s) => s.anticipo),
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: '#3B82F6',
            order: 1,
          },
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
          legend: { position: 'right', labels: { boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                `${ctx.label}: ${this.formatCurrency(ctx.parsed)}`,
            },
          },
        },
      },
    });
  }

  private renderProjectChart() {
    const ref = this.projectChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('project');
    const rows = this.data()!.topProjects;
    this.charts['project'] = new Chart(ref, {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.name),
        datasets: [
          {
            label: 'Gasto',
            data: rows.map((r) => r.amount),
            backgroundColor: rows.map(
              (_, i) => this.palette[i % this.palette.length]
            ),
            borderRadius: 6,
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
              label: (ctx: any) => this.formatCurrency(ctx.parsed.x),
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

  private renderStatusChart() {
    const ref = this.statusChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('status');
    const rows = this.data()!.expenseByStatus;
    this.charts['status'] = new Chart(ref, {
      type: 'doughnut',
      data: {
        labels: rows.map((r) => this.expenseStatusLabel(r.status)),
        datasets: [
          {
            data: rows.map((r) => r.amount),
            backgroundColor: rows.map(
              (r) => this.statusColorMap[r.status] || '#9CA3AF'
            ),
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
          legend: { position: 'right', labels: { boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                `${ctx.label}: ${this.formatCurrency(ctx.parsed)}`,
            },
          },
        },
      },
    });
  }

  private renderAdvanceChart() {
    const ref = this.advanceChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('advance');
    const rows = this.data()!.advanceByStatus;
    this.charts['advance'] = new Chart(ref, {
      type: 'bar',
      data: {
        labels: rows.map((r) => this.advanceStatusLabel(r.status)),
        datasets: [
          {
            label: 'Monto',
            data: rows.map((r) => r.amount),
            backgroundColor: rows.map(
              (r) => this.statusColorMap[r.status] || '#9CA3AF'
            ),
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: this.baseAnimation(),
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                `${this.formatCurrency(ctx.parsed.y)} · ${
                  rows[ctx.dataIndex]?.count ?? 0
                } anticipos`,
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

  private renderCollaboratorChart() {
    const ref = this.collaboratorChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('collaborator');
    const rows = this.data()!.topCollaborators;
    this.charts['collaborator'] = new Chart(ref, {
      type: 'bar',
      data: {
        labels: rows.map((r) =>
          r.name.length > 22 ? r.name.slice(0, 22) + '…' : r.name
        ),
        datasets: [
          {
            label: 'Consumo',
            data: rows.map((r) => r.amount),
            backgroundColor: '#3B82F6',
            borderRadius: 6,
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
              label: (ctx: any) => this.formatCurrency(ctx.parsed.x),
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

  private renderLocationChart() {
    const ref = this.locationChartRef?.nativeElement;
    if (!ref) return;
    this.destroyChart('location');
    const rows = (this.data()?.topLocations ?? []).slice(0, 8);
    if (!rows.length) return;
    this.charts['location'] = new Chart(ref, {
      type: 'bar',
      data: {
        labels: rows.map((r) =>
          r.place.length > 20 ? r.place.slice(0, 20) + '…' : r.place
        ),
        datasets: [
          {
            label: 'Monto (S/)',
            data: rows.map((r) => r.amount),
            backgroundColor: rows.map(
              (_, i) => this.palette[i % this.palette.length]
            ),
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: this.baseAnimation(),
        onHover: (event: any, elements: any[]) => {
          event.native.target.style.cursor = elements?.length ? 'pointer' : 'default';
        },
        onClick: (_event: any, elements: any[]) => {
          const idx = elements?.[0]?.index;
          if (idx != null && rows[idx]) {
            this.focusLocation(rows[idx].place);
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                `${this.formatCurrency(ctx.parsed.x)} · ${rows[ctx.dataIndex]?.count ?? 0} viáticos`,
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

  private tryRenderMap() {
    const locations = (this.data()?.topLocations ?? []).slice(0, 5);
    if (!this.leafletLoaded || typeof L === 'undefined' || !locations.length) {
      return;
    }
    const el = document.getElementById('viaticos-map');
    if (!el) return;

    if (this.mapInstance) {
      this.mapInstance.remove();
      this.mapInstance = null;
    }

    const token = ++this.mapRenderToken;

    this.mapInstance = L.map('viaticos-map', {
      zoomControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }
    ).addTo(this.mapInstance);

    this.markersByPlace = {};
    const maxAmount = Math.max(...locations.map((l) => l.amount), 1);

    // 1) Marcadores que se resuelven localmente (lat/lng del backend o ciudad conocida).
    const resolved = this.resolveCoordinates(locations);
    resolved.forEach((p) => this.addLocationMarker(p, maxAmount, token));
    this.fitToMarkers();
    setTimeout(() => this.mapInstance?.invalidateSize(), 0);

    // 2) Los que no (direcciones completas) se geocodifican con Google y se agregan al llegar.
    const resolvedPlaces = new Set(resolved.map((p) => p.place));
    const missing = locations.filter((l) => !resolvedPlaces.has(l.place));
    if (missing.length) {
      this.geocodeAndAddMarkers(missing, maxAmount, token);
    }
  }

  /** Crea y agrega al mapa un marcador para un destino con coordenadas. */
  private addLocationMarker(
    p: ILocationPoint & { lat: number; lng: number },
    maxAmount: number,
    token: number
  ) {
    if (!this.mapInstance || token !== this.mapRenderToken) return;
    const marker = L.marker([p.lat, p.lng], {
      icon: this.createLeafletIcon(p.amount, maxAmount, p.count),
    });
    const popup = `
        <div style="font-family:sans-serif;min-width:160px">
          <div style="font-weight:700;font-size:14px;color:#1e293b;margin-bottom:6px">${p.place}</div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;margin-bottom:2px">
            <span>Viáticos</span><strong style="color:#1e293b">${p.count}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b">
            <span>Total</span><strong style="color:#D31212">${this.formatCurrency(p.amount)}</strong>
          </div>
        </div>
      `;
    marker.bindPopup(popup, { maxWidth: 200 });
    marker.addTo(this.mapInstance);
    this.markersByPlace[p.place] = marker;
  }

  /** Reajusta el encuadre del mapa a los marcadores presentes. */
  private fitToMarkers() {
    if (!this.mapInstance) return;
    const latLngs = Object.values(this.markersByPlace).map((m) => m.getLatLng());
    if (latLngs.length) {
      this.mapInstance.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
    } else {
      // Sin coordenadas todavía: centramos en Perú.
      this.mapInstance.setView([-9.19, -75.0152], 5);
    }
  }

  /**
   * Geocodifica con Google los destinos sin coordenadas y agrega sus marcadores.
   * Devuelve una promesa que resuelve cuando termina (útil para el enfoque on-demand).
   */
  private async geocodeAndAddMarkers(
    missing: ILocationPoint[],
    maxAmount: number,
    token: number
  ): Promise<void> {
    try {
      await this.mapsLoader.load();
    } catch {
      return;
    }
    if (typeof google === 'undefined') return;
    if (!this.geocoder) this.geocoder = new google.maps.Geocoder();

    for (const loc of missing) {
      let coords = this.geocodeCache[loc.place];
      if (coords === undefined) {
        // Google → si falla, reutiliza coords de un destino "hermano" (misma calle).
        coords = (await this.geocodeAddress(loc.place)) ?? this.siblingCoords(loc.place);
        this.geocodeCache[loc.place] = coords;
      }
      if (!coords) continue;
      if (!this.mapInstance || token !== this.mapRenderToken) return;
      this.addLocationMarker(
        { ...loc, lat: coords[0], lng: coords[1] },
        maxAmount,
        token
      );
      this.fitToMarkers();
    }
  }

  /**
   * Último recurso: si un destino no geocodifica, reutiliza las coordenadas de
   * otro destino del top cuya calle (primer segmento, sin números) sea la misma.
   */
  private siblingCoords(place: string): [number, number] | null {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .split(',')[0]
        .replace(/\d+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const target = norm(place);
    if (target.length < 5) return null;

    // 1) Entre marcadores ya colocados en el mapa.
    for (const [p, marker] of Object.entries(this.markersByPlace)) {
      if (p !== place && norm(p) === target) {
        const ll = marker.getLatLng();
        return [ll.lat, ll.lng];
      }
    }
    // 2) Entre destinos con coordenadas del backend.
    for (const l of this.data()?.topLocations ?? []) {
      if (l.place !== place && l.lat != null && l.lng != null && norm(l.place) === target) {
        return [l.lat, l.lng];
      }
    }
    return null;
  }

  /**
   * Resuelve una dirección a [lat, lng] con el Geocoder de Google,
   * probando varias variantes de la consulta hasta dar con una válida.
   */
  private async geocodeAddress(place: string): Promise<[number, number] | null> {
    for (const query of this.geocodeQueries(place)) {
      const coords = await this.geocodeOnce(query);
      if (coords) return coords;
    }
    return null;
  }

  /** Genera variantes de consulta para mejorar la tasa de aciertos del geocoder. */
  private geocodeQueries(place: string): string[] {
    const queries: string[] = [];
    const add = (q: string) => {
      const v = q.replace(/\s+/g, ' ').trim();
      if (v && v.length > 2 && !queries.includes(v)) queries.push(v);
    };
    // Quita números de calle y ruido tipo "Urb / Etapa N / Mz / Lt / Asoc".
    const clean = (s: string) =>
      s
        .replace(/\b\d{2,}\b/g, '')
        .replace(/\b(urb|urbanizaci[oó]n|etapa|mz|lt|lote|asoc|asociaci[oó]n)\b\.?/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    const withPeru = (s: string) => (/per[uú]/i.test(s) ? s : `${s}, Perú`);
    const parts = place.split(',').map((p) => p.trim()).filter(Boolean);

    add(withPeru(place));
    add(withPeru(clean(place)));
    if (parts.length > 1) {
      // Primer y último segmento por si el otro es ruido (p. ej. "Destino lima, ...").
      add(withPeru(clean(parts[0])));
      add(withPeru(clean(parts[parts.length - 1])));
    }
    return queries;
  }

  /** Una sola llamada al geocoder, con reintentos si Google limita el ritmo. */
  private geocodeOnce(
    query: string,
    attempt = 0
  ): Promise<[number, number] | null> {
    return new Promise((resolve) => {
      this.geocoder.geocode(
        { address: query, componentRestrictions: { country: 'PE' } },
        (results: any[], status: string) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            const l = results[0].geometry.location;
            resolve([l.lat(), l.lng()]);
          } else if (status === 'OVER_QUERY_LIMIT' && attempt < 3) {
            setTimeout(
              () => this.geocodeOnce(query, attempt + 1).then(resolve),
              300 * (attempt + 1)
            );
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Centra el mapa en el destino indicado y abre su popup.
   * Se invoca al hacer click en la lista de ranking o en una barra del chart.
   * Si el marcador aún no existe, intenta geocodificarlo bajo demanda.
   */
  focusLocation(place: string) {
    if (!place || !this.mapInstance) return;
    const marker = this.markersByPlace[place];
    if (marker) {
      this.panToMarker(marker);
      return;
    }
    // El destino aún no tiene marcador (no resuelto o geocoding en curso): lo intentamos ahora.
    const loc = (this.data()?.topLocations ?? []).find((l) => l.place === place);
    if (!loc) return;
    const maxAmount = Math.max(
      ...(this.data()?.topLocations ?? []).map((l) => l.amount),
      1
    );

    // 1) Resolución local (lat/lng del backend o ciudad conocida en el diccionario).
    const local = this.resolveCoordinates([loc])[0];
    if (local) {
      this.addLocationMarker(local, maxAmount, this.mapRenderToken);
      const m = this.markersByPlace[place];
      if (m) {
        this.panToMarker(m);
        return;
      }
    }

    // 2) Geocodificación con Google (+ fallback por hermano) como respaldo.
    //    Descartamos cualquier resultado nulo cacheado para reintentar con la cadena completa.
    if (!this.geocodeCache[place]) delete this.geocodeCache[place];
    this.geocodeAndAddMarkers([loc], maxAmount, this.mapRenderToken).then(() => {
      const m = this.markersByPlace[place];
      if (m) {
        this.panToMarker(m);
      } else {
        this.notificationService.show(
          `No se pudo ubicar "${place}" en el mapa`,
          'warning'
        );
      }
    });
  }

  /** Hace scroll al mapa, lo recentra sobre el marcador y abre su popup. */
  private panToMarker(marker: any) {
    if (!this.mapInstance) return;
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

  private createLeafletIcon(amount: number, maxAmount: number, count: number): any {
    const ratio = amount / maxAmount;
    const size = Math.round(28 + ratio * 24);
    const color =
      ratio > 0.66 ? '#D31212' : ratio > 0.33 ? '#F59E0B' : '#3B82F6';
    const glow =
      ratio > 0.66 ? 'rgba(211,18,18,0.25)' : ratio > 0.33 ? 'rgba(245,158,11,0.25)' : 'rgba(59,130,246,0.25)';
    const labelSize = count >= 100 ? 7 : count >= 10 ? 8 : 9;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 1.3)}" viewBox="0 0 40 52">
      <defs>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feFlood flood-color="${glow}" result="color"/>
          <feComposite in="color" in2="blur" operator="in" result="shadow"/>
          <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <radialGradient id="pinGrad" cx="40%" cy="35%">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <path d="M20 1C11.16 1 4 8.16 4 17C4 28.5 20 51 20 51S36 28.5 36 17C36 8.16 28.84 1 20 1Z"
            fill="url(#pinGrad)" filter="url(#glow)" stroke="white" stroke-width="1.5"/>
      <circle cx="20" cy="17" r="9" fill="white" opacity="0.95"/>
      <text x="20" y="${count >= 100 ? 21 : 22}" text-anchor="middle"
            font-family="system-ui,sans-serif" font-size="${labelSize}" font-weight="700"
            fill="${color}">${count}</text>
    </svg>`;

    return L.divIcon({
      html: svg,
      className: '',
      iconSize: [size, Math.round(size * 1.3)],
      iconAnchor: [size / 2, Math.round(size * 1.3)],
      popupAnchor: [0, -Math.round(size * 1.3)],
    });
  }

  private resolveCoordinates(
    locations: ILocationPoint[]
  ): (ILocationPoint & { lat: number; lng: number })[] {
    return locations
      .map((loc) => {
        if (loc.lat != null && loc.lng != null) {
          return { ...loc, lat: loc.lat, lng: loc.lng };
        }
        const key = loc.place.toLowerCase().trim();
        const coords = this.peruCityCoords[key];
        if (coords) {
          return { ...loc, lat: coords[0], lng: coords[1] };
        }
        // Partial match
        for (const [city, ll] of Object.entries(this.peruCityCoords)) {
          if (key.includes(city) || city.includes(key)) {
            return { ...loc, lat: ll[0], lng: ll[1] };
          }
        }
        return null;
      })
      .filter((x): x is ILocationPoint & { lat: number; lng: number } => x !== null);
  }

  // ─── Location KPI helpers ─────────────────────────────────────────────────

  get topLocationName(): string {
    return this.data()?.topLocations?.[0]?.place ?? '—';
  }

  get topLocationAmount(): number {
    return this.data()?.topLocations?.[0]?.amount ?? 0;
  }

  get uniqueDestinos(): number {
    return this.data()?.topLocations?.length ?? 0;
  }

  get avgAnticipoPorDestino(): number {
    const locs = this.data()?.topLocations ?? [];
    if (!locs.length) return 0;
    const total = locs.reduce((s, l) => s + l.amount, 0);
    return total / locs.length;
  }

  // ─── Template helpers ──────────────────────────────────────────────────────

  hasData(): boolean {
    const k = this.kpis();
    return (
      !!this.data() &&
      (k.gastoCount > 0 ||
        k.anticipoSolicitadoCount > 0 ||
        k.rendicionesTotal > 0)
    );
  }

  expenseStatusLabel(status: string): string {
    return this.expenseStatusLabels[status] || status;
  }

  advanceStatusLabel(status: string): string {
    return this.advanceStatusLabels[status] || status;
  }

  reportStatusLabel(status: string): string {
    return this.reportStatusLabels[status] || status;
  }

  expenseTypeLabel(type: string): string {
    return this.expenseTypeLabels[type] || type;
  }

  statusColor(status: string): string {
    return this.statusColorMap[status] || '#9CA3AF';
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
