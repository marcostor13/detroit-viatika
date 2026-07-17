import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { UserStateService } from '../services/user-state.service';

export function authModuleGuard(module: string, bypassForAdmin = false): CanActivateFn {
  return () => {
    const userState = inject(UserStateService);
    const router = inject(Router);

    if (!userState.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }

    if (userState.hasModulePermission(module)) {
      return true;
    }

    // El guard corre en la navegación, potencialmente antes de que la consulta
    // disparada en el login/rehidratación resuelva: se vuelve a pedir aquí
    // (idempotente) y se espera la respuesta real en vez de leer el signal
    // cacheado a ciegas, para no perder una carrera contra esa llamada.
    return userState.refreshApproverStatus().pipe(
      map((isApprover) => {
        // Aprobadores siempre acceden a rendiciones (es su vista principal)
        if (isApprover && module === 'rendiciones') return true;

        if (userState.isColaborador()) return router.createUrlTree(['/inicio']);
        if (userState.isAdmin()) return router.createUrlTree(['/admin-users']);
        if (userState.isContabilidad()) return router.createUrlTree(['/tesoreria']);
        if (isApprover) return router.createUrlTree(['/rendiciones']);
        return router.createUrlTree(['/clients-admin']);
      }),
      catchError(() => of(router.createUrlTree(['/clients-admin']))),
    );
  };
}
