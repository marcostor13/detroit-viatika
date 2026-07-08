import { Component, inject, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UserStateService } from '../../services/user-state.service';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { AdvanceService } from '../../services/advance.service';
import { SaldoService } from '../../services/saldo.service';
import { NotificationService } from '../../services/notification.service';
import { IExpenseReport } from '../../interfaces/expense-report.interface';
import { IAdvance, ADVANCE_STATUS_LABELS, ADVANCE_STATUS_COLORS } from '../../interfaces/advance.interface';
import { ButtonComponent } from '../../design-system/button/button.component';
import { IconComponent } from '../../design-system/icon/icon.component';

/** Fila normalizada que alimenta los listados del inicio (colaborador y coordinador). */
export interface DashRow {
  _id: string;
  source: 'report' | 'advance';
  title: string;
  userName: string;
  project: string;
  amount: number;
  status: string;
  statusLabel: string;
  statusColor: string;
  createdAt: string;
  /** Es el turno del usuario actual para aprobar esta solicitud (o es Superadmin). */
  canApproveNow: boolean;
}

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonComponent, IconComponent],
  templateUrl: './inicio.component.html',
})
export class InicioComponent implements OnInit {
  private userState = inject(UserStateService);
  private expenseReportsService = inject(ExpenseReportsService);
  private advanceService = inject(AdvanceService);
  private notifications = inject(NotificationService);
  saldoService = inject(SaldoService);
  private router = inject(Router);

  isLoading = signal(true);
  /** _id de la fila que se está aprobando (deshabilita su botón). */
  acting = signal<string | null>(null);

  // Colaborador: datos propios
  reports = signal<IExpenseReport[]>([]);        // rendiciones directas/normales
  viaticoReports = signal<IExpenseReport[]>([]); // solicitudes de viáticos (modelo nuevo)
  advances = signal<IAdvance[]>([]);             // solicitudes de viáticos (modelo legacy)

  // Coordinador: datos del equipo (scope por personal lo aplica el backend)
  teamReports = signal<IExpenseReport[]>([]);
  teamAdvances = signal<IAdvance[]>([]); // solicitudes de viáticos legacy del equipo (orphaned)

  // Toggles "ver más / expandir" por listado
  showAllViaticos = signal(false);       // Mi actividad: mis solicitudes de viáticos
  showAllRendiciones = signal(false);    // Mi actividad: mis rendiciones de viáticos
  showAllDirectas = signal(false);       // Mi actividad: mis rendiciones directas
  showAllAprobaciones = signal(false);   // Equipo: solicitudes por aprobar
  showAllPersonal = signal(false);       // Equipo: rendiciones por aprobar

  readonly PREVIEW = 5;

  readonly isCoordinador = this.userState.isCoordinador();

  // Permisos → controlan qué tarjetas/listas propias se muestran (tanto coordinador
  // como colaborador se rigen por lo que tengan ACTIVADO). Modelo del negocio:
  //   • Viáticos (solicitudes + rendiciones de viáticos) → módulo 'mis-rendiciones'
  //   • Rendiciones directas                            → módulo 'nueva-rendicion'
  // OJO: el módulo 'viaticos' es para gestión/aprobación, NO para tener viáticos
  // propios — por eso NO se usa aquí. Getters para reflejar permisos vigentes tras
  // refreshPermissions(). hasModulePermission ya devuelve true para admin/contab.
  get canSeeViaticos(): boolean {
    return this.userState.hasModulePermission('mis-rendiciones');
  }
  get canSeeRendiciones(): boolean {
    return this.userState.canCreateRendicion();
  }

  readonly STATUS_LABELS = ADVANCE_STATUS_LABELS;
  readonly STATUS_COLORS = ADVANCE_STATUS_COLORS;

  readonly REPORT_STATUS_LABELS: Record<string, string> = {
    solicited: 'Solicitada',
    open: 'Registrando gastos',
    submitted: 'Enviada',
    pending_accounting: 'En contabilidad',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    reimbursed: 'Reembolsada',
    closed: 'Cerrada',
    cancelled: 'Cancelada',
    // fases de viático (cuando el viático se modela como reporte)
    pending_l1: 'En solicitud',
    pending_l2: 'Aprobada por coordinador',
    viatico_approved: 'Aprobada',
    partially_paid: 'Pago parcial',
    settled: 'Liquidada',
    returned: 'Saldo devuelto',
  };

