import { Injectable, inject } from '@angular/core';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CompanyConfigService } from './company-config.service';
import { ICajaChicaReport } from '../interfaces/caja-chica-report.interface';

type JsPdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

const RED_HEADER = 'FF912f2c';

export interface CajaChicaExportRow {
  colaborador: string;
  colaboradorDni?: string;
  tipo: string;
  fecha: string;
  centroCosto: string;
  categoria: string;
  numDoc: string;
  proveedor: string;
  descripcion: string;
  monto: number;
}

@Injectable({ providedIn: 'root' })
export class CajaChicaReportExportService {
  private companyConfigService = inject(CompanyConfigService);

  private get companyName(): string {
    return this.companyConfigService.getCompanyConfig()?.name || 'Empresa';
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
    } catch {
      if (logoUrl) {
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

  async exportPdf(report: ICajaChicaReport, rows: CajaChicaExportRow[]): Promise<void> {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as JsPdfWithAutoTable;
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;

    const logoB64 = await this.getLogoBase64();

    const addPageHeader = (isFirst: boolean) => {
      if (!isFirst) doc.addPage();
      if (logoB64) doc.addImage(logoB64, 'PNG', margin, 8, 45, 12);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(30);
      doc.text('REPORTE CAJA CHICA', pageW / 2, 15, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(80);
      doc.text(this.companyName, pageW / 2, 21, { align: 'center' });
      doc.text(report.title, pageW / 2, 27, { align: 'center' });

      const statusLabel = report.status === 'finalized' ? 'Finalizado' : 'Borrador';
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Codigo: ${report.codigo}`, pageW - margin, 13, { align: 'right' });
      doc.text(`Estado: ${statusLabel}`, pageW - margin, 18, { align: 'right' });
    };

    // Group rows by collaborator — one page per collaborator
    const groups = new Map<string, CajaChicaExportRow[]>();
    for (const row of rows) {
      if (!groups.has(row.colaborador)) groups.set(row.colaborador, []);
      groups.get(row.colaborador)!.push(row);
    }

    let isFirst = true;
    let itemIndexGlobal = 1;

    for (const [colaborador, colRows] of groups) {
      addPageHeader(isFirst);
      isFirst = false;

      let y = 34;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30);
      doc.text(`Colaborador:  ${colaborador}`, margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80);

      const colaboradorDni = colRows.find((r) => r.colaboradorDni)?.colaboradorDni;
      if (colaboradorDni) {
        doc.setFontSize(8);
        doc.text(`DNI:  ${colaboradorDni}`, margin, y);
        y += 5;
      }

      y += 3;

      const bodyData: any[][] = [];
      let sumGastos = 0;

      for (const row of colRows) {
        bodyData.push([
          itemIndexGlobal++,
          row.fecha,
          row.tipo,
          row.numDoc,
          row.centroCosto !== '-' ? row.centroCosto : '',
          row.categoria !== '-' ? row.categoria : '',
          row.proveedor !== '-' ? row.proveedor : '',
          row.descripcion !== 'N/A' ? row.descripcion : '',
          '',
          '',
          row.monto.toFixed(2),
        ]);
        sumGastos += row.monto;
      }

      autoTable(doc, {
        startY: y,
        head: [['Item', 'Fecha\nEmisión', 'Tipo\nde\nDoc.', 'Nº del Documento', 'Centro de\nCosto', 'Categoría', 'Proveedor', 'Concepto', 'Placa', 'Ingresos', 'Gastos']],
        body: bodyData,
        theme: 'grid',
        headStyles: { fillColor: [145, 47, 44], textColor: 255, halign: 'center', valign: 'middle', fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 2, textColor: 0 },
        columnStyles: {
          0: { halign: 'center', cellWidth: 9 },
          1: { halign: 'center', cellWidth: 16 },
          2: { halign: 'center', cellWidth: 14 },
          3: { cellWidth: 22 },
          4: { cellWidth: 26 },
          5: { cellWidth: 24 },
          6: { cellWidth: 30 },
          7: { cellWidth: 'auto' },
          8: { halign: 'center', cellWidth: 12 },
          9: { halign: 'right', cellWidth: 16 },
          10: { halign: 'right', cellWidth: 16 },
        },
        margin: { left: margin, right: margin },
      });

      const finalY = (doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? y;

      // Totals row — 2 red cells (Ingresos + Gastos) matching rendicion style
      const rightEdge = pageW - margin;
      const colW = 16;
      doc.setFillColor(145, 47, 44);
      doc.rect(rightEdge - colW * 2, finalY, colW, 6, 'F');
      doc.rect(rightEdge - colW, finalY, colW, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text((0).toFixed(2), rightEdge - colW - 2, finalY + 4, { align: 'right' });
      doc.text(sumGastos.toFixed(2), rightEdge - 2, finalY + 4, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }

    doc.save(`CC-${report.codigo}-${report.title.replace(/\s+/g, '_')}.pdf`);
  }

  async exportExcel(report: ICajaChicaReport, rows: CajaChicaExportRow[]): Promise<void> {
    const wb = new ExcelJS.Workbook();
    wb.creator = this.companyName;
    wb.created = new Date();

    const ws = wb.addWorksheet('Caja Chica', { views: [{ showGridLines: false }] });

    ws.columns = [
      { width: 6 },   // Item
      { width: 12 },  // Fecha
      { width: 14 },  // Tipo
      { width: 18 },  // Nº Doc
      { width: 22 },  // Centro de Costo
      { width: 20 },  // Categoría
      { width: 28 },  // Proveedor
      { width: 32 },  // Concepto
      { width: 10 },  // Placa
      { width: 12 },  // Ingresos
      { width: 14 },  // Gastos
    ];

    const logoB64 = await this.getLogoBase64();
    if (logoB64) {
      const imageId = wb.addImage({ base64: logoB64, extension: 'png' });
      ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 140, height: 40 } });
    }

    ws.mergeCells('A4:K4');
    const titleCell = ws.getCell('A4');
    titleCell.value = 'REPORTE CAJA CHICA';
    titleCell.font = { bold: true, size: 13 };
    titleCell.alignment = { horizontal: 'center' };

    ws.mergeCells('A5:K5');
    const companyCell = ws.getCell('A5');
    companyCell.value = this.companyName;
    companyCell.font = { size: 10 };
    companyCell.alignment = { horizontal: 'center' };

    ws.mergeCells('A6:K6');
    const reportTitleCell = ws.getCell('A6');
    reportTitleCell.value = report.title;
    reportTitleCell.font = { size: 10, italic: true };
    reportTitleCell.alignment = { horizontal: 'center' };
    ws.getRow(6).height = 18;

    ws.getCell('A8').value = 'Codigo:';
    ws.getCell('A8').font = { bold: true };
    ws.getCell('B8').value = report.codigo;
    ws.getCell('C8').value = 'Estado:';
    ws.getCell('C8').font = { bold: true };
    ws.getCell('D8').value = report.status === 'finalized' ? 'Finalizado' : 'Borrador';
    ws.getCell('E8').value = 'Rendiciones:';
    ws.getCell('E8').font = { bold: true };
    ws.getCell('F8').value = report.selectedReports.length;

    ws.getCell('A9').value = 'Total (S/):';
    ws.getCell('A9').font = { bold: true };
    const totalMetaCell = ws.getCell('B9');
    totalMetaCell.value = report.totalAmount;
    totalMetaCell.numFmt = '"S/"#,##0.00';
    totalMetaCell.font = { bold: true };

    let r = 11;
    // Item, Fecha Emisión, Tipo de Doc., Nº del Documento, Centro de Costo, Categoría, Proveedor, Concepto, Placa, Ingresos, Gastos
    const headers = ['Item', 'Fecha\nEmisión', 'Tipo\nde\nDoc.', 'Nº del Documento', 'Centro de\nCosto', 'Categoría', 'Proveedor', 'Concepto', 'Placa', 'Ingresos', 'Gastos'];
    headers.forEach((h, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_HEADER } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
      };
    });
    ws.getRow(r).height = 30;
    r++;

    let itemIndex = 1;
    let currentColaborador = '';
    let subtotal = 0;
    const lastDataCol = 11;

    const addDataRow = (vals: any[]) => {
      vals.forEach((val, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = val;
        c.border = {
          top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
        };
        if (i === 9 || i === 10) { // Ingresos + Gastos
          c.numFmt = '#,##0.00';
          c.alignment = { horizontal: 'right' };
          if (!val) c.value = '';
        } else if (i === 0 || i === 1 || i === 2) {
          c.alignment = { horizontal: 'center' };
        } else {
          c.alignment = { wrapText: true };
        }
      });
      r++;
    };

    const addGroupRow = (label: string, amount: number, isTotal = false) => {
      const fillColor = { argb: isTotal ? RED_HEADER : 'FFF5F5F5' };
      const bt = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };
      ws.mergeCells(r, 1, r, lastDataCol - 2); // label spans hasta antes de Ingresos/Gastos
      const cLabel = ws.getCell(r, 1);
      cLabel.value = label;
      cLabel.font = { bold: true, color: isTotal ? { argb: 'FFFFFFFF' } : undefined };
      cLabel.alignment = { horizontal: 'right' };
      cLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: fillColor };
      cLabel.border = bt;
      // Ingresos (col 8) — always empty for caja chica
      const cIng = ws.getCell(r, lastDataCol - 1);
      cIng.value = '';
      cIng.fill = { type: 'pattern', pattern: 'solid', fgColor: fillColor };
      cIng.border = bt;
      // Gastos (col 9)
      const cGas = ws.getCell(r, lastDataCol);
      cGas.value = amount;
      cGas.numFmt = '#,##0.00';
      cGas.font = { bold: true, color: isTotal ? { argb: 'FFFFFFFF' } : undefined };
      cGas.alignment = { horizontal: 'right' };
      cGas.fill = { type: 'pattern', pattern: 'solid', fgColor: fillColor };
      cGas.border = bt;
      r++;
    };

    for (const row of rows) {
      if (row.colaborador !== currentColaborador) {
        if (currentColaborador) {
          addGroupRow(`Subtotal ${currentColaborador}`, subtotal);
          subtotal = 0;
        }
        currentColaborador = row.colaborador;
        ws.mergeCells(r, 1, r, lastDataCol);
        const cColHeader = ws.getCell(r, 1);
        cColHeader.value = row.colaboradorDni
          ? `${row.colaborador}   —   DNI: ${row.colaboradorDni}`
          : row.colaborador;
        cColHeader.font = { bold: true, color: { argb: 'FF912f2c' } };
        cColHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBF3EE' } };
        cColHeader.alignment = { horizontal: 'left' };
        cColHeader.border = {
          top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
        };
        r++;
      }
      addDataRow([itemIndex++, row.fecha, row.tipo, row.numDoc, row.centroCosto !== '-' ? row.centroCosto : '', row.categoria !== '-' ? row.categoria : '', row.proveedor !== '-' ? row.proveedor : '', row.descripcion !== 'N/A' ? row.descripcion : '', '', '', row.monto]);
      subtotal += row.monto;
    }

    if (currentColaborador) {
      addGroupRow(`Subtotal ${currentColaborador}`, subtotal);
    }
    addGroupRow('TOTAL GENERAL', report.totalAmount, true);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CC-${report.codigo}-${report.title.replace(/\s+/g, '_')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
