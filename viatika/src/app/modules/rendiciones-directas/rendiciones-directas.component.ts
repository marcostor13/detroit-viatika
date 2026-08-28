import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DEFAULT_MONEDA, monedaSymbol } from '../../constants/moneda';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { UserStateService } from '../../services/user-state.service';
import { InvoicesService } from '../invoices/services/invoices.service';
import { NotificationService } from '../../services/notification.service';
import { AdminUsersService } from '../admin-users/services/admin-users.service';
import { IUserResponse } from '../../interfaces/user.interface';
import { IProject } from '../invoices/interfaces/project.interface';
import { ICategory } from '../invoices/interfaces/category.interface';
import { OrdenTrabajoService } from '../../services/orden-trabajo.service';
import { IOrdenTrabajo } from '../../interfaces/orden-trabajo.interface';
import { WorkerSelectComponent, WorkerOption } from '../../design-system/worker-select/worker-select.component';
import {
  RendicionExportService,
  RendicionExportData,
  MobilitySheetExportData,
  ReceiptExportData,
} from '../../services/rendicion-export.service';
import {
  formatFechaEmisionDdMmYyyy,
  resolveExpenseFechaEmision,
} from '../../utils/fecha-emision.util';
import { ListFiltersService } from '../../services/list-filters.service';

@Component({
  selector: 'app-rendiciones-directas',
  standalone: true,
  imports: [CommonModule, FormsModule, WorkerSelectComponent],
  templateUrl: './rendiciones-directas.component.html',
})
export class RendicionesDirectasComponent implements OnInit {
  private expenseReportsService = inject(ExpenseReportsService);
  private userState = inject(UserStateService);
  private invoicesService = inject(InvoicesService);
  private notifications = inject(NotificationService);
  private exportService = inject(RendicionExportService);
  private router = inject(Router);
  private adminUsersService = inject(AdminUsersService);
  private ordenTrabajoService = inject(OrdenTrabajoService);
  private listFilters = inject(ListFiltersService);

  // Pestañas: "rendiciones" (una fila por rendición) y "gastos" (por comprobante).
  activeTab = signal<'rendiciones' | 'gastos'>('rendiciones');
  setTab(tab: 'rendiciones' | 'gastos'): void { this.activeTab.set(tab); }

  // Estado — pestaña Gastos (por comprobante)
  loading = signal(false);
  data = signal<any[]>([]);
  total = signal(0);
  pages = signal(0);

  // Estado — pestaña Rendiciones directas (por reporte)
  reports = signal<any[]>([]);
  loadingReports = signal(false);

  // Filtros
  filterDateFrom = '';
  filterDateTo = '';
  filterProjectId = '';
  filterCategoryId = '';
  filterDocNumber = '';
  filterTipo = '';
  filterUserId = '';
  // VD-135: estado y orden de trabajo. El centro de costo ya existía pero solo
  // se mostraba en la pestaña Gastos; ahora los tres aplican a las dos.
  filterStatus = '';
  filterOrdenTrabajoId = '';
  page = 1;
  readonly limit = 50;

  // Catálogos
  projects = signal<IProject[]>([]);
  categories = signal<ICategory[]>([]);
  ordenesTrabajo = signal<IOrdenTrabajo[]>([]);
  /**
   * Estados que de verdad aparecen en una rendición directa, en el orden del
   * flujo. No se listan todos los del enum: la mitad no ocurre en una directa y
   * un filtro con opciones que nunca devuelven nada se lee como que está roto.
   */
  readonly estadosDirecta: Array<{ value: string; label: string }> = [
    { value: 'open', label: 'Abierta' },
    { value: 'submitted', label: 'Enviada' },
    { value: 'pending_accounting', label: 'En contabilidad' },
    { value: 'approved', label: 'Aprobada' },
    { value: 'rejected', label: 'Rechazada' },
    { value: 'reimbursed', label: 'Reembolsada' },
    { value: 'closed', label: 'Cerrada' },
    { value: 'cancelled', label: 'Cancelada' },
  ];
  users = signal<IUserResponse[]>([]);
  /** VD-84: usuarios mapeados a WorkerOption para el selector buscable de colaborador. */
  workerOptions = computed<WorkerOption[]>(() =>
    this.users().map(u => ({ _id: u._id ?? '', name: u.name, email: u.email, dni: (u as any).dni }))
  );

  // Acciones
  approvingId = signal<string | null>(null);
  deletingId = signal<string | null>(null);
  confirmDeleteExpense = signal<any | null>(null);
  confirmApproveExpense = signal<any | null>(null);
  isExportingExcel = signal(false);
  isExportingPdf = signal(false);

