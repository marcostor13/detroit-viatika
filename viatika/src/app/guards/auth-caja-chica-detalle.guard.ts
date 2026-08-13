import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserStateService } from '../services/user-state.service';

/**
 * Detalle de una rendición de caja chica. Mismo criterio que la pestaña "Caja
 * Chica" de /rendiciones: Contabilidad, Administrador y Tesorería, que ve esa
 * pantalla igual que Contabilidad porque es quien cierra las rendiciones
 * (VD-66/VD-49). No sirve `AuthAdmin2Guard`: lo comparten pantallas de
 * administración (colaboradores, configuración, clientes) que Tesorería no debe
 * abrir, así que agregarla ahí le habilitaría todas de golpe.
 */
export const cajaChicaDetalleGuard: CanActivateFn = () => {
  const userState = inject(UserStateService);
  const router = inject(Router);

  if (!userState.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  if (
    userState.isAdmin() ||
    userState.isContabilidad() ||
    userState.isTesoreria()
  ) {
    return true;
  }
  return router.createUrlTree([userState.defaultRoute()]);
};
