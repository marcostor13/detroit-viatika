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
import { SuplenciaBannerComponent } from '../../components/suplencia-banner/suplencia-banner.component';
import { SuplenciaService } from '../../services/suplencia.service';

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
  /** Titular al que el usuario cubre por vacaciones en esta solicitud (VD-124), o null. */
  reemplazoDe: string | null;
  raw: IExpenseReport;
};

@Component({
  selector: 'app-viaticos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SuplenciaBannerComponent],
  templateUrl: './viaticos.component.html',
})
export class ViaticosComponent implements OnInit {
  private expenseReportsService = inject(ExpenseReportsService);
  private userState = inject(UserStateService);
  private suplenciaService = inject(SuplenciaService);
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
  /** VD-135: centro de costo y orden de trabajo de la solicitud. */
  filterProjectId = signal('');
  filterOrdenTrabajoId = signal('');
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

  /**
   * ¿El usuario actual es aprobador de algún paso AÚN PENDIENTE de la cadena?
   * Aprobación en paralelo entre niveles: cualquier paso no aprobado es
   * accionable solo el paso en curso (VD-133): el N2 espera al N1.
   */
  private hasActionableStep(chain: IChainStep[] | undefined): boolean {
    // VD-133: solo el paso EN CURSO. La suplencia por vacaciones (VD-124) sigue
    // contando: el suplente actúa por su titular dentro de ese paso.
    return this.suplenciaService.meTocaAhora(chain, this.currentUserId);
  }

  /**
   * Nombres de los aprobadores de quien tiene la solicitud AHORA, sin duplicar.
   * VD-133: solo el paso en curso. Antes se listaban todos los pendientes, lo
   * que hacía parecer que la solicitud estaba en manos de tres personas a la vez
   * cuando en realidad solo una podía firmarla.
   */
  private pendingStepApproverNames(chain: IChainStep[] | undefined): string {
    const enCurso = this.suplenciaService.pasoEnCurso(chain as any);
    const pending = enCurso ? [enCurso] : [];
    if (pending.length === 0) return '—';
    const names = new Set<string>();
    for (const step of pending) {
      for (const a of step.approverIds) {
        const name = typeof a === 'object' ? (a.name ?? a._id) : a;
        if (name) names.add(name);
      }
    }
    return names.size > 0 ? Array.from(names).join(' / ') : '—';
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

  /** Id de una referencia venga poblada o como id suelto. */
  private idRefDe(ref: unknown): string {
    if (!ref) return '';
    return String((ref as any)?._id ?? ref);
  }

  /**
   * Catálogos de los filtros de centro de costo y OT (VD-135).
   *
   * Se derivan de las solicitudes ya cargadas en vez de pedir los catálogos
   * completos: esta pantalla filtra en cliente sobre una lista que ya tiene los
   * dos campos poblados, así que una llamada extra solo añadiría opciones que no
   * devuelven ninguna fila. El día que el listado se pagine habrá que cambiarlo
   * por el catálogo real.
   */
  private opcionesDe(
    campo: 'projectId' | 'viaticoOrdenTrabajoId',
    etiqueta: (x: any) => string
  ): Array<{ _id: string; label: string }> {
    const porId = new Map<string, string>();
    for (const v of this.allViaticoReports()) {
      const ref = (v as any)[campo];
      if (ref && typeof ref === 'object' && ref._id) {
        porId.set(String(ref._id), etiqueta(ref));
      }
    }
    return [...porId.entries()]
      .map(([_id, label]) => ({ _id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  projectOptions = computed(() =>
    this.opcionesDe('projectId', p => (p.code ? `${p.code} — ${p.name}` : p.name))
  );
  ordenTrabajoOptions = computed(() =>
    this.opcionesDe('viaticoOrdenTrabajoId', ot => ot.nombre ?? '—')
  );

  // ─── Unified list (solicitudes de viático) ────────────────────────────────────

  unifiedFiltered = computed((): UnifiedSolicitudItem[] => {
    const search = this.filterSearch().toLowerCase().trim();
    const status = this.filterStatus();
    const dateFrom = this.filterDateFrom();
    const dateTo = this.filterDateTo();
    const projectId = this.filterProjectId();
    const ordenTrabajoId = this.filterOrdenTrabajoId();

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

      const chainCanAct = this.hasActionableStep(v.viaticoApproverChain);
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
        pendingApproverName: v.status === 'pending_contabilidad' ? 'Contabilidad' : this.pendingStepApproverNames(v.viaticoApproverChain),
        approvalLevel,
        requiredLevels: v.viaticoRequiredLevels ?? 1,
        // Suplencia por vacaciones (VD-124): la cadena nombra al titular, la
        // lista tiene que decir de parte de quien actua el suplente.
        reemplazoDe: this.suplenciaService.titularCubiertoEnCadena(
          v.viaticoApproverChain,
          this.currentUserId
        ),
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
    // VD-135. Se comparan los ids, no las etiquetas: dos centros de costo pueden
    // llamarse igual y el código es lo que los distingue.
    if (projectId) filtered = filtered.filter(i => this.idRefDe((i.raw as any).projectId) === projectId);
    if (ordenTrabajoId) {
      filtered = filtered.filter(
        i => this.idRefDe((i.raw as any).viaticoOrdenTrabajoId) === ordenTrabajoId
      );
    }
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
    this.filterProjectId.set('');
    this.filterOrdenTrabajoId.set('');
  }

  onProjectChange(e: Event) { this.filterProjectId.set((e.target as HTMLSelectElement).value); }
  onOrdenTrabajoChange(e: Event) { this.filterOrdenTrabajoId.set((e.target as HTMLSelectElement).value); }

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
