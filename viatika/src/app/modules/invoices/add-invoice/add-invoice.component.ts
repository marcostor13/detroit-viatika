import { Component, inject, signal, computed, OnInit, Injector } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { NotificationService } from '../../../services/notification.service';
import { InvoicesService } from '../services/invoices.service';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { AdvanceService } from '../../../services/advance.service';
import { UserStateService } from '../../../services/user-state.service';
import { ExpenseService } from '../../../services/expense.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { UploadService } from '../../../services/upload.service';
import { environment } from '../../../../environments/environment';
import { CommonModule } from '@angular/common';
import { IProject } from '../interfaces/project.interface';
import { ICategory } from '../interfaces/category.interface';
import {
  InvoiceStatus,
  SunatValidationInfo,
  ExpenseType,
  ICreateDeclaracionJuradaPayload,
  IDeclaracionJuradaResponse,
} from '../interfaces/invoices.interface';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { ProjectSelectComponent } from '../../../design-system/project-select/project-select.component';
import { WorkerOption } from '../../../design-system/worker-select/worker-select.component';
import {
  SearchSelectComponent,
  SearchSelectOption,
} from '../../../design-system/search-select/search-select.component';
import { PlacesAutocompleteDirective, PlaceResult } from '../../../directives/places-autocomplete.directive';
import { CompanyConfigService } from '../../../services/company-config.service';
import { DEFAULT_MONEDA, expenseAmountInReport, monedaSymbol } from '../../../constants/moneda';
import { PERU_LOCATIONS, Departamento } from '../../../constants/peru-locations';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import {
  IOrdenTrabajo,
  otPerteneceACentroCosto,
} from '../../../interfaces/orden-trabajo.interface';

function findDepartamento(label: string): Departamento | undefined {
  return PERU_LOCATIONS.find(d => d.label === label);
}

declare const google: any;

