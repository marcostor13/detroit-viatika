import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlowStep } from '../../shared/flow-steps.util';

/**
 * Línea de tiempo del flujo de aprobación (VD-31): un punto por paso, con el
 * completado en verde, el pendiente en azul y el rechazo en rojo.
 *
 * El pendiente va con `info`, NO con `primary`: el primary de Detroit es rojo
 * (ver el comentario del token en tailwind.config.js) y pintaba "Falta
 * aprobación de…" como si fuera un rechazo.
 *
 * Vive en el design system porque el mismo bloque estaba copiado en el detalle
 * de la rendición y en el modal de /rendiciones, con tamaños distintos en cada
 * copia. Los pasos los arma `buildReportFlowSteps`; este componente solo pinta.
 *
 * `groupLabels` traduce el `group` de cada paso al encabezado que separa las
 * dos fases de un viático (solicitud y rendición). Sin él, los pasos salen
 * corridos, que es lo correcto para una directa o una caja chica.
 */
@Component({
  selector: 'app-flow-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    @for (step of steps; track $index; let last = $last; let first = $first) {
      @if (step.group && groupLabels[step.group] && (first || step.group !== steps[$index - 1].group)) {
        <p class="text-[11px] font-bold uppercase tracking-wider mb-2 mt-1"
           [class.text-primary]="step.group === 'solicitud'"
           [class.text-warning-ink]="step.group === 'rendicion'">
          {{ groupLabels[step.group] }}
        </p>
      }
      <div class="flex gap-3">
        <!-- Ícono + línea vertical -->
        <div class="flex flex-col items-center">
          @if (step.state === 'completed') {
            <div class="w-7 h-7 rounded-full bg-success/10 border-2 border-success flex items-center justify-center shrink-0">
              <svg class="w-3.5 h-3.5 text-success-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          } @else if (step.state === 'active') {
            <div class="w-7 h-7 rounded-full bg-info/10 border-2 border-info flex items-center justify-center shrink-0">
              <div class="w-2.5 h-2.5 rounded-full bg-info"></div>
            </div>
          } @else if (step.state === 'rejected') {
            <div class="w-7 h-7 rounded-full bg-error/10 border-2 border-error flex items-center justify-center shrink-0">
              <svg class="w-3 h-3 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          } @else {
            <div class="w-7 h-7 rounded-full border-2 border-tertiary/20 flex items-center justify-center shrink-0">
              <div class="w-2 h-2 rounded-full bg-tertiary/20"></div>
            </div>
          }
          @if (!last) {
            <div class="w-0.5 flex-1 my-1 min-h-[16px]"
                 [ngClass]="{
                   'bg-success/40': step.state === 'completed',
                   'bg-info/40': step.state === 'active',
                   'bg-error/30': step.state === 'rejected',
                   'bg-tertiary/20': step.state === 'upcoming'
                 }"></div>
          }
        </div>
        <!-- Contenido del paso -->
        <div class="flex-1 pt-0.5" [class.pb-4]="!last">
          <p class="text-sm font-medium"
             [class.text-secondary]="step.state !== 'upcoming'"
             [class.text-tertiary]="step.state === 'upcoming'">
            {{ step.label }}
          </p>
          @if (step.date) {
            <p class="text-xs text-tertiary mt-0.5">{{ step.date }}</p>
          }
          @if (step.description) {
            <p class="text-xs font-medium mt-1"
               [class.text-info-ink]="step.state === 'active'"
               [class.text-error]="step.state === 'rejected'">
              {{ step.description }}
            </p>
          }
          @if (step.notes) {
            <p class="text-xs text-tertiary italic mt-0.5">{{ step.notes }}</p>
          }
        </div>
      </div>
    }
  `,
})
export class FlowTimelineComponent {
  @Input({ required: true }) steps: FlowStep[] = [];

  /** Encabezados por fase. Vacío = todos los pasos corridos, sin separadores. */
  @Input() groupLabels: Record<string, string> = {};
}
