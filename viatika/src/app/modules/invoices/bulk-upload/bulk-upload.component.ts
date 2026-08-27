import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { from, of } from 'rxjs';
import { catchError, concatMap, mergeMap, tap } from 'rxjs/operators';

import { InvoicesService } from '../services/invoices.service';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { ExpenseService } from '../../../services/expense.service';
import { UserStateService } from '../../../services/user-state.service';
import { UploadService } from '../../../services/upload.service';
import { NotificationService } from '../../../services/notification.service';
import { OrdenTrabajoService } from '../../../services/orden-trabajo.service';
import { environment } from '../../../../environments/environment';

import { ICategory } from '../interfaces/category.interface';
import { IProject } from '../interfaces/project.interface';
import {
  IOrdenTrabajo,
  otPerteneceACentroCosto,
} from '../../../interfaces/orden-trabajo.interface';

import { ButtonComponent } from '../../../design-system/button/button.component';
import { IconComponent } from '../../../design-system/icon/icon.component';
import { BadgeComponent } from '../../../design-system/badge/badge.component';
import { InputComponent } from '../../../design-system/input/input.component';
import { FormFieldComponent } from '../../../design-system/form-field/form-field.component';
import { ProjectSelectComponent } from '../../../design-system/project-select/project-select.component';
import {
  SearchSelectComponent,
  SearchSelectOption,
} from '../../../design-system/search-select/search-select.component';
import { FileDropDirective } from '../../../design-system/file-drop/file-drop.directive';

import {
  TIPOS_COMPROBANTE,
  SUNAT_STATUS_VALIDO,
  sunatStatusMessage,
  normalizeTipoComprobante,
  deriveTipoFromSerie,
  formatDateForInput,
  formatDateForBackend,
  puedeValidarConSunat,
} from '../utils/comprobante-scan.util';
import { monedaSymbol, normalizeMonedaCode } from '../../../constants/moneda';

/** Etapa en la que está cada archivo del lote. */
export type BulkItemState =
  | 'pendiente'
  | 'leyendo'
  | 'leido'
  | 'error_lectura'
  | 'guardando'
  | 'guardado';

/**
 * Un comprobante del lote. Reemplaza al formulario reactivo de `add-invoice`:
 * acá hay N comprobantes en pantalla a la vez y cada uno lleva su propio estado
 * de OCR, de SUNAT y de guardado.
 */
export interface BulkInvoiceItem {
  id: number;
  file: File;
  fileName: string;
  isPdf: boolean;
  previewUrl: SafeUrl | null;
  objectUrl: string | null;

  state: BulkItemState;
  errorMessage: string;

  /** `data` crudo del OCR: se reenvía al crear para no perder lo que no se edita. */
  baseData: any;
  total: number;
  /** Espejo de `total` como texto, porque `app-input` trabaja con strings. */
  totalTexto: string;
  moneda: string;

  rucEmisor: string;
  razonSocial: string;
  serie: string;
  correlativo: string;
  fechaEmision: string;
  tipoComprobante: string;
  comentario: string;

  sunatStatus: string | null;
  sunatValidation: any;
  isValidating: boolean;

  /** Clasificación que pone el usuario. */
  categoryId: string;
  /** Solo caja chica: centro de costo, OT y firma se eligen por comprobante. */
  proyectId: string;
  ordenTrabajoId: string;
  firmaUrl: string;
  firmaFileName: string;
  isUploadingFirma: boolean;

  open: boolean;
  selected: boolean;
}

@Component({
  selector: 'app-bulk-upload',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    IconComponent,
    BadgeComponent,
    InputComponent,
    FormFieldComponent,
    ProjectSelectComponent,
    SearchSelectComponent,
    FileDropDirective,
  ],
  templateUrl: './bulk-upload.component.html',
  styleUrl: './bulk-upload.component.scss',
})
export class BulkUploadComponent implements OnInit, OnDestroy {
  private invoiceService = inject(InvoicesService);
  private expenseReportsService = inject(ExpenseReportsService);
  private expenseService = inject(ExpenseService);
  private userStateService = inject(UserStateService);
  private ordenTrabajoService = inject(OrdenTrabajoService);
  private uploadService = inject(UploadService);
  private notificationService = inject(NotificationService);
  private sanitizer = inject(DomSanitizer);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /** Tope por lote: cada archivo consume una llamada de OCR y una de SUNAT. */
  readonly MAX_ARCHIVOS = 15;
  /** Mismo tope que `MAX_ARCHIVO_ANALISIS` en el backend. */
  readonly MAX_TAMANO_BYTES = 10 * 1024 * 1024;
  /** Archivos leídos en paralelo. Más que esto satura el OCR sin ganar tiempo. */
  private readonly LECTURAS_EN_PARALELO = 2;

