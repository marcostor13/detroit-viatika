import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { InvoicesService } from '../services/invoices.service';
import { IInvoiceResponse } from '../interfaces/invoices.interface';
import { ButtonComponent } from '../../../design-system/button/button.component';
import { UserStateService } from '../../../services/user-state.service';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, ButtonComponent],
  templateUrl: './invoice-detail.component.html',
  styleUrls: ['./invoice-detail.component.scss']
})
export class InvoiceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private invoicesService = inject(InvoicesService);
  private userStateService = inject(UserStateService);

  id: string = this.route.snapshot.params['id'];
  invoice: IInvoiceResponse | null = null;
  invoiceData: any = {};
  isLoading = true;

  ngOnInit(): void {
    if (this.id) {
      this.loadInvoice();
    }
  }

  loadInvoice() {
    this.isLoading = true;
    this.invoicesService.getInvoiceById(this.id).subscribe({
      next: (res) => {
        this.invoice = res;
        this.parseInvoiceData(res.data);
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading invoice', err);
        this.isLoading = false;
      }
    });
  }

  parseInvoiceData(data: any) {
    if (!data) return;
    if (typeof data === 'string') {
      try {
        this.invoiceData = JSON.parse(data);
      } catch (e) {
        this.invoiceData = {};
      }
    } else {
      this.invoiceData = data;
    }
  }

  goBack() {
    this.router.navigate(['/invoices']);
  }

  downloadFile() {
    if (this.invoice?.file) {
      window.open(this.invoice.file, '_blank');
    }
  }

  getStatusName(status?: string): string {
    if (!status) return 'Pendiente';
    const states: any = {
      'pending': 'Pendiente',
      'approved': 'Aprobada',
      'rejected': 'Rechazada',
      'sunat_valid': 'Válida',
      'valido_aceptado': 'Válida',
      'sunat_valid_not_ours': 'No pertenece a la empresa',
      'valido_no_pertenece': 'No pertenece a la empresa',
      'sunat_not_found': 'No Encontrada',
      'no_encontrado': 'No Encontrada',
      'sunat_error': 'Error SUNAT',
      'error_sunat': 'Error SUNAT',
    };
    return states[status.toLowerCase()] || status;
  }
}
