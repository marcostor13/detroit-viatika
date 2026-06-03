import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLogService, IAuditLog } from '../../services/audit-log.service';
import { PaginatorComponent } from '../../design-system/paginator/paginator.component';
import { IPaginatedResult } from '../../interfaces/paginated-result.interface';

const ACTION_LABELS: Record<string, string> = {
  login: 'Inicio de sesión',
  create_invoice: 'Subió factura',
  approve_invoice: 'Aprobó factura',
  reject_invoice: 'Rechazó factura',
  delete_invoice: 'Eliminó factura',
  create_mobility_sheet: 'Creó planilla de movilidad',
  create_other_expense: 'Registró otro gasto',
  create_rendicion: 'Creó rendición',
  delete_rendicion: 'Eliminó rendición',
  update_rendicion_status: 'Cambió estado rendición',
  register_reimbursement_payment: 'Registró pago de reembolso',
  approve_advance_l1: 'Aprobó viático (L1)',
  approve_advance_l2: 'Aprobó viático (L2)',
  reject_advance: 'Rechazó viático',
  resubmit_advance: 'Reenvió solicitud de viáticos corregida',
  pay_advance: 'Registró pago viático',
  create_user: 'Creó usuario',
  update_user: 'Actualizó usuario',
  update_permissions: 'Modificó permisos',
};

const MODULE_LABELS: Record<string, string> = {
  facturas: 'Facturas',
  invoices: 'Facturas',
  rendiciones: 'Rendiciones',
  tesoreria: 'Tesorería',
  usuarios: 'Usuarios',
};

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginatorComponent],
  templateUrl: './audit-log.component.html',
})
export class AuditLogComponent implements OnInit {
  private auditLogService = inject(AuditLogService);

  result = signal<IPaginatedResult<IAuditLog>>({ data: [], total: 0, page: 1, pages: 0, limit: 20 });
  get logs() { return this.result().data; }
  isLoading = signal(false);
  searchText = '';
  filterModule = '';
  page = signal(1);
  limit = signal(20);

  readonly modules = ['facturas', 'rendiciones', 'tesoreria', 'usuarios'];
  readonly MODULE_LABELS = MODULE_LABELS;

  ngOnInit() {
    this.loadLogs();
  }

  loadLogs() {
    this.isLoading.set(true);
    this.auditLogService.findAll({
      page: this.page(),
      limit: this.limit(),
      module: this.filterModule || undefined,
      search: this.searchText.trim() || undefined,
    }).subscribe({
      next: (res) => {
        this.result.set(res);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  applyFilters() { this.page.set(1); this.loadLogs(); }
  onPageChange(p: number) { this.page.set(p); this.loadLogs(); }
  onLimitChange(l: number) { this.limit.set(l); this.page.set(1); this.loadLogs(); }

  getActionLabel(action: string): string {
    return ACTION_LABELS[action] || action;
  }

  getModuleLabel(module: string): string {
    return MODULE_LABELS[module] || module;
  }

  getActionColor(action: string): string {
    if (action.startsWith('delete') || action.includes('reject')) return 'bg-red-100 text-red-700';
    if (action.startsWith('approve') || action.includes('settle') || action.includes('pay')) return 'bg-green-100 text-green-700';
    if (action.includes('update') || action.includes('change')) return 'bg-yellow-100 text-yellow-700';
    return 'bg-blue-100 text-blue-700';
  }
}
