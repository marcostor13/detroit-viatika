import {
  Component,
  ElementRef,
  QueryList,
  ViewChildren,
  input,
  model,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TabItem {
  value: string;
  label: string;
  badge?: number;
}

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.scss',
})
export class TabsComponent {
  tabs = input.required<TabItem[]>();
  active = model.required<string>();

  @ViewChildren('tabBtn') private tabButtons?: QueryList<ElementRef<HTMLButtonElement>>;

  select(value: string): void {
    this.active.set(value);
  }

  onKeydown(event: KeyboardEvent, index: number): void {
    const items = this.tabs();
    if (!items.length) {
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % items.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      this.active.set(items[nextIndex].value);
      this.focusTabAt(nextIndex);
    }
  }

  private focusTabAt(index: number): void {
    queueMicrotask(() => this.tabButtons?.get(index)?.nativeElement.focus());
  }
}
