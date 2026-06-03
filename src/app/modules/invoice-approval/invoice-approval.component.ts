import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FileDownloadComponent } from '../../components/file-download/file-download.component';
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
import { UserStateService } from '../../services/user-state.service';
import { DataComponent } from '../../components/data/data.component';
import { AdminUsersService } from '../admin-users/services/admin-users.service';
import { IUserResponse } from '../../interfaces/user.interface';
import { ButtonComponent } from '../../design-system/button/button.component';
import { ExportButtonComponent } from '../../design-system/export-button/export-button.component';
import { PaginatorComponent } from '../../design-system/paginator/paginator.component';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { IExpenseReport } from '../../interfaces/expense-report.interface';
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
  selector: 'app-invoice-approval',
  standalone: true,
  imports: [CommonModule, FormsModule, DataComponent, FileDownloadComponent, ButtonComponent, ExportButtonComponent, PaginatorComponent],
  templateUrl: './invoice-approval.component.html',
  styleUrl: './invoice-approval.component.scss',
})
export class InvoiceApprovalComponent implements OnInit {
  private agentService = inject(InvoicesService);
  readonly router = inject(Router);
  private notificationService = inject(NotificationService);
  private confirmationService = inject(ConfirmationService);
  private userStateService = inject(UserStateService);
  private adminUsersService = inject(AdminUsersService);
  private expenseReportsService = inject(ExpenseReportsService);

  // Tabs
  activeTab = signal<'facturas' | 'rendiciones'>('rendiciones');

  // Rendiciones pendientes
  submittedReports = signal<IExpenseReport[]>([]);
  loadingReports = signal(false);
  showRejectReportModal = signal(false);
  selectedReportId = signal('');
  reportRejectionReason = signal('');

  rejectionReason = signal('');
  selectedInvoiceId = signal('');
  showRejectionModal = signal(false);
  showFilters = signal(false); // Oculto por defecto
  categories: ICategory[] = [];
  projects: IProject[] = [];
  invoices: IInvoice[] = [];
  users: IUserResponse[] = [];
  loading = false;
  result = signal<IPaginatedResult<IInvoiceResponse>>({ data: [], total: 0, page: 1, pages: 0, limit: 20 });
  page = signal(1);
  limit = signal(20);
  statsData = signal({ pending: 0, approved: 0, rejected: 0, total: 0 });

