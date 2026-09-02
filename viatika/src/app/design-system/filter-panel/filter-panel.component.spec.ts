import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilterPanelComponent } from './filter-panel.component';

describe('FilterPanelComponent', () => {
  let component: FilterPanelComponent;
  let fixture: ComponentFixture<FilterPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilterPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FilterPanelComponent);
    component = fixture.componentInstance;
  });

  it('should be created', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // El caso que motiva el componente: entrar a la pantalla y ver la lista, no
  // seis campos de filtro.
  it('should start collapsed when nothing is filtered', () => {
    fixture.detectChanges();
    expect(component.open()).toBeFalse();
    expect(fixture.nativeElement.querySelector('#filter-panel-body').classList).toContain('hidden');
  });

  // Los listados recuerdan los filtros: si la lista llega acotada hay que poder
  // ver por que sin cazar el boton.
  it('should start expanded when it opens with filters already applied', () => {
    fixture.componentRef.setInput('activeCount', 2);
    fixture.detectChanges();
    expect(component.open()).toBeTrue();
    expect(fixture.nativeElement.querySelector('#filter-panel-body').classList).not.toContain('hidden');
  });

  // Abrirse/cerrarse solo al cambiar el numero de filtros haria saltar el panel
  // bajo el dedo mientras se filtra.
  it('should not reopen itself when filters change after the first render', () => {
    fixture.detectChanges();
    fixture.componentRef.setInput('activeCount', 3);
    fixture.detectChanges();
    expect(component.open()).toBeFalse();
  });

  it('should toggle on the mobile button', () => {
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    expect(component.open()).toBeTrue();
  });

  it('should keep the grid visible from md up regardless of the toggle', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#filter-panel-body').classList).toContain('md:block');
  });

  it('should only offer "Limpiar" when something is filtered', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Limpiar');

    fixture.componentRef.setInput('activeCount', 1);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Limpiar');
  });

  it('should emit cleared from the "Limpiar" button', () => {
    fixture.componentRef.setInput('activeCount', 1);
    fixture.detectChanges();
    const spy = jasmine.createSpy('cleared');
    component.cleared.subscribe(spy);

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    buttons.find(b => b.textContent?.includes('Limpiar'))!.click();

    expect(spy).toHaveBeenCalled();
  });
});