  readonly REPORT_STATUS_COLORS: Record<string, string> = {
    solicited: 'bg-purple-100 text-purple-700',
    open: 'bg-blue-100 text-blue-700',
    submitted: 'bg-yellow-100 text-yellow-700',
    pending_accounting: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    reimbursed: 'bg-teal-100 text-teal-700',
    closed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-orange-100 text-orange-700',
    pending_l1: 'bg-yellow-100 text-yellow-700',
    pending_l2: 'bg-orange-100 text-orange-700',
    viatico_approved: 'bg-blue-100 text-blue-700',
    partially_paid: 'bg-amber-100 text-amber-700',
    settled: 'bg-emerald-100 text-emerald-700',
  };

  /** Estados que NO cuentan como "sin cerrar" (rendición finalizada). */
  private readonly CLOSED_STATUSES = ['closed', 'cancelled', 'rejected', 'reimbursed'];

  /** Estados que cuentan como rendición de viáticos CERRADA/finalizada con éxito. */
  private readonly VIATICO_CLOSED_STATUSES = ['closed', 'reimbursed', 'settled', 'returned'];

  // ─── Greeting ─────────────────────────────────────────────────────
  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  get userName(): string {
    return this.userState.getUser()?.name?.split(' ')[0] || 'colaborador';
  }

  get subtitle(): string {
    return this.isCoordinador
      ? 'Aquí tienes lo pendiente de tu equipo.'
      : 'Aquí tienes un resumen de tu actividad.';
  }

  // ════════════════════════════════════════════════════════════════
  //  COLABORADOR / MI ACTIVIDAD — separado en VIÁTICOS vs RENDICIONES DIRECTAS
  // ════════════════════════════════════════════════════════════════

  private isDirecta(r: IExpenseReport): boolean {
    return r.isDirecta === true || r.type === 'directa';
  }

  /**
   * VIÁTICOS — Solicitudes: viáticos a la espera de aprobación (pending_l1/l2).
   * Modelo nuevo (reports type=viatico) + legacy (advances).
   */
  misSolicitudesViaticosRows = computed<DashRow[]>(() => {
    const fromReports = this.viaticoReports()
      .filter((r) => this.isPendingApproval(r.status))
      .map((r) => this.reportRow(r));
    const fromAdvances = this.advances()
      .filter((a) => this.isPendingApproval(a.status))
      .map((a) => this.advanceRow(a));
    return [...fromReports, ...fromAdvances].sort((a, b) => this.ts(b.createdAt) - this.ts(a.createdAt));
  });

  /**
   * VIÁTICOS — Rendiciones: viáticos ya aprobados que se están rindiendo (sin cerrar).
   * Modelo nuevo (type=viatico ya no pendiente) + legacy ("Viático: …", reports no
   * directos y no type viatico).
   */
  misRendicionesViaticosRows = computed<DashRow[]>(() => {
    const fromViatico = this.viaticoReports()
      .filter((r) => !this.isPendingApproval(r.status) && !this.CLOSED_STATUSES.includes(r.status))
      .map((r) => this.reportRow(r));
    const legacy = this.reports()
      .filter((r) => !this.isDirecta(r) && r.type !== 'viatico' && !this.CLOSED_STATUSES.includes(r.status))
      .map((r) => this.reportRow(r));
    return [...fromViatico, ...legacy].sort((a, b) => this.ts(b.createdAt) - this.ts(a.createdAt));
  });

  /** RENDICIONES DIRECTAS — propias del colaborador, sin cerrar (isDirecta). */
  misDirectasRows = computed<DashRow[]>(() =>
    this.reports()
      .filter((r) => this.isDirecta(r) && !this.CLOSED_STATUSES.includes(r.status))
      .sort((a, b) => this.ts(b.createdAt) - this.ts(a.createdAt))
      .map((r) => this.reportRow(r))
  );

  /**
   * Una rendición de viáticos cuenta como CERRADA cuando llegó a un estado final
   * (cerrada / reembolsada / liquidada / saldo devuelto) O cuando ya fue devuelta
   * con comprobante. Mismo criterio que `isReportEffectivelyClosed` de mis-rendiciones.
   */
  private isViaticoCerrado(r: IExpenseReport): boolean {
    return this.VIATICO_CLOSED_STATUSES.includes(r.status)
      || !!(r as any).returnVoucher;
  }

