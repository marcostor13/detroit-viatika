import { Component, Input, OnInit, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-file-download',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-download.component.html',
  styleUrl: './file-download.component.scss',
})
export class FileDownloadComponent implements OnInit {
  @Input() data: any[] = [];
  @Input() fileName: string = 'documento';
  @Input() fileType: 'excel' | 'pdf' | 'csv' = 'excel';
  @Input() columns: { header: string; field: string }[] = [];

  constructor(private el: ElementRef) {}

  ngOnInit(): void {
    const element = this.el.nativeElement;
    element.downloadFile = () => {
      this.downloadFile();
    };
  }

  downloadFile(): void {
    if (this.fileType === 'excel' || this.fileType === 'csv') {
      this.downloadCSV();
    } else {
      this.downloadPrintablePDF();
    }
  }

  private downloadCSV(): void {
    if (!this.data || this.data.length === 0) {
      return;
    }

    const headers = this.columns.map((column) => column.header);
    let csvContent = headers.join(',') + '\n';

    this.data.forEach((item) => {
      const row = this.columns.map((column) => {
        const value = item[column.field] || '';
        return typeof value === 'string' &&
          (value.includes(',') || value.includes('"'))
          ? `"${value.replace(/"/g, '""')}"`
          : value;
      });
      csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${this.fileName}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  private downloadPrintablePDF(): void {
    if (!this.data || this.data.length === 0) {
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    iframe.onload = () => {
      const iframeDoc =
        iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        document.body.removeChild(iframe);
        return;
      }

      const style = `
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background-color: #f2f2f2; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          h1 { text-align: center; color: #333; }
          @page { size: auto; margin: 10mm; }
        </style>
      `;

      let htmlContent = `
        <html>
          <head>
            <title>${this.fileName}</title>
            ${style}
          </head>
          <body>
            <h1>${this.fileName}</h1>
            <table>
              <thead>
                <tr>
                  ${this.columns
                    .map((column) => `<th>${column.header}</th>`)
                    .join('')}
                </tr>
              </thead>
              <tbody>
      `;

      this.data.forEach((item) => {
        htmlContent += '<tr>';
        this.columns.forEach((column) => {
          htmlContent += `<td>${item[column.field] || ''}</td>`;
        });
        htmlContent += '</tr>';
      });

      htmlContent += `
              </tbody>
            </table>
          </body>
        </html>
      `;

      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      setTimeout(() => {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          }

          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        } catch (error) {
          console.error('Error al generar PDF:', error);
          document.body.removeChild(iframe);

          this.downloadHTMLAsFile();
        }
      }, 500);
    };

    iframe.src = 'about:blank';
  }

  private downloadHTMLAsFile(): void {
    const style = `
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background-color: #f2f2f2; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        h1 { text-align: center; color: #333; }
      </style>
    `;

    let htmlContent = `
      <html>
        <head>
          <title>${this.fileName}</title>
          ${style}
        </head>
        <body>
          <h1>${this.fileName}</h1>
          <p>Para obtener un PDF, abra este archivo en un navegador y use la función de impresión (Ctrl+P) seleccionando "Guardar como PDF".</p>
          <table>
            <thead>
              <tr>
                ${this.columns
                  .map((column) => `<th>${column.header}</th>`)
                  .join('')}
              </tr>
            </thead>
            <tbody>
    `;

    this.data.forEach((item) => {
      htmlContent += '<tr>';
      this.columns.forEach((column) => {
        htmlContent += `<td>${item[column.field] || ''}</td>`;
      });
      htmlContent += '</tr>';
    });

    htmlContent += `
            </tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${this.fileName}.html`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}
