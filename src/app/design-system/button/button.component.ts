import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
})
export class ButtonComponent {
  // Required inputs
  label = input.required<string>();
  
  // Optional inputs
  variant = input<ButtonVariant>('primary');
  size = input<ButtonSize>('md');
  disabled = input<boolean>(false);
  fullWidth = input<boolean>(false);
  type = input<'button' | 'submit' | 'reset'>('button');
  loading = input<boolean>(false);
  loadingLabel = input<string>('Cargando…');
  
  // Outputs
  clicked = output<void>();

  // Computed classes
  buttonClasses = computed(() => {
    const base = 'font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';
    
    const variants = {
      primary: 'bg-primary text-quaternary hover:bg-accent shadow-soft hover:shadow-lg',
      secondary: 'bg-transparent border border-divider text-secondary hover:bg-background hover:border-primary hover:text-primary',
      ghost: 'bg-transparent text-tertiary hover:text-primary hover:bg-background',
      danger: 'bg-error text-quaternary hover:bg-error/90 shadow-soft hover:shadow-lg',
    };

    const sizes = {
      sm: 'h-9 px-4 text-sm rounded',
      md: 'h-[42px] px-5 text-sm rounded',
      lg: 'h-12 px-6 text-base rounded',
    };
    
    const width = this.fullWidth() ? 'w-full' : '';
    
    return `${base} ${variants[this.variant()]} ${sizes[this.size()]} ${width}`;
  });

  onClick(): void {
    if (!this.disabled() && !this.loading()) {
      this.clicked.emit();
    }
  }
}

