import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserStateService } from '../services/user-state.service';

export const defaultRedirectGuard: CanActivateFn = () => {
  const userState = inject(UserStateService);
  const router = inject(Router);

  // El destino se calcula con los módulos asignados (ver defaultRoute): sin el
  // bypass de rol, un panel al que el usuario no tiene permiso lo rebotaría.
  return router.createUrlTree([userState.defaultRoute()]);
};
