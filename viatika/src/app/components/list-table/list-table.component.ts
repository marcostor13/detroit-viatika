import { Component, Input, Output, EventEmitter } from '@angular/core';
import { IHeaderList } from '../../interfaces/header-list.interface';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-list-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './list-table.component.html',
  styleUrl: './list-table.component.scss',
})
export class ListTableComponent {
  @Input() headers!: IHeaderList[];
  @Input() data!: any[];
  @Output() clickOptionsEvent = new EventEmitter<{
    option: string;
    _id: string;
  }>();
  @Output() rowClick = new EventEmitter<string>();

  toggleDetails(index: number) {
    this.data[index].isVisible = !this.data[index].isVisible;
  }

  clickOptions(option: string, _id: string) {
    this.clickOptionsEvent.emit({ option, _id });
  }

  isDateField(fieldName: string): boolean {
    const dateFields = [
      'date',
      'fecha',
      'createdAt',
      'updatedAt',
      'fechaCreacion',
      'fechaModificacion',
      'fechaEmision',
      'fechaVencimiento',
    ];
    return dateFields.some((field) => fieldName.toLowerCase().includes(field));
  }

  isTotalField(fieldName: string): boolean {
    const totalFields = ['total', 'monto', 'amount', 'precio', 'price'];
    return totalFields.some((field) => fieldName.toLowerCase().includes(field));
  }

  isNumber(value: any): boolean {
    return typeof value === 'number' && !isNaN(value);
  }

  isValidDate(value: any): boolean {
    if (!value || value === 'No disponible') return false;
    if (value instanceof Date) return !isNaN(value.getTime());
    if (typeof value === 'string') {
      // Intentar parsear como fecha
      const date = new Date(value);
      return !isNaN(date.getTime());
    }
    return false;
  }

  formatDate(value: any): string {
    if (!value || value === 'No disponible') return '—';
    
    try {
      if (value instanceof Date) {
        return value.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      }
      
      if (typeof value === 'string') {
        // Si viene en formato dd-mm-yyyy, convertirlo
        if (value.match(/^\d{2}[-\/]\d{2}[-\/]\d{4}$/)) {
          const parts = value.split(/[-\/]/);
          const day = parts[0];
          const month = parts[1];
          const year = parts[2];
          return `${day}/${month}/${year}`;
        }
        
        // Intentar parsear como fecha ISO o estándar
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
        }
      }
      
      // Si no se puede parsear, mostrar el valor original
      return value;
    } catch {
      return value || '—';
    }
  }
}
