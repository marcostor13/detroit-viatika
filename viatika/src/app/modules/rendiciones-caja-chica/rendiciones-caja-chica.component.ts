import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CajaChicaReportService } from '../../services/caja-chica-report.service';
import { NotificationService } from '../../services/notification.service';
import { ICajaChicaReport } from '../../interfaces/caja-chica-report.interface';

@Component({
  selector: 'app-rendiciones-caja-chica',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rendiciones-caja-chica.component.html',
})
export class RendicionesCajaChicaComponent implements OnInit {
  private service = inject(CajaChicaReportService);
  private notifications = inject(NotificationService);
  private router = inject(Router);

  reports = signal<ICajaChicaReport[]>([]);
  loading = signal(false);
  showCreateModal = signal(false);
  creating = signal(false);
  newTitle = '';

  searchFilter = signal('');
  filterStatus = signal('');

  // ─── Filas expandibles (detalle inline para no cortar columnas) ─────────────
  expandedRows = signal<Set<string>>(new Set<string>());
  toggleExpand(id: string, event?: Event): void {
    event?.stopPropagation();
    const set = new Set<string>(this.expandedRows());
    set.has(id) ? set.delete(id) : set.add(id);
    this.expandedRows.set(set);
  }
  isExpanded(id: string): boolean { return this.expandedRows().has(id); }

  filteredReports = computed(() => {
    const s = this.searchFilter().toLowerCase().trim();
    const status = this.filterStatus();
    return this.reports().filter(r => {
      const matchSearch = !s || r.title.toLowerCase().includes(s) || (r.codigo ?? '').toLowerCase().includes(s);
      const matchStatus = !status || r.status === status;
      return matchSearch && matchStatus;
    });
  });

  ngOnInit(): void {
    const removedId: string | undefined = (window.history.state as any)?.['removedId'];
    this.loadReports(removedId);
  }

  loadReports(excludeId?: string): void {
    this.loading.set(true);
    this.service.findAll().subscribe({
      next: (data) => {
        const filtered = excludeId ? data.filter(r => r._id !== excludeId) : data;
        this.reports.set(filtered);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
  }

  openCreate(): void {
    this.newTitle = '';
    this.showCreateModal.set(true);
  }

  create(): void {
    const title = this.newTitle.trim();
    if (!title || title.length < 3) {
      this.notifications.show('El titulo debe tener al menos 3 caracteres.', 'error');
      return;
    }
    this.creating.set(true);
    this.service.create({ title }).subscribe({
      next: (report) => {
        this.creating.set(false);
        this.showCreateModal.set(false);
        this.router.navigate(['/rendiciones-caja-chica', report._id]);
      },
      error: (err) => {
        this.creating.set(false);
        const msg = err?.error?.message ?? 'Error al crear el reporte.';
        this.notifications.show(Array.isArray(msg) ? msg.join(', ') : msg, 'error');
      },
    });
  }

  viewDetail(id: string): void {
    this.router.navigate(['/rendiciones-caja-chica', id]);
  }

  statusLabel(status: string): string {
    return status === 'finalized' ? 'Finalizado' : 'Borrador';
  }

  statusClasses(status: string): string {
    return status === 'finalized'
      ? 'bg-green-100 text-green-700'
      : 'bg-yellow-100 text-yellow-700';
  }
}
