import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SaldoService } from '../../services/saldo.service';
import { ISaldo, SaldoType } from '../../interfaces/saldo.interface';

@Component({
  selector: 'app-saldo',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './saldo.component.html',
})
export class SaldoComponent implements OnInit {
  private saldoService = inject(SaldoService);

  saldos = signal<ISaldo[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  total = computed(() =>
    this.saldos().reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.saldoService.getMine().subscribe({
      next: rows => {
        this.saldos.set(rows ?? []);
        this.loading.set(false);
        this.saldoService.refreshTotal();
      },
      error: () => {
        this.error.set('No se pudieron cargar tus saldos.');
        this.loading.set(false);
      },
    });
  }

  typeLabel(type: SaldoType): string {
    switch (type) {
      case 'pago':
        return 'Pago';
      case 'rendicion_directa':
        return 'Rendición directa';
      case 'rendicion':
        return 'Rendición';
      default:
        return type;
    }
  }

  typeBadgeClass(type: SaldoType): string {
    switch (type) {
      case 'pago':
        return 'bg-sky-100 text-sky-700';
      case 'rendicion_directa':
        return 'bg-amber-100 text-amber-700';
      case 'rendicion':
        return 'bg-violet-100 text-violet-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  }

  centroCosto(s: ISaldo): string {
    const p = s.projectId;
    if (!p || typeof p === 'string') return '';
    const code = p.code ? `${p.code} - ` : '';
    return `${code}${p.name ?? ''}`.trim();
  }

  origen(s: ISaldo): string {
    const partes: string[] = [];
    // Gestión / motivo libre tiene prioridad como descripción.
    if (s.concepto?.trim()) partes.push(s.concepto.trim());
    const r = s.sourceReportId;
    if (r && typeof r !== 'string') {
      const ref = r.codigo || r.title || '';
      if (ref) partes.push(ref);
    } else if (s.type === 'pago') {
      partes.push(
        s.deposit?.operationNumber
          ? `Op. ${s.deposit.operationNumber}`
          : 'Pago de contabilidad'
      );
    }
    return partes.join(' · ');
  }
}
