import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AdvanceService } from '../../services/advance.service';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import {
  IAdvance,
  ADVANCE_STATUS_LABELS,
  ADVANCE_STATUS_COLORS,
} from '../../interfaces/advance.interface';

@Component({
  selector: 'app-viaticos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './viaticos.component.html',
})
export class ViaticosComponent implements OnInit {
  private advanceService = inject(AdvanceService);
  private userState = inject(UserStateService);
  private notifications = inject(NotificationService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  readonly STATUS_LABELS = ADVANCE_STATUS_LABELS;
  readonly STATUS_COLORS = ADVANCE_STATUS_COLORS;

  readonly ALL_STATUSES = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'pending_l1', label: 'Pendiente Aprobación' },
    { value: 'pending_l2', label: 'Pendiente Contabilidad' },
    { value: 'approved', label: 'Aprobado' },
    { value: 'paid', label: 'Pagado' },
    { value: 'settled', label: 'Liquidado' },
    { value: 'rejected', label: 'Rechazado' },
    { value: 'cancelled', label: 'Cancelado' },
  ];

  isLoading = signal(false);
  isActing = signal(false);
  allAdvances = signal<IAdvance[]>([]);

  // Filters
  filterStatus = signal('all');
  filterSearch = signal('');
  filterDateFrom = signal('');
  filterDateTo = signal('');

  // Modal aprobación
  showApproveModal = signal(false);
  pendingApproveAdvance = signal<IAdvance | null>(null);
  pendingApproveLevel = signal<1 | 2>(1);

  // Modal rechazo
  showRejectModal = signal(false);
  selectedAdvance = signal<IAdvance | null>(null);
  rejectForm!: FormGroup;

  get canApproveL1() { return this.userState.canApproveL1(); }
  get canApproveL2() { return this.userState.canApproveL2(); }
  get isAdmin() { return this.userState.isAdmin() || this.userState.isSuperAdmin(); }

  filtered = computed(() => {
    const search = this.filterSearch().toLowerCase().trim();
    return this.allAdvances().filter(a => {
      if (!search) return true;
      const name = typeof a.userId === 'object' ? a.userId.name.toLowerCase() : '';
      const email = typeof a.userId === 'object' ? a.userId.email.toLowerCase() : '';
      const place = (a.place ?? '').toLowerCase();
      return name.includes(search) || email.includes(search) || place.includes(search);
    });
  });

  stats = computed(() => {
    const all = this.allAdvances();
    return {
      pending_l1: all.filter(a => a.status === 'pending_l1').length,
      pending_l2: all.filter(a => a.status === 'pending_l2').length,
      approved: all.filter(a => a.status === 'approved').length,
      paid: all.filter(a => a.status === 'paid').length,
    };
  });

  ngOnInit() {
    this.rejectForm = this.fb.group({
      rejectionReason: ['', [Validators.required, Validators.minLength(10)]],
    });
    this.load();
  }

  load() {
    this.isLoading.set(true);
    const filters: Record<string, string> = {};
    if (this.filterStatus() !== 'all') filters['status'] = this.filterStatus();
    if (this.filterDateFrom()) filters['dateFrom'] = this.filterDateFrom();
    if (this.filterDateTo()) filters['dateTo'] = this.filterDateTo();

    this.advanceService.findForViaticosPage(filters).subscribe({
      next: (list) => {
        this.allAdvances.set(list ?? []);
        this.isLoading.set(false);
      },
      error: () => {
        this.allAdvances.set([]);
        this.isLoading.set(false);
      },
    });
  }

  applyFilters() {
    this.load();
  }

  clearFilters() {
    this.filterStatus.set('all');
    this.filterSearch.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.load();
  }

  onStatusChange(e: Event) {
    this.filterStatus.set((e.target as HTMLSelectElement).value);
  }

  onSearchChange(e: Event) {
    this.filterSearch.set((e.target as HTMLInputElement).value);
  }

  onDateFromChange(e: Event) {
    this.filterDateFrom.set((e.target as HTMLInputElement).value);
  }

  onDateToChange(e: Event) {
    this.filterDateTo.set((e.target as HTMLInputElement).value);
  }

  collaboratorName(a: IAdvance): string {
    return typeof a.userId === 'object' ? a.userId.name : '—';
  }

  collaboratorInitials(a: IAdvance): string {
    const name = this.collaboratorName(a);
    return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
  }

  projectLabel(a: IAdvance): string {
    const p = a.projectId;
    if (!p || typeof p === 'string') return '—';
    return p.code ? `${p.code} — ${p.name}` : p.name;
  }

  private fmtDate(d: string | Date): string {
    const date = new Date(d);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  startDateFmt(a: IAdvance): string {
    return a.startDate ? this.fmtDate(a.startDate) : '—';
  }

  endDateFmt(a: IAdvance): string {
    return a.endDate ? this.fmtDate(a.endDate) : '';
  }

  dateRange(a: IAdvance): string {
    if (a.startDate && a.endDate) return `${this.fmtDate(a.startDate)} al ${this.fmtDate(a.endDate)}`;
    if (a.startDate) return this.fmtDate(a.startDate);
    return '—';
  }

  createdAt(a: IAdvance): string {
    return this.fmtDate(a.createdAt);
  }

  canApproveL1Action(a: IAdvance): boolean {
    return a.status === 'pending_l1' && this.canApproveL1;
  }

  canApproveL2Action(a: IAdvance): boolean {
    return a.status === 'pending_l2' && this.canApproveL2;
  }

  canRejectAction(a: IAdvance): boolean {
    return (
      ['pending_l1', 'pending_l2'].includes(a.status) &&
      (this.canApproveL1 || this.canApproveL2)
    );
  }

  openApproveModal(a: IAdvance, level: 1 | 2) {
    this.pendingApproveAdvance.set(a);
    this.pendingApproveLevel.set(level);
    this.showApproveModal.set(true);
  }

  confirmApprove() {
    const a = this.pendingApproveAdvance();
    if (!a) return;
    const level = this.pendingApproveLevel();
    this.isActing.set(true);
    const action$ = level === 1
      ? this.advanceService.approveL1(a._id, {})
      : this.advanceService.approveL2(a._id, {});
    action$.subscribe({
      next: () => {
        this.showApproveModal.set(false);
        this.isActing.set(false);
        this.notifications.show(`Solicitud aprobada (Nivel ${level})`, 'success');
        this.load();
      },
      error: (e) => {
        this.showApproveModal.set(false);
        this.isActing.set(false);
        this.notifications.show(e?.error?.message || 'Error al aprobar', 'error');
      },
    });
  }

  approveL1(a: IAdvance) { this.openApproveModal(a, 1); }
  approveL2(a: IAdvance) { this.openApproveModal(a, 2); }

  openDetail(a: IAdvance) {
    this.router.navigate(['/viaticos', a._id]);
  }

  openRejectModal(a: IAdvance) {
    this.selectedAdvance.set(a);
    this.rejectForm.reset();
    this.showRejectModal.set(true);
  }

  confirmReject() {
    const a = this.selectedAdvance();
    if (!a || this.rejectForm.invalid) return;
    this.isActing.set(true);
    this.advanceService.reject(a._id, this.rejectForm.value).subscribe({
      next: () => {
        this.notifications.show('Solicitud rechazada', 'success');
        this.showRejectModal.set(false);
        this.isActing.set(false);
        this.load();
      },
      error: (e) => {
        this.notifications.show(e?.error?.message || 'Error al rechazar', 'error');
        this.isActing.set(false);
      },
    });
  }
}
