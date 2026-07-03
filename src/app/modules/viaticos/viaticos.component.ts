import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AdvanceService } from '../../services/advance.service';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import {
  IAdvance,
  ADVANCE_STATUS_LABELS,
  ADVANCE_STATUS_COLORS,
} from '../../interfaces/advance.interface';
import {
  IExpenseReport,
  VIATICO_REPORT_STATUS_LABELS,
  VIATICO_REPORT_STATUS_COLORS,
} from '../../interfaces/expense-report.interface';

type UnifiedSolicitudItem = {
  _id: string;
  source: 'advance' | 'new';
  collaboratorName: string;
  collaboratorEmail: string;
  collaboratorInitials: string;
  place: string;
  projectLabel: string;
  dateRange: string;
  amount: number;
  pendingBalanceAmount?: number;
  additionalAmount?: number;
  status: string;
  statusLabel: string;
  statusColor: string;
  createdAt: string;
  canApproveL1: boolean;
  canApproveL2: boolean;
  canReject: boolean;
  raw: IAdvance | IExpenseReport;
};

@Component({
  selector: 'app-viaticos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './viaticos.component.html',
})
export class ViaticosComponent implements OnInit {
  private advanceService = inject(AdvanceService);
  private expenseReportsService = inject(ExpenseReportsService);
  private userState = inject(UserStateService);
  private notifications = inject(NotificationService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  readonly ADV_LABELS = ADVANCE_STATUS_LABELS;
  readonly ADV_COLORS = ADVANCE_STATUS_COLORS;
  readonly VIA_LABELS = VIATICO_REPORT_STATUS_LABELS;
  readonly VIA_COLORS = VIATICO_REPORT_STATUS_COLORS;

  readonly ALL_STATUSES = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'pending_l1', label: 'Pendiente aprobación' },
    { value: 'pending_l2', label: 'Pendiente tesorería' },
    { value: 'viatico_approved', label: 'Aprobado' },
    { value: 'partially_paid', label: 'Pago parcial' },
    { value: 'open', label: 'Registrando gastos' },
    { value: 'submitted', label: 'Enviada' },
    { value: 'pending_accounting', label: 'En contabilidad' },
    { value: 'approved', label: 'Aprobada' },
    { value: 'settled', label: 'Liquidada' },
    { value: 'rejected', label: 'Rechazada' },
    { value: 'cancelled', label: 'Cancelada' },
  ];

  // Data
  isLoading = signal(false);
  isActing = signal(false);
  allAdvances = signal<IAdvance[]>([]);
  allViaticoReports = signal<IExpenseReport[]>([]);
  viaticoReportsLoading = signal(false);

  // Filters
  filterStatus = signal('all');
  filterSearch = signal('');
  filterDateFrom = signal('');
  filterDateTo = signal('');

  // Approve modal
  showApproveModal = signal(false);
  pendingApproveItem = signal<UnifiedSolicitudItem | null>(null);
  pendingApproveLevel = signal<1 | 2>(1);

  // Reject modal
  showRejectModal = signal(false);
  selectedItem = signal<UnifiedSolicitudItem | null>(null);
  rejectForm!: FormGroup;

  get canApproveL1() { return this.userState.canApproveL1(); }
  get canApproveL2() { return this.userState.canApproveL2(); }

  // ─── Stats ────────────────────────────────────────────────────────────────────

  stats = computed(() => {
    const adv = this.allAdvances();
    const via = this.allViaticoReports();
    return {
      pending_l1: adv.filter(a => a.status === 'pending_l1').length + via.filter(v => v.status === 'pending_l1').length,
      pending_l2: adv.filter(a => a.status === 'pending_l2').length + via.filter(v => v.status === 'pending_l2').length,
      approved: adv.filter(a => a.status === 'approved').length + via.filter(v => v.status === 'viatico_approved').length,
      paid: adv.filter(a => a.status === 'paid').length,
    };
  });

  // ─── Unified list (advances legacy + new viatico ExpenseReports) ──────────────

  unifiedFiltered = computed((): UnifiedSolicitudItem[] => {
    const search = this.filterSearch().toLowerCase().trim();
    const status = this.filterStatus();
    const dateFrom = this.filterDateFrom();
    const dateTo = this.filterDateTo();

    const items: UnifiedSolicitudItem[] = [];

    // Legacy advances
    for (const a of this.allAdvances()) {
      items.push({
        _id: a._id,
        source: 'advance',
        collaboratorName: this.advCollaboratorName(a),
        collaboratorEmail: typeof a.userId === 'object' ? a.userId.email : '',
        collaboratorInitials: this.advCollaboratorInitials(a),
        place: a.place ?? '—',
        projectLabel: this.advProjectLabel(a),
        dateRange: this.advDateRange(a),
        amount: a.amount,
        pendingBalanceAmount: (a as any).pendingBalanceAmount,
        additionalAmount: (a as any).additionalAmount,
        status: a.status,
        statusLabel: this.ADV_LABELS[a.status] ?? a.status,
        statusColor: this.ADV_COLORS[a.status] ?? 'bg-gray-100 text-gray-600',
        createdAt: a.createdAt,
        canApproveL1: a.status === 'pending_l1' && this.canApproveL1,
        canApproveL2: a.status === 'pending_l2' && this.canApproveL2,
        canReject: ['pending_l1', 'pending_l2'].includes(a.status) && (this.canApproveL1 || this.canApproveL2),
        raw: a,
      });
    }

    // New unified viatico ExpenseReports (all phases)
    for (const v of this.allViaticoReports()) {
      const collab = typeof v.userId === 'object' ? v.userId : null;
      const name = (collab as any)?.name ?? '—';
      const email = (collab as any)?.email ?? '';
      const initials = name.split(' ').slice(0, 2).map((w: string) => w[0] ?? '').join('').toUpperCase() || '?';
      const proj = (v as any).projectId;
      const projectLabel = proj && typeof proj === 'object' ? (proj.code ? `${proj.code} — ${proj.name}` : proj.name) : '—';
      const statusLabel = this.VIA_LABELS[v.status as keyof typeof VIATICO_REPORT_STATUS_LABELS] ?? v.status;
      const statusColor = this.VIA_COLORS[v.status as keyof typeof VIATICO_REPORT_STATUS_COLORS] ?? 'bg-gray-100 text-gray-600';

      items.push({
        _id: v._id,
        source: 'new',
        collaboratorName: name,
        collaboratorEmail: email,
        collaboratorInitials: initials,
        place: v.viaticoPlace ?? '—',
        projectLabel,
        dateRange: this.viaDates(v),
        amount: v.viaticoAmount ?? v.budget ?? 0,
        status: v.status,
        statusLabel,
        statusColor,
        createdAt: v.createdAt,
        canApproveL1: v.status === 'pending_l1' && this.canApproveL1,
        canApproveL2: v.status === 'pending_l2' && this.canApproveL2,
        canReject: ['pending_l1', 'pending_l2'].includes(v.status) && (this.canApproveL1 || this.canApproveL2),
        raw: v,
      });
    }

    let filtered = items;
    if (search) filtered = filtered.filter(i =>
      i.collaboratorName.toLowerCase().includes(search) ||
      i.collaboratorEmail.toLowerCase().includes(search) ||
      i.place.toLowerCase().includes(search)
    );
    if (status && status !== 'all') filtered = filtered.filter(i => i.status === status);
    if (dateFrom) filtered = filtered.filter(i => new Date(i.createdAt) >= new Date(dateFrom));
    if (dateTo) filtered = filtered.filter(i => new Date(i.createdAt) <= new Date(dateTo + 'T23:59:59'));

    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnInit() {
    this.rejectForm = this.fb.group({
      rejectionReason: ['', [Validators.required, Validators.minLength(10)]],
    });
    this.load();
    this.loadViaticoReports();
  }

  load() {
    this.isLoading.set(true);
    this.advanceService.findForViaticosPage({}).subscribe({
      next: (list) => { this.allAdvances.set(list ?? []); this.isLoading.set(false); },
      error: () => { this.allAdvances.set([]); this.isLoading.set(false); },
    });
  }

  loadViaticoReports() {
    this.viaticoReportsLoading.set(true);
    this.expenseReportsService.getViaticosList().subscribe({
      next: (list) => { this.allViaticoReports.set(list ?? []); this.viaticoReportsLoading.set(false); },
      error: () => { this.allViaticoReports.set([]); this.viaticoReportsLoading.set(false); },
    });
  }

  reloadAll() {
    this.load();
    this.loadViaticoReports();
  }

  // ─── Filters ──────────────────────────────────────────────────────────────────

  applyFilters() { this.load(); this.loadViaticoReports(); }
  clearFilters() {
    this.filterStatus.set('all');
    this.filterSearch.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
  }

  onStatusChange(e: Event) { this.filterStatus.set((e.target as HTMLSelectElement).value); }
  onSearchChange(e: Event) { this.filterSearch.set((e.target as HTMLInputElement).value); }
  onDateFromChange(e: Event) { this.filterDateFrom.set((e.target as HTMLInputElement).value); }
  onDateToChange(e: Event) { this.filterDateTo.set((e.target as HTMLInputElement).value); }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private advCollaboratorName(a: IAdvance): string {
    return typeof a.userId === 'object' ? a.userId.name : '—';
  }
  private advCollaboratorInitials(a: IAdvance): string {
    const name = this.advCollaboratorName(a);
    return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
  }
  private advProjectLabel(a: IAdvance): string {
    const p = a.projectId;
    if (!p || typeof p === 'string') return '—';
    return p.code ? `${p.code} — ${p.name}` : p.name;
  }
  private advDateRange(a: IAdvance): string {
    const fmt = (d: string) => new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
    if (a.startDate && a.endDate) return `${fmt(a.startDate)} al ${fmt(a.endDate)}`;
    if (a.startDate) return fmt(a.startDate);
    return '—';
  }
  private viaDates(v: IExpenseReport): string {
    const fmt = (d: string) => new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
    const s = v.viaticoStartDate;
    const e = v.viaticoEndDate;
    if (s && e) return `${fmt(s)} al ${fmt(e)}`;
    if (s) return fmt(s);
    return '—';
  }

  // ─── Approve modal ────────────────────────────────────────────────────────────

  openApproveModal(item: UnifiedSolicitudItem, level: 1 | 2) {
    this.pendingApproveItem.set(item);
    this.pendingApproveLevel.set(level);
    this.showApproveModal.set(true);
  }

  confirmApprove() {
    const item = this.pendingApproveItem();
    if (!item) return;
    const level = this.pendingApproveLevel();
    this.isActing.set(true);
    const action$: Observable<unknown> = item.source === 'advance'
      ? (level === 1 ? this.advanceService.approveL1(item._id, {}) : this.advanceService.approveL2(item._id, {}))
      : (level === 1 ? this.expenseReportsService.approveViaticoL1(item._id) : this.expenseReportsService.approveViaticoL2(item._id));
    action$.subscribe({
      next: () => {
        this.showApproveModal.set(false);
        this.isActing.set(false);
        this.notifications.show(`Solicitud aprobada (Nivel ${level})`, 'success');
        this.reloadAll();
      },
      error: (e: any) => {
        this.showApproveModal.set(false);
        this.isActing.set(false);
        this.notifications.show(e?.error?.message || 'Error al aprobar', 'error');
      },
    });
  }

  // ─── Reject modal ─────────────────────────────────────────────────────────────

  openRejectModal(item: UnifiedSolicitudItem) {
    this.selectedItem.set(item);
    this.rejectForm.reset();
    this.showRejectModal.set(true);
  }

  confirmReject() {
    const item = this.selectedItem();
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
        this.reloadAll();
      },
      error: (e: any) => {
        this.notifications.show(e?.error?.message || 'Error al rechazar', 'error');
        this.isActing.set(false);
      },
    });
  }

  // ─── Navigation ───────────────────────────────────────────────────────────────

  openDetail(item: UnifiedSolicitudItem) {
    if (item.source === 'advance') {
      this.router.navigate(['/viaticos', item._id]);
    } else {
      this.router.navigate(['/mis-rendiciones', item._id, 'detalle'], { queryParams: { from: 'rendiciones' } });
    }
  }
}