  readonly TIPOS_COMPROBANTE = TIPOS_COMPROBANTE;
  readonly ACCEPT = '.pdf,.jpg,.jpeg,.png';

  items: BulkInvoiceItem[] = [];
  categories: ICategory[] = [];
  projects: IProject[] = [];
  ordenesTrabajo: IOrdenTrabajo[] = [];

  rendicionId: string | null = null;
  isDirectaMode = false;
  fromContabilidad = false;
  isCajaChica = signal(false);
  isDirectaReport = signal(false);

  /**
   * Centro de costo del lote completo. Fuera de caja chica el comprobante no lo
   * elige: viene de la rendición (fijo) o, en una directa que todavía no existe,
   * se elige una vez para todo el lote.
   */
  loteProyectId = '';
  /** True cuando el centro de costo lo fija la rendición y no se puede cambiar. */
  proyectoBloqueado = signal(false);
  nombreRendicion = signal('');

  isScanning = signal(false);
  isSaving = signal(false);
  scannedCount = signal(0);
  savedCount = signal(0);

  private nextId = 1;

  // ─── Ciclo de vida ────────────────────────────────────────────────

  ngOnInit(): void {
    this.rendicionId = this.route.snapshot.queryParamMap.get('rendicionId');
    this.isDirectaMode =
      this.route.snapshot.queryParamMap.get('mode') === 'directa';
    this.fromContabilidad =
      this.route.snapshot.queryParamMap.get('from') === 'contabilidad' ||
      this.userStateService.isContabilidad();
    this.loadCategories();
    this.loadProjects();
    this.loadOrdenesTrabajo();
    if (this.rendicionId) this.loadRendicion();
  }

  ngOnDestroy(): void {
    this.items.forEach((i) => this.releasePreview(i));
  }

  // ─── Carga de catálogos y contexto ────────────────────────────────

  private loadCategories(): void {
    this.invoiceService.getCategories().subscribe({
      next: (categories) => (this.categories = categories || []),
      error: () => (this.categories = []),
    });
  }

  private loadProjects(): void {
    this.invoiceService.getProjects().subscribe({
      next: (projects) => (this.projects = projects || []),
      error: () => (this.projects = []),
    });
  }

  private loadOrdenesTrabajo(): void {
    this.ordenTrabajoService.getAll().subscribe({
      next: (list) =>
        (this.ordenesTrabajo = (list || []).filter((o) => o.isActive !== false)),
      error: () => (this.ordenesTrabajo = []),
    });
  }

  /**
   * Resuelve el contexto del lote a partir de la rendición: caja chica pide
   * centro de costo, OT y firma por comprobante; el resto los hereda de la
   * rendición y no se pueden cambiar acá.
   */
  private loadRendicion(): void {
    this.expenseReportsService.findOne(this.rendicionId!).subscribe({
      next: (report: any) => {
        this.nombreRendicion.set(report?.codigo || report?.motivo || '');
        const esCajaChica = !!report?.isCajaChica;
        this.isCajaChica.set(esCajaChica);
        this.isDirectaReport.set(!!report?.isDirecta);

        if (esCajaChica) {
          // El centro de costo de la caja precarga el de cada comprobante, pero
          // cada uno puede ir a un centro distinto.
          this.expenseReportsService
            .findCajaChicaCentroCosto(this.rendicionId!)
            .subscribe({
              next: ({ projectId }) => {
                if (projectId) {
                  this.loteProyectId = projectId;
                  this.items.forEach((i) => {
                    if (!i.proyectId) i.proyectId = projectId;
                  });
                }
              },
              error: () => {},
            });
          return;
        }

        if (report?.projectId) {
          this.loteProyectId =
            typeof report.projectId === 'string'
              ? report.projectId
              : report.projectId._id;
          this.proyectoBloqueado.set(true);
        }
      },
      error: () => {
        this.notificationService.show(
          'No se pudo cargar la rendición. Vuelve a intentarlo.',
          'error'
        );
      },
    });
  }

