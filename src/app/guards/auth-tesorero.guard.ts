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
      const role = this.userState.getRole();
      const fallback = (role === 'Colaborador') ? '/inicio'
        : (role === 'Administrador' || role === 'Coordinador') ? '/admin-users'
        : '/login';
      this.router.navigate([fallback]);
      return false;
    }
    return true;
  }
}