  /**
   * VIÁTICOS — Rendiciones CERRADAS. Misma partición que misRendicionesViaticosRows
   * pero con las rendiciones ya finalizadas (incluye saldo reutilizado en otra solicitud).
   */
  misRendicionesViaticosCerradasRows = computed<DashRow[]>(() => {
    const fromViatico = this.viaticoReports()
      .filter((r) => this.isViaticoCerrado(r))
      .map((r) => this.reportRow(r));
    const legacy = this.reports()
      .filter((r) => !this.isDirecta(r) && r.type !== 'viatico' && this.isViaticoCerrado(r))
      .map((r) => this.reportRow(r));
    return [...fromViatico, ...legacy].sort((a, b) => this.ts(b.createdAt) - this.ts(a.createdAt));
  });

  kpiSolicitudesViaticos = computed(() => this.misSolicitudesViaticosRows().length);
  kpiRendicionesViaticos = computed(() => this.misRendicionesViaticosRows().length);
  kpiViaticosCerradas = computed(() => this.misRendicionesViaticosCerradasRows().length);
  kpiDirectasSinCerrar = computed(() => this.misDirectasRows().length);

  /**
   * PENDIENTES DE ACCIÓN del colaborador: rendiciones donde debe subir gastos o
   * enviarlas a revisión. Estados: 'open'/'solicited' (registrando gastos) y
   * 'rejected' (corregir y reenviar). Se cuentan POR SECCIÓN (viáticos / directas).
   */
  private readonly ACTION_NEEDED = ['open', 'solicited', 'rejected'];
  private isActionNeeded = (r: DashRow) => this.ACTION_NEEDED.includes(r.status);

  /** Rendiciones de viáticos que el colaborador debe subir/enviar. */
  kpiPendientesViaticos = computed(() => this.misRendicionesViaticosRows().filter(this.isActionNeeded).length);
  /** Rendiciones directas que el colaborador debe subir/enviar. */
  kpiPendientesDirectas = computed(() => this.misDirectasRows().filter(this.isActionNeeded).length);

  // ════════════════════════════════════════════════════════════════
  //  COORDINADOR
  // ════════════════════════════════════════════════════════════════

  /**
   * Solicitudes por aprobar (equipo): el colaborador recién envió la solicitud de
   * viáticos y espera la firma del coordinador (pending_l1 / pending_l2). Incluye el
   * modelo nuevo (reports type=viatico) y el legacy (advances orphaned), igual que /rendiciones.
   */
  solicitudesRows = computed<DashRow[]>(() => {
    const fromReports = this.teamReports()
      .filter((r) => r.type === 'viatico' && this.isPendingApproval(r.status))
      .map((r) => this.reportRow(r));
    const fromAdvances = this.teamAdvances()
      .filter((a) => this.isPendingApproval(a.status))
      .map((a) => this.advanceRow(a));
    return [...fromReports, ...fromAdvances].sort((a, b) => this.ts(b.createdAt) - this.ts(a.createdAt));
  });

  kpiSolicitudesPendientes = computed(() => this.solicitudesRows().length);

  /**
   * Rendiciones por aprobar (equipo): 2ª etapa de la solicitud de viáticos. El viático
   * ya fue aprobado y pagado; el colaborador rindió sus gastos y el reporte espera la
   * aprobación del coordinador. SOLO estado 'submitted' (Enviada): cuando pasa a
   * 'pending_accounting' (En contabilidad) ya salió del coordinador → no se lista ni
   * cuenta aquí. Son viáticos en su fase de rendición — las directas NO van aquí.
   */
  rendicionesRows = computed<DashRow[]>(() =>
    this.teamReports()
      .filter((r) => r.type === 'viatico' && r.status === 'submitted')
      .sort((a, b) => this.ts(b.createdAt) - this.ts(a.createdAt))
      .map((r) => this.reportRow(r))
  );

  kpiRendicionesPorAprobar = computed(() => this.rendicionesRows().length);

  // ─── Slices visibles (preview 5 + expandir) ───────────────────────
  // Mi actividad (propias) — Viáticos
  visibleSolViaticos = computed(() => this.slice(this.misSolicitudesViaticosRows(), this.showAllViaticos()));
  visibleRendViaticos = computed(() => this.slice(this.misRendicionesViaticosRows(), this.showAllRendiciones()));
  // Mi actividad (propias) — Rendiciones directas
  visibleDirectasPropias = computed(() => this.slice(this.misDirectasRows(), this.showAllDirectas()));
  // Aprobación de mi equipo
  visibleSolicitudes = computed(() => this.slice(this.solicitudesRows(), this.showAllAprobaciones()));
  visibleRendicionesAprob = computed(() => this.slice(this.rendicionesRows(), this.showAllPersonal()));

