import { Injectable, inject } from '@angular/core';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CompanyConfigService } from './company-config.service';
import { parseFechaEmisionInput } from '../utils/fecha-emision.util';

type JsPdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

function afterTable(doc: jsPDF): number {
  const d = doc as JsPdfWithAutoTable;
  return d.lastAutoTable?.finalY ?? 14;
}

export interface RendicionExportComprobanteRow {
  tipo: string;
  fecha: string;
  descripcion: string;
  /** Monto del gasto en SOLES (columna SOLES del formato ADF-FOR-004). */
  monto: number;
  estadoComprobante: string;
  proveedor?: string;
  numeroDocumento?: string;
  comentario?: string;
  placaVehiculo?: string;
  /** Proyecto del gasto (Rendiciones Directas: el proyecto es individual por comprobante). */
  proyecto?: string;
  // --- Columnas contables del formato ADF-FOR-004 (Rendición de Fondos) ---
  /** RUC del emisor del comprobante. */
  ruc?: string;
  /** Nombre de la Orden de Trabajo del gasto. */
  ot?: string;
  /** Centro de costo (nombre) del gasto, derivado de la OT. */
  centroCosto?: string;
  /** Cuenta contable de destino. Pendiente de definir con el cliente: por ahora vacío. */
  ctaDestino?: string;
  /** Monto en dólares cuando la moneda del gasto es USD. */
  dolares?: number;
  /** Tipo de cambio aplicado (si el gasto está en USD y se capturó). */
  tipoCambio?: number;
}

export interface RendicionExportAnticipoRow {
  descripcion: string;
  monto: number;
  estado: string;
  fechaSolicitud: string;
}

export interface RendicionExportBudgetItemRow {
  descripcion: string;
  importe: number;
  personas: number;
  combustible: number;
  dias: number;
  total: number;
}

export interface RendicionExportSettlement {
  advanceTotal: number;
  expenseTotal: number;
  difference: number;
  typeLabel: string;
}

/** Datos normalizados para exportar el detalle de una rendición. */
export interface RendicionExportData {
  fileBaseName: string;
  titulo: string;
  estado: string;
  codigo?: string;
  gestion?: string;
  descripcionRendicion?: string;
  colaborador: string;
  presupuesto: number;
  totalGastado: number;
  totalAnticipado: number;
  saldoLibre: number;
  fechaGeneracion: string;
  rejectionReason?: string;
  comprobantes: RendicionExportComprobanteRow[];
  anticipos: RendicionExportAnticipoRow[];
  settlement?: RendicionExportSettlement;
  accountNumber?: string;
  idDocument?: string;
  peopleNames?: string[];
  location?: string;
  startDate?: string;
  endDate?: string;
  items?: RendicionExportBudgetItemRow[];
  signature?: string;
  approvedByName?: string;
  createdByName?: string;
  projectName?: string;
  // --- Cabecera contable del formato ADF-FOR-004 (Rendición de Fondos) ---
  /** N° de rendición (correlativo/código del reporte). */
  nRendicion?: string;
  /** Fecha del documento (emisión de la rendición). */
  fechaDocumento?: string;
  /** Concepto/motivo global de la rendición. */
  concepto?: string;
  /** Destino del gasto/viaje. */
  destino?: string;
  /** Departamento (área) del colaborador. */
  departamento?: string;
  /** Periodo (mes) de la rendición. */
  periodo?: string;
  /** Centro de costo de cabecera (de la OT de la rendición). */
  centroCostoCabecera?: string;
  /** Monto inicial entregado al colaborador (suma de anticipos/depósitos). */
  montoInicialEntregado?: number;
  /** Nombre del Jefe Inmediato (aprobador) para el recuadro V°B° JEFE INMEDIATO. */
  jefeInmediatoName?: string;
  /** Firma del Jefe Inmediato, si existe. */
  jefeSignature?: string;
  /** Nombre de Finanzas para el recuadro V°B° FINANZAS. */
  financeName?: string;
  /** Firma de Finanzas, si existe. */
  financeSignature?: string;
  /**
   * Rendición directa: el proyecto no es único de la rendición sino individual
   * por gasto. En el reporte se omite el proyecto del título y se añade una
   * columna "Proyecto" en la tabla de comprobantes.
   */
  isDirecta?: boolean;
  /** Saldos de la bolsa (pagos de contabilidad / remanentes) que financiaron la rendición directa. */
  financiamientoSaldos?: { tipo: string; detalle: string; monto: number; fecha?: string }[];
}

export interface AffidavitExportRow {
  fecha: string;
  documento: string;
  concepto: string;
  categoria: string;
  monto: number;
}

export interface AffidavitExportData {
  fileBaseName: string;
  tipo: 'viaticos_nacionales' | 'viajes_exterior';
  empresaNombre: string;
  empresaRuc: string;
  colaborador: string;
  documentoColaborador?: string;
  fechaGeneracion: string;
  total: number;
  rows: AffidavitExportRow[];
  signature?: string;
}

export interface MobilitySheetExportData {
  fileBaseName: string;
  collaborator: string;
  collaboratorDni?: string;
  internalCode?: string;
  location?: string;
  generatedAt: string;
  periodo?: string;
  proyecto?: string;
  rows: Array<{
    fecha: string;
    origen: string;
    destino: string;
    gestion: string;
    total: number;
    /** Proyecto propio de la fila. Si falta, se usa `proyecto` (nivel planilla). */
    proyecto?: string;
    /** Colaborador (trabajador) propio de la fila. */
    colaborador?: string;
  }>;
  total: number;
  signature?: string;
  /** Coordinador que aprobó (VD-33): su firma aparece junto a la del colaborador. */
  coordinator?: string;
  coordinatorDni?: string;
  coordinatorSignature?: string;
}

export interface ReceiptExportData {
  fileBaseName: string;
  collaborator: string;
  collaboratorDni?: string;
  razonSocial: string;
  ruc?: string;
  numeroDocumento?: string;
  concepto: string;
  fecha: string;
  monto: number;
  signature?: string;
}

export interface SingleExpenseAffidavitData {
  fileBaseName: string;
  titulo: string;
  colaborador: string;
  colaboradorDni?: string;
  empresaNombre?: string;
  fechaGeneracion: string;
  total: number;
  mobilityRows?: MobilitySheetExportData['rows'];
  receiptFields?: Array<{ label: string; value: string }>;
  descripcion?: string;
  signature?: string;
}

export interface FacturaPageData {
  tipo: string;
  razonSocial?: string;
  rucEmisor?: string;
  serie?: string;
  correlativo?: string;
  fechaEmision?: string;
  montoTotal?: number;
  moneda?: string;
  comentario?: string;
  placaVehiculo?: string;
  descripcion?: string;
  index: number;
}

export type ComprobantePage =
  | { type: 'factura'; data: FacturaPageData }
  | { type: 'factura_image'; url: string; label: string }
  | { type: 'factura_pdf'; url: string; label: string }
  | { type: 'mobility'; data: MobilitySheetExportData }
  | { type: 'receipt'; data: ReceiptExportData }
  | { type: 'affidavit'; data: SingleExpenseAffidavitData };

const RED_HEADER = 'FF912f2c'; // Dark red for headers
const YELLOW_CELL = 'FFFFFF00'; // Yellow for summary cell

@Injectable({ providedIn: 'root' })
export class RendicionExportService {
  private companyConfigService = inject(CompanyConfigService);

