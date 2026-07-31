import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
})
export class ModalComponent {
  open = input.required<boolean>();
  title = input<string>('');
  size = input<ModalSize>('md');
  closeOnBackdrop = input<boolean>(true);

  closed = output<void>();

  @ViewChild('dialogEl') dialogElRef?: ElementRef<HTMLElement>;

  private previouslyFocused: HTMLElement | null = null;

  sizeClasses = computed(
    () =>
      ({
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
      })[this.size()],
  );

  constructor() {
    // Focus trap lifecycle: remember what had focus before opening, move
    // focus inside the dialog, and restore it on close.
    effect(() => {
      if (this.open()) {
        this.previouslyFocused = document.activeElement as HTMLElement;
        queueMicrotask(() => this.focusFirstElement());
      } else if (this.previouslyFocused) {
        this.previouslyFocused.focus();
        this.previouslyFocused = null;
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  @HostListener('document:keydown.tab', ['$event'])
  onTab(event: KeyboardEvent): void {
    if (!this.open()) {
      return;
    }
    const focusable = this.getFocusableElements();
    if (!focusable.length) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop()) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  private getFocusableElements(): HTMLElement[] {
    const root = this.dialogElRef?.nativeElement;
    if (!root) {
      return [];
    }
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }

  private focusFirstElement(): void {
    const focusable = this.getFocusableElements();
    (focusable[0] ?? this.dialogElRef?.nativeElement)?.focus();
  }
}
