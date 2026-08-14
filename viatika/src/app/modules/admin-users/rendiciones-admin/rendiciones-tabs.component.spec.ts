import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { RendicionesTabsComponent } from './rendiciones-tabs.component';
import { UserStateService } from '../../../services/user-state.service';

describe('RendicionesTabsComponent', () => {
  let component: RendicionesTabsComponent;
  let userState: jasmine.SpyObj<UserStateService>;
  let router: jasmine.SpyObj<Router>;
  let queryParamMap$: any;

  function setup(
    initialTab: string | null = null,
    role: 'contabilidad' | 'tesoreria' | 'admin' | 'aprobador' = 'contabilidad'
  ) {
    TestBed.resetTestingModule();
    userState = jasmine.createSpyObj('UserStateService', [
      'isContabilidadInCompany',
      'isTesoreria',
      'isAdminInCompany',
    ]);
    userState.isContabilidadInCompany.and.returnValue(role === 'contabilidad');
    userState.isTesoreria.and.returnValue(role === 'tesoreria');
    userState.isAdminInCompany.and.returnValue(role === 'admin');
    router = jasmine.createSpyObj('Router', ['navigate']);
    queryParamMap$ = of({ get: (key: string) => (key === 'tab' ? initialTab : null) });

    TestBed.configureTestingModule({
      imports: [RendicionesTabsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParamMap$ } },
        { provide: Router, useValue: router },
        { provide: UserStateService, useValue: userState },
      ],
    });

    component = TestBed.createComponent(RendicionesTabsComponent).componentInstance;
  }

  beforeEach(() => setup());

  it('creates with the default "rendiciones" tab', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe('rendiciones');
  });

  describe('visibilidad de la pestaña Caja Chica', () => {
    it('la ven Contabilidad, Tesorería y Administrador', () => {
      for (const role of ['contabilidad', 'tesoreria', 'admin'] as const) {
        setup(null, role);
        expect(component.showCajaChicaTab()).toBeTrue();
      }
    });

    it('no la ve un aprobador (no tiene nada que aprobar ahí)', () => {
      setup(null, 'aprobador');
      expect(component.showCajaChicaTab()).toBeFalse();
    });
  });

  describe('ngOnInit tab resolution', () => {
    it('activates "directas" when the query param requests it', () => {
      setup('directas');
      component.ngOnInit();
      expect(component.activeTab()).toBe('directas');
    });

    it('activa "directas" para Tesorería y para un aprobador', () => {
      for (const role of ['tesoreria', 'aprobador'] as const) {
        setup('directas', role);
        component.ngOnInit();
        expect(component.activeTab()).toBe('directas');
      }
    });

    it('activates "caja-chica" when the query param requests it', () => {
      setup('caja-chica');
      component.ngOnInit();
      expect(component.activeTab()).toBe('caja-chica');
    });

    it('activates "caja-chica" for Tesorería too', () => {
      setup('caja-chica', 'tesoreria');
      component.ngOnInit();
      expect(component.activeTab()).toBe('caja-chica');
    });

    it('ignora ?tab=caja-chica en un aprobador, que no tiene esa pestaña', () => {
      setup('caja-chica', 'aprobador');
      component.ngOnInit();
      expect(component.activeTab()).toBe('rendiciones');
    });

    it('falls back to "rendiciones" for an unrecognized tab param', () => {
      setup('unknown');
      component.ngOnInit();
      expect(component.activeTab()).toBe('rendiciones');
    });
  });

  describe('setTab', () => {
    it('navigates without query params for the default tab', () => {
      component.setTab('rendiciones');
      expect(router.navigate).toHaveBeenCalledWith(['/rendiciones'], { queryParams: {}, replaceUrl: true });
    });

    it('navigates with a tab query param for non-default tabs', () => {
      component.setTab('directas');
      expect(router.navigate).toHaveBeenCalledWith(['/rendiciones'], { queryParams: { tab: 'directas' }, replaceUrl: true });
    });
  });
});
