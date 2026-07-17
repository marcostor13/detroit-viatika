import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdvanceService } from '../../../services/advance.service';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { UserStateService } from '../../../services/user-state.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { IOrdenTrabajo } from '../../../interfaces/orden-trabajo.interface';
import {
  PlacesAutocompleteDirective,
  PlaceResult,
} from '../../../directives/places-autocomplete.directive';
import { ProjectSelectComponent } from '../../../design-system/project-select/project-select.component';
import { FormFieldComponent } from '../../../design-system/form-field/form-field.component';
import { IProject } from '../../invoices/interfaces/project.interface';
import {
  ICreateAdvancePayload,
  IAdvance,
} from '../../../interfaces/advance.interface';
import { ICreateViaticoPayload, IResubmitViaticoPayload, IExpenseReport } from '../../../interfaces/expense-report.interface';
import { AccountingConfigService } from '../../../services/accounting-config.service';
import { MONEDA_CATALOG, DEFAULT_MONEDA, MonedaInfo, monedaSymbol } from '../../../constants/moneda';

@Component({
  selector: 'app-solicitud-viaticos',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PlacesAutocompleteDirective,
    ProjectSelectComponent,
    FormFieldComponent,
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
  private ordenTrabajoService = inject(OrdenTrabajoService);
  private accountingConfigService = inject(AccountingConfigService);

  ordenesTrabajo = signal<IOrdenTrabajo[]>([]);
  /** Monedas disponibles para la empresa (Plan de Cuentas y Bancos). Fallback: solo soles. */
  monedasDisponibles = signal<MonedaInfo[]>([MONEDA_CATALOG[DEFAULT_MONEDA]]);

  submitting = signal(false);
  useCustomBank = signal(false);

  loading = signal(false);
  projects = signal<IProject[]>([]);
  /** ID del centro de costo elegido; espeja el control `projectId`. */
  selectedProjectId = signal<string>('');

  /**
   * OTs a mostrar en el desplegable: solo las del centro de costo elegido.
   * Sin centro de costo seleccionado no se ofrece ninguna OT.
   */
  filteredOrdenesTrabajo = computed<IOrdenTrabajo[]>(() => {
    const pid = this.selectedProjectId();
    if (!pid) return [];
    return this.ordenesTrabajo().filter((ot) => this.otCostCenterId(ot) === pid);
  });
  advanceToResubmit = signal<IAdvance | null>(null);
  /** Viático unificado (ExpenseReport) en edición/reenvío. */
  viaticoToResubmit = signal<IExpenseReport | null>(null);

  private selectedLat: number | undefined;
  private selectedLng: number | undefined;

  form = this.fb.group({
    place: ['', Validators.required],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    projectId: ['', Validators.required],
    ordenTrabajoId: [''],
    observations: [''],
    bankName: [''],
    accountNumber: [''],
    cci: [''],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    moneda: [DEFAULT_MONEDA, Validators.required],
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

  get pageTitle(): string {
    const adv = this.advanceToResubmit();
    if (adv) return `Corregir solicitud · v${adv.solicitudVersion ?? 1}`;
    return 'Nueva solicitud de viáticos';
  }

  /** Monto requerido ingresado por el colaborador. */
  totalGeneral(): number {
    const n = Number(this.form.value.amount);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  /** Símbolo de la moneda elegida ('S/' / '$'), para labels y totales. */
  totalSymbol(): string {
    return monedaSymbol(this.form.value.moneda);
  }

  ngOnInit(): void {
    this.form.get('projectId')?.valueChanges.subscribe((pid) => {
      this.selectedProjectId.set(pid ?? '');
      // Si la OT elegida no pertenece al nuevo centro de costo, se limpia.
      this.clearOtIfNotInCostCenter(pid ?? '');
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadForResubmit(id);
    } else {
      this.loadCatalogues();
    }
  }

  /** Id del centro de costo de una OT (soporta el ref poblado o el id plano). */
  private otCostCenterId(ot: IOrdenTrabajo): string {
    const cc = ot.costCenterId;
    return cc && typeof cc === 'object' ? String(cc._id ?? '') : String(cc ?? '');
  }

  /** Limpia la OT seleccionada si no pertenece al centro de costo indicado. */
  private clearOtIfNotInCostCenter(projectId: string): void {
    const otId = this.form.get('ordenTrabajoId')?.value;
    if (!otId) return;
    const stillValid = this.ordenesTrabajo().some(
      (ot) => ot._id === otId && this.otCostCenterId(ot) === projectId
    );
    if (!stillValid) {
      this.form.get('ordenTrabajoId')?.setValue('');
    }
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
    this.ordenTrabajoService.getAll().subscribe({
      next: (list) => this.ordenesTrabajo.set((list || []).filter((o) => o.isActive !== false)),
      error: () => this.ordenesTrabajo.set([]),
    });
    this.accountingConfigService.getAvailableCurrencies(clientId).subscribe({
      next: (codes) => {
        const infos = (codes || [])
          .map((c) => MONEDA_CATALOG[c])
          .filter((m): m is MonedaInfo => !!m);
        this.monedasDisponibles.set(infos.length ? infos : [MONEDA_CATALOG[DEFAULT_MONEDA]]);
      },
      error: () => this.monedasDisponibles.set([MONEDA_CATALOG[DEFAULT_MONEDA]]),
    });
  }

  private bootstrapFromAdvance(adv: IAdvance): void {
    this.form.patchValue({ amount: adv.amount, moneda: adv.moneda ?? DEFAULT_MONEDA });

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
    this.form.get('projectId')?.setValue(pid, { emitEvent: false });
    this.selectedProjectId.set(pid);

    this.loadCatalogues();
  }

  /** Precarga el formulario desde un viático unificado (ExpenseReport) en edición. */
  private bootstrapFromViatico(report: IExpenseReport): void {
    this.form.patchValue({ amount: report.viaticoAmount ?? null, moneda: report.viaticoMoneda ?? DEFAULT_MONEDA });

    const pid =
      typeof report.projectId === 'object' && report.projectId
        ? (report.projectId as { _id: string })._id
        : String(report.projectId ?? '');

    const otId =
      report.viaticoOrdenTrabajoId && typeof report.viaticoOrdenTrabajoId === 'object'
        ? report.viaticoOrdenTrabajoId._id
        : String(report.viaticoOrdenTrabajoId ?? '');

    this.form.patchValue({
      place: report.viaticoPlace ?? '',
      startDate: this.ymdFromDate(report.viaticoStartDate),
      endDate: this.ymdFromDate(report.viaticoEndDate),
      ordenTrabajoId: otId,
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

    this.loadCatalogues();
  }

  private ymdFromDate(value: string | undefined): string {
    if (!value) return '';
    return String(value).length >= 10 ? String(value).slice(0, 10) : String(value);
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
    this.router.navigate(['/mis-rendiciones']);
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
    const projectId = (this.form.getRawValue().projectId as string) ?? '';
    const ordenTrabajoId = (this.form.value.ordenTrabajoId as string) || undefined;
    const montoRequerido = this.totalGeneral();
    const moneda = (this.form.value.moneda as string) || DEFAULT_MONEDA;

    const customBank = this.useCustomBank() ? {
      bankName: (this.form.value.bankName || '').trim() || undefined,
      accountNumber: (this.form.value.accountNumber || '').trim() || undefined,
      cci: (this.form.value.cci || '').trim() || undefined,
    } : {};

    this.submitting.set(true);

    // Reenvío/edición de un viático unificado (ExpenseReport).
    const viatico = this.viaticoToResubmit();
    if (viatico) {
      const resubmitPayload: IResubmitViaticoPayload = {
        amount: montoRequerido,
        moneda,
        place,
        ...(this.selectedLat != null && { lat: this.selectedLat }),
        ...(this.selectedLng != null && { lng: this.selectedLng }),
        startDate: `${startStr}T12:00:00.000Z`,
        endDate: `${endStr}T12:00:00.000Z`,
        projectId,
        ordenTrabajoId,
        observations: (this.form.value.observations || '').trim() || undefined,
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
        amount: montoRequerido,
        moneda,
        description: `Viático: ${place} (${startStr} → ${endStr})`,
        place,
        ...(this.selectedLat != null && { lat: this.selectedLat }),
        ...(this.selectedLng != null && { lng: this.selectedLng }),
        startDate: `${startStr}T12:00:00.000Z`,
        endDate: `${endStr}T12:00:00.000Z`,
        projectId,
        observations: (this.form.value.observations || '').trim() || undefined,
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
      amount: montoRequerido,
      moneda,
      place,
      ...(this.selectedLat != null && { lat: this.selectedLat }),
      ...(this.selectedLng != null && { lng: this.selectedLng }),
      startDate: `${startStr}T12:00:00.000Z`,
      endDate: `${endStr}T12:00:00.000Z`,
      projectId,
      ordenTrabajoId,
      observations: (this.form.value.observations || '').trim() || undefined,
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
    this.router.navigate(['/mis-rendiciones'], { queryParams: { tab: 'viaticos' } });
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