  // Selección para exportar
  selectedIds = signal<Set<string>>(new Set<string>());

  get isContabilidad(): boolean { return this.userState.isContabilidad(); }

  /**
   * La sub-pestaña "Gastos" (listado por comprobante, con las acciones de
   * revisión contable) nunca se le mostró a Contabilidad, y la pantalla debe
   * salir igual para todos los que entran a /rendiciones, así que hoy no la ve
   * nadie. Sus botones ("Marcar como revisado por Contabilidad", eliminar) no
   * están acotados por rol, así que a un aprobador le responderían 403.
   * La sección se conserva por ser la única vista por comprobante de las
   * directas; si no se rehabilita, se puede borrar junto con
   * `findDirectRendicionExpenses`.
   */
  readonly showGastosTab = false;

  toggleSelectAll(): void {
    const all = this.data();
    const sel = this.selectedIds();
    if (sel.size === all.length && all.length > 0) {
      this.selectedIds.set(new Set<string>());
    } else {
      this.selectedIds.set(new Set<string>(all.map((e: any) => String(e._id))));
    }
  }

  toggleSelect(id: string, event: Event): void {
    event.stopPropagation();
    const sel = new Set<string>(this.selectedIds());
    sel.has(id) ? sel.delete(id) : sel.add(id);
    this.selectedIds.set(sel);
  }

  isRowSelected(id: string): boolean { return this.selectedIds().has(id); }

  // ─── Filas expandibles (detalle inline para tablas densas) ──────────────────
  // En vez de scroll horizontal, las columnas secundarias se muestran al
  // expandir cada fila, así toda la información queda accesible sin recortes.
  expandedRows = signal<Set<string>>(new Set<string>());
  toggleExpand(id: string, event?: Event): void {
    event?.stopPropagation();
    const set = new Set<string>(this.expandedRows());
    set.has(id) ? set.delete(id) : set.add(id);
    this.expandedRows.set(set);
  }
  isExpanded(id: string): boolean { return this.expandedRows().has(id); }

  get allSelected(): boolean { const d = this.data(); return d.length > 0 && this.selectedIds().size === d.length; }
  get anySelected(): boolean { return this.selectedIds().size > 0; }
  get selectedCount(): number { return this.selectedIds().size; }
  clearSelection(): void { this.selectedIds.set(new Set<string>()); }

  ngOnInit(): void {
    this.restoreFilters();
    this.loadCatalogs();
    this.loadReports();
    this.loadData();
  }

  private get clientId(): string {
    const user = this.userState.getUser() as any;
    return user?.companyId || user?.client?._id ||
      (typeof user?.clientId === 'string' ? user.clientId : user?.clientId?._id) || '';
  }

  private loadCatalogs(): void {
    const cid = this.clientId;
    if (!cid) return;
    this.invoicesService.getProjects(cid).subscribe({ next: list => this.projects.set(list ?? []) });
    // Sin el clientId la URL queda en /category/flat, que en el backend no es la
    // ruta ":clientId/flat" sino ":clientId" con clientId="flat": devolvía basura
    // para Contabilidad (filtro de categorías siempre vacío, error silencioso) y
    // 403 "Forbidden resource" para Tesorería, que no está en los roles de esa ruta.
    this.invoicesService.getCategories(cid).subscribe({ next: list => this.categories.set(list ?? []) });
    // VD-135: catálogo de OT para el filtro. Sin `error` explícito el listado
    // seguiría funcionando con el selector vacío, que es preferible a romper la
    // pantalla entera por un catálogo secundario.
    this.ordenTrabajoService.getAll().subscribe({
      next: list => this.ordenesTrabajo.set(list ?? []),
      error: () => this.ordenesTrabajo.set([]),
    });
    this.adminUsersService.getUsers().subscribe({ next: list => this.users.set(list ?? []) });
  }

  loadData(): void {
    // Alimenta solo la sub-pestaña "Gastos"; si está oculta, la petición no
    // tiene destino en pantalla.
    if (!this.showGastosTab) return;
    const cid = this.clientId;
    if (!cid) return;
    this.loading.set(true);
    this.expenseReportsService.findDirectRendicionExpenses(cid, {
      page: this.page, limit: this.limit,
      dateFrom: this.filterDateFrom || undefined, dateTo: this.filterDateTo || undefined,
      projectId: this.filterProjectId || undefined, categoryId: this.filterCategoryId || undefined,
      docNumber: this.filterDocNumber || undefined, tipo: this.filterTipo || undefined,
      userId: this.filterUserId || undefined,
    }).subscribe({
      next: res => { this.data.set(res.data ?? []); this.total.set(res.total ?? 0); this.pages.set(res.pages ?? 0); this.loading.set(false); this.selectedIds.set(new Set<string>()); },
      error: () => { this.loading.set(false); this.notifications.show('Error al cargar los datos', 'error'); },
    });
  }

