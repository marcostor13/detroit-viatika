import { Component, inject, OnInit, signal } from '@angular/core';
import { FileDownloadComponent } from '../../components/file-download/file-download.component';
import { InvoicesService } from './services/invoices.service';
import { Router } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import {
  IInvoiceResponse,
  InvoiceStatus,
  SunatValidationInfo,
} from './interfaces/invoices.interface';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { IProject } from './interfaces/project.interface';
import { DataComponent } from '../../components/data/data.component';
import { UserStateService } from '../../services/user-state.service';
import { ButtonComponent } from '../../design-system/button/button.component';
import { ExportButtonComponent } from '../../design-system/export-button/export-button.component';
import { PaginatorComponent } from '../../design-system/paginator/paginator.component';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { CommonModule } from '@angular/common';
import { IPaginatedResult } from '../../interfaces/paginated-result.interface';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [DataComponent, FileDownloadComponent, ButtonComponent, ExportButtonComponent, PaginatorComponent, CommonModule],
  templateUrl: './invoices.component.html',
  styleUrl: './invoices.component.scss',
})
export default class InvoicesComponent implements OnInit {
  private agentService = inject(InvoicesService);
  private router = inject(Router);
  private notificationService = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);
  private userStateService = inject(UserStateService);
  private expenseReportsService = inject(ExpenseReportsService);

  hasRendiciones = true;

  result = signal<IPaginatedResult<IInvoiceResponse>>({ data: [], total: 0, page: 1, pages: 0, limit: 20 });
  page = signal(1);
  limit = signal(20);
  invoices: IInvoiceResponse[] = [];
  projects: IProject[] = [];

  headers: IHeaderList[] = [
    {
      header: 'Proyecto',
      value: 'proyect',
    },
    {
      header: 'Proveedor',
      value: 'provider',
    },
    {
      header: 'Total',
      value: 'total',
    },
    {
      header: 'Fecha',
      value: 'date',
    },
    {
      header: 'Estado',
      value: 'status',
    },
    {
      header: 'Acciones',
      value: 'actions',
      options: ['view', 'download', 'edit', 'delete'],
    },
  ];

  exportFileType: 'excel' | 'pdf' = 'excel';
  exportColumns = [
    { header: 'Proyecto', field: 'proyect' },
    { header: 'Categoría', field: 'category' },
    { header: 'Razón Social', field: 'provider' },
    { header: 'RUC', field: 'ruc' },
    { header: 'Dirección', field: 'address' },
    { header: 'Tipo', field: 'tipo' },
    { header: 'Total', field: 'total' },
    { header: 'Fecha', field: 'date' },
    { header: 'Estado', field: 'status' },
  ];

  ngOnInit() {
    this.checkRendiciones();
    this.loadProjects();
  }

  checkRendiciones() {
    if (!this.userStateService.isColaborador()) return;
    const user = this.userStateService.getUser();
    const userId = user?._id;
    const clientId = user?.companyId;
    if (!userId || !clientId) return;

    this.expenseReportsService.findAllByUser(userId, clientId).subscribe({
      next: (reports) => {
        this.hasRendiciones = reports.length > 0;
      },
    });
  }

  loadProjects() {
    this.agentService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
      },
      complete: () => {
        this.getInvoices();
      },
    });
  }

  getInvoices() {
    const user = this.userStateService.getUser();
    const filters = this.userStateService.isColaborador() && user?._id
      ? { createdBy: user._id }
      : undefined;

    this.agentService
      .getInvoices(filters, 'createdAt', 'desc', this.page(), this.limit())
      .subscribe((res) => {
        this.result.set(res);
        this.invoices = this.formatResponse(res.data || []);
      });
  }

  onPageChange(p: number) { this.page.set(p); this.getInvoices(); }
  onLimitChange(l: number) { this.limit.set(l); this.page.set(1); this.getInvoices(); }

  downloadInvoice(_id: string) {
    const url = this.invoices.find((invoice) => invoice._id === _id)?.file;
    if (url) {
      window.open(url, '_blank');
    } else {
      this.notificationService.show('No se pudo descargar la factura', 'error');
    }
  }

  formatResponse(res: IInvoiceResponse[]): IInvoiceResponse[] {
    if (!res || !Array.isArray(res)) {
      return [];
    }
    return res.map((invoice) => {
      let invoiceData: any = {};

      try {
        if (invoice.data) {
          if (typeof invoice.data === 'string') {
            try {
              invoiceData = JSON.parse(invoice.data);
            } catch (parseError) {}
          } else if (typeof invoice.data === 'object') {
            invoiceData = invoice.data;
          }
        }
      } catch (error) {}

      const razonSocial = invoiceData.razonSocial || 'No disponible';
      const direccionEmisor = invoiceData.direccionEmisor || 'No disponible';
      const rucEmisor = invoiceData.rucEmisor || 'No disponible';
      const tipoComprobante = invoiceData.tipoComprobante || 'No disponible';
      const fechaEmision = invoiceData.fechaEmision || 'No disponible';
      const moneda = invoiceData.moneda || '';
      const montoTotal = invoiceData.montoTotal || invoice.total || 0;
      const serie = invoiceData.serie || 'No disponible';
      const correlativo = invoiceData.correlativo || 'No disponible';

      // Información de validación SUNAT
      const sunatValidation = invoiceData.sunatValidation;
      const sunatStatus = this.formatSunatStatus(
        invoice.status || 'pending',
        sunatValidation
      );

      return {
        ...invoice,
        proyect: invoice.proyectId?.name || 'No disponible',
        category: invoice.categoryId?.name || 'No disponible',
        ruc: rucEmisor,
        tipo: tipoComprobante,
        createdAt: new Date(invoice.createdAt).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        total: moneda ? `${moneda} ${montoTotal}` : montoTotal.toString(),
        address: direccionEmisor,
        provider: razonSocial,
        date: fechaEmision,
        status: invoice.status || 'pending',
        serie,
        correlativo,
        sunatStatus,
      };
    });
  }

  capitalizeFirstLetter(text: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  formatSunatStatus(
    status: string,
    sunatValidation?: any
  ): { text: string; icon: string; color: string } {
    switch (status) {
      case 'sunat_valid':
        return { text: 'Válido', icon: 'check', color: 'green' };
      case 'sunat_valid_not_ours':
        return {
          text: 'Válido (No pertenece)',
          icon: 'warning',
          color: 'yellow',
        };
      case 'sunat_not_found':
        return { text: 'No encontrado', icon: 'x', color: 'red' };
      case 'sunat_error':
        return { text: 'Error SUNAT', icon: 'x', color: 'red' };
      default:
        return { text: 'Sin validar', icon: 'question', color: 'gray' };
    }
  }

  editInvoice(id: string) {
    this.router.navigate(['/invoices/edit', id]);
  }

  gotToAddInvoice() {
    if (!this.hasRendiciones) {
      this.notificationService.show(
        'Necesitas tener una rendición asignada para subir facturas.',
        'error'
      );
      return;
    }
    this.router.navigate(['/invoices/add']);
  }

  clickOptions(event: { option: string; _id: string }) {
    const { option, _id } = event;
    switch (option) {
      case 'view':
        this.router.navigate(['/invoices', _id, 'details']);
        break;
      case 'edit':
        this.router.navigate(['/invoices/edit', _id]);
        break;
      case 'delete':
        this.confirmationService.show('¿Desea eliminar esta factura?', () => {
          this.deleteInvoice(_id);
        });
        break;
      case 'download':
        this.downloadInvoice(_id);
        break;
      case 'sunat-info':
        this.showSunatInfo(_id);
        break;
    }
  }

  showSunatInfo(id: string) {
    const companyId = this.userStateService.getUser()?.companyId;
    if (companyId) {
      this.agentService.getSunatValidation(id, companyId).subscribe({
        next: (validationInfo: SunatValidationInfo) => {
          this.displaySunatValidationInfo(validationInfo);
        },
        error: (error) => {
          this.notificationService.show(
            'Error al obtener información de SUNAT',
            'error'
          );
          console.error('Error fetching SUNAT validation:', error);
        },
      });
    }
  }

  displaySunatValidationInfo(info: SunatValidationInfo) {
    const statusMessage = this.formatSunatStatus(info.status);

    // Usar la notificación existente para mostrar información básica
    let shortMessage = `${statusMessage.text} - ${info.message}`;

    if (info.extractedData && info.extractedData.rucEmisor) {
      shortMessage += ` | RUC: ${info.extractedData.rucEmisor}`;
    }

    // Determinar el tipo de notificación basado en el estado - solo success o error
    const isError =
      info.status === 'sunat_error' ||
      info.status === 'sunat_not_found' ||
      info.status === 'sunat_valid_not_ours';

    this.notificationService.show(shortMessage, isError ? 'error' : 'success');

    // Para detalles completos, mantener el alert temporal
    // TODO: Se puede reemplazar con un modal personalizado más adelante
    if (info.sunatValidation?.details) {
      console.log('Detalles completos de SUNAT:', info);
    }
  }

  approveInvoice(id: string) {
    const payload = {
      status: 'approved' as InvoiceStatus,
    };

    this.agentService.approveInvoice(id, payload).subscribe({
      next: () => {
        this.notificationService.show(
          'Factura aprobada correctamente',
          'success'
        );
        this.getInvoices();
      },
      error: () => {
        this.notificationService.show('Error al aprobar la factura', 'error');
      },
    });
  }

  rejectInvoice(id: string, reason: string) {
    const payload = {
      status: 'rejected' as InvoiceStatus,
      reason: reason,
    };

    this.agentService.rejectInvoice(id, payload).subscribe({
      next: () => {
        this.notificationService.show(
          'Factura rechazada correctamente',
          'success'
        );
        this.getInvoices();
      },
      error: () => {
        this.notificationService.show('Error al rechazar la factura', 'error');
      },
    });
  }

  deleteInvoice(id: string) {
    this.agentService.deleteInvoice(id).subscribe({
      next: () => {
        this.notificationService.show(
          'Factura eliminada correctamente',
          'success'
        );
        this.getInvoices();
      },
      error: () => {
        this.notificationService.show('Error al eliminar la factura', 'error');
      },
    });
  }

  exportInvoices(fileType: 'excel' | 'pdf'): void {
    this.exportFileType = fileType;
    setTimeout(() => {
      const exportComponent = document.getElementById('export-invoices');
      if (
        exportComponent &&
        typeof (exportComponent as any).downloadFile === 'function'
      ) {
        (exportComponent as any).downloadFile();
      } else {
        console.error(
          'Componente de descarga no encontrado o método no disponible'
        );
      }
    }, 100);
  }

  getStatusName(status?: InvoiceStatus | string): string {
    if (!status) return 'Pendiente';

    switch (status) {
      case 'pending':
      case 'PENDING':
        return 'Pendiente';
      case 'approved':
      case 'APPROVED':
        return 'Aprobada';
      case 'rejected':
      case 'REJECTED':
        return 'Rechazada';
      case 'sunat_valid':
      case 'VALIDO_ACEPTADO':
        return 'Válida';
      case 'sunat_valid_not_ours':
      case 'VALIDO_NO_PERTENECE':
        return 'No pertenece a la empresa';
      case 'sunat_not_found':
      case 'NO_ENCONTRADO':
        return 'No Encontrado SUNAT';
      case 'sunat_error':
      case 'ERROR_SUNAT':
        return 'Rechazada';
      default:
        return status;
    }
  }

  getStatusColor(status?: InvoiceStatus | string): string {
    if (!status) return 'bg-yellow-100 text-yellow-800';

    switch (status) {
      case 'pending':
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'rejected':
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      case 'sunat_valid':
      case 'VALIDO_ACEPTADO':
        return 'bg-primary/10 text-primary';
      case 'sunat_valid_not_ours':
      case 'VALIDO_NO_PERTENECE':
        return 'bg-amber-100 text-amber-800';
      case 'sunat_not_found':
      case 'NO_ENCONTRADO':
        return 'bg-gray-100 text-gray-800';
      case 'sunat_error':
      case 'ERROR_SUNAT':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusInfo(status?: InvoiceStatus | string): string {
    if (!status) return '';

    switch (status) {
      case 'sunat_valid':
      case 'VALIDO_ACEPTADO':
        return 'Factura Válida y emitida a la empresa';
      case 'sunat_valid_not_ours':
      case 'VALIDO_NO_PERTENECE':
        return 'El comprobante no fue emitido a esta empresa';
      case 'sunat_error':
      case 'ERROR_SUNAT':
        return 'Error en el servicio de sunat';
      default:
        return '';
    }
  }
}
