import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { AdvanceService } from '../../../services/advance.service';
import { UserStateService } from '../../../services/user-state.service';
import { NotificationService } from '../../../services/notification.service';
import {
  IAdvance,
  IAdvanceLine,
  ADVANCE_STATUS_LABELS,
  ADVANCE_STATUS_COLORS,
} from '../../../interfaces/advance.interface';

type JsPdfAT = jsPDF & { lastAutoTable?: { finalY: number } };

@Component({
  selector: 'app-viaticos-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './viaticos-detail.component.html',
})
export class ViaticosDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private advanceService = inject(AdvanceService);
  private userState = inject(UserStateService);
  private notifications = inject(NotificationService);
  private fb = inject(FormBuilder);

  readonly STATUS_LABELS = ADVANCE_STATUS_LABELS;
  readonly STATUS_COLORS = ADVANCE_STATUS_COLORS;

  isLoading = signal(true);
  isActing = signal(false);
  isDownloading = signal(false);
  advance = signal<IAdvance | null>(null);

  showRejectModal = signal(false);
  showCancelModal = signal(false);
  isCancelling = signal(false);
  rejectForm!: FormGroup;

  private get currentUserId(): string {
    return (this.userState.getUser() as any)?._id ?? '';
  }

  private get isSuperAdmin(): boolean {
    return this.userState.isSuperAdmin();
  }

  private get advanceOwnerId(): string {
    const u = this.advance()?.userId;
    return u && typeof u === 'object' ? (u as any)._id : (u ?? '');
  }

  /** Id del aprobador cuyo turno es ahora, o vacío si no hay cadena. */
  private get expectedApproverId(): string {
    const a = this.advance();
    if (!a) return '';
    const entry = a.approverChain?.[a.approvalLevel];
    if (!entry) return '';
    return typeof entry === 'object' ? entry._id : entry;
  }

  pendingApproverName(): string {
    const a = this.advance();
    const entry = a?.approverChain?.[a.approvalLevel];
    if (!entry) return '—';
    return typeof entry === 'object' ? ((entry as any).name ?? entry._id) : entry;
  }

  get canCancelAction(): boolean {
    const a = this.advance();
    return !!a && a.status === 'pending_l1' && this.currentUserId === this.advanceOwnerId;
  }

  ngOnInit() {
    this.rejectForm = this.fb.group({
      rejectionReason: ['', [Validators.required, Validators.minLength(10)]],
    });
    const id = this.route.snapshot.paramMap.get('id')!;
    this.advanceService.findOne(id).subscribe({
      next: (a) => { this.advance.set(a); this.isLoading.set(false); },
      error: () => { this.notifications.show('No se pudo cargar la solicitud', 'error'); this.router.navigate(['/rendiciones']); },
    });
  }

  back() { this.router.navigate(['/rendiciones']); }

  get canApproveAction(): boolean {
    const a = this.advance();
    if (!a || a.status !== 'pending_l1') return false;
    return this.isSuperAdmin || this.expectedApproverId === this.currentUserId;
  }

  get canRejectAction(): boolean {
    return this.canApproveAction;
  }

  approve() {
    const a = this.advance();
    if (!a) return;
    this.isActing.set(true);
    this.advanceService.approve(a._id, {}).subscribe({
      next: (updated) => {
        this.advance.set(updated);
        this.notifications.show(`Solicitud aprobada (nivel ${a.approvalLevel + 1} de ${a.requiredLevels})`, 'success');
        this.isActing.set(false);
      },
      error: (e) => {
        this.notifications.show(e?.error?.message || 'Error al aprobar', 'error');
        this.isActing.set(false);
      },
    });
  }

  confirmReject() {
    const a = this.advance();
    if (!a || this.rejectForm.invalid) return;
    this.isActing.set(true);
    this.advanceService.reject(a._id, this.rejectForm.value).subscribe({
      next: (updated) => {
        this.advance.set(updated);
        this.notifications.show('Solicitud rechazada', 'success');
        this.showRejectModal.set(false);
        this.isActing.set(false);
      },
      error: (e) => {
        this.notifications.show(e?.error?.message || 'Error al rechazar', 'error');
        this.isActing.set(false);
      },
    });
  }

  doCancel() {
    const a = this.advance();
    if (!a) return;
    this.isCancelling.set(true);
    this.advanceService.cancelAdvance(a._id).subscribe({
      next: (updated) => {
        this.advance.set(updated);
        this.showCancelModal.set(false);
        this.isCancelling.set(false);
        this.notifications.show('Solicitud cancelada.', 'success');
      },
      error: (e) => {
        this.isCancelling.set(false);
        this.notifications.show(e?.error?.message || 'Error al cancelar la solicitud.', 'error');
      },
    });
  }

  collaboratorName(): string {
    const u = this.advance()?.userId;
    return u && typeof u === 'object' ? u.name : '—';
  }

  collaboratorEmail(): string {
    const u = this.advance()?.userId;
    return u && typeof u === 'object' ? u.email : '';
  }

  projectLabel(): string {
    const p = this.advance()?.projectId;
    if (!p || typeof p === 'string') return '—';
    return p.code ? `${p.code} — ${p.name}` : p.name;
  }

  dateRange(): string {
    const a = this.advance();
    if (!a) return '—';
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
    if (a.startDate && a.endDate) return `${fmt(a.startDate)} al ${fmt(a.endDate)}`;
    if (a.startDate) return fmt(a.startDate);
    return '—';
  }

  createdAt(): string {
    const c = this.advance()?.createdAt;
    if (!c) return '—';
    return new Date(c).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  lines(): IAdvanceLine[] {
    return this.advance()?.lines ?? [];
  }

  categoryName(line: IAdvanceLine): string {
    const c = line.categoryId;
    if (c && typeof c === 'object' && 'name' in c) return (c as { name: string }).name;
    return '—';
  }

  historyActionLabel(action: string): string {
    const map: Record<string, string> = {
      approved: 'Aprobado',
      rejected: 'Rechazado',
      resubmitted: 'Reenviado',
    };
    return map[action] ?? action;
  }

  private approverStepName(a: IAdvance, level: number): string {
    const entry = a.approverChain?.[level - 1];
    if (!entry) return `Aprobador ${level}`;
    const name = typeof entry === 'object' ? (entry as any).name : undefined;
    return name ? `Aprobado por ${name}` : `Aprobador ${level}`;
  }

  pipelineSteps(): Array<{
    label: string;
    state: 'completed' | 'active' | 'upcoming' | 'rejected';
    date?: string;
    description?: string;
    notes?: string;
  }> {
    const a = this.advance();
    if (!a) return [];

    const chainLength = Math.max(a.requiredLevels, 1);
    const status = a.status;
    const history = a.approvalHistory;

    // Posiciones: 1..chainLength son los aprobadores; chainLength+1 es el pago.
    const payPos = chainLength + 1;
    const activeStep = status === 'approved' || status === 'partially_paid' || status === 'paid' || status === 'settled'
      ? payPos
      : Math.min(a.approvalLevel + 1, chainLength);

    const stateFor = (pos: number): 'completed' | 'active' | 'upcoming' | 'rejected' => {
      if (status === 'rejected') {
        const rejEntry = [...history].reverse().find(h => h.action === 'rejected');
        const rejPos = rejEntry?.level ?? 1;
        if (pos < rejPos) return 'completed';
        if (pos === rejPos) return 'rejected';
        return 'upcoming';
      }
      if (pos < activeStep) return 'completed';
      if (pos === activeStep) return 'active';
      return 'upcoming';
    };

    const fmt = (d?: string) =>
      d ? new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;

    const steps: Array<{ label: string; state: ReturnType<typeof stateFor>; date?: string; description?: string; notes?: string }> = [
      { label: 'Solicitud enviada', state: 'completed', date: fmt(a.createdAt) },
    ];

    for (let level = 1; level <= chainLength; level++) {
      const entry = history.find(h => h.level === level && h.action === 'approved');
      const s = stateFor(level);
      steps.push({
        label: this.approverStepName(a, level),
        state: s,
        date: fmt(entry?.date),
        description: s === 'active' ? `Pendiente de aprobación (nivel ${level} de ${chainLength})` : undefined,
        notes: entry?.notes,
      });
    }

    const payS = stateFor(payPos);
    steps.push({
      label: 'Pago registrado',
      state: payS,
      date: fmt(a.paymentInfo?.transferDate),
      description: payS === 'active' ? 'Pendiente de registro de pago' : undefined,
    });

    return steps;
  }

  // ── Helpers compartidos ──────────────────────────────────────────────────

  private exportData() {
    const a = this.advance()!;
    const user = a.userId as any;
    const project = a.projectId as any;
    const bank = user?.bankAccount;

    const responsible = user?.name ?? '—';
    const dni = user?.dni ?? '—';
    const nroCuenta = bank?.accountNumber ?? '';
    const cci = bank?.cci ?? '';
    const accountStr = [nroCuenta, cci ? `CCI: ${cci}` : ''].filter(Boolean).join('  /  ') || '—';
    const peopleMax = a.lines?.length
      ? Math.max(...a.lines.map((l) => l.peopleCount))
      : 0;
    const place = a.place ?? '—';
    const fmt = (d?: string) =>
      d ? new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const startFmt = fmt(a.startDate);
    const endFmt = fmt(a.endDate);
    const projectName = project && typeof project === 'object' ? project.name : '—';
    const lines = a.lines ?? [];
    const catName = (ln: IAdvanceLine) =>
      typeof ln.categoryId === 'object' && 'name' in (ln.categoryId as any)
        ? (ln.categoryId as any).name
        : '—';

    return { a, responsible, accountStr, dni, peopleMax, place, startFmt, endFmt, projectName, lines, catName };
  }

  private filename(ext: string) {
    const id = this.advance()?._id?.slice(-8) ?? 'doc';
    return `solicitud-viaticos-${id}.${ext}`;
  }

  // ── PDF ──────────────────────────────────────────────────────────────────

  private async loadLogoBase64(): Promise<string | null> {
    try {
      const res = await fetch('logo_header.png');
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  async downloadPdf(): Promise<void> {
    const a = this.advance();
    if (!a || this.isDownloading()) return;
    this.isDownloading.set(true);

    const logoBase64 = await this.loadLogoBase64();

    try {
      const { responsible, accountStr, dni, peopleMax, place, startFmt, endFmt, projectName, lines, catName } =
        this.exportData();

      const DARK_RED: [number, number, number] = [126, 29, 29];
      const WHITE: [number, number, number] = [255, 255, 255];
      const LIGHT: [number, number, number] = [248, 243, 243];
      const BLACK: [number, number, number] = [30, 30, 30];

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as JsPdfAT;
      const pageW = doc.internal.pageSize.getWidth();
      const M = 14;
      const W = pageW - M * 2;

      // ── Logo (fuera del recuadro) ──
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', M, 6, 42, 15);
      }

      // ── Título ──
      const HEADER_H = 10;
      const headerY = 23;
      doc.setFillColor(...DARK_RED);
      doc.rect(M, headerY, W, HEADER_H, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...WHITE);
      doc.text('SOLICITUD DE VIÁTICOS', pageW / 2, headerY + HEADER_H / 2 + 2, { align: 'center' });

      // ── Info section ──
      // Col widths: label 72, rest distributed across 5 cols = 110
      const COL_LABEL = 72;
      const COL_REST = W - COL_LABEL;

      autoTable(doc, {
        startY: 36,
        margin: { left: M, right: M },
        theme: 'plain',
        styles: { fontSize: 8.5, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 }, textColor: BLACK, lineWidth: 0.2, lineColor: [200, 200, 200] },
        body: [
          [{ content: 'Responsable:', styles: { fontStyle: 'bold' } }, { content: responsible, colSpan: 5 }],
          [{ content: 'N° cuenta  y CCI', styles: { fontStyle: 'bold' } }, { content: accountStr, colSpan: 5 }],
          [{ content: 'Documento de identificación en caso sea CCI', styles: { fontStyle: 'bold' } }, { content: dni, colSpan: 5 }],
          [{ content: 'Cantidad de Personas (nombres):', styles: { fontStyle: 'bold' } }, { content: String(peopleMax), colSpan: 5 }],
          [{ content: 'Lugar:', styles: { fontStyle: 'bold' } }, { content: place, colSpan: 5 }],
          [
            { content: 'Tiempo presupuestado:', styles: { fontStyle: 'bold' } },
            { content: 'Del .....' }, { content: startFmt },
            { content: 'Al .....' }, { content: endFmt, colSpan: 2 },
          ],
          [{ content: 'Proyecto:', styles: { fontStyle: 'bold' } }, { content: projectName, colSpan: 5 }],
        ],
        columnStyles: {
          0: { cellWidth: COL_LABEL },
          1: { cellWidth: 16 },
          2: { cellWidth: 28 },
          3: { cellWidth: 16 },
          4: { cellWidth: 28 },
          5: { cellWidth: COL_REST - 16 - 28 - 16 - 28 },
        },
      });

      // ── Tabla de líneas ──
      const tableY = (doc.lastAutoTable?.finalY ?? 23) + 4;

      const tableRows = lines.map((ln) => [
        catName(ln),
        ln.detalle ?? '',
        `S/ ${ln.importe.toFixed(2)}`,
        String(ln.peopleCount),
        ln.glpPerDay > 0 ? ln.glpPerDay.toFixed(2) : '—',
        String(ln.days),
        `S/ ${ln.lineTotal.toFixed(2)}`,
      ]);

      autoTable(doc, {
        startY: tableY,
        margin: { left: M, right: M },
        head: [['Viáticos', 'Detalle', 'Importe', 'Cantidad\nde personas', 'Combustible\nGLP x dia', 'Días', 'Total']],
        body: [
          ...tableRows,
          [
            {
              content: 'TOTAL',
              colSpan: 6,
              styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: DARK_RED, textColor: WHITE },
            },
            {
              content: `S/ ${a.amount.toFixed(2)}`,
              styles: { halign: 'right' as const, fontStyle: 'bold' as const, fillColor: DARK_RED, textColor: WHITE },
            },
          ],
        ],
        headStyles: {
          fillColor: DARK_RED, textColor: WHITE, fontStyle: 'bold',
          halign: 'center', valign: 'middle', fontSize: 8,
          cellPadding: { top: 3, bottom: 3, left: 1.5, right: 1.5 },
          lineWidth: 0.3, lineColor: [160, 40, 40],
        },
        styles: {
          fontSize: 8.5, textColor: BLACK,
          cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
          lineWidth: 0.2, lineColor: [200, 200, 200],
          valign: 'middle', overflow: 'linebreak',
        },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: {
          0: { cellWidth: 44 },
          1: { cellWidth: 'auto' },
          2: { halign: 'right' as const, cellWidth: 22 },
          3: { halign: 'center' as const, cellWidth: 24 },
          4: { halign: 'center' as const, cellWidth: 26 },
          5: { halign: 'center' as const, cellWidth: 14 },
          6: { halign: 'right' as const, cellWidth: 22 },
        },
      });

      doc.save(this.filename('pdf'));
    } finally {
      this.isDownloading.set(false);
    }
  }

  // ── Excel ────────────────────────────────────────────────────────────────

  async downloadExcel(): Promise<void> {
    const a = this.advance();
    if (!a || this.isDownloading()) return;
    this.isDownloading.set(true);

    try {
      const logoBase64 = await this.loadLogoBase64();

      const { responsible, accountStr, dni, peopleMax, place, startFmt, endFmt, projectName, lines, catName } =
        this.exportData();

      const DR = 'FF7E1D1D';
      const WH = 'FFFFFFFF';
      const LT = 'FFF8F3F3';
      const GR = 'FFD0D0D0';

      const borderThin = (color = GR): Partial<ExcelJS.Border> => ({ style: 'thin', color: { argb: color } });
      const allBorders = (color = GR): Partial<ExcelJS.Borders> => ({
        top: borderThin(color), left: borderThin(color), bottom: borderThin(color), right: borderThin(color),
      });

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Viatika';
      const ws = wb.addWorksheet('Solicitud Viáticos');

      ws.columns = [
        { width: 40 },
        { width: 30 },
        { width: 16 },
        { width: 20 },
        { width: 24 },
        { width: 14 },
        { width: 16 },
      ];

      // ── Logo (fila 1, fuera del recuadro) ──
      ws.mergeCells('A1:G1');
      ws.getRow(1).height = 44;
      if (logoBase64) {
        const logoData = logoBase64.replace(/^data:[^;]+;base64,/, '');
        const imgId = wb.addImage({ base64: logoData, extension: 'png' });
        ws.addImage(imgId, { tl: { col: 0, row: 0 } as any, ext: { width: 142, height: 42 } });
      }

      // ── Título (fila 2) ──
      ws.mergeCells('A2:G2');
      const title = ws.getCell('A2');
      title.value = 'SOLICITUD DE VIÁTICOS';
      title.font = { bold: true, size: 13, color: { argb: WH } };
      title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DR } };
      title.alignment = { horizontal: 'center', vertical: 'middle' };
      title.border = allBorders('FF7E1D1D');
      ws.getRow(2).height = 26;

      // ── Helper: info row ──
      const addInfoRow = (label: string, value: string, rowIdx: number, mergeValue = true) => {
        const row = ws.addRow([label, value, '', '', '', '', '']);
        if (mergeValue) ws.mergeCells(`B${rowIdx}:G${rowIdx}`);
        row.height = 18;
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.font = col === 1 ? { bold: true, size: 9.5 } : { size: 9.5 };
          cell.border = allBorders();
          cell.alignment = { vertical: 'middle' };
        });
      };

      addInfoRow('Responsable:', responsible, 3);
      addInfoRow('N° cuenta  y CCI', accountStr, 4);
      addInfoRow('Documento de identificación en caso sea CCI', dni, 5);
      addInfoRow('Cantidad de Personas (nombres):', String(peopleMax), 6);
      addInfoRow('Lugar:', place, 7);

      // Tiempo presupuestado (row 8)
      const timeRow = ws.addRow(['Tiempo presupuestado:', 'Del .....', startFmt, 'Al .....', endFmt, '', '']);
      ws.mergeCells(timeRow.number, 5, timeRow.number, 7);
      timeRow.height = 18;
      timeRow.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = col === 1 ? { bold: true, size: 9.5 } : { size: 9.5 };
        cell.border = allBorders();
        cell.alignment = { vertical: 'middle' };
      });

      addInfoRow('Proyecto:', projectName, 9);

      // ── Separador ──
      ws.addRow([]);

      // ── Encabezado tabla (row 11) ──
      const hRow = ws.addRow([
        'Viáticos', 'Detalle', 'Importe', 'Cantidad de personas',
        'Combustible GLP x dia', 'Días', 'Total',
      ]);
      hRow.height = 36;
      hRow.eachCell((cell) => {
        cell.font = { bold: true, size: 9.5, color: { argb: WH } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DR } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = allBorders('FF5C1515');
      });

      // ── Líneas ──
      const numFmt = '"S/ "#,##0.00';
      const numFmtPlain = '#,##0.00';

      lines.forEach((ln, i) => {
        const dRow = ws.addRow([
          catName(ln),
          ln.detalle ?? '',
          ln.importe,
          ln.peopleCount,
          ln.glpPerDay,
          ln.days,
          ln.lineTotal,
        ]);
        dRow.height = 18;
        dRow.eachCell({ includeEmpty: true }, (cell, col) => {
          if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LT } };
          cell.font = { size: 9.5 };
          cell.border = allBorders();
          if (col === 1 || col === 2) {
            cell.alignment = { vertical: 'middle' };
          } else if (col === 3 || col === 7) {
            cell.numFmt = numFmt;
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          } else if (col === 4 || col === 6) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.numFmt = numFmtPlain;
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        });
      });

      // ── Fila TOTAL ──
      const totalRowIdx = 11 + lines.length + 1;
      const tRow = ws.addRow(['TOTAL', '', '', '', '', '', a.amount]);
      ws.mergeCells(`A${totalRowIdx}:F${totalRowIdx}`);
      tRow.height = 22;
      tRow.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { bold: true, size: 10, color: { argb: WH } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DR } };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.border = allBorders('FF5C1515');
        if (col === 7) cell.numFmt = numFmt;
      });

      // ── Guardar ──
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = this.filename('xlsx');
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      this.isDownloading.set(false);
    }
  }
}