  /**
   * Convierte cada carácter fuera de Latin-1 imprimible a un equivalente seguro
   * (WinAnsi). La fuente estándar de jsPDF (Helvetica no embebida) no tiene glifos
   * para flechas/comillas tipográficas/control; si aparece uno, el visor sustituye
   * la fuente de TODA la cadena por una más ancha y el texto se sale del PDF
   * (jsPDF lo mide con Helvetica, más angosta). También limpia el Excel.
   */
  private sanitizeText(s?: string): string {
    return Array.from(String(s ?? '').normalize('NFC'))
      .map((ch) => {
        const c = ch.charCodeAt(0);
        if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) return ''; // control
        if (c === 0xa0) return ' '; // espacio duro (nbsp)
        if (c >= 0x2010 && c <= 0x2015) return '-'; // guiones tipográficos
        if (c === 0x2212) return '-'; // signo menos
        if (c === 0x2018 || c === 0x2019 || c === 0x201b) return "'"; // comillas simples
        if (c === 0x201c || c === 0x201d) return '"'; // comillas dobles
        if (c === 0x2026) return '...'; // elipsis
        if (c >= 0x2190 && c <= 0x27bf) return '-'; // flechas/símbolos -> guion
        if (c > 0xff) return ''; // resto fuera de Latin-1
        return ch;
      })
      .join('')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  private formatDateDdMmYyyy(raw: string | null | undefined): string {
    if (!raw) return '';
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const [y, m, day] = raw.slice(0, 10).split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(raw);
    }
    if (isNaN(d.getTime())) return raw;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  /**
   * Normaliza una firma a un data URL base64 PNG.
   * - Si ya es un data URL, lo devuelve tal cual.
   * - Si es una URL HTTP/HTTPS (subida vía S3 desde Configuración de Firma Digital),
   *   la descarga y la convierte a data URL para poder embeberla en Excel/PDF.
   */
  private async resolveSignature(sig?: string): Promise<string | undefined> {
    if (!sig) return undefined;
    const trimmed = sig.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('data:')) return trimmed;
    if (!/^https?:\/\//i.test(trimmed)) return undefined;
    try {
      const response = await fetch(trimmed);
      if (!response.ok) return undefined;
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch {
      return undefined;
    }
  }

  private async getLogoBase64(): Promise<string | null> {
    const logoUrl = this.companyConfigService.getCompanyConfig()?.logo;
    const url = logoUrl || '/logo_header.png';
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      if (logoUrl) {
        // Retry with fallback
        try {
          const response = await fetch('/logo_header.png');
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch { return null; }
      }
      return null;
    }
  }

  /**
   * Excel de rendición con el formato oficial "RENDICIÓN DE FONDOS (GASTOS)"
   * (ADF-FOR-004). Replica el mismo layout que el PDF: Item + 11 columnas
   * contables, cabecera, pie de totales y tres firmas.
   */
  async exportToExcel(data: RendicionExportData): Promise<void> {
    data = {
      ...data,
      signature: await this.resolveSignature(data.signature),
      jefeSignature: await this.resolveSignature(data.jefeSignature),
      financeSignature: await this.resolveSignature(data.financeSignature),
    };
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Viatika';
    wb.created = new Date();
    const ws = wb.addWorksheet('Rendición', { views: [{ showGridLines: false }] });

    const allBorder = {
      top: { style: 'thin' as const }, left: { style: 'thin' as const },
      bottom: { style: 'thin' as const }, right: { style: 'thin' as const },
    };

    // 12 columnas: ITEM·FECHA·RUC·No.DOC·PROVEEDOR·DESCRIPCIÓN·OT·C.COSTO·CTA.DESTINO·DÓLARES·T.C.·SOLES
    ws.columns = [
      { width: 6 },  // A ITEM
      { width: 12 }, // B FECHA
      { width: 14 }, // C RUC
      { width: 14 }, // D No. DOC
      { width: 26 }, // E PROVEEDOR
      { width: 34 }, // F DESCRIPCIÓN
      { width: 12 }, // G OT
      { width: 16 }, // H C.COSTO
      { width: 16 }, // I CTA. DESTINO
      { width: 11 }, // J DÓLARES
      { width: 9 },  // K T.C.
      { width: 12 }, // L SOLES
    ];

    // --- Membrete: logo + título + recuadro de control ---
    const logoB64 = await this.getLogoBase64();
    if (logoB64) {
      const imageId = wb.addImage({ base64: logoB64, extension: 'png' });
      ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 46 } });
    }

    ws.mergeCells('D1:I2');
    const titleCell = ws.getCell('D1');
    titleCell.value = 'RENDICIÓN DE FONDOS (GASTOS)';
    titleCell.font = { bold: true, size: 13 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Recuadro de control documentario (J..L).
    const controlLines: [string, string][] = [
      ['J1', 'Código: ADF-FOR-004'],
      ['J2', 'Versión: 01'],
      ['J3', 'F. Emisión: 18/04/2023'],
    ];
    controlLines.forEach(([addr, val], i) => {
      ws.mergeCells(`J${i + 1}:L${i + 1}`);
      const c = ws.getCell(addr);
      c.value = val;
      c.font = { size: 8 };
      c.border = allBorder;
    });
    // N° RENDICIÓN / FECHA.
    ws.getCell('J4').value = 'N° RENDICIÓN';
    ws.getCell('J4').font = { bold: true, size: 8 };
    ws.getCell('J4').border = allBorder;
    ws.mergeCells('K4:L4');
    ws.getCell('K4').value = this.sanitizeText(data.nRendicion || data.codigo || '');
    ws.getCell('K4').border = allBorder;
    ws.getCell('J5').value = 'FECHA';
    ws.getCell('J5').font = { bold: true, size: 8 };
    ws.getCell('J5').border = allBorder;
    ws.mergeCells('K5:L5');
    ws.getCell('K5').value = this.sanitizeText(data.fechaDocumento || '');
    ws.getCell('K5').border = allBorder;

    // --- Cabecera contable ---
    const setLabel = (addr: string, val: string) => {
      const c = ws.getCell(addr);
      c.value = val;
      c.font = { bold: true, size: 9 };
    };
    const setValue = (addr: string, val: string) => {
      ws.getCell(addr).value = this.sanitizeText(val);
    };
    setLabel('A6', 'NOMBRE:');
    ws.mergeCells('B6:E6'); setValue('B6', data.colaborador || '');
    setLabel('G6', 'CONCEPTO:');
    ws.mergeCells('H6:L6'); setValue('H6', data.concepto || '');

    setLabel('A7', 'DNI:');
    ws.mergeCells('B7:E7'); setValue('B7', data.idDocument || '');
    setLabel('G7', 'DESTINO:');
    ws.mergeCells('H7:I7'); setValue('H7', data.destino || data.location || '');
    setLabel('J7', 'CC:');
    ws.mergeCells('K7:L7'); setValue('K7', data.centroCostoCabecera || '');

    setLabel('A8', 'PERIODO/FECHA:');
    ws.mergeCells('B8:E8'); setValue('B8', data.periodo || '');
    setLabel('G8', 'DEPARTAMENTO (ÁREA):');
    ws.mergeCells('H8:L8'); setValue('H8', data.departamento || '');

    // --- Cabecera de tabla (fila 10) ---
    let r = 10;
    const headers = ['ITEM', 'FECHA', 'RUC', 'No. DOC', 'PROVEEDOR (RAZON SOCIAL)', 'DESCRIPCIÓN (DETALLE)', 'OT', 'C.COSTO', 'CTA. DESTINO', 'DÓLARES', 'T.C.', 'SOLES'];
    headers.forEach((h, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_HEADER } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = allBorder;
    });
    ws.getRow(r).height = 26;
    r++;

    // --- Filas de gastos ---
    let sumSoles = 0;
    const addDataRow = (vals: (string | number)[]) => {
      vals.forEach((val, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = val === 0 || val === '' ? '' : val;
        c.border = allBorder;
        if (i >= 9) {
          // DÓLARES (9), T.C. (10), SOLES (11)
          c.numFmt = i === 10 ? '#,##0.000' : '#,##0.00';
          c.alignment = { horizontal: 'right' };
        } else {
          // ITEM (0), FECHA (1), RUC (2), No. DOC (3), OT (6) centrados.
          c.alignment = { horizontal: i <= 3 || i === 6 ? 'center' : 'left', wrapText: true };
        }
      });
      r++;
    };

    data.comprobantes.forEach((exp, idx) => {
      addDataRow([
        idx + 1,
        this.sanitizeText(exp.fecha),
        this.sanitizeText(exp.ruc),
        this.sanitizeText(exp.numeroDocumento),
        this.sanitizeText(exp.proveedor),
        this.sanitizeText(exp.comentario || exp.descripcion),
        this.sanitizeText(exp.ot),
        this.sanitizeText(exp.centroCosto),
        this.sanitizeText(exp.ctaDestino),
        exp.dolares && exp.dolares > 0 ? exp.dolares : '',
        exp.tipoCambio && exp.tipoCambio > 0 ? exp.tipoCambio : '',
        exp.monto && exp.monto > 0 ? exp.monto : '',
      ]);
      sumSoles += exp.monto || 0;
    });

    // Filas vacías para aspecto de formulario (mínimo 8), numeradas de forma continua.
    const minRows = 8;
    let filled = data.comprobantes.length;
    while (filled < minRows) {
      addDataRow([filled + 1, '', '', '', '', '', '', '', '', '', '', '']);
      filled++;
    }

    // --- Pie de totales (etiqueta cols H..K sombreada, valor col L) ---
    const montoInicial = data.montoInicialEntregado ?? data.totalAnticipado ?? 0;
    const saldo = montoInicial - sumSoles;
    const totalRow = (label: string, val: number, isSaldo: boolean) => {
      ws.getRow(r).height = 16;
      ws.mergeCells(r, 8, r, 11);
      const l = ws.getCell(r, 8);
      l.value = label;
      l.font = {
        bold: true,
        size: 10,
        color: { argb: isSaldo ? 'FFFFFFFF' : 'FF000000' },
      };
      l.alignment = { horizontal: 'right', vertical: 'middle' };
      // Solo el SALDO lleva relleno (marca); las demás filas quedan transparentes.
      if (isSaldo) {
        l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_HEADER } };
      }
      l.border = allBorder;
      const v = ws.getCell(r, 12);
      v.value = val;
      v.numFmt = '#,##0.00';
      v.alignment = { horizontal: 'right', vertical: 'middle' };
      v.font = { bold: true, size: 10, color: { argb: 'FF000000' } };
      v.border = allBorder;
      r++;
    };
    totalRow('TOTAL GASTOS', sumSoles, false);
    totalRow('MONTO INICIAL ENTREGADO', montoInicial, false);
    totalRow('SALDO (REEMB. / DEV.)', saldo, true);

    // --- Resumen de solicitud (presupuesto), si aplica ---
    if (data.items && data.items.length > 0) {
      r += 2;
      ws.getCell(r, 1).value = 'RESUMEN DE SOLICITUD (PRESUPUESTO DETALLADO)';
      ws.getCell(r, 1).font = { bold: true };
      r++;
      const budgetHeaders = ['Viáticos', 'Importe (S/)', 'Personas', 'Combustible GLP/dia', 'Días', 'Total (S/)'];
      budgetHeaders.forEach((h, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = h;
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_HEADER } };
        c.alignment = { horizontal: 'center' };
        c.border = allBorder;
      });
      r++;
      data.items.forEach((item) => {
        ws.getCell(r, 1).value = item.descripcion;
        ws.getCell(r, 2).value = item.importe;
        ws.getCell(r, 3).value = item.personas;
        ws.getCell(r, 4).value = item.combustible;
        ws.getCell(r, 5).value = item.dias;
        ws.getCell(r, 6).value = item.total;
        [2, 4, 6].forEach((col) => (ws.getCell(r, col).numFmt = '#,##0.00'));
        for (let i = 1; i <= 6; i++) ws.getCell(r, i).border = allBorder;
        r++;
      });
    }

    // --- Tres firmas: SOLICITANTE / JEFE INMEDIATO / FINANZAS ---
    r += 2;
    const sigTitleRow = r;
    const drawSigBlock = (
      col1: number, col2: number, title: string, sig?: string, name?: string, dni?: string,
    ) => {
      ws.mergeCells(sigTitleRow, col1, sigTitleRow, col2);
      const t = ws.getCell(sigTitleRow, col1);
      t.value = title;
      t.font = { bold: true, size: 9 };
      t.alignment = { horizontal: 'center' };
      if (sig) {
        try {
          const imgId = wb.addImage({ base64: sig, extension: 'png' });
          ws.addImage(imgId, { tl: { col: col1 - 1 + 0.2, row: sigTitleRow }, ext: { width: 120, height: 50 } });
        } catch { /* firma inválida */ }
      }
      // Línea de firma.
      const lineRow = sigTitleRow + 3;
      ws.mergeCells(lineRow, col1, lineRow, col2);
      ws.getCell(lineRow, col1).border = { bottom: { style: 'medium' } };
      // Nombre.
      ws.mergeCells(lineRow + 1, col1, lineRow + 1, col2);
      const n = ws.getCell(lineRow + 1, col1);
      n.value = name && name !== '—' ? this.sanitizeText(name).toUpperCase() : '';
      n.alignment = { horizontal: 'center' };
      n.font = { size: 9 };
      // NOMBRE Y FIRMA.
      ws.mergeCells(lineRow + 2, col1, lineRow + 2, col2);
      const nf = ws.getCell(lineRow + 2, col1);
      nf.value = 'NOMBRE Y FIRMA';
      nf.alignment = { horizontal: 'center' };
      nf.font = { size: 8 };
      if (dni) {
        ws.mergeCells(lineRow + 3, col1, lineRow + 3, col2);
        const d = ws.getCell(lineRow + 3, col1);
        d.value = `DNI: ${dni}`;
        d.alignment = { horizontal: 'center' };
        d.font = { size: 8 };
      }
    };
    drawSigBlock(1, 4, 'V°B° SOLICITANTE', data.signature, data.colaborador, data.idDocument);
    drawSigBlock(5, 8, 'V°B° JEFE INMEDIATO', data.jefeSignature, data.jefeInmediatoName);
    drawSigBlock(9, 12, 'V°B° FINANZAS', data.financeSignature, data.financeName);

    const buf = await wb.xlsx.writeBuffer();
    this.triggerDownload(
      new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${data.fileBaseName}.xlsx`,
    );
  }

  /**
   * PDF de rendición con el formato oficial de Detroit "RENDICIÓN DE FONDOS
   * (GASTOS)" (ADF-FOR-004): membrete de control documentario, cabecera contable
   * (NOMBRE/DNI/PERIODO/CONCEPTO/DESTINO/CC/DEPARTAMENTO), tabla de 11 columnas
   * (FECHA·RUC·No.DOC·PROVEEDOR·DESCRIPCIÓN·OT·C.COSTO·CTA.DESTINO·DÓLARES·T.C.·SOLES),
   * pie TOTAL GASTOS / MONTO INICIAL ENTREGADO / SALDO y tres firmas.
   */
  async exportToPdf(data: RendicionExportData, inDoc?: jsPDF, returnBytes?: boolean): Promise<Uint8Array | void> {
    data = {
      ...data,
      signature: await this.resolveSignature(data.signature),
      jefeSignature: await this.resolveSignature(data.jefeSignature),
      financeSignature: await this.resolveSignature(data.financeSignature),
    };
    const doc = inDoc ?? new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const LM = 14;
    const RM = W - 14;

    // Formatos de número: celda vacía cuando no hay valor (como en el formato impreso).
    const money = (n?: number): string => (n != null && n > 0 ? n.toFixed(2) : '');
    const tc = (n?: number): string => (n != null && n > 0 ? n.toFixed(3) : '');
    // Saneado de texto (ver sanitizeText): evita glifos ausentes que ensanchan el
    // render y hacen que el texto se salga del PDF.
    const sanitize = (s?: string): string => this.sanitizeText(s);
    // Recorta un texto con "…" para que no se salga del ancho disponible (mm).
    // Debe llamarse con la fuente/tamaño ya seteados (usa getTextWidth).
    const clip = (text: string, maxW: number): string => {
      if (!text) return '';
      if (doc.getTextWidth(text) <= maxW) return text;
      let t = text;
      while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
      return t.replace(/\s+$/, '') + '…';
    };

    // --- Membrete: logo + título + recuadro de control documentario ---
    const logoB64 = await this.getLogoBase64();
    if (logoB64) {
      doc.addImage(logoB64, 'PNG', LM, 9, 45, 14);
    }

    // Recuadro de control (Código / Versión / F. Emisión) arriba a la derecha.
    const boxX = 205;
    const boxW = RM - boxX;
    doc.setLineWidth(0.2);
    doc.rect(boxX, 9, boxW, 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Código: ADF-FOR-004', boxX + 2, 12.5);
    doc.text('Versión: 01', boxX + 2, 15.5);
    doc.text('F. Emisión: 18/04/2023', boxX + boxW - 2, 15.5, { align: 'right' });

    // Recuadro N° RENDICIÓN / FECHA.
    doc.rect(boxX, 19, boxW, 11);
    doc.line(boxX, 24.5, boxX + boxW, 24.5);
    doc.line(boxX + boxW * 0.5, 19, boxX + boxW * 0.5, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('N° RENDICIÓN', boxX + 2, 23);
    doc.text('FECHA', boxX + 2, 28.5);
    doc.setFont('helvetica', 'normal');
    const boxValMaxW = boxW * 0.5 - 4;
    doc.text(clip(sanitize(data.nRendicion || data.codigo || ''), boxValMaxW), boxX + boxW * 0.5 + 2, 23);
    doc.text(clip(sanitize(data.fechaDocumento || ''), boxValMaxW), boxX + boxW * 0.5 + 2, 28.5);

    // Título centrado (entre el logo y el recuadro de control).
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('RENDICIÓN DE FONDOS (GASTOS)', (60 + boxX) / 2, 17, { align: 'center' });

    // --- Cabecera contable ---
    // Dibuja label (negrita) + valor envuelto en varias líneas; devuelve el nº de líneas
    // usado por el valor para poder calcular el alto real de la fila (texto flexible).
    const lineH = 3.8;
    // Margen de seguridad: el visor puede sustituir la fuente por una más ancha, así
    // que reservamos ~4% del ancho para evitar que el texto se salga.
    const field = (label: string, val: string, lx: number, vx: number, yy: number, maxW: number): number => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(label, lx, yy);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(sanitize(val), maxW * 0.9) as string[];
      if (lines.length) doc.text(lines, vx, yy);
      return Math.max(1, lines.length);
    };
    // Posiciones de columna del bloque derecho.
    const rlx = 150;      // label derecho
    const rvx = 178;      // valor derecho
    const ccLx = 232;     // label CC
    const ccVx = 242;     // valor CC
    let hy = 38;
    let rowLines = Math.max(
      field('NOMBRE:', data.colaborador || '', LM, LM + 20, hy, rlx - (LM + 20) - 3),
      field('CONCEPTO:', data.concepto || '', rlx, rvx, hy, RM - rvx),
    );
    hy += rowLines * lineH + 2.4;
    rowLines = Math.max(
      field('DNI:', data.idDocument || '', LM, LM + 20, hy, rlx - (LM + 20) - 3),
      field('DESTINO:', data.destino || data.location || '', rlx, rvx, hy, ccLx - rvx - 3),
      field('CC:', data.centroCostoCabecera || '', ccLx, ccVx, hy, RM - ccVx),
    );
    hy += rowLines * lineH + 2.4;
    rowLines = Math.max(
      field('PERIODO/FECHA:', data.periodo || '', LM, LM + 30, hy, rlx - (LM + 30) - 3),
      field('DEPARTAMENTO (ÁREA):', data.departamento || '', rlx, 200, hy, RM - 200),
    );
    hy += rowLines * lineH + 3;

    // --- Tabla de gastos (Item + 11 columnas del formato) ---
    const bodyData: (string | number)[][] = data.comprobantes.map((exp, i) => [
      i + 1,
      sanitize(exp.fecha),
      sanitize(exp.ruc),
      sanitize(exp.numeroDocumento),
      sanitize(exp.proveedor),
      sanitize(exp.comentario || exp.descripcion),
      sanitize(exp.ot),
      sanitize(exp.centroCosto),
      sanitize(exp.ctaDestino),
      money(exp.dolares),
      tc(exp.tipoCambio),
      money(exp.monto),
    ]);
    // Filas vacías para dar aspecto de formulario (mínimo 8), numeradas de forma continua.
    const minRows = 8;
    let itemNo = bodyData.length;
    while (bodyData.length < minRows) {
      itemNo++;
      bodyData.push([itemNo, '', '', '', '', '', '', '', '', '', '', '']);
    }

    autoTable(doc, {
      startY: hy,
      head: [[
        'ITEM', 'FECHA', 'RUC', 'No. DOC', 'PROVEEDOR (RAZON SOCIAL)', 'DESCRIPCIÓN (DETALLE)',
        'OT', 'C.COSTO', 'CTA. DESTINO', 'DÓLARES', 'T.C.', 'SOLES',
      ]],
      body: bodyData,
      theme: 'grid',
      headStyles: { fillColor: [145, 47, 44], textColor: 255, halign: 'center', valign: 'middle', fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 1.5, textColor: 0, overflow: 'linebreak' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 9 },
        1: { halign: 'center', cellWidth: 16 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'center', cellWidth: 18 },
        4: { cellWidth: 36 },
        5: { cellWidth: 'auto' },
        6: { halign: 'center', cellWidth: 18 },
        7: { cellWidth: 22 },
        8: { halign: 'center', cellWidth: 20 },
        9: { halign: 'right', cellWidth: 16 },
        10: { halign: 'right', cellWidth: 13 },
        11: { halign: 'right', cellWidth: 18 },
      },
      margin: { left: LM, right: 14 },
    });

    let y = afterTable(doc);

    // --- Pie de totales (derecha): TOTAL GASTOS / MONTO INICIAL / SALDO ---
    const totalGastos = data.comprobantes.reduce((s, e) => s + (e.monto || 0), 0);
    const montoInicial = data.montoInicialEntregado ?? data.totalAnticipado ?? 0;
    const saldo = montoInicial - totalGastos;

    // Mini-tabla de totales: etiqueta sombreada + valor con borde; SALDO destacado.
    const totBoxW = 80;
    const totLabW = 54;
    const totValW = totBoxW - totLabW;
    const totX = RM - totBoxW;
    const rowH = 6.5;
    y += 4;
    doc.setFontSize(8);
    doc.setLineWidth(0.2);
    const totalRows: [string, number, boolean][] = [
      ['TOTAL GASTOS', totalGastos, false],
      ['MONTO INICIAL ENTREGADO', montoInicial, false],
      ['SALDO (REEMB. / DEV.)', saldo, true],
    ];
    for (const [label, val, isSaldo] of totalRows) {
      // Celda etiqueta (fondo blanco; solo el SALDO lleva el fondo de la marca).
      if (isSaldo) doc.setFillColor(145, 47, 44);
      else doc.setFillColor(255, 255, 255);
      doc.rect(totX, y, totLabW, rowH, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(isSaldo ? 255 : 0, isSaldo ? 255 : 0, isSaldo ? 255 : 0);
      doc.text(label, totX + totLabW - 2, y + 4.3, { align: 'right' });
      // Celda valor (texto negro; el SALDO solo se resalta en negrita).
      doc.setFillColor(255, 255, 255);
      doc.rect(totX + totLabW, y, totValW, rowH, 'FD');
      doc.setFont('helvetica', isSaldo ? 'bold' : 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(val.toFixed(2), RM - 2, y + 4.3, { align: 'right' });
      y += rowH;
    }
    y += 2;

    // --- Resumen de solicitud (presupuesto), si aplica: bloque suplementario ---
    if (data.items && data.items.length > 0) {
      if (y > H - 70) { doc.addPage(); y = 20; }
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('RESUMEN DE SOLICITUD (PRESUPUESTO DETALLADO)', LM, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [['Viáticos', 'Importe', 'Personas', 'Combustible', 'Días', 'Total']],
        body: data.items.map((i) => [
          i.descripcion, i.importe.toFixed(2), i.personas, i.combustible.toFixed(2), i.dias, i.total.toFixed(2),
        ]),
        theme: 'grid',
        headStyles: { fillColor: [145, 47, 44], textColor: 255 },
        styles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'center' }, 5: { halign: 'right' } },
        margin: { left: LM, right: 14 },
      });
      y = afterTable(doc);
    }

    // --- Tres firmas: SOLICITANTE / JEFE INMEDIATO / FINANZAS ---
    let sigY = Math.max(y + 12, H - 42);
    if (sigY > H - 34) { doc.addPage(); sigY = 30; }
    const drawSignature = (
      cx: number, title: string, sig?: string, name?: string, dni?: string,
    ) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(title, cx, sigY, { align: 'center' });
      if (sig) {
        try { doc.addImage(sig, 'PNG', cx - 22, sigY + 2, 44, 16); } catch { /* firma inválida */ }
      }
      const lineY = sigY + 20;
      doc.setLineWidth(0.4);
      doc.line(cx - 35, lineY, cx + 35, lineY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      // Nombre saneado y recortado al ancho del recuadro (70mm) para que no se solape.
      if (name && name !== '—') doc.text(clip(sanitize(name).toUpperCase(), 70), cx, lineY + 4, { align: 'center' });
      doc.text('NOMBRE Y FIRMA', cx, lineY + 8, { align: 'center' });
      if (dni) doc.text(`DNI: ${dni}`, cx, lineY + 12, { align: 'center' });
    };
    drawSignature(56, 'V°B° SOLICITANTE', data.signature, data.colaborador, data.idDocument);
    drawSignature(148, 'V°B° JEFE INMEDIATO', data.jefeSignature, data.jefeInmediatoName);
    drawSignature(240, 'V°B° FINANZAS', data.financeSignature, data.financeName);

    if (!inDoc) {
      if (returnBytes) return new Uint8Array(doc.output('arraybuffer'));
      doc.save(`${data.fileBaseName}.pdf`);
    }
  }

  async exportAffidavitToPdf(data: AffidavitExportData): Promise<void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('DECLARACION JURADA', 105, 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Tipo: ${data.tipo === 'viajes_exterior' ? 'Viajes al Exterior' : 'Viaticos Nacionales'}`, 14, 26);
    doc.text(`Empresa: ${data.empresaNombre}`, 14, 32);
    doc.text(`RUC: ${data.empresaRuc}`, 14, 38);
    doc.text(`Colaborador: ${data.colaborador}`, 14, 44);
    doc.text(`Documento: ${data.documentoColaborador || '-'}`, 14, 50);

    autoTable(doc, {
      startY: 58,
      head: [['Fecha', 'Documento', 'Concepto', 'Categoria', 'Monto (S/)']],
      body: data.rows.map(r => [r.fecha, r.documento, r.concepto, r.categoria, r.monto.toFixed(2)]),
      theme: 'grid',
      headStyles: { fillColor: [145, 47, 44], textColor: 255 },
      styles: { fontSize: 9 },
      columnStyles: { 4: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });

    const y = afterTable(doc) + 8;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total declarado: S/ ${data.total.toFixed(2)}`, 196, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha de generacion: ${data.fechaGeneracion}`, 14, y + 8);

    if (data.signature) {
      doc.addImage(data.signature, 'PNG', 74, y + 16, 60, 24);
      doc.line(60, y + 44, 150, y + 44);
      doc.text(data.colaborador.toUpperCase(), 105, y + 49, { align: 'center' });
    }

    doc.save(`${data.fileBaseName}.pdf`);
  }

  async exportMobilitySheetToPdf(data: MobilitySheetExportData, inDoc?: jsPDF, returnBytes?: boolean): Promise<Uint8Array | void> {
    data = {
      ...data,
      signature: await this.resolveSignature(data.signature),
      coordinatorSignature: await this.resolveSignature(data.coordinatorSignature),
    };
    const isNew = !inDoc;
    const doc = inDoc ?? new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (!isNew) doc.addPage([210, 297], 'portrait');
    const lm = 14;
    const rm = 196;
    const pageW = 210;

    const cfg = this.companyConfigService.getCompanyConfig();
    const companyName = cfg?.businessName || cfg?.name || '';
    const ruc = cfg?.businessId || '';

    const logoB64 = await this.getLogoBase64();

    // Col X positions: Fecha | Colaborador | Proyecto | Origen | Destino | Gestión | TOTALES | end
    const cols = [14, 32, 62, 82, 112, 142, 170, 196];

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('PLANILLA DE MOVILIDAD', pageW / 2, 10, { align: 'center' });

    // Logo top right
    if (logoB64) {
      doc.addImage(logoB64, 'PNG', 153, 6, 40, 24);
    }

    // Company info left
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(companyName, lm, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (ruc) {
      doc.text(`RUC: ${ruc}`, lm, 24);
    }

    // Header section: separator lines + vertical divider
    const vSep = 150;
    doc.setLineWidth(0.3);
    doc.line(lm, 32, rm, 32);
    doc.line(vSep, 32, vSep, 50);
    doc.line(rm, 32, rm, 50);
    doc.line(lm, 50, rm, 50);

    // Left: Nombre Completo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Nombre Completo :', lm, 40);
    doc.setFont('helvetica', 'normal');
    const nameX = lm + 37;
    doc.text(data.collaborator, nameX, 40);
    doc.line(nameX, 40.5, vSep - 2, 40.5);

    // Right: Nº + Vo.Bo.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Nº', vSep + 4, 40);
    doc.setFont('helvetica', 'normal');
    doc.text(data.internalCode || '', vSep + 12, 40);
    doc.setFontSize(7.5);
    doc.text('Vo.Bo. Gerencia Adm y Finanzas', (vSep + rm) / 2, 47, { align: 'center' });

    // Periodo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Periodo:', lm, 57);
    doc.setFont('helvetica', 'normal');
    doc.text(data.periodo ? data.periodo.toUpperCase() : '', lm + 20, 57);

    // Table title bar
    doc.setFillColor(145, 47, 44);
    doc.rect(lm, 61, rm - lm, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('DETALLE DE GASTOS DE MOVILIDAD', pageW / 2, 66.5, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    // Single-row table header
    const hdr = 8;
    let y = 69;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);

    const headers = ['Fecha', 'Colaborador', 'Proyecto', 'Origen', 'Destino', 'Gestión', 'TOTALES S/.'];
    for (let i = 0; i < 7; i++) {
      doc.rect(cols[i], y, cols[i + 1] - cols[i], hdr, 'S');
      doc.text(headers[i], (cols[i] + cols[i + 1]) / 2, y + 5, { align: 'center' });
    }

    y += hdr;

    // Data rows (min 10)
    const dataRows = [...data.rows];
    while (dataRows.length < 10) {
      dataRows.push({ fecha: '', origen: '', destino: '', gestion: '', total: 0 });
    }

    const rowH = 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    for (const row of dataRows) {
      for (let c = 0; c < 7; c++) {
        doc.rect(cols[c], y, cols[c + 1] - cols[c], rowH, 'S');
      }
      const hasContent = !!(row.fecha || row.origen || row.destino || row.gestion);
      if (row.fecha) {
        doc.text(this.formatDateDdMmYyyy(row.fecha), cols[0] + 1, y + 4.5);
      }
      if (row.colaborador && hasContent) {
        const prevSize = doc.getFontSize();
        doc.setFontSize(6.5);
        const cLines = (doc.splitTextToSize(row.colaborador, cols[2] - cols[1] - 2) as string[]).slice(0, 2);
        const cStartY = cLines.length > 1 ? y + 2.8 : y + 4.5;
        cLines.forEach((line, i) => {
          doc.text(line, cols[1] + 1, cStartY + i * 3);
        });
        doc.setFontSize(prevSize);
      }
      const proyectoCell = row.proyecto || data.proyecto;
      if (proyectoCell && hasContent) {
        doc.text(doc.splitTextToSize(proyectoCell, cols[3] - cols[2] - 2)[0], cols[2] + 1, y + 4.5);
      }
      if (row.origen) {
        const prevSize = doc.getFontSize();
        doc.setFontSize(6.5);
        const oLines = (doc.splitTextToSize(row.origen, cols[4] - cols[3] - 2) as string[]).slice(0, 2);
        const oStartY = oLines.length > 1 ? y + 2.8 : y + 4.5;
        oLines.forEach((line, i) => {
          doc.text(line, cols[3] + 1, oStartY + i * 3);
        });
        doc.setFontSize(prevSize);
      }
      if (row.destino) {
        const prevSize = doc.getFontSize();
        doc.setFontSize(6.5);
        const dLines = (doc.splitTextToSize(row.destino, cols[5] - cols[4] - 2) as string[]).slice(0, 2);
        const dStartY = dLines.length > 1 ? y + 2.8 : y + 4.5;
        dLines.forEach((line, i) => {
          doc.text(line, cols[4] + 1, dStartY + i * 3);
        });
        doc.setFontSize(prevSize);
      }
      if (row.gestion) {
        const prevSize = doc.getFontSize();
        doc.setFontSize(6.5);
        const gLines = (doc.splitTextToSize(row.gestion, cols[6] - cols[5] - 2) as string[]).slice(0, 2);
        const gStartY = gLines.length > 1 ? y + 2.8 : y + 4.5;
        gLines.forEach((line, i) => {
          doc.text(line, cols[5] + 1, gStartY + i * 3);
        });
        doc.setFontSize(prevSize);
      }
      if (row.total) {
        doc.text(row.total.toFixed(2), cols[7] - 1, y + 4.5, { align: 'right' });
      }
      y += rowH;
    }

    // Footer rows
    const footerH = 7;
    y += 1;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(145, 47, 44);
    doc.text('IMPORTE TOTAL PLANILLA DE MOVILIDAD', lm + 2, y + 4.5);
    doc.setTextColor(0, 0, 0);
    doc.rect(cols[6], y, cols[7] - cols[6], footerH, 'S');
    doc.text(data.total.toFixed(2), cols[7] - 1, y + 4.5, { align: 'right' });
    y += footerH;

    doc.setTextColor(145, 47, 44);
    doc.text('CANTIDAD RECIBIDA  A CUENTA', lm + 2, y + 4.5);
    doc.setTextColor(0, 0, 0);
    doc.rect(cols[6], y, cols[7] - cols[6], footerH, 'S');
    y += footerH;

    doc.setTextColor(145, 47, 44);
    doc.text('DIFERENCIA A MI FAVOR', lm + 2, y + 4.5);
    doc.setTextColor(0, 0, 0);
    doc.text('S/.', cols[6] - 2, y + 4.5, { align: 'right' });
    doc.rect(cols[6], y, cols[7] - cols[6], footerH, 'S');
    doc.text(data.total.toFixed(2), cols[7] - 1, y + 4.5, { align: 'right' });
    y += footerH + 10;

    // Signature area — dos firmas: colaborador (izquierda) y coordinador (derecha). VD-33.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('LUGAR Y FECHA:', lm, y);
    y += 6;

    const sigWorkerCX = 62;
    const sigCoordCX = 150;
    const sigTop = y;
    if (data.signature) {
      doc.addImage(data.signature, 'PNG', sigWorkerCX - 25, sigTop, 50, 16);
    }
    if (data.coordinatorSignature) {
      doc.addImage(data.coordinatorSignature, 'PNG', sigCoordCX - 25, sigTop, 50, 16);
    }
    y = sigTop + 18;
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA Trabajador', sigWorkerCX, y, { align: 'center' });
    doc.line(sigWorkerCX - 35, y + 1.5, sigWorkerCX + 35, y + 1.5);
    doc.text('FIRMA Coordinador', sigCoordCX, y, { align: 'center' });
    doc.line(sigCoordCX - 35, y + 1.5, sigCoordCX + 35, y + 1.5);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.text(
      data.collaboratorDni ? `DNI   ${data.collaboratorDni}` : 'DNI',
      sigWorkerCX,
      y,
      { align: 'center' },
    );
    if (data.coordinator) {
      doc.text(data.coordinator.toUpperCase(), sigCoordCX, y, { align: 'center' });
    } else {
      doc.text(data.coordinatorDni ? `DNI   ${data.coordinatorDni}` : 'DNI', sigCoordCX, y, { align: 'center' });
    }
    y += 12;

    // Cargar a / Cuenta
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Cargar a :', lm, y);
    doc.line(lm + 22, y + 0.5, lm + 90, y + 0.5);
    y += 7;
    doc.text('Cuenta :', lm, y);
    doc.line(lm + 22, y + 0.5, lm + 90, y + 0.5);
    y += 10;

    // Bottom note
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(
      '*** La tabla de centros de costos y proyectos seran administrados al personal para identificarlos adecuadamente.',
      lm,
      y,
    );

    if (isNew) {
      if (returnBytes) return new Uint8Array(doc.output('arraybuffer'));
      doc.save(`${data.fileBaseName}.pdf`);
    }
  }

  async exportReceiptToPdf(data: ReceiptExportData, inDoc?: jsPDF, returnBytes?: boolean): Promise<Uint8Array | void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    const isNew = !inDoc;
    const doc = inDoc ?? new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (!isNew) doc.addPage([210, 297], 'portrait');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('RECIBO DE CAJA', 105, 18, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    let y = 30;
    doc.text(`Fecha: ${data.fecha}`, 14, y); y += 6;
    doc.text(`Proveedor: ${data.razonSocial}`, 14, y); y += 6;
    if (data.ruc) { doc.text(`RUC: ${data.ruc}`, 14, y); y += 6; }
    if (data.numeroDocumento) { doc.text(`N° Documento: ${data.numeroDocumento}`, 14, y); y += 6; }
    doc.text(`Colaborador: ${data.collaborator}`, 14, y); y += 6;
    if (data.collaboratorDni) { doc.text(`DNI: ${data.collaboratorDni}`, 14, y); y += 6; }
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Concepto', 'Monto (S/)']],
      body: [[data.concepto, data.monto.toFixed(2)]],
      theme: 'grid',
      headStyles: { fillColor: [145, 47, 44], textColor: 255 },
      styles: { fontSize: 10 },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
      margin: { left: 14, right: 14 },
    });

    const sigY = afterTable(doc) + 24;
    if (data.signature) {
      doc.addImage(data.signature, 'PNG', 74, sigY - 20, 60, 20);
    }
    doc.line(60, sigY + 6, 150, sigY + 6);
    doc.setFontSize(9);
    doc.text(data.collaborator.toUpperCase(), 105, sigY + 11, { align: 'center' });
    if (data.collaboratorDni) {
      doc.text(`DNI N° ${data.collaboratorDni}`, 105, sigY + 16, { align: 'center' });
    }

    if (isNew) {
      if (returnBytes) return new Uint8Array(doc.output('arraybuffer'));
      doc.save(`${data.fileBaseName}.pdf`);
    }
  }

  async exportMobilitySheetToExcel(data: MobilitySheetExportData): Promise<void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Viatika';
    wb.created = new Date();
    const ws = wb.addWorksheet('Planilla Movilidad', { views: [{ showGridLines: false }] });

    ws.columns = [
      { width: 14 },  // A: Fecha
      { width: 22 },  // B: Colaborador
      { width: 14 },  // C: Proyecto
      { width: 22 },  // D: Origen
      { width: 22 },  // E: Destino
      { width: 24 },  // F: Gestión
      { width: 13 },  // G: TOTALES
    ];

    const cfg = this.companyConfigService.getCompanyConfig();
    const companyName = cfg?.businessName || cfg?.name || '';
    const ruc = cfg?.businessId || '';

    const bt = {
      top: { style: 'thin' as const }, bottom: { style: 'thin' as const },
      left: { style: 'thin' as const }, right: { style: 'thin' as const },
    };

    // Row 1: Title
    ws.mergeCells('A1:G1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'PLANILLA DE MOVILIDAD';
    titleCell.font = { bold: true, size: 13 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 20;

    // Rows 2-3: Company info
    ws.mergeCells('A2:E2');
    ws.getCell('A2').value = companyName;
    ws.getCell('A2').font = { bold: true, size: 10 };
    if (ruc) {
      ws.mergeCells('A3:E3');
      ws.getCell('A3').value = `RUC: ${ruc}`;
      ws.getCell('A3').font = { size: 9 };
    }

    // Logo top right
    const logoB64 = await this.getLogoBase64();
    if (logoB64) {
      const ext = logoB64.includes('data:image/png') ? 'png' : 'jpeg';
      const imgId = wb.addImage({ base64: logoB64, extension: ext as 'png' | 'jpeg' });
      ws.addImage(imgId, { tl: { col: 6, row: 0 }, ext: { width: 150, height: 60 } });
    }

    // Row 4: blank separator
    ws.getRow(4).height = 4;

    // Row 5: Nombre Completo / Nº
    ws.getCell('A5').value = 'Nombre Completo :';
    ws.getCell('A5').font = { bold: true, size: 9 };
    ws.getCell('A5').border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
    ws.mergeCells('B5:E5');
    ws.getCell('B5').value = data.collaborator;
    ws.getCell('B5').border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
    ws.getCell('F5').value = 'Nº';
    ws.getCell('F5').font = { bold: true, size: 9 };
    ws.getCell('F5').border = bt;
    ws.getCell('G5').value = data.internalCode || '';
    ws.getCell('G5').font = { size: 9 };
    ws.getCell('G5').border = bt;

    // Row 6: Vo.Bo.
    ws.getCell('A6').border = { bottom: { style: 'thin' } };
    ws.getCell('B6').border = { bottom: { style: 'thin' } };
    ws.mergeCells('F6:G6');
    ws.getCell('F6').value = 'Vo.Bo. Gerencia Adm y Finanzas';
    ws.getCell('F6').alignment = { horizontal: 'center' };
    ws.getCell('F6').font = { size: 8 };
    ws.getCell('F6').border = bt;

    // Row 7: Periodo
    ws.getCell('A7').value = 'Periodo:';
    ws.getCell('A7').font = { bold: true, size: 9 };
    ws.getCell('B7').value = data.periodo ? data.periodo.toUpperCase() : '';
    ws.getRow(7).height = 16;

    // Row 8: blank separator
    ws.getRow(8).height = 4;

    // Row 9: Table title bar
    ws.mergeCells('A9:G9');
    const tableTitle = ws.getCell('A9');
    tableTitle.value = 'DETALLE DE GASTOS DE MOVILIDAD';
    tableTitle.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    tableTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_HEADER } };
    tableTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(9).height = 18;

    // Row 10: Single header row
    const hdrLabels = ['Fecha', 'Colaborador', 'Proyecto', 'Origen', 'Destino', 'Gestión', 'TOTALES S/.'];
    const hdrCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    for (let i = 0; i < hdrLabels.length; i++) {
      const cell = ws.getCell(`${hdrCols[i]}10`);
      cell.value = hdrLabels[i];
      cell.font = { bold: true, size: 8.5 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = bt;
    }
    ws.getRow(10).height = 18;

    // Data rows (min 10)
    let r = 11;
    const dataRows = [...data.rows];
    while (dataRows.length < 10) {
      dataRows.push({ fecha: '', origen: '', destino: '', gestion: '', total: 0 });
    }

    for (const row of dataRows) {
      const hasContent = !!(row.fecha || row.origen || row.destino || row.gestion);
      ws.getCell(r, 1).value = this.formatDateDdMmYyyy(row.fecha);
      ws.getCell(r, 2).value = hasContent ? (row.colaborador || '') : '';
      ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'middle' };
      ws.getCell(r, 3).value = hasContent ? (row.proyecto || data.proyecto || '') : '';
      ws.getCell(r, 4).value = row.origen || '';
      ws.getCell(r, 4).alignment = { wrapText: true, vertical: 'middle' };
      ws.getCell(r, 5).value = row.destino || '';
      ws.getCell(r, 5).alignment = { wrapText: true, vertical: 'middle' };
      ws.getCell(r, 6).value = row.gestion || '';
      ws.getCell(r, 6).alignment = { wrapText: true, vertical: 'middle' };
      if (row.total) {
        ws.getCell(r, 7).value = row.total;
        ws.getCell(r, 7).numFmt = '#,##0.00';
        ws.getCell(r, 7).alignment = { horizontal: 'right' };
      }
      for (let i = 1; i <= 7; i++) {
        ws.getCell(r, i).border = bt;
        ws.getCell(r, i).font = { size: 8.5 };
      }
      ws.getRow(r).height = 16;
      r++;
    }

    // Footer rows
    const redFont = { bold: true, color: { argb: 'FF912f2c' } };

    ws.mergeCells(r, 1, r, 6);
    ws.getCell(r, 1).value = 'IMPORTE TOTAL PLANILLA DE MOVILIDAD';
    ws.getCell(r, 1).font = redFont;
    ws.getCell(r, 7).value = data.total;
    ws.getCell(r, 7).numFmt = '#,##0.00';
    ws.getCell(r, 7).alignment = { horizontal: 'right' };
    ws.getCell(r, 7).border = bt;
    ws.getRow(r).height = 16;
    r++;

    ws.mergeCells(r, 1, r, 6);
    ws.getCell(r, 1).value = 'CANTIDAD RECIBIDA  A CUENTA';
    ws.getCell(r, 1).font = redFont;
    ws.getCell(r, 7).border = bt;
    ws.getRow(r).height = 16;
    r++;

    ws.mergeCells(r, 1, r, 5);
    ws.getCell(r, 1).value = 'DIFERENCIA A MI FAVOR';
    ws.getCell(r, 1).font = redFont;
    ws.getCell(r, 6).value = 'S/.';
    ws.getCell(r, 6).font = { bold: true };
    ws.getCell(r, 6).alignment = { horizontal: 'right' };
    ws.getCell(r, 7).value = data.total;
    ws.getCell(r, 7).numFmt = '#,##0.00';
    ws.getCell(r, 7).alignment = { horizontal: 'right' };
    ws.getCell(r, 7).border = bt;
    ws.getRow(r).height = 16;
    r += 2;

    // Lugar y fecha
    ws.getCell(r, 1).value = 'LUGAR Y FECHA:';
    ws.getCell(r, 1).font = { bold: true, size: 8.5 };
    r++;

    // Signature
    if (data.signature) {
      const sigId = wb.addImage({ base64: data.signature, extension: 'png' });
      ws.addImage(sigId, { tl: { col: 2, row: r - 1 }, ext: { width: 120, height: 50 } });
    }
    ws.getRow(r).height = 55;
    ws.mergeCells(r, 3, r, 4);
    ws.getCell(r, 3).border = { bottom: { style: 'medium' } };
    r++;

    ws.mergeCells(r, 3, r, 4);
    ws.getCell(r, 3).value = 'FIRMA Trabajador';
    ws.getCell(r, 3).alignment = { horizontal: 'center' };
    ws.getCell(r, 3).font = { bold: true, size: 8.5 };
    r++;

    ws.mergeCells(r, 3, r, 4);
    ws.getCell(r, 3).value = data.collaboratorDni ? `DNI   ${data.collaboratorDni}` : 'DNI';
    ws.getCell(r, 3).alignment = { horizontal: 'center' };
    ws.getCell(r, 3).font = { size: 8.5 };
    r += 2;

    // Cargar a / Cuenta
    ws.getCell(r, 1).value = 'Cargar a :';
    ws.getCell(r, 1).font = { bold: true, size: 8.5 };
    ws.mergeCells(r, 2, r, 4);
    ws.getCell(r, 2).border = { bottom: { style: 'thin' } };
    r++;
    ws.getCell(r, 1).value = 'Cuenta :';
    ws.getCell(r, 1).font = { bold: true, size: 8.5 };
    ws.mergeCells(r, 2, r, 4);
    ws.getCell(r, 2).border = { bottom: { style: 'thin' } };
    r += 2;

    // Bottom note
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = '*** La tabla de centros de costos y proyectos seran administrados al personal para identificarlos adecuadamente.';
    ws.getCell(r, 1).font = { size: 7 };

    const buf = await wb.xlsx.writeBuffer();
    this.triggerDownload(
      new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${data.fileBaseName}.xlsx`,
    );
  }

  async exportSingleExpenseAffidavitToPdf(data: SingleExpenseAffidavitData, inDoc?: jsPDF, returnBytes?: boolean): Promise<Uint8Array | void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    const isNew = !inDoc;
    const doc = inDoc ?? new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (!isNew) doc.addPage([210, 297], 'portrait');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('DECLARACIÓN JURADA', 105, 16, { align: 'center' });
    doc.setFontSize(10);
    doc.text(data.titulo, 105, 23, { align: 'center' });
    doc.setFont('helvetica', 'normal');

    let y = 33;
    if (data.empresaNombre) { doc.text(`Empresa: ${data.empresaNombre}`, 14, y); y += 6; }
    doc.text(`Colaborador: ${data.colaborador}`, 14, y); y += 6;
    if (data.colaboradorDni) { doc.text(`DNI: ${data.colaboradorDni}`, 14, y); y += 6; }
    doc.text(`Fecha: ${data.fechaGeneracion}`, 14, y); y += 10;

    let tableRendered = false;

    if (data.mobilityRows && data.mobilityRows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Fecha', 'Origen', 'Destino', 'Gestión', 'Total (S/)']],
        body: data.mobilityRows.map(r => [r.fecha, r.origen || '—', r.destino || '—', r.gestion || '—', r.total.toFixed(2)]),
        theme: 'grid',
        headStyles: { fillColor: [145, 47, 44], textColor: 255 },
        styles: { fontSize: 8 },
        columnStyles: { 4: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });
      tableRendered = true;
    } else if (data.receiptFields && data.receiptFields.length > 0) {
      autoTable(doc, {
        startY: y,
        body: data.receiptFields.map(f => [f.label, f.value]),
        theme: 'plain',
        styles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
        margin: { left: 14, right: 14 },
      });
      tableRendered = true;
    } else if (data.descripcion) {
      const lines = doc.splitTextToSize(`Descripción: ${data.descripcion}`, 182);
      doc.text(lines, 14, y);
      y += (lines.length + 1) * 6;
    }

    if (tableRendered) {
      y = afterTable(doc) + 8;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(`Total declarado: S/ ${data.total.toFixed(2)}`, 196, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    y += 20;
    const center = 105;
    if (data.signature) {
      doc.addImage(data.signature, 'PNG', center - 30, y - 18, 60, 18);
    }
    doc.line(center - 40, y, center + 40, y);
    y += 4;
    doc.setFontSize(9);
    doc.text(data.colaborador.toUpperCase(), center, y, { align: 'center' });
    if (data.colaboradorDni) {
      y += 4;
      doc.text(`DNI N° ${data.colaboradorDni}`, center, y, { align: 'center' });
    }

    if (isNew) {
      if (returnBytes) return new Uint8Array(doc.output('arraybuffer'));
      doc.save(`${data.fileBaseName}.pdf`);
    }
  }

  private async _renderFacturaContent(doc: jsPDF, data: FacturaPageData): Promise<void> {
    const pageW = 210;
    const lm = 14;
    const rm = 196;

    const logoB64 = await this.getLogoBase64();
    if (logoB64) {
      doc.addImage(logoB64, 'PNG', rm - 40, 6, 40, 12);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(data.tipo.toUpperCase(), pageW / 2, 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Comprobante N° ${data.index}`, pageW / 2, 22, { align: 'center' });

    doc.setLineWidth(0.3);
    doc.line(lm, 26, rm, 26);

    let y = 35;
    const row = (label: string, value: string | undefined) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${label}:`, lm, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(value, rm - lm - 52) as string[];
      doc.text(lines, lm + 52, y);
      y += lines.length > 1 ? lines.length * 5 + 2 : 7;
    };

    row('Proveedor', data.razonSocial || undefined);
    row('RUC', data.rucEmisor || undefined);
    if (data.serie && data.correlativo) {
      row('N° Documento', `${data.serie}-${data.correlativo}`);
    }
    row('Fecha Emisión', data.fechaEmision || undefined);
    if (data.montoTotal !== undefined) {
      row('Monto', `${data.moneda || 'PEN'} ${data.montoTotal.toFixed(2)}`);
    }
    row('Comentario', data.comentario || undefined);
    row('Placa Vehículo', data.placaVehiculo || undefined);
    row('Descripción', data.descripcion || undefined);
  }

  async exportFullRendicionPdf(
    summaryData: RendicionExportData,
    pages: ComprobantePage[],
  ): Promise<void> {
    const { PDFDocument } = await import('pdf-lib');
    const sections: Uint8Array[] = [];

    const summaryBytes = await this.exportToPdf(summaryData, undefined, true);
    if (summaryBytes) sections.push(summaryBytes);

    for (const page of pages) {
      try {
        let bytes: Uint8Array | null = null;
        switch (page.type) {
          case 'mobility':
            bytes = (await this.exportMobilitySheetToPdf(page.data, undefined, true)) as Uint8Array ?? null;
            break;
          case 'receipt':
            bytes = (await this.exportReceiptToPdf(page.data, undefined, true)) as Uint8Array ?? null;
            break;
          case 'affidavit':
            bytes = (await this.exportSingleExpenseAffidavitToPdf(page.data, undefined, true)) as Uint8Array ?? null;
            break;
          case 'factura': {
            const fichaDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            await this._renderFacturaContent(fichaDoc, page.data);
            bytes = new Uint8Array(fichaDoc.output('arraybuffer'));
            break;
          }
          case 'factura_image':
            bytes = await this._buildImageSectionBytes(page.url);
            break;
          case 'factura_pdf':
            bytes = await this._fetchBytes(page.url);
            break;
        }
        if (bytes) sections.push(bytes);
      } catch {
        // skip failed section
      }
    }

    const merged = await PDFDocument.create();
    for (const section of sections) {
      try {
        const src = await PDFDocument.load(section, { ignoreEncryption: true });
        const copied = await merged.copyPages(src, src.getPageIndices());
        copied.forEach(p => merged.addPage(p));
      } catch {
        // skip invalid section
      }
    }

    const mergedBytes = await merged.save();
    this.triggerDownload(
      new Blob([mergedBytes], { type: 'application/pdf' }),
      `${summaryData.fileBaseName}_completo.pdf`,
    );
  }

  private async _buildImageSectionBytes(url: string): Promise<Uint8Array | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const mimeType = blob.type || 'image/jpeg';
      const isPng = mimeType.includes('png');
      const format = isPng ? 'PNG' : 'JPEG';

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = base64;
      });

      const pageW = 210;
      const pageH = 297;
      const margin = 10;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const x = (pageW - drawW) / 2;
      const y = (pageH - drawH) / 2;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      doc.addImage(base64, format, x, y, drawW, drawH);
      return new Uint8Array(doc.output('arraybuffer'));
    } catch {
      return null;
    }
  }

  private async _fetchBytes(url: string): Promise<Uint8Array | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

