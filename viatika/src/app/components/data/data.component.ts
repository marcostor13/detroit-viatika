import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TableComponent } from '../table/table.component';
import { ListTableComponent } from '../list-table/list-table.component';
import { IHeaderList } from '../../interfaces/header-list.interface';

@Component({
  selector: 'app-data',
  standalone: true,
  imports: [TableComponent, ListTableComponent],
  templateUrl: './data.component.html',
  styleUrl: './data.component.scss',
})
export class DataComponent {
  @Input() headers: IHeaderList[] = [];
  @Input() data: any[] = [];
  @Output() clickOptionsEvent = new EventEmitter<{
    option: string;
    _id: string;
  }>();
  @Output() rowClick = new EventEmitter<string>();

  clickOptions(event: { option: string; _id: string }) {
    this.clickOptionsEvent.emit(event);
  }
}
