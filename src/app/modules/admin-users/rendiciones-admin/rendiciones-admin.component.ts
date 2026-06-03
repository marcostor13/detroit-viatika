import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { ExpenseReportsService } from '../../../services/expense-reports.service';
import { AdminUsersService } from '../services/admin-users.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { UserStateService } from '../../../services/user-state.service';
import { IExpenseReport } from '../../../interfaces/expense-report.interface';
import { IUserResponse } from '../../../interfaces/user.interface';
import { IProject } from '../../invoices/interfaces/project.interface';

const STATUS_LABELS: Record<string, string> = {
  solicited: 'Solicitada',
  open: 'Abierta',
  submitted: 'Enviada',
  pending_accounting: 'Pendiente contabilidad',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  reimbursed: 'Reembolsado',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  solicited: 'bg-purple-100 text-purple-800',
  open: 'bg-blue-100 text-blue-800',
  submitted: 'bg-yellow-100 text-yellow-800',
  pending_accounting: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  reimbursed: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-gray-100 text-gray-500',
};

@Component({
  selector: 'app-rendiciones-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './rendiciones-admin.component.html',
})
export class RendicionesAdminComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private expenseReportsService = inject(ExpenseReportsService);
  private adminUsersService = inject(AdminUsersService);
  private invoicesService = inject(InvoicesService);
  private userStateService = inject(UserStateService);

  allReports: IExpenseReport[] = [];
  filteredReports: IExpenseReport[] = [];
  users: IUserResponse[] = [];
  projects: IProject[] = [];

  isLoading = true;

  filterUserId = '';
  filterProjectId = '';
  filterDateFrom = '';
  filterDateTo = '';

  readonly STATUS_LABELS = STATUS_LABELS;
  readonly STATUS_COLORS = STATUS_COLORS;

  ngOnInit(): void {
    const preselectedUser = this.route.snapshot.queryParamMap.get('userId');
    if (preselectedUser) this.filterUserId = preselectedUser;
    this.loadData();
  }

  private loadData(): void {
    const currentUser = this.userStateService.getUser() as any;
    const clientId = currentUser?.companyId || currentUser?.clientId;
    if (!clientId) { this.isLoading = false; return; }

    this.expenseReportsService.findAllByClient(clientId).subscribe({
      next: (reports) => {
        this.allReports = reports.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        this.applyFilters();
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; },
    });

    this.adminUsersService.getUsers().subscribe({
      next: (users) => { this.users = users; },
      error: () => {},
    });

    this.invoicesService.getProjects(clientId).subscribe({
      next: (projects) => { this.projects = projects; },
      error: () => {},
    });
  }

  applyFilters(): void {
    let result = this.allReports;

    if (this.filterUserId) {
      result = result.filter(r => {
        const uid = typeof r.userId === 'object' ? r.userId?._id : r.userId;
        return uid === this.filterUserId;
      });
    }

    if (this.filterProjectId) {
      result = result.filter(r => {
        const pid = typeof r.projectId === 'object' ? r.projectId?._id : r.projectId;
        return pid === this.filterProjectId;
      });
    }

    if (this.filterDateFrom) {
      const from = new Date(this.filterDateFrom).getTime();
      result = result.filter(r => new Date(r.createdAt).getTime() >= from);
    }

    if (this.filterDateTo) {
      const to = new Date(this.filterDateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(r => new Date(r.createdAt).getTime() <= to.getTime());
    }

    this.filteredReports = result;
  }

  clearFilters(): void {
    this.filterUserId = '';
    this.filterProjectId = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.applyFilters();
  }

  get hasActiveFilters(): boolean {
    return !!(this.filterUserId || this.filterProjectId || this.filterDateFrom || this.filterDateTo);
  }

  getUserName(report: IExpenseReport): string {
    if (typeof report.userId === 'object' && report.userId?.name) {
      return report.userId.name;
    }
    const user = this.users.find(u => u._id === report.userId);
    return user?.name ?? '—';
  }

  getProjectName(report: IExpenseReport): string {
    if (!report.projectId) return '—';
    if (typeof report.projectId === 'object' && report.projectId?.name) {
      return report.projectId.name;
    }
    const project = this.projects.find(p => p._id === report.projectId);
    return project?.name ?? '—';
  }

  getUserId(report: IExpenseReport): string {
    return typeof report.userId === 'object' ? report.userId?._id : report.userId;
  }

  getUserInitials(report: IExpenseReport): string {
    const name = this.getUserName(report);
    if (!name || name === '—') return '?';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }

  goToDetail(report: IExpenseReport): void {
    this.router.navigate(['/mis-rendiciones', report._id, 'detalle']);
  }

  goToUserDetail(report: IExpenseReport): void {
    const uid = this.getUserId(report);
    if (uid) this.router.navigate(['/admin-users', uid, 'details']);
  }
}
