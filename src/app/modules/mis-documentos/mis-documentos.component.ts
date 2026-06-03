import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ExpenseReportsService } from '../../services/expense-reports.service';
import { NotificationService } from '../../services/notification.service';
import { IMisDocumentoItem } from '../../interfaces/expense-report.interface';

@Component({
  selector: 'app-mis-documentos',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './mis-documentos.component.html',
})
export class MisDocumentosComponent implements OnInit {
  private expenseReportsService = inject(ExpenseReportsService);
  private notificationService = inject(NotificationService);

  isLoading = signal(true);
  items = signal<IMisDocumentoItem[]>([]);

  filterDateFrom = signal('');
  filterDateTo = signal('');
  filterKind = signal('');

  filteredItems = computed(() => {
    let result = this.items();
    const from = this.filterDateFrom();
    const to = this.filterDateTo();
    const kind = this.filterKind();

    if (kind) {
      result = result.filter(d => d.kind === kind);
    }
    if (from) {
      const fromTs = new Date(from).getTime();
      result = result.filter(d => d.date && new Date(d.date).getTime() >= fromTs);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter(d => d.date && new Date(d.date).getTime() <= toDate.getTime());
    }
    return result;
  });

  get hasActiveFilters(): boolean {
    return !!(this.filterDateFrom() || this.filterDateTo() || this.filterKind());
  }

  clearFilters(): void {
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.filterKind.set('');
  }

  ngOnInit(): void {
    this.expenseReportsService.findMyDocuments().subscribe({
      next: res => {
        this.items.set(res.items ?? []);
        this.isLoading.set(false);
      },
      error: () => {
        this.notificationService.show('No se pudieron cargar tus documentos.', 'error');
        this.isLoading.set(false);
      },
    });
  }

  kindLabel(kind: IMisDocumentoItem['kind']): string {
    return kind === 'reembolso_rendicion' ? 'Reembolso de rendición' : 'Pago de viáticos';
  }

  formatDate(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
