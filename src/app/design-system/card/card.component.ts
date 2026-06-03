import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type CardVariant = 'default' | 'elevated' | 'outlined';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './card.component.html',
  styleUrl: './card.component.scss',
})
export class CardComponent {
  variant = input<CardVariant>('default');
  padding = input<'none' | 'sm' | 'md' | 'lg'>('md');
  hover = input<boolean>(true);

  cardClasses = computed(() => {
    const base = 'bg-quaternary rounded-xl transition-all duration-300';
    
    const variants = {
      default: 'shadow-soft border border-divider',
      elevated: 'shadow-lg hover:shadow-xl',
      outlined: 'border border-divider shadow-none',
    };
    
    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-4 md:p-6',
      lg: 'p-6 md:p-8',
    };
    
    const hoverEffect = this.hover() ? 'hover:-translate-y-1' : '';
    
    return `${base} ${variants[this.variant()]} ${paddings[this.padding()]} ${hoverEffect}`;
  });
}

