import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import {
  IExpenseReport,
  IChainStep,
  VIATICO_REPORT_STATUS_LABELS,
  VIATICO_REPORT_STATUS_COLORS,
} from '../../interfaces/expense-report.interface';
import { monedaSymbol } from '../../constants/moneda';

type UnifiedSolicitudItem = {
  _id: string;
  collaboratorName: string;
  collaboratorEmail: string;
  collaboratorInitials: string;
  place: string;
  projectLabel: string;
  dateRange: string;
  amount: number;
  currencySymbol: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  createdAt: string;
  /** Es el turno del usuario actual para aprobar (o es Superadmin). */
  canApproveNow: boolean;
  canReject: boolean;
  /** true cuando el paso pendiente es el gate final de Contabilidad (no la cadena de centro de costo). */
  isContabilidadGate: boolean;
  /** Nombre(s) del/los aprobador(es) cuyo turno es actualmente, para mostrar en la lista. */
  pendingApproverName: string;
  approvalLevel: number;
  requiredLevels: number;
  raw: IExpenseReport;
};

@Component({
  selector: 'app-viaticos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './viaticos.component.html',
})
export class ViaticosComponent implements OnInit {
  private expenseReportsService = inject(ExpenseReportsService);
  private userState = inject(UserStateService);
  private notifications = inject(NotificationService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  readonly VIA_LABELS = VIATICO_REPORT_STATUS_LABELS;
  readonly VIA_COLORS = VIATICO_REPORT_STATUS_COLORS;

  readonly ALL_STATUSES = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'pending_l1', label: 'Pendiente aprobación' },
    { value: 'pending_contabilidad', label: 'Pendiente de Contabilidad' },
    { value: 'viatico_approved', label: 'Aprobado' },
    { value: 'partially_paid', label: 'Pago parcial' },
    { value: 'settled', label: 'Liquidada' },
    { value: 'rejected', label: 'Rechazada' },
    { value: 'cancelled', label: 'Cancelada' },
  ];

  // Data
  isLoading = signal(false);
  isActing = signal(false);
  allViaticoReports = signal<IExpenseReport[]>([]);

  // Filters
  filterStatus = signal('all');
  filterSearch = signal('');
  filterDateFrom = signal('');
  filterDateTo = signal('');

  // Approve modal
  showApproveModal = signal(false);
  pendingApproveItem = signal<UnifiedSolicitudItem | null>(null);

  // Reject modal
  showRejectModal = signal(false);
  selectedItem = signal<UnifiedSolicitudItem | null>(null);
  rejectForm!: FormGroup;

  private get currentUserId(): string {
    return (this.userState.getUser() as any)?._id ?? '';
  }

  private get isSuperAdmin(): boolean {
    return this.userState.isSuperAdmin();
  }

  /** ¿El usuario actual está entre los `approverIds` del paso `level` de la cadena? */
  private isApproverOfStep(chain: IChainStep[] | undefined, level: number): boolean {
    const step = chain?.[level];
    if (!step) return false;
    return step.approverIds.some(a => (typeof a === 'object' ? a._id : a) === this.currentUserId);
  }

  /** Nombres de los aprobadores del paso `level` (cualquiera de ellos puede completarlo). */
  private stepApproverNames(chain: IChainStep[] | undefined, level: number): string {
    const step = chain?.[level];
    if (!step || step.approverIds.length === 0) return '—';
    return step.approverIds
      .map(a => (typeof a === 'object' ? (a.name ?? a._id) : a))
      .join(' / ');
  }

  // ─── Stats ────────────────────────────────────────────────────────────────────

  stats = computed(() => {
    const via = this.allViaticoReports();
    return {
      pending_l1: via.filter(v => v.status === 'pending_l1' && (v.viaticoApprovalLevel ?? 0) === 0).length,
      // Solicitudes con más de un aprobador donde ya se aprobó al menos un nivel pero falta el siguiente.
      in_progress: via.filter(v => v.status === 'pending_l1' && (v.viaticoApprovalLevel ?? 0) > 0).length,
      approved: via.filter(v => v.status === 'viatico_approved').length,
      paid: via.filter(v => v.status === 'paid').length,
    };
  });

  // ─── Unified list (solicitudes de viático) ────────────────────────────────────

  unifiedFiltered = computed((): UnifiedSolicitudItem[] => {
    const search = this.filterSearch().toLowerCase().trim();
    const status = this.filterStatus();
    const dateFrom = this.filterDateFrom();
    const dateTo = this.filterDateTo();

    const items: UnifiedSolicitudItem[] = [];

    for (const v of this.allViaticoReports()) {
      const collab = typeof v.userId === 'object' ? v.userId : null;
      const name = (collab as any)?.name ?? '—';
      const email = (collab as any)?.email ?? '';
      const initials = name.split(' ').slice(0, 2).map((w: string) => w[0] ?? '').join('').toUpperCase() || '?';
      const proj = (v as any).projectId;
      const projectLabel = proj && typeof proj === 'object' ? (proj.code ? `${proj.code} — ${proj.name}` : proj.name) : '—';
      const statusLabel = this.VIA_LABELS[v.status as keyof typeof VIATICO_REPORT_STATUS_LABELS] ?? v.status;
      const statusColor = this.VIA_COLORS[v.status as keyof typeof VIATICO_REPORT_STATUS_COLORS] ?? 'bg-gray-100 text-gray-600';
      const approvalLevel = v.viaticoApprovalLevel ?? 0;

      const chainCanAct = this.isApproverOfStep(v.viaticoApproverChain, approvalLevel);
      const canActNow = (v.status === 'pending_l1' && (this.isSuperAdmin || chainCanAct)) ||
        (v.status === 'pending_contabilidad' && (this.isSuperAdmin || this.userState.isContabilidad()));

      items.push({
        _id: v._id,
        collaboratorName: name,
        collaboratorEmail: email,
        collaboratorInitials: initials,
        place: v.viaticoPlace ?? '—',
        projectLabel,
        dateRange: this.viaDates(v),
        amount: v.viaticoAmount ?? v.budget ?? 0,
        currencySymbol: monedaSymbol(v.viaticoMoneda),
        status: v.status,
        statusLabel,
        statusColor,
        createdAt: v.createdAt,
        canApproveNow: canActNow,
        canReject: canActNow,
        isContabilidadGate: v.status === 'pending_contabilidad',
        pendingApproverName: v.status === 'pending_contabilidad' ? 'Contabilidad' : this.stepApproverNames(v.viaticoApproverChain, approvalLevel),
        approvalLevel,
        requiredLevels: v.viaticoRequiredLevels ?? 1,
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
    this.loadViaticoReports();
  }

  loadViaticoReports() {
    this.isLoading.set(true);
    this.expenseReportsService.getViaticosList().subscribe({
      next: (list) => { this.allViaticoReports.set(list ?? []); this.isLoading.set(false); },
      error: () => { this.allViaticoReports.set([]); this.isLoading.set(false); },
    });
  }

  reloadAll() {
    this.loadViaticoReports();
  }

  // ─── Filters ──────────────────────────────────────────────────────────────────

  applyFilters() { this.loadViaticoReports(); }
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

  private viaDates(v: IExpenseReport): string {
    const fmt = (d: string) => new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
    const s = v.viaticoStartDate;
    const e = v.viaticoEndDate;
    if (s && e) return `${fmt(s)} al ${fmt(e)}`;
    if (s) return fmt(s);
    return '—';
  }

  // ─── Approve modal ────────────────────────────────────────────────────────────

  openApproveModal(item: UnifiedSolicitudItem) {
    this.pendingApproveItem.set(item);
    this.showApproveModal.set(true);
  }

  confirmApprove() {
    const item = this.pendingApproveItem();
    if (!item) return;
    this.isActing.set(true);
    const action$: Observable<unknown> = item.isContabilidadGate
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
    this.expenseReportsService.rejectViatico(item._id, reason).subscribe({
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
    this.router.navigate(['/mis-rendiciones', item._id, 'detalle'], { queryParams: { from: 'rendiciones' } });
  }
}