  loadReports(): void {
    const cid = this.clientId;
    if (!cid) return;
    this.loadingReports.set(true);
    this.expenseReportsService.findDirectRendicionReports(cid, {
      dateFrom: this.filterDateFrom || undefined,
      dateTo: this.filterDateTo || undefined,
      userId: this.filterUserId || undefined,
      // VD-135
      status: this.filterStatus || undefined,
      projectId: this.filterProjectId || undefined,
      ordenTrabajoId: this.filterOrdenTrabajoId || undefined,
    }).subscribe({
      next: rows => { this.reports.set(rows ?? []); this.loadingReports.set(false); },
      error: () => { this.loadingReports.set(false); this.notifications.show('Error al cargar las rendiciones', 'error'); },
    });
  }

  applyFilters(): void { this.page = 1; this.persistFilters(); this.loadReports(); this.loadData(); }

  clearFilters(): void {
    this.filterDateFrom = ''; this.filterDateTo = ''; this.filterProjectId = '';
    this.filterCategoryId = ''; this.filterDocNumber = ''; this.filterTipo = '';
    this.filterUserId = ''; this.filterStatus = ''; this.filterOrdenTrabajoId = '';
    this.page = 1; this.persistFilters(); this.loadReports(); this.loadData();
  }

  // ─── Filtros recordados entre visitas ──────────────────────────────────────

  /**
   * Los filtros sobreviven a entrar en una rendición y volver: la revisión se
   * hace documento por documento sobre una lista ya acotada (p. ej. las que
   * están "En contabilidad") y re-filtrar en cada vuelta era el trabajo manual
   * que se pedía quitar. Solo se recuerdan los que el usuario ve en la barra;
   * `page` no, para que la lista vuelva a empezar arriba.
   */
  private static readonly FILTERS_KEY = 'rendiciones-directas';

  private persistFilters(): void {
    this.listFilters.write(RendicionesDirectasComponent.FILTERS_KEY, {
      filterDateFrom: this.filterDateFrom,
      filterDateTo: this.filterDateTo,
      filterProjectId: this.filterProjectId,
      filterCategoryId: this.filterCategoryId,
      filterDocNumber: this.filterDocNumber,
      filterTipo: this.filterTipo,
      filterUserId: this.filterUserId,
      filterStatus: this.filterStatus,
      filterOrdenTrabajoId: this.filterOrdenTrabajoId,
    });
  }

  private restoreFilters(): void {
    const saved = this.listFilters.read<Record<string, string>>(
      RendicionesDirectasComponent.FILTERS_KEY
    );
    const text = (v: unknown): string => (typeof v === 'string' ? v : '');
    this.filterDateFrom = text(saved['filterDateFrom']);
    this.filterDateTo = text(saved['filterDateTo']);
    this.filterProjectId = text(saved['filterProjectId']);
    this.filterCategoryId = text(saved['filterCategoryId']);
    this.filterDocNumber = text(saved['filterDocNumber']);
    this.filterTipo = text(saved['filterTipo']);
    this.filterUserId = text(saved['filterUserId']);
    this.filterStatus = text(saved['filterStatus']);
    this.filterOrdenTrabajoId = text(saved['filterOrdenTrabajoId']);
  }

  // ─── Helpers pestaña Rendiciones directas (nivel reporte) ────────────────────

  reportColaborador(r: any): string {
    const u = r?.userId;
    if (!u) return '—';
    return (typeof u === 'object' ? u.name || u.email : u) || '—';
  }

  reportOrigenLabel(r: any): string {
    const labels: Record<string, string> = { contabilidad: 'Contabilidad', coordinador: 'Aprobador', colaborador: 'Colaborador' };
    return labels[r?.origin] ?? 'Colaborador';
  }

  reportOrigenBadgeClass(r: any): string {
    if (r?.origin === 'contabilidad') return 'bg-blue-100 text-blue-700';
    if (r?.origin === 'coordinador') return 'bg-purple-100 text-purple-700';
    return 'bg-gray-100 text-gray-600';
  }

  reportStatusLabel(r: any): string {
    if (r?.effectivelyClosed) return 'Cerrada';
    const map: Record<string, string> = {
      open: 'Abierta', solicited: 'Solicitada', submitted: 'Enviada',
      pending_l1: 'En solicitud',
      pending_accounting: 'En contabilidad', approved: 'Aprobada',
      rejected: 'Rechazada', closed: 'Cerrada', liquidated: 'Liquidada',
      reimbursed: 'Reembolsada', cancelled: 'Cancelada',
    };
    return map[String(r?.status || '')] ?? (r?.status || '—');
  }

