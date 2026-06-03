import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserStateService } from '../services/user-state.service';

export function authModuleGuard(module: string, bypassForAdmin = false): CanActivateFn {
  return () => {
    const userState = inject(UserStateService);
    const router = inject(Router);

    if (!userState.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }

    if (userState.needsCompanySelection()) {
      return router.createUrlTree(['/hub']);
    }

    if (userState.hasModulePermission(module)) {
      return true;
    }

    if (userState.isColaborador()) return router.createUrlTree(['/inicio']);
    if (userState.isAdmin()) return router.createUrlTree(['/admin-users']);
    if (userState.isContabilidad()) return router.createUrlTree(['/tesoreria']);
    if (userState.isCoordinador()) return router.createUrlTree(['/viaticos']);
    return router.createUrlTree(['/clients-admin']);
  };
}