  private slice(rows: DashRow[], showAll: boolean): DashRow[] {
    return showAll ? rows : rows.slice(0, this.PREVIEW);
  }

  // ─── Carga ────────────────────────────────────────────────────────
  ngOnInit() {
    this.saldoService.refreshTotal();
    // Trae los permisos vigentes del servidor (los de localStorage pueden estar
    // desactualizados si se cambiaron en otra sesión) para gatear bien las tarjetas.
    this.userState.refreshPermissions().subscribe();

    const user = this.userState.getUser() as any;
    const userId = user?._id;
    const clientId = user?.companyId || user?.clientId;

    if (!userId || !clientId) {
      this.isLoading.set(false);
      return;
    }

    if (this.isCoordinador) {
      this.loadCoordinador(clientId);
    } else {
      this.loadColaborador(userId, clientId);
    }
  }

  private loadColaborador(userId: string, clientId: string) {
    forkJoin({
      reports: this.expenseReportsService.findAllByUser(userId, clientId).pipe(catchError(() => of([]))),
      viaticos: this.expenseReportsService.getMyViaticos().pipe(catchError(() => of([]))),
      advances: this.advanceService.findMy().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ reports, viaticos, advances }) => {
        this.reports.set(reports);
        this.viaticoReports.set(viaticos);
        this.advances.set(advances);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  /**
   * Coordinador = aprobador de su equipo + usuario que también rinde. Cargamos:
   * - teamReports: `expense-report/client/:clientId` → el backend aplica
   *   `findAllByCoordinator` (solo su personal) para las colas de aprobación.
   * - reports/viaticoReports/advances: SUS PROPIAS rendiciones y solicitudes
   *   (igual que un colaborador), para la sección "Mi actividad" (/mis-rendiciones).
   */
  private loadCoordinador(clientId: string) {
    const userId = (this.userState.getUser() as any)?._id;
    forkJoin({
      team: this.expenseReportsService.findAllByClient(clientId).pipe(catchError(() => of([]))),
      teamAdvances: this.advanceService.findOrphaned(clientId).pipe(catchError(() => of([]))),
      ownReports: this.expenseReportsService.findAllByUser(userId, clientId).pipe(catchError(() => of([]))),
      ownViaticos: this.expenseReportsService.getMyViaticos().pipe(catchError(() => of([]))),
      ownAdvances: this.advanceService.findMy().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ team, teamAdvances, ownReports, ownViaticos, ownAdvances }) => {
        this.teamReports.set(team);
        this.teamAdvances.set(teamAdvances);
        this.reports.set(ownReports);
        this.viaticoReports.set(ownViaticos);
        this.advances.set(ownAdvances);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  /** Recarga solo las colas de aprobación del equipo (tras aprobar una fila). */
  private reloadCoordinador() {
    const user = this.userState.getUser() as any;
    const clientId = user?.companyId || user?.clientId;
    if (!clientId) return;
    forkJoin({
      team: this.expenseReportsService.findAllByClient(clientId).pipe(catchError(() => of([]))),
      teamAdvances: this.advanceService.findOrphaned(clientId).pipe(catchError(() => of([]))),
    }).subscribe(({ team, teamAdvances }) => {
      this.teamReports.set(team);
      this.teamAdvances.set(teamAdvances);
    });
  }

  // ─── Aprobaciones inline (coordinador) ────────────────────────────
  /** ¿El aprobador puede aprobar esta fila (es su turno o es Superadmin)? */
  canApproveRow(row: DashRow, kind: 'solicitud' | 'rendicion'): boolean {
    if (kind === 'rendicion') return true; // aprobación de comprobantes a nivel reporte
    return row.canApproveNow;
  }

  approveRow(row: DashRow, kind: 'solicitud' | 'rendicion') {
    // Rendición: la aprobación es por comprobante (y depende de la validación previa
    // de Contabilidad), estado que la lista no conoce. Llevamos al detalle, donde el
    // coordinador aprueba con el estado real por comprobante.
    if (kind === 'rendicion') {
      this.goToRow(row);
      return;
    }

    if (this.acting()) return;
    this.acting.set(row._id);

    // Solicitud de viáticos: el viático puede venir como reporte (modelo nuevo) o
    // como advance (legacy): cada uno tiene su propio endpoint de aprobación.
    const call$: Observable<unknown> = row.source === 'advance'
      ? this.advanceService.approve(row._id, {})
      : this.expenseReportsService.approveViatico(row._id);
    call$.subscribe({
      next: () => {
        this.acting.set(null);
        this.notifications.show('Solicitud aprobada.', 'success');
        this.reloadCoordinador();
      },
      error: (e: any) => {
        this.acting.set(null);
        this.notifications.show(e?.error?.message || 'Error al aprobar la solicitud', 'error');
      },
    });
  }

  private get currentUserId(): string {
    return (this.userState.getUser() as any)?._id ?? '';
  }

  private approverIdAt(chain: ({ _id: string } | string)[] | undefined, level: number): string {
    const entry = chain?.[level];
    if (!entry) return '';
    return typeof entry === 'object' ? entry._id : entry;
  }

  // ─── Mapeo a filas ────────────────────────────────────────────────
  private reportRow(r: IExpenseReport): DashRow {
    return {
      _id: r._id,
      source: 'report',
      title: r.title || (r as any).viaticoPlace || '—',
      userName: this.resolveUserName(r.userId),
      project: this.resolveProject((r as any).projectId),
      amount: (r as any).viaticoAmount ?? r.budget ?? 0,
      status: r.status,
      statusLabel: this.REPORT_STATUS_LABELS[r.status] ?? r.status,
      statusColor: this.REPORT_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600',
      createdAt: r.createdAt,
      canApproveNow: r.status === 'pending_l1' &&
        (this.userState.isSuperAdmin() || this.approverIdAt(r.viaticoApproverChain, r.viaticoApprovalLevel ?? 0) === this.currentUserId),
    };
  }

  private advanceRow(a: IAdvance): DashRow {
    return {
      _id: a._id,
      source: 'advance',
      title: (a as any).place || (a as any).description || '—',
      userName: this.resolveUserName(a.userId),
      project: this.resolveProject((a as any).projectId),
      amount: (a as any).amount ?? 0,
      status: a.status,
      statusLabel: this.STATUS_LABELS[a.status] ?? a.status,
      statusColor: this.STATUS_COLORS[a.status] ?? 'bg-gray-100 text-gray-600',
      createdAt: a.createdAt,
      canApproveNow: a.status === 'pending_l1' &&
        (this.userState.isSuperAdmin() || this.approverIdAt(a.approverChain, a.approvalLevel) === this.currentUserId),
    };
  }

  private resolveUserName(userId: unknown): string {
    if (userId && typeof userId === 'object') {
      return (userId as any).name || (userId as any).email || '—';
    }
    return '—';
  }

  /** Etiqueta del proyecto (código — nombre) si viene poblado. */
  private resolveProject(projectId: unknown): string {
    if (projectId && typeof projectId === 'object') {
      const p = projectId as any;
      return p.code ? `${p.code} — ${p.name}` : (p.name ?? '');
    }
    return '';
  }

  // ─── Helpers de estilo para tarjetas KPI reutilizables ────────────
  private readonly ACCENT_BG: Record<string, string> = {
    yellow: 'bg-yellow-100', blue: 'bg-blue-100', purple: 'bg-purple-100',
    primary: 'bg-primary/10', red: 'bg-red-100', green: 'bg-green-100',
  };
  private readonly ACCENT_TEXT: Record<string, string> = {
    yellow: 'text-yellow-600', blue: 'text-blue-600', purple: 'text-purple-600',
    primary: 'text-primary', red: 'text-red-600', green: 'text-green-600',
  };
  iconBg(accent: string, active: boolean): string {
    return active ? (this.ACCENT_BG[accent] ?? 'bg-ink-100') : 'bg-ink-100';
  }
  iconText(accent: string, active: boolean): string {
    return active ? (this.ACCENT_TEXT[accent] ?? 'text-tertiary') : 'text-tertiary';
  }

  private isPendingApproval(status: string): boolean {
    return status === 'pending_l1' || status === 'pending_l2';
  }

  private ts(date: string | undefined): number {
    return date ? new Date(date).getTime() : 0;
  }

  // ─── Navegación ───────────────────────────────────────────────────
  goToRow(row: DashRow) {
    if (row.source === 'advance') {
      this.router.navigate(['/viaticos', row._id]);
    } else {
      this.router.navigate(['/mis-rendiciones', row._id, 'detalle']);
    }
  }
}