  /**
   * Color del badge de estado, igual que en /rendiciones (VD-51). Antes todos los
   * estados salían en plomo; ahora se diferencia por color según el estado.
   */
  reportStatusBadgeClass(r: any): string {
    if (r?.effectivelyClosed) return 'bg-gray-100 text-gray-500';
    const map: Record<string, string> = {
      solicited: 'bg-purple-100 text-purple-800',
      open: 'bg-blue-100 text-blue-800',
      submitted: 'bg-yellow-100 text-yellow-800',
      pending_l1: 'bg-yellow-100 text-yellow-800',
      pending_l2: 'bg-orange-100 text-orange-800',
      pending_accounting: 'bg-amber-100 text-amber-800',
      pending_contabilidad: 'bg-amber-100 text-amber-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      liquidated: 'bg-emerald-100 text-emerald-800',
      settled: 'bg-emerald-100 text-emerald-800',
      reimbursed: 'bg-emerald-100 text-emerald-800',
      closed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-gray-100 text-gray-500',
    };
    return map[String(r?.status || '')] ?? 'bg-gray-100 text-gray-700';
  }

  /**
   * VD-122: centro de costo en la lista, SOLO EL NÚMERO. El nombre completo no
   * cabe en una columna de tabla junto al resto y ademas se repite en casi todas
   * las filas; el codigo es lo que Contabilidad usa para imputar. El nombre va
   * en el `title`, para quien no se sepa el codigo de memoria.
   */
  reportCentroCostoCodigo(r: any): string {
    const p = r?.projectId;
    if (!p || typeof p !== 'object') return '—';
    return String(p.code ?? '').trim() || String(p.name ?? '').trim() || '—';
  }

  /** Nombre del centro de costo, para el tooltip de la columna. */
  reportCentroCostoNombre(r: any): string {
    const p = r?.projectId;
    if (!p || typeof p !== 'object') return '';
    return String(p.name ?? '');
  }

  /** VD-122: orden de trabajo imputada, o '—' si la rendición no lleva. */
  reportOrdenTrabajo(r: any): string {
    const ot = r?.directaOrdenTrabajoId;
    if (!ot || typeof ot !== 'object') return '—';
    return String(ot.nombre ?? '').trim() || '—';
  }

  reportFecha(r: any): string { return formatFechaEmisionDdMmYyyy(r?.createdAt) || '—'; }

  viewReport(r: any): void {
    // `from` devuelve el botón "Volver" del detalle a esta bandeja, con los
    // filtros como quedaron, en vez de a la pantalla que toque por rol.
    this.router.navigate(['/mis-rendiciones', String(r._id), 'detalle'], {
      queryParams: { from: 'rendiciones' },
    });
  }

  /** La rendición se lleva en una moneda distinta a la base de la empresa. */
  esMonedaExtranjera(r: any): boolean {
    return !!r?.moneda && r.moneda !== DEFAULT_MONEDA;
  }

  /** Símbolo de la moneda propia de esa rendición. */
  monedaSimbolo(r: any): string {
    return monedaSymbol(r?.moneda);
  }

  get reportsTotalGastado(): number {
    return this.reports().reduce((sum, r) => sum + (Number(r?.totalGastado) || 0), 0);
  }

  /**
   * Total gastado desglosado por moneda ("S/ 86.70 · $ 220.41").
   *
   * Las rendiciones se muestran cada una en su moneda, así que un único número
   * no representaría nada: sumar soles con dólares da una cifra que no existe.
   * Se agrupa y se ordena dejando la moneda base primero.
   */
  get totalGastadoPorMoneda(): string {
    const porMoneda = new Map<string, number>();
    for (const r of this.reports()) {
      const codigo = (r?.moneda as string) || DEFAULT_MONEDA;
      porMoneda.set(codigo, (porMoneda.get(codigo) ?? 0) + (Number(r?.totalGastadoMoneda) || 0));
    }
    if (porMoneda.size === 0) return `${monedaSymbol(DEFAULT_MONEDA)} 0.00`;
    return [...porMoneda.entries()]
      .sort(([a], [b]) => (a === DEFAULT_MONEDA ? -1 : b === DEFAULT_MONEDA ? 1 : a.localeCompare(b)))
      .map(([codigo, total]) => `${monedaSymbol(codigo)} ${total.toFixed(2)}`)
      .join(' · ');
  }

  goToPage(p: number): void { if (p < 1 || p > this.pages()) return; this.page = p; this.loadData(); }

  // ─── Navegación ──────────────────────────────────────────────────────────────

