import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  InactivityService,
  INACTIVITY_TIMEOUT_MS,
  INACTIVITY_CHECK_INTERVAL_MS,
  LAST_ACTIVITY_KEY,
} from './inactivity.service';
import { UserStateService } from './user-state.service';
import { NotificationService } from './notification.service';

describe('InactivityService', () => {
  let service: InactivityService;
  let userState: jasmine.SpyObj<UserStateService>;
  let notification: jasmine.SpyObj<NotificationService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    userState = jasmine.createSpyObj('UserStateService', [
      'clearUser',
      'isAuthenticated',
      'getUser',
    ]);
    userState.isAuthenticated.and.returnValue(true);
    userState.getUser.and.returnValue(null);
    notification = jasmine.createSpyObj('NotificationService', ['show']);
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        InactivityService,
        { provide: UserStateService, useValue: userState },
        { provide: NotificationService, useValue: notification },
        { provide: Router, useValue: router },
      ],
    });

    service = TestBed.inject(InactivityService);
  });

  afterEach(() => {
    service.stop();
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  });

  it('el plazo es de 2 horas', () => {
    expect(INACTIVITY_TIMEOUT_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('siembra la marca de actividad al arrancar si no existía', fakeAsync(() => {
    service.start();
    tick(0);
    expect(localStorage.getItem(LAST_ACTIVITY_KEY)).toBeTruthy();
    expect(router.navigate).not.toHaveBeenCalled();
    discardPeriodicTasks();
  }));

  it('cierra la sesión y va al login al cumplirse el plazo', fakeAsync(() => {
    service.start();
    tick(0);

    tick(INACTIVITY_TIMEOUT_MS + INACTIVITY_CHECK_INTERVAL_MS);

    expect(userState.clearUser).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(notification.show).toHaveBeenCalledWith(
      'Su sesión se cerró por inactividad. Vuelva a iniciar sesión.',
      'warning'
    );
    discardPeriodicTasks();
  }));

  it('la interacción del usuario reinicia el plazo', fakeAsync(() => {
    service.start();
    tick(0);

    // Casi vencido, pero el usuario toca una tecla: el reloj vuelve a cero.
    tick(INACTIVITY_TIMEOUT_MS - INACTIVITY_CHECK_INTERVAL_MS);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    tick(INACTIVITY_CHECK_INTERVAL_MS * 2);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(userState.clearUser).not.toHaveBeenCalled();
    discardPeriodicTasks();
  }));

  it('no expira mientras nadie ha iniciado sesión', fakeAsync(() => {
    userState.isAuthenticated.and.returnValue(false);
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now() - INACTIVITY_TIMEOUT_MS * 2));

    service.start();
    tick(INACTIVITY_CHECK_INTERVAL_MS * 2);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(userState.clearUser).not.toHaveBeenCalled();
    discardPeriodicTasks();
  }));

  it('cierra de entrada una sesión reabierta después del plazo', fakeAsync(() => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now() - INACTIVITY_TIMEOUT_MS - 1000));

    service.start();
    tick(0);

    expect(userState.clearUser).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    discardPeriodicTasks();
  }));

  it('msUntilExpiration refleja lo que falta para el cierre', fakeAsync(() => {
    service.start();
    tick(0);
    expect(service.msUntilExpiration()).toBeGreaterThan(INACTIVITY_TIMEOUT_MS - 1000);

    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now() - INACTIVITY_TIMEOUT_MS));
    expect(service.msUntilExpiration()).toBe(0);
    discardPeriodicTasks();
  }));

  it('sale al login cuando otra pestaña borra el token', fakeAsync(() => {
    userState.getUser.and.returnValue({ name: 'Ana' } as any);
    service.start();
    tick(0);

    window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: null }));

    expect(userState.clearUser).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    discardPeriodicTasks();
  }));

  it('stop deja de vigilar', fakeAsync(() => {
    service.start();
    tick(0);
    service.stop();

    tick(INACTIVITY_TIMEOUT_MS * 2);

    expect(router.navigate).not.toHaveBeenCalled();
    discardPeriodicTasks();
  }));
});