@Component({
  selector: 'app-add-invoice',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, CommonModule, ButtonComponent, IconComponent, ProjectSelectComponent, SearchSelectComponent, PlacesAutocompleteDirective],
  templateUrl: './add-invoice.component.html',
  styleUrl: './add-invoice.component.scss',
})
export default class AddInvoiceComponent implements OnInit {
  private invoiceService = inject(InvoicesService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private notificationService = inject(NotificationService);
  private expenseReportsService = inject(ExpenseReportsService);
  private advanceService = inject(AdvanceService);
  private userStateService = inject(UserStateService);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  private uploadService = inject(UploadService);
  private companyConfigService = inject(CompanyConfigService);
  private expenseService = inject(ExpenseService);
  private ordenTrabajoService = inject(OrdenTrabajoService);
  /** Para resolver el servicio de exportación en diferido (jsPDF/ExcelJS fuera del bundle inicial). */
  private injector = inject(Injector);

  form!: FormGroup;
  id: string = this.route.snapshot.params['id'];
  categories: ICategory[] = [];
  categoriesLoaded = signal(false);
  proyects: IProject[] = [];
  /** Órdenes de Trabajo activas, requeridas en planilla de movilidad (formato ADF-FOR-005). */
  ordenesTrabajo: IOrdenTrabajo[] = [];
  /** Trabajadores del cliente, para el selector de colaborador por fila de la planilla. */
  workers: WorkerOption[] = [];
  previewImage: SafeUrl | null = null;
  /**
   * URL cruda (blob:) de la vista previa. `previewImage` es un SafeUrl (objeto),
   * que al abrirse con window.open se convierte en "[object Object]" y termina
   * redirigiendo al login; aquí se guarda la URL real para "Ver en pantalla
   * completa".
   */
  previewObjectUrl: string | null = null;
  selectedFile!: File;
  originalInvoice: any = null;
  sunatValidation: SunatValidationInfo | null = null;
  isSunatValidating = signal(false);
  rendicionId: string | null = null;
  isDirectaMode = false;
  /** True cuando la rendición asociada es directa (report.isDirecta), aunque no venga `mode=directa` en la URL. */
  isDirectaReport = signal<boolean>(false);
  /** True cuando la rendición directa ya tiene una OT propia heredada (rendiciones creadas tras esta funcionalidad). */
  directaOrdenTrabajoInherited = signal<boolean>(false);
  /** True cuando la planilla de movilidad hereda la OT de la solicitud de viático (VD-28). */
  viaticoOrdenTrabajoInherited = signal<boolean>(false);
  /** True cuando la rendición asociada es un viático (report.type === 'viatico'). */
  isViaticoReport = signal<boolean>(false);
  /**
   * OT heredada de la rendición, tal como la devuelve el reporte. Se guarda aparte
   * porque el selector solo lista las OT del centro de costo elegido: si la OT
   * heredada es de otro centro de costo o está desactivada, no estaría entre las
   * opciones y el campo se vería vacío aunque la rendición sí tenga OT.
   */
  inheritedOrdenTrabajo = signal<{ _id: string; nombre: string } | null>(null);
  fromContabilidad = false;

  expenseType = signal<ExpenseType>('factura');
  /** Sub-tipo para otros_gastos: TK | BV | RC | DJ | OT */
  otrosSubTipo = signal<string>('AL');
  /** Sub-tipos que llevan documento físico con RUC/serie/correlativo. */
  otrosSubTipoMuestraDocumento = computed(() =>
    ['TK', 'BV', 'RC'].includes(this.otrosSubTipo())
  );
  /**
   * Sub-tipos de Otros Gastos que exigen declaración jurada + firma digital
   * (VD-91): AL (Alimentación sin documentación) y DJE (DJ al extranjero). DJ
   * nacional se conserva por retrocompatibilidad de gastos ya creados.
   */
  otrosSubTipoRequiereDeclaracion = computed(() =>
    ['AL', 'DJ', 'DJE'].includes(this.otrosSubTipo())
  );

  /**
   * Opciones del selector "Tipo de documento" de Otros Gastos (VD-91). Las dos
   * opcionales — RC (Recibos diversos) y DJE (DJ al extranjero) — se ocultan
   * según la configuración por usuario (`permissions.otrosGastosOpcionales`);
   * por defecto ambas están habilitadas.
   */
  get otrosSubTipoOpciones(): { code: string; label: string; hint?: string }[] {
    const cfg = this.userStateService.getUser()?.permissions?.otrosGastosOpcionales;
    const opciones: { code: string; label: string; hint?: string }[] = [
      { code: 'AL', label: 'Alimentación sin documentación' },
      { code: 'BV', label: 'Gastos con Boleta de venta', hint: 'RUC inscrito en RUS' },
    ];
    if (cfg?.recibosDiversos !== false) {
      opciones.push({ code: 'RC', label: 'Recibos diversos', hint: 'trámites legales' });
    }
    if (cfg?.djExtranjero !== false) {
      opciones.push({ code: 'DJE', label: 'DJ. Declaración jurada', hint: 'viajes al extranjero' });
    }
    opciones.push({ code: 'OT', label: 'Otros' });
    return opciones;
  }
  rendicionBudget = signal<number>(0);
  rendicionSpent = signal<number>(0);
  /** Moneda de la rendición a la que se adjunta el comprobante. */
  rendicionMoneda = signal<string>(DEFAULT_MONEDA);
  /** Símbolo de esa moneda, para los importes de la cabecera. */
  rendicionSymbol = computed(() => monedaSymbol(this.rendicionMoneda()));
  rendicionSettlementDiff = signal<number | null>(null);
  rendicionAvailable = computed(() => {
    const diff = this.rendicionSettlementDiff();
    if (diff !== null) return diff;
    return this.rendicionBudget() - this.rendicionSpent();
  });
  percentage = signal(0);
  rucLookupLoading = signal(false);
  fetchedRazonSocial = signal<string | null>(null);
  rucNotFound = signal(false);
  mobilityDailyLimit: number | null = null;
  readonly departamentos = PERU_LOCATIONS;
  isLoading = signal(false);
  readonly todayIso = new Date().toISOString().split('T')[0];
  showPostOcrReview = signal(false);
  postOcrInvoiceId = signal<string | null>(null);
  private postOcrBaseInvoice: any = null;
  ocrTotalAmount = signal<number>(0);
  isEditingOcrAmount = signal(false);
  editedOcrTotal = signal<number | null>(null);

  // ─── Estado SUNAT del comprobante escaneado (VD-70) ───────────────
  /** Resultado SUNAT del último escaneo/revalidación. Solo VALIDO_ACEPTADO habilita guardar. */
  sunatStatus = signal<string | null>(null);
  /** Objeto de validación SUNAT completo, para incrustarlo en el data al crear (VD-70 B). */
  private sunatValidationResult: any = null;
  /** Una factura solo puede guardarse si SUNAT la validó como aceptada. */
  sunatIsValid = computed(() => this.sunatStatus() === 'VALIDO_ACEPTADO');

  private readonly SUNAT_STATUS_MESSAGES: Record<string, string> = {
    VALIDO_ACEPTADO: 'Factura válida y emitida a la empresa.',
    VALIDO_NO_PERTENECE: 'El comprobante no fue emitido a esta empresa. Verifica el RUC emisor.',
    NO_ENCONTRADO: 'Comprobante no encontrado en SUNAT.',
    ERROR_SUNAT: 'Error en el servicio de SUNAT. Revisa los datos e intenta de nuevo.',
    SUNAT_CONFIG_NOT_FOUND: 'No se encontró configuración SUNAT para esta empresa.',
    PENDING: 'Pendiente de validación con SUNAT.',
  };

  /** Mensaje legible del estado SUNAT actual, para el panel post-OCR. */
  sunatStatusMessage = computed(() => {
    const s = this.sunatStatus();
    if (!s) return 'Pendiente de validación con SUNAT.';
    return this.SUNAT_STATUS_MESSAGES[s] ?? `Estado SUNAT: ${s}`;
  });

  private notifySunatStatus(status: string | null): void {
    const msg = status
      ? (this.SUNAT_STATUS_MESSAGES[status] ?? `Estado SUNAT: ${status}`)
      : 'Pendiente de validación con SUNAT.';
    this.notificationService.show(msg, status === 'VALIDO_ACEPTADO' ? 'success' : 'error');
  }

  /** Tipos de comprobante que SUNAT valida en el registro de gasto (VD-70). */
  readonly TIPOS_COMPROBANTE = ['Factura', 'Boleta'];

  /**
   * Normaliza el tipo de comprobante que devuelve el OCR (texto libre, p. ej.
   * "Boleta Electrónica") a uno de los valores canónicos del selector, para que
   * SUNAT reciba el codComp correcto.
   */
  private normalizeTipoComprobante(raw?: string): string {
    const t = (raw ?? '').trim().toLowerCase();
    if (t.includes('boleta')) return 'Boleta';
    return 'Factura';
  }

  /**
   * Deriva el tipo del prefijo de la serie (VD-70): en los comprobantes
   * electrónicos la serie empieza con F (Factura) o B (Boleta) — es más
   * confiable que el texto del OCR. Series numéricas (físicos) u otras letras
   * devuelven null (se conserva el tipo actual / OCR / elección manual).
   */
  private deriveTipoFromSerie(serie?: string): string | null {
    const s = (serie ?? '').trim().toUpperCase();
    if (s.startsWith('F')) return 'Factura';
    if (s.startsWith('B')) return 'Boleta';
    return null;
  }

  /** Reajusta el tipo cuando el usuario edita la serie en el panel post-OCR. */
  onSerieChange(): void {
    const derived = this.deriveTipoFromSerie(this.form.get('serie')?.value);
    if (derived) this.form.get('tipoComprobante')?.setValue(derived);
  }

  /** Tipo de comprobante elegido en el formulario, para la validación SUNAT. */
  private getSelectedTipoComprobante(): string {
    return this.form.get('tipoComprobante')?.value || 'Factura';
  }

  /**
   * VD-70: revalida la factura con SUNAT usando los datos (posiblemente editados)
   * del panel post-OCR, sin salir del formulario. Actualiza `sunatStatus` para
   * habilitar/bloquear el guardado.
   */
  revalidateSunat(): void {
    const formValue = this.form.value;
    if (!this.shouldValidateWithSunat(formValue)) {
      this.notificationService.show(
        'Completa RUC, serie, correlativo y fecha para validar con SUNAT.',
        'error'
      );
      return;
    }
    this.isSunatValidating.set(true);
    // VD-70 Parte B: el gasto aún no existe (se crea al confirmar), así que se
    // valida stateless con los datos del formulario.
    const validationData = {
      rucEmisor: formValue.rucEmisor,
      serie: formValue.serie,
      correlativo: formValue.correlativo,
      fechaEmision: this.formatDateForBackend(formValue.fechaEmision),
      montoTotal: this.postOcrBaseInvoice?.total || this.ocrTotalAmount() || 0,
      tipoComprobante: this.getSelectedTipoComprobante(),
    };
    this.invoiceService.validateSunatStateless(validationData).subscribe({
      next: (response: any) => {
        this.isSunatValidating.set(false);
        this.sunatValidationResult = response ?? null;
        this.sunatStatus.set(response?.status ?? null);
        this.notifySunatStatus(response?.status ?? null);
      },
      error: () => {
        this.isSunatValidating.set(false);
        this.sunatStatus.set('ERROR_SUNAT');
        this.notificationService.show(
          'Error al validar con SUNAT. Revisa los datos e intenta nuevamente.',
          'error'
        );
      },
    });
  }

  get ocrAmountWasEdited(): boolean {
    const edited = this.editedOcrTotal();
    return edited !== null && edited !== this.ocrTotalAmount();
  }

  startEditOcrAmount() {
    if (!this.isEditingOcrAmount()) {
      this.editedOcrTotal.set(this.ocrTotalAmount());
    }
    this.isEditingOcrAmount.set(true);
  }

  confirmEditOcrAmount() {
    this.isEditingOcrAmount.set(false);
  }

  // --- Edición de monto en modo edición de factura existente ---
  editingInvoiceAmount = signal(false);
  editedInvoiceTotal = signal<number | null>(null);

  get invoiceAmountWasEdited(): boolean {
    const edited = this.editedInvoiceTotal();
    if (edited === null) return false;
    return edited !== parseFloat(String(this.originalInvoice?.total ?? 0));
  }

  startEditInvoiceAmount() {
    if (!this.editingInvoiceAmount()) {
      this.editedInvoiceTotal.set(parseFloat(String(this.originalInvoice?.total ?? 0)));
    }
    this.editingInvoiceAmount.set(true);
  }

  confirmEditInvoiceAmount() {
    this.editingInvoiceAmount.set(false);
  }

  private notifyCategoryLimitWarning(response: { categoryLimitWarning?: string; categoryLimitPercent?: number } | null | undefined): void {
    if (!response?.categoryLimitWarning) return;
    const pct = typeof response.categoryLimitPercent === 'number'
      ? ` (${response.categoryLimitPercent.toFixed(2)}%)`
      : '';
    this.notificationService.show(`${response.categoryLimitWarning}${pct}`, 'warning');
  }

  /** Tras crear/actualizar gasto: vuelve según el contexto y rol. */
  private navigateAfterExpenseSave(): void {
    if (this.fromContabilidad) {
      this.router.navigate(['/rendiciones'], { queryParams: { tab: 'directas' } });
      return;
    }
    if (this.isDirectaMode) {
      // Auto-enviar a contabilidad después de guardar en modo directa
      this.expenseService.submitMyDirectExpenses().subscribe({
        next: () => { this.router.navigate(['/mis-rendiciones'], { queryParams: { tab: 'directas' } }); },
        error: () => { this.router.navigate(['/mis-rendiciones'], { queryParams: { tab: 'directas' } }); },
      });
    } else if (this.rendicionId) {
      this.router.navigate(['/mis-rendiciones', this.rendicionId, 'detalle']);
    } else {
      this.router.navigate(['/invoices']);
    }
  }

  private guardRendiciones() {
    if (this.id) return; // edición: siempre permitida
    if (!this.userStateService.isColaborador()) return;
    if (this.rendicionId) return;
    // Modo directa: colaborador con permiso puede subir sin rendición
    if (this.isDirectaMode && this.userStateService.canCreateRendicion()) return;

    const user = this.userStateService.getUser();
    const userId = user?._id;
    const clientId = user?.companyId;
    if (!userId || !clientId) return;

    this.expenseReportsService.findAllByUser(userId, clientId).subscribe({
      next: (reports) => {
        if (reports.length === 0) {
          this.notificationService.show(
            'Necesitas tener una rendición asignada para subir facturas.',
            'error'
          );
          this.router.navigate(['/invoices']);
        }
      },
    });
  }

  constructor() {
    this.initForm();
  }

  private looksLikeJson(value: string): boolean {
    const trimmed = (value || '').trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  private isPdfFile(file: File | null | undefined): boolean {
    if (!file) return false;
    const mimeType = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    return mimeType.includes('pdf') || name.endsWith('.pdf');
  }

  private formatDateForInput(dateValue: any): string {
    if (!dateValue) return '';

    let date: Date;

    if (typeof dateValue === 'string') {
      const dateStr = dateValue.trim();

      if (dateStr.match(/^\d{2}[-\/]\d{2}[-\/]\d{4}$/)) {
        const parts = dateStr.split(/[-\/]/);
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        date = new Date(year, month, day);
      } else if (dateStr.match(/^\d{4}[-\/]\d{2}[-\/]\d{2}$/)) {
        date = new Date(dateStr);
      } else {
        date = new Date(dateStr);
      }
    } else {
      date = new Date(dateValue);
    }

    if (isNaN(date.getTime())) {
      console.warn('Fecha inválida:', dateValue);
      return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private formatDateForBackend(dateValue: string): string {
    if (!dateValue) return '';

    if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parts = dateValue.split('-');
      const year = parts[0];
      const month = parts[1];
      const day = parts[2];
      return `${day}/${month}/${year}`;
    }

    if (dateValue.match(/^\d{2}[-\/]\d{2}[-\/]\d{4}$/)) {
      return dateValue.replace(/-/g, '/');
    }

    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      console.warn('Fecha inválida para backend:', dateValue);
      return dateValue;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${day}/${month}/${year}`;
  }

  ngOnInit() {
    this.companyConfigService.companyConfig$.subscribe(config => {
      this.mobilityDailyLimit = config?.limits?.movilidadDiario ?? null;
    });
    this.rendicionId = this.route.snapshot.queryParamMap.get('rendicionId');
    this.isDirectaMode = this.route.snapshot.queryParamMap.get('mode') === 'directa';
    this.fromContabilidad = this.route.snapshot.queryParamMap.get('from') === 'contabilidad' || this.userStateService.isContabilidad();
    this.guardRendiciones();
    this.loadCategories();
    this.loadProjects();
    this.loadOrdenesTrabajo();
    this.loadClientUsers();
    // Al cambiar de proyecto, la OT depende del centro de costo: si la elegida no pertenece al nuevo, se limpia.
    this.form.get('proyectId')?.valueChanges.subscribe((pid) => {
      const otId = this.form.get('ordenTrabajoId')?.value;
      if (
        otId &&
        !this.ordenesTrabajo.some(
          (ot) => ot._id === otId && otPerteneceACentroCosto(ot, pid ?? '')
        )
      ) {
        this.form.get('ordenTrabajoId')?.setValue('');
      }
    });
    this.route.queryParamMap.subscribe(params => {
      this.rendicionId = params.get('rendicionId');
      this.isDirectaMode = params.get('mode') === 'directa';
      this.fromContabilidad = params.get('from') === 'contabilidad' || this.userStateService.isContabilidad();
      const tipo = params.get('tipo') as ExpenseType | null;
      if (tipo) {
        this.setExpenseType(tipo);
      } else {
        this.syncTopValidators();
      }
      if (this.rendicionId) {
        this.loadRendicionProject();
      }
    });

    if (this.id) {
      this.form.get('file')?.clearValidators();
      this.form.get('file')?.updateValueAndValidity();

      this.invoiceService.getInvoiceById(this.id).subscribe({
        next: (res) => {
          this.originalInvoice = res;
          const type = ((res as any).expenseType as ExpenseType) || 'factura';
          this.expenseType.set(type);
          this.form.get('file')?.clearValidators();
          this.form.get('file')?.updateValueAndValidity();
          this.form.get('proyectId')?.disable();

          let dataObj: any = {};
          if (res.data) {
            try {
              dataObj =
                typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
            } catch {}
          }

          let fecha = '';
          if (dataObj.fechaEmision) {
            fecha = this.formatDateForInput(dataObj.fechaEmision);
          } else if (res.date) {
            fecha = this.formatDateForInput(res.date);
          } else if ((res as any).fechaEmision) {
            fecha = this.formatDateForInput((res as any).fechaEmision);
          }

          const baseValues: any = {
            proyectId: res.proyectId?._id || res.proyectId || '',
            ordenTrabajoId: (res as any).ordenTrabajoId?._id || (res as any).ordenTrabajoId || '',
            categoryId: res.categoryId?._id || res.categoryId || '',
            comentario: (res as any).comentario || dataObj.comentario || '',
          };

          if (type === 'factura') {
            this.fetchedRazonSocial.set(dataObj.razonSocial || null);
            this.editingInvoiceAmount.set(false);
            this.editedInvoiceTotal.set(null);
            this.form.patchValue({
              ...baseValues,
              fechaEmision: fecha,
              rucEmisor: dataObj.rucEmisor || '',
              serie: dataObj.serie || '',
              correlativo: dataObj.correlativo || '',
              placaVehiculo: (res as any).placaVehiculo || dataObj.placaVehiculo || '',
            });
          } else if (type === 'otros_gastos') {
            let description = '';
            if (typeof res.data === 'string' && !this.looksLikeJson(res.data)) {
              description = res.data;
            } else if (dataObj?.payload !== undefined) {
              if (typeof dataObj.payload === 'string') {
                try {
                  const parsed = JSON.parse(dataObj.payload);
                  description = parsed?.description || parsed?.descripcion || dataObj.payload;
                } catch {
                  description = dataObj.payload;
                }
              } else if (dataObj.payload && typeof dataObj.payload === 'object') {
                description = dataObj.payload.description || dataObj.payload.descripcion || '';
              }
            } else {
              description = dataObj.description || dataObj.descripcion || '';
            }
            if (!description && typeof (res as any).description === 'string') {
              description = (res as any).description;
            }
            const persistedSubTipo = (res as any).subTipo || dataObj.subTipo;
            if (persistedSubTipo) {
              this.otrosSubTipo.set(persistedSubTipo);
            }
            if (dataObj.rucEmisor) {
              this.fetchedRazonSocial.set(dataObj.razonSocialEmisor || null);
            }
            this.form.patchValue({
              ...baseValues,
              description,
              totalOtros: res.total ?? 0,
              declaracionJurada: true,
              rucEmisor: dataObj.rucEmisor || '',
              serie: dataObj.serie || '',
              correlativo: dataObj.correlativo || '',
              // VD-109: comida declarada en AL.
              tipoComida: (res as any).tipoComida || dataObj.tipoComida || '',
            });
          } else if (type === 'recibo_caja') {
            this.form.patchValue({
              ...baseValues,
              receiptRazonSocial: dataObj.razonSocial || '',
              receiptRuc: dataObj.ruc || '',
              receiptNumeroDocumento: dataObj.numeroDocumento || '',
              receiptConcepto: dataObj.concepto || '',
              receiptFecha: fecha,
              receiptMonto: res.total ?? 0,
            });
          } else if (type === 'planilla_movilidad') {
            this.form.patchValue(baseValues);
            const rows: any[] = (res as any).mobilityRows || dataObj.rows || [];
            this.mobilityRowsArray.clear();
            for (const row of rows) {
              const rowRequired = this.isDirectaContext() ? [Validators.required] : [];
              const group = this.fb.group({
                fecha: [row.fecha || '', Validators.required],
                total: [row.total ?? null, [Validators.required, Validators.min(0)]],
                proyectId: [row.proyectId || '', rowRequired],
                categoryId: [row.categoryId || '', rowRequired],
                colaboradorEsTercero: [!!(row.colaboradorId && String(row.colaboradorId) !== this.currentUserId)],
                colaboradorId: [row.colaboradorId && String(row.colaboradorId) !== this.currentUserId ? String(row.colaboradorId) : ''],
                origen: [row.origen || '', Validators.required],
                origenLat: [row.origenCoords?.lat ?? null],
                origenLng: [row.origenCoords?.lng ?? null],
                origenDepartamento: [row.origenDepartamento || ''],
                origenProvincia: [row.origenProvincia || ''],
                origenDistrito: [row.origenDistrito || ''],
                destino: [row.destino || '', Validators.required],
                destinoLat: [row.destinoCoords?.lat ?? null],
                destinoLng: [row.destinoCoords?.lng ?? null],
                destinoDepartamento: [row.destinoDepartamento || ''],
                destinoProvincia: [row.destinoProvincia || ''],
                destinoDistrito: [row.destinoDistrito || ''],
                distanciaKm: [row.distanciaKm ?? null],
                gestion: [row.gestion || '', Validators.required],
              });
              this.mobilityRowsArray.push(group);
            }
          }
        },
        error: (error) => {
          console.error('Error al cargar la factura:', error);
          this.notificationService.show(
            'Error al cargar la factura: ' +
              (error.message || 'Intente nuevamente'),
            'error'
          );
        },
      });
    } else {
      this.form.get('file')?.setValidators([Validators.required]);
      this.form.get('file')?.updateValueAndValidity();
    }
  }

  loadRendicionProject() {
    if (!this.rendicionId) return;
    this.expenseReportsService.findOne(this.rendicionId).subscribe({
      next: (report) => {
        const isDirecta = !!(report as any)?.isDirecta;
        this.isDirectaReport.set(isDirecta);
        if (report && report.projectId) {
          const pId = typeof report.projectId === 'string' ? report.projectId : (report.projectId as any)._id;
          this.form.patchValue({ proyectId: pId });
          // El centro de costo lo fija la rendición (normal o directa): no se elige por comprobante.
          this.form.get('proyectId')?.disable();
        }
        // Rendición directa: la OT (planilla de movilidad) se fija al crear la
        // rendición y la heredan todos sus comprobantes; no se elige por comprobante.
        // Rendiciones directas creadas antes de esta funcionalidad no tienen OT propia:
        // en ese caso se sigue pidiendo por comprobante (ver directaOrdenTrabajoInherited).
        const otRef = (report as any)?.directaOrdenTrabajoId;
        if (isDirecta && otRef) {
          const otId = typeof otRef === 'string' ? otRef : otRef._id;
          this.form.patchValue({ ordenTrabajoId: otId });
          this.form.get('ordenTrabajoId')?.disable();
          this.directaOrdenTrabajoInherited.set(true);
          this.setInheritedOrdenTrabajo(otRef);
        }
        // Viático: la OT se hereda de la solicitud del viático y la toman sus
        // comprobantes de planilla de movilidad; no se elige por comprobante (VD-28).
        // La solicitud no la exige, así que puede no haber ninguna que heredar:
        // en ese caso el campo ni se muestra (ver viaticoSinOrdenTrabajo).
        this.isViaticoReport.set(!isDirecta && (report as any)?.type === 'viatico');
        const viaticoOtRef = (report as any)?.viaticoOrdenTrabajoId;
        if (this.isViaticoReport() && viaticoOtRef) {
          const otId = typeof viaticoOtRef === 'string' ? viaticoOtRef : viaticoOtRef._id;
          this.form.patchValue({ ordenTrabajoId: otId });
          this.form.get('ordenTrabajoId')?.disable();
          this.viaticoOrdenTrabajoInherited.set(true);
          this.setInheritedOrdenTrabajo(viaticoOtRef);
        }
        // El flag directa puede llegar después de que el usuario ya agregó filas:
        // re-sincroniza validadores del proyecto (superior y por fila).
        this.syncMobilityRowValidators();
        // La rendición puede tener comprobantes en otra moneda: sumar `total` a
        // secas mezclaría soles con dólares en el mismo número.
        this.rendicionMoneda.set((report as any)?.viaticoMoneda || DEFAULT_MONEDA);
        const expenses = Array.isArray(report?.expenseIds) ? report.expenseIds : [];
        const spent = expenses.reduce(
          (sum: number, exp: any) => sum + expenseAmountInReport(exp),
          0,
        );
        this.rendicionSpent.set(Math.round(spent * 100) / 100);
        const settlement = (report as any)?.settlement;
        if (settlement && settlement.difference !== undefined && settlement.difference !== null) {
          this.rendicionSettlementDiff.set(Number(settlement.difference) || 0);
        } else {
          this.rendicionSettlementDiff.set(null);
        }
        this.loadRendicionAdvances();
      },
      error: (err) => console.error('Error loading report project', err)
    });
  }

  private loadRendicionAdvances() {
    if (!this.rendicionId) return;
    this.advanceService.findMy().subscribe({
      next: (advances) => {
        const totalAnticipado = advances
          .filter((a) => {
            const rid = typeof a.expenseReportId === 'object'
              ? (a.expenseReportId as any)?._id
              : a.expenseReportId;
            return rid === this.rendicionId
              && ['approved', 'partially_paid', 'paid', 'settled'].includes(a.status);
          })
          // Presupuesto = lo realmente pagado (paidAmount); 'approved' sin pago aporta 0.
          .reduce((sum, a) => sum + (a.status === 'approved' ? 0 : Number(a.paidAmount ?? a.amount) || 0), 0);
        this.rendicionBudget.set(totalAnticipado);
      },
      error: (err) => console.error('Error loading advances', err),
    });
  }

  loadCategories() {
    this.invoiceService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
        this.categoriesLoaded.set(true);
        this.applyMovilidadCategoryDefault();
        this.applyAlimentacionCategoryDefault();
        this.autoSelectDjCategories();
      },
      error: (error) => {},
    });
  }

  loadProjects() {
    this.invoiceService.getProjects().subscribe({
      next: (projects) => {
        this.proyects = projects;
      },
    });
  }

  loadOrdenesTrabajo() {
    this.ordenTrabajoService.getAll().subscribe({
      next: (list) => {
        this.ordenesTrabajo = (list || []).filter((o) => o.isActive !== false);
      },
      error: () => {
        this.ordenesTrabajo = [];
      },
    });
  }

  loadClientUsers() {
    this.invoiceService.getClientUsers().subscribe({
      next: (users) => {
        this.workers = (users ?? []).map((u) => ({
          _id: String(u._id),
          name: u.name,
          email: u.email,
          dni: u.dni,
        }));
      },
      error: () => {},
    });
  }

  /** Usuario actual (quien rinde): id por defecto de cada fila. */
  get currentUserId(): string {
    return String(this.userStateService.getUser()?._id || '');
  }

  /** Nombre del usuario actual (quien rinde): se muestra por defecto en cada fila. */
  get currentUserName(): string {
    const u = this.userStateService.getUser();
    return (u?.name || u?.email || '').trim();
  }

  /** Resuelve id + nombre del colaborador de una fila a partir de sus valores de formulario. */
  private resolveRowColaborador(r: any): { colaboradorId: string; colaboradorNombre: string } {
    if (r?.colaboradorEsTercero && r?.colaboradorId) {
      const w = this.workers.find((x) => x._id === String(r.colaboradorId));
      return {
        colaboradorId: String(r.colaboradorId),
        colaboradorNombre: w?.name?.trim() || w?.email || '',
      };
    }
    return { colaboradorId: this.currentUserId, colaboradorNombre: this.currentUserName };
  }

  /** True si alguna fila está marcada como tercero pero sin trabajador seleccionado. */
  private hasMobilityTerceroSinColaborador(): boolean {
    return this.mobilityRowsArray.controls.some(
      (c) => !!c.get('colaboradorEsTercero')?.value && !c.get('colaboradorId')?.value
    );
  }

  /** Error inline del colaborador en una fila (tercero marcado, sin selección, tocado). */
  isRowColaboradorInvalid(index: number): boolean {
    const row = this.mobilityRowsArray.at(index);
    if (!row) return false;
    const esTercero = !!row.get('colaboradorEsTercero')?.value;
    const ctrl = row.get('colaboradorId');
    return esTercero && !ctrl?.value && !!ctrl?.touched;
  }

  /** Al alternar el check de tercero: limpia la selección si se desmarca. */
  onColaboradorTerceroToggle(index: number): void {
    const row = this.mobilityRowsArray.at(index);
    if (!row) return;
    const esTercero = !!row.get('colaboradorEsTercero')?.value;
    const projCtrl = row.get('colaboradorId');
    if (!esTercero) {
      projCtrl?.setValue('');
    }
    projCtrl?.updateValueAndValidity({ emitEvent: false });
  }

  /** Categorías visibles en el selector superior: siempre todas las activas del cliente. */
  get filteredCategories(): ICategory[] {
    return this.categories;
  }

  /**
   * Mapea categorías a opciones de `app-search-select`. La cuenta contable va
   * como segunda línea: con 53 categorías (91x Servicios/Admin y 92x " COM")
   * hay nombres que solo se distinguen por ella. También entra en la búsqueda,
   * así que se puede escribir el código de cuenta en vez del nombre.
   */
  private toCategoryOptions(list: ICategory[]): SearchSelectOption[] {
    return list.map((c) => ({
      value: c._id ?? '',
      label: c.name,
      subLabel: c.cuenta || '',
      searchText: c.description || '',
    }));
  }

  get categoryOptions(): SearchSelectOption[] {
    return this.toCategoryOptions(this.filteredCategories);
  }

  get movilidadCategoryOptions(): SearchSelectOption[] {
    return this.toCategoryOptions(this.movilidadCategories);
  }

  djCategoryOptionsFor(rubro: 'alimentacion' | 'movilidad'): SearchSelectOption[] {
    return this.toCategoryOptions(this.djCategoriesFor(rubro));
  }

  /** Categorías asignadas al colaborador cuyo nombre contiene "planilla de movilidad" (sin distinguir mayúsculas/minúsculas). */
  get movilidadCategories(): ICategory[] {
    return this.categories.filter((c) => (c.name || '').toLowerCase().includes('planilla de movilidad'));
  }

  /**
   * Se muestra el selector solo cuando hay más de una categoría de planilla de
   * movilidad asignada. Aplica también a la rendición directa: aunque ahí el
   * centro de costo y la OT se heredan de la rendición, la categoría no se
   * puede deducir cuando el colaborador tiene dos (Servicios 91x y Comercial
   * 92x llevan cuentas contables distintas), y antes el guardado moría con un
   * "no tienes ninguna asignada" que decía justo lo contrario de lo que pasaba.
   */
  get showMovilidadCategorySelect(): boolean {
    return (
      this.expenseType() === 'planilla_movilidad' &&
      this.movilidadCategories.length > 1
    );
  }

  /**
   * En planilla directa el bloque superior (centro de costo / OT / categoría)
   * está oculto porque todo se hereda de la rendición. La categoría es la
   * excepción: si hay que elegirla, o si no hay ninguna asignada, el bloque
   * tiene que aparecer igual para mostrar el selector o el aviso.
   *
   * Solo aplica a planilla de movilidad: sin ese filtro, el aviso "no tienes
   * categoría de Planilla de movilidad" se colaba en Otros Gastos y en la DJ al
   * extranjero, que no usan esas categorías.
   */
  get showMovilidadCategoryBlock(): boolean {
    return (
      this.expenseType() === 'planilla_movilidad' &&
      (this.showMovilidadCategorySelect ||
        (this.categoriesLoaded() && this.movilidadCategories.length === 0))
    );
  }

  /**
   * La categoría se elige en el bloque superior salvo en planilla de movilidad
   * (se resuelve por nombre entre las asignadas) y en Otros Gastos, donde vive
   * dentro del tipo de documento, debajo del RUC (VD-100).
   */
  get showTopCategorySelect(): boolean {
    return (
      this.expenseType() !== 'planilla_movilidad' &&
      this.expenseType() !== 'otros_gastos'
    );
  }

  /**
   * El bloque superior solo se pinta si le queda algo dentro. En rendición
   * directa el centro de costo se hereda, así que con la categoría de Otros
   * Gastos movida a su propio bloque el contenedor quedaría vacío.
   */
  get showTopBlock(): boolean {
    if (!this.isDirectaContext()) return true;
    return this.showTopCategorySelect || this.showMovilidadCategoryBlock;
  }

  /**
   * Categorías de "Gastos Reparables (gastos sin factura)" asignadas al
   * colaborador: las que corresponden a Alimentación sin documentación
   * (VD-108). En Detroit son dos, la de Servicios y la Comercial (" COM").
   */
  get gastosReparablesCategories(): ICategory[] {
    return this.categories.filter((c) =>
      this.normalizeStr(c.name || '').includes('gastos reparables')
    );
  }

  /**
   * Categoría puesta automáticamente en el gasto AL. `null` cuando hay 0 o 2+
   * coincidencias: ahí se muestra el selector manual.
   */
  gastosReparablesCategoryAuto = signal<ICategory | null>(null);

  /**
   * AL = Alimentación sin documentación. Solo al crear: al editar se respeta la
   * categoría con la que se guardó el gasto.
   */
  isAlimentacionSinDoc(): boolean {
    return (
      !this.id &&
      this.expenseType() === 'otros_gastos' &&
      this.otrosSubTipo() === 'AL'
    );
  }

  /**
   * Comidas de "Alimentación sin documentación" (VD-109) con el tope que la
   * empresa configuró para cada una. Sin tope configurado, `tope` es null.
   */
  get comidasDisponibles(): { key: 'desayuno' | 'almuerzo' | 'cena'; label: string; tope: number | null }[] {
    const limits = this.companyConfigService.getCompanyConfig()?.limits;
    const tope = (v: number | null | undefined) => (typeof v === 'number' && v > 0 ? v : null);
    return [
      { key: 'desayuno', label: 'Desayuno', tope: tope(limits?.alimentacionDesayuno) },
      { key: 'almuerzo', label: 'Almuerzo', tope: tope(limits?.alimentacionAlmuerzo) },
      { key: 'cena', label: 'Cena', tope: tope(limits?.alimentacionCena) },
    ];
  }

  /** Tope de la comida elegida, o null si no hay comida o no tiene tope. */
  get topeComidaSeleccionada(): number | null {
    const key = this.form?.get('tipoComida')?.value;
    return this.comidasDisponibles.find((c) => c.key === key)?.tope ?? null;
  }

  /** El monto cargado pasa del tope de la comida elegida (VD-109). */
  get montoSuperaTopeComida(): boolean {
    const tope = this.topeComidaSeleccionada;
    if (tope === null) return false;
    const total = Number(this.form?.get('totalOtros')?.value) || 0;
    return total > tope;
  }

  /** Opciones del selector de categoría dentro de Otros Gastos. */
  get otrosCategoryOptions(): SearchSelectOption[] {
    // Con las dos de Gastos Reparables (Servicios 91x y Comercial 92x) se
    // acotan a esas; si el colaborador no tiene ninguna se cae al listado
    // completo para no dejarlo sin poder registrar el gasto.
    if (this.isAlimentacionSinDoc() && this.gastosReparablesCategories.length > 1) {
      return this.toCategoryOptions(this.gastosReparablesCategories);
    }
    return this.categoryOptions;
  }

  /**
   * "Alimentación sin documentación" no pide categoría: se le asigna la de
   * "Gastos Reparables (gastos sin factura)" del colaborador (VD-108), igual
   * que la planilla de movilidad resuelve la suya (VD-100). Con 0 o 2+
   * coincidencias queda el selector manual. Idempotente: se llama al cargar
   * categorías y al cambiar de sub-tipo.
   */
  private applyAlimentacionCategoryDefault(): void {
    const catCtrl = this.form?.get('categoryId');
    if (!catCtrl || catCtrl.disabled) return;
    const previous = this.gastosReparablesCategoryAuto();
    // Al salir de AL se retira la categoría que pusimos nosotros, para que el
    // nuevo tipo de documento no la herede sin que se note.
    const dropAuto = () => {
      if (previous && catCtrl.value === previous._id) catCtrl.setValue('');
    };
    if (!this.isAlimentacionSinDoc()) {
      dropAuto();
      this.gastosReparablesCategoryAuto.set(null);
      return;
    }
    const matches = this.gastosReparablesCategories;
    const auto = matches.length === 1 ? matches[0] : null;
    this.gastosReparablesCategoryAuto.set(auto);
    if (auto) catCtrl.setValue(auto._id);
    else dropAuto();
  }

  /**
   * Si el colaborador tiene una única categoría "Planilla de movilidad" asignada, se
   * asigna internamente sin mostrar selector. Si tiene más de una, queda pendiente de
   * elección (selector requerido). Si no tiene ninguna, no se completa (bloquea el guardado).
   */
  private applyMovilidadCategoryDefault(): void {
    if (this.expenseType() !== 'planilla_movilidad') return;
    const catCtrl = this.form.get('categoryId');
    if (!catCtrl || catCtrl.disabled) return;
    const matches = this.movilidadCategories;
    if (matches.length === 1) {
      catCtrl.setValue(matches[0]._id);
    }
    catCtrl.setValidators(matches.length > 0 ? [Validators.required] : []);
    catCtrl.updateValueAndValidity({ emitEvent: false });
  }

  /** Categorías visibles para una fila de la planilla (Rendiciones Directas). */
  getRowCategories(index: number): ICategory[] {
    return this.categories;
  }

  lookupRazonSocial(ruc: string) {
    if (!ruc || ruc.replace(/\D/g, '').length !== 11) return;
    this.rucLookupLoading.set(true);
    this.fetchedRazonSocial.set(null);
    this.rucNotFound.set(false);
    this.invoiceService.getRucInfo(ruc).subscribe({
      next: (res) => {
        this.fetchedRazonSocial.set(res.razonSocial);
        this.rucNotFound.set(!res.razonSocial);
        this.rucLookupLoading.set(false);
      },
      error: () => {
        this.rucNotFound.set(true);
        this.rucLookupLoading.set(false);
      },
    });
  }

  initForm() {
    this.form = this.fb.group({
      proyectId: ['', Validators.required],
      ordenTrabajoId: [''],
      categoryId: ['', Validators.required],
      file: [''],
      fechaEmision: [''],
      rucEmisor: [''],
      serie: [''],
      correlativo: [''],
      // Tipo de comprobante para la validación SUNAT (VD-70). El OCR puede
      // detectarlo mal; se muestra editable en el panel post-OCR.
      tipoComprobante: ['Factura'],
      comentario: [''],
      placaVehiculo: [''],
      // Otros gastos
      totalOtros: [null],
      description: [''],
      // VD-109: en AL reemplaza a la descripción libre.
      tipoComida: [''],
      declaracionJurada: [false],
      declaracionJuradaFirmante: [''],
      // Declaración Jurada al extranjero (DJE): datos del viaje + filas por rubro
      djDestino: [''],
      djPais: [''],
      djLugarFirma: [''],
      djMoneda: ['US$'],
      djAlimentacionCategoryId: [''],
      djMovilidadCategoryId: [''],
      djAlimentacionRows: this.fb.array([]),
      djMovilidadRows: this.fb.array([]),
      // Recibo de caja
      receiptRazonSocial: [''],
      receiptRuc: [''],
      receiptNumeroDocumento: [''],
      receiptConcepto: [''],
      receiptFecha: [''],
      receiptMonto: [null],
      // Planilla de movilidad
      mobilityRows: this.fb.array([]),
    });
  }

  get mobilityRowsArray(): FormArray {
    return this.form.get('mobilityRows') as FormArray;
  }

  // ─── Declaración Jurada al extranjero (DJE) ───────────────────────
  /** Gastos creados por la última DJ guardada; habilita la descarga del PDF. */
  savedDeclaracionJurada = signal<IDeclaracionJuradaResponse | null>(null);

  /**
   * Categoría detectada para cada rubro entre las asignadas al colaborador. Si
   * hay exactamente una coincidencia se usa esa y el selector no se muestra;
   * con 0 o 2+ (p. ej. Servicios 91x y Comercial 92x) se deja elegir a mano.
   */
  djAlimentacionAuto = signal<ICategory | null>(null);
  djMovilidadAuto = signal<ICategory | null>(null);

  /**
   * Categorías del colaborador cuyo nombre corresponde al rubro. Se compara sin
   * tildes: en Detroit la categoría está registrada como "Alimentacion".
   */
  djCategoriesFor(rubro: 'alimentacion' | 'movilidad'): ICategory[] {
    const needle = rubro === 'alimentacion' ? 'alimentacion' : 'movilidad';
    return this.categories.filter((c) => {
      const name = this.normalizeStr(c.name || '');
      // "Gastos Reparables (gastos sin factura)" nombra la alimentación dentro
      // de su propio texto, así que caía en este filtro y ensuciaba el rubro.
      // Esa categoría es solo para Alimentación sin documentación (VD-108).
      if (name.includes('gastos reparables')) return false;
      return name.includes(needle);
    });
  }

  /**
   * Autoselecciona las categorías de Alimentación y Movilidad por nombre. Es
   * idempotente: se puede invocar tras cargar categorías o al cambiar de
   * sub-tipo. Si el rubro no tiene una única coincidencia, limpia el control
   * para que aparezca el selector manual de respaldo.
   */
  private autoSelectDjCategories(): void {
    if (!this.isDj()) return;
    const uniquePick = (rubro: 'alimentacion' | 'movilidad'): ICategory | null => {
      const matches = this.djCategoriesFor(rubro);
      return matches.length === 1 ? matches[0] : null;
    };
    const alimentacion = uniquePick('alimentacion');
    const movilidad = uniquePick('movilidad');

    this.djAlimentacionAuto.set(alimentacion);
    this.djMovilidadAuto.set(movilidad);

    const aliCtrl = this.form.get('djAlimentacionCategoryId');
    const aliValue = alimentacion?._id ?? '';
    if (aliCtrl && alimentacion) aliCtrl.setValue(aliValue);

    const movCtrl = this.form.get('djMovilidadCategoryId');
    const movValue = movilidad?._id ?? '';
    if (movCtrl && movilidad) movCtrl.setValue(movValue);
  }

  /** Cambia el sub-tipo de "Otros gastos" y reevalúa lo que depende de él. */
  selectOtrosSubTipo(code: string): void {
    this.otrosSubTipo.set(code);
    this.autoSelectDjCategories();
    // syncTopValidators reasigna la categoría de "Alimentación sin documentación".
    this.syncTopValidators();
  }

  /**
   * DJE: la categoría no se elige en el selector superior (cada rubro tiene la
   * suya), por lo que ese selector se oculta y deja de ser obligatorio.
   * Solo aplica al crear: al editar, cada gasto ya es de un rubro concreto y se
   * muestra como cualquier otro gasto (categoría + monto).
   */
  isDj(): boolean {
    return (
      !this.id &&
      this.expenseType() === 'otros_gastos' &&
      this.otrosSubTipo() === 'DJE'
    );
  }

  get djAlimentacionRowsArray(): FormArray {
    return this.form.get('djAlimentacionRows') as FormArray;
  }

  get djMovilidadRowsArray(): FormArray {
    return this.form.get('djMovilidadRows') as FormArray;
  }

  private djRowsArray(rubro: 'alimentacion' | 'movilidad'): FormArray {
    return rubro === 'alimentacion' ? this.djAlimentacionRowsArray : this.djMovilidadRowsArray;
  }

  addDjRow(rubro: 'alimentacion' | 'movilidad'): void {
    this.djRowsArray(rubro).push(
      this.fb.group({
        fecha: ['', Validators.required],
        monto: [null, [Validators.required, Validators.min(0.01)]],
      })
    );
  }

  removeDjRow(rubro: 'alimentacion' | 'movilidad', index: number): void {
    this.djRowsArray(rubro).removeAt(index);
  }

  getDjRowsTotal(rubro: 'alimentacion' | 'movilidad'): number {
    return this.djRowsArray(rubro).controls.reduce(
      (sum, ctrl) => sum + (Number(ctrl.get('monto')?.value) || 0),
      0
    );
  }

  get djTotal(): number {
    return this.getDjRowsTotal('alimentacion') + this.getDjRowsTotal('movilidad');
  }

  /** Categoría a usar en un rubro: la detectada o la elegida a mano. */
  private djCategoryIdFor(rubro: 'alimentacion' | 'movilidad'): string {
    const ctrl = rubro === 'alimentacion' ? 'djAlimentacionCategoryId' : 'djMovilidadCategoryId';
    return String(this.form.get(ctrl)?.value || '').trim();
  }

  /** Un rubro está completo si no tiene filas, o si las tiene con categoría y filas válidas. */
  private isDjSeccionValid(rubro: 'alimentacion' | 'movilidad'): boolean {
    const rows = this.djRowsArray(rubro);
    if (rows.length === 0) return true;
    return rows.valid && !!this.djCategoryIdFor(rubro);
  }

  setExpenseType(type: ExpenseType) {
    this.expenseType.set(type);
    // Limpiar archivo al cambiar de tipo para evitar adjuntos cruzados
    this.selectedFile = undefined as any;
    this.previewImage = null;
    this.previewObjectUrl = null;
    if (type === 'factura') {
      this.form.get('file')?.setValidators([Validators.required]);
    } else {
      this.form.get('file')?.clearValidators();
    }
    this.form.get('file')?.updateValueAndValidity();
    this.syncTopValidators();
  }

  /**
   * En Rendiciones Directas la planilla de movilidad lleva el proyecto en cada fila
   * (no a nivel de gasto), por lo que el selector de proyecto superior se oculta y
   * deja de ser obligatorio. En el resto de casos sí es requerido.
   */
  /** Contexto directa: por query param (`mode=directa`) o por el flag de la rendición asociada. */
  isDirectaContext(): boolean {
    return this.isDirectaMode || this.isDirectaReport();
  }

  isDirectaPlanilla(): boolean {
    return this.isDirectaContext() && this.expenseType() === 'planilla_movilidad';
  }

  /**
   * Rendiciones directas creadas antes de tener OT propia: no hay OT que heredar,
   * así que se sigue pidiendo en el formulario del comprobante (fallback legado).
   */
  needsFallbackOt(): boolean {
    return this.isDirectaPlanilla() && !this.directaOrdenTrabajoInherited();
  }

  /**
   * Viático cuya solicitud no llevó OT. La OT es opcional al solicitar el viático
   * y la planilla de movilidad la hereda de ahí (VD-28): si la solicitud no la
   * tiene, no hay nada que heredar ni que el colaborador pueda elegir, así que el
   * campo no se muestra ni se exige.
   */
  viaticoSinOrdenTrabajo(): boolean {
    return this.isViaticoReport() && !this.viaticoOrdenTrabajoInherited();
  }

  /** Guarda la OT heredada (id + nombre) desde la referencia populada del reporte. */
  private setInheritedOrdenTrabajo(ref: any): void {
    const _id = typeof ref === 'string' ? ref : String(ref?._id ?? '');
    if (!_id) return;
    const nombre =
      typeof ref === 'object' && ref?.nombre
        ? String(ref.nombre)
        : this.ordenesTrabajo.find((ot) => ot._id === _id)?.nombre ?? '';
    this.inheritedOrdenTrabajo.set({ _id, nombre });
  }

  /**
   * Sincroniza los validadores del selector superior. En planilla directa el proyecto
   * y la categoría viven en cada fila, por lo que ambos selectores superiores se ocultan
   * y dejan de ser obligatorios; en el resto de casos son requeridos.
   */
  private syncTopValidators(): void {
    // Proyecto: opcional solo en planilla directa (el centro de costo vive en la
    // rendición). Requerido en el resto de casos.
    const projCtrl = this.form.get('proyectId');
    if (projCtrl && !projCtrl.disabled) {
      projCtrl.setValidators(this.isDirectaPlanilla() ? [] : [Validators.required]);
      projCtrl.updateValueAndValidity({ emitEvent: false });
    }
    // Categoría: en planilla de movilidad —directa incluida— se resuelve entre
    // las categorías "Planilla de movilidad" asignadas al colaborador (ver
    // applyMovilidadCategoryDefault). En la DJ al extranjero cada rubro lleva la
    // suya. Requerida en el resto de tipos de gasto.
    const catCtrl = this.form.get('categoryId');
    if (catCtrl && !catCtrl.disabled) {
      if (this.expenseType() === 'planilla_movilidad') {
        this.applyMovilidadCategoryDefault();
      } else if (this.isDj()) {
        catCtrl.setValidators([]);
        catCtrl.updateValueAndValidity({ emitEvent: false });
      } else {
        catCtrl.setValidators([Validators.required]);
        catCtrl.updateValueAndValidity({ emitEvent: false });
      }
    }
    // Otros Gastos: AL trae su categoría puesta y el resto de sub-tipos la
    // sueltan al salir de AL (VD-100).
    this.applyAlimentacionCategoryDefault();
  }

  /**
   * Sincroniza validadores de categoría por fila según el contexto directa, y
   * mantiene el `proyectId` de cada fila igual al de la rendición (el centro
   * de costo ya no se elige por comprobante ni por fila).
   */
  private syncMobilityRowValidators(): void {
    this.syncTopValidators();
    const topProjectId = this.form.get('proyectId')?.value || '';
    for (const ctrl of this.mobilityRowsArray.controls) {
      // La categoría ya no se pide por fila en la planilla de movilidad (VD-28).
      const categoryCtrl = ctrl.get('categoryId');
      if (categoryCtrl) {
        categoryCtrl.setValidators([]);
        categoryCtrl.updateValueAndValidity({ emitEvent: false });
      }
      const proyectCtrl = ctrl.get('proyectId');
      if (proyectCtrl && !proyectCtrl.value && topProjectId) {
        proyectCtrl.setValue(topProjectId, { emitEvent: false });
      }
    }
  }

  addMobilityRow() {
    const topProjectId = this.form.get('proyectId')?.value || '';
    const group = this.fb.group({
      fecha: ['', Validators.required],
      total: [null, [Validators.required, Validators.min(0)]],
      proyectId: [topProjectId],
      // Categoría y tercero ya no se piden en la planilla de movilidad (VD-28);
      // se conservan los controles en su valor por defecto por compatibilidad.
      categoryId: [''],
      colaboradorEsTercero: [false],
      colaboradorId: [''],
      origen: ['', Validators.required],
      origenLat: [null],
      origenLng: [null],
      origenDepartamento: [''],
      origenProvincia: [''],
      origenDistrito: [''],
      destino: ['', Validators.required],
      destinoLat: [null],
      destinoLng: [null],
      destinoDepartamento: [''],
      destinoProvincia: [''],
      destinoDistrito: [''],
      distanciaKm: [null],
      gestion: ['', Validators.required],
    });
    // VD-71: la fila nueva va al inicio. La numeración visible ("Fila N") es
    // posicional (sale del $index), por lo que la nueva queda como "Fila 1".
    this.mobilityRowsArray.insert(0, group);
  }

  onOrigenSelected(result: PlaceResult, index: number) {
    const { dep, prov, dist } = this.resolveLocation(result);
    const row = this.mobilityRowsArray.at(index);
    // Patch dep first; options for prov/dist depend on dep being set
    row.patchValue({
      origen: result.address,
      origenLat: result.lat,
      origenLng: result.lng,
      origenDepartamento: dep,
      origenProvincia: '',
      origenDistrito: '',
    });
    if (dep && prov) {
      // Defer until Angular renders province options for the new dep
      setTimeout(() => {
        row.patchValue({ origenProvincia: prov, origenDistrito: '' });
        if (dist) {
          // Defer until Angular renders district options for the new prov
          setTimeout(() => {
            row.patchValue({ origenDistrito: dist });
          });
        }
      });
    }
    this.calculateDistance(index);
  }

  onDestinoSelected(result: PlaceResult, index: number) {
    const { dep, prov, dist } = this.resolveLocation(result);
    const row = this.mobilityRowsArray.at(index);
    row.patchValue({
      destino: result.address,
      destinoLat: result.lat,
      destinoLng: result.lng,
      destinoDepartamento: dep,
      destinoProvincia: '',
      destinoDistrito: '',
    });
    if (dep && prov) {
      setTimeout(() => {
        row.patchValue({ destinoProvincia: prov, destinoDistrito: '' });
        if (dist) {
          setTimeout(() => {
            row.patchValue({ destinoDistrito: dist });
          });
        }
      });
    }
    this.calculateDistance(index);
  }

  private resolveLocation(result: PlaceResult): { dep: string; prov: string; dist: string } {
    let dep = this.matchDepartamento(result.departamento);

    // formattedAddress fallback: when addressComponents lack administrative_area_level_1
    // (common for POIs/establishments in Google's new Places API)
    if (!dep && result.formattedAddress) {
      const parts = result.formattedAddress
        .split(',')
        .map(p => p.trim().replace(/\s+\d{4,6}$/, '').trim())
        .filter(p => p && p !== 'Perú' && p !== 'Peru');
      // Scan from end to start — broader geo info appears at the end in Peru
      for (let j = parts.length - 1; j >= 0; j--) {
        dep = this.matchDepartamento(parts[j]);
        if (dep) break;
      }
    }

    if (!dep) return { dep: '', prov: '', dist: '' };

    let prov = this.matchProvincia(dep, result.provincia);
    let dist = '';

    if (prov && result.distrito) {
      dist = this.matchDistrito(dep, prov, result.distrito);
    }

    if (result.distrito && (!prov || !dist)) {
      const match = this.findDistritoInDepartamento(dep, result.distrito);
      if (match) {
        prov = match.prov;
        dist = match.dist;
      }
    }

    if (!prov) {
      const depData = findDepartamento(dep);
      if (depData && depData.provincias.length === 1) {
        prov = depData.provincias[0].label;
      } else if (result.provincia) {
        prov = this.matchProvincia(dep, result.provincia);
      } else {
        const provMatch = depData?.provincias.find(p =>
          this.normalizeStr(p.label) === this.normalizeStr(dep)
        );
        if (provMatch) prov = provMatch.label;
      }
    }

    // Fallback: si Google no entregó un distrito reconocible (p. ej. lo devolvió
    // como `locality` igual a la provincia —Callao, Lima— o simplemente no vino),
    // lo deducimos del texto de la dirección, acotado a la provincia ya resuelta.
    if (prov && !dist) {
      dist = this.matchDistritoFromText(dep, prov, result.address);
    }

    return { dep, prov, dist };
  }

  /**
   * Deduce el distrito a partir del texto de la dirección ("..., Surco, Perú" →
   * "Santiago de Surco"; "..., Callao" → "Callao"), buscando solo entre los
   * distritos de la provincia resuelta. Ignora el primer segmento (la calle) y
   * el país para minimizar falsos positivos por calles homónimas.
   */
  private matchDistritoFromText(depLabel: string, provLabel: string, text: string): string {
    if (!text) return '';
    const dep = findDepartamento(depLabel);
    const prov = dep?.provincias.find(p => p.label === provLabel);
    if (!prov) return '';

    const segments = text
      .split(',')
      .map(s => this.normalizeStr(s).replace(/\d+/g, '').trim())
      .filter(s => s && s !== 'peru')
      .slice(1);
    if (!segments.length) return '';

    const matches = (dn: string, seg: string): boolean => {
      if (dn === seg) return true;
      if (Math.min(dn.length, seg.length) < 4) return false; // evita ruido de pocas letras
      return dn.includes(seg) || seg.includes(dn);
    };

    // Preferimos la etiqueta más larga (más específica) ante varios candidatos.
    const sorted = [...prov.distritos].sort((a, b) => b.label.length - a.label.length);
    for (const seg of segments) {
      const found = sorted.find(d => matches(this.normalizeStr(d.label), seg));
      if (found) return found.label;
    }
    return '';
  }

  private findDistritoInDepartamento(depLabel: string, distLabel: string): { prov: string; dist: string } | null {
    if (!distLabel) return null;
    const dep = findDepartamento(depLabel);
    if (!dep) return null;
    const n = this.normalizeStr(distLabel);
    for (const prov of dep.provincias) {
      const found = prov.distritos.find(d => {
        const dn = this.normalizeStr(d.label);
        return dn === n || n.includes(dn) || dn.includes(n);
      });
      if (found) return { prov: prov.label, dist: found.label };
    }
    return null;
  }

  private normalizeStr(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  private matchDepartamento(label?: string): string {
    if (!label) return '';
    const n = this.normalizeStr(label);
    const found = PERU_LOCATIONS.find(d => {
      const dn = this.normalizeStr(d.label);
      return dn === n || n.includes(dn) || dn.includes(n);
    });
    return found?.label || '';
  }

  private matchProvincia(depLabel: string, provLabel?: string): string {
    if (!provLabel) return '';
    const dep = findDepartamento(depLabel);
    if (!dep) return '';
    const n = this.normalizeStr(provLabel);
    const found = dep.provincias.find(p => {
      const pn = this.normalizeStr(p.label);
      return pn === n || n.includes(pn) || pn.includes(n);
    });
    return found?.label || '';
  }

  private matchDistrito(depLabel: string, provLabel: string, distLabel?: string): string {
    if (!distLabel) return '';
    const dep = findDepartamento(depLabel);
    if (!dep) return '';
    const prov = dep.provincias.find(p => this.normalizeStr(p.label) === this.normalizeStr(provLabel));
    if (!prov) return '';
    const n = this.normalizeStr(distLabel);
    const dist = prov.distritos.find(d => {
      const dn = this.normalizeStr(d.label);
      return dn === n || n.includes(dn) || dn.includes(n);
    });
    return dist?.label || '';
  }

  private calculateDistance(index: number) {
    const row = this.mobilityRowsArray.at(index);
    const oLat = row.get('origenLat')?.value;
    const oLng = row.get('origenLng')?.value;
    const dLat = row.get('destinoLat')?.value;
    const dLng = row.get('destinoLng')?.value;

    if (oLat != null && oLng != null && dLat != null && dLng != null && typeof google !== 'undefined') {
      const from = new google.maps.LatLng(oLat, oLng);
      const to = new google.maps.LatLng(dLat, dLng);
      const meters = google.maps.geometry.spherical.computeDistanceBetween(from, to);
      row.patchValue({ distanciaKm: Math.round(meters / 100) / 10 });
    }
  }

  removeMobilityRow(index: number) {
    this.mobilityRowsArray.removeAt(index);
  }

  /**
   * VD-104: en edición la dirección se escribe a mano (el buscador de Google no
   * refleja el valor guardado). Si el texto cambia, las coordenadas y la
   * distancia calculadas al crear la planilla dejan de corresponder.
   */
  onMobilityPlaceTyped(index: number, field: 'origen' | 'destino') {
    const row = this.mobilityRowsArray.at(index);
    if (row.get(`${field}Lat`)?.value == null) return;
    row.patchValue({
      [`${field}Lat`]: null,
      [`${field}Lng`]: null,
      distanciaKm: null,
    });
  }

  onOrigenDepartamentoChange(i: number) {
    this.mobilityRowsArray.at(i).patchValue({ origenProvincia: '', origenDistrito: '' });
  }

  onOrigenProvinciaChange(i: number) {
    this.mobilityRowsArray.at(i).patchValue({ origenDistrito: '' });
  }

  onDestinoDepartamentoChange(i: number) {
    this.mobilityRowsArray.at(i).patchValue({ destinoProvincia: '', destinoDistrito: '' });
  }

  onDestinoProvinciaChange(i: number) {
    this.mobilityRowsArray.at(i).patchValue({ destinoDistrito: '' });
  }

  getProvinciasOrigen(i: number) {
    const dep = this.mobilityRowsArray.at(i).get('origenDepartamento')?.value;
    return findDepartamento(dep)?.provincias ?? [];
  }

  getDistritosOrigen(i: number) {
    const row = this.mobilityRowsArray.at(i);
    const dep = row.get('origenDepartamento')?.value;
    const prov = row.get('origenProvincia')?.value;
    return findDepartamento(dep)?.provincias.find(p => p.label === prov)?.distritos ?? [];
  }

  getProvinciasDestino(i: number) {
    const dep = this.mobilityRowsArray.at(i).get('destinoDepartamento')?.value;
    return findDepartamento(dep)?.provincias ?? [];
  }

  getDistritosDestino(i: number) {
    const row = this.mobilityRowsArray.at(i);
    const dep = row.get('destinoDepartamento')?.value;
    const prov = row.get('destinoProvincia')?.value;
    return findDepartamento(dep)?.provincias.find(p => p.label === prov)?.distritos ?? [];
  }

  getMobilityTotal(): number {
    return this.mobilityRowsArray.controls.reduce((sum, ctrl) => {
      return sum + (ctrl.get('total')?.value || 0);
    }, 0);
  }

  getMobilityDateTotal(date: string): number {
    if (!date) return 0;
    return this.mobilityRowsArray.controls.reduce((sum, ctrl) => {
      return ctrl.get('fecha')?.value === date ? sum + (ctrl.get('total')?.value || 0) : sum;
    }, 0);
  }

  isMobilityRowDateOverLimit(index: number): boolean {
    if (!this.mobilityDailyLimit) return false;
    const date = this.mobilityRowsArray.at(index).get('fecha')?.value;
    if (!date) return false;
    return this.getMobilityDateTotal(date) > this.mobilityDailyLimit;
  }

  hasAnyMobilityLimitExceeded(): boolean {
    if (!this.mobilityDailyLimit) return false;
    const dates = new Set(
      this.mobilityRowsArray.controls
        .map(c => c.get('fecha')?.value)
        .filter(Boolean)
    );
    return [...dates].some(d => this.getMobilityDateTotal(d) > this.mobilityDailyLimit!);
  }

  isFormValid(): boolean {
    const proyectOk = (() => {
      const c = this.form.get('proyectId');
      return c?.disabled || c?.valid === true;
    })();
    switch (this.expenseType()) {
      case 'planilla_movilidad': {
        // La categoría se resuelve igual en viático y en directa: automática si
        // el colaborador tiene una sola, elegida en el selector si tiene varias.
        const catCtrl = this.form.get('categoryId');
        const categoryOk = catCtrl?.disabled === true || catCtrl?.valid === true;
        // El colaborador debe tener al menos una categoría de Planilla de movilidad asignada.
        const movilidadCategoryOk = this.movilidadCategories.length > 0;
        return (
          proyectOk &&
          categoryOk &&
          movilidadCategoryOk &&
          this.mobilityRowsArray.length > 0 &&
          this.mobilityRowsArray.valid &&
          !this.hasAnyMobilityLimitExceeded()
        );
      }
      case 'otros_gastos': {
        const sub = this.otrosSubTipo();
        // DJE: el monto sale de las filas por rubro y el adjunto es opcional, así
        // que valida contra sus propias secciones (al menos una con filas).
        if (this.isDj()) {
          return (
            proyectOk &&
            !!this.form.get('declaracionJurada')?.value &&
            this.djTotal > 0 &&
            this.isDjSeccionValid('alimentacion') &&
            this.isDjSeccionValid('movilidad')
          );
        }
        // VD-83/VD-91: DJE y AL (Alimentación sin documentación) validan igual
        // que una DJ (checkbox de declaración jurada obligatorio al crear).
        const requiereDeclaracion = ['AL', 'DJ', 'DJE'].includes(sub);
        const isBV = sub === 'BV';
        const rucEmisorOk = !!(this.form.get('rucEmisor')?.value || '').toString().trim();
        const bvDocOk = !isBV || (
          rucEmisorOk &&
          !!(this.form.get('serie')?.value || '').toString().trim() &&
          !!(this.form.get('correlativo')?.value || '').toString().trim()
        );
        // RUC Emisor obligatorio para TK, BV y RC (todos los sub-tipos con documento físico)
        const rucOk = !this.otrosSubTipoMuestraDocumento() || rucEmisorOk;
        // VD-109: AL declara siempre la comida y no puede pasar de su tope,
        // tanto al crear como al editar.
        const comidaOk =
          sub !== 'AL' ||
          (!!this.form.get('tipoComida')?.value && !this.montoSuperaTopeComida);
        return (
          proyectOk &&
          this.form.get('categoryId')?.valid === true &&
          // DJ/AL requieren checkbox de declaración jurada; otros sub-tipos no
          (!!this.id || !requiereDeclaracion || !!this.form.get('declaracionJurada')?.value) &&
          (this.form.get('totalOtros')?.value > 0) &&
          // Adjunto obligatorio al crear, salvo AL (Alimentación sin documentación)
          (!!this.id || sub === 'AL' || !!this.selectedFile) &&
          comidaOk &&
          bvDocOk &&
          rucOk
        );
      }
      case 'recibo_caja':
        return (
          proyectOk &&
          this.form.get('categoryId')?.valid === true &&
          (!!this.id || !!this.selectedFile) &&
          !!(this.form.get('receiptFecha')?.value || '').trim() &&
          !!(this.form.get('receiptConcepto')?.value || '').trim() &&
          (this.form.get('receiptMonto')?.value > 0)
        );
      default:
        return this.form.valid;
    }
  }

  saveCashReceipt() {
    const fecha = this.form.get('receiptFecha')?.value;
    const concepto = (this.form.get('receiptConcepto')?.value || '').trim();
    const monto = Number(this.form.get('receiptMonto')?.value || 0);
    if (!this.selectedFile) {
      this.notificationService.show('Debes adjuntar el archivo del recibo', 'error');
      return;
    }
    if (!fecha || !concepto || monto <= 0) {
      this.notificationService.show('Completa los campos obligatorios del recibo', 'error');
      return;
    }

    this.isLoading.set(true);
    const { downloadUrl$ } = this.uploadService.uploadFile(this.selectedFile, environment.storagePath);
    downloadUrl$.subscribe({
      next: (url) => {
        const payload = {
          proyectId: this.form.get('proyectId')?.value,
          categoryId: this.form.get('categoryId')?.value,
          expenseReportId: this.rendicionId || undefined,
          total: monto,
          fechaEmision: fecha,
          imageUrl: url,
          data: JSON.stringify({
            razonSocial: this.form.get('receiptRazonSocial')?.value || '',
            ruc: this.form.get('receiptRuc')?.value || '',
            numeroDocumento: this.form.get('receiptNumeroDocumento')?.value || '',
            concepto,
          }),
        };
        this.invoiceService.createCashReceipt(payload).subscribe({
          next: (res) => {
            this.isLoading.set(false);
            this.notificationService.show('Recibo de caja guardado correctamente', 'success');
            this.notifyCategoryLimitWarning(res);
            this.navigateAfterExpenseSave();
          },
          error: (error) => {
            this.isLoading.set(false);
            this.notificationService.show(
              'Error al guardar recibo: ' + (error.error?.message || error.message),
              'error'
            );
          },
        });
      },
      error: (err) => {
        this.isLoading.set(false);
        this.notificationService.show('Error al subir el archivo: ' + err.message, 'error');
      },
    });
  }

  saveMobilitySheet() {
    if (this.mobilityRowsArray.length === 0) {
      this.notificationService.show('Debes agregar al menos una fila', 'error');
      return;
    }
    if (this.movilidadCategories.length === 0) {
      this.notificationService.show(
        'No tienes asignada ninguna categoría de Planilla de movilidad. Contacta a un administrador para que te asigne una.',
        'error'
      );
      return;
    }
    if (this.showMovilidadCategorySelect && !this.form.get('categoryId')?.value) {
      this.notificationService.show(
        'Tienes más de una categoría de Planilla de movilidad asignada. Elige cuál corresponde.',
        'error'
      );
      return;
    }
    const proyectCtrl = this.form.get('proyectId');
    const proyectOk = !!(proyectCtrl?.disabled || proyectCtrl?.valid);
    // En planilla directa el proyecto vive en cada fila; el selector superior se omite.
    const categoryCtrl = this.form.get('categoryId');
    const categoryOk = !!(categoryCtrl?.disabled || categoryCtrl?.valid);
    // El formato oficial (ADF-FOR-005) exige la Orden de Trabajo junto al Centro de
    // Costo. Excepción: viático sin OT en la solicitud — no hay ninguna que heredar
    // ni que el colaborador pueda elegir aquí (ver viaticoSinOrdenTrabajo).
    const otOk = this.viaticoSinOrdenTrabajo() || !!this.form.get('ordenTrabajoId')?.value;
    if (!proyectOk || !categoryOk || !otOk) {
      this.notificationService.show(
        otOk
          ? 'Completa los campos requeridos'
          : 'Completa los campos requeridos (incluida la Orden de Trabajo)',
        'error'
      );
      return;
    }
    if (this.isDirectaContext()) {
      const allRowsComplete = this.mobilityRowsArray.controls.every(
        (c) => !!c.get('proyectId')?.value
      );
      if (!allRowsComplete) {
        this.mobilityRowsArray.markAllAsTouched();
        this.notificationService.show('Falta el proyecto de alguna fila', 'error');
        return;
      }
    }
    if (this.hasMobilityTerceroSinColaborador()) {
      this.mobilityRowsArray.markAllAsTouched();
      this.notificationService.show('Selecciona el trabajador en las filas marcadas como tercero', 'error');
      return;
    }
    if (this.hasAnyMobilityLimitExceeded()) {
      this.notificationService.show(
        `El total diario supera el límite configurado de S/ ${this.mobilityDailyLimit?.toFixed(2)}`,
        'error'
      );
      return;
    }
    this.isLoading.set(true);

    const doSave = (imageUrl?: string) => {
      const rows = this.mobilityRowsArray.value.map((r: any) => ({
        fecha: r.fecha,
        total: r.total,
        ...(r.proyectId ? { proyectId: r.proyectId } : {}),
        ...(r.categoryId ? { categoryId: r.categoryId } : {}),
        ...this.resolveRowColaborador(r),
        origen: r.origen,
        origenDepartamento: r.origenDepartamento,
        origenProvincia: r.origenProvincia,
        origenDistrito: r.origenDistrito,
        ...(r.origenLat != null && r.origenLng != null
          ? { origenCoords: { lat: r.origenLat, lng: r.origenLng } }
          : {}),
        destino: r.destino,
        destinoDepartamento: r.destinoDepartamento,
        destinoProvincia: r.destinoProvincia,
        destinoDistrito: r.destinoDistrito,
        ...(r.destinoLat != null && r.destinoLng != null
          ? { destinoCoords: { lat: r.destinoLat, lng: r.destinoLng } }
          : {}),
        ...(r.distanciaKm != null ? { distanciaKm: r.distanciaKm } : {}),
        gestion: r.gestion,
      }));
      // En modo directa el proyecto y la categoría viven en cada fila (todas
      // comparten el mismo, heredado del centro de costo de la rendición). Se
      // toma el primero con valor, sin depender de la posición del array: desde
      // VD-71 las filas nuevas se insertan al inicio.
      const expenseProjectId = this.isDirectaContext()
        ? (rows.find((r: any) => r.proyectId)?.proyectId || '')
        : this.form.get('proyectId')?.value;
      // La categoría sale del selector superior —resuelta sola o elegida—, tanto
      // en viático como en directa. En directa se conserva la lectura por fila
      // como respaldo para planillas viejas que aún la traigan (VD-28 dejó de
      // pedirla por fila).
      const expenseCategoryId =
        this.form.get('categoryId')?.value ||
        (this.isDirectaContext() ? rows.find((r: any) => r.categoryId)?.categoryId || '' : '');
      const payload = {
        proyectId: expenseProjectId,
        ordenTrabajoId: this.form.get('ordenTrabajoId')?.value || undefined,
        categoryId: expenseCategoryId,
        expenseReportId: this.rendicionId || undefined,
        mobilityRows: rows,
        imageUrl,
      };
      this.invoiceService.createMobilitySheet(payload).subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.notificationService.show('Planilla guardada correctamente', 'success');
          this.notifyCategoryLimitWarning(res);
          this.navigateAfterExpenseSave();
        },
        error: (error) => {
          this.isLoading.set(false);
          this.notificationService.show(
            'Error al guardar la planilla: ' + (error.error?.message || error.message),
            'error'
          );
        },
      });
    };

    if (this.selectedFile) {
      const { downloadUrl$ } = this.uploadService.uploadFile(this.selectedFile, environment.storagePath);
      downloadUrl$.subscribe({
        next: (url) => doSave(url),
        error: (err) => {
          this.isLoading.set(false);
          this.notificationService.show('Error al subir el adjunto: ' + err.message, 'error');
        },
      });
    } else {
      doSave();
    }
  }

  /**
   * Declaración Jurada al extranjero (DJE): adjunto opcional y un gasto por
   * rubro (Alimentación / Movilidad) con su detalle diario. Tras guardar no se
   * navega: queda disponible la descarga del PDF firmado.
   */
  saveDeclaracionJurada(): void {
    const proyectCtrl = this.form.get('proyectId');
    const proyectOk = !!(proyectCtrl?.disabled || proyectCtrl?.valid);
    if (!proyectOk) {
      this.notificationService.show('Completa los campos requeridos', 'error');
      return;
    }

    const currentUser = this.userStateService.getUser();
    if (!currentUser?.signature) {
      this.notificationService.show(
        'Debes registrar tu firma digital antes de enviar una Declaracion Jurada. Ve a Mi Firma en el menu.',
        'error'
      );
      return;
    }
    if (!this.form.get('declaracionJurada')?.value) {
      this.notificationService.show('Debes aceptar y firmar la declaración jurada', 'error');
      return;
    }

    const alimentacionRows = this.djAlimentacionRowsArray.getRawValue() as { fecha: string; monto: number }[];
    const movilidadRows = this.djMovilidadRowsArray.getRawValue() as { fecha: string; monto: number }[];
    if (alimentacionRows.length === 0 && movilidadRows.length === 0) {
      this.notificationService.show('Agrega al menos un gasto de Alimentación o Movilidad', 'error');
      return;
    }
    if (!this.isDjSeccionValid('alimentacion') || !this.isDjSeccionValid('movilidad')) {
      this.notificationService.show(
        'Completa la categoría, la fecha y el monto de cada fila declarada',
        'error'
      );
      return;
    }

    this.isLoading.set(true);

    const proceed = (imageUrl?: string) => {
      const payload: ICreateDeclaracionJuradaPayload = {
        proyectId: this.form.get('proyectId')?.value,
        expenseReportId: this.rendicionId || undefined,
        moneda: (this.form.get('djMoneda')?.value || 'US$').toString().trim(),
        destino: (this.form.get('djDestino')?.value || '').toString().trim() || undefined,
        pais: (this.form.get('djPais')?.value || '').toString().trim() || undefined,
        lugarFirma: (this.form.get('djLugarFirma')?.value || '').toString().trim() || undefined,
        imageUrl,
        ...(alimentacionRows.length
          ? { alimentacion: { categoryId: this.djCategoryIdFor('alimentacion'), rows: alimentacionRows } }
          : {}),
        ...(movilidadRows.length
          ? { movilidad: { categoryId: this.djCategoryIdFor('movilidad'), rows: movilidadRows } }
          : {}),
      };
      this.invoiceService.createDeclaracionJurada(payload).subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.savedDeclaracionJurada.set(res);
          this.notificationService.show(
            'Declaración jurada guardada correctamente. Ya puedes descargar el PDF.',
            'success'
          );
        },
        error: (error) => {
          this.isLoading.set(false);
          this.notificationService.show(
            'Error al guardar la declaración jurada: ' + (error.error?.message || error.message),
            'error'
          );
        },
      });
    };

    if (this.selectedFile) {
      const { downloadUrl$ } = this.uploadService.uploadFile(this.selectedFile, environment.storagePath);
      downloadUrl$.subscribe({
        next: (url) => proceed(url),
        error: (err) => {
          this.isLoading.set(false);
          this.notificationService.show('Error al subir el adjunto: ' + err.message, 'error');
        },
      });
    } else {
      proceed();
    }
  }

  /** Genera el PDF oficial de la DJ al extranjero con los datos del formulario. */
  async downloadDeclaracionJuradaPdf(): Promise<void> {
    try {
      const currentUser = this.userStateService.getUser();
      const { RendicionExportService } = await import('../../../services/rendicion-export.service');
      const exportService = this.injector.get(RendicionExportService);
      // Empresa: la del cliente del colaborador. La configuración global puede
      // traer otra razón social (y sin RUC), y el documento es de la empresa que
      // emplea a quien declara.
      const client = currentUser?.client;
      await exportService.exportDeclaracionJuradaExteriorToPdf({
        fileBaseName: `declaracion-jurada-${new Date().toISOString().slice(0, 10)}`,
        colaborador: currentUser?.name || '',
        colaboradorDni: (currentUser as any)?.dni,
        empresaNombre: client?.businessName || client?.comercialName,
        empresaRuc: client?.businessId,
        ciudadDestino: this.form.get('djDestino')?.value || undefined,
        pais: this.form.get('djPais')?.value || undefined,
        moneda: this.form.get('djMoneda')?.value || 'US$',
        alimentacionRows: this.djAlimentacionRowsArray.getRawValue(),
        movilidadRows: this.djMovilidadRowsArray.getRawValue(),
        ciudadFirma: this.form.get('djLugarFirma')?.value || undefined,
        fechaFirma: new Date().toISOString(),
        signature: currentUser?.signature,
      });
    } catch (err: any) {
      this.notificationService.show('Error al generar el PDF: ' + err.message, 'error');
    }
  }

  saveOtherExpense() {
    // La DJ al extranjero tiene su propio flujo (un gasto por rubro).
    if (this.isDj()) {
      this.saveDeclaracionJurada();
      return;
    }
    const declaracionJurada = this.form.get('declaracionJurada')?.value;
    const total = this.form.get('totalOtros')?.value;
    const description = this.form.get('description')?.value;
    const subTipo = this.otrosSubTipo();
    // VD-109: en AL la comida reemplaza a la descripción y define el tope.
    const tipoComida = subTipo === 'AL' ? this.form.get('tipoComida')?.value : '';
    // AL (Alimentación sin documentación) y DJE requieren declaración jurada + firma (VD-91).
    const requiereDeclaracion = ['AL', 'DJ', 'DJE'].includes(subTipo);

    const proyectCtrl = this.form.get('proyectId');
    const proyectOk = !!(proyectCtrl?.disabled || proyectCtrl?.valid);
    if (!proyectOk || !this.form.get('categoryId')?.valid) {
      this.notificationService.show('Completa los campos requeridos', 'error');
      return;
    }
    const currentUser = this.userStateService.getUser();

    // DJ/DJE y AL requieren firma digital + aceptación del checkbox
    if (requiereDeclaracion) {
      if (!currentUser?.signature) {
        this.notificationService.show(
          'Debes registrar tu firma digital antes de enviar una Declaracion Jurada. Ve a Mi Firma en el menu.',
          'error'
        );
        return;
      }
      if (!declaracionJurada) {
        this.notificationService.show('Debes aceptar y firmar la declaración jurada', 'error');
        return;
      }
    }

    const firmante = requiereDeclaracion ? (currentUser?.name || '').trim() : '';
    if (!total || total <= 0) {
      this.notificationService.show('Ingresa un monto válido', 'error');
      return;
    }

    if (subTipo === 'AL') {
      if (!tipoComida) {
        this.notificationService.show('Indica si el gasto es desayuno, almuerzo o cena', 'error');
        return;
      }
      const tope = this.topeComidaSeleccionada;
      if (tope !== null && total > tope) {
        this.notificationService.show(
          `El monto supera el tope de S/ ${tope.toFixed(2)} configurado para ${tipoComida}`,
          'error'
        );
        return;
      }
    }

    // El adjunto es obligatorio salvo AL (Alimentación sin documentación)
    if (subTipo !== 'AL' && !this.selectedFile) {
      this.notificationService.show('Debes adjuntar el comprobante', 'error');
      return;
    }

    const muestraDoc = this.otrosSubTipoMuestraDocumento();
    // RUC Emisor obligatorio para TK, BV y RC
    if (muestraDoc && !(this.form.get('rucEmisor')?.value || '').toString().trim()) {
      this.notificationService.show('Debes ingresar el RUC del emisor', 'error');
      return;
    }

    this.isLoading.set(true);

    const serie = muestraDoc ? (this.form.get('serie')?.value || '').toString().trim() : '';
    const correlativo = muestraDoc ? (this.form.get('correlativo')?.value || '').toString().trim() : '';
    const rucEmisor = muestraDoc ? (this.form.get('rucEmisor')?.value || '').toString().trim() : '';

    const proceed = (imageUrl?: string) => {
      const payload: any = {
        proyectId: this.form.get('proyectId')?.value,
        categoryId: this.form.get('categoryId')?.value,
        expenseReportId: this.rendicionId || undefined,
        total,
        data: description,
        subTipo,
        ...(tipoComida ? { tipoComida } : {}),
        declaracionJurada: requiereDeclaracion,
        declaracionJuradaFirmante: requiereDeclaracion ? firmante : undefined,
        imageUrl,
        ...(serie ? { serie } : {}),
        ...(correlativo ? { correlativo } : {}),
        ...(rucEmisor ? { rucEmisor } : {}),
      };
      this.invoiceService.createOtherExpense(payload).subscribe({
        next: (res) => {
          this.isLoading.set(false);
          this.notificationService.show('Gasto guardado correctamente', 'success');
          this.notifyCategoryLimitWarning(res);
          this.navigateAfterExpenseSave();
        },
        error: (error) => {
          this.isLoading.set(false);
          this.notificationService.show(
            'Error al guardar el gasto: ' + (error.error?.message || error.message),
            'error'
          );
        },
      });
    };

    if (this.selectedFile) {
      const { downloadUrl$ } = this.uploadService.uploadFile(this.selectedFile, environment.storagePath);
      downloadUrl$.subscribe({
        next: (url) => proceed(url),
        error: (err) => {
          this.isLoading.set(false);
          this.notificationService.show('Error al subir el adjunto: ' + err.message, 'error');
        },
      });
    } else {
      proceed();
    }
  }

  saveOrUpdate() {
    if (this.id) {
      this.update();
      return;
    }
    switch (this.expenseType()) {
      case 'planilla_movilidad':
        this.saveMobilitySheet();
        break;
      case 'otros_gastos':
        this.saveOtherExpense();
        break;
      case 'recibo_caja':
        this.saveCashReceipt();
        break;
      default:
        if (!this.selectedFile) {
          this.notificationService.show('Debes seleccionar un archivo de factura', 'error');
          return;
        }
        this.isLoading.set(true);
        // VD-70 Parte B: el botón "Subir factura" ahora solo escanea (OCR+SUNAT);
        // el archivo se sube y el gasto se crea recién al confirmar.
        this.scanInvoice();
    }
  }

  update() {
    if (!this.originalInvoice) return;
    if (!this.isFormValid()) {
      this.notificationService.show('Completa los campos requeridos', 'error');
      return;
    }

    const formValue = this.form.getRawValue();
    const type = this.expenseType();

    let previousData: any = {};
    const currentData = this.originalInvoice.data || '';
    if (currentData) {
      try {
        previousData =
          typeof currentData === 'string' ? JSON.parse(currentData) : currentData;
      } catch {}
    }

    const payload: any = {
      proyectId: formValue.proyectId,
      ordenTrabajoId: formValue.ordenTrabajoId || undefined,
      categoryId: formValue.categoryId,
      status: this.originalInvoice.status,
      comentario: (formValue.comentario || '').trim() || undefined,
    };

    if (type === 'factura') {
      const fetched = this.fetchedRazonSocial();
      const razonSocial = fetched !== null ? fetched : (this.rucNotFound() ? 'No Reconocida' : undefined);
      const currentTotal = parseFloat(String(this.originalInvoice.total)) || 0;
      const finalTotal = this.invoiceAmountWasEdited ? this.editedInvoiceTotal()! : currentTotal;
      const dataObj = {
        ...previousData,
        rucEmisor: formValue.rucEmisor,
        serie: formValue.serie,
        correlativo: formValue.correlativo,
        fechaEmision: this.formatDateForBackend(formValue.fechaEmision),
        ...(razonSocial !== undefined ? { razonSocial } : {}),
        ...(this.invoiceAmountWasEdited ? { amountEdited: true, originalOcrTotal: currentTotal } : {}),
      };
      payload.data = JSON.stringify(dataObj);
      payload.fechaEmision = formValue.fechaEmision;
      payload.total = finalTotal;
      payload.placaVehiculo = (formValue.placaVehiculo || '').trim() || undefined;
    } else if (type === 'otros_gastos') {
      // VD-109: en AL la descripción es la comida declarada.
      const esAl = this.otrosSubTipo() === 'AL';
      const tipoComida = esAl ? (formValue.tipoComida || '') : '';
      const description = esAl
        ? (this.comidasDisponibles.find((c) => c.key === tipoComida)?.label || '')
        : (formValue.description || '').trim();
      payload.description = description;
      payload.total = Number(formValue.totalOtros) || 0;
      if (tipoComida) payload.tipoComida = tipoComida;
      const muestraDoc = this.otrosSubTipoMuestraDocumento();
      const { serie: _s, correlativo: _c, rucEmisor: _r, ...prevWithoutDoc } = previousData || {};
      const dataObj = {
        ...prevWithoutDoc,
        description,
        ...(tipoComida ? { tipoComida } : {}),
        ...(muestraDoc ? {
          serie: (formValue.serie || '').trim() || undefined,
          correlativo: (formValue.correlativo || '').trim() || undefined,
          rucEmisor: (formValue.rucEmisor || '').trim() || undefined,
        } : {}),
      };
      payload.data = JSON.stringify(dataObj);
    } else if (type === 'recibo_caja') {
      const dataObj = {
        ...previousData,
        razonSocial: formValue.receiptRazonSocial || '',
        ruc: formValue.receiptRuc || '',
        numeroDocumento: formValue.receiptNumeroDocumento || '',
        concepto: (formValue.receiptConcepto || '').trim(),
      };
      payload.data = JSON.stringify(dataObj);
      payload.fechaEmision = formValue.receiptFecha;
      payload.total = Number(formValue.receiptMonto) || 0;
    } else if (type === 'planilla_movilidad') {
      if (this.hasMobilityTerceroSinColaborador()) {
        this.mobilityRowsArray.markAllAsTouched();
        this.notificationService.show('Selecciona el trabajador en las filas marcadas como tercero', 'error');
        return;
      }
      const rows = this.mobilityRowsArray.value.map((r: any) => ({
        fecha: r.fecha,
        total: r.total,
        ...(r.proyectId ? { proyectId: r.proyectId } : {}),
        ...(r.categoryId ? { categoryId: r.categoryId } : {}),
        ...this.resolveRowColaborador(r),
        origen: r.origen,
        origenDepartamento: r.origenDepartamento,
        origenProvincia: r.origenProvincia,
        origenDistrito: r.origenDistrito,
        ...(r.origenLat != null && r.origenLng != null
          ? { origenCoords: { lat: r.origenLat, lng: r.origenLng } }
          : {}),
        destino: r.destino,
        destinoDepartamento: r.destinoDepartamento,
        destinoProvincia: r.destinoProvincia,
        destinoDistrito: r.destinoDistrito,
        ...(r.destinoLat != null && r.destinoLng != null
          ? { destinoCoords: { lat: r.destinoLat, lng: r.destinoLng } }
          : {}),
        ...(r.distanciaKm != null ? { distanciaKm: r.distanciaKm } : {}),
        gestion: r.gestion,
      }));
      payload.mobilityRows = rows;
      // En modo directa el proyecto y la categoría del gasto se toman de la fila
      // que los tenga (todas comparten el mismo), sin depender de la posición:
      // desde VD-71 las filas nuevas se insertan al inicio.
      const directaProject = this.isDirectaContext()
        ? rows.find((r: any) => r.proyectId)?.proyectId
        : undefined;
      const directaCategory = this.isDirectaContext()
        ? rows.find((r: any) => r.categoryId)?.categoryId
        : undefined;
      if (directaProject) {
        payload.proyectId = directaProject;
      }
      if (directaCategory) {
        payload.categoryId = directaCategory;
      }
    }

    this.isLoading.set(true);

    this.invoiceService.updateInvoice(this.id, payload).subscribe({
      next: () => {
        if (type === 'factura' && this.shouldValidateWithSunat(formValue)) {
          this.validateWithSunatData(formValue);
        } else {
          this.isLoading.set(false);
          this.notificationService.show('Gasto actualizado correctamente', 'success');
          this.navigateAfterExpenseSave();
        }
      },
      error: (error: any) => {
        this.isLoading.set(false);
        console.error('Error al actualizar:', error);
        const msg = error?.error?.message || error?.message || 'Intente nuevamente';
        this.notificationService.show('Error al actualizar: ' + msg, 'error');
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.selectedFile = input.files[0];
      const isImage = this.selectedFile.type.startsWith('image/');
      if (isImage) {
        this.previewObjectUrl = URL.createObjectURL(this.selectedFile);
        this.previewImage = this.sanitizer.bypassSecurityTrustUrl(this.previewObjectUrl);
      } else {
        this.previewObjectUrl = null;
        this.previewImage = null;
      }
      this.form.patchValue({ file: this.selectedFile });
    }
  }

  /**
   * VD-70 Parte B: escanea el archivo (OCR + SUNAT) SIN subirlo a storage ni
   * crear el gasto. Imagen y PDF van como multipart a sus endpoints de análisis.
   */
  private scanInvoice() {
    const formData = new FormData();
    formData.append('file', this.selectedFile);
    formData.append('proyectId', this.form.get('proyectId')?.value);
    formData.append('categoryId', this.form.get('categoryId')?.value);
    formData.append('status', 'pending');
    if (this.rendicionId) {
      formData.append('expenseReportId', this.rendicionId);
    }
    this.percentage.set(10);
    const scan$ = this.isPdfFile(this.selectedFile)
      ? this.invoiceService.analyzePdf(formData)
      : this.invoiceService.analyzeInvoice(formData);
    scan$.subscribe({
      next: (res) => this.handleScanResult(res),
      error: (error) => {
        this.isLoading.set(false);
        this.notificationService.show(
          'Error al analizar la factura: ' +
            (error?.error?.message || error?.message || ''),
          'error'
        );
      },
    });
  }

  /**
   * Procesa la respuesta del escaneo (VD-70 Parte B): datos OCR + resultado
   * SUNAT, sin gasto persistido. Puebla el panel post-OCR para revisar/editar y
   * confirmar.
   */
  private handleScanResult(res: any) {
    this.isLoading.set(false);
    let dataObj: any = {};
    if (res?.data) {
      try {
        dataObj = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      } catch {}
    }
    if (
      dataObj?.rucEmisor || dataObj?.fechaEmision || dataObj?.serie ||
      dataObj?.correlativo || dataObj?.comentario
    ) {
      this.form.patchValue({
        rucEmisor: dataObj.rucEmisor || '',
        fechaEmision: this.formatDateForInput(dataObj.fechaEmision),
        serie: dataObj.serie || '',
        correlativo: dataObj.correlativo || '',
        // El prefijo de la serie manda sobre el texto del OCR (más fiable).
        tipoComprobante: this.deriveTipoFromSerie(dataObj.serie)
          ?? this.normalizeTipoComprobante(dataObj.tipoComprobante),
        comentario: dataObj.comentario || '',
        placaVehiculo: dataObj.placaVehiculo || '',
      });
      // El gasto aún no existe; se guardan los datos OCR para crearlo al confirmar.
      this.postOcrBaseInvoice = { data: res.data, total: res.total, status: res.status };
      this.ocrTotalAmount.set(parseFloat(String(res.total)) || 0);
      this.isEditingOcrAmount.set(false);
      this.editedOcrTotal.set(null);
      this.sunatValidationResult = dataObj?.sunatValidation ?? null;
      this.sunatStatus.set(dataObj?.sunatValidation?.status ?? null);
      this.showPostOcrReview.set(true);
      this.notifySunatStatus(this.sunatStatus());
    } else {
      this.notificationService.show(
        'No se pudieron extraer datos de la factura. Revisa el archivo e intenta de nuevo.',
        'error'
      );
    }
  }


  confirmPostOcrReview() {
    if (!this.postOcrBaseInvoice || !this.selectedFile) return;
    const comentario = (this.form.get('comentario')?.value || '').trim();
    if (!comentario) {
      this.notificationService.show('El campo Comentario es obligatorio.', 'error');
      return;
    }
    // VD-70: no se puede guardar una factura que SUNAT no validó como aceptada.
    if (!this.sunatIsValid()) {
      this.notificationService.show(
        'La factura no fue validada por SUNAT. Corrige los datos y vuelve a validar antes de guardar.',
        'error'
      );
      return;
    }
    // getRawValue para incluir controles deshabilitados (p. ej. proyectId fijado
    // por la rendición).
    const formValue = this.form.getRawValue();
    let baseData: any = {};
    try {
      baseData =
        typeof this.postOcrBaseInvoice.data === 'string'
          ? JSON.parse(this.postOcrBaseInvoice.data || '{}')
          : this.postOcrBaseInvoice.data || {};
    } catch {
      baseData = {};
    }
    const fetched = this.fetchedRazonSocial();
    const razonSocialOcr = fetched !== null ? fetched : (this.rucNotFound() ? 'No Reconocida' : undefined);
    const finalTotal = this.ocrAmountWasEdited
      ? this.editedOcrTotal()!
      : (parseFloat(String(this.postOcrBaseInvoice.total)) || 0);
    const dataObj = {
      ...baseData,
      rucEmisor: formValue.rucEmisor || '',
      fechaEmision: this.formatDateForBackend(formValue.fechaEmision || ''),
      serie: formValue.serie || '',
      correlativo: formValue.correlativo || '',
      // Tipo de comprobante corregido por el usuario (VD-70), no el del OCR.
      tipoComprobante: formValue.tipoComprobante || 'Factura',
      comentario,
      placaVehiculo: (formValue.placaVehiculo || '').trim() || undefined,
      // Validación SUNAT vigente (del escaneo o la última revalidación).
      ...(this.sunatValidationResult ? { sunatValidation: this.sunatValidationResult } : {}),
      ...(razonSocialOcr !== undefined ? { razonSocial: razonSocialOcr } : {}),
      ...(this.ocrAmountWasEdited ? { amountEdited: true, originalOcrTotal: this.ocrTotalAmount() } : {}),
    };

    // VD-70 Parte B: recién ahora (al confirmar) se sube el archivo y se crea el
    // gasto. Si el usuario cancela antes, no queda nada.
    this.isLoading.set(true);
    const { downloadUrl$ } = this.uploadService.uploadFile(
      this.selectedFile,
      environment.storagePath
    );
    downloadUrl$.subscribe({
      next: (url) => {
        const payload = {
          proyectId: formValue.proyectId,
          categoryId: formValue.categoryId,
          ordenTrabajoId: formValue.ordenTrabajoId || undefined,
          total: finalTotal,
          data: JSON.stringify(dataObj),
          fechaEmision: dataObj.fechaEmision,
          comentario,
          placaVehiculo: dataObj.placaVehiculo,
          imageUrl: url,
          expenseReportId: this.rendicionId || undefined,
        };
        this.invoiceService.createInvoice(payload).subscribe({
          next: (res) => {
            this.isLoading.set(false);
            this.notificationService.show('Factura guardada correctamente', 'success');
            this.notifyCategoryLimitWarning(res);
            this.navigateAfterExpenseSave();
          },
          error: (error) => {
            this.isLoading.set(false);
            this.notificationService.show(
              'Error al guardar la factura: ' + (error.error?.message || error.message),
              'error'
            );
          },
        });
      },
      error: (error) => {
        this.isLoading.set(false);
        this.notificationService.show(
          'Error al subir el archivo: ' + (error?.message || ''),
          'error'
        );
      },
    });
  }

  openInvoice() {
    if (this.previewObjectUrl) {
      window.open(this.previewObjectUrl, '_blank', 'noopener,noreferrer');
    }
  }

  back() {
    this.navigateAfterExpenseSave();
  }

  get categoryId() {
    return this.form.get('categoryId');
  }

  get proyectId() {
    return this.form.get('proyectId');
  }

  /** OTs a mostrar: solo las del centro de costo (proyecto) elegido. */
  get filteredOrdenesTrabajo(): IOrdenTrabajo[] {
    const pid = this.form.get('proyectId')?.value;
    if (!pid) return [];
    return this.ordenesTrabajo.filter((ot) => otPerteneceACentroCosto(ot, pid));
  }

  /**
   * Opciones de OT para `app-search-select`: las del centro de costo elegido más
   * la OT heredada de la rendición, aunque no pertenezca a ese centro de costo o
   * esté desactivada. Sin ella el selector no encuentra la opción y muestra el
   * placeholder, como si la rendición no tuviera OT.
   */
  get ordenTrabajoOptions(): SearchSelectOption[] {
    const options = this.filteredOrdenesTrabajo.map((ot) => ({
      value: ot._id ?? '',
      label: ot.nombre,
    }));
    const inherited = this.inheritedOrdenTrabajo();
    if (inherited && !options.some((o) => o.value === inherited._id)) {
      const nombre =
        inherited.nombre ||
        this.ordenesTrabajo.find((ot) => ot._id === inherited._id)?.nombre ||
        'OT de la rendición';
      options.unshift({ value: inherited._id, label: nombre });
    }
    return options;
  }

  get imageUrl() {
    return this.form.get('file');
  }

  get serie() {
    return this.form.get('serie');
  }

  get correlativo() {
    return this.form.get('correlativo');
  }

  getButtonLabel(): string {
    if (this.id) {
      if (this.isSunatValidating()) return 'Validando con SUNAT...';
      if (this.isLoading()) return 'Actualizando...';
      // El formulario edita cualquier tipo de gasto, no solo facturas.
      return 'Actualizar';
    }
    if (this.isLoading()) return 'Guardando...';
    switch (this.expenseType()) {
      case 'planilla_movilidad': return 'Guardar Planilla';
      case 'otros_gastos': return 'Guardar Gasto';
      case 'recibo_caja': return 'Guardar Recibo de Caja';
      default: return 'Subir factura';
    }
  }

  private shouldValidateWithSunat(formValue: any): boolean {
    return !!(
      formValue.rucEmisor &&
      formValue.serie &&
      formValue.correlativo &&
      formValue.fechaEmision
    );
  }

  private validateWithSunat() {
    this.isSunatValidating.set(true);

    const clientId =
      this.originalInvoice?.clientId?._id || this.originalInvoice?.clientId;

    if (!clientId) {
      this.isSunatValidating.set(false);
      this.isLoading.set(false);
      this.notificationService.show(
        'No se pudo obtener el ID de la empresa para validar con SUNAT',
        'error'
      );
      this.navigateAfterExpenseSave();
      return;
    }

    this.invoiceService.getSunatValidation(this.id, clientId).subscribe({
      next: (validationResult: SunatValidationInfo) => {
        this.isSunatValidating.set(false);
        this.isLoading.set(false);
        this.sunatValidation = validationResult;

        this.showSunatValidationResult(validationResult);

        this.navigateAfterExpenseSave();
      },
      error: (error) => {
        this.isSunatValidating.set(false);
        this.isLoading.set(false);
        console.error('Error al validar con SUNAT:', error);

        this.notificationService.show(
          'Factura actualizada correctamente, pero hubo un error al validar con SUNAT',
          'error'
        );
        this.navigateAfterExpenseSave();
      },
    });
  }

  private showSunatValidationResult(validation: SunatValidationInfo) {
    let message = '';
    let type: 'success' | 'error' = 'success';

    if (validation.sunatValidation) {
      switch (validation.sunatValidation.status) {
        case 'VALIDO_ACEPTADO':
          message = 'Factura Válida y emitida a la empresa';
          type = 'success';
          break;
        case 'VALIDO_NO_PERTENECE':
          message = 'El comprobante no fue emitido a esta empresa. Verifica el RUC emisor.';
          type = 'error';
          break;
        case 'NO_ENCONTRADO':
          message = 'Comprobante no encontrado en SUNAT';
          type = 'error';
          break;
        case 'ERROR_SUNAT':
          message = 'Error en el servicio de sunat';
          type = 'error';
          break;
        default:
          message =
            'Resultado de validación SUNAT: ' +
            validation.sunatValidation.message;
          type = 'error';
      }
    } else {
      message = 'No se pudo obtener información de validación SUNAT';
      type = 'error';
    }

    this.notificationService.show(message, type);
  }

  private getTipoComprobanteFromData(): string {
    if (this.originalInvoice?.data) {
      try {
        const dataObj =
          typeof this.originalInvoice.data === 'string'
            ? JSON.parse(this.originalInvoice.data)
            : this.originalInvoice.data;
        return dataObj.tipoComprobante || 'Factura';
      } catch {
        return 'Factura';
      }
    }
    return 'Factura';
  }

  private validateWithSunatData(formValue: any) {
    this.isSunatValidating.set(true);

    const validationData = {
      rucEmisor: formValue.rucEmisor,
      serie: formValue.serie,
      correlativo: formValue.correlativo,
      fechaEmision: this.formatDateForBackend(formValue.fechaEmision),
      montoTotal:
        this.originalInvoice?.total || this.originalInvoice?.montoTotal || 0,
      clientId:
        this.originalInvoice?.clientId || this.originalInvoice?.companyId,
      tipoComprobante: this.getTipoComprobanteFromData(),
    };

    this.invoiceService
      .validateWithSunatData(this.id, validationData)
      .subscribe({
        next: (response) => {
          this.isSunatValidating.set(false);
          this.isLoading.set(false);

          let message = '';
          let type: 'success' | 'error' = 'success';

          switch (response.status) {
            case 'VALIDO_ACEPTADO':
              message = 'Factura Válida y emitida a la empresa';
              type = 'success';
              break;
            case 'VALIDO_NO_PERTENECE':
              message = 'El comprobante no fue emitido a esta empresa. Verifica el RUC emisor.';
              type = 'error';
              break;
            case 'NO_ENCONTRADO':
              message = 'Comprobante no encontrado en SUNAT';
              type = 'error';
              break;
            case 'ERROR_SUNAT':
              message = 'Error en el servicio de sunat';
              type = 'error';
              break;
            case 'SUNAT_CONFIG_NOT_FOUND':
              message = 'No se encontró configuración SUNAT para esta empresa';
              type = 'error';
              break;
            default:
              message =
                'Resultado de validación SUNAT: ' +
                (response.details?.message || 'Estado desconocido');
              type = 'error';
          }

          this.notificationService.show(message, type);
          this.navigateAfterExpenseSave();
        },
        error: (error) => {
          this.isSunatValidating.set(false);
          this.isLoading.set(false);
          console.error('Error al validar con SUNAT:', error);
          this.notificationService.show(
            'Factura actualizada correctamente, pero hubo un error al validar con SUNAT',
            'error'
          );
          this.navigateAfterExpenseSave();
        },
      });
  }
}
