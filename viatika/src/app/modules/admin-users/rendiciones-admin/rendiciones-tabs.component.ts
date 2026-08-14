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
        @if (showCajaChicaTab()) {
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
        }
      </div>

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
   * "Solicitud de Fondos" y "Rendiciones Directas" las ve cualquiera que llegue
   * acá: quien abre /rendiciones ya pasó el guard del módulo (o entró por ser
   * aprobador), y cada pestaña acota su contenido a lo que le compete — solo
   * Contabilidad, Tesorería y los administradores ven la empresa completa.
   * Antes las directas eran exclusivas de Contabilidad, así que un aprobador no
   * tenía dónde verlas y Tesorería, que es quien cierra las rendiciones
   * (VD-66/VD-49), solo llegaba pegando el URL del detalle a mano.
   *
   * Caja Chica se queda fuera: es el agrupador contable de las rendiciones de
   * caja chica, sus endpoints son de Contabilidad/Admin/Tesorería y un aprobador
   * no tiene nada que aprobar ahí, así que la pestaña le saldría vacía o en 403.
   */
  showCajaChicaTab(): boolean {
    return (
      this.userState.isContabilidadInCompany() ||
      this.userState.isTesoreria() ||
      this.userState.isAdminInCompany()
    );
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab') as Tab | null;
      // El ?tab= se respeta solo si el usuario tiene esa pestaña; si no, cae en
      // la principal en vez de dejar el contenido sin pestaña visible.
      if (tab === 'directas' || (tab === 'caja-chica' && this.showCajaChicaTab())) {
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
