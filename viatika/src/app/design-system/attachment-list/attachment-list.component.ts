import { Component, computed, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { attachmentFileName } from '../../utils/adjuntos.util';

/**
 * Lista de adjuntos de respaldo de un comprobante, cada uno abrible en una
 * pestaña nueva.
 *
 *   <app-attachment-list [urls]="expenseAttachments(exp)" />
 *
 * Existe porque la planilla de movilidad y Otros Gastos aceptan varios
 * documentos de sustento, y quien revisa los ve tanto en la ficha dentro de la
 * rendición como en la pantalla del gasto suelto. Se abre de uno en uno: abrir
 * todos de golpe lo corta el bloqueador de ventanas emergentes.
 */
@Component({
  selector: 'app-attachment-list',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (urls().length) {
      @if (heading()) {
        <p class="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">
          {{ urls().length }} {{ heading() }}
        </p>
      }
      <ul class="space-y-1.5">
        @for (a of entries(); track a.url) {
          <li>
            <button
              type="button"
              (click)="open(a.url)"
              class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-divider bg-quaternary text-left hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <span class="shrink-0 text-xs font-semibold text-tertiary tabular-nums">{{ a.position }}</span>
              <span class="flex-1 min-w-0 text-sm text-secondary truncate">{{ a.name }}</span>
              <app-icon name="eye" size="sm" class="shrink-0 text-primary" />
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class AttachmentListComponent {
  /** URLs de los adjuntos, en el orden en que se cargaron. */
  urls = input.required<string[]>();

  /**
   * Texto del encabezado, precedido por la cantidad
   * (`"adjuntos de respaldo"` → "3 adjuntos de respaldo"). Vacío = sin
   * encabezado, para cuando la sección ya tiene su propio título.
   */
  heading = input<string>('');

  protected entries = computed(() =>
    this.urls().map((url, i) => ({
      url,
      position: i + 1,
      name: attachmentFileName(url, i),
    }))
  );

  protected open(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
