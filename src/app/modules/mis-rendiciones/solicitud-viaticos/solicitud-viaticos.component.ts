import {
  Component,
  OnInit,
  computed,
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
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { CategoriaService } from '../../../services/categoria.service';
import { CategoryGroupService } from '../../../services/category-group.service';
import { SaldoService } from '../../../services/saldo.service';
import { ISaldo } from '../../../interfaces/saldo.interface';
import {
  PlacesAutocompleteDirective,
  PlaceResult,
} from '../../../directives/places-autocomplete.directive';
import { ProjectSelectComponent } from '../../../design-system/project-select/project-select.component';
import { IProject } from '../../invoices/interfaces/project.interface';
import { ICategory } from '../../invoices/interfaces/category.interface';
import { ICategoryGroup } from '../../categorias/interfaces/category-group.interface';
import {
  ICreateAdvancePayload,
  IAdvanceLinePayload,
  IAdvance,
} from '../../../interfaces/advance.interface';
import { ICreateViaticoPayload, IResubmitViaticoPayload, IExpenseReport } from '../../../interfaces/expense-report.interface';
import {
  coerceViaticoLineNumber,
  computeViaticoLineTotal,
  optionalViaticoLineNumber,
  validateViaticoLineFields,
} from '../viatico-line.util';

@Component({
  selector: 'app-solicitud-viaticos',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PlacesAutocompleteDirective,
    ProjectSelectComponent,
  ],
  templateUrl: './solicitud-viaticos.component.html',
})
export class SolicitudViaticosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private advanceService = inject(AdvanceService);
  private expenseReportsService = inject(ExpenseReportsService);
  private notifications = inject(NotificationService);
  private userState = inject(UserStateService);
  private invoicesService = inject(InvoicesService);
  private categoriaService = inject(CategoriaService);
  private categoryGroupService = inject(CategoryGroupService);
  private saldoService = inject(SaldoService);

  submitting = signal(false);
  useCustomBank = signal(false);

  // Saldos de viáticos del mismo centro de costo (bolsa).
  saldos = signal<ISaldo[]>([]);
  loadingSaldos = signal<boolean>(false);
  selectedSaldoIds = signal<Set<string>>(new Set());

  selectedSaldoTotal = computed(() =>
    this.saldos()
      .filter(s => this.selectedSaldoIds().has(s._id))
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
  );

  /** Monto del saldo realmente aplicado al viático (nunca más que el total). */
  saldoUsed(): number {
    return Math.min(this.selectedSaldoTotal(), this.totalGeneral());
  }

  /** Sobrante del saldo que volverá a la bolsa (cuando el saldo cubre todo el viático). */
  saldoExcess(): number {
    return Math.round(Math.max(0, this.selectedSaldoTotal() - this.totalGeneral()) * 100) / 100;
  }

  /** Diferencia que deposita contabilidad (cuando el total del viático supera el saldo). */
  contabilidadDeposita(): number {
    return Math.round(Math.max(0, this.totalGeneral() - this.selectedSaldoTotal()) * 100) / 100;
  }

  // El saldo heredado de otra rendición (pendingBalance) prefinancia el viático igual
  // que un saldo de la bolsa: cubre el costo de las líneas, contabilidad deposita solo
  // la diferencia y, si el saldo supera el costo, el sobrante vuelve a la bolsa.

  /** Monto del saldo heredado realmente aplicado (nunca más que el costo de las líneas). */
  pendingUsed(): number {
    return Math.round(Math.min(this.pendingBalanceAmount(), this.totalGeneral()) * 100) / 100;
  }

  /** Sobrante del saldo heredado que volverá a la bolsa (cuando cubre todo el costo). */
  pendingExcess(): number {
    return Math.round(Math.max(0, this.pendingBalanceAmount() - this.totalGeneral()) * 100) / 100;
  }

  /** Diferencia que deposita contabilidad (cuando el costo supera el saldo heredado). */
  pendingDeposita(): number {
    return Math.round(Math.max(0, this.totalGeneral() - this.pendingBalanceAmount()) * 100) / 100;
  }

  /** Solo se ofrece la bolsa de saldos en solicitudes nuevas (no reenvío ni saldo heredado por query). */
  get canUseSaldoBag(): boolean {
    if (this.hasPendingBalance) return false;
    if (!this.isResubmit) return true;
    // En corrección solo se permite re-seleccionar saldo si el viático no tiene ya
    // uno aplicado (caso típico: fue rechazado y su saldo se devolvió a la bolsa).
    const v = this.viaticoToResubmit();
    return !!v && !(Array.isArray(v.saldoIds) && v.saldoIds.length > 0);
  }
  loading = signal(false);
  projects = signal<IProject[]>([]);
  categories = signal<ICategory[]>([]);
  /** Perfiles de categoría (category-groups). El centro de costo referencia uno y de él se derivan sus categorías. */
  categoryGroups = signal<ICategoryGroup[]>([]);
  /** ID del centro de costo elegido; espeja el control `projectId` para alimentar los computeds. */
  selectedProjectId = signal<string>('');
  advanceToResubmit = signal<IAdvance | null>(null);
  /** Viático unificado (ExpenseReport) en edición/reenvío. */
  viaticoToResubmit = signal<IExpenseReport | null>(null);

  /**
   * IDs de categoría permitidas por el perfil del centro de costo elegido, o
   * `null` cuando no aplica filtro (sin proyecto, proyecto sin perfil, o perfil
   * sin categorías) — en cuyo caso se muestran todas.
   */
  private allowedCategoryIdSet = computed<Set<string> | null>(() => {
    const pid = this.selectedProjectId();
    if (!pid) return null;
    const project = this.projects().find((p) => String(p._id) === String(pid));
    const groupId = project?.categoryGroupId;
    if (!groupId) return null;
    const group = this.categoryGroups().find((g) => String(g._id) === String(groupId));
    const ids = (group?.categoryIds ?? []).map(String);
    if (!ids.length) return null;
    return new Set(ids);
  });

  /** Categorías del perfil del proyecto (lista base compartida por todas las líneas). */
  private perfilCategories = computed<ICategory[]>(() => {
    const allowed = this.allowedCategoryIdSet();
    if (!allowed) return this.categories();
    return this.categories().filter((c) => allowed.has(String(c._id)));
  });

  private selectedLat: number | undefined;
  private selectedLng: number | undefined;

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
    bankName: [''],
    accountNumber: [''],
    cci: [''],
    lines: this.fb.array([this.createLineGroup()]),
  });

  get isResubmit(): boolean {
    return !!this.route.snapshot.paramMap.get('id');
  }

  /** Fecha de hoy en formato YYYY-MM-DD (local) para el atributo `min` de las fechas. */
  get todayStr(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
    // Espeja el centro de costo elegido y, al cambiarlo, limpia las categorías
    // de línea que no pertenezcan a su perfil. (En restauración se actualiza el
    // signal sin emitir, por lo que esto no borra las líneas precargadas.)
    this.form.get('projectId')?.valueChanges.subscribe((pid) => {
      this.selectedProjectId.set(pid ?? '');
      this.clearInvalidLineCategories();
      this.loadEligibleSaldos(pid ?? '');
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadForResubmit(id);
    } else {
      const qp = this.route.snapshot.queryParamMap;
      const fromReport = qp.get('pendingBalanceFromReportId');
      const amount = parseFloat(qp.get('pendingBalanceAmount') ?? '0');
      if (fromReport && amount > 0) {
        this.pendingBalanceFromReportId.set(fromReport);
        this.pendingBalanceAmount.set(amount);
        // El saldo heredado pertenece al centro de costo de la rendición de origen:
        // se fija automáticamente y se bloquea (no puede trasladarse a otro).
        this.lockProjectFromSourceReport(fromReport);
      }
      this.loadCatalogues();
    }
  }

  /**
   * Fija y bloquea el centro de costo a partir de la rendición que origina el saldo
   * heredado: ese saldo solo puede usarse en su mismo centro de costo, no en otro.
   */
  private lockProjectFromSourceReport(reportId: string): void {
    this.expenseReportsService.findOne(reportId).subscribe({
      next: (report) => {
        const raw = report?.projectId as unknown;
        const pid =
          raw && typeof raw === 'object'
            ? String((raw as { _id?: string })._id ?? '')
            : String(raw ?? '');
        if (!pid) return;
        const ctrl = this.form.get('projectId');
        ctrl?.setValue(pid);
        this.selectedProjectId.set(pid);
        ctrl?.disable({ emitEvent: false });
      },
      error: () => {},
    });
  }

  /** Carga los saldos de viáticos elegibles (mismo centro de costo) y limpia la selección. */
  private loadEligibleSaldos(projectId: string): void {
    this.selectedSaldoIds.set(new Set());
    if (!this.canUseSaldoBag || !projectId) {
      this.saldos.set([]);
      return;
    }
    this.loadingSaldos.set(true);
    this.saldoService.getEligible('viatico', projectId).subscribe({
      next: rows => {
        this.saldos.set(rows ?? []);
        this.loadingSaldos.set(false);
      },
      error: () => {
        this.saldos.set([]);
        this.loadingSaldos.set(false);
      },
    });
  }

  isSaldoSelected(id: string): boolean {
    return this.selectedSaldoIds().has(id);
  }

  /** Gestión / motivo del saldo, o su origen (rendición / N° operación). */
  saldoDescripcion(s: ISaldo): string {
    if (s.concepto?.trim()) return s.concepto.trim();
    const r = s.sourceReportId;
    if (r && typeof r !== 'string') return r.codigo || r.title || '';
    if (s.type === 'pago' && s.deposit?.operationNumber) return `Op. ${s.deposit.operationNumber}`;
    return '';
  }

  toggleSaldo(id: string): void {
    const next = new Set(this.selectedSaldoIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedSaldoIds.set(next);
  }

  private loadForResubmit(id: string): void {
    this.loading.set(true);
    // Los viáticos unificados son ExpenseReport (type='viatico'). Se intenta cargar
    // por ese endpoint; si no existe (solicitud legada en la colección Advance), se
    // cae al endpoint viejo de Advance.
    this.expenseReportsService.findOne(id).subscribe({
      next: (report) => {
        if (report?.type === 'viatico') {
          this.viaticoToResubmit.set(report);
          this.bootstrapFromViatico(report);
          this.loading.set(false);
        } else {
          this.loadLegacyAdvanceForResubmit(id);
        }
      },
      error: () => this.loadLegacyAdvanceForResubmit(id),
    });
  }

  private loadLegacyAdvanceForResubmit(id: string): void {
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
    this.categoryGroupService.getAll().subscribe({
      next: (groups) => this.categoryGroups.set(groups ?? []),
      error: () => this.categoryGroups.set([]),
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
      observations: adv.observations ?? '',
    });
    if (adv.requestAccountNumber) {
      this.useCustomBank.set(true);
      this.form.patchValue({ bankName: adv.requestBankName ?? '', accountNumber: adv.requestAccountNumber, cci: adv.requestCci ?? '' });
    }
    // Sin emitir: evita que el listener de `projectId` borre las categorías
    // de las líneas que acabamos de restaurar.
    this.form.get('projectId')?.setValue(pid, { emitEvent: false });
    this.selectedProjectId.set(pid);

    this.loadCatalogues();
  }

  /** Precarga el formulario desde un viático unificado (ExpenseReport) en edición. */
  private bootstrapFromViatico(report: IExpenseReport): void {
    while (this.lines.length) this.lines.removeAt(0);

    const reportLines = (report.viaticoLines as any[]) ?? [];
    for (const ln of reportLines) {
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
      typeof report.projectId === 'object' && report.projectId
        ? (report.projectId as { _id: string })._id
        : String(report.projectId ?? '');

    this.form.patchValue({
      place: report.viaticoPlace ?? '',
      startDate: this.ymdFromDate(report.viaticoStartDate),
      endDate: this.ymdFromDate(report.viaticoEndDate),
      observations: report.viaticoObservations ?? '',
    });
    if (report.viaticoAccountNumber) {
      this.useCustomBank.set(true);
      this.form.patchValue({ bankName: report.viaticoBankName ?? '', accountNumber: report.viaticoAccountNumber, cci: report.viaticoCci ?? '' });
    }
    this.form.get('projectId')?.setValue(pid, { emitEvent: false });
    this.selectedProjectId.set(pid);

    const rLat = (report as { viaticoLat?: number }).viaticoLat;
    const rLng = (report as { viaticoLng?: number }).viaticoLng;
    if (rLat != null) this.selectedLat = rLat;
    if (rLng != null) this.selectedLng = rLng;

    // Restaura el saldo heredado (si lo tuviera) para que el total cuadre.
    if (report.pendingBalanceFromReportId && (report.pendingBalanceAmount ?? 0) > 0) {
      this.pendingBalanceFromReportId.set(report.pendingBalanceFromReportId);
      this.pendingBalanceAmount.set(Number(report.pendingBalanceAmount));
    }

    // Como el projectId se fija sin emitir evento, cargamos los saldos elegibles a
    // mano: en una corrección sin saldo aplicado permite re-seleccionar de la bolsa.
    this.loadEligibleSaldos(pid);

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

  /**
   * Categorías visibles en una línea: las del perfil del proyecto, más la propia
   * categoría ya elegida (para no ocultar selecciones previas al corregir/reenviar).
   */
  categoriesForLine(ctrl: FormGroup): ICategory[] {
    const base = this.perfilCategories();
    const selected = ctrl.get('categoryId')?.value;
    if (!selected || base.some((c) => String(c._id) === String(selected))) {
      return base;
    }
    const own = this.categories().find((c) => String(c._id) === String(selected));
    return own ? [...base, own] : base;
  }

  /** Limpia las categorías de línea que no pertenezcan al perfil del proyecto actual. */
  private clearInvalidLineCategories(): void {
    const allowed = this.allowedCategoryIdSet();
    if (!allowed) return;
    for (let i = 0; i < this.lines.length; i++) {
      const ctrl = this.lines.at(i).get('categoryId');
      const val = ctrl?.value;
      if (val && !allowed.has(String(val))) ctrl?.setValue('');
    }
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
    this.selectedLat = ev.lat;
    this.selectedLng = ev.lng;
  }

  toggleCustomBank(): void {
    this.useCustomBank.update(v => !v);
    if (!this.useCustomBank()) {
      this.form.patchValue({ bankName: '', accountNumber: '', cci: '' });
    }
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
      this.notifications.show(
        'La fecha de inicio no puede ser anterior a hoy.',
        'error'
      );
      return;
    }

    const place = (this.form.value.place || '').trim();
    // getRawValue: el centro de costo puede estar deshabilitado (saldo heredado),
    // y los controles deshabilitados no aparecen en form.value.
    const projectId = (this.form.getRawValue().projectId as string) ?? '';
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
    const fromReportId = this.pendingBalanceFromReportId();
    const pendingAmt = this.pendingBalanceAmount();
    const hasPending = !!(fromReportId && pendingAmt > 0);

    const customBank = this.useCustomBank() ? {
      bankName: (this.form.value.bankName || '').trim() || undefined,
      accountNumber: (this.form.value.accountNumber || '').trim() || undefined,
      cci: (this.form.value.cci || '').trim() || undefined,
    } : {};

    this.submitting.set(true);

    // Saldos de la bolsa: prefinancian el viático. El saldo nunca cubre más que el
    // total: si lo supera, solo se usa lo necesario y el sobrante vuelve a la bolsa
    // (contabilidad no deposita nada); si el total lo supera, contabilidad deposita
    // la diferencia. Ambos casos son válidos, así que no hay restricción de monto.
    const saldoIds = Array.from(this.selectedSaldoIds());

    // Reenvío/edición de un viático unificado (ExpenseReport).
    const viatico = this.viaticoToResubmit();
    if (viatico) {
      const resubmitPayload: IResubmitViaticoPayload = {
        // El costo del viático son sus líneas. El saldo heredado lo prefinancia en el
        // backend (no se suma al anticipo), igual que un saldo de la bolsa.
        amount: linesTotal,
        place,
        ...(this.selectedLat != null && { lat: this.selectedLat }),
        ...(this.selectedLng != null && { lng: this.selectedLng }),
        startDate: `${startStr}T12:00:00.000Z`,
        endDate: `${endStr}T12:00:00.000Z`,
        projectId,
        lines: linesPayload,
        observations: (this.form.value.observations || '').trim() || undefined,
        ...(this.canUseSaldoBag && saldoIds.length > 0 && { saldoIds }),
        ...customBank,
      };
      this.expenseReportsService.resubmitViatico(viatico._id, resubmitPayload).subscribe({
        next: () => this.onSubmitSuccess(true),
        error: (e) => this.onSubmitError(e),
      });
      return;
    }

    const adv = this.advanceToResubmit();

    if (adv) {
      // Resubmit of a legacy Advance (old system)
      const legacyPayload: ICreateAdvancePayload = {
        amount: hasPending ? this.totalAnticipo() : linesTotal,
        description: `Viático: ${place} (${startStr} → ${endStr})`,
        place,
        ...(this.selectedLat != null && { lat: this.selectedLat }),
        ...(this.selectedLng != null && { lng: this.selectedLng }),
        startDate: `${startStr}T12:00:00.000Z`,
        endDate: `${endStr}T12:00:00.000Z`,
        projectId,
        lines: linesPayload,
        observations: (this.form.value.observations || '').trim() || undefined,
        ...(hasPending && {
          pendingBalanceFromReportId: fromReportId!,
          pendingBalanceAmount: pendingAmt,
          additionalAmount: linesTotal,
        }),
        ...customBank,
      };
      this.advanceService.resubmit(adv._id, legacyPayload).subscribe({
        next: () => this.onSubmitSuccess(true),
        error: (e) => this.onSubmitError(e),
      });
      return;
    }

    // New unified viatico (ExpenseReport type='viatico')
    const viaticoPayload: ICreateViaticoPayload = {
      // El costo del viático son sus líneas; el saldo heredado lo prefinancia en el
      // backend (no se suma al anticipo), igual que un saldo de la bolsa.
      amount: linesTotal,
      place,
      ...(this.selectedLat != null && { lat: this.selectedLat }),
      ...(this.selectedLng != null && { lng: this.selectedLng }),
      startDate: `${startStr}T12:00:00.000Z`,
      endDate: `${endStr}T12:00:00.000Z`,
      projectId,
      lines: linesPayload,
      observations: (this.form.value.observations || '').trim() || undefined,
      ...(hasPending && {
        pendingBalanceFromReportId: fromReportId!,
        pendingBalanceAmount: pendingAmt,
        additionalAmount: linesTotal,
      }),
      ...(this.canUseSaldoBag && saldoIds.length > 0 && { saldoIds }),
      ...customBank,
    };
    this.expenseReportsService.createViatico(viaticoPayload).subscribe({
      next: () => this.onSubmitSuccess(false),
      error: (e) => this.onSubmitError(e),
    });

  }

  private onSubmitSuccess(isResubmit: boolean): void {
    const msg = isResubmit
      ? 'Solicitud corregida y reenviada correctamente'
      : 'Solicitud de viáticos enviada correctamente';
    this.notifications.show(msg, 'success');
    this.submitting.set(false);
    this.saldoService.refreshTotal();
    const fromReport = this.pendingBalanceFromReportId();
    if (fromReport) {
      this.router.navigate(['/mis-rendiciones', fromReport, 'detalle']);
    } else {
      this.router.navigate(['/mis-rendiciones'], { queryParams: { tab: 'viaticos' } });
    }
  }

  private onSubmitError(e: any): void {
    const raw = e?.error?.message;
    const msg = Array.isArray(raw) ? raw.join(', ') : raw || 'Error al enviar la solicitud';
    this.notifications.show(msg, 'error');
    this.submitting.set(false);
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
