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
          Rendiciones
        </button>
        <button
          (click)="setTab('directas')"
          class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
          [class.border-b-2]="activeTab() === 'directas'"
          [class.border-primary]="activeTab() === 'directas'"
          [class.text-primary]="activeTab() === 'directas'"
          [class.text-gray-500]="activeTab() !== 'directas'"
        >
          Directas
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

  showExtraTabs(): boolean {
    return this.userState.isContabilidadInCompany();
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab') as Tab | null;
      if (tab === 'directas' || tab === 'caja-chica') {
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
