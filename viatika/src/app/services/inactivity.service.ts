import { Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';
import { UserStateService } from './user-state.service';
import { NotificationService } from './notification.service';

/** VD-99: 2 horas sin interacción del usuario cierran la sesión. */
export const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;

/** Cada cuánto se revisa si venció el plazo. */
export const INACTIVITY_CHECK_INTERVAL_MS = 30 * 1000;

/** Mínimo entre escrituras a localStorage para no golpearlo en cada mousemove. */
const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000;

/** Marca de tiempo de la última interacción; compartida entre pestañas. */
export const LAST_ACTIVITY_KEY = 'last-activity-ts';

const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
  'click',
];

/**
 * Cierra la sesión tras INACTIVITY_TIMEOUT_MS sin interacción y manda al login.
 *
 * La marca de actividad vive en localStorage, así que el plazo es común a todas
 * las pestañas y sobrevive a un recargado: si la app se abre con una marca de
 * hace más de 2 horas, la sesión se cierra en el arranque. Los listeners se
 * registran fuera de la zona de Angular para no disparar change detection en
 * cada movimiento del mouse.
 */
@Injectable({ providedIn: 'root' })
export class InactivityService {
  private zone = inject(NgZone);
  private router = inject(Router);
  private userState = inject(UserStateService);
  private notification = inject(NotificationService);

  private started = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastWrite = 0;

  private readonly onActivity = () => this.markActivity();
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'visible') this.check();
  };
  private readonly onStorage = (event: StorageEvent) => {
    // Otra pestaña cerró sesión (propia o por inactividad): esta también sale.
    if (event.key === 'token' && event.newValue === null && this.userState.getUser()) {
      this.zone.run(() => {
        this.userState.clearUser();
        this.router.navigate(['/login']);
      });
    }
  };

  /** Idempotente: se llama una sola vez al arrancar la app. */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Sin marca previa (primer ingreso o despliegue nuevo) se siembra con la
    // hora actual para no expulsar a quien ya tenía la sesión abierta.
    if (!this.readLastActivity()) this.writeActivity();

    this.zone.runOutsideAngular(() => {
      for (const event of ACTIVITY_EVENTS) {
        document.addEventListener(event, this.onActivity, { passive: true, capture: true });
      }
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      window.addEventListener('storage', this.onStorage);
      this.intervalId = setInterval(() => this.check(), INACTIVITY_CHECK_INTERVAL_MS);
      // Una sesión reabierta después del plazo se cierra de entrada. Se difiere
      // un tick para no chocar con la navegación inicial del router.
      setTimeout(() => this.check(), 0);
    });
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    for (const event of ACTIVITY_EVENTS) {
      document.removeEventListener(event, this.onActivity, { capture: true } as any);
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('storage', this.onStorage);
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Reinicia el plazo. Público para poder forzarlo tras el login. */
  markActivity(): void {
    const now = Date.now();
    if (now - this.lastWrite < ACTIVITY_WRITE_THROTTLE_MS) return;
    this.writeActivity(now);
  }

  /** Milisegundos restantes antes del cierre; 0 si ya venció. */
  msUntilExpiration(): number {
    const last = this.readLastActivity();
    if (!last) return INACTIVITY_TIMEOUT_MS;
    return Math.max(0, last + INACTIVITY_TIMEOUT_MS - Date.now());
  }

  private check(): void {
    if (!this.userState.isAuthenticated()) {
      // En el login el reloj no corre: al entrar, el plazo arranca de cero.
      this.writeActivity();
      return;
    }
    const last = this.readLastActivity();
    if (!last) {
      this.writeActivity();
      return;
    }
    if (Date.now() - last >= INACTIVITY_TIMEOUT_MS) {
      this.zone.run(() => this.expire());
    }
  }

  private expire(): void {
    this.userState.clearUser();
    this.writeActivity();
    this.notification.show(
      'Su sesión se cerró por inactividad. Vuelva a iniciar sesión.',
      'warning'
    );
    this.router.navigate(['/login']);
  }

  private readLastActivity(): number | null {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private writeActivity(now = Date.now()): void {
    this.lastWrite = now;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  }
}