  viewDetail(e: any): void {
    // Una fila de depósito apunta al reporte (su _id es el id de la rendición),
    // no a un gasto: navega al detalle de la rendición directa.
    if (this.isDeposito(e)) {
      this.router.navigate(['/mis-rendiciones', String(e._id), 'detalle'], {
        queryParams: { from: 'rendiciones' },
      });
      return;
    }
    this.router.navigate(['/mis-rendiciones/gasto', String(e._id)]);
  }

  editExpense(e: any): void {
    this.router.navigate(['/invoices/edit', String(e._id)], { queryParams: { mode: 'directa' } });
  }

  // ─── Aprobación ──────────────────────────────────────────────────────────────

  openApproveConfirm(e: any, event: Event): void {
    event.stopPropagation();
    if (this.approvingId() || this.isRevisado(e)) return;
    this.confirmApproveExpense.set(e);
  }

  cancelApprove(): void { this.confirmApproveExpense.set(null); }

  doApprove(): void {
    const e = this.confirmApproveExpense();
    if (!e) return;
    this.confirmApproveExpense.set(null);
    this.approvingId.set(e._id);
    this.invoicesService.approveByContabilidad(e._id).subscribe({
      next: () => {
        this.approvingId.set(null);
        this.notifications.show('Documento marcado como revisado.', 'success');
        this.data.update(list => list.map(row =>
          row._id === e._id ? { ...row, contabilidadStatus: 'approved' } : row
        ));
      },
      error: (err) => {
        this.approvingId.set(null);
        const msg = err?.error?.message;
        this.notifications.show(Array.isArray(msg) ? msg.join(', ') : msg || 'Error al revisar.', 'error');
      },
    });
  }

  approveExpense(e: any, event: Event): void { this.openApproveConfirm(e, event); }

  // ─── Eliminación ─────────────────────────────────────────────────────────────

  openDeleteConfirm(e: any, event: Event): void {
    event.stopPropagation();
    this.confirmDeleteExpense.set(e);
  }

  cancelDelete(): void { this.confirmDeleteExpense.set(null); }

