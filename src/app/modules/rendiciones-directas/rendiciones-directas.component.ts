import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { UserStateService } from '../../services/user-state.service';
import { InvoicesService } from '../invoices/services/invoices.service';
import { NotificationService } from '../../services/notification.service';
import { IProject } from '../invoices/interfaces/project.interface';
import { ICategory } from '../invoices/interfaces/category.interface';
import {
  RendicionExportService,
  RendicionExportData,
  MobilitySheetExportData,
  CashVoucherExportData,
  ReceiptExportData,
} from '../../services/rendicion-export.service';
import {
  formatFechaEmisionDdMmYyyy,
  resolveExpenseFechaEmision,
} from '../../utils/fecha-emision.util';

@Component({
  selector: 'app-rendiciones-directas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rendiciones-directas.component.html',
})
export class RendicionesDirectasComponent implements OnInit {
  private expenseReportsService = inject(ExpenseReportsService);
  private userState = inject(UserStateService);
  private invoicesService = inject(InvoicesService);
  private notifications = inject(NotificationService);
  private exportService = inject(RendicionExportService);
  private router = inject(Router);

  // Estado
  loading = signal(false);
  data = signal<any[]>([]);
  total = signal(0);
  pages = signal(0);

  // Filtros
  filterDateFrom = '';
  filterDateTo = '';
  filterProjectId = '';
  filterCategoryId = '';
  filterDocNumber = '';
  filterTipo = '';
  page = 1;
  readonly limit = 50;

  // Catálogos
  projects = signal<IProject[]>([]);
  categories = signal<ICategory[]>([]);

  // Acciones
  approvingId = signal<string | null>(null);
  deletingId = signal<string | null>(null);
  confirmDeleteExpense = signal<any | null>(null);
  isExportingExcel = signal(false);
  isExportingPdf = signal(false);

  // Selección para exportar
  selectedIds = signal<Set<string>>(new Set<string>());

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

  get allSelected(): boolean { const d = this.data(); return d.length > 0 && this.selectedIds().size === d.length; }
  get anySelected(): boolean { return this.selectedIds().size > 0; }
  get selectedCount(): number { return this.selectedIds().size; }
  clearSelection(): void { this.selectedIds.set(new Set<string>()); }

  ngOnInit(): void {
    this.loadCatalogs();
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
    this.invoicesService.getCategories().subscribe({ next: list => this.categories.set(list ?? []) });
  }

  loadData(): void {
    const cid = this.clientId;
    if (!cid) return;
    this.loading.set(true);
    this.expenseReportsService.findDirectRendicionExpenses(cid, {
      page: this.page, limit: this.limit,
      dateFrom: this.filterDateFrom || undefined, dateTo: this.filterDateTo || undefined,
      projectId: this.filterProjectId || undefined, categoryId: this.filterCategoryId || undefined,
      docNumber: this.filterDocNumber || undefined, tipo: this.filterTipo || undefined,
    }).subscribe({
      next: res => { this.data.set(res.data ?? []); this.total.set(res.total ?? 0); this.pages.set(res.pages ?? 0); this.loading.set(false); this.selectedIds.set(new Set<string>()); },
      error: () => { this.loading.set(false); this.notifications.show('Error al cargar los datos', 'error'); },
    });
  }

  applyFilters(): void { this.page = 1; this.loadData(); }

  clearFilters(): void {
    this.filterDateFrom = ''; this.filterDateTo = ''; this.filterProjectId = '';
    this.filterCategoryId = ''; this.filterDocNumber = ''; this.filterTipo = '';
    this.page = 1; this.loadData();
  }

  goToPage(p: number): void { if (p < 1 || p > this.pages()) return; this.page = p; this.loadData(); }

  // ─── Navegación ──────────────────────────────────────────────────────────────

  viewDetail(e: any): void {
    this.router.navigate(['/mis-rendiciones/gasto', String(e._id)]);
  }

  editExpense(e: any): void {
    this.router.navigate(['/invoices/edit', String(e._id)], { queryParams: { mode: 'directa' } });
  }

  // ─── Aprobación ──────────────────────────────────────────────────────────────

