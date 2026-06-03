import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { InvoicesService } from '../../modules/invoices/services/invoices.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { UploadService } from '../../services/upload.service';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { IProject } from '../../modules/invoices/interfaces/project.interface';
import { ICategory } from '../../modules/invoices/interfaces/category.interface';
import { InvoiceStatus } from '../../modules/invoices/interfaces/invoices.interface';

@Component({
  selector: 'app-admin-add-invoice',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, CommonModule],
  templateUrl: './admin-add-invoice.component.html',
  styleUrl: './admin-add-invoice.component.scss',
})
export default class AdminAddInvoiceComponent implements OnInit {
  private invoiceService = inject(InvoicesService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private notificationService = inject(NotificationService);
  private sanitizer = inject(DomSanitizer);
  private uploadService = inject(UploadService);

  form!: FormGroup;
  categories: ICategory[] = [];
  projects: IProject[] = [];
  previewImage: SafeUrl | null = null;
  selectedFile!: File;
  isMobile = signal(false);
  isPdfFile = signal(false);

  percentage = signal(0);
  isLoading = signal(false);

  constructor() {
    this.initForm();
    this.checkMobile();
  }

  ngOnInit() {
    this.loadCategories();
    this.loadProjects();
  }

  private checkMobile() {
    this.isMobile.set(window.innerWidth <= 768);
    window.addEventListener('resize', () => {
      this.isMobile.set(window.innerWidth <= 768);
    });
  }

  private formatDateForBackend(dateValue: string): string {
    if (!dateValue) return '';

    if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parts = dateValue.split('-');
      const year = parts[0];
      const month = parts[1];
      const day = parts[2];
      return `${day}-${month}-${year}`;
    }

    if (dateValue.match(/^\d{2}-\d{2}-\d{4}$/)) {
      return dateValue;
    }

    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      return dateValue;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${day}-${month}-${year}`;
  }

  loadCategories() {
    this.invoiceService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
      },
      error: (error) => {},
    });
  }

  loadProjects() {
    this.invoiceService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
      },
    });
  }

  initForm() {
    this.form = this.fb.group({
      projectId: ['', Validators.required],
      categoryId: ['', Validators.required],
      file: ['', Validators.required],
      fechaEmision: [''],
      rucEmisor: [''],
      serie: [''],
      correlativo: [''],
    });
  }

  back() {
    this.router.navigate(['/invoice-approval']);
  }

  createPdfPreview(file: File) {
    const pdfUrl = URL.createObjectURL(file);
    this.previewImage = this.sanitizer.bypassSecurityTrustUrl(pdfUrl);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.selectedFile = input.files[0];
      this.isPdfFile.set(this.selectedFile.type === 'application/pdf');

      if (this.selectedFile.type === 'application/pdf') {
        this.createPdfPreview(this.selectedFile);
      } else {
        this.previewImage = this.sanitizer.bypassSecurityTrustUrl(
          URL.createObjectURL(this.selectedFile)
        );
      }

      this.form.patchValue({ file: this.selectedFile });
    }
  }

  onCameraCapture(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.selectedFile = input.files[0];
      this.isPdfFile.set(this.selectedFile.type === 'application/pdf');

      if (this.selectedFile.type === 'application/pdf') {
        this.createPdfPreview(this.selectedFile);
      } else {
        this.previewImage = this.sanitizer.bypassSecurityTrustUrl(
          URL.createObjectURL(this.selectedFile)
        );
      }

      this.form.patchValue({ file: this.selectedFile });
    }
  }

  saveInvoice() {
    if (!this.selectedFile) {
      this.notificationService.show(
        'Debes seleccionar un archivo de factura',
        'error'
      );
      return;
    }

    this.isLoading.set(true);
    this.uploadFile();
  }

  uploadFile() {
    this.percentage.set(10);
    const { uploadProgress$, downloadUrl$ } = this.uploadService.uploadFile(
      this.selectedFile,
      environment.storagePath
    );

    uploadProgress$.subscribe((progress) => {
      if (progress === 0) {
        progress = 10;
      }
      this.percentage.set(Math.round(progress));
    });

    downloadUrl$.subscribe({
      next: (url) => {
        this.form.patchValue({ file: url });
        this.save();
      },
      error: (error) => {
        this.isLoading.set(false);
        this.notificationService.show(
          'Error al subir el archivo: ' + error.message,
          'error'
        );
      },
    });
  }

  save() {
    if (this.form.valid) {
      const payload = {
        categoryId: this.form.get('categoryId')?.value,
        proyectId: this.form.get('projectId')?.value,
        imageUrl: this.form.get('file')?.value,
        status: 'pending' as InvoiceStatus,
      };

      this.invoiceService.analyzeInvoice(payload).subscribe({
        next: (res) => {
          if (res && res._id) {
            let dataObj: any = {};
            if (res.data) {
              try {
                dataObj =
                  typeof res.data === 'string'
                    ? JSON.parse(res.data)
                    : res.data;
              } catch {}
            }

            if (dataObj.fechaEmision) {
              const updatePayload = {
                ...res,
                fechaEmision: this.formatDateForBackend(dataObj.fechaEmision),
                data: JSON.stringify(dataObj),
              };

              this.invoiceService
                .updateInvoice(res._id, updatePayload)
                .subscribe({
                  next: () => {
                    this.isLoading.set(false);
                    this.notificationService.show(
                      'Factura subida correctamente',
                      'success'
                    );
                    this.router.navigate(['/invoice-approval']);
                  },
                  error: (updateError) => {
                    this.isLoading.set(false);
                    this.notificationService.show(
                      'Factura subida correctamente',
                      'success'
                    );
                    this.router.navigate(['/invoice-approval']);
                  },
                });
            } else {
              this.isLoading.set(false);
              this.notificationService.show(
                'Factura subida correctamente',
                'success'
              );
              this.router.navigate(['/invoice-approval']);
            }
          } else {
            this.isLoading.set(false);
            this.notificationService.show(
              'Factura subida correctamente',
              'success'
            );
            this.router.navigate(['/invoice-approval']);
          }
        },
        error: (error) => {
          this.isLoading.set(false);
          const errorMessage =
            error.error?.message || error.message || 'Intente nuevamente';

          if (error.status === 409) {
            this.notificationService.show(errorMessage, 'error');
          } else {
            this.notificationService.show(
              'Error al analizar la factura: ' + errorMessage,
              'error'
            );
          }
        },
      });
    } else {
      this.isLoading.set(false);
      this.notificationService.show(
        'Por favor complete todos los campos requeridos',
        'error'
      );
    }
  }

  openInvoice() {
    if (this.previewImage && this.selectedFile) {
      try {
        const fileUrl = URL.createObjectURL(this.selectedFile);

        const link = document.createElement('a');
        link.href = fileUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
          URL.revokeObjectURL(fileUrl);
        }, 1000);
      } catch (error) {
        console.error('Error al abrir el archivo:', error);
        this.notificationService.show(
          'No se pudo abrir el archivo. Intenta descargarlo directamente.',
          'error'
        );
      }
    }
  }

  get categoryId() {
    return this.form.get('categoryId');
  }

  get projectId() {
    return this.form.get('projectId');
  }

  get imageUrl() {
    return this.form.get('file');
  }

  get serie() {
    return this.form.get('serie');
  }

  get correlativo() {
    return this.form.get('correlativo');
  }
}