  doDelete(): void {
    const e = this.confirmDeleteExpense();
    if (!e) return;
    this.deletingId.set(e._id);
    const clientId = String(e.clientId ?? this.clientId);
    this.invoicesService.deleteInvoice(e._id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.confirmDeleteExpense.set(null);
        this.notifications.show('Documento eliminado.', 'success');
        this.loadData();
      },
      error: (err) => {
        this.deletingId.set(null);
        const msg = err?.error?.message;
        this.notifications.show(Array.isArray(msg) ? msg.join(', ') : msg || 'Error al eliminar.', 'error');
      },
    });
  }

  // ─── Helpers display ─────────────────────────────────────────────────────────

  getData(e: any): Record<string, unknown> {
    const raw = e?.data;
    try { if (raw == null) return {}; if (typeof raw === 'string') return JSON.parse(raw); if (typeof raw === 'object') return { ...raw }; } catch { return {}; }
    return {};
  }

  /** Fila placeholder que representa una directa con depósito sin comprobantes aún. */
  isDeposito(e: any): boolean { return e?._isDepositPlaceholder === true; }

  getTypeKey(e: any): string {
    if (this.isDeposito(e)) return 'directa_deposito';
    const t = e?.expenseType;
    if (t === 'planilla_movilidad') return 'planilla_movilidad';
    if (t === 'otros_gastos') return 'otros_gastos';
    if (t === 'recibo_caja') return 'recibo_caja';
    return 'factura';
  }

  getTypeCode(e: any): string {
    if (this.isDeposito(e)) return 'DEP';
    const type = e?.expenseType;
    if (type === 'planilla_movilidad') return 'PM';
    if (type === 'recibo_caja') return 'H';
    if (type === 'otros_gastos') {
      const sub = e?.subTipo ?? this.getData(e)['subTipo'];
      if (sub === 'TK') return 'TK';
      if (sub === 'BV') return 'BV';
      if (sub === 'RC') return 'RC';
      if (sub === 'DJ') return 'DJ';
      if (sub === 'DJE') return 'DJE';
      if (sub === 'OT') return 'OT';
      return 'SC';
    }
    const d = this.getData(e);
    const tc = String(d['tipoComprobante'] ?? '').trim();
    if (tc === '03') return 'BV';
    if (tc === '12') return 'TK';
    if (tc === '01') return 'FE';
    return 'FT';
  }

  getTypeBadgeClass(e: any): string {
    const code = this.getTypeCode(e);
    if (code === 'DEP') return 'bg-emerald-100 text-emerald-700';
    if (code === 'PM') return 'bg-yellow-100 text-yellow-800';
    if (code === 'CC') return 'bg-purple-100 text-purple-800';
    if (code === 'SC' || code === 'OT') return 'bg-gray-100 text-gray-600';
    if (code === 'DJ' || code === 'DJE') return 'bg-amber-100 text-amber-800';
    if (code === 'TK') return 'bg-teal-100 text-teal-700';
    if (code === 'RC') return 'bg-indigo-100 text-indigo-700';
    return 'bg-blue-100 text-blue-700';
  }

  getColaborador(e: any): string {
    const u = e._report?.userId;
    if (!u) return '—';
    return (typeof u === 'object' ? u.name || u.email : u) || '—';
  }

  /** DNI del colaborador de la rendición (perfil del usuario), para los PDFs. */
  getColaboradorDni(e: any): string | undefined {
    const u = e._report?.userId;
    return u && typeof u === 'object' ? u.dni : undefined;
  }

  getRendicionTitle(e: any): string { return e._report?.motivo || e._report?.title || '—'; }

  /** Nombre del usuario que generó la rendición directa (createdBy del reporte). */
  getGeneradoPor(e: any): string { return e._report?._generatedByName || '—'; }

  /** Origen/tipo de la rendición directa: Contabilidad, Coordinador o Colaborador. */
  getOrigen(e: any): string { return e._report?._origin || 'colaborador'; }

  getOrigenLabel(e: any): string {
    const labels: Record<string, string> = { contabilidad: 'Contabilidad', coordinador: 'Aprobador', colaborador: 'Colaborador' };
    return labels[this.getOrigen(e)] ?? 'Colaborador';
  }

  getOrigenBadgeClass(e: any): string {
    const o = this.getOrigen(e);
    if (o === 'contabilidad') return 'bg-blue-100 text-blue-700';
    if (o === 'coordinador') return 'bg-purple-100 text-purple-700';
    return 'bg-gray-100 text-gray-600';
  }

  getProject(e: any): string {
    const p = e._projectDoc || e._project?.[0];
    if (!p) return '—';
    return p.code ? `${p.code} — ${p.name}` : p.name || '—';
  }

  /** Resuelve la etiqueta de un proyecto (código — nombre) a partir de su id, usando el catálogo cargado. */
  private resolveProjectLabel(id: any): string {
    if (!id) return '';
    const pid = typeof id === 'object' ? String(id._id ?? '') : String(id);
    if (!pid) return '';
    const p = this.projects().find(pr => String(pr._id) === pid);
    if (!p) return '';
    return p.code ? `${p.code} — ${p.name}` : p.name || '';
  }

  getCategory(e: any): string {
    const c = e._categoryDoc || e._category?.[0];
    return c?.name || '—';
  }

  getDocNumber(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad') {
      return (typeof e?.internalCode === 'string' && e.internalCode) ? e.internalCode : '-';
    }
    if (type === 'recibo_caja') {
      const d = this.getData(e);
      const payload = d['payload'];
      const p: any = typeof payload === 'string' ? (() => { try { return JSON.parse(payload); } catch { return {}; } })() : (payload ?? {});
      return p['numeroDocumento'] ? String(p['numeroDocumento']) : '-';
    }
    const d = this.getData(e);
    const serie = d['serie'] ? String(d['serie']) : '';
    const corr = d['correlativo'] ? String(d['correlativo']) : '';
    if (serie && corr) return `${serie}-${corr}`;
    return serie || corr || '-';
  }

  getProveedor(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad' || type === 'otros_gastos') return '-';
    const d = this.getData(e);
    const r = d['razonSocial'];
    if (typeof r === 'string' && r.trim()) return r.trim();
    return e?.provider || '-';
  }

  getConcepto(e: any): string {
    if (this.isDeposito(e)) return e?.description || 'Depósito de saldo';
    const type = e?.expenseType;
    if (type === 'planilla_movilidad') { const rows: any[] = e?.mobilityRows || []; const first = rows[0]; return first?.gestion || `${rows.length} filas`; }
    if (type === 'otros_gastos') return e?.description || 'DJ firmada';
    const d = this.getData(e);
    return String(d['concepto'] || e.description || '');
  }

  getFecha(e: any): string {
    if (this.isDeposito(e)) return e.fechaEmision || formatFechaEmisionDdMmYyyy(e.createdAt) || '—';
    const type = e?.expenseType;
    if (type === 'planilla_movilidad') { const rows: any[] = e?.mobilityRows || []; const dates = rows.map((r: any) => r.fecha).filter(Boolean); return dates.length ? ([...dates].sort()[0]) : '—'; }
    if (type === 'otros_gastos') return e.fechaEmision || formatFechaEmisionDdMmYyyy(e.createdAt) || '—';
    return e.fechaEmision || '—';
  }

  emissionDateText(e: any): string { return formatFechaEmisionDdMmYyyy(resolveExpenseFechaEmision(e)); }

  dataText(e: any, key: string): string {
    const d = this.getData(e);
    const v = d[key];
    if (v == null) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  mobilityRows(e: any): any[] { const r = e?.mobilityRows; return Array.isArray(r) ? r : []; }
  mobilityRowTotal(row: any): number { const t = row?.total; if (typeof t === 'number') return t; const n = Number(t); return Number.isNaN(n) ? 0 : n; }
  trackRow(i: number): number { return i; }

  getFileUrl(e: any): string | null { const f = e?.file; return (typeof f === 'string' && f.trim()) ? f.trim() : null; }
  hasFile(e: any): boolean { return this.getFileUrl(e) !== null; }
  openFile(e: any, event: Event): void { event.stopPropagation(); const url = this.getFileUrl(e); url ? window.open(url, '_blank', 'noopener,noreferrer') : this.notifications.show('Sin documento adjunto', 'warning'); }

  getEstadoCont(e: any): string { return e.contabilidadStatus === 'approved' ? 'Revisado' : 'Pendiente'; }
  getEstadoContClass(e: any): string { return e.contabilidadStatus === 'approved' ? 'bg-teal-100 text-teal-700' : 'bg-yellow-100 text-yellow-700'; }
  isRevisado(e: any): boolean { return e.contabilidadStatus === 'approved'; }
  /**
   * Contabilidad marca "revisado" un comprobante recién cuando su rendición
   * llegó a `pending_accounting`, o sea cuando los aprobadores del centro de
   * costo terminaron con TODOS los comprobantes. Antes de eso el backend
   * rechaza la aprobación, así que el botón no se ofrece.
   */
  enContabilidad(e: any): boolean {
    return String(e?._report?.status ?? '') === 'pending_accounting';
  }
  getTotal(e: any): number { const t = e?.total; if (typeof t === 'number') return t; const n = Number(t); return Number.isNaN(n) ? 0 : n; }
  get totalMonto(): number { return this.data().reduce((sum, e) => sum + (this.isDeposito(e) ? 0 : this.getTotal(e)), 0); }

  private mapExpenseStatus(status?: string): string {
    const s = String(status || 'pending').toLowerCase();
    const labels: Record<string, string> = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', sunat_valid: 'Validado SUNAT', sunat_valid_not_ours: 'SUNAT (no propio)', sunat_not_found: 'SUNAT no encontrado' };
    return labels[s] ?? 'Pendiente';
  }

  // ─── Exports individuales ────────────────────────────────────────────────────

  async exportMobilityPdf(e: any, event: Event): Promise<void> {
    event.stopPropagation();
    const rows = this.mobilityRows(e).map((r: any) => ({ fecha: String(r.fecha || ''), origen: String(r.origen || ''), destino: String(r.destino || ''), gestion: String(r.gestion || ''), total: this.mobilityRowTotal(r), proyecto: this.resolveProjectLabel(r.proyectId), colaborador: String(r.colaboradorNombre || this.getColaborador(e) || '') }));
    const data: MobilitySheetExportData = { fileBaseName: `planilla_${e._id}`, collaborator: this.getColaborador(e), collaboratorDni: this.getColaboradorDni(e), internalCode: e.internalCode, generatedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }), proyecto: this.getProject(e), rows, total: this.getTotal(e) };
    await this.exportService.exportMobilitySheetToPdf(data);
  }

  async exportMobilityExcel(e: any, event: Event): Promise<void> {
    event.stopPropagation();
    const rows = this.mobilityRows(e).map((r: any) => ({ fecha: String(r.fecha || ''), origen: String(r.origen || ''), destino: String(r.destino || ''), gestion: String(r.gestion || ''), total: this.mobilityRowTotal(r), proyecto: this.resolveProjectLabel(r.proyectId), colaborador: String(r.colaboradorNombre || this.getColaborador(e) || '') }));
    const data: MobilitySheetExportData = { fileBaseName: `planilla_${e._id}`, collaborator: this.getColaborador(e), collaboratorDni: this.getColaboradorDni(e), internalCode: e.internalCode, generatedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }), proyecto: this.getProject(e), rows, total: this.getTotal(e) };
    await this.exportService.exportMobilitySheetToExcel(data);
  }

  async exportReceiptPdf(e: any, event: Event): Promise<void> {
    event.stopPropagation();
    const d = this.getData(e);
    const payload: any = typeof d['payload'] === 'string' ? (() => { try { return JSON.parse(String(d['payload'])); } catch { return {}; } })() : (d['payload'] ?? {});
    const data: ReceiptExportData = { fileBaseName: `recibo_${e._id}`, collaborator: this.getColaborador(e), collaboratorDni: this.getColaboradorDni(e), razonSocial: String(e.receiptRazonSocial || payload['razonSocial'] || ''), ruc: String(e.receiptRuc || payload['ruc'] || ''), numeroDocumento: String(payload['numeroDocumento'] || e.receiptNumeroDocumento || ''), concepto: String(e.receiptConcepto || payload['concepto'] || ''), fecha: this.emissionDateText(e), monto: this.getTotal(e) };
    await this.exportService.exportReceiptToPdf(data);
  }

  // ─── Export global (igual formato que rendición detail) ──────────────────────

  private buildRendicionExportData(): RendicionExportData {
    const sel = this.selectedIds();
    const expenses = sel.size > 0
      ? this.data().filter((e: any) => sel.has(String(e._id)))
      : this.data();
    const totalGastado = this.totalMonto;
    const filters: string[] = [];
    if (this.filterDateFrom || this.filterDateTo) filters.push(`Periodo: ${this.filterDateFrom || '...'} al ${this.filterDateTo || '...'}`);
    if (this.filterTipo) filters.push(`Tipo: ${this.filterTipo}`);

    // Cta / CCI: solo tiene sentido cuando el reporte es de un único colaborador.
    // Si el consolidado mezcla varios, no se muestra una cuenta (sería ambigua).
    const colaboradores = new Map<string, any>();
    for (const e of expenses) {
      const u = (e as any)._report?.userId;
      if (u && typeof u === 'object') colaboradores.set(String(u._id), u);
    }
    let accountNumber: string | undefined;
    if (colaboradores.size === 1) {
      const ba = [...colaboradores.values()][0]?.bankAccount;
      accountNumber = ba?.cci || ba?.accountNumber || undefined;
    }

    const comprobantes = expenses.map(e => {
      const type = e?.expenseType;
      let provider = this.getProveedor(e);
      if (type === 'planilla_movilidad') provider = 'Planilla de Movilidad';
      return {
        tipo: this.getTypeCode(e),
        fecha: this.getFecha(e),
        descripcion: this.getConcepto(e),
        monto: this.getTotal(e),
        estadoComprobante: this.mapExpenseStatus(e.status),
        proveedor: provider !== '-' ? provider : undefined,
        numeroDocumento: this.getDocNumber(e) !== '-' ? this.getDocNumber(e) : undefined,
        comentario: (typeof e['comentario'] === 'string' && e['comentario']) ? e['comentario'] : undefined,
      };
    });

    return {
      fileBaseName: `rendiciones_directas_${new Date().toISOString().slice(0, 10)}`,
      titulo: 'Rendiciones Directas',
      estado: `${this.total()} documento(s)`,
      descripcionRendicion: filters.length ? filters.join(' | ') : undefined,
      colaborador: 'Reporte consolidado',
      accountNumber,
      presupuesto: 0,
      totalGastado,
      totalAnticipado: 0,
      saldoLibre: 0,
      fechaGeneracion: new Date().toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' }),
      comprobantes,
      anticipos: [],
      startDate: this.filterDateFrom || undefined,
      endDate: this.filterDateTo || undefined,
    };
  }

  async exportExcel(): Promise<void> {
    if (this.data().length === 0) { this.notifications.show('No hay datos para exportar.', 'warning'); return; }
    this.isExportingExcel.set(true);
    try {
      await this.exportService.exportToExcel(this.buildRendicionExportData());
      this.notifications.show('Excel descargado correctamente.', 'success');
    } catch { this.notifications.show('No se pudo generar el Excel.', 'error'); }
    finally { this.isExportingExcel.set(false); }
  }

  exportPdf(): void {
    if (this.data().length === 0) { this.notifications.show('No hay datos para exportar.', 'warning'); return; }
    this.isExportingPdf.set(true);
    try {
      this.exportService.exportToPdf(this.buildRendicionExportData());
      this.notifications.show('PDF descargado correctamente.', 'success');
    } catch { this.notifications.show('No se pudo generar el PDF.', 'error'); }
    finally { this.isExportingPdf.set(false); }
  }

  get pageNumbers(): number[] {
    const count = this.pages();
    if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
    const arr: number[] = [1];
    if (this.page > 3) arr.push(-1);
    for (let i = Math.max(2, this.page - 1); i <= Math.min(count - 1, this.page + 1); i++) arr.push(i);
    if (this.page < count - 2) arr.push(-1);
    arr.push(count);
    return arr;
  }
}
