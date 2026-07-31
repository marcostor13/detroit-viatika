import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CajaChicaReportService } from '../../../services/caja-chica-report.service';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { NotificationService } from '../../../services/notification.service';
import { CajaChicaReportExportService, CajaChicaExportRow } from '../../../services/caja-chica-report-export.service';
import { ICajaChicaReport, ISelectedReport } from '../../../interfaces/caja-chica-report.interface';
import { IExpenseReport } from '../../../interfaces/expense-report.interface';
import { formatFechaEmisionDdMmYyyy, resolveExpenseFechaEmision } from '../../../utils/fecha-emision.util';

@Component({
  selector: 'app-rendicion-caja-chica-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rendicion-caja-chica-detalle.component.html',
})
export class RendicionCajaChicaDetalleComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private service = inject(CajaChicaReportService);
  private expenseReportsService = inject(ExpenseReportsService);
  private notifications = inject(NotificationService);
  private exportService = inject(CajaChicaReportExportService);

  report = signal<ICajaChicaReport | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  available = signal<IExpenseReport[]>([]);
  availableLoading = signal(false);
  availableFilter = '';

  selectedToAdd = signal<Set<string>>(new Set());
  expandedAvailId = signal<string | null>(null);
  adding = signal(false);
  finalizing = signal(false);
  exporting = signal(false);

  get reportId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  ngOnInit(): void {
    this.loadReport();
  }

  loadReport(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.findOne(this.reportId).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
        if (r.status === 'draft') this.loadAvailable();
      },
      error: (err) => {
        this.loading.set(false);
        if (err?.status === 404) {
          this.router.navigate(['/rendiciones'], {
            queryParams: { tab: 'caja-chica' },
            state: { removedId: this.reportId },
          });
        } else {
          this.error.set(err?.error?.message ?? 'Error al cargar el reporte.');
        }
      },
    });
  }

  loadAvailable(): void {
    this.availableLoading.set(true);
    this.expenseReportsService.getAllCajaChicaAvailable().subscribe({
      next: (data: any[]) => {
        const report = this.report();
        const includedIds = new Set(
          (report?.selectedReports ?? []).map((sr) =>
            typeof sr.expenseReportId === 'string' ? sr.expenseReportId : (sr.expenseReportId as any)?._id
          )
        );
        this.available.set(data.filter((r: IExpenseReport) => !includedIds.has(r._id)));
        this.availableLoading.set(false);
      },
      error: () => { this.availableLoading.set(false); },
    });
  }

  filteredAvailable(): IExpenseReport[] {
    const f = this.availableFilter.toLowerCase().trim();
    if (!f) return this.available();
    return this.available().filter((r) => {
      const u = r.userId;
      const userName = typeof u === 'object'
        ? [u?.firstName ?? u?.name ?? '', u?.lastName ?? ''].join(' ')
        : '';
      return (userName + ' ' + (r.title ?? '')).toLowerCase().includes(f);
    });
  }

  toggleSelect(id: string): void {
    const s = new Set(this.selectedToAdd());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.selectedToAdd.set(s);
  }

  toggleExpandAvail(id: string, event: Event): void {
    event.stopPropagation();
    this.expandedAvailId.set(this.expandedAvailId() === id ? null : id);
  }

  isSelected(id: string): boolean {
    return this.selectedToAdd().has(id);
  }

  addSelected(): void {
    const ids = Array.from(this.selectedToAdd());
    if (!ids.length) return;
    this.adding.set(true);
    this.service.addReports(this.reportId, ids).subscribe({
      next: () => {
        this.selectedToAdd.set(new Set());
        this.adding.set(false);
        // El backend devuelve el reporte sin poblar (expenseReportId queda como
        // ObjectId), por lo que las tablas y exportaciones quedarían vacías hasta
        // recargar. Recargamos la versión enriquecida desde findOne.
        this.loadReport();
        this.notifications.show(`${ids.length} rendicion(es) agregada(s).`, 'success');
      },
      error: (err) => {
        this.adding.set(false);
        const msg = err?.error?.message ?? 'Error al agregar rendiciones.';
        this.notifications.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
      },
    });
  }

  removeReport(expenseReportId: string): void {
    this.service.removeReport(this.reportId, expenseReportId).subscribe({
      next: () => {
        // Recargamos la versión enriquecida (el backend responde sin poblar).
        this.loadReport();
        this.notifications.show('Rendicion eliminada del reporte.', 'success');
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Error al eliminar la rendicion.';
        this.notifications.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
      },
    });
  }

  finalize(): void {
    if (!confirm('Al finalizar, no podras agregar ni quitar rendiciones. Continuar?')) return;
    this.finalizing.set(true);
    this.service.finalize(this.reportId).subscribe({
      next: () => {
        this.finalizing.set(false);
        // Recargamos enriquecido para que las tablas y el PDF/Excel tengan los
        // comprobantes poblados sin necesidad de recargar la página a mano.
        this.loadReport();
        this.notifications.show('Reporte finalizado.', 'success');
      },
      error: (err) => {
        this.finalizing.set(false);
        const msg = err?.error?.message ?? 'Error al finalizar el reporte.';
        this.notifications.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
      },
    });
  }

  async exportPdf(): Promise<void> {
    const r = this.report();
    if (!r) return;
    await this.exportService.exportPdf(r, this.buildRows(r));
  }

  async exportExcel(): Promise<void> {
    const r = this.report();
    if (!r) return;
    this.exporting.set(true);
    try {
      await this.exportService.exportExcel(r, this.buildRows(r));
    } finally {
      this.exporting.set(false);
    }
  }

  private buildRows(report: ICajaChicaReport): CajaChicaExportRow[] {
    const rows: CajaChicaExportRow[] = [];
    for (const sr of report.selectedReports) {
      const er: any = sr.expenseReport ?? (typeof sr.expenseReportId === 'object' ? sr.expenseReportId : null);
      const expenses: any[] = er?.expenseIds ?? [];
      const colaboradorDni =
        er?.userId && typeof er.userId === 'object' ? er.userId.dni : undefined;
      for (const inv of expenses) {
        rows.push({
          colaborador: sr.colaboradorName,
          colaboradorDni,
          tipo: this.expenseTypeLabel(inv.expenseType ?? ''),
          fecha: this.getInvDate(inv),
          centroCosto: this.getInvCentroCosto(inv),
          categoria: this.getInvCategoria(inv),
          proveedor: this.getInvProveedor(inv),
          descripcion: this.getInvConcepto(inv),
          numDoc: this.getInvNumDoc(inv),
          monto: this.getInvTotal(inv),
        });
      }
    }
    return rows;
  }

  getExpenseReportId(sr: ISelectedReport): string {
    return typeof sr.expenseReportId === 'string' ? sr.expenseReportId : (sr.expenseReportId as any)?._id ?? '';
  }

  getExpenseReport(sr: ISelectedReport): any {
    return sr.expenseReport ?? (typeof sr.expenseReportId === 'object' ? sr.expenseReportId : null);
  }

  getColaboradorDisplay(r: IExpenseReport): string {
    const u = r.userId;
    if (!u || typeof u === 'string') return 'Colaborador';
    return [u.firstName ?? u.name ?? '', u.lastName ?? ''].join(' ').trim() || 'Colaborador';
  }

  expenseTypeLabel(type: string): string {
    const map: Record<string, string> = {
      factura: 'Factura',
      planilla_movilidad: 'Plan. Movilidad',
      recibo_caja: 'Recibo de Caja',
      otros_gastos: 'Otros Gastos',
    };
    return map[type] ?? type ?? '-';
  }

  statusLabel(status: string): string {
    return status === 'finalized' ? 'Finalizado' : 'Borrador';
  }

  statusClasses(status: string): string {
    return status === 'finalized'
      ? 'bg-green-100 text-green-700'
      : 'bg-yellow-100 text-yellow-700';
  }

  availItemClass(id: string): string {
    const base = 'rounded-xl border transition-all ';
    return this.isSelected(id) ? base + 'border-primary bg-blue-50' : base + 'border-gray-200';
  }

  expenseSubtotal(expenses: any[]): number {
    return (expenses ?? []).reduce((s: number, e: any) => s + (Number(e.total) || 0), 0);
  }

  private parseInvData(inv: any): Record<string, any> {
    const raw = inv?.data;
    try {
      if (!raw) return {};
      if (typeof raw === 'string') return JSON.parse(raw);
      if (typeof raw === 'object') return raw;
    } catch { return {}; }
    return {};
  }

  getInvTotal(inv: any): number {
    return Number(inv?.total) || 0;
  }

  /** Centro de costo (proyecto). Mostramos solo el código (p. ej. 61364). */
  getInvCentroCosto(inv: any): string {
    const p = inv?.proyectId;
    if (p && typeof p === 'object' && p.code) return String(p.code);
    return '-';
  }

  /** Categoría (cuenta). Poblada por el backend como { _id, name }. */
  getInvCategoria(inv: any): string {
    const c = inv?.categoryId;
    if (c && typeof c === 'object' && c.name) return String(c.name);
    return '-';
  }

  getInvDate(inv: any): string {
    const type = inv?.expenseType;
    if (type === 'planilla_movilidad') {
      const rows: any[] = inv?.mobilityRows || [];
      const dates = rows.map((r: any) => r.fecha).filter(Boolean);
      return dates.length ? formatFechaEmisionDdMmYyyy([...dates].sort()[0]) : '-';
    }
    if (type === 'otros_gastos') {
      return formatFechaEmisionDdMmYyyy(inv?.createdAt);
    }
    return formatFechaEmisionDdMmYyyy(resolveExpenseFechaEmision(inv));
  }

  getInvProveedor(inv: any): string {
    const type = inv?.expenseType;
    if (type === 'planilla_movilidad' || type === 'otros_gastos') return '-';
    const d = this.parseInvData(inv);
    return (typeof d['razonSocial'] === 'string' && d['razonSocial'].trim())
      ? d['razonSocial'].trim()
      : (typeof inv?.provider === 'string' && inv.provider.trim() ? inv.provider.trim() : '-');
  }

  getInvConcepto(inv: any): string {
    const type = inv?.expenseType;
    if (type === 'planilla_movilidad') {
      const firstRow = inv?.mobilityRows?.[0];
      return firstRow?.gestion || `${inv?.mobilityRows?.length || 0} filas`;
    }
    if (type === 'otros_gastos') return inv?.description || 'DJ firmada';
    if (type === 'recibo_caja') {
      try {
        const d = typeof inv?.data === 'string' ? JSON.parse(inv.data) : inv?.data || {};
        return d.concepto || d.razonSocial || 'N/A';
      } catch { return 'N/A'; }
    }
    const d = this.parseInvData(inv);
    return (typeof d['razonSocial'] === 'string' && d['razonSocial'].trim()) ? d['razonSocial'].trim() : 'N/A';
  }

  getInvNumDoc(inv: any): string {
    const type = inv?.expenseType;
    if (type === 'planilla_movilidad') {
      return typeof inv?.internalCode === 'string' && inv.internalCode ? inv.internalCode : '-';
    }
    if (type === 'recibo_caja') {
      const d = this.parseInvData(inv);
      const payload = d['payload'];
      const p: Record<string, any> = typeof payload === 'string'
        ? (() => { try { return JSON.parse(payload); } catch { return {}; } })()
        : (payload && typeof payload === 'object' ? payload : {});
      return p['numeroDocumento'] ? String(p['numeroDocumento']) : '-';
    }
    const d = this.parseInvData(inv);
    const serie = d['serie'] ? String(d['serie']) : '';
    const corr = d['correlativo'] ? String(d['correlativo']) : '';
    if (serie && corr) return `${serie}-${corr}`;
    return serie || corr || '-';
  }

  goBack(): void {
    this.router.navigate(['/rendiciones'], { queryParams: { tab: 'caja-chica' } });
  }
}
