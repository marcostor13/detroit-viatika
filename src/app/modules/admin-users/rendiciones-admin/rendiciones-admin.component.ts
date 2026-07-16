import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { ExpenseReportsService, IExpenseReportDeletionPreview } from '../../../services/expense-reports.service';
import { buildReportFlowSteps, FlowStep } from '../../../shared/flow-steps.util';
import { AdminUsersService } from '../services/admin-users.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { UserStateService } from '../../../services/user-state.service';
import { NotificationService } from '../../../services/notification.service';
import { AdvanceService } from '../../../services/advance.service';
import { CategoriaService } from '../../../services/categoria.service';
import { IExpenseReport, IChainStep } from '../../../interfaces/expense-report.interface';
import { IAdvance, ADVANCE_STATUS_LABELS, ADVANCE_STATUS_COLORS } from '../../../interfaces/advance.interface';
import { IUserResponse } from '../../../interfaces/user.interface';
import { IProject } from '../../invoices/interfaces/project.interface';

const REPORT_STATUS_LABELS: Record<string, string> = {
  // Rendición normal
  solicited: 'Solicitada',
  open: 'Registrando gastos',
  submitted: 'Enviada',
  pending_accounting: 'En contabilidad',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  reimbursed: 'Reembolsada',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
  // Fases de viático (estados iniciales = solicitud)
  pending_l1: 'En solicitud',
  pending_l2: 'Aprobada por coordinador',
  pending_contabilidad: 'Pendiente de Contabilidad',
  viatico_approved: 'Aprobada',
  partially_paid: 'Pago parcial',
  settled: 'Liquidada',
  returned: 'Saldo devuelto',
};

const REPORT_STATUS_COLORS: Record<string, string> = {
  solicited: 'bg-purple-100 text-purple-800',
  open: 'bg-blue-100 text-blue-800',
  submitted: 'bg-yellow-100 text-yellow-800',
  pending_accounting: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  reimbursed: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-gray-100 text-gray-500',
  pending_l1: 'bg-yellow-100 text-yellow-800',
  pending_l2: 'bg-orange-100 text-orange-700',
  pending_contabilidad: 'bg-orange-100 text-orange-700',
  viatico_approved: 'bg-blue-100 text-blue-800',
  partially_paid: 'bg-amber-100 text-amber-700',
  settled: 'bg-emerald-100 text-emerald-800',
};

export type UnifiedRendicionItem = {
  _id: string;
  source: 'report' | 'advance';
  /** Tipo de solicitud, para distinguirlas en la tabla. */
  kind: 'viatico' | 'directa' | 'anticipo';
  kindLabel: string;
  kindColor: string;
  userName: string;
  userInitials: string;
  userId: string;
  title: string;
  projectName: string;
  projectId: string;
  amount: number;
  status: string;
  statusLabel: string;
  statusColor: string;
  createdAt: string;
  canDeleteItem: boolean;
  /** Es el turno del usuario actual para aprobar (o es Superadmin). Solo aplica a viáticos/anticipos. */
  canApproveNow: boolean;
  canReject: boolean;
  /** true cuando el paso pendiente es el gate final de Contabilidad (no la cadena de centro de costo). */
  isContabilidadGate: boolean;
  approvalLevel: number;
  requiredLevels: number;
  /** Progreso agregado por comprobante (solo directa: ya no tiene cadena a nivel de reporte). */
  directaProgress: { approved: number; total: number } | null;
  raw: IExpenseReport | IAdvance;
};