  approveExpense(e: any, event: Event): void {
    event.stopPropagation();
    if (this.approvingId() || this.isRevisado(e)) return;
    this.approvingId.set(e._id);
    this.invoicesService.approveByContabilidad(e._id).subscribe({
      next: () => {
        this.approvingId.set(null);
        this.notifications.show('Documento marcado como revisado.', 'success');
        this.data.update(list => list.map(row =>
          row._id === e._id ? { ...row, approvalCont: { status: 'approved' } } : row
        ));
      },
      error: (err) => {
        this.approvingId.set(null);
        const msg = err?.error?.message;
        this.notifications.show(Array.isArray(msg) ? msg.join(', ') : msg || 'Error al revisar.', 'error');
      },
    });
  }

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

  getTypeKey(e: any): string {
    const t = e?.expenseType;
    if (t === 'planilla_movilidad') return 'planilla_movilidad';
    if (t === 'otros_gastos') return 'otros_gastos';
    if (t === 'comprobante_caja') return 'comprobante_caja';
    if (t === 'recibo_caja') return 'recibo_caja';
    return 'factura';
  }

  getTypeCode(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad') return 'PM';
    if (type === 'comprobante_caja') return 'CC';
    if (type === 'recibo_caja') return 'H';
    if (type === 'otros_gastos') {
      const sub = e?.subTipo ?? this.getData(e)['subTipo'];
      if (sub === 'TK') return 'TK';
      if (sub === 'BV') return 'BV';
      if (sub === 'RC') return 'RC';
      if (sub === 'DJ') return 'DJ';
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
    if (code === 'PM') return 'bg-yellow-100 text-yellow-800';
    if (code === 'CC') return 'bg-purple-100 text-purple-800';
    if (code === 'SC' || code === 'OT') return 'bg-gray-100 text-gray-600';
    if (code === 'DJ') return 'bg-amber-100 text-amber-800';
    if (code === 'TK') return 'bg-teal-100 text-teal-700';
    if (code === 'RC') return 'bg-indigo-100 text-indigo-700';
    return 'bg-blue-100 text-blue-700';
  }

  getColaborador(e: any): string {
    const u = e._report?.userId;
    if (!u) return '—';
    return (typeof u === 'object' ? u.name || u.email : u) || '—';
  }

  getRendicionTitle(e: any): string { return e._report?.motivo || e._report?.title || '—'; }

  getProject(e: any): string {
    const p = e._projectDoc || e._project?.[0];
    if (!p) return '—';
    return p.code ? `${p.code} — ${p.name}` : p.name || '—';
  }

  getCategory(e: any): string {
    const c = e._categoryDoc || e._category?.[0];
    return c?.name || '—';
  }

  getDocNumber(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad' || type === 'comprobante_caja') {
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
    if (type === 'planilla_movilidad' || type === 'comprobante_caja' || type === 'otros_gastos') return '-';
    const d = this.getData(e);
    const r = d['razonSocial'];
    if (typeof r === 'string' && r.trim()) return r.trim();
    return e?.provider || '-';
  }

  getConcepto(e: any): string {
    const type = e?.expenseType;
    if (type === 'planilla_movilidad') { const rows: any[] = e?.mobilityRows || []; const first = rows[0]; return first?.gestion || `${rows.length} filas`; }
    if (type === 'otros_gastos') return e?.description || 'DJ firmada';
    if (type === 'comprobante_caja') { try { const d = this.getData(e); const raw = d['payload']; const obj: any = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {}); return String(obj['concepto'] || ''); } catch { return ''; } }
    const d = this.getData(e);
    return String(d['concepto'] || e.description || '');
  }

