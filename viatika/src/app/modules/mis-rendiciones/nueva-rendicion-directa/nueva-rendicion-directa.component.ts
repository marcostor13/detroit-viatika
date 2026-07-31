import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { SaldoService } from '../../../services/saldo.service';
import { ISaldo, SaldoType } from '../../../interfaces/saldo.interface';

@Component({
  selector: 'app-nueva-rendicion-directa',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './nueva-rendicion-directa.component.html',
})
export class NuevaRendicionDirectaComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private expenseReportsService = inject(ExpenseReportsService);
  private notifications = inject(NotificationService);
  private userState = inject(UserStateService);
  private saldoService = inject(SaldoService);

  submitting = signal(false);

  // Saldos elegibles (rendición directa + pago) y selección.
  saldos = signal<ISaldo[]>([]);
  loadingSaldos = signal<boolean>(true);
  selectedIds = signal<Set<string>>(new Set());

  selectedTotal = computed(() =>
    this.saldos()
      .filter(s => this.selectedIds().has(s._id))
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
  );

  form: FormGroup = this.fb.group({
    gestion: ['', [Validators.required, Validators.minLength(3)]],
  });

  ngOnInit(): void {
    this.saldoService.getEligible('rendicion_directa').subscribe({
      next: rows => {
        this.saldos.set(rows ?? []);
        this.loadingSaldos.set(false);
      },
      error: () => this.loadingSaldos.set(false),
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSaldo(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedIds.set(next);
  }

  typeLabel(type: SaldoType): string {
    return type === 'pago' ? 'Pago' : 'Rendición directa';
  }

  /** Gestión / motivo del saldo, o su origen (rendición / N° operación). */
  saldoDescripcion(s: ISaldo): string {
    if (s.concepto?.trim()) return s.concepto.trim();
    const r = s.sourceReportId;
    if (r && typeof r !== 'string') return r.codigo || r.title || '';
    if (s.type === 'pago' && s.deposit?.operationNumber) return `Op. ${s.deposit.operationNumber}`;
    return '';
  }

  centroCosto(s: ISaldo): string {
    const p = s.projectId;
    if (!p || typeof p === 'string') return '';
    const code = p.code ? `${p.code} - ` : '';
    return `${code}${p.name ?? ''}`.trim();
  }

  goBack(): void {
    this.router.navigate(['/mis-rendiciones']);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const user = this.userState.getUser() as any;
    const userId = user?._id ?? '';
    const clientId =
      user?.companyId ||
      user?.client?._id ||
      (typeof user?.clientId === 'string' ? user.clientId : user?.clientId?._id) ||
      '';

    if (!userId || !clientId) {
      this.notifications.show('No se pudo identificar al usuario o empresa.', 'error');
      return;
    }

    const saldoIds = Array.from(this.selectedIds());

    this.submitting.set(true);
    this.expenseReportsService
      .create({
        gestion: this.form.value.gestion?.trim(),
        isDirecta: true,
        userId,
        clientId,
        ...(saldoIds.length > 0 && { saldoIds }),
      })
      .subscribe({
        next: (report) => {
          this.submitting.set(false);
          this.saldoService.refreshTotal();
          this.notifications.show('Rendición creada correctamente.', 'success');
          this.router.navigate(['/mis-rendiciones', report._id, 'detalle']);
        },
        error: (err) => {
          this.submitting.set(false);
          const raw = err?.error?.message;
          const msg = Array.isArray(raw) ? raw.join(', ') : raw;
          this.notifications.show(msg || 'Error al crear la rendición.', 'error');
        },
      });
  }

  isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!ctrl && ctrl.invalid && ctrl.touched;
  }
}
