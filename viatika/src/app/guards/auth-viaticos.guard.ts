import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { UserStateService } from '../services/user-state.service';

@Injectable({ providedIn: 'root' })
export class AuthViaticosGuard implements CanActivate {
  constructor(private userState: UserStateService, private router: Router) {}

  canActivate(): boolean {
    if (!this.userState.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }
    const allowed =
      this.userState.isSuperAdmin() ||
      this.userState.canApproveL1() ||
      this.userState.hasModulePermission('viaticos');
    if (!allowed) {
      this.router.navigate([this.userState.defaultRoute()]);
      return false;
    }
    return true;
  }
}
