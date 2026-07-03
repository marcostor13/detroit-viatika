import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error';
export type BadgeSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  info: 'bg-primary/10 text-primary',
  success: 'bg-success/15 text-success-ink',
  warning: 'bg-warning/15 text-warning-ink',
  error: 'bg-error/15 text-error-ink',
};

const DOT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-ink-500',
  info: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'text-[11px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './badge.component.html',
  styleUrl: './badge.component.scss',
})
export class BadgeComponent {
  variant = input<BadgeVariant>('neutral');
  size = input<BadgeSize>('md');
  /** Leading status dot. Off by default for compact badges inside dense tables. */
  dot = input<boolean>(false);

  badgeClasses = computed(
    () =>
      `inline-flex items-center gap-1.5 font-medium rounded-full whitespace-nowrap ${VARIANT_CLASSES[this.variant()]} ${SIZE_CLASSES[this.size()]}`,
  );

  dotClasses = computed(() => `w-1.5 h-1.5 rounded-full shrink-0 ${DOT_CLASSES[this.variant()]}`);
}
