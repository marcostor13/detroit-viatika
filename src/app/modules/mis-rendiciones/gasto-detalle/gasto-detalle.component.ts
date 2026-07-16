import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ExpenseService } from '../../../services/expense.service';
import { UserStateService } from '../../../services/user-state.service';
import { NotificationService } from '../../../services/notification.service';
import {
  formatFechaEmisionDdMmYyyy,
  resolveExpenseFechaEmision,
} from '../../../utils/fecha-emision.util';

// ─── Tipos auxiliares ─────────────────────────────────────────────────────────
type ExpenseTypeKey = 'factura' | 'planilla_movilidad' | 'otros_gastos';

@Component({
  selector: 'app-gasto-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gasto-detalle.component.html',
})
export class GastoDetalleComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private expenseService = inject(ExpenseService);
  private userState = inject(UserStateService);
  private notifications = inject(NotificationService);

  id = this.route.snapshot.paramMap.get('id') ?? '';
  expense = signal<Record<string, unknown> | null>(null);
  loading = signal(true);
  deleting = signal(false);
  showDeleteConfirm = signal(false);

  // --- Edición de desglose contable (solo Contabilidad) ---
  showDesgloseForm = signal(false);
  savingDesglose = signal(false);
  desgloseForm = {
    baseAfecta: null as number | null,
    igv: null as number | null,
    tasaIgv: null as number | null,
    inafecto: null as number | null,
  };

  get isContabilidad(): boolean {
    return this.userState.isContabilidad();
  }

  /** Suma del desglose para validación visual (debe coincidir con el total). */
  get desgloseSuma(): number {
    const f = this.desgloseForm;
    return (
      (Number(f.baseAfecta) || 0) +
      (Number(f.igv) || 0) +
      (Number(f.inafecto) || 0)
    );
  }

  ngOnInit(): void {
    if (!this.id) { this.router.navigate(['/mis-rendiciones'], { queryParams: { tab: 'directas' } }); return; }
    this.expenseService.getById(this.id).subscribe({
      next: (e) => { this.expense.set(e); this.loading.set(false); },
      error: () => { this.loading.set(false); this.notifications.show('No se pudo cargar el documento.', 'error'); },
    });
  }

  private get backRoute(): string[] {
    return [this.userState.isContabilidad() ? '/rendiciones' : '/mis-rendiciones'];
  }

  private get backQueryParams(): object {
    return { tab: 'directas' };
  }

  goBack(): void {
    this.router.navigate(this.backRoute, { queryParams: this.backQueryParams });
  }

  editExpense(): void {
    this.router.navigate(['/invoices/edit', this.id], {
      queryParams: { mode: 'directa', from: this.userState.isContabilidad() ? 'contabilidad' : 'colaborador' },
    });
  }

  editDesglose(): void {
    const exp = this.expense();
    this.desgloseForm = {
      baseAfecta: (exp?.['baseAfecta'] as number) ?? null,
      igv: (exp?.['igv'] as number) ?? null,
      tasaIgv: (exp?.['tasaIgv'] as number) ?? null,
      inafecto: (exp?.['inafecto'] as number) ?? null,
    };
    this.showDesgloseForm.set(true);
  }

  cancelDesglose(): void {
    this.showDesgloseForm.set(false);
  }

  saveDesglose(): void {
    if (!this.id || this.savingDesglose()) return;
    const f = this.desgloseForm;
    this.savingDesglose.set(true);
    this.expenseService
      .updateDesglose(this.id, {
        baseAfecta: f.baseAfecta ?? undefined,
        igv: f.igv ?? undefined,
        tasaIgv: f.tasaIgv ?? undefined,
        inafecto: f.inafecto ?? undefined,
      })
      .subscribe({
        next: (updated) => {
          this.savingDesglose.set(false);
          this.showDesgloseForm.set(false);
          // Refresca los campos visibles del documento.
          const exp = this.expense();
          if (exp) {
            this.expense.set({
              ...exp,
              baseAfecta: updated?.baseAfecta ?? f.baseAfecta,
              igv: updated?.igv ?? f.igv,
              tasaIgv: updated?.tasaIgv ?? f.tasaIgv,
              inafecto: updated?.inafecto ?? f.inafecto,
              desgloseRevisado: true,
            });
          }
          this.notifications.show('Desglose contable actualizado.', 'success');
        },
        error: () => {
          this.savingDesglose.set(false);
          this.notifications.show('Error al guardar el desglose.', 'error');
        },
      });
  }

  confirmDelete(): void { this.showDeleteConfirm.set(true); }
  cancelDelete(): void { this.showDeleteConfirm.set(false); }

  doDelete(): void {
    const exp = this.expense();
    if (!exp) return;
    const clientId = String(exp['clientId'] ?? '');
    this.deleting.set(true);
    this.expenseService.deleteExpense(this.id, clientId).subscribe({
      next: () => {
        this.deleting.set(false);
        this.notifications.show('Documento eliminado.', 'success');
        this.router.navigate(this.backRoute, { queryParams: this.backQueryParams });
      },
      error: (err) => {
        this.deleting.set(false);
        const msg = err?.error?.message;
        this.notifications.show(Array.isArray(msg) ? msg.join(', ') : msg || 'Error al eliminar.', 'error');
      },
    });
  }

  // ─── Helpers display ───────────────────────────────────────────────────────

  getTypeKey(exp: Record<string, unknown>): ExpenseTypeKey {
    const t = exp['expenseType'];
    if (t === 'planilla_movilidad') return 'planilla_movilidad';
    if (t === 'otros_gastos') return 'otros_gastos';
    return 'factura';
  }

  getTypeLabel(exp: Record<string, unknown>): string {
    const m: Record<string, string> = {
      factura: 'Factura',
      planilla_movilidad: 'Planilla de Movilidad',
      otros_gastos: 'Otros Gastos',
      recibo_caja: 'Recibo de Caja',
    };
    return m[String(exp['expenseType'] ?? '')] ?? 'Factura';
  }

  getTypeCode(exp: Record<string, unknown>): string {
    const type = exp['expenseType'];
    if (type === 'planilla_movilidad') return 'PM';
    if (type === 'recibo_caja') return 'H';
    if (type === 'otros_gastos') {
      const sub = (exp['subTipo'] as string) ?? (this.getData(exp)['subTipo'] as string);
      if (sub === 'TK') return 'TK';
      if (sub === 'BV') return 'BV';
      if (sub === 'RC') return 'RC';
      if (sub === 'DJ') return 'DJ';
      if (sub === 'OT') return 'OT';
      return 'SC';
    }
    const d = this.getData(exp);
    const tc = String(d['tipoComprobante'] ?? '').trim();
    if (tc === '03') return 'BV';
    if (tc === '12') return 'TK';
    if (tc === '01') return 'FE';
    return 'FT';
  }

  getTypeBadgeClass(exp: Record<string, unknown>): string {
    const code = this.getTypeCode(exp);
    if (code === 'PM') return 'bg-yellow-100 text-yellow-800';
    if (code === 'CC') return 'bg-purple-100 text-purple-800';
    if (code === 'SC' || code === 'OT') return 'bg-gray-100 text-gray-600';
    if (code === 'DJ') return 'bg-amber-100 text-amber-800';
    if (code === 'TK') return 'bg-teal-100 text-teal-700';
    if (code === 'RC') return 'bg-indigo-100 text-indigo-700';
    return 'bg-blue-100 text-blue-700';
  }

  getData(exp: Record<string, unknown>): Record<string, unknown> {
    const raw = exp['data'];
    try {
      if (raw == null) return {};
      if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
      if (typeof raw === 'object') return { ...(raw as Record<string, unknown>) };
    } catch { return {}; }
    return {};
  }

  dataText(exp: Record<string, unknown>, key: string): string {
    const d = this.getData(exp);
    const v = d[key];
    if (v == null) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

emissionDateText(exp: Record<string, unknown>): string {
    return formatFechaEmisionDdMmYyyy(resolveExpenseFechaEmision(exp as any));
  }

  getDate(exp: Record<string, unknown>): string {
    const type = exp['expenseType'];
    if (type === 'planilla_movilidad') {
      const rows: any[] = (exp['mobilityRows'] as any[]) || [];
      if (!rows.length) return '-';
      const dates = rows.map((r: any) => r.fecha).filter(Boolean);
      return dates.length ? formatFechaEmisionDdMmYyyy([...dates].sort()[0]) : '-';
    }
    if (type === 'otros_gastos') return formatFechaEmisionDdMmYyyy(exp['createdAt'] as any);
    return this.emissionDateText(exp);
  }

  mobilityRows(exp: Record<string, unknown>): Record<string, unknown>[] {
    const r = exp['mobilityRows'];
    return Array.isArray(r) ? r as Record<string, unknown>[] : [];
  }

  mobilityRowTotal(row: Record<string, unknown>): number {
    const t = row['total'];
    if (typeof t === 'number' && !Number.isNaN(t)) return t;
    const n = Number(t);
    return Number.isNaN(n) ? 0 : n;
  }

  trackRow(i: number): number { return i; }

  sunatBlock(exp: Record<string, unknown>): Record<string, unknown> | null {
    const d = this.getData(exp);
    const s = d['sunatValidation'];
    return (s && typeof s === 'object') ? s as Record<string, unknown> : null;
  }

  reviewHistory(exp: Record<string, unknown>): Record<string, unknown>[] {
    const r = exp['reviewHistory'];
    return Array.isArray(r) ? r.filter(Boolean) as Record<string, unknown>[] : [];
  }

  reviewActionLabel(action: unknown): string {
    return action === 'rejected' ? 'Rechazado' : 'Aprobado';
  }

  reviewDateText(v: unknown): string {
    if (typeof v !== 'string' || !v) return '—';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  getTotal(exp: Record<string, unknown>): number {
    const t = exp['total'];
    if (typeof t === 'number' && !Number.isNaN(t)) return t;
    const n = Number(t);
    return Number.isNaN(n) ? 0 : n;
  }

  getFileUrl(exp: Record<string, unknown>): string | null {
    const f = exp['file'];
    return (typeof f === 'string' && f.trim()) ? f.trim() : null;
  }

  hasFile(exp: Record<string, unknown>): boolean { return this.getFileUrl(exp) !== null; }

  isPreviewImage(exp: Record<string, unknown>): boolean {
    const u = this.getFileUrl(exp);
    return u ? /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(u) : false;
  }

  openFile(exp: Record<string, unknown>): void {
    const url = this.getFileUrl(exp);
    url ? window.open(url, '_blank', 'noopener,noreferrer') : this.notifications.show('Sin documento adjunto', 'warning');
  }

  getPopulatedName(field: unknown): string {
    if (field && typeof field === 'object' && 'name' in field) return String((field as any).name);
    return '—';
  }

  getProjectName(exp: Record<string, unknown>): string {
    const p = exp['proyectId'];
    if (p && typeof p === 'object' && 'name' in p) return String((p as any).name) || '—';
    return '—';
  }

  getStatusForUi(exp: Record<string, unknown>): string {
    if (exp['observado'] === true) return 'Observado';
    const st = String(exp['status'] || 'pending').toLowerCase();
    const labels: Record<string, string> = {
      pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado',
      sunat_valid: 'Validado SUNAT', sunat_valid_not_ours: 'SUNAT (no propio)',
      sunat_not_found: 'SUNAT no encontrado', sunat_error: 'Error SUNAT',
    };
    return labels[st] ?? 'Pendiente';
  }

  getDocNumber(exp: Record<string, unknown>): string {
    const type = exp['expenseType'];
    if (type === 'planilla_movilidad') {
      return (typeof exp['internalCode'] === 'string' && exp['internalCode']) ? exp['internalCode'] as string : '-';
    }
    if (type === 'recibo_caja') {
      const d = this.getData(exp);
      const payload = d['payload'];
      const p: Record<string, unknown> = typeof payload === 'string' ? (() => { try { return JSON.parse(payload); } catch { return {}; } })() : (payload && typeof payload === 'object' ? payload as Record<string, unknown> : {});
      return p['numeroDocumento'] ? String(p['numeroDocumento']) : '-';
    }
    const d = this.getData(exp);
    const serie = d['serie'] ? String(d['serie']) : '';
    const corr = d['correlativo'] ? String(d['correlativo']) : '';
    if (serie && corr) return `${serie}-${corr}`;
    return serie || corr || '-';
  }

  getProveedor(exp: Record<string, unknown>): string {
    const type = exp['expenseType'];
    if (type === 'planilla_movilidad' || type === 'otros_gastos') return '-';
    const d = this.getData(exp);
    const r = d['razonSocial'];
    if (typeof r === 'string' && r.trim()) return r.trim();
    const p = exp['provider'];
    if (typeof p === 'string' && p.trim()) return p.trim();
    return '-';
  }

  getConcepto(exp: Record<string, unknown>): string {
    const type = exp['expenseType'];
    if (type === 'planilla_movilidad') {
      const rows: any[] = (exp['mobilityRows'] as any[]) || [];
      const first = rows[0];
      return first?.gestion || `${rows.length} filas`;
    }
    if (type === 'otros_gastos') return exp['description'] as string || 'DJ firmada';
    const d = this.getData(exp);
    return String(d['concepto'] || '');
  }

  getComentario(exp: Record<string, unknown>): string {
    const top = exp['comentario'];
    if (typeof top === 'string' && top.trim()) return top.trim();
    return String(this.getData(exp)['comentario'] || '');
  }

  getPlaca(exp: Record<string, unknown>): string {
    const top = exp['placaVehiculo'];
    if (typeof top === 'string' && top.trim()) return top.trim();
    return String(this.getData(exp)['placaVehiculo'] || '');
  }

  getApprovalContStatus(exp: Record<string, unknown>): string {
    return (exp['contabilidadStatus'] as string) ?? 'pending';
  }

  // ─── Cadena de aprobación por centro de costo ────────────────────────────────

  private chainStepApproverNames(step: Record<string, unknown> | undefined): string {
    const approverIds = (step?.['approverIds'] as any[]) ?? [];
    if (!approverIds.length) return '—';
    return approverIds
      .map((a: any) => (typeof a === 'object' ? (a.name ?? a._id) : a))
      .join(' / ');
  }

  private getApprovalLevel(exp: Record<string, unknown>): number {
    return (exp['approvalLevel'] as number) ?? 0;
  }

  /** Cadena ordenada de niveles del comprobante, con estado y aprobador(es) de cada paso. */
  chainSteps(exp: Record<string, unknown>): Array<{
    level: number;
    state: 'completado' | 'pendiente' | 'futuro';
    approverNames: string;
    escalatedFrom?: number;
    approvedBy?: string;
    date?: string;
  }> {
    const chain = (exp['approverChain'] as any[]) ?? [];
    const approvalLevel = this.getApprovalLevel(exp);
    const history = (exp['approvalHistory'] as any[]) ?? [];
    return chain.map((step: any, idx: number) => {
      const state: 'completado' | 'pendiente' | 'futuro' =
        idx < approvalLevel ? 'completado' : idx === approvalLevel ? 'pendiente' : 'futuro';
      const entry = history.find((h: any) => h.level === step.level);
      return {
        level: step.level,
        state,
        approverNames: this.chainStepApproverNames(step),
        escalatedFrom: step.escalatedFrom,
        approvedBy: entry?.approvedBy,
        date: entry?.date,
      };
    });
  }

  canEdit(exp: Record<string, unknown>): boolean {
    if (!this.userState.isColaborador()) return false;
    const reportStatus = exp['_reportStatus'] as string | undefined;
    if (reportStatus && ['approved', 'closed', 'cancelled'].includes(reportStatus)) return false;
    const st = String(exp['status'] ?? 'pending').toLowerCase();
    // Un comprobante rechazado puede corregirlo el colaborador; solo queda
    // bloqueado cuando ya está aprobado.
    return st !== 'approved';
  }
}
