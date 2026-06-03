import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { NotificationBellComponent } from '../../components/notification-bell/notification-bell.component';
import { UserStateService } from '../../services/user-state.service';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, NotificationBellComponent],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss',
})
export class MainComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private userStateService = inject(UserStateService);
  private routerSubscription!: Subscription;
  currentPath = '';
  sidebarVisible = false;
  showSignatureModal = false;

  constructor() {
    this.detectPath();
  }

  ngOnInit() {
    this.userStateService.refreshPermissions()
      .pipe(finalize(() => {
        const user = this.userStateService.getUser();
        if (user && !user.signature) {
          this.showSignatureModal = true;
        }
      }))
      .subscribe();
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  detectPath() {
    this.routerSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.currentPath = event.url;
      }
    });
  }

  getPageTitle(): string {
    const path = this.currentPath;

    if (path.includes('/invoices')) {
      return 'Facturas';
    } else if (path.includes('/admin-users')) {
      return 'Colaboradores';
    } else if (path.includes('/consolidated-invoices')) {
      return 'Consolidado de Facturas';
    } else if (path.includes('/categories')) {
      return 'Categorías';
    } else if (path.includes('/projects')) {
      return 'Proyectos';
    } else if (path.includes('/mis-rendiciones')) {
      return 'Mis Rendiciones';
    } else if (path.includes('/mis-documentos')) {
      return 'Mis Documentos';
    } else if (path.includes('/tesoreria')) {
      return 'Tesorería';
    }

    return 'Panel de Control';
  }

  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
  }

  goToSignature() {
    this.showSignatureModal = false;
    this.router.navigate(['/mi-firma']);
  }

  dismissSignatureModal() {
    this.showSignatureModal = false;
  }
}
