import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserStateService } from '../services/user-state.service';

export const defaultRedirectGuard: CanActivateFn = () => {
  const userState = inject(UserStateService);
  const router = inject(Router);

  if (!userState.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (userState.isColaborador()) {
    return router.createUrlTree(['/inicio']);
  }

  if (userState.isSuperAdmin()) {
    return router.createUrlTree(['/clients-admin']);
  }

  if (userState.isAdmin()) {
    return router.createUrlTree([userState.isAdminInCompany() ? '/admin-users' : '/hub']);
  }

  if (userState.isContabilidad()) {
    return router.createUrlTree([userState.isContabilidadInCompany() ? '/dashboard' : '/hub']);
  }

  // Coordinador
  return router.createUrlTree(['/inicio']);
};
