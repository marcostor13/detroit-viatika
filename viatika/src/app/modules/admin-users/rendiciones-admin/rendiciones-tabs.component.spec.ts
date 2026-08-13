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

  function setup(initialTab: string | null = null, role: 'contabilidad' | 'tesoreria' | 'otro' = 'contabilidad') {
    TestBed.resetTestingModule();
    userState = jasmine.createSpyObj('UserStateService', ['isContabilidadInCompany', 'isTesoreria']);
    userState.isContabilidadInCompany.and.returnValue(role === 'contabilidad');
    userState.isTesoreria.and.returnValue(role === 'tesoreria');
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

  describe('visibilidad de pestañas', () => {
    it('Contabilidad con empresa activa ve directas y caja chica', () => {
      setup(null, 'contabilidad');
      expect(component.showDirectasTab()).toBeTrue();
      expect(component.showCajaChicaTab()).toBeTrue();
      expect(component.showExtraTabs()).toBeTrue();
    });

    it('Tesorería ve directas (las cierra) pero no caja chica', () => {
      setup(null, 'tesoreria');
      expect(component.showDirectasTab()).toBeTrue();
      expect(component.showCajaChicaTab()).toBeFalse();
      expect(component.showExtraTabs()).toBeTrue();
    });

    it('el resto de roles no ve pestañas extra', () => {
      setup(null, 'otro');
      expect(component.showDirectasTab()).toBeFalse();
      expect(component.showCajaChicaTab()).toBeFalse();
      expect(component.showExtraTabs()).toBeFalse();
    });
  });

  describe('ngOnInit tab resolution', () => {
    it('activates "directas" when the query param requests it', () => {
      setup('directas');
      component.ngOnInit();
      expect(component.activeTab()).toBe('directas');
    });

    it('activates "directas" for Tesorería too', () => {
      setup('directas', 'tesoreria');
      component.ngOnInit();
      expect(component.activeTab()).toBe('directas');
    });

    it('activates "caja-chica" when the query param requests it', () => {
      setup('caja-chica');
      component.ngOnInit();
      expect(component.activeTab()).toBe('caja-chica');
    });

    it('ignora un ?tab= que el usuario no tiene habilitado', () => {
      setup('caja-chica', 'tesoreria');
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
