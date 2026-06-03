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
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { AdvanceService } from '../../../services/advance.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { CategoriaService } from '../../../services/categoria.service';
import {
  PlacesAutocompleteDirective,
  PlaceResult,
} from '../../../directives/places-autocomplete.directive';
import { IProject } from '../../invoices/interfaces/project.interface';
import { ICategory } from '../../invoices/interfaces/category.interface';
import {
  ICreateAdvancePayload,
  IAdvanceLinePayload,
  IAdvance,
} from '../../../interfaces/advance.interface';
import {
  coerceViaticoLineNumber,
  computeViaticoLineTotal,
  optionalViaticoLineNumber,
  validateViaticoLineFields,
} from '../viatico-line.util';

@Component({
  selector: 'app-solicitud-viaticos-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PlacesAutocompleteDirective],
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
  private categoriaService = inject(CategoriaService);

  submitting = signal(false);
  projects = signal<IProject[]>([]);
  categories = signal<ICategory[]>([]);

  form = this.fb.group({
    place: ['', Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    projectId: ['', Validators.required],
    observations: [''],
    lines: this.fb.array([this.createLineGroup()]),
  });

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
    });
    while (this.lines.length) {
      this.lines.removeAt(0);
    }
    this.lines.push(this.createLineGroup());

    const clientId = this.resolveCompanyId();
    if (clientId) {
      this.invoicesService.getProjects(clientId).subscribe({
        next: (list) =>
          this.projects.set((list || []).filter((p) => p.isActive !== false)),
        error: () => this.projects.set([]),
      });
      this.categoriaService.getAllFlat().subscribe({
        next: (res) =>
          this.categories.set((res || []).filter((c) => c.isActive !== false)),
        error: () => this.categories.set([]),
      });
    }
  }

  private ymdFromAdvanceDate(value: string | undefined): string {
    if (!value) return '';
    const s = String(value);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  private categoryIdFromLine(line: {
    categoryId: unknown;
  }): string {
    const c = line.categoryId;
    if (c && typeof c === 'object' && '_id' in (c as object)) {
      return String((c as { _id: string })._id);
    }
    return String(c ?? '');
  }

  private bootstrapFromAdvance(adv: IAdvance): void {
    while (this.lines.length) {
      this.lines.removeAt(0);
    }
    const rows = adv.lines?.length ? adv.lines : [];
    for (const ln of rows) {
      const g = this.createLineGroup();
      g.patchValue({
        categoryId: this.categoryIdFromLine(ln),
        detalle: ln.detalle ?? '',
        importe: ln.importe,
        peopleCount: ln.peopleCount,
        glpPerDay: ln.glpPerDay,
        days: ln.days,
      });
      this.lines.push(g);
    }
    if (!this.lines.length) {
      this.lines.push(this.createLineGroup());
    }

    const pid =
      typeof adv.projectId === 'object' && adv.projectId
        ? adv.projectId._id
        : String(adv.projectId ?? '');

    this.form.patchValue({
      place: adv.place ?? '',
      startDate: this.ymdFromAdvanceDate(adv.startDate),
      endDate: this.ymdFromAdvanceDate(adv.endDate),
      projectId: pid,
      observations: adv.observations ?? '',
    });

    const clientId = this.resolveCompanyId();
    if (clientId) {
      this.invoicesService.getProjects(clientId).subscribe({
        next: (list) =>
          this.projects.set((list || []).filter((p) => p.isActive !== false)),
        error: () => this.projects.set([]),
      });
      this.categoriaService.getAllFlat().subscribe({
        next: (res) =>
          this.categories.set((res || []).filter((c) => c.isActive !== false)),
        error: () => this.categories.set([]),
      });
    }
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

  createLineGroup(): FormGroup {
    return this.fb.group({
      categoryId: ['', Validators.required],
      detalle: [''],
      importe: [null, [Validators.min(0)]],
      peopleCount: [null],
      glpPerDay: [null],
      days: [null, [Validators.min(0)]],
    });
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  lineTotal(ctrl: FormGroup): number {
    const v = ctrl.value;
    return computeViaticoLineTotal(
      Number(v.importe),
      Number(v.glpPerDay),
      Number(v.days),
      Number(v.peopleCount)
    );
  }

  totalGeneral(): number {
    let sum = 0;
    for (let i = 0; i < this.lines.length; i++) {
      sum += this.lineTotal(this.lines.at(i) as FormGroup);
    }
    return Math.round(sum * 100) / 100;
  }

  addLine(): void {
    this.lines.push(this.createLineGroup());
  }

  removeLine(index: number): void {
    if (this.lines.length <= 1) return;
    this.lines.removeAt(index);
  }

  onPlaceSelected(ev: PlaceResult): void {
    this.form.patchValue({ place: ev.address });
  }

  dismiss(success = false): void {
    this.closed.emit(success);
  }

  overlayClick(): void {
    if (!this.submitting()) this.dismiss(false);
  }

  private normalizeLineNumericFields(): void {
    for (let i = 0; i < this.lines.length; i++) {
      const g = this.lines.at(i) as FormGroup;
      const v = g.value;
      g.patchValue(
        {
          importe: optionalViaticoLineNumber(v.importe),
          peopleCount: optionalViaticoLineNumber(v.peopleCount),
          glpPerDay: optionalViaticoLineNumber(v.glpPerDay),
          days: optionalViaticoLineNumber(v.days),
        },
        { emitEvent: false }
      );
    }
    this.form.updateValueAndValidity();
  }

  submit(): void {
    this.normalizeLineNumericFields();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.show('Complete los campos obligatorios', 'error');
      return;
    }

    for (let i = 0; i < this.lines.length; i++) {
      const lineError = validateViaticoLineFields(
        (this.lines.at(i) as FormGroup).value
      );
      if (lineError) {
        this.form.markAllAsTouched();
        this.notifications.show(lineError, 'error');
        return;
      }
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
      const obs = (this.form.value.observations || '').trim();
      if (obs.length < 10) {
        this.notifications.show(
          'Para fechas de inicio pasadas, las observaciones deben tener al menos 10 caracteres.',
          'error'
        );
        return;
      }
    }

    const place = (this.form.value.place || '').trim();
    const linesPayload: IAdvanceLinePayload[] = [];
    for (let i = 0; i < this.lines.length; i++) {
      const g = this.lines.at(i) as FormGroup;
      const v = g.value;
      const lineTotal = this.lineTotal(g);
      linesPayload.push({
        categoryId: v.categoryId,
        detalle: (v.detalle || '').trim() || undefined,
        importe: Number(v.importe),
        peopleCount: Number(v.peopleCount),
        glpPerDay: Number(v.glpPerDay),
        days: Number(v.days),
        lineTotal,
      });
    }

    const total = this.totalGeneral();
    const metaDesc = `Viático: ${place} (${startStr} → ${endStr})`;

    const payload: ICreateAdvancePayload = {
      amount: total,
      description: metaDesc,
      place,
      startDate: `${startStr}T12:00:00.000Z`,
      endDate: `${endStr}T12:00:00.000Z`,
      projectId: this.form.value.projectId as string,
      lines: linesPayload,
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
}
