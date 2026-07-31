import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabsComponent } from './tabs.component';

describe('TabsComponent', () => {
  let component: TabsComponent;
  let fixture: ComponentFixture<TabsComponent>;

  const tabs = [
    { value: 'pendientes', label: 'Pendientes' },
    { value: 'aprobados', label: 'En pago' },
    { value: 'devoluciones', label: 'Devoluciones', badge: 3 },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TabsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('tabs', tabs);
    fixture.componentRef.setInput('active', 'pendientes');
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('should render one tab button per item', () => {
    const buttons = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(buttons.length).toBe(3);
  });

  it('should mark only the active tab as aria-selected', () => {
    const buttons = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].getAttribute('aria-selected')).toBe('false');
  });

  describe('select()', () => {
    it('should update the active tab', () => {
      component.select('aprobados');
      expect(component.active()).toBe('aprobados');
    });
  });

  describe('onKeydown()', () => {
    function keyEvent(key: string): KeyboardEvent {
      return new KeyboardEvent('keydown', { key });
    }

    it('should move to the next tab on ArrowRight', () => {
      component.onKeydown(keyEvent('ArrowRight'), 0);
      expect(component.active()).toBe('aprobados');
    });

    it('should wrap around to the first tab on ArrowRight from the last', () => {
      component.onKeydown(keyEvent('ArrowRight'), 2);
      expect(component.active()).toBe('pendientes');
    });

    it('should move to the previous tab on ArrowLeft, wrapping to the last', () => {
      component.onKeydown(keyEvent('ArrowLeft'), 0);
      expect(component.active()).toBe('devoluciones');
    });

    it('should jump to the first tab on Home and last on End', () => {
      component.onKeydown(keyEvent('End'), 0);
      expect(component.active()).toBe('devoluciones');
      component.onKeydown(keyEvent('Home'), 2);
      expect(component.active()).toBe('pendientes');
    });
  });
});
