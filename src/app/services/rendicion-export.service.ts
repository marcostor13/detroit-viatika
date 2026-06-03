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
  monto: number;
  estadoComprobante: string;
  proveedor?: string;
  numeroDocumento?: string;
  comentario?: string;
  placaVehiculo?: string;
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
    clienteProveedor: string;
    origen: string;
    destino: string;
    gestion: string;
    total: number;
  }>;
  total: number;
  signature?: string;
}

export interface CashVoucherExportData {
  fileBaseName: string;
  collaborator: string;
  collaboratorDni?: string;
  internalCode?: string;
  entregadoA: string;
  direccion?: string;
  concepto: string;
  monto: number;
  generatedAt: string;
  signature?: string;
  projectName?: string;
  clientName?: string;
  fechaEmision?: string;
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

const RED_HEADER = 'FF912f2c'; // Dark red for headers
const YELLOW_CELL = 'FFFFFF00'; // Yellow for summary cell

@Injectable({ providedIn: 'root' })
export class RendicionExportService {
  private companyConfigService = inject(CompanyConfigService);

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

  async exportToExcel(data: RendicionExportData): Promise<void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Viatika';
    wb.created = new Date();
    const ws = wb.addWorksheet('Rendición', { views: [{ showGridLines: false }] });

    const logoB64 = await this.getLogoBase64();
    if (logoB64) {
      const imageId = wb.addImage({
        base64: logoB64,
        extension: 'png',
      });
      ws.addImage(imageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 140, height: 40 },
      });
    }

    ws.columns = [
      { width: 6 },  // Item
      { width: 12 }, // Fecha
      { width: 16 }, // Tipo
      { width: 18 }, // No Doc
      { width: 28 }, // Proveedor
      { width: 40 }, // Concepto (incluye comentario)
      { width: 14 }, // Placa
      { width: 12 }, // Ingresos
      { width: 12 }, // Gastos
    ];

    // Title Block
    ws.mergeCells('A4:I4');
    const titleCell = ws.getCell('A4');
    titleCell.value = 'RENDICIÓN DE VIÁTICOS';
    titleCell.font = { bold: true, size: 12 };
    titleCell.alignment = { horizontal: 'center' };

    ws.mergeCells('A5:I5');
    const subtitleCell = ws.getCell('A5');
    const proyectoLabel = data.projectName && data.projectName !== '—'
      ? data.projectName
      : (data.titulo || '');
    subtitleCell.value = `PROYECTO:\n${proyectoLabel}`;
    subtitleCell.font = { size: 10 };
    subtitleCell.alignment = { horizontal: 'center', wrapText: true };
    ws.getRow(5).height = 28;

    ws.mergeCells('A7:I7');
    const dateCell = ws.getCell('A7');
    if (data.startDate && data.endDate) {
      dateCell.value = `DEL ${data.startDate} AL ${data.endDate}`;
    } else {
      dateCell.value = `Rendición de la fecha`;
    }
    dateCell.font = { bold: true, size: 10 };
    dateCell.alignment = { horizontal: 'center' };

    ws.getCell('A9').value = 'Colaborador:';
    ws.mergeCells('B9:D9');
    ws.getCell('B9').value = data.colaborador;
    
    ws.getCell('A10').value = 'Localidad:';
    ws.mergeCells('B10:D10');
    ws.getCell('B10').value = data.location || '';

    ws.getCell('E9').value = 'DNI:';
    ws.getCell('F9').value = data.idDocument || '';
    ws.getCell('E10').value = 'Cta / CCI:';
    ws.getCell('F10').value = data.accountNumber || '';

    if (data.peopleNames && data.peopleNames.length > 0) {
      ws.getCell('A11').value = 'Personas:';
      ws.mergeCells('B11:F11');
      ws.getCell('B11').value = data.peopleNames.join(', ');
    }

    // Table Header
    let r = 13;
    const headers = ['Item', 'Fecha\nEmisión', 'Tipo\nde\nDoc.', 'Nº del Documento', 'Proveedor', 'Concepto', 'Placa', 'Ingresos', 'Gastos'];
    headers.forEach((h, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_HEADER } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    ws.getRow(r).height = 30;
    r++;

    let itemIndex = 1;
    let sumIngresos = 0;
    let sumGastos = 0;

    const addDataRow = (rowVals: any[]) => {
      rowVals.forEach((val, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = val;
        c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        if (i === 7 || i === 8) {
           c.numFmt = '#,##0.00';
           if (val === 0 || !val) c.value = ''; // Hide 0s to match screenshot
           c.alignment = { horizontal: 'right' };
        } else {
           c.alignment = { horizontal: i === 0 || i === 1 || i === 2 ? 'center' : 'left', wrapText: true };
        }
      });
      r++;
    };

    // Advances as "Ingresos"
    data.anticipos.forEach(a => {
      addDataRow([
        itemIndex++,
        a.fechaSolicitud,
        '',
        '',
        'Transferencia',
        '',
        '',
        a.monto,
        ''
      ]);
      sumIngresos += a.monto;
    });

    // Expenses as "Gastos"
    data.comprobantes.forEach(exp => {
      addDataRow([
        itemIndex++,
        exp.fecha,
        exp.tipo,
        exp.numeroDocumento || '',
        exp.proveedor || '',
        exp.comentario || exp.descripcion || '',
        exp.placaVehiculo || '',
        '',
        exp.monto
      ]);
      sumGastos += exp.monto;
    });

    // Fill some empty rows to make it look like a complete table (min 5 rows)
    const minRows = Math.max(5, itemIndex);
    while (itemIndex <= minRows) {
      addDataRow([itemIndex++, '', '', '', '', '', '', '', '']);
    }

    // Totals row
    ws.mergeCells(r, 1, r, 7);
    let cTotalId = ws.getCell(r, 7);
    cTotalId.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

    const cIng = ws.getCell(r, 8);
    cIng.value = sumIngresos;
    cIng.font = { color: { argb: 'FFFFFFFF' } };
    cIng.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_HEADER } };
    cIng.numFmt = '#,##0.00';
    cIng.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

    const cGas = ws.getCell(r, 9);
    cGas.value = sumGastos;
    cGas.font = { color: { argb: 'FFFFFFFF' } };
    cGas.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_HEADER } };
    cGas.numFmt = '#,##0.00';
    cGas.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    r += 1;

    // Indicadores POR REEMBOLSAR y POR RENDIR (siempre se muestran ambos)
    const diferencia = sumIngresos - sumGastos;
    const montoReembolsar = diferencia < 0 ? Math.abs(diferencia) : 0;
    const montoRendir = diferencia > 0 ? diferencia : 0;

    ws.mergeCells(r, 1, r, 7);
    const cReembLabel = ws.getCell(r, 7);
    cReembLabel.value = 'POR REEMBOLSAR';
    cReembLabel.font = { bold: true };
    cReembLabel.alignment = { horizontal: 'right' };
    ws.mergeCells(r, 8, r, 9);
    const cReembMonto = ws.getCell(r, 8);
    cReembMonto.value = montoReembolsar;
    cReembMonto.numFmt = '#,##0.00';
    cReembMonto.alignment = { horizontal: 'right' };
    cReembMonto.font = { bold: true };
    r++;

    ws.mergeCells(r, 1, r, 7);
    const cRendLabel = ws.getCell(r, 7);
    cRendLabel.value = 'POR RENDIR';
    cRendLabel.font = { bold: true };
    cRendLabel.alignment = { horizontal: 'right' };
    ws.mergeCells(r, 8, r, 9);
    const cRendMonto = ws.getCell(r, 8);
    cRendMonto.value = montoRendir;
    cRendMonto.numFmt = '#,##0.00';
    cRendMonto.alignment = { horizontal: 'right' };
    cRendMonto.font = { bold: true };
    r++;

    r += 2;

    r += 1;
    if (data.items && data.items.length > 0) {
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
        c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      r++;
      data.items.forEach(item => {
        ws.getCell(r, 1).value = item.descripcion;
        ws.getCell(r, 2).value = item.importe;
        ws.getCell(r, 3).value = item.personas;
        ws.getCell(r, 4).value = item.combustible;
        ws.getCell(r, 5).value = item.dias;
        ws.getCell(r, 6).value = item.total;
        [2, 4, 6].forEach(col => ws.getCell(r, col).numFmt = '#,##0.00');
        for (let i = 1; i <= 6; i++) {
          ws.getCell(r, i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        }
        r++;
      });
      r++;
    }

    r += 2;

    if (data.signature) {
      ws.getRow(r - 1).height = 45; // Make some room
      const sigImgId = wb.addImage({
        base64: data.signature,
        extension: 'png',
      });
      ws.addImage(sigImgId, {
        tl: { col: 2, row: r - 2 },
        ext: { width: 150, height: 75 },
      });
    }

    // Signature
    ws.mergeCells(r, 3, r, 6);
    const cSigLine = ws.getCell(r, 3);
    cSigLine.border = { bottom: { style: 'medium' } };
    r++;
    ws.mergeCells(r, 3, r, 6);
    const cSigName = ws.getCell(r, 3);
    cSigName.value = data.colaborador.toUpperCase();
    cSigName.alignment = { horizontal: 'center' };
    cSigName.font = { size: 9 };
    r++;
    ws.mergeCells(r, 3, r, 6);
    const cSigDoc = ws.getCell(r, 3);
    cSigDoc.value = data.idDocument ? `DNI N° ${data.idDocument}` : '';
    cSigDoc.alignment = { horizontal: 'center' };
    cSigDoc.font = { size: 9 };

    const buf = await wb.xlsx.writeBuffer();
    this.triggerDownload(
      new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${data.fileBaseName}.xlsx`,
    );
  }

  async exportToPdf(data: RendicionExportData): Promise<void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let y = 15;

    const logoB64 = await this.getLogoBase64();
    if (logoB64) {
      doc.addImage(logoB64, 'PNG', 14, 10, 45, 12);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text('RENDICIÓN DE VIÁTICOS', doc.internal.pageSize.getWidth() / 2, 25, { align: 'center' });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const proyectoLabelPdf = data.projectName && data.projectName !== '—'
      ? data.projectName
      : (data.titulo || '');
    doc.text(`PROYECTO:\n${proyectoLabelPdf}`, doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
    
    if (data.startDate && data.endDate) {
      doc.setFont("helvetica", "bold");
      doc.text(`DEL ${data.startDate} AL ${data.endDate}`, doc.internal.pageSize.getWidth() / 2, 40, { align: 'center' });
    }
    
    y = 50;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Colaborador:  ${data.colaborador}`, 14, y);
    y += 5;
    doc.text(`Localidad:    ${data.location || ''}`, 14, y);
    y += 5;
    doc.text(`DNI:          ${data.idDocument || ''}`, 14, y);
    y += 5;
    doc.text(`Cta / CCI:    ${data.accountNumber || ''}`, 14, y);
    y += 5;
    if (data.peopleNames && data.peopleNames.length > 0) {
      doc.text(`Personas:     ${data.peopleNames.join(', ')}`, 14, y);
      y += 5;
    }
    y += 3;

    let itemIndex = 1;
    let sumIngresos = 0;
    let sumGastos = 0;

    const bodyData: any[] = [];

    data.anticipos.forEach(a => {
      bodyData.push([
        itemIndex++,
        a.fechaSolicitud,
        '',
        '',
        'Transferencia',
        '',
        '',
        a.monto.toFixed(2),
        ''
      ]);
      sumIngresos += a.monto;
    });

    data.comprobantes.forEach(exp => {
      bodyData.push([
        itemIndex++,
        exp.fecha,
        exp.tipo,
        exp.numeroDocumento || '',
        exp.proveedor || '',
        exp.comentario || exp.descripcion || '',
        exp.placaVehiculo || '',
        '',
        (exp.monto || 0).toFixed(2)
      ]);
      sumGastos += exp.monto || 0;
    });

    const minRows = Math.max(5, itemIndex);
    while (itemIndex <= minRows) {
      bodyData.push([itemIndex++, '', '', '', '', '', '', '', '']);
    }

    autoTable(doc, {
      startY: y,
      head: [['Item', 'Fecha\nEmisión', 'Tipo\nde\nDoc.', 'Nº del Documento', 'Proveedor', 'Concepto', 'Placa', 'Ingresos', 'Gastos']],
      body: bodyData,
      theme: 'grid',
      headStyles: { fillColor: [145, 47, 44], textColor: 255, halign: 'center', valign: 'middle' },
      styles: { fontSize: 7, cellPadding: 2, textColor: 0 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 9 },
        1: { halign: 'center', cellWidth: 17 },
        2: { halign: 'center', cellWidth: 18 },
        3: { cellWidth: 24 },
        4: { cellWidth: 36 },
        5: { cellWidth: 'auto' },
        6: { halign: 'center', cellWidth: 16 },
        7: { halign: 'right', cellWidth: 16 },
        8: { halign: 'right', cellWidth: 16 },
      },
      margin: { left: 14, right: 14 }
    });

    y = afterTable(doc);

    // Totals row (simulated below table)
    const rightEdge = doc.internal.pageSize.getWidth() - 14;
    const colW = 16;
    doc.setFillColor(145, 47, 44);
    doc.rect(rightEdge - colW * 2, y, colW, 6, 'F');
    doc.rect(rightEdge - colW, y, colW, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.text(sumIngresos.toFixed(2), rightEdge - colW - 2, y + 4, { align: 'right' });
    doc.text(sumGastos.toFixed(2), rightEdge - 2, y + 4, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    y += 8;

    // Indicadores POR REEMBOLSAR y POR RENDIR (siempre se muestran ambos)
    const diferenciaPdf = sumIngresos - sumGastos;
    const montoReembolsarPdf = diferenciaPdf < 0 ? Math.abs(diferenciaPdf) : 0;
    const montoRendirPdf = diferenciaPdf > 0 ? diferenciaPdf : 0;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text('POR REEMBOLSAR:', rightEdge - colW * 2 - 4, y + 4, { align: 'right' });
    doc.text(`S/ ${montoReembolsarPdf.toFixed(2)}`, rightEdge - 2, y + 4, { align: 'right' });
    y += 6;
    doc.text('POR RENDIR:', rightEdge - colW * 2 - 4, y + 4, { align: 'right' });
    doc.text(`S/ ${montoRendirPdf.toFixed(2)}`, rightEdge - 2, y + 4, { align: 'right' });
    doc.setFont("helvetica", "normal");
    y += 10;

    if (data.items && data.items.length > 0) {
      y += 10;
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text('RESUMEN DE SOLICITUD (PRESUPUESTO DETALLADO)', 14, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [['Viáticos', 'Importe', 'Personas', 'Combustible', 'Días', 'Total']],
        body: data.items.map(i => [
          i.descripcion,
          i.importe.toFixed(2),
          i.personas,
          i.combustible.toFixed(2),
          i.dias,
          i.total.toFixed(2)
        ]),
        theme: 'grid',
        headStyles: { fillColor: [145, 47, 44], textColor: 255 },
        styles: { fontSize: 8 },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'center' },
          3: { halign: 'right' },
          4: { halign: 'center' },
          5: { halign: 'right' },
        },
        margin: { left: 14, right: 14 }
      });
      y = afterTable(doc);
    }

    y += 30;
    if (y > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = 30;
    }

    const centerPage = doc.internal.pageSize.getWidth() / 2;
    if (data.signature) {
      doc.addImage(data.signature, 'PNG', centerPage - 25, y - 25, 50, 25);
    }
    const lineY = y;
    doc.setLineWidth(0.5);
    doc.line(centerPage - 40, lineY, centerPage + 40, lineY);
    doc.setFontSize(8);
    doc.text(data.colaborador.toUpperCase(), centerPage, lineY + 4, { align: 'center' });
    if (data.idDocument) {
      doc.text(`DNI N° ${data.idDocument}`, centerPage, lineY + 8, { align: 'center' });
    }

    doc.save(`${data.fileBaseName}.pdf`);
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

  async exportMobilitySheetToPdf(data: MobilitySheetExportData): Promise<void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const lm = 14;
    const rm = 196;
    const pageW = 210;

    const cfg = this.companyConfigService.getCompanyConfig();
    const companyName = cfg?.businessName || cfg?.name || '';
    const ruc = cfg?.businessId || '';

    const logoB64 = await this.getLogoBase64();

    // Col X positions: Fecha | CliProv | Proyecto | Origen | Destino | Gestión | TOTALES | end
    const cols = [14, 34, 60, 78, 109, 140, 170, 196];

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

    const headers = ['Fecha', 'Cliente/Proveedor', 'Proyecto', 'Origen', 'Destino', 'Gestión', 'TOTALES S/.'];
    for (let i = 0; i < 7; i++) {
      doc.rect(cols[i], y, cols[i + 1] - cols[i], hdr, 'S');
      doc.text(headers[i], (cols[i] + cols[i + 1]) / 2, y + 5, { align: 'center' });
    }

    y += hdr;

    // Data rows (min 10)
    const dataRows = [...data.rows];
    while (dataRows.length < 10) {
      dataRows.push({ fecha: '', clienteProveedor: '', origen: '', destino: '', gestion: '', total: 0 });
    }

    const rowH = 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    for (const row of dataRows) {
      for (let c = 0; c < 7; c++) {
        doc.rect(cols[c], y, cols[c + 1] - cols[c], rowH, 'S');
      }
      if (row.fecha) {
        doc.text(this.formatDateDdMmYyyy(row.fecha), cols[0] + 1, y + 4.5);
      }
      if (row.clienteProveedor) {
        doc.text(doc.splitTextToSize(row.clienteProveedor, cols[2] - cols[1] - 2)[0], cols[1] + 1, y + 4.5);
      }
      if (data.proyecto && (row.fecha || row.origen || row.destino || row.gestion)) {
        doc.text(doc.splitTextToSize(data.proyecto, cols[3] - cols[2] - 2)[0], cols[2] + 1, y + 4.5);
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

    // Signature area
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('LUGAR Y FECHA:', lm, y);

    const sigCX = pageW / 2;
    if (data.signature) {
      doc.addImage(data.signature, 'PNG', sigCX - 25, y + 2, 50, 16);
    }
    y += 20;
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA Trabajador', sigCX, y, { align: 'center' });
    doc.line(sigCX - 35, y + 1.5, sigCX + 35, y + 1.5);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.text(
      data.collaboratorDni ? `DNI   ${data.collaboratorDni}` : 'DNI',
      sigCX,
      y,
      { align: 'center' },
    );
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

    doc.save(`${data.fileBaseName}.pdf`);
  }

  async exportCashVoucherToPdf(data: CashVoucherExportData): Promise<void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    // Quarter A4: 105 x 148 mm
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [105, 148] });
    const pageW = 105;
    const lm = 7;
    const rm = 98;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('COMPROBANTE DE CAJA', pageW / 2, 10, { align: 'center' });

    // Logo + company name + N°
    const logoB64 = await this.getLogoBase64();
    const headerY = 19;
    if (logoB64) {
      doc.addImage(logoB64, 'PNG', lm, headerY - 5, 14, 8);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(data.clientName || '', logoB64 ? lm + 17 : lm, headerY);
    doc.setTextColor(145, 47, 44);
    doc.text(`Nº  ${data.internalCode || '-'}`, rm, headerY, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Separator
    doc.setLineWidth(0.3);
    let y = headerY + 5;
    doc.line(lm, y, rm, y);
    y += 6;

    // Entregado a / Dirección
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const labelW = 24;
    doc.text('Entregado a:', lm, y);
    doc.text(data.entregadoA, lm + labelW, y);
    doc.line(lm + labelW, y + 0.5, rm, y + 0.5);
    y += 6;
    doc.text('Dirección:', lm, y);
    const direccionLines = (doc.splitTextToSize(data.direccion || '', rm - (lm + labelW)) as string[]).slice(0, 2);
    doc.text(direccionLines[0] || '', lm + labelW, y);
    doc.line(lm + labelW, y + 0.5, rm, y + 0.5);
    y += 7;

    // Segunda línea (si la dirección es larga) va sobre la línea separadora existente
    if (direccionLines.length > 1) {
      doc.text(direccionLines[1], lm, y - 1);
    }
    doc.line(lm, y, rm, y);
    y += 5;

    // He recibido de / concepto
    doc.text(`He recibido de ${data.clientName || ''}`, lm, y);
    y += 5;
    const conceptoLabel = 'Por concepto de:  ';
    doc.text(conceptoLabel, lm, y);
    const conceptoX = lm + doc.getTextWidth(conceptoLabel);
    const conceptoLines = (doc.splitTextToSize(data.concepto || '', rm - conceptoX) as string[]).slice(0, 2);
    doc.text(conceptoLines[0] || '', conceptoX, y);
    doc.line(conceptoX, y + 0.5, rm, y + 0.5);
    y += 7;

    // Segunda línea (si el concepto es largo) va sobre la línea separadora existente
    if (conceptoLines.length > 1) {
      doc.text(conceptoLines[1], lm, y - 1);
    }
    doc.line(lm, y, rm, y);
    y += 5;

    // La Suma de / Proyecto
    const sumaLabel = 'La Suma de:  ';
    doc.text(sumaLabel, lm, y);
    const sumaX = lm + doc.getTextWidth(sumaLabel);
    doc.setFont('helvetica', 'bold');
    doc.text(`S/ ${data.monto.toFixed(2)}`, sumaX, y);
    doc.setFont('helvetica', 'normal');
    doc.line(sumaX, y + 0.5, rm, y + 0.5);
    y += 6;
    const proyLabel = 'Proyecto:  ';
    doc.text(proyLabel, lm, y);
    const proyX = lm + doc.getTextWidth(proyLabel);
    doc.text(data.projectName || '-', proyX, y);
    doc.line(proyX, y + 0.5, rm, y + 0.5);
    y += 12;

    // Signature block (right side)
    const sigX1 = 58;
    const sigX2 = rm;
    const sigCX = (sigX1 + sigX2) / 2;
    if (data.signature) {
      doc.addImage(data.signature, 'PNG', sigCX - 16, y - 10, 32, 10);
    }
    doc.line(sigX1, y, sigX2, y);
    doc.setFontSize(7);
    doc.text('Firma', sigCX, y + 4, { align: 'center' });
    doc.text(`DNI: ${data.collaboratorDni || ''}`, sigCX, y + 8, { align: 'center' });
    y += 14;

    // Date
    doc.setFontSize(8);
    const dateObj = parseFechaEmisionInput(data.fechaEmision) ?? new Date();
    const day = dateObj.getDate();
    const month = dateObj.getMonth() + 1;
    const year = dateObj.getFullYear();
    doc.text(`Lima,   ${day}   de   ${month}   de   ${year}`, lm, y);

    // Footer
    doc.setLineWidth(0.2);
    doc.line(lm, 140, rm, 140);
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text(data.clientName || '', pageW / 2, 144, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    doc.save(`${data.fileBaseName}.pdf`);
  }

  async exportReceiptToPdf(data: ReceiptExportData): Promise<void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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

    doc.save(`${data.fileBaseName}.pdf`);
  }

  async exportMobilitySheetToExcel(data: MobilitySheetExportData): Promise<void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Viatika';
    wb.created = new Date();
    const ws = wb.addWorksheet('Planilla Movilidad', { views: [{ showGridLines: false }] });

    ws.columns = [
      { width: 14 },  // A: Fecha
      { width: 24 },  // B: Cliente/Proveedor
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
      ws.addImage(imgId, { tl: { col: 5, row: 0 }, ext: { width: 150, height: 60 } });
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
    const hdrLabels = ['Fecha', 'Cliente/Proveedor', 'Proyecto', 'Origen', 'Destino', 'Gestión', 'TOTALES S/.'];
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
      dataRows.push({ fecha: '', clienteProveedor: '', origen: '', destino: '', gestion: '', total: 0 });
    }

    for (const row of dataRows) {
      const hasContent = !!(row.fecha || row.origen || row.destino || row.gestion);
      ws.getCell(r, 1).value = this.formatDateDdMmYyyy(row.fecha);
      ws.getCell(r, 2).value = row.clienteProveedor || '';
      ws.getCell(r, 3).value = hasContent ? (data.proyecto || '') : '';
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

  async exportSingleExpenseAffidavitToPdf(data: SingleExpenseAffidavitData): Promise<void> {
    data = { ...data, signature: await this.resolveSignature(data.signature) };
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

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
        head: [['Fecha', 'Cliente / Proveedor', 'Origen', 'Destino', 'Gestión', 'Total (S/)']],
        body: data.mobilityRows.map(r => [r.fecha, r.clienteProveedor || '—', r.origen || '—', r.destino || '—', r.gestion || '—', r.total.toFixed(2)]),
        theme: 'grid',
        headStyles: { fillColor: [145, 47, 44], textColor: 255 },
        styles: { fontSize: 8 },
        columnStyles: { 5: { halign: 'right' } },
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

    doc.save(`${data.fileBaseName}.pdf`);
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

