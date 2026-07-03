import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

let nextFieldId = 0;

/**
 * Accessible label + error/help wrapper for any form control (select,
 * checkbox, radio group, date picker, project-select, worker-select, or a
 * plain native input not yet migrated to app-input).
 *
 * The projected control must bind `fieldId` and `describedBy()` itself,
 * since content projection can't inject attributes into arbitrary markup:
 *
 *   <app-form-field #field label="Correo" [error]="emailError">
 *     <input [id]="field.fieldId" [attr.aria-describedby]="field.describedBy()" ... />
 *   </app-form-field>
 */
@Component({
  selector: 'app-form-field',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './form-field.component.html',
  styleUrl: './form-field.component.scss',
})
export class FormFieldComponent {
  label = input<string>('');
  required = input<boolean>(false);
  error = input<string>('');
  helperText = input<string>('');

  readonly fieldId = `app-form-field-${nextFieldId++}`;
  readonly errorId = `${this.fieldId}-error`;
  readonly helpId = `${this.fieldId}-help`;

  describedBy = computed<string | null>(() => {
    if (this.error()) {
      return this.errorId;
    }
    if (this.helperText()) {
      return this.helpId;
    }
    return null;
  });
}
