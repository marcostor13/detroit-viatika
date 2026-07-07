import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { ExpenseReportsService, IExpenseReportDeletionPreview } from '../../../services/expense-reports.service';
import { AdminUsersService } from '../services/admin-users.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { UserStateService } from '../../../services/user-state.service';
import { NotificationService } from '../../../services/notification.service';
import { AdvanceService } from '../../../services/advance.service';
import { CategoriaService } from '../../../services/categoria.service';
import { IExpenseReport } from '../../../interfaces/expense-report.interface';
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
  filterDateFrom = '';
  filterDateTo = '';

  // Approve modal
  showApproveModal = signal(false);
  pendingApproveItem = signal<UnifiedRendicionItem | null>(null);

  // Reject modal
  showRejectModal = signal(false);
  selectedRejectItem = signal<UnifiedRendicionItem | null>(null);
  rejectForm!: FormGroup;

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
        this.allReports = reports.filter((r) => !r.isDirecta);
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

  /** Líneas por categoría del viático en revisión (vacío si no es viático). */
  approveViaticoLines(): any[] {
    const item = this.pendingApproveItem();
    if (!item || item.source !== 'report') return [];
    const raw = item.raw as IExpenseReport;
    return raw.type === 'viatico' ? ((raw as any).viaticoLines ?? []) : [];
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
      return {
        _id: r._id,
        source: 'report' as const,
        userName: name,
        userInitials: this.initials(name),
        userId: uid ?? '',
        title: r.title || r.viaticoPlace || '—',
        projectName: this.getProjectName(r),
        projectId: pid ?? '',
        amount: r.viaticoAmount ?? r.budget ?? 0,
        status: r.status,
        statusLabel: REPORT_STATUS_LABELS[r.status] ?? r.status,
        statusColor: REPORT_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-700',
        createdAt: r.createdAt,
        canDeleteItem: this.canDeleteReport(r),
        canApproveNow: isViatico && (
          (r.status === 'pending_l1' &&
            (this.isSuperAdmin || this.approverIdAt(r.viaticoApproverChain, r.viaticoApprovalLevel ?? 0) === this.currentUserId)) ||
          (r.status === 'pending_contabilidad' && (this.isSuperAdmin || this.userStateService.isContabilidad()))
        ),
        canReject: isViatico && (
          (r.status === 'pending_l1' &&
            (this.isSuperAdmin || this.approverIdAt(r.viaticoApproverChain, r.viaticoApprovalLevel ?? 0) === this.currentUserId)) ||
          (r.status === 'pending_contabilidad' && (this.isSuperAdmin || this.userStateService.isContabilidad()))
        ),
        isContabilidadGate: r.status === 'pending_contabilidad',
        approvalLevel: r.viaticoApprovalLevel ?? 0,
        requiredLevels: r.viaticoRequiredLevels ?? 1,
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
        raw: a,
      };
    });

    const items = [...reportItems, ...advanceItems];

    let result = items;

    if (this.filterUserId) {
      result = result.filter(i => i.userId === this.filterUserId);
    }
    if (this.filterProjectId) {
      result = result.filter(i => i.projectId === this.filterProjectId);
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
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.applyFilters();
  }

  get hasActiveFilters(): boolean {
    return !!(this.filterUserId || this.filterProjectId || this.filterDateFrom || this.filterDateTo);
  }

  goToDetail(item: UnifiedRendicionItem): void {
    if (item.source === 'advance') {
      this.router.navigate(['/viaticos', item._id]);
    } else {
      this.router.navigate(['/mis-rendiciones', item._id, 'detalle']);
    }
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
