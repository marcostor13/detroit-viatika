import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IHeaderList } from '../../interfaces/header-list.interface';

@Component({
  selector: 'app-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
})
export class TableComponent {
  @Input() headers: IHeaderList[] = [];
  @Input() data: any[] = [];
  @Output() clickOptionsEvent = new EventEmitter<{
    option: string;
    _id: string;
  }>();
  @Output() rowClick = new EventEmitter<string>();

  options(option: string, _id: string) {
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
}