  // ─── Selección de archivos ────────────────────────────────────────

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files || []));
    // Sin esto, volver a elegir el mismo archivo no dispara el evento.
    input.value = '';
  }

  onFilesDropped(files: File[]): void {
    this.addFiles(files);
  }

  onFilesRejected(files: File[]): void {
    this.notificationService.show(
      `"${files[0]?.name}" no es un formato admitido. Usa PDF, JPG o PNG.`,
      'error'
    );
  }

  /**
   * Agrega los archivos al lote y arranca su lectura. Descarta con aviso los que
   * no caben: en silencio el usuario creería que se subieron todos.
   */
  private addFiles(files: File[]): void {
    if (!files.length) return;

    const rechazadosPorTamano: string[] = [];
    const admitidos: File[] = [];
    for (const file of files) {
      if (file.size > this.MAX_TAMANO_BYTES) {
        rechazadosPorTamano.push(file.name);
        continue;
      }
      admitidos.push(file);
    }
    if (rechazadosPorTamano.length) {
      this.notificationService.show(
        `${rechazadosPorTamano.length === 1 ? 'El archivo' : 'Los archivos'} ` +
          `${rechazadosPorTamano.join(', ')} ${rechazadosPorTamano.length === 1 ? 'pesa' : 'pesan'} ` +
          `más de 10 MB y no se ${rechazadosPorTamano.length === 1 ? 'cargó' : 'cargaron'}.`,
        'error'
      );
    }

    const espacio = this.MAX_ARCHIVOS - this.items.length;
    if (espacio <= 0) {
      this.notificationService.show(
        `El lote ya tiene ${this.MAX_ARCHIVOS} comprobantes. Guarda estos antes de agregar más.`,
        'warning'
      );
      return;
    }
    const nuevos = admitidos.slice(0, espacio);
    if (admitidos.length > espacio) {
      this.notificationService.show(
        `Solo caben ${this.MAX_ARCHIVOS} comprobantes por lote: se agregaron ${espacio} y ` +
          `${admitidos.length - espacio} quedaron fuera.`,
        'warning'
      );
    }

    const creados = nuevos.map((file) => this.buildItem(file));
    this.items = [...this.items, ...creados];
    this.scanItems(creados);
  }

  private buildItem(file: File): BulkInvoiceItem {
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    // El PDF también lleva object URL: no se puede incrustar como imagen, pero
    // sí abrirse en otra pestaña, que es la única forma de revisarlo antes de
    // corregir los datos que leyó mal el OCR.
    const objectUrl = URL.createObjectURL(file);
    return {
      id: this.nextId++,
      file,
      fileName: file.name,
      isPdf,
      objectUrl,
      previewUrl: isPdf
        ? null
        : this.sanitizer.bypassSecurityTrustUrl(objectUrl),
      state: 'pendiente',
      errorMessage: '',
      baseData: {},
      total: 0,
      totalTexto: '',
      moneda: '',
      rucEmisor: '',
      razonSocial: '',
      serie: '',
      correlativo: '',
      fechaEmision: '',
      tipoComprobante: 'Factura',
      comentario: '',
      sunatStatus: null,
      sunatValidation: null,
      isValidating: false,
      categoryId: '',
      proyectId: this.isCajaChica() ? this.loteProyectId : '',
      ordenTrabajoId: '',
      firmaUrl: '',
      firmaFileName: '',
      isUploadingFirma: false,
      open: false,
      selected: false,
    };
  }

  private releasePreview(item: BulkInvoiceItem): void {
    if (item.objectUrl) {
      URL.revokeObjectURL(item.objectUrl);
      item.objectUrl = null;
      item.previewUrl = null;
    }
  }

  // ─── Lectura (OCR + SUNAT) ────────────────────────────────────────

  /**
   * Lee los archivos de a `LECTURAS_EN_PARALELO`. Cada uno resuelve por su
   * cuenta: un archivo ilegible no detiene a los demás, queda marcado y el
   * usuario completa sus datos a mano.
   */
  private scanItems(items: BulkInvoiceItem[]): void {
    if (!items.length) return;
    this.isScanning.set(true);
    from(items)
      .pipe(
        mergeMap((item) => this.scanOne(item), this.LECTURAS_EN_PARALELO)
      )
      .subscribe({
        complete: () => this.isScanning.set(false),
      });
  }

  private scanOne(item: BulkInvoiceItem) {
    item.state = 'leyendo';
    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('status', 'pending');
    if (this.rendicionId) formData.append('expenseReportId', this.rendicionId);

    const scan$ = item.isPdf
      ? this.invoiceService.analyzePdf(formData)
      : this.invoiceService.analyzeInvoice(formData);

    return scan$.pipe(
      tap((res) => this.applyScanResult(item, res)),
      catchError((error) => {
        item.state = 'error_lectura';
        item.errorMessage =
          error?.error?.message ||
          error?.message ||
          'No se pudo leer el comprobante.';
        this.scannedCount.set(this.scannedCount() + 1);
        return of(null);
      })
    );
  }

  private applyScanResult(item: BulkInvoiceItem, res: any): void {
    let dataObj: any = {};
    if (res?.data) {
      try {
        dataObj = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      } catch {
        dataObj = {};
      }
    }

    item.baseData = dataObj;
    item.total = parseFloat(String(res?.total)) || 0;
    item.totalTexto = item.total ? String(item.total) : '';
    item.moneda = normalizeMonedaCode(dataObj?.moneda);
    item.rucEmisor = dataObj.rucEmisor || '';
    item.razonSocial = dataObj.razonSocial || '';
    item.serie = dataObj.serie || '';
    item.correlativo = dataObj.correlativo || '';
    item.fechaEmision = formatDateForInput(dataObj.fechaEmision);
    // El prefijo de la serie manda sobre el texto del OCR (más fiable).
    item.tipoComprobante =
      deriveTipoFromSerie(dataObj.serie) ??
      normalizeTipoComprobante(dataObj.tipoComprobante);
    item.comentario = dataObj.comentario || '';
    item.sunatValidation = dataObj?.sunatValidation ?? null;
    item.sunatStatus = dataObj?.sunatValidation?.status ?? null;

    const leyoAlgo =
      item.rucEmisor || item.serie || item.correlativo || item.fechaEmision;
    if (leyoAlgo) {
      item.state = 'leido';
      item.errorMessage = '';
    } else {
      item.state = 'error_lectura';
      item.errorMessage =
        'No se pudieron extraer los datos. Complétalos y valida con SUNAT.';
      // Se abre solo: sin datos no hay nada que revisar desde la fila.
      item.open = true;
    }
    this.scannedCount.set(this.scannedCount() + 1);
  }

  /** Reajusta el tipo cuando el usuario corrige la serie. */
  onSerieChange(item: BulkInvoiceItem): void {
    const derived = deriveTipoFromSerie(item.serie);
    if (derived) item.tipoComprobante = derived;
  }

  /** El total se edita como texto; el payload y los totales usan el número. */
  onTotalChange(item: BulkInvoiceItem, valor: string): void {
    item.totalTexto = valor;
    const parsed = parseFloat((valor || '').replace(',', '.'));
    item.total = isNaN(parsed) ? 0 : parsed;
  }

  /** Revalida un comprobante con SUNAT tras corregir sus datos. */
  revalidate(item: BulkInvoiceItem): void {
    if (!puedeValidarConSunat(item)) {
      this.notificationService.show(
        'Completa RUC, serie, correlativo y fecha para validar con SUNAT.',
        'error'
      );
      return;
    }
    item.isValidating = true;
    this.invoiceService
      .validateSunatStateless({
        rucEmisor: item.rucEmisor,
        serie: item.serie,
        correlativo: item.correlativo,
        fechaEmision: formatDateForBackend(item.fechaEmision),
        montoTotal: item.total,
        tipoComprobante: item.tipoComprobante || 'Factura',
      })
      .subscribe({
        next: (response: any) => {
          item.isValidating = false;
          item.sunatValidation = response ?? null;
          item.sunatStatus = response?.status ?? null;
          if (item.state === 'error_lectura' && item.sunatStatus) {
            item.state = 'leido';
            item.errorMessage = '';
          }
          this.notificationService.show(
            sunatStatusMessage(item.sunatStatus),
            item.sunatStatus === SUNAT_STATUS_VALIDO ? 'success' : 'error'
          );
        },
        error: () => {
          item.isValidating = false;
          item.sunatStatus = 'ERROR_SUNAT';
          this.notificationService.show(
            'Error al validar con SUNAT. Revisa los datos e intenta nuevamente.',
            'error'
          );
        },
      });
  }

  // ─── Estado por comprobante ───────────────────────────────────────

  sunatEsValido(item: BulkInvoiceItem): boolean {
    return item.sunatStatus === SUNAT_STATUS_VALIDO;
  }

  /** Símbolo de la moneda que leyó el OCR ('S/' salvo comprobante en dólares). */
  simbolo(item: BulkInvoiceItem): string {
    return monedaSymbol(item.moneda);
  }

  sunatMensaje(item: BulkInvoiceItem): string {
    return sunatStatusMessage(item.sunatStatus);
  }

  /** Motivo por el que un comprobante todavía no se puede guardar, o cadena vacía. */
  faltaEn(item: BulkInvoiceItem): string {
    if (item.state === 'guardado') return '';
    if (item.state === 'leyendo') return 'Leyendo el comprobante…';
    if (!this.sunatEsValido(item)) return 'SUNAT no lo validó';
    if (!item.categoryId) return 'Falta la categoría';
    if (!(item.comentario || '').trim()) return 'Falta el comentario';
    if (this.isCajaChica() && !item.firmaUrl) return 'Falta la firma';
    if (!this.isCajaChica() && !this.loteProyectId)
      return 'Falta el centro de costo del lote';
    return '';
  }

  estaListo(item: BulkInvoiceItem): boolean {
    return item.state !== 'guardado' && this.faltaEn(item) === '';
  }

  get listos(): BulkInvoiceItem[] {
    return this.items.filter((i) => this.estaListo(i));
  }

  get pendientes(): BulkInvoiceItem[] {
    return this.items.filter(
      (i) => i.state !== 'guardado' && !this.estaListo(i)
    );
  }

  get guardados(): BulkInvoiceItem[] {
    return this.items.filter((i) => i.state === 'guardado');
  }

  get sinCategoria(): number {
    return this.items.filter((i) => i.state !== 'guardado' && !i.categoryId)
      .length;
  }

  get conProblemaSunat(): number {
    return this.items.filter(
      (i) => i.state !== 'guardado' && !this.sunatEsValido(i)
    ).length;
  }

  get totalLote(): number {
    return this.items
      .filter((i) => i.state !== 'guardado')
      .reduce((acc, i) => acc + (i.total || 0), 0);
  }

  // ─── Selección múltiple ───────────────────────────────────────────

  get seleccionados(): BulkInvoiceItem[] {
    return this.items.filter((i) => i.selected && i.state !== 'guardado');
  }

  get todosSeleccionados(): boolean {
    const asignables = this.items.filter((i) => i.state !== 'guardado');
    return asignables.length > 0 && asignables.every((i) => i.selected);
  }

  toggleSeleccionTodos(checked: boolean): void {
    this.items.forEach((i) => {
      if (i.state !== 'guardado') i.selected = checked;
    });
  }

  limpiarSeleccion(): void {
    this.items.forEach((i) => (i.selected = false));
  }

  /** Aplica una categoría, centro de costo u OT a todos los seleccionados. */
  asignarASeleccionados(campo: 'categoryId' | 'proyectId' | 'ordenTrabajoId', valor: string): void {
    if (!valor) return;
    const objetivo = this.seleccionados;
    objetivo.forEach((i) => {
      i[campo] = valor;
      // Cambiar el centro de costo puede dejar la OT fuera de él.
      if (campo === 'proyectId') this.limpiarOtSiNoPertenece(i);
    });
    this.limpiarSeleccion();
    this.notificationService.show(
      `Se aplicó a ${objetivo.length} comprobante${objetivo.length === 1 ? '' : 's'}.`,
      'success'
    );
  }

  // ─── Centro de costo, OT y firma (caja chica) ─────────────────────

  onProyectoItemChange(item: BulkInvoiceItem): void {
    this.limpiarOtSiNoPertenece(item);
  }

  private limpiarOtSiNoPertenece(item: BulkInvoiceItem): void {
    if (!item.ordenTrabajoId) return;
    const pertenece = this.ordenesTrabajo.some(
      (ot) =>
        ot._id === item.ordenTrabajoId &&
        otPerteneceACentroCosto(ot, item.proyectId || '')
    );
    if (!pertenece) item.ordenTrabajoId = '';
  }

  /** Sube la firma de quien recibió el dinero por ese comprobante. */
  onFirmaSelected(event: Event, item: BulkInvoiceItem): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    item.isUploadingFirma = true;
    this.uploadService.upload(file, 'raw').subscribe({
      next: (res) => {
        item.firmaUrl = res.url;
        item.firmaFileName = file.name;
        item.isUploadingFirma = false;
      },
      error: () => {
        item.isUploadingFirma = false;
        this.notificationService.show('No se pudo subir la firma.', 'error');
      },
    });
  }

  /** Copia la firma de un comprobante a todos los seleccionados. */
  aplicarFirmaASeleccionados(item: BulkInvoiceItem): void {
    if (!item.firmaUrl) return;
    const objetivo = this.seleccionados;
    if (!objetivo.length) {
      this.notificationService.show(
        'Marca los comprobantes a los que quieres copiar la firma.',
        'warning'
      );
      return;
    }
    objetivo.forEach((i) => {
      i.firmaUrl = item.firmaUrl;
      i.firmaFileName = item.firmaFileName;
    });
    this.limpiarSeleccion();
    this.notificationService.show(
      `Firma copiada a ${objetivo.length} comprobante${objetivo.length === 1 ? '' : 's'}.`,
      'success'
    );
  }

  // ─── Opciones de los selectores ───────────────────────────────────

  get categoryOptions(): SearchSelectOption[] {
    return this.categories.map((c) => ({
      value: c._id ?? '',
      label: c.name,
      subLabel: c.cuenta || '',
      searchText: c.description || '',
    }));
  }

  /** OTs del centro de costo del comprobante (caja chica) o del lote. */
  ordenTrabajoOptions(item: BulkInvoiceItem): SearchSelectOption[] {
    const pid = this.isCajaChica() ? item.proyectId : this.loteProyectId;
    if (!pid) return [];
    return this.ordenesTrabajo
      .filter((ot) => otPerteneceACentroCosto(ot, pid))
      .map((ot) => ({ value: ot._id ?? '', label: ot.nombre }));
  }

  // ─── Filas ────────────────────────────────────────────────────────

  toggleFila(item: BulkInvoiceItem): void {
    item.open = !item.open;
  }

  quitar(item: BulkInvoiceItem): void {
    this.releasePreview(item);
    this.items = this.items.filter((i) => i.id !== item.id);
  }

  abrirArchivo(item: BulkInvoiceItem): void {
    if (item.objectUrl) {
      window.open(item.objectUrl, '_blank', 'noopener,noreferrer');
    }
  }

  // ─── Guardado ─────────────────────────────────────────────────────

  /**
   * Guarda los comprobantes listos uno por uno: subida del archivo y alta. Los
   * que no están listos se quedan en la lista — un comprobante que SUNAT
   * rechazó no debe bloquear a los otros cinco del viaje.
   */
  guardarListos(): void {
    const aGuardar = this.listos;
    if (!aGuardar.length) return;
    this.isSaving.set(true);
    this.savedCount.set(0);
    let fallidos = 0;

    from(aGuardar)
      .pipe(
        concatMap((item) =>
          this.saveOne(item).pipe(
            catchError((error) => {
              fallidos++;
              item.state = 'leido';
              item.errorMessage =
                error?.error?.message ||
                error?.message ||
                'No se pudo guardar el comprobante.';
              return of(null);
            })
          )
        )
      )
      .subscribe({
        complete: () => {
          this.isSaving.set(false);
          const ok = this.savedCount();
          if (ok > 0) {
            this.notificationService.show(
              `${ok} comprobante${ok === 1 ? '' : 's'} agregado${ok === 1 ? '' : 's'} a la rendición.`,
              'success'
            );
          }
          if (fallidos > 0) {
            this.notificationService.show(
              `${fallidos} comprobante${fallidos === 1 ? '' : 's'} no se pudo guardar. Revisa el detalle de cada uno.`,
              'error'
            );
          }
          if (ok > 0 && this.items.every((i) => i.state === 'guardado')) {
            this.navigateAfterSave();
          }
        },
      });
  }

  private saveOne(item: BulkInvoiceItem) {
    item.state = 'guardando';
    item.errorMessage = '';
    const { downloadUrl$ } = this.uploadService.uploadFile(
      item.file,
      environment.storagePath
    );
    return downloadUrl$.pipe(
      concatMap((url: string) =>
        this.invoiceService.createInvoice(this.buildPayload(item, url))
      ),
      tap(() => {
        item.state = 'guardado';
        item.selected = false;
        item.open = false;
        this.releasePreview(item);
        this.savedCount.set(this.savedCount() + 1);
      })
    );
  }

  private buildPayload(item: BulkInvoiceItem, imageUrl: string): any {
    const fechaBackend = formatDateForBackend(item.fechaEmision);
    const comentario = (item.comentario || '').trim();
    const dataObj = {
      ...item.baseData,
      rucEmisor: item.rucEmisor || '',
      fechaEmision: fechaBackend,
      serie: item.serie || '',
      correlativo: item.correlativo || '',
      tipoComprobante: item.tipoComprobante || 'Factura',
      comentario,
      ...(item.razonSocial ? { razonSocial: item.razonSocial } : {}),
      ...(item.sunatValidation
        ? { sunatValidation: item.sunatValidation }
        : {}),
    };
    return {
      proyectId: this.isCajaChica()
        ? item.proyectId || undefined
        : this.loteProyectId || undefined,
      categoryId: item.categoryId,
      ordenTrabajoId: this.isCajaChica()
        ? item.ordenTrabajoId || undefined
        : undefined,
      total: item.total,
      data: JSON.stringify(dataObj),
      fechaEmision: fechaBackend,
      comentario,
      imageUrl,
      firmaUrl: this.isCajaChica() ? item.firmaUrl || undefined : undefined,
      expenseReportId: this.rendicionId || undefined,
    };
  }

  // ─── Navegación ───────────────────────────────────────────────────

  private rendicionTab(): 'viaticos' | 'directas' | 'caja-chica' {
    if (this.isCajaChica()) return 'caja-chica';
    if (this.isDirectaReport() || this.isDirectaMode) return 'directas';
    return 'viaticos';
  }

  /** Salida sin guardar: vuelve al mismo sitio del que se entró. */
  volver(): void {
    if (this.rendicionId) {
      this.router.navigate(['/mis-rendiciones', this.rendicionId, 'detalle'], {
        queryParams: { tab: this.rendicionTab() },
      });
      return;
    }
    if (this.fromContabilidad) {
      this.router.navigate(['/rendiciones'], {
        queryParams: { tab: 'directas' },
      });
      return;
    }
    if (this.isDirectaMode) {
      this.router.navigate(['/mis-rendiciones'], {
        queryParams: { tab: 'directas' },
      });
      return;
    }
    this.router.navigate(['/invoices']);
  }

  /**
   * Mismo destino que al guardar un comprobante suelto. La rendición directa sin
   * rendición previa además se autoenvía a contabilidad: sin eso el lote se
   * quedaría como gastos directos sin enviar, igual que pasaba antes de VD-36.
   */
  private navigateAfterSave(): void {
    if (!this.rendicionId && !this.fromContabilidad && this.isDirectaMode) {
      this.expenseService.submitMyDirectExpenses().subscribe({
        next: () => this.volver(),
        error: () => this.volver(),
      });
      return;
    }
    this.volver();
  }
}
