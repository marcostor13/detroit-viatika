import { Component, ElementRef, ViewChild, AfterViewInit, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { UserStateService } from '../../services/user-state.service';
import { NotificationService } from '../../services/notification.service';
import { UploadService } from '../../services/upload.service';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

type SignatureMode = 'draw' | 'upload';

@Component({
  selector: 'app-firma-digital',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './firma-digital.component.html',
  styleUrls: ['./firma-digital.component.scss']
})
export class FirmaDigitalComponent implements AfterViewInit, OnInit {
  @ViewChild('signatureCanvas', { static: false }) signatureCanvas!: ElementRef<HTMLCanvasElement>;

  private cx!: CanvasRenderingContext2D;
  private isDrawing = false;
  private lastPos = { x: 0, y: 0 };

  private userStateService = inject(UserStateService);
  private notificationService = inject(NotificationService);
  private uploadService = inject(UploadService);
  private http = inject(HttpClient);
  private router = inject(Router);

  isSaving = false;
  hasSignature = false;
  savedSignatureImage: string | null = null;
  uploadProgress = signal(0);

  mode = signal<SignatureMode>('draw');
  uploadedSignatureFile = signal<File | null>(null);
  uploadedSignaturePreview = signal<string | null>(null);
  uploadedFileName = signal<string | null>(null);
  isProcessingUpload = signal(false);

  readonly MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

  ngOnInit() {
    const user = this.userStateService.getUser() as any;
    if (user?.signature) {
      this.savedSignatureImage = user.signature;
      this.hasSignature = true;
    }
  }

  ngAfterViewInit(): void {
    if (this.signatureCanvas && this.mode() === 'draw') {
      this.initCanvas();
    }
  }

  setMode(mode: SignatureMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    if (mode === 'draw') {
      this.uploadedSignaturePreview.set(null);
      this.uploadedSignatureFile.set(null);
      this.uploadedFileName.set(null);
      this.hasSignature = false;
      setTimeout(() => this.initCanvas(), 0);
    } else {
      this.hasSignature = false;
    }
  }

  private initCanvas(): void {
    if (!this.signatureCanvas) return;
    const canvasEl: HTMLCanvasElement = this.signatureCanvas.nativeElement;
    this.cx = canvasEl.getContext('2d')!;
    this.cx.lineWidth = 3;
    this.cx.lineCap = 'round';
    this.cx.lineJoin = 'round';
    this.cx.strokeStyle = '#000000';
    this.cx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  }

  private getCanvasPos(evt: MouseEvent | TouchEvent) {
    const rect = this.signatureCanvas.nativeElement.getBoundingClientRect();
    let clientX, clientY;
    if (evt instanceof MouseEvent) {
      clientX = evt.clientX;
      clientY = evt.clientY;
    } else {
      clientX = evt.touches[0].clientX;
      clientY = evt.touches[0].clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  onPointerDown(e: MouseEvent | TouchEvent): void {
    e.preventDefault();
    this.isDrawing = true;
    const pos = this.getCanvasPos(e);
    this.lastPos = pos;
    this.cx.beginPath();
    this.cx.arc(pos.x, pos.y, this.cx.lineWidth / 2, 0, Math.PI * 2);
    this.cx.fill();
    this.cx.beginPath();
    this.cx.moveTo(pos.x, pos.y);
    this.hasSignature = true;
  }

  onPointerMove(e: MouseEvent | TouchEvent): void {
    if (!this.isDrawing) return;
    e.preventDefault();
    const currentPos = this.getCanvasPos(e);
    this.cx.beginPath();
    this.cx.moveTo(this.lastPos.x, this.lastPos.y);
    this.cx.lineTo(currentPos.x, currentPos.y);
    this.cx.stroke();
    this.lastPos = currentPos;
  }

  onPointerUp(): void {
    this.isDrawing = false;
  }

  clearSignature(): void {
    const canvasEl = this.signatureCanvas.nativeElement;
    this.cx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    this.hasSignature = false;
  }

  deleteSavedSignature(): void {
    if (confirm('¿Estás seguro de eliminar tu firma configurada?')) {
      this.clearSavedSignature();
    }
  }

  startNewSignature(): void {
    this.savedSignatureImage = null;
    this.hasSignature = false;
    this.uploadedSignaturePreview.set(null);
    this.uploadedSignatureFile.set(null);
    this.uploadedFileName.set(null);
    this.mode.set('draw');
    setTimeout(() => this.initCanvas(), 0);
  }

  onSignatureFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      this.notificationService.show('Formato no soportado. Usa PNG, JPG o WEBP.', 'warning');
      input.value = '';
      return;
    }
    if (file.size > this.MAX_UPLOAD_BYTES) {
      this.notificationService.show('La imagen supera el tamaño máximo permitido (5 MB).', 'warning');
      input.value = '';
      return;
    }

    this.isProcessingUpload.set(true);
    this.uploadedFileName.set(file.name);
    this.uploadedSignatureFile.set(file);

    const reader = new FileReader();
    reader.onload = () => {
      this.uploadedSignaturePreview.set(reader.result as string);
      this.hasSignature = true;
      this.isProcessingUpload.set(false);
    };
    reader.onerror = () => {
      this.isProcessingUpload.set(false);
      this.uploadedFileName.set(null);
      this.uploadedSignatureFile.set(null);
      this.notificationService.show('No se pudo leer el archivo.', 'error');
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  clearUploadedSignature(): void {
    this.uploadedSignaturePreview.set(null);
    this.uploadedSignatureFile.set(null);
    this.uploadedFileName.set(null);
    this.hasSignature = false;
  }

  private canvasToFile(): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = this.signatureCanvas.nativeElement;
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('No se pudo capturar la firma'));
          return;
        }
        const user = this.userStateService.getUser() as any;
        const userId = user?._id ?? 'user';
        resolve(new File([blob], `firma-${userId}-${Date.now()}.png`, { type: 'image/png' }));
      }, 'image/png');
    });
  }

  saveSignature(): void {
    if (this.savedSignatureImage) return;

    if (this.mode() === 'upload') {
      const file = this.uploadedSignatureFile();
      if (!file) {
        this.notificationService.show('Selecciona una imagen de firma antes de guardar.', 'warning');
        return;
      }
      this.uploadAndPersist(file);
      return;
    }

    if (!this.hasSignature) {
      this.notificationService.show('Por favor, dibuja tu firma antes de guardar.', 'warning');
      return;
    }
    this.canvasToFile()
      .then(file => this.uploadAndPersist(file))
      .catch(() => this.notificationService.show('No se pudo procesar la firma dibujada.', 'error'));
  }

  private uploadAndPersist(file: File): void {
    const user = this.userStateService.getUser() as any;
    const path = `signatures/${user?._id ?? 'user'}`;
    this.isSaving = true;
    this.uploadProgress.set(0);

    const { uploadProgress$, downloadUrl$ } = this.uploadService.uploadFile(file, path);
    uploadProgress$.subscribe(p => this.uploadProgress.set(p));
    downloadUrl$.subscribe({
      next: (url) => this.persistSignature(url),
      error: () => {
        this.isSaving = false;
        this.uploadProgress.set(0);
        this.notificationService.show('No se pudo subir la imagen de firma.', 'error');
      },
    });
  }

  private clearSavedSignature(): void {
    this.isSaving = true;
    this.http.patch(`${environment.api}/user/profile/signature`, { signature: '' }).subscribe({
      next: () => {
        this.notificationService.show('Firma eliminada exitosamente', 'success');
        this.isSaving = false;
        const currentUser = this.userStateService.getUser() as any;
        if (currentUser) {
          this.userStateService.setUser({ ...currentUser, signature: '' });
        }
        this.startNewSignature();
      },
      error: (e) => {
        this.isSaving = false;
        this.notificationService.show('Error al eliminar la firma', 'error');
        console.error(e);
      },
    });
  }

  private persistSignature(signatureUrl: string): void {
    this.http.patch(`${environment.api}/user/profile/signature`, { signature: signatureUrl }).subscribe({
      next: () => {
        this.notificationService.show('Firma guardada exitosamente.', 'success');
        this.isSaving = false;
        this.uploadProgress.set(0);

        const currentUser = this.userStateService.getUser() as any;
        if (currentUser) {
          this.userStateService.setUser({ ...currentUser, signature: signatureUrl });
        }
        this.savedSignatureImage = signatureUrl;
      },
      error: (e) => {
        this.isSaving = false;
        this.uploadProgress.set(0);
        this.notificationService.show('Error al guardar la firma', 'error');
        console.error(e);
      }
    });
  }
}
