import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { UserStateService } from '../services/user-state.service';

@Injectable({ providedIn: 'root' })
export class AuthAdmin2Guard implements CanActivate {
  constructor(private userState: UserStateService, private router: Router) { }

  canActivate(): boolean {
    if (!this.userState.isAuthenticated()) {
      this.router.navigate(['/login']);
      return false;
    }

    if (this.userState.isAdmin() || this.userState.isContabilidad()) return true;

    this.router.navigate(['/inicio']);
    return false;
  }
}
