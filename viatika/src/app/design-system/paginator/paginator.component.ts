import { Component, Input, Output, EventEmitter, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-paginator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paginator.component.html',
})
export class PaginatorComponent {
  @Input() total = 0;
  @Input() page = 1;
  @Input() pages = 1;
  @Input() limit = 20;

  @Output() pageChange = new EventEmitter<number>();
  @Output() limitChange = new EventEmitter<number>();

  readonly limits = [10, 20, 50, 100];

  get hasPrev(): boolean { return this.page > 1; }
  get hasNext(): boolean { return this.page < this.pages; }

  get pageNumbers(): number[] {
    const range: number[] = [];
    const start = Math.max(1, this.page - 2);
    const end = Math.min(this.pages, this.page + 2);
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  }

  prev() { if (this.hasPrev) this.pageChange.emit(this.page - 1); }
  next() { if (this.hasNext) this.pageChange.emit(this.page + 1); }
  goTo(n: number) { this.pageChange.emit(n); }
  changeLimit(event: Event) {
    const val = +(event.target as HTMLSelectElement).value;
    this.limitChange.emit(val);
    this.pageChange.emit(1);
  }

  get from(): number { return this.total === 0 ? 0 : (this.page - 1) * this.limit + 1; }
  get to(): number { return Math.min(this.page * this.limit, this.total); }
}