  getFecha(e: any): string {
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

  cashVoucherPayload(e: any): Record<string, unknown> {
    const d = this.getData(e);
    const raw = d['payload'];
    let obj: any = {};
    if (raw && typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { /**/ } }
    else if (raw && typeof raw === 'object') { obj = raw; }
    if (!obj['concepto'] && e['description']) { try { const p = JSON.parse(String(e['description'])); if (p?.concepto) obj = p; } catch { /**/ } }
    return obj;
  }

  cashVoucherText(e: any, key: string): string { const v = this.cashVoucherPayload(e)[key]; if (v == null || v === '') return '—'; return String(v); }

  mobilityRows(e: any): any[] { const r = e?.mobilityRows; return Array.isArray(r) ? r : []; }
  mobilityRowTotal(row: any): number { const t = row?.total; if (typeof t === 'number') return t; const n = Number(t); return Number.isNaN(n) ? 0 : n; }
  trackRow(i: number): number { return i; }

  getFileUrl(e: any): string | null { const f = e?.file; return (typeof f === 'string' && f.trim()) ? f.trim() : null; }
  hasFile(e: any): boolean { return this.getFileUrl(e) !== null; }
  openFile(e: any, event: Event): void { event.stopPropagation(); const url = this.getFileUrl(e); url ? window.open(url, '_blank', 'noopener,noreferrer') : this.notifications.show('Sin documento adjunto', 'warning'); }

  getEstadoCont(e: any): string { return e.approvalCont?.status === 'approved' ? 'Revisado' : 'Pendiente'; }
  getEstadoContClass(e: any): string { return e.approvalCont?.status === 'approved' ? 'bg-teal-100 text-teal-700' : 'bg-yellow-100 text-yellow-700'; }
  isRevisado(e: any): boolean { return e.approvalCont?.status === 'approved'; }
  getTotal(e: any): number { const t = e?.total; if (typeof t === 'number') return t; const n = Number(t); return Number.isNaN(n) ? 0 : n; }
  get totalMonto(): number { return this.data().reduce((sum, e) => sum + this.getTotal(e), 0); }

  private mapExpenseStatus(status?: string): string {
    const s = String(status || 'pending').toLowerCase();
    const labels: Record<string, string> = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', sunat_valid: 'Validado SUNAT', sunat_valid_not_ours: 'SUNAT (no propio)', sunat_not_found: 'SUNAT no encontrado' };
    return labels[s] ?? 'Pendiente';
  }

  // ─── Exports individuales ────────────────────────────────────────────────────

  async exportMobilityPdf(e: any, event: Event): Promise<void> {
    event.stopPropagation();
    const rows = this.mobilityRows(e).map((r: any) => ({ fecha: String(r.fecha || ''), clienteProveedor: String(r.clienteProveedor || ''), origen: String(r.origen || ''), destino: String(r.destino || ''), gestion: String(r.gestion || ''), total: this.mobilityRowTotal(r) }));
    const data: MobilitySheetExportData = { fileBaseName: `planilla_${e._id}`, collaborator: this.getColaborador(e), internalCode: e.internalCode, generatedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }), proyecto: this.getProject(e), rows, total: this.getTotal(e) };
    await this.exportService.exportMobilitySheetToPdf(data);
  }

  async exportMobilityExcel(e: any, event: Event): Promise<void> {
    event.stopPropagation();
    const rows = this.mobilityRows(e).map((r: any) => ({ fecha: String(r.fecha || ''), clienteProveedor: String(r.clienteProveedor || ''), origen: String(r.origen || ''), destino: String(r.destino || ''), gestion: String(r.gestion || ''), total: this.mobilityRowTotal(r) }));
    const data: MobilitySheetExportData = { fileBaseName: `planilla_${e._id}`, collaborator: this.getColaborador(e), internalCode: e.internalCode, generatedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }), proyecto: this.getProject(e), rows, total: this.getTotal(e) };
    await this.exportService.exportMobilitySheetToExcel(data);
  }

  async exportCashVoucherPdf(e: any, event: Event): Promise<void> {
    event.stopPropagation();
    const payload = this.cashVoucherPayload(e);
    const data: CashVoucherExportData = { fileBaseName: `comprobante_${e._id}`, collaborator: this.getColaborador(e), internalCode: e.internalCode, entregadoA: String(payload['entregadoA'] || ''), direccion: String(payload['direccion'] || ''), concepto: String(payload['concepto'] || ''), monto: this.getTotal(e), generatedAt: new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }), projectName: this.getProject(e), fechaEmision: this.emissionDateText(e) };
    await this.exportService.exportCashVoucherToPdf(data);
  }

  async exportReceiptPdf(e: any, event: Event): Promise<void> {
    event.stopPropagation();
    const d = this.getData(e);
    const payload: any = typeof d['payload'] === 'string' ? (() => { try { return JSON.parse(String(d['payload'])); } catch { return {}; } })() : (d['payload'] ?? {});
    const data: ReceiptExportData = { fileBaseName: `recibo_${e._id}`, collaborator: this.getColaborador(e), razonSocial: String(e.receiptRazonSocial || payload['razonSocial'] || ''), ruc: String(e.receiptRuc || payload['ruc'] || ''), numeroDocumento: String(payload['numeroDocumento'] || e.receiptNumeroDocumento || ''), concepto: String(e.receiptConcepto || payload['concepto'] || ''), fecha: this.emissionDateText(e), monto: this.getTotal(e) };
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
