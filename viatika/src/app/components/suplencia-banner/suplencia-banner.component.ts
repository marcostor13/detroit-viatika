import { Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SuplenciaService } from '../../services/suplencia.service';

/**
 * Aviso "estás aprobando en reemplazo de X" (VD-124).
 *
 * Va en las pantallas de aprobación porque la suplencia no cambia nada visible
 * en la bandeja: los documentos del titular aparecen mezclados con los propios,
 * sin ninguna marca. Sin este aviso alguien puede firmar sin darse cuenta de
 * que lo está haciendo en nombre de otra persona — y eso es justo lo que
 * después nadie sabe explicar cuando Contabilidad revisa quién aprobó qué.
 *
 * Lee la signal compartida de `SuplenciaService` en vez de consultar por su
 * cuenta: la misma lista decide qué botones de aprobar se muestran, así que
 * tienen que venir de una sola fuente.
 *
 * No renderiza nada cuando el usuario no cubre a nadie, que es el caso normal.
 */
@Component({
  selector: 'app-suplencia-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (nombres().length > 0) {
      <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p class="text-sm text-amber-900">
          <span class="font-semibold">Estás aprobando en reemplazo de</span>
          {{ nombres().join(', ') }}. Lo que firmes queda registrado a tu nombre,
          indicando por quién actuaste.
        </p>
      </div>
    }
  `,
})
export class SuplenciaBannerComponent implements OnInit {
  private suplenciaService = inject(SuplenciaService);

  readonly nombres = computed(() => this.suplenciaService.cubroA().map((t) => t.name));

  ngOnInit() {
    // Idempotente: refresca por si la vacación se programó con la sesión abierta.
    this.suplenciaService.cargar().subscribe({ error: () => {} });
  }
}
