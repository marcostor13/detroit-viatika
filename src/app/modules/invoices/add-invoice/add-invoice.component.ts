import { Component, inject, signal, computed, OnInit } from '@angular/core';
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
} from '../interfaces/invoices.interface';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { ProjectSelectComponent } from '../../../design-system/project-select/project-select.component';
import { WorkerOption } from '../../../design-system/worker-select/worker-select.component';
import { PlacesAutocompleteDirective, PlaceResult } from '../../../directives/places-autocomplete.directive';
import { CompanyConfigService } from '../../../services/company-config.service';
import { PERU_LOCATIONS, Departamento } from '../../../constants/peru-locations';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { IOrdenTrabajo } from '../../../interfaces/orden-trabajo.interface';

function findDepartamento(label: string): Departamento | undefined {
  return PERU_LOCATIONS.find(d => d.label === label);
}

declare const google: any;

@Component({
  selector: 'app-add-invoice',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, CommonModule, ButtonComponent, IconComponent, ProjectSelectComponent, PlacesAutocompleteDirective],
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
  fromContabilidad = false;

  expenseType = signal<ExpenseType>('factura');
  /** Sub-tipo para otros_gastos: TK | BV | RC | DJ | OT */
  otrosSubTipo = signal<string>('DJ');
  /** Sub-tipos que llevan documento físico con RUC/serie/correlativo. */
  otrosSubTipoMuestraDocumento = computed(() =>
    ['TK', 'BV', 'RC'].includes(this.otrosSubTipo())
  );
  rendicionBudget = signal<number>(0);
  rendicionSpent = signal<number>(0);
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
    const invoiceId = this.postOcrInvoiceId();
    if (!invoiceId) return;
    const formValue = this.form.value;
    if (!this.shouldValidateWithSunat(formValue)) {
      this.notificationService.show(
        'Completa RUC, serie, correlativo y fecha para validar con SUNAT.',
        'error'
      );
      return;
    }
    this.isSunatValidating.set(true);
    const validationData = {
      rucEmisor: formValue.rucEmisor,
      serie: formValue.serie,
      correlativo: formValue.correlativo,
      fechaEmision: this.formatDateForBackend(formValue.fechaEmision),
      montoTotal: this.postOcrBaseInvoice?.total || this.ocrTotalAmount() || 0,
      clientId: this.postOcrBaseInvoice?.clientId?._id
        || this.postOcrBaseInvoice?.clientId
        || this.postOcrBaseInvoice?.companyId,
      tipoComprobante: this.getSelectedTipoComprobante(),
    };
    this.invoiceService.validateWithSunatData(invoiceId, validationData).subscribe({
      next: (response: any) => {
        this.isSunatValidating.set(false);
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
          (ot) => ot._id === otId && this.otCostCenterId(ot) === (pid ?? '')
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
        }
        // Viático: la OT se hereda de la solicitud del viático y la toman sus
        // comprobantes de planilla de movilidad; no se elige por comprobante (VD-28).
        const viaticoOtRef = (report as any)?.viaticoOrdenTrabajoId;
        if (!isDirecta && (report as any)?.type === 'viatico' && viaticoOtRef) {
          const otId = typeof viaticoOtRef === 'string' ? viaticoOtRef : viaticoOtRef._id;
          this.form.patchValue({ ordenTrabajoId: otId });
          this.form.get('ordenTrabajoId')?.disable();
          this.viaticoOrdenTrabajoInherited.set(true);
        }
        // El flag directa puede llegar después de que el usuario ya agregó filas:
        // re-sincroniza validadores del proyecto (superior y por fila).
        this.syncMobilityRowValidators();
        const expenses = Array.isArray(report?.expenseIds) ? report.expenseIds : [];
        const spent = expenses.reduce(
          (sum: number, exp: any) => sum + (parseFloat(exp?.total) || 0),
          0,
        );
        this.rendicionSpent.set(spent);
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

  /** Categorías asignadas al colaborador cuyo nombre contiene "planilla de movilidad" (sin distinguir mayúsculas/minúsculas). */
  get movilidadCategories(): ICategory[] {
    return this.categories.filter((c) => (c.name || '').toLowerCase().includes('planilla de movilidad'));
  }

  /** Se muestra el selector solo cuando hay más de una categoría de planilla de movilidad asignada. */
  get showMovilidadCategorySelect(): boolean {
    return (
      this.expenseType() === 'planilla_movilidad' &&
      !this.isDirectaPlanilla() &&
      this.movilidadCategories.length > 1
    );
  }

  /**
   * Si el colaborador tiene una única categoría "Planilla de movilidad" asignada, se
   * asigna internamente sin mostrar selector. Si tiene más de una, queda pendiente de
   * elección (selector requerido). Si no tiene ninguna, no se completa (bloquea el guardado).
   */
  private applyMovilidadCategoryDefault(): void {
    if (this.expenseType() !== 'planilla_movilidad' || this.isDirectaPlanilla()) return;
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
      declaracionJurada: [false],
      declaracionJuradaFirmante: [''],
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

  setExpenseType(type: ExpenseType) {
    this.expenseType.set(type);
    // Limpiar archivo al cambiar de tipo para evitar adjuntos cruzados
    this.selectedFile = undefined as any;
    this.previewImage = null;
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
    // Categoría: en planilla de movilidad (no directa) se resuelve entre las
    // categorías "Planilla de movilidad" asignadas al colaborador (ver
    // applyMovilidadCategoryDefault). En planilla directa vive en cada fila.
    // Requerida en el resto de tipos de gasto.
    const catCtrl = this.form.get('categoryId');
    if (catCtrl && !catCtrl.disabled) {
      const isPlanilla = this.expenseType() === 'planilla_movilidad';
      if (isPlanilla && !this.isDirectaPlanilla()) {
        this.applyMovilidadCategoryDefault();
      } else {
        catCtrl.setValidators(isPlanilla ? [] : [Validators.required]);
        catCtrl.updateValueAndValidity({ emitEvent: false });
      }
    }
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
        // En planilla directa la categoría vive en cada fila (cubierta por mobilityRowsArray.valid).
        const categoryOk = this.isDirectaPlanilla() || this.form.get('categoryId')?.valid === true;
        // El colaborador debe tener al menos una categoría de Planilla de movilidad asignada.
        const movilidadCategoryOk = this.isDirectaPlanilla() || this.movilidadCategories.length > 0;
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
        const isDJ = sub === 'DJ';
        const isBV = sub === 'BV';
        const rucEmisorOk = !!(this.form.get('rucEmisor')?.value || '').toString().trim();
        const bvDocOk = !isBV || (
          rucEmisorOk &&
          !!(this.form.get('serie')?.value || '').toString().trim() &&
          !!(this.form.get('correlativo')?.value || '').toString().trim()
        );
        // RUC Emisor obligatorio para TK, BV y RC (todos los sub-tipos con documento físico)
        const rucOk = !this.otrosSubTipoMuestraDocumento() || rucEmisorOk;
        return (
          proyectOk &&
          this.form.get('categoryId')?.valid === true &&
          // DJ requiere checkbox; otros sub-tipos no
          (!!this.id || !isDJ || !!this.form.get('declaracionJurada')?.value) &&
          (this.form.get('totalOtros')?.value > 0) &&
          // El adjunto es obligatorio al crear (todos los sub-tipos)
          (!!this.id || !!this.selectedFile) &&
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
    if (!this.isDirectaPlanilla() && this.movilidadCategories.length === 0) {
      this.notificationService.show(
        'No tienes asignada ninguna categoría de Planilla de movilidad. Contacta a un administrador para que te asigne una.',
        'error'
      );
      return;
    }
    const proyectCtrl = this.form.get('proyectId');
    const proyectOk = !!(proyectCtrl?.disabled || proyectCtrl?.valid);
    // En planilla directa proyecto y categoría viven en cada fila; el selector superior se omite.
    const categoryOk = this.isDirectaPlanilla() || !!this.form.get('categoryId')?.valid;
    // El formato oficial (ADF-FOR-005) exige la Orden de Trabajo junto al Centro de Costo.
    const otOk = !!this.form.get('ordenTrabajoId')?.value;
    if (!proyectOk || !categoryOk || !otOk) {
      this.notificationService.show('Completa los campos requeridos (incluida la Orden de Trabajo)', 'error');
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
      const expenseCategoryId = this.isDirectaContext()
        ? (rows.find((r: any) => r.categoryId)?.categoryId || '')
        : this.form.get('categoryId')?.value;
      const payload = {
        proyectId: expenseProjectId,
        ordenTrabajoId: this.form.get('ordenTrabajoId')?.value,
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

  saveOtherExpense() {
    const declaracionJurada = this.form.get('declaracionJurada')?.value;
    const total = this.form.get('totalOtros')?.value;
    const description = this.form.get('description')?.value;
    const subTipo = this.otrosSubTipo();
    const isDJ = subTipo === 'DJ';

    const proyectCtrl = this.form.get('proyectId');
    const proyectOk = !!(proyectCtrl?.disabled || proyectCtrl?.valid);
    if (!proyectOk || !this.form.get('categoryId')?.valid) {
      this.notificationService.show('Completa los campos requeridos', 'error');
      return;
    }
    const currentUser = this.userStateService.getUser();

    // Solo DJ requiere firma y DJ checkbox
    if (isDJ) {
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

    const firmante = isDJ ? (currentUser?.name || '').trim() : '';
    if (!total || total <= 0) {
      this.notificationService.show('Ingresa un monto válido', 'error');
      return;
    }

    // El adjunto es obligatorio para todos los sub-tipos de otros gastos
    if (!this.selectedFile) {
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
        declaracionJurada: isDJ ? true : false,
        declaracionJuradaFirmante: isDJ ? firmante : undefined,
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
        const isPdf = this.isPdfFile(this.selectedFile);
        if (isPdf) {
          this.uploadPdfDirectly();
        } else {
          this.uploadFile();
        }
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
      const description = (formValue.description || '').trim();
      payload.description = description;
      payload.total = Number(formValue.totalOtros) || 0;
      const muestraDoc = this.otrosSubTipoMuestraDocumento();
      const { serie: _s, correlativo: _c, rucEmisor: _r, ...prevWithoutDoc } = previousData || {};
      const dataObj = {
        ...prevWithoutDoc,
        description,
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
        this.previewImage = this.sanitizer.bypassSecurityTrustUrl(
          URL.createObjectURL(this.selectedFile)
        );
      } else {
        this.previewImage = null;
      }
      this.form.patchValue({ file: this.selectedFile });
    }
  }

  uploadFile() {
    this.percentage.set(10);
    const { uploadProgress$, downloadUrl$ } = this.uploadService.uploadFile(
      this.selectedFile,
      environment.storagePath
    );
    uploadProgress$.subscribe((progress) => {
      if (progress === 0) {
        progress = 10;
      }
      this.percentage.set(Math.round(progress));
    });
    downloadUrl$.subscribe({
      next: (url) => {
        this.form.patchValue({ file: url });
        this.save();
      },
      error: (error) => {
        this.isLoading.set(false);
        this.notificationService.show(
          'Error al subir el archivo: ' + error.message,
          'error'
        );
      },
    });
  }

  private uploadPdfDirectly() {
    const formData = new FormData();
    formData.append('file', this.selectedFile);
    formData.append('proyectId', this.form.get('proyectId')?.value);
    formData.append('categoryId', this.form.get('categoryId')?.value);
    formData.append('status', 'pending');
    if (this.rendicionId) {
      formData.append('expenseReportId', this.rendicionId);
    }

    this.percentage.set(10);
    this.invoiceService.analyzePdf(formData).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res && res._id) {
          let dataObj: any = {};
          if (res.data) {
            try {
              dataObj = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
            } catch {}
          }
          if (dataObj?.rucEmisor || dataObj?.fechaEmision || dataObj?.serie || dataObj?.correlativo || dataObj?.comentario) {
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
            this.postOcrInvoiceId.set(res._id);
            this.postOcrBaseInvoice = res;
            this.ocrTotalAmount.set(parseFloat(String(res.total)) || 0);
            this.isEditingOcrAmount.set(false);
            this.editedOcrTotal.set(null);
            // VD-70: capturar el resultado SUNAT del escaneo para bloquear el
            // guardado si no es válido.
            this.sunatStatus.set(dataObj?.sunatValidation?.status ?? null);
            this.showPostOcrReview.set(true);
            this.notifySunatStatus(this.sunatStatus());
          } else {
            this.notificationService.show('Factura PDF analizada correctamente', 'success');
            this.navigateAfterExpenseSave();
          }
        } else {
          this.notificationService.show('Factura PDF analizada correctamente', 'success');
          this.navigateAfterExpenseSave();
        }
      },
      error: (error) => {
        this.isLoading.set(false);
      },
    });
  }

  save() {
    if (this.form.valid) {
      const payload = {
        categoryId: this.form.get('categoryId')?.value,
        proyectId: this.form.get('proyectId')?.value,
        imageUrl: this.form.get('file')?.value,
        status: 'pending' as InvoiceStatus,
        expenseReportId: this.rendicionId
      };

      this.invoiceService.analyzeInvoice(payload).subscribe({
        next: (res) => {
          if (res && res._id) {
            let dataObj: any = {};
            if (res.data) {
              try {
                dataObj =
                  typeof res.data === 'string'
                    ? JSON.parse(res.data)
                    : res.data;
              } catch {}
            }

            if (
              dataObj?.rucEmisor ||
              dataObj?.fechaEmision ||
              dataObj?.serie ||
              dataObj?.correlativo ||
              dataObj?.comentario
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
              this.postOcrInvoiceId.set(res._id);
              this.postOcrBaseInvoice = res;
              this.ocrTotalAmount.set(parseFloat(String(res.total)) || 0);
              this.isEditingOcrAmount.set(false);
              this.editedOcrTotal.set(null);
              // VD-70: capturar el resultado SUNAT del escaneo para bloquear el
              // guardado si no es válido.
              this.sunatStatus.set(dataObj?.sunatValidation?.status ?? null);
              this.showPostOcrReview.set(true);
              this.isLoading.set(false);
              this.notifySunatStatus(this.sunatStatus());
            } else {
              this.isLoading.set(false);
              this.notificationService.show(
                'Factura subida correctamente',
                'success'
              );
              this.notifyCategoryLimitWarning(res);
              this.navigateAfterExpenseSave();
            }
          } else {
            this.isLoading.set(false);
            this.notificationService.show(
              'Factura subida correctamente',
              'success'
            );
            this.notifyCategoryLimitWarning(res);
            this.navigateAfterExpenseSave();
          }
        },
        error: (error) => {
          this.isLoading.set(false);
        },
      });
    } else {
      this.isLoading.set(false);
      this.notificationService.show(
        'Por favor complete todos los campos requeridos',
        'error'
      );
    }
  }

  confirmPostOcrReview() {
    const invoiceId = this.postOcrInvoiceId();
    if (!invoiceId || !this.postOcrBaseInvoice) return;
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
    const formValue = this.form.value;
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
      ...(razonSocialOcr !== undefined ? { razonSocial: razonSocialOcr } : {}),
      ...(this.ocrAmountWasEdited ? { amountEdited: true, originalOcrTotal: this.ocrTotalAmount() } : {}),
    };
    const updatePayload = {
      proyectId: this.postOcrBaseInvoice.proyectId,
      categoryId: this.postOcrBaseInvoice.categoryId,
      total: finalTotal,
      data: JSON.stringify(dataObj),
      fechaEmision: dataObj.fechaEmision,
      status: this.postOcrBaseInvoice.status,
      comentario,
      placaVehiculo: dataObj.placaVehiculo,
    };

    this.isLoading.set(true);
    this.invoiceService.updateInvoice(invoiceId, updatePayload).subscribe({
      next: () => {
        // SUNAT ya se validó en el panel (VD-70: guarda bloqueada hasta
        // VALIDO_ACEPTADO), así que aquí solo se persiste y navega.
        this.isLoading.set(false);
        this.notificationService.show('Factura guardada correctamente', 'success');
        this.notifyCategoryLimitWarning(this.postOcrBaseInvoice);
        this.navigateAfterExpenseSave();
      },
      error: (error) => {
        this.isLoading.set(false);
        this.notificationService.show(
          'Error al guardar datos OCR: ' + (error.error?.message || error.message),
          'error'
        );
      },
    });
  }

  openInvoice() {
    if (this.previewImage) {
      window.open(this.previewImage as string, '_blank');
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

  /** Id del centro de costo de una OT (soporta el ref poblado o el id plano). */
  private otCostCenterId(ot: IOrdenTrabajo): string {
    const cc = ot.costCenterId;
    return cc && typeof cc === 'object' ? String(cc._id ?? '') : String(cc ?? '');
  }

  /** OTs a mostrar: solo las del centro de costo (proyecto) elegido. */
  get filteredOrdenesTrabajo(): IOrdenTrabajo[] {
    const pid = this.form.get('proyectId')?.value;
    if (!pid) return [];
    return this.ordenesTrabajo.filter((ot) => this.otCostCenterId(ot) === pid);
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
