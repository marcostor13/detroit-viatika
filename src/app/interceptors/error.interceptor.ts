import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, retry, throwError, timer } from 'rxjs';
import { UserStateService } from '../services/user-state.service';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const userStateService = inject(UserStateService);
  const router = inject(Router);
  const notificationService = inject(NotificationService);
  return next(req).pipe(
    // status 0 = conexión abortada (típico al reanudar el celular tras bloquearlo).
    // Se reintenta solo en GET (idempotente) porque suele recuperarse al reconectar la red.
    retry({
      count: 2,
      delay: (error, retryCount) => {
        if (error.status === 0 && req.method === 'GET') {
          return timer(retryCount * 1000); // 1s, luego 2s
        }
        throw error;
      },
    }),
    catchError((error) => {
      if (error.status === 401) {
        userStateService.clearUser();
        notificationService.show(
          'Su sesión ha expirado, vuelva a iniciar sesión',
          'warning'
        );
        // Pequeño delay para que se muestre la notificación antes de navegar
        setTimeout(() => {
          router.navigate(['/login']);
        }, 100);
        return throwError(() => error);
      }
      // Corte de red real (tras reintentar): mensaje amable, no el técnico "0 Unknown Error".
      if (error.status === 0) {
        notificationService.show(
          'Conexión interrumpida. Revisa tu internet e intenta de nuevo.',
          'warning'
        );
        return throwError(() => error);
      }
      const message =
        error.error?.message || error.message || 'Ocurrió un error';
      notificationService.show(message, 'error');
      return throwError(() => error);
    })
  );
};