  headers: IHeaderList[] = [
    {
      header: 'Fecha',
      value: 'date',
    },
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
  filterStatus = signal(''); // Por defecto mostrar todas las facturas

  exportFileType: 'excel' | 'pdf' = 'excel';
  exportColumns = [
    { header: 'Fecha', field: 'date' },
    { header: 'Proyecto', field: 'proyect' },
    { header: 'Categoría', field: 'category' },
    { header: 'Razón Social', field: 'provider' },
    { header: 'RUC', field: 'ruc' },
    { header: 'Serie', field: 'serie' },
    { header: 'Correlativo', field: 'correlativo' },
    { header: 'Total', field: 'total' },
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

  stats = computed(() => this.statsData());

  ngOnInit() {
    this.loadData();
    this.loadSubmittedReports();
  }

  loadData() {
    this.getProjects();
    this.getCategories();
    this.getUsers();
    this.loadStats();
    this.getInvoices();
  }

  loadStats() {
    this.agentService.getStatusCounts().subscribe({
      next: (s) => this.statsData.set(s),
    });
  }

  loadSubmittedReports() {
    const user = this.userStateService.getUser();
    const clientId = user?.companyId || (user as any)?.client?._id || (user as any)?.clientId;
    if (!clientId) return;
    this.loadingReports.set(true);
    this.expenseReportsService.findAllByClient(clientId).subscribe({
      next: (reports) => {
        this.submittedReports.set(reports.filter(r => r.status === 'submitted' || r.status === 'solicited'));
        this.loadingReports.set(false);
      },
      error: () => this.loadingReports.set(false),
    });
  }

  approveReport(report: IExpenseReport) {
    const isSolicitud = report.status === 'solicited';
    const title = isSolicitud ? 'Aprobar solicitud' : 'Aprobar rendición';
    const message = isSolicitud
      ? '¿Confirma la aprobación de esta solicitud? El colaborador podrá agregar sus gastos.'
      : '¿Confirma la aprobación de esta rendición?';
    const newStatus = isSolicitud ? 'open' : 'approved';
    this.confirmationService.confirm({
      title,
      message,
      accept: () => {
        this.expenseReportsService.update(report._id, { status: newStatus }).subscribe({
          next: () => {
            this.notificationService.show(
              isSolicitud ? 'Solicitud aprobada. El colaborador ya puede agregar sus gastos.' : 'Rendición aprobada correctamente',
              'success',
            );
            this.loadSubmittedReports();
          },
          error: () => this.notificationService.show('Error al aprobar', 'error'),
        });
      },
    });
  }

  openRejectReportModal(id: string) {
    this.selectedReportId.set(id);
    this.reportRejectionReason.set('');
    this.showRejectReportModal.set(true);
  }

  closeRejectReportModal() {
    this.showRejectReportModal.set(false);
  }

  submitReportRejection() {
    if (!this.reportRejectionReason()) {
      this.notificationService.show('Debe ingresar un motivo de rechazo', 'error');
      return;
    }
    this.expenseReportsService
      .update(this.selectedReportId(), {
        status: 'rejected',
        rejectionReason: this.reportRejectionReason().trim(),
      })
      .subscribe({
      next: () => {
        this.notificationService.show('Rendición rechazada', 'success');
        this.closeRejectReportModal();
        this.loadSubmittedReports();
      },
      error: (err) => {
        const raw = err?.error?.message;
        const msg = Array.isArray(raw) ? raw.join(', ') : raw;
        this.notificationService.show(
          msg || 'Error al rechazar la rendición',
          'error'
        );
      },
    });
  }

  getReportTotalGastado(report: IExpenseReport): number {
    if (!report.expenseIds?.length) return 0;
    return report.expenseIds.reduce((sum: number, exp: any) => sum + (exp.total || 0), 0);
  }

  getReportExpenseCount(report: IExpenseReport): number {
    return report.expenseIds?.length || 0;
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

  getInvoices() {
    this.loading = true;
    this.agentService.getInvoices(this.filters(), 'fechaEmision', 'desc', this.page(), this.limit()).subscribe({
      next: (res) => {
        this.result.set(res);
        this.invoices = this.formatResponse(res.data || []);
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

  getUserName(userId?: string): string {
    if (!userId) {
      return 'No disponible';
    }

    const user = this.users.find((u) => u._id === userId);
    return user ? user.name : 'Usuario no encontrado';
  }

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
            } catch (parseError) { }
          } else if (typeof invoice.data === 'object') {
            invoiceData = invoice.data;
          }
        }
      } catch (error) { }

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

  downloadInvoice(id: string) {
    const url = this.invoices.find((invoice) => invoice._id === id)?.file;
    if (url) {
      window.open(url, '_blank');
    } else {
      this.notificationService.show('No se pudo descargar la factura', 'error');
    }
  }

  confirmApproveInvoice(id: string) {
    const invoice = this.invoices.find((inv) => inv._id === id);
    if (!invoice) {
      this.notificationService.show('Factura no encontrada', 'error');
      return;
    }

    if (invoice.status === 'approved' || invoice.status === 'APPROVED') {
      this.notificationService.show(
        'Esta factura ya ha sido aprobada',
        'error'
      );
      return;
    }

    if (invoice.status === 'rejected' || invoice.status === 'REJECTED') {
      this.notificationService.show(
        'Esta factura ya ha sido rechazada',
        'error'
      );
      return;
    }

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
    const invoice = this.invoices.find((inv) => inv._id === id);
    if (!invoice) {
      this.notificationService.show('Factura no encontrada', 'error');
      return;
    }

    if (invoice.status === 'approved' || invoice.status === 'APPROVED') {
      this.notificationService.show(
        'Esta factura ya ha sido aprobada',
        'error'
      );
      return;
    }

    if (invoice.status === 'rejected' || invoice.status === 'REJECTED') {
      this.notificationService.show(
        'Esta factura ya ha sido rechazada',
        'error'
      );
      return;
    }

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

  getCategories() {
    this.agentService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: (error) => {
        this.notificationService.show(
          'Error al cargar las categorías: ' + error.message,
          'error'
        );
      },
    });
  }

  getProjects() {
    this.agentService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
      },
      error: (error) => {
        this.notificationService.show(
          'Error al cargar los proyectos: ' + error.message,
          'error'
        );
      },
    });
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
        return status; // Mostrar el estado original si no coincide con ningún caso
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
        'export-invoice-approval'
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

  clearFilters() {
    this.filterProject.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.filterCategory.set('');
    this.filterAmountMin.set('');
    this.filterAmountMax.set('');
    this.filterStatus.set('');
    this.page.set(1);
    this.getInvoices();
  }

  toggleFilters() {
    this.showFilters.update(value => !value);
  }

  formatDateForInputDisplay(dateString: string): string {
    if (!dateString) return '';

    if (dateString.includes('-')) {
      const [year, month, day] = dateString.split('-').map(Number);
      return `${String(day).padStart(2, '0')}/${String(month).padStart(
        2,
        '0'
      )}/${year}`;
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  onDateInputChange(event: any, field: 'dateFrom' | 'dateTo') {
    const value = event.target.value;

    const dateRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
    const match = value.match(dateRegex);

    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3]);

      const date = new Date(year, month - 1, day);
      if (
        date.getDate() === day &&
        date.getMonth() === month - 1 &&
        date.getFullYear() === year
      ) {
        const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(
          day
        ).padStart(2, '0')}`;
        if (field === 'dateFrom') {
          this.filterDateFrom.set(isoDate);
        } else {
          this.filterDateTo.set(isoDate);
        }
        this.getInvoices();
      }
    }
  }

  onDateBlur(event: any, field: 'dateFrom' | 'dateTo') {
    const value = event.target.value;
    if (
      value &&
      (field === 'dateFrom' ? this.filterDateFrom() : this.filterDateTo())
    ) {
      event.target.value = this.formatDateForInputDisplay(
        field === 'dateFrom' ? this.filterDateFrom() : this.filterDateTo()
      );
    }
  }

  openDatePicker(field: 'dateFrom' | 'dateTo') {
    const pickerId = field === 'dateFrom' ? 'dateFromPicker' : 'dateToPicker';
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

  navigateToAddInvoice() {
    this.router.navigate(['/invoices/add']);
  }
}
