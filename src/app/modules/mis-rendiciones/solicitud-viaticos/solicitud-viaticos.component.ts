import {
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
  selector: 'app-solicitud-viaticos',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PlacesAutocompleteDirective],
  templateUrl: './solicitud-viaticos.component.html',
})
export class SolicitudViaticosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private advanceService = inject(AdvanceService);
  private notifications = inject(NotificationService);
  private userState = inject(UserStateService);
  private invoicesService = inject(InvoicesService);
  private categoriaService = inject(CategoriaService);

  submitting = signal(false);
  loading = signal(false);
  projects = signal<IProject[]>([]);
  categories = signal<ICategory[]>([]);
  advanceToResubmit = signal<IAdvance | null>(null);

  /** ID de la rendición de origen cuando se traslada saldo pendiente. */
  pendingBalanceFromReportId = signal<string | null>(null);
  /** Monto del saldo pendiente trasladado desde la rendición de origen. */
  pendingBalanceAmount = signal<number>(0);

  form = this.fb.group({
    place: ['', Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    projectId: ['', Validators.required],
    observations: [''],
    lines: this.fb.array([this.createLineGroup()]),
  });

  get isResubmit(): boolean {
    return !!this.route.snapshot.paramMap.get('id');
  }

  get hasPendingBalance(): boolean {
    return !!this.pendingBalanceFromReportId() && this.pendingBalanceAmount() > 0;
  }

  get pageTitle(): string {
    const adv = this.advanceToResubmit();
    if (adv) return `Corregir solicitud · v${adv.solicitudVersion ?? 1}`;
    return this.hasPendingBalance
      ? 'Nueva solicitud de viáticos (con saldo pendiente)'
      : 'Nueva solicitud de viáticos';
  }

  /** Total de las líneas del formulario (monto adicional). */
  totalGeneral(): number {
    let sum = 0;
    for (let i = 0; i < this.lines.length; i++) {
      sum += this.lineTotal(this.lines.at(i) as FormGroup);
    }
    return Math.round(sum * 100) / 100;
  }

  /** Total del anticipo = saldo pendiente + líneas adicionales. */
  totalAnticipo(): number {
    return Math.round((this.pendingBalanceAmount() + this.totalGeneral()) * 100) / 100;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadAdvanceForResubmit(id);
    } else {
      const qp = this.route.snapshot.queryParamMap;
      const fromReport = qp.get('pendingBalanceFromReportId');
      const amount = parseFloat(qp.get('pendingBalanceAmount') ?? '0');
      if (fromReport && amount > 0) {
        this.pendingBalanceFromReportId.set(fromReport);
        this.pendingBalanceAmount.set(amount);
      }
      this.loadCatalogues();
    }
  }

  private loadAdvanceForResubmit(id: string): void {
    this.loading.set(true);
    this.advanceService.findOne(id).subscribe({
      next: (adv) => {
        this.advanceToResubmit.set(adv);
        this.bootstrapFromAdvance(adv);
        this.loading.set(false);
      },
      error: () => {
        this.notifications.show('No se pudo cargar la solicitud', 'error');
        this.loading.set(false);
        this.router.navigate(['/mis-rendiciones']);
      },
    });
  }

  private loadCatalogues(): void {
    const clientId = this.resolveCompanyId();
    if (!clientId) return;
    this.invoicesService.getProjects(clientId).subscribe({
      next: (list) => this.projects.set((list || []).filter((p) => p.isActive !== false)),
      error: () => this.projects.set([]),
    });
    this.categoriaService.getAllFlat().subscribe({
      next: (res) => this.categories.set((res || []).filter((c) => c.isActive !== false)),
      error: () => this.categories.set([]),
    });
  }

  private bootstrapFromAdvance(adv: IAdvance): void {
    while (this.lines.length) this.lines.removeAt(0);

    for (const ln of adv.lines?.length ? adv.lines : []) {
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
    if (!this.lines.length) this.lines.push(this.createLineGroup());

    const pid =
      typeof adv.projectId === 'object' && adv.projectId
        ? adv.projectId._id
        : String(adv.projectId ?? '');

    this.form.patchValue({
      place: adv.place ?? '',
      startDate: this.ymdFromDate(adv.startDate),
      endDate: this.ymdFromDate(adv.endDate),
      projectId: pid,
      observations: adv.observations ?? '',
    });

    this.loadCatalogues();
  }

  private ymdFromDate(value: string | undefined): string {
    if (!value) return '';
    return String(value).length >= 10 ? String(value).slice(0, 10) : String(value);
  }

  private categoryIdFromLine(line: { categoryId: unknown }): string {
    const c = line.categoryId;
    if (c && typeof c === 'object' && '_id' in (c as object)) {
      return String((c as { _id: string })._id);
    }
    return String(c ?? '');
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

  goBack(): void {
    const fromReport = this.pendingBalanceFromReportId();
    if (fromReport) {
      this.router.navigate(['/mis-rendiciones', fromReport, 'detalle']);
    } else {
      this.router.navigate(['/mis-rendiciones']);
    }
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
      linesPayload.push({
        categoryId: v.categoryId,
        detalle: (v.detalle || '').trim() || undefined,
        importe: Number(v.importe),
        peopleCount: Number(v.peopleCount),
        glpPerDay: Number(v.glpPerDay),
        days: Number(v.days),
        lineTotal: this.lineTotal(g),
      });
    }

    const linesTotal = this.totalGeneral();
    const metaDesc = `Viático: ${place} (${startStr} → ${endStr})`;
    const fromReportId = this.pendingBalanceFromReportId();
    const pendingAmt = this.pendingBalanceAmount();
    const hasPending = !!(fromReportId && pendingAmt > 0);

    const payload: ICreateAdvancePayload = {
      amount: hasPending ? this.totalAnticipo() : linesTotal,
      description: metaDesc,
      place,
      startDate: `${startStr}T12:00:00.000Z`,
      endDate: `${endStr}T12:00:00.000Z`,
      projectId: this.form.value.projectId as string,
      lines: linesPayload,
      observations: (this.form.value.observations || '').trim() || undefined,
      ...(hasPending && {
        pendingBalanceFromReportId: fromReportId!,
        pendingBalanceAmount: pendingAmt,
        additionalAmount: linesTotal,
      }),
    };

    this.submitting.set(true);
    const adv = this.advanceToResubmit();
    const req = adv
      ? this.advanceService.resubmit(adv._id, payload)
      : this.advanceService.create(payload);

    req.subscribe({
      next: () => {
        const msg = adv
          ? 'Solicitud corregida y reenviada correctamente'
          : 'Solicitud de viáticos enviada correctamente';
        this.notifications.show(msg, 'success');
        this.submitting.set(false);
        this.router.navigate(['/mis-rendiciones']);
      },
      error: (e) => {
        const raw = e?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw || 'Error al enviar la solicitud';
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
