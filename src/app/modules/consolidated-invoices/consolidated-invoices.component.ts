import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FileDownloadComponent } from '../../components/file-download/file-download.component';
import { ChartsComponent } from './charts/charts.component';
import { Router, RouterLink } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
import { ConfirmationService } from '../../services/confirmation.service';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { InvoicesService } from '../invoices/services/invoices.service';
import {
  IInvoiceResponse,
  ApprovalPayload,
  InvoiceStatus,
} from '../invoices/interfaces/invoices.interface';
import { ICategory } from '../invoices/interfaces/category.interface';
import { IProject } from '../invoices/interfaces/project.interface';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { tap } from 'rxjs/operators';
import { DataComponent } from '../../components/data/data.component';
import { AdminUsersService } from '../admin-users/services/admin-users.service';
import { IUserResponse } from '../../interfaces/user.interface';
import { ButtonComponent } from '../../design-system/button/button.component';
import { ExportButtonComponent } from '../../design-system/export-button/export-button.component';
import { PaginatorComponent } from '../../design-system/paginator/paginator.component';
import { IPaginatedResult } from '../../interfaces/paginated-result.interface';

interface IInvoice {
  _id?: string;
  proyect: string;
  proyectId?: string | IProject;
  category: string;
  categoryKey?: string;
  file: string;
  createdAt: string;
  updatedAt: string;
  total: string | number;
  userId?: string;
  createdBy?: string;
  uploadedBy?: string;

  ruc?: string;
  tipo?: string;
  address?: string;
  provider?: string;
  date?: string;

  rucEmisor?: string;
  tipoComprobante?: string;
  serie?: string;
  correlativo?: string;
  fechaEmision?: string;
  moneda?: string;
  montoTotal?: number;
  razonSocial?: string;
  direccionEmisor?: string;

