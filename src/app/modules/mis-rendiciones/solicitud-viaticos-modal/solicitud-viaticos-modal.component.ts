import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AdvanceService } from '../../../services/advance.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import {
  PlacesAutocompleteDirective,
  PlaceResult,
} from '../../../directives/places-autocomplete.directive';
import { ProjectSelectComponent } from '../../../design-system/project-select/project-select.component';
import { IProject } from '../../invoices/interfaces/project.interface';
import {
  ICreateAdvancePayload,
  IAdvance,
} from '../../../interfaces/advance.interface';

@Component({
  selector: 'app-solicitud-viaticos-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PlacesAutocompleteDirective,
    ProjectSelectComponent,
  ],
  templateUrl: './solicitud-viaticos-modal.component.html',
  styleUrls: ['./solicitud-viaticos-modal.component.scss'],
})
export class SolicitudViaticosModalComponent implements OnChanges {
  @Input({ required: true }) isOpen = false;
  /** Si viene desde una rendición, se envía al crear la solicitud (opcional). */
  @Input() expenseReportId: string | null = null;
  @Input() initialProjectId: string | null = null;
  /** Si está definido, el envío usa PATCH resubmit en lugar de crear (Fase 3). */
  @Input() advanceToResubmit: IAdvance | null = null;

  @Output() closed = new EventEmitter<boolean>();

  private fb = inject(FormBuilder);
  private advanceService = inject(AdvanceService);
  private notifications = inject(NotificationService);
  private userState = inject(UserStateService);
  private invoicesService = inject(InvoicesService);

  submitting = signal(false);
  projects = signal<IProject[]>([]);
  private selectedLat: number | undefined;
  private selectedLng: number | undefined;
  /** ID del centro de costo elegido; espeja el control `projectId`. */
  selectedProjectId = signal<string>('');

  form = this.fb.group({
    place: ['', Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    projectId: ['', Validators.required],
    observations: [''],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  constructor() {
    this.form.get('projectId')?.valueChanges.subscribe((pid) => {
      this.selectedProjectId.set(pid ?? '');
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue === true) {
      this.bootstrapModal();
    }
  }

  private bootstrapModal(): void {
    if (this.advanceToResubmit) {
      this.bootstrapFromAdvance(this.advanceToResubmit);
      return;
    }

    this.form.reset({
      place: '',
      startDate: '',
      endDate: '',
      projectId: this.initialProjectId || '',
      observations: '',
      amount: null,
    });

    this.loadCatalogues();
  }

  private loadCatalogues(): void {
    const clientId = this.resolveCompanyId();
    if (!clientId) return;
    this.invoicesService.getProjects(clientId).subscribe({
      next: (list) =>
        this.projects.set((list || []).filter((p) => p.isActive !== false)),
      error: () => this.projects.set([]),
    });
  }

  private ymdFromAdvanceDate(value: string | undefined): string {
    if (!value) return '';
    const s = String(value);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  private bootstrapFromAdvance(adv: IAdvance): void {
    // El monto requerido equivale al costo que antes se armaba con el detalle por
    // categoría: `additionalAmount` cuando la solicitud incorporó un saldo heredado,
    // o `amount` completo en caso contrario.
    const pid =
      typeof adv.projectId === 'object' && adv.projectId
        ? adv.projectId._id
        : String(adv.projectId ?? '');

    this.form.patchValue({
      place: adv.place ?? '',
      startDate: this.ymdFromAdvanceDate(adv.startDate),
      endDate: this.ymdFromAdvanceDate(adv.endDate),
      observations: adv.observations ?? '',
      amount: adv.additionalAmount ?? adv.amount,
    });
    // Sin emitir: evita relanzar efectos secundarios del listener de `projectId`.
    this.form.get('projectId')?.setValue(pid, { emitEvent: false });
    this.selectedProjectId.set(pid);

    this.loadCatalogues();
  }

  private resolveCompanyId(): string {
    const u = this.userState.getUser() as Record<string, unknown> | null;
    if (!u) return '';
    return (
      (u['companyId'] as string) ||
      ((u['client'] as { _id?: string })?._id ?? '') ||
      ((u['clientId'] as { _id?: string })?._id ?? '') ||
      (typeof u['clientId'] === 'string' ? (u['clientId'] as string) : '') ||
      ''
    );
  }

  totalGeneral(): number {
    const n = Number(this.form.value.amount);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  onPlaceSelected(ev: PlaceResult): void {
    this.form.patchValue({ place: ev.address });
    this.selectedLat = ev.lat;
    this.selectedLng = ev.lng;
  }

  dismiss(success = false): void {
    this.closed.emit(success);
  }

  overlayClick(): void {
    if (!this.submitting()) this.dismiss(false);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.show('Complete los campos obligatorios', 'error');
      return;
    }

    const startStr = this.form.value.startDate as string;
    const endStr = this.form.value.endDate as string;
    const start = this.parseLocalDate(startStr);
    const end = this.parseLocalDate(endStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (end < start) {
      this.notifications.show('La fecha fin debe ser mayor o igual a la fecha inicio', 'error');
      return;
    }

    if (start < today) {
      this.notifications.show(
        'La fecha de inicio no puede ser anterior a hoy.',
        'error'
      );
      return;
    }

    const place = (this.form.value.place || '').trim();
    const total = this.totalGeneral();
    const metaDesc = `Viático: ${place} (${startStr} → ${endStr})`;

    const payload: ICreateAdvancePayload = {
      amount: total,
      description: metaDesc,
      place,
      ...(this.selectedLat != null && { lat: this.selectedLat }),
      ...(this.selectedLng != null && { lng: this.selectedLng }),
      startDate: `${startStr}T12:00:00.000Z`,
      endDate: `${endStr}T12:00:00.000Z`,
      projectId: this.form.value.projectId as string,
      observations: (this.form.value.observations || '').trim() || undefined,
    };
    if (!this.advanceToResubmit && this.expenseReportId) {
      payload.expenseReportId = this.expenseReportId;
    }

    this.submitting.set(true);
    const req = this.advanceToResubmit
      ? this.advanceService.resubmit(this.advanceToResubmit._id, payload)
      : this.advanceService.create(payload);

    req.subscribe({
      next: () => {
        const msg = this.advanceToResubmit
          ? 'Solicitud corregida y reenviada correctamente'
          : 'Solicitud de viáticos enviada correctamente';
        this.notifications.show(msg, 'success');
        this.submitting.set(false);
        this.dismiss(true);
      },
      error: (e) => {
        const msg =
          e?.error?.message ||
          (Array.isArray(e?.error?.message)
            ? e.error.message.join(', ')
            : null) ||
          'Error al enviar la solicitud';
        this.notifications.show(msg, 'error');
        this.submitting.set(false);
      },
    });
  }

  private parseLocalDate(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  projectLabel(p: IProject): string {
    return p.code ? `${p.code} — ${p.name}` : p.name;
  }

  /** Fecha de hoy en formato YYYY-MM-DD (local) para el atributo `min` de las fechas. */
  get todayStr(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
