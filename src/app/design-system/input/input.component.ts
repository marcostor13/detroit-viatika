import { Component, input, output, model, computed, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

let nextInputId = 0;

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true,
    },
  ],
  templateUrl: './input.component.html',
  styleUrl: './input.component.scss',
})
export class InputComponent implements ControlValueAccessor {
  readonly inputId = `app-input-${nextInputId++}`;
  readonly errorId = `${this.inputId}-error`;
  readonly helpId = `${this.inputId}-help`;

  describedBy = computed<string | null>(() => {
    if (this.error()) {
      return this.errorId;
    }
    if (this.helperText()) {
      return this.helpId;
    }
    return null;
  });

  // Required inputs
  label = input<string>('');
  placeholder = input<string>('');
  type = input<string>('text');

  // Optional inputs
  disabled = input<boolean>(false);
  required = input<boolean>(false);
  error = input<string>('');
  helperText = input<string>('');
  icon = input<string>(''); // SVG icon path or icon name

  // Two-way binding
  value = model<string>('');

  // Outputs
  changed = output<string>();
  blurred = output<void>();

  // ControlValueAccessor
  private onChange = (value: string) => { };
  private onTouched = () => { };

  inputClasses = computed(() => {
    const base = 'w-full bg-quaternary border border-divider rounded px-4 py-3 text-secondary placeholder-tertiary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200';
    const errorState = this.error() ? 'border-accent focus:ring-accent/20' : '';
    const disabledState = this.disabled() ? 'opacity-50 cursor-not-allowed' : '';

    return `${base} ${errorState} ${disabledState}`;
  });

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value.set(target.value);
    this.onChange(target.value);
    this.changed.emit(target.value);
  }

  onBlur(): void {
    this.onTouched();
    this.blurred.emit();
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.value.set(value || '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    // Handled by inputClasses computed
  }
}

