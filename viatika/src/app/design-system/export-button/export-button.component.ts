import { Component, output, signal, HostListener, inject, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-export-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './export-button.component.html',
  styleUrl: './export-button.component.scss',
})
export class ExportButtonComponent {
  private elementRef = inject(ElementRef);
  
  isOpen = signal(false);
  exportClicked = output<'excel' | 'pdf'>();

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!this.elementRef.nativeElement.contains(target)) {
      this.isOpen.set(false);
    }
  }

  toggleDropdown(): void {
    this.isOpen.update(value => !value);
  }

  selectFormat(format: 'csv' | 'pdf'): void {
    // Convertir 'csv' a 'excel' para mantener compatibilidad con el sistema existente
    const exportFormat = format === 'csv' ? 'excel' : 'pdf';
    this.exportClicked.emit(exportFormat);
    this.isOpen.set(false);
  }
}