  status?: InvoiceStatus;
  statusDate?: string;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

@Component({
  selector: 'app-consolidated-invoices',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DataComponent,
    FileDownloadComponent,
    ChartsComponent,
    ButtonComponent,
    ExportButtonComponent,
    PaginatorComponent,
  ],
  templateUrl: './consolidated-invoices.component.html',
  styleUrl: './consolidated-invoices.component.scss',
})
export class ConsolidatedInvoicesComponent implements OnInit {
  private agentService = inject(InvoicesService);
  readonly router = inject(Router);
  private notificationService = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);
  private adminUsersService = inject(AdminUsersService);

  rejectionReason = signal('');
  selectedInvoiceId = signal('');
  showRejectionModal = signal(false);
  categories: ICategory[] = [];
  projects: IProject[] = [];
  invoices: IInvoice[] = [];
  userInvoices: IInvoice[] = [];
  users: IUserResponse[] = [];
  loading = false;
  result = signal<IPaginatedResult<IInvoiceResponse>>({ data: [], total: 0, page: 1, pages: 0, limit: 20 });
  page = signal(1);
  limit = signal(20);
  statsData = signal({ pending: 0, approved: 0, rejected: 0, total: 0 });

  projectsWithInvoiceCount: { id: string; name: string; count: number }[] = [];

  headers: IHeaderList[] = [
    {
      header: 'Proyecto',
      value: 'proyect',
    },
    {
      header: 'Categoría',
      value: 'category',
    },
    {
      header: 'Razón Social',
      value: 'provider',
    },
    {
      header: 'RUC',
      value: 'ruc',
    },
    {
      header: 'Dirección',
      value: 'address',
    },
    {
      header: 'Tipo',
      value: 'tipo',
    },
    {
      header: 'Serie',
      value: 'serie',
    },
    {
      header: 'Correlativo',
      value: 'correlativo',
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
      header: 'Subido por',
      value: 'uploadedBy',
    },
    {
      header: 'Estado',
      value: 'status',
    },
    {
      header: 'Acciones',
      value: 'actions',
      options: ['download', 'approve', 'reject'],
    },
  ];

  filterProject = signal('');
  filterDateFrom = signal('');
  filterDateTo = signal('');
  filterCategory = signal('');
  filterAmountMin = signal('');
  filterAmountMax = signal('');
  filterStatus = signal('');

  activeFilterCount = computed(() =>
    [this.filterProject(), this.filterCategory(), this.filterStatus(),
     this.filterDateFrom(), this.filterDateTo(), this.filterAmountMin(), this.filterAmountMax()]
      .filter(v => !!v).length
  );

  projectAccentColors = ['#D31212', '#9B1B22', '#FFB547', '#05CD99', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6'];

  exportFileType: 'excel' | 'pdf' = 'excel';
  exportColumns = [
    { header: 'Proyecto', field: 'proyect' },
    { header: 'Categoría', field: 'category' },
    { header: 'Razón Social', field: 'provider' },
    { header: 'RUC', field: 'ruc' },
    { header: 'Dirección', field: 'address' },
    { header: 'Tipo', field: 'tipo' },
    { header: 'Serie', field: 'serie' },
    { header: 'Correlativo', field: 'correlativo' },
    { header: 'Total', field: 'total' },
    { header: 'Fecha', field: 'date' },
    { header: 'Subido por', field: 'uploadedBy' },
    { header: 'Estado', field: 'status' },
  ];

  filters = computed(() => ({
    projectId: this.filterProject(),
    categoryId: this.filterCategory(),
    status: this.filterStatus(),
    dateFrom: this.filterDateFrom(),
    dateTo: this.filterDateTo(),
    amountMin: this.filterAmountMin(),
    amountMax: this.filterAmountMax(),
  }));

  ngOnInit() {
    this.getProjects();
    this.getUsers();
    this.loadStats();
    const categories$ = this.getCategories();
    if (categories$) {
      categories$.subscribe({
        next: () => {
          this.getInvoices();
        },
        error: (error) => {
          this.notificationService.show(
            'Error al cargar las categorías: ' + error.message,
            'error'
          );
        },
      });
    }
  }

  loadStats() {
    this.agentService.getStatusCounts().subscribe({
      next: (s) => this.statsData.set(s),
    });
  }

  getUsers() {
    this.adminUsersService.getUsers().subscribe({
      next: (users) => {
        this.users = users;
      },
      error: (error) => {
        console.warn('Error al cargar usuarios:', error);
      },
    });
  }

  getUserName(userId?: string): string {
    if (!userId) {
      return 'No disponible';
    }

    const user = this.users.find((u) => u._id === userId);
    return user ? user.name : 'Usuario no encontrado';
  }

  getInvoices() {
    this.loading = true;
    this.agentService.getInvoices(this.filters(), 'fechaEmision', 'desc', this.page(), this.limit()).subscribe({
      next: (res) => {
        this.result.set(res);
        this.invoices = this.formatResponse(res.data || []);
        this.calculateProjectsWithInvoiceCount();
        this.userInvoices = this.invoices;
        this.loading = false;
      },
      error: (error) => {
        this.invoices = [];
        this.loading = false;
        this.notificationService.show('Error al cargar las facturas: ' + error.message, 'error');
      },
    });
  }

  onPageChange(p: number) { this.page.set(p); this.getInvoices(); }
  onLimitChange(l: number) { this.limit.set(l); this.page.set(1); this.getInvoices(); }

  formatResponse(res: IInvoiceResponse[]) {
    if (!res || !Array.isArray(res)) {
      return [];
    }

    return res.map((invoice, index) => {
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

      const categoryName = invoice.categoryId?.name || 'No disponible';

      const projectName = invoice.proyectId?.name || 'No disponible';
      const razonSocial = invoiceData.razonSocial || 'No disponible';
      const direccionEmisor = invoiceData.direccionEmisor || 'No disponible';
      const rucEmisor = invoiceData.rucEmisor || 'No disponible';
      const tipoComprobante = invoiceData.tipoComprobante || 'No disponible';
      const fechaEmision = invoiceData.fechaEmision || 'No disponible';
      const moneda = invoiceData.moneda || '';
      const montoTotal = invoiceData.montoTotal || invoice.total || 0;
      const serie = invoiceData.serie || 'No disponible';
      const correlativo = invoiceData.correlativo || 'No disponible';

      const formattedTotal = moneda
        ? `${moneda} ${montoTotal}`
        : montoTotal.toString();

      const processedInvoice = {
        _id: invoice._id,
        proyect: projectName,
        proyectId: invoice.proyectId,
        category: categoryName,
        categoryKey: invoice.category,
        file: invoice.file,
        data: invoice.data,
        createdAt: invoice.createdAt
          ? new Date(invoice.createdAt).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          : 'No disponible',
        updatedAt: invoice.updatedAt,
        total: formattedTotal,

        status: invoice.status || 'pending',
        statusDate: invoice.statusDate,
        approvedBy: invoice.approvedBy,
        rejectedBy: invoice.rejectedBy,
        rejectionReason: invoice.rejectionReason,

        ruc: rucEmisor,
        rucEmisor: rucEmisor,
        tipo: tipoComprobante,
        tipoComprobante: tipoComprobante,
        address: direccionEmisor,
        direccionEmisor: direccionEmisor,
        provider: razonSocial,
        razonSocial: razonSocial,
        date: fechaEmision,
        fechaEmision: fechaEmision,
        moneda: moneda,
        montoTotal: montoTotal,
        serie: serie,
        correlativo: correlativo,
        uploadedBy: this.getUserName(invoice.createdBy),
      };

      return processedInvoice;
    });
  }

  capitalizeFirstLetter(text: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  editInvoice(id: string) {
    this.router.navigate(['/invoices/edit', id]);
  }

  gotToAddInvoice() {
    this.router.navigate(['/invoices/add']);
  }

  clickOptions(event: { option: string; _id: string }) {
    const { option, _id } = event;
    switch (option) {
      case 'download':
        this.downloadInvoice(_id);
        break;
      case 'approve':
        this.confirmApproveInvoice(_id);
        break;
      case 'reject':
        this.openRejectionModal(_id);
        break;
    }
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

  downloadInvoice(id: string) {
    const url = this.invoices.find((invoice) => invoice._id === id)?.file;
    if (url) {
      window.open(url, '_blank');
    } else {
      this.notificationService.show('No se pudo descargar la factura', 'error');
    }
  }

  confirmApproveInvoice(id: string) {
    this.confirmationService.confirm({
      title: 'Confirmar aprobación',
      message: '¿Está seguro que desea aprobar esta factura?',
      accept: () => {
        this.approveInvoice(id);
      },
    });
  }

  approveInvoice(id: string) {
    const payload: ApprovalPayload = {
      status: 'approved',
    };

    this.agentService.approveInvoice(id, payload).subscribe({
      next: () => {
        this.notificationService.show(
          'Factura aprobada correctamente',
          'success'
        );
        this.loadStats();
        this.getInvoices();
      },
      error: (error) => {
        this.notificationService.show(
          'Error al aprobar la factura: ' + error.message,
          'error'
        );
      },
    });
  }

  openRejectionModal(id: string) {
    this.selectedInvoiceId.set(id);
    this.rejectionReason.set('');
    this.showRejectionModal.set(true);
  }

  closeRejectionModal() {
    this.showRejectionModal.set(false);
  }

  submitRejection() {
    if (!this.rejectionReason()) {
      this.notificationService.show(
        'Debe ingresar un motivo de rechazo',
        'error'
      );
      return;
    }

    const id = this.selectedInvoiceId();
    const payload: ApprovalPayload = {
      status: 'rejected',
      reason: this.rejectionReason(),
    };

    this.agentService.rejectInvoice(id, payload).subscribe({
      next: () => {
        this.notificationService.show(
          'Factura rechazada correctamente',
          'success'
        );
        this.closeRejectionModal();
        this.loadStats();
        this.getInvoices();
      },
      error: (error) => {
        this.notificationService.show(
          'Error al rechazar la factura: ' + error.message,
          'error'
        );
      },
    });
  }

  get filteredInvoices() {
    return this.invoices;
  }

  get approvedCount(): number { return this.statsData().approved; }
  get rejectedCount(): number { return this.statsData().rejected; }
  get pendingCount(): number { return this.statsData().pending; }

  getCategories() {
    return this.agentService.getCategories().pipe(
      tap({
        next: (categories) => {
          this.categories = categories;
        },
        error: (error) => {
          this.notificationService.show(
            'Error al cargar las categorías: ' + error.message,
            'error'
          );
        },
      })
    );
  }

  getProjects() {
    this.agentService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
        this.calculateProjectsWithInvoiceCount();
      },
      error: (error) => {
        this.notificationService.show(
          'Error al cargar los proyectos: ' + error.message,
          'error'
        );
      },
    });
  }

  calculateProjectsWithInvoiceCount() {
    const projectCountMap = new Map<
      string,
      { id: string; name: string; count: number }
    >();

    this.projects.forEach((project) => {
      if (project?._id && project?.name) {
        projectCountMap.set(project._id, {
          id: project._id,
          name: project.name,
          count: 0,
        });
      }
    });

    this.invoices.forEach((invoice) => {
      let projectId = '';
      const pId = invoice.proyectId as any;
      if (pId && typeof pId === 'object' && '_id' in pId) {
        projectId = pId._id || '';
      } else {
        projectId = pId || '';
      }
      const projectName = invoice.proyect;

      if (projectId) {
        if (projectCountMap.has(projectId)) {
          const projectData = projectCountMap.get(projectId)!;
          projectData.count += 1;
          projectCountMap.set(projectId, projectData);
        } else {
          projectCountMap.set(projectId, {
            id: projectId,
            name: projectName,
            count: 1,
          });
        }
      }
    });

    this.projectsWithInvoiceCount = Array.from(projectCountMap.values());
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
        return 'Válida, Externa';
      case 'sunat_not_found':
      case 'NO_ENCONTRADO':
        return 'No Encontrado SUNAT';
      case 'sunat_error':
      case 'ERROR_SUNAT':
        return 'Rechazada';
      default:
        return 'Desconocido';
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
        return 'Factura válida pero no ha sido emitida a la empresa';
      case 'sunat_error':
      case 'ERROR_SUNAT':
        return 'Error en el servicio de sunat';
      default:
        return '';
    }
  }

  exportInvoices(fileType: 'excel' | 'pdf'): void {
    this.exportFileType = fileType;
    setTimeout(() => {
      const exportComponent = document.getElementById(
        'export-consolidated-invoices'
      );
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

  formatDateForInputDisplay(dateString: string): string {
    if (!dateString) return '';

    const [year, month, day] = dateString.split('-').map(Number);
    return `${String(day).padStart(2, '0')}/${String(month).padStart(
      2,
      '0'
    )}/${year}`;
  }

  openDatePicker(field: 'dateFrom' | 'dateTo') {
    const pickerId =
      field === 'dateFrom'
        ? 'consolidated-dateFromPicker'
        : 'consolidated-dateToPicker';
    const picker = document.getElementById(pickerId) as HTMLInputElement;

    if (picker) {
      if (!picker.value) {
        const currentValue =
          field === 'dateFrom' ? this.filterDateFrom() : this.filterDateTo();
        picker.value = currentValue || new Date().toISOString().split('T')[0];
      }

      if (picker.showPicker && typeof picker.showPicker === 'function') {
        try {
          picker.showPicker();
        } catch (error) {
          picker.click();
        }
      } else {
        picker.click();
      }
    }
  }

  onDatePickerChange(event: any, field: 'dateFrom' | 'dateTo') {
    const value = event.target.value;

    if (value) {
      if (field === 'dateFrom') {
        this.filterDateFrom.set(value);
      } else {
        this.filterDateTo.set(value);
      }

      this.page.set(1);
      this.getInvoices();
    }
  }

  getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  clearFilters() {
    this.filterProject.set('');
    this.filterCategory.set('');
    this.filterStatus.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.filterAmountMin.set('');
    this.filterAmountMax.set('');
    this.page.set(1);
    this.getInvoices();
  }
}
