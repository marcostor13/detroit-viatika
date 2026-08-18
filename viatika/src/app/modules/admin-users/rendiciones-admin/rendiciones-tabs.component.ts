import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { UserStateService } from '../../../services/user-state.service';
import { RendicionesAdminComponent } from './rendiciones-admin.component';
import { RendicionesDirectasComponent } from '../../rendiciones-directas/rendiciones-directas.component';
import { RendicionesCajaChicaComponent } from '../../rendiciones-caja-chica/rendiciones-caja-chica.component';
import { FondoCajaChicaService } from '../../../services/fondo-caja-chica.service';

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
        <button
          (click)="setTab('caja-chica')"
          class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
          [class.border-b-2]="activeTab() === 'caja-chica'"
          [class.border-primary]="activeTab() === 'caja-chica'"
          [class.text-primary]="activeTab() === 'caja-chica'"
          [class.text-gray-500]="activeTab() !== 'caja-chica'"
        >
          Caja Chica
          @if (cajaChicaPendientes() > 0) {
            <span class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">{{ cajaChicaPendientes() }}</span>
          }
        </button>
      </div>

      <div class="flex-1 overflow-auto">
        @if (activeTab() === 'rendiciones') {
          <app-rendiciones-admin mode="fondos" />
        }
        @if (activeTab() === 'directas') {
          <app-rendiciones-directas />
        }
        @if (activeTab() === 'caja-chica') {
          @if (showAgrupadorContable()) {
          <div class="flex gap-1 px-6 pt-4">
            <button
              (click)="cajaChicaView.set('flujo')"
              class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"
              [class]="cajaChicaView() === 'flujo' ? 'bg-background text-primary' : 'text-gray-500'"
            >
              Solicitudes y rendiciones
            </button>
            <button
              (click)="cajaChicaView.set('agrupador')"
              class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"
              [class]="cajaChicaView() === 'agrupador' ? 'bg-background text-primary' : 'text-gray-500'"
            >
              Reportes contables
            </button>
          </div>
          }
          @if (cajaChicaView() === 'flujo' || !showAgrupadorContable()) {
            <app-rendiciones-admin mode="caja-chica" />
          } @else {
            <app-rendiciones-caja-chica />
          }
        }
      </div>
    </div>
  `,
})
export class RendicionesTabsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private userState = inject(UserStateService);
  private fondoCajaChicaService = inject(FondoCajaChicaService);

  activeTab = signal<Tab>('rendiciones');

  /**
   * Sub-vista de la pestaña Caja Chica. `flujo` es la bandeja de solicitudes de
   * fondo y rendiciones de caja chica (la que usa el aprobador); `agrupador` es
   * el reporte consolidado que arma Contabilidad.
   */
  cajaChicaView = signal<'flujo' | 'agrupador'>('flujo');

  /**
   * Documentos de caja chica que esperan una acción de este usuario. Lo cuenta
   * el backend según su rol, para que el número se vea sin abrir la pestaña.
   */
  cajaChicaPendientes = signal(0);

  /**
   * Las tres pestañas las ve cualquiera que llegue acá: quien abre /rendiciones
   * ya pasó el guard del módulo (o entró por ser aprobador), y cada pestaña
   * acota su contenido a lo que le compete — solo Contabilidad, Tesorería y los
   * administradores ven la empresa completa.
   *
   * Caja Chica estaba reservada a Contabilidad/Tesorería/Admin porque solo
   * contenía el agrupador contable. Ahora la caja chica tiene su propio ciclo de
   * aprobación (solicitud de fondo + rendición contra el fondo), así que el
   * aprobador necesita la pestaña: sus documentos salieron de "Solicitud de
   * Fondos", donde se mezclaban con los viáticos. El agrupador contable, que sí
   * responde 403 fuera de esos roles, queda detrás de esta sub-vista.
   */
  showAgrupadorContable(): boolean {
    return (
      this.userState.isSuperAdmin() ||
      this.userState.isContabilidadInCompany() ||
      this.userState.isTesoreria() ||
      this.userState.isAdminInCompany()
    );
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab') as Tab | null;
      // El ?tab= se respeta solo si es una pestaña conocida; si no, cae en la
      // principal en vez de dejar el contenido sin pestaña visible.
      if (tab === 'directas' || tab === 'caja-chica') {
        this.activeTab.set(tab);
      } else {
        this.activeTab.set('rendiciones');
      }
    });
    this.loadCajaChicaPendientes();
  }

  private loadCajaChicaPendientes(): void {
    this.fondoCajaChicaService.pendientes().subscribe({
      next: ({ total }) => this.cajaChicaPendientes.set(total ?? 0),
      // Sin contador la pestaña sigue funcionando: no se avisa del error.
      error: () => this.cajaChicaPendientes.set(0),
    });
  }

  setTab(tab: Tab): void {
    this.router.navigate(['/rendiciones'], {
      queryParams: tab === 'rendiciones' ? {} : { tab },
      replaceUrl: true,
    });
  }
}