@Component({
  selector: 'app-rendiciones-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './rendiciones-admin.component.html',
})
export class RendicionesAdminComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private expenseReportsService = inject(ExpenseReportsService);
  private adminUsersService = inject(AdminUsersService);
  private invoicesService = inject(InvoicesService);
  private userStateService = inject(UserStateService);
  private notifications = inject(NotificationService);
  private advanceService = inject(AdvanceService);
  private categoriaService = inject(CategoriaService);
  private fb = inject(FormBuilder);

  private allReports: IExpenseReport[] = [];
  private allOrphanedAdvances: IAdvance[] = [];
  /** Nombre de categoría por id, para mostrar el detalle de líneas al aprobar. */
  private categoryNameById = new Map<string, string>();

  filteredItems: UnifiedRendicionItem[] = [];
  users: IUserResponse[] = [];
  projects: IProject[] = [];

  isLoading = true;
  isActing = signal(false);

  // ─── Filas expandibles (detalle inline para no cortar columnas) ─────────────
  expandedRows = signal<Set<string>>(new Set<string>());
  toggleExpand(id: string, event?: Event): void {
    event?.stopPropagation();
    const set = new Set<string>(this.expandedRows());
    set.has(id) ? set.delete(id) : set.add(id);
    this.expandedRows.set(set);
  }
  isExpanded(id: string): boolean { return this.expandedRows().has(id); }
  reportToDelete: IExpenseReport | null = null;
  isDeleting = false;
  loadingDeletionPreview = signal(false);
  deletionPreview = signal<IExpenseReportDeletionPreview | null>(null);

  filterUserId = '';
  filterProjectId = '';
  filterStatus = '';
  filterKind = '';
  filterDateFrom = '';
  filterDateTo = '';
  /** Estados presentes en la lista (para el filtro por estado). Se recalcula en applyFilters. */
  statusOptions: { value: string; label: string }[] = [];
  /** Tipos presentes en la lista (Directa/Viático/Anticipo). Se recalcula en applyFilters. */
  kindOptions: { value: string; label: string }[] = [];

  // Approve modal
  showApproveModal = signal(false);
  pendingApproveItem = signal<UnifiedRendicionItem | null>(null);

  // Reject modal
  showRejectModal = signal(false);
  selectedRejectItem = signal<UnifiedRendicionItem | null>(null);
  rejectForm!: FormGroup;

  // Detalle de solicitud (modal, en vez de redirigir cuando hay que aprobar/rechazar)
  showDetailModal = signal(false);
  detailItem = signal<UnifiedRendicionItem | null>(null);
  expandedDetailLineIds = signal<Set<number>>(new Set());

  private get currentUserId(): string {
    return (this.userStateService.getUser() as any)?._id ?? '';
  }

  private get isSuperAdmin(): boolean {
    return this.userStateService.isSuperAdmin();
  }

  /** Usado para el acceso a registro de pagos (Tesorería), no para la cadena de aprobadores. */
  get userCanApproveL2() { return this.userStateService.canApproveL2(); }

  private approverIdAt(chain: ({ _id: string } | string)[] | undefined, level: number): string {
    const entry = chain?.[level];
    if (!entry) return '';
    return typeof entry === 'object' ? entry._id : entry;
  }

  /** ¿El usuario actual está entre los `approverIds` del paso `level` de una cadena por centro de costo? */
  private isApproverOfStep(chain: IChainStep[] | undefined, level: number): boolean {
    const step = chain?.[level];
    if (!step) return false;
    return step.approverIds.some(a => (typeof a === 'object' ? a._id : a) === this.currentUserId);
  }

  ngOnInit(): void {
    this.rejectForm = this.fb.group({
      rejectionReason: ['', [Validators.required, Validators.minLength(10)]],
    });
    const preselectedUser = this.route.snapshot.queryParamMap.get('userId');
    if (preselectedUser) this.filterUserId = preselectedUser;
    this.loadData();
  }

  private loadData(): void {
    const currentUser = this.userStateService.getUser() as any;
    const clientId = currentUser?.companyId || currentUser?.clientId;
    if (!clientId) { this.isLoading = false; return; }

    forkJoin({
      reports: this.expenseReportsService.findAllByClient(clientId),
      advances: this.advanceService.findOrphaned(clientId),
    }).subscribe({
      next: ({ reports, advances }) => {
        // Para un aprobador (cualquiera de los comprobantes de la directa, no un
        // rol específico), el backend (findAllByCoordinator) ya limita las
        // directas a las que le corresponden — se muestran aquí para que pueda
        // aprobarlas/rechazarlas por comprobante desde el detalle. Para el resto
        // de roles no-aprobadores (Admin/Contabilidad/SuperAdmin sin cadena
        // propia) se siguen ocultando: ya tienen su propia vista dedicada en
        // /rendiciones?tab=directas.
        const isApprover = this.userStateService.isApprover();
        this.allReports = reports.filter((r) => !r.isDirecta || isApprover);
        this.allOrphanedAdvances = advances;
        this.applyFilters();
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; },
    });

    this.adminUsersService.getUsers().subscribe({
      next: (users) => { this.users = users; },
      error: () => {},
    });

    this.invoicesService.getProjects(clientId).subscribe({
      next: (projects) => { this.projects = projects; },
      error: () => {},
    });

    this.categoriaService.getAllFlat().subscribe({
      next: (cats) => {
        this.categoryNameById.clear();
        for (const c of cats ?? []) this.categoryNameById.set(String(c._id), c.name);
      },
      error: () => {},
    });
  }

  /** Líneas por categoría de una solicitud (viático o anticipo). Vacío si no aplica. */
  linesForItem(item: UnifiedRendicionItem | null): any[] {
    if (!item) return [];
    if (item.source === 'advance') return (item.raw as IAdvance).lines ?? [];
    const raw = item.raw as IExpenseReport;
    return raw.type === 'viatico' ? ((raw as any).viaticoLines ?? []) : [];
  }

  /** Líneas por categoría del viático en revisión (vacío si no es viático). */
  approveViaticoLines(): any[] {
    return this.linesForItem(this.pendingApproveItem());
  }

  /** Nombre de la categoría de una línea (acepta id suelto o ya poblado). */
  viaticoCategoryName(line: any): string {
    const c = line?.categoryId;
    if (c && typeof c === 'object' && 'name' in c) return (c as { name: string }).name;
    return this.categoryNameById.get(String(c)) || '—';
  }

  // Acordeón del detalle por categoría en el modal de aprobación (índices expandidos; colapsado por defecto)
  expandedApproveLineIds = signal<Set<number>>(new Set());

  toggleApproveLine(index: number): void {
    const s = new Set(this.expandedApproveLineIds());
    if (s.has(index)) { s.delete(index); } else { s.add(index); }
    this.expandedApproveLineIds.set(s);
  }

  isApproveLineExpanded(index: number): boolean {
    return this.expandedApproveLineIds().has(index);
  }

  applyFilters(): void {
    const reportItems: UnifiedRendicionItem[] = this.allReports.map(r => {
      const uid = typeof r.userId === 'object' ? r.userId?._id : r.userId;
      const pid = typeof r.projectId === 'object' ? r.projectId?._id : r.projectId;
      const name = this.getReportUserName(r);
      const isViatico = r.type === 'viatico';
      const isDirectaChain = r.isDirecta === true;
      return {
        _id: r._id,
        source: 'report' as const,
        kind: (isDirectaChain ? 'directa' : 'viatico') as UnifiedRendicionItem['kind'],
        kindLabel: isDirectaChain ? 'Directa' : 'Viático',
        kindColor: isDirectaChain ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700',
        userName: name,
        userInitials: this.initials(name),
        userId: uid ?? '',
        title: r.title || r.viaticoPlace || '—',
        projectName: this.getProjectName(r),
        projectId: pid ?? '',
        // Directa: el monto a mostrar es la suma de los gastos cargados por el
        // colaborador (no `budget`, que en una directa es 0). VD-25.
        amount: isDirectaChain
          ? this.reportExpensesTotal(r)
          : (r.viaticoAmount ?? r.budget ?? 0),
        status: r.status,
        statusLabel: REPORT_STATUS_LABELS[r.status] ?? r.status,
        statusColor: REPORT_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-700',
        createdAt: r.createdAt,
        canDeleteItem: this.canDeleteReport(r),
        // La rendición directa ya no tiene aprobación a nivel de reporte — cada
        // comprobante tiene su propia cadena (ver rendicion-detail/gasto-detalle).
        // Esta bandeja solo ofrece acción report-level para viático.
        canApproveNow: isViatico && (
          (r.status === 'pending_l1' &&
            (this.isSuperAdmin || this.isApproverOfStep(r.viaticoApproverChain, r.viaticoApprovalLevel ?? 0))) ||
          (r.status === 'pending_contabilidad' && (this.isSuperAdmin || this.userStateService.isContabilidad()))
        ),
        canReject: isViatico && (
          (r.status === 'pending_l1' &&
            (this.isSuperAdmin || this.isApproverOfStep(r.viaticoApproverChain, r.viaticoApprovalLevel ?? 0))) ||
          (r.status === 'pending_contabilidad' && (this.isSuperAdmin || this.userStateService.isContabilidad()))
        ),
        isContabilidadGate: r.status === 'pending_contabilidad',
        approvalLevel: (isDirectaChain ? 0 : r.viaticoApprovalLevel) ?? 0,
        requiredLevels: (isDirectaChain ? 1 : r.viaticoRequiredLevels) ?? 1,
        directaProgress: isDirectaChain ? this.reportDirectaProgress(r) : null,
        raw: r,
      };
    });

    const advanceItems: UnifiedRendicionItem[] = this.allOrphanedAdvances.map(a => {
      const u = typeof a.userId === 'object' ? a.userId : null;
      const p = typeof a.projectId === 'object' ? a.projectId : null;
      const uid = u ? (u as any)._id : (a.userId as string);
      const pid = p ? (p as any)._id : (a.projectId as string ?? '');
      const name = u ? (u as any).name ?? '—' : (this.users.find(x => x._id === uid)?.name ?? '—');
      const projectName = p ? ((p as any).code ? `${(p as any).code} — ${(p as any).name}` : (p as any).name ?? '—') : '—';
      return {
        _id: a._id,
        source: 'advance' as const,
        kind: 'anticipo' as UnifiedRendicionItem['kind'],
        kindLabel: 'Anticipo',
        kindColor: 'bg-violet-100 text-violet-700',
        userName: name,
        userInitials: this.initials(name),
        userId: uid ?? '',
        title: a.place || a.description || '—',
        projectName,
        projectId: pid,
        amount: a.amount ?? 0,
        status: a.status,
        statusLabel: ADVANCE_STATUS_LABELS[a.status] ?? a.status,
        statusColor: ADVANCE_STATUS_COLORS[a.status] ?? 'bg-gray-100 text-gray-700',
        createdAt: a.createdAt,
        canDeleteItem: false,
        canApproveNow: a.status === 'pending_l1' &&
          (this.isSuperAdmin || this.approverIdAt(a.approverChain, a.approvalLevel) === this.currentUserId),
        canReject: a.status === 'pending_l1' &&
          (this.isSuperAdmin || this.approverIdAt(a.approverChain, a.approvalLevel) === this.currentUserId),
        isContabilidadGate: false,
        approvalLevel: a.approvalLevel,
        requiredLevels: a.requiredLevels,
        directaProgress: null,
        raw: a,
      };
    });

    const items = [...reportItems, ...advanceItems];

    // Opciones del filtro por estado HOMOLOGADAS con la columna Estado de la tabla
    // (VD-30): se agrupan por la ETIQUETA visible, no por el status crudo. Así se
    // evita que aparezcan opciones duplicadas —p. ej. `approved` y `viatico_approved`
    // ambas se muestran como "Aprobada"— y al elegir una opción se filtran TODAS las
    // filas que muestran ese mismo estado, tal como se ven en la tabla.
    const seenLabels = new Set<string>();
    for (const it of items) seenLabels.add(it.statusLabel);
    this.statusOptions = [...seenLabels]
      .map(label => ({ value: label, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // Si la etiqueta filtrada ya no existe en los datos, se limpia para no ocultar todo.
    if (this.filterStatus && !seenLabels.has(this.filterStatus)) {
      this.filterStatus = '';
    }

    // Opciones del filtro por tipo: los tipos presentes en la lista. VD-30.
    const seenKinds = new Map<string, string>();
    for (const it of items) {
      if (!seenKinds.has(it.kind)) seenKinds.set(it.kind, it.kindLabel);
    }
    this.kindOptions = [...seenKinds.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (this.filterKind && !seenKinds.has(this.filterKind)) {
      this.filterKind = '';
    }

    let result = items;

    if (this.filterUserId) {
      result = result.filter(i => i.userId === this.filterUserId);
    }
    if (this.filterProjectId) {
      result = result.filter(i => i.projectId === this.filterProjectId);
    }
    if (this.filterStatus) {
      // Se filtra por la etiqueta visible (homologada con la tabla), no por el
      // status crudo, para que coincida 1:1 con lo que muestra la columna Estado.
      result = result.filter(i => i.statusLabel === this.filterStatus);
    }
    if (this.filterKind) {
      result = result.filter(i => i.kind === this.filterKind);
    }
    if (this.filterDateFrom) {
      const from = new Date(this.filterDateFrom).getTime();
      result = result.filter(i => new Date(i.createdAt).getTime() >= from);
    }
    if (this.filterDateTo) {
      const to = new Date(this.filterDateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(i => new Date(i.createdAt).getTime() <= to.getTime());
    }

    this.filteredItems = result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  clearFilters(): void {
    this.filterUserId = '';
    this.filterProjectId = '';
    this.filterStatus = '';
    this.filterKind = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.applyFilters();
  }

  get hasActiveFilters(): boolean {
    return !!(this.filterUserId || this.filterProjectId || this.filterStatus || this.filterKind || this.filterDateFrom || this.filterDateTo);
  }

  goToDetail(item: UnifiedRendicionItem): void {
    // Cuando la solicitud está pendiente de la acción del usuario (aprobar/rechazar),
    // mostramos el detalle en un modal en lugar de redirigir a la vista completa.
    if (item.canApproveNow || item.canReject) {
      this.openDetailModal(item);
      return;
    }
    this.navigateToDetail(item);
  }

  private navigateToDetail(item: UnifiedRendicionItem): void {
    if (item.source === 'advance') {
      this.router.navigate(['/viaticos', item._id]);
    } else {
      this.router.navigate(['/mis-rendiciones', item._id, 'detalle']);
    }
  }

  // ─── Detalle en modal ───────────────────────────────────────────────────────

  /** Trazabilidad del flujo (VD-31) de la solicitud abierta en el modal de detalle. */
  detailFlowSteps = signal<FlowStep[]>([]);

  openDetailModal(item: UnifiedRendicionItem): void {
    this.detailItem.set(item);
    this.expandedDetailLineIds.set(new Set());
    this.showDetailModal.set(true);
    // Trazabilidad: solo para reportes (viático/directa/normal). Se trae el
    // reporte completo porque la lista no puebla cadenas de aprobadores ni
    // hitos de contabilidad; con eso el timeline sale con nombres y fechas.
    this.detailFlowSteps.set(item.source === 'report' ? buildReportFlowSteps(item.raw) : []);
    if (item.source === 'report') {
      this.expenseReportsService.findOne(item._id).subscribe({
        next: (full) => {
          if (this.detailItem()?._id === item._id) {
            this.detailFlowSteps.set(buildReportFlowSteps(full));
          }
        },
        error: () => {},
      });
    }
  }

  /** Líneas por categoría de la solicitud abierta en el modal de detalle. */
  detailLines(): any[] {
    return this.linesForItem(this.detailItem());
  }

  /** Centro de costo con código (ej. "CC-01 — Obra Norte"). */
  detailCentroCosto(): string {
    const item = this.detailItem();
    if (!item) return '—';
    const p = (item.raw as any).projectId;
    // Poblado por el API
    if (p && typeof p === 'object' && p.name) {
      return p.code ? `${p.code} — ${p.name}` : p.name;
    }
    // Sin poblar: buscar el código en la lista de centros de costo ya cargada
    const project = this.projects.find(x => x._id === item.projectId);
    if (project) {
      return project.code ? `${project.code} — ${project.name}` : project.name;
    }
    return item.projectName || '—';
  }

  /** Orden de Trabajo imputada (solo viáticos). Vacío si no aplica. */
  detailOrdenTrabajo(): string {
    const item = this.detailItem();
    if (!item || item.source !== 'report') return '';
    const ot = (item.raw as IExpenseReport).viaticoOrdenTrabajoId;
    if (!ot) return '';
    return typeof ot === 'object' ? (ot.nombre ?? '') : '';
  }

  /** Observaciones del colaborador (viático o anticipo). */
  detailObservations(): string {
    const item = this.detailItem();
    if (!item) return '';
    return item.source === 'advance'
      ? ((item.raw as IAdvance).observations ?? '')
      : ((item.raw as IExpenseReport).viaticoObservations ?? '');
  }

  detailStartDate(): string | undefined {
    const item = this.detailItem();
    if (!item) return undefined;
    return item.source === 'advance'
      ? (item.raw as IAdvance).startDate
      : (item.raw as IExpenseReport).viaticoStartDate;
  }

  detailEndDate(): string | undefined {
    const item = this.detailItem();
    if (!item) return undefined;
    return item.source === 'advance'
      ? (item.raw as IAdvance).endDate
      : (item.raw as IExpenseReport).viaticoEndDate;
  }

  toggleDetailLine(index: number): void {
    const s = new Set(this.expandedDetailLineIds());
    if (s.has(index)) { s.delete(index); } else { s.add(index); }
    this.expandedDetailLineIds.set(s);
  }

  isDetailLineExpanded(index: number): boolean {
    return this.expandedDetailLineIds().has(index);
  }

  /** Aprobar desde el modal de detalle. */
  approveFromDetail(): void {
    const item = this.detailItem();
    if (!item) return;
    this.showDetailModal.set(false);
    this.openApproveModal(item);
  }

  /** Rechazar desde el modal de detalle. */
  rejectFromDetail(): void {
    const item = this.detailItem();
    if (!item) return;
    this.showDetailModal.set(false);
    this.openRejectModal(item);
  }

  // ─── Approve ──────────────────────────────────────────────────────────────────

  openApproveModal(item: UnifiedRendicionItem): void {
    this.pendingApproveItem.set(item);
    this.showApproveModal.set(true);
  }

  confirmApprove(): void {
    const item = this.pendingApproveItem();
    if (!item) return;
    this.isActing.set(true);
    const action$: Observable<unknown> = item.source === 'advance'
      ? this.advanceService.approve(item._id, {})
      : item.isContabilidadGate
        ? this.expenseReportsService.approveViaticoContabilidad(item._id)
        : this.expenseReportsService.approveViatico(item._id);
    action$.subscribe({
      next: () => {
        this.showApproveModal.set(false);
        this.isActing.set(false);
        const msg = item.isContabilidadGate
          ? 'Solicitud aprobada por Contabilidad — lista para pago'
          : `Solicitud aprobada (nivel ${item.approvalLevel + 1} de ${item.requiredLevels})`;
        this.notifications.show(msg, 'success');
        this.loadData();
      },
      error: (e: any) => {
        this.showApproveModal.set(false);
        this.isActing.set(false);
        this.notifications.show(e?.error?.message || 'Error al aprobar', 'error');
      },
    });
  }

  // ─── Reject ───────────────────────────────────────────────────────────────────

  openRejectModal(item: UnifiedRendicionItem): void {
    this.selectedRejectItem.set(item);
    this.rejectForm.reset();
    this.showRejectModal.set(true);
  }

  confirmReject(): void {
    const item = this.selectedRejectItem();
    if (!item || this.rejectForm.invalid) return;
    this.isActing.set(true);
    const reason: string = this.rejectForm.value.rejectionReason;
    const action$: Observable<unknown> = item.source === 'advance'
      ? this.advanceService.reject(item._id, { rejectionReason: reason })
      : this.expenseReportsService.rejectViatico(item._id, reason);
    action$.subscribe({
      next: () => {
        this.notifications.show('Solicitud rechazada', 'success');
        this.showRejectModal.set(false);
        this.isActing.set(false);
        this.loadData();
      },
      error: (e: any) => {
        this.notifications.show(e?.error?.message || 'Error al rechazar', 'error');
        this.isActing.set(false);
      },
    });
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  openDeleteModal(item: UnifiedRendicionItem): void {
    if (item.source !== 'report' || !item.canDeleteItem) return;
    this.reportToDelete = item.raw as IExpenseReport;
    this.deletionPreview.set(null);
    this.loadingDeletionPreview.set(true);
    this.expenseReportsService.getDeletionPreview(this.reportToDelete._id).subscribe({
      next: (preview) => {
        this.loadingDeletionPreview.set(false);
        this.deletionPreview.set(preview);
      },
      error: () => {
        this.loadingDeletionPreview.set(false);
        // Sin preview el usuario aún puede intentar eliminar; el backend valida igual.
      },
    });
  }

  cancelDelete(): void {
    this.reportToDelete = null;
    this.deletionPreview.set(null);
  }

  confirmDelete(): void {
    if (!this.reportToDelete) return;
    this.isDeleting = true;
    this.expenseReportsService.delete(this.reportToDelete._id).subscribe({
      next: () => {
        const id = this.reportToDelete!._id;
        this.allReports = this.allReports.filter(r => r._id !== id);
        this.applyFilters();
        this.reportToDelete = null;
        this.deletionPreview.set(null);
        this.isDeleting = false;
        this.notifications.show('Rendicion eliminada.', 'success');
      },
      error: (err) => {
        this.isDeleting = false;
        const msg = err?.error?.message ?? 'Error al eliminar la rendicion.';
        this.notifications.show(msg, 'error');
      },
    });
  }

  /**
   * Contabilidad puede eliminar cualquier rendición (el backend valida caso a
   * caso: aprobaciones, anticipos pagados, caja chica ya consolidada, etc., y
   * devuelve un mensaje claro si no procede). Los demás roles solo ven el botón
   * cuando la rendición todavía no tiene comprobantes cargados.
   */
  private canDeleteReport(report: IExpenseReport): boolean {
    if (this.userStateService.isContabilidad()) return true;
    return report.expenseIds.length === 0;
  }

  /**
   * Suma el total de los gastos (comprobantes) cargados en una rendición. Usa
   * `expense.total` de cada comprobante poblado; si `expenseIds` no viene
   * poblado (solo IDs) devuelve 0. Sirve para mostrar el monto de una rendición
   * directa, que no tiene `budget` propio. VD-25.
   */
  private reportExpensesTotal(report: IExpenseReport): number {
    const expenses = report.expenseIds;
    if (!Array.isArray(expenses)) return 0;
    return expenses.reduce(
      (sum, exp: any) =>
        sum + (exp && typeof exp === 'object' ? Number(exp.total) || 0 : 0),
      0
    );
  }

  /**
   * Progreso agregado de una rendición directa: cuántos de sus comprobantes ya
   * completaron su propia cadena N1/N2/[N2 sel] + Contabilidad (status === 'approved'
   * en Expense, que refleja computeCombinedStatus). Reemplaza el gate a nivel de
   * reporte que ya no existe para directa.
   */
  private reportDirectaProgress(report: IExpenseReport): { approved: number; total: number } {
    const expenses = (report.expenseIds ?? []).filter(
      (exp: any) => exp && typeof exp === 'object'
    );
    const approved = expenses.filter((exp: any) => exp.status === 'approved').length;
    return { approved, total: expenses.length };
  }

  /**
   * Comprobantes (facturas) cargados en una rendición directa, para mostrarlos
   * en el modal de aprobación/detalle. Solo aplica a directas y solo devuelve
   * comprobantes ya poblados (objetos). VD-25.
   */
  directaExpenses(item: UnifiedRendicionItem | null): any[] {
    if (!item || item.source !== 'report') return [];
    const raw = item.raw as IExpenseReport;
    if (!raw.isDirecta || !Array.isArray(raw.expenseIds)) return [];
    return raw.expenseIds.filter(e => e && typeof e === 'object');
  }

  /** `data` del comprobante como objeto (acepta JSON string o ya poblado). */
  private expenseData(exp: any): Record<string, any> {
    const raw = exp?.data;
    try {
      if (raw == null) return {};
      if (typeof raw === 'string') return JSON.parse(raw);
      if (typeof raw === 'object') return raw;
    } catch { /* data mal formada: se ignora */ }
    return {};
  }

  /** N° de comprobante (serie-correlativo) para el listado de la directa. */
  expenseDocNumber(exp: any): string {
    const d = this.expenseData(exp);
    const serie = d['serie'] ? String(d['serie']) : '';
    const correlativo = d['correlativo'] ? String(d['correlativo']) : '';
    if (serie && correlativo) return `${serie}-${correlativo}`;
    return serie || correlativo || '—';
  }

  /** Proveedor / razón social del comprobante para el listado de la directa. */
  expenseProveedor(exp: any): string {
    const d = this.expenseData(exp);
    const razonSocial = d['razonSocial'];
    if (typeof razonSocial === 'string' && razonSocial.trim()) return razonSocial.trim();
    const provider = exp?.provider;
    if (typeof provider === 'string' && provider.trim()) return provider.trim();
    return '—';
  }

  /** URL del archivo adjunto del comprobante (imagen/PDF de la factura). */
  expenseFileUrl(exp: any): string | null {
    const f = exp?.file;
    return typeof f === 'string' && f.trim() ? f.trim() : null;
  }

  /** Abre la factura adjunta del comprobante en una pestaña nueva. */
  openExpenseFile(exp: any): void {
    const url = this.expenseFileUrl(exp);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  private getReportUserName(report: IExpenseReport): string {
    if (typeof report.userId === 'object' && report.userId?.name) return report.userId.name;
    const user = this.users.find(u => u._id === report.userId);
    return user?.name ?? '—';
  }

  private getProjectName(report: IExpenseReport): string {
    if (!report.projectId) return '—';
    if (typeof report.projectId === 'object' && report.projectId?.name) return report.projectId.name;
    const project = this.projects.find(p => p._id === report.projectId);
    return project?.name ?? '—';
  }

  private initials(name: string): string {
    if (!name || name === '—') return '?';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('');
  }

  getDeleteItemName(): string {
    return this.reportToDelete
      ? this.getReportUserName(this.reportToDelete)
      : '—';
  }
  getDeleteItemTitle(): string {
    return this.reportToDelete?.title ?? '—';
  }

  advanceStatusLabel(status: string): string {
    return ADVANCE_STATUS_LABELS[status as keyof typeof ADVANCE_STATUS_LABELS] ?? status;
  }
}
