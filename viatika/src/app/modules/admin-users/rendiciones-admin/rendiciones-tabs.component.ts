import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { UserStateService } from '../../../services/user-state.service';
import { RendicionesAdminComponent } from './rendiciones-admin.component';
import { RendicionesDirectasComponent } from '../../rendiciones-directas/rendiciones-directas.component';
import { RendicionesCajaChicaComponent } from '../../rendiciones-caja-chica/rendiciones-caja-chica.component';

type Tab = 'rendiciones' | 'directas' | 'caja-chica';

@Component({
  selector: 'app-rendiciones-tabs',
  standalone: true,
  imports: [CommonModule, RendicionesAdminComponent, RendicionesDirectasComponent, RendicionesCajaChicaComponent],
  template: `
    <div class="flex flex-col h-full">
      @if (showExtraTabs()) {
      <div class="flex gap-1 px-6 pt-4 border-b border-gray-200 bg-white">
        <button
          (click)="setTab('rendiciones')"
          class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
          [class.border-b-2]="activeTab() === 'rendiciones'"
          [class.border-primary]="activeTab() === 'rendiciones'"
          [class.text-primary]="activeTab() === 'rendiciones'"
          [class.text-gray-500]="activeTab() !== 'rendiciones'"
        >
          Solicitud de Fondos
        </button>
        <button
          (click)="setTab('directas')"
          class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
          [class.border-b-2]="activeTab() === 'directas'"
          [class.border-primary]="activeTab() === 'directas'"
          [class.text-primary]="activeTab() === 'directas'"
          [class.text-gray-500]="activeTab() !== 'directas'"
        >
          Rendiciones Directas
        </button>
        <button
          (click)="setTab('caja-chica')"
          class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
          [class.border-b-2]="activeTab() === 'caja-chica'"
          [class.border-primary]="activeTab() === 'caja-chica'"
          [class.text-primary]="activeTab() === 'caja-chica'"
          [class.text-gray-500]="activeTab() !== 'caja-chica'"
        >
          Caja Chica
        </button>
      </div>
      }

      <div class="flex-1 overflow-auto">
        @if (activeTab() === 'rendiciones') {
          <app-rendiciones-admin />
        }
        @if (activeTab() === 'directas') {
          <app-rendiciones-directas />
        }
        @if (activeTab() === 'caja-chica') {
          <app-rendiciones-caja-chica />
        }
      </div>
    </div>
  `,
})
export class RendicionesTabsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private userState = inject(UserStateService);

  activeTab = signal<Tab>('rendiciones');

  /**
   * Tesorería ve las mismas tres pestañas que Contabilidad. Las directas solo se
   * listan acá (la de "Solicitud de Fondos" las oculta salvo a los aprobadores de
   * su cadena) y Tesorería no es aprobador de nadie, así que sin estas pestañas
   * no tenía dónde ver ni abrir una directa: solo llegaba pegando el URL del
   * detalle a mano, justo cuando el cierre definitivo es suyo (VD-66/VD-49).
   */
  showExtraTabs(): boolean {
    return this.userState.isContabilidadInCompany() || this.userState.isTesoreria();
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab') as Tab | null;
      // El ?tab= se respeta solo si el usuario tiene esas pestañas; si no, cae en
      // la principal en vez de dejar el contenido sin pestaña visible.
      if ((tab === 'directas' || tab === 'caja-chica') && this.showExtraTabs()) {
        this.activeTab.set(tab);
      } else {
        this.activeTab.set('rendiciones');
      }
    });
  }

  setTab(tab: Tab): void {
    this.router.navigate(['/rendiciones'], {
      queryParams: tab === 'rendiciones' ? {} : { tab },
      replaceUrl: true,
    });
  }
}
