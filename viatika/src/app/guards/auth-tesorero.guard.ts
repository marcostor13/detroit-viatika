import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { UserStateService } from '../services/user-state.service';

@Injectable({ providedIn: 'root' })
export class AuthTesoreroGuard implements CanActivate {
  constructor(private userState: UserStateService, private router: Router) {}

  canActivate(): boolean {
    if (!this.userState.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }
    if (!this.userState.canAccessTesoreria()) {
      this.router.navigate([this.userState.defaultRoute()]);
      return false;
    }
    return true;
  }
}
