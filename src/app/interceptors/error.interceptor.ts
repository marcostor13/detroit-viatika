import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { UserStateService } from '../services/user-state.service';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const userStateService = inject(UserStateService);
  const router = inject(Router);
  const notificationService = inject(NotificationService);
  return next(req).pipe(
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
      const message =
        error.error?.message || error.message || 'Ocurrió un error';
      notificationService.show(message, 'error');
      return throwError(() => error);
    })
  );
};
