import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IconComponent } from './icon.component';

describe('IconComponent', () => {
  let component: IconComponent;
  let fixture: ComponentFixture<IconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(IconComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('name', 'home');
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('default inputs', () => {
    it('should default size to md', () => {
      expect(component.size()).toBe('md');
    });

    it('should default strokeWidth to 2', () => {
      expect(component.strokeWidth()).toBe(2);
    });
  });

  describe('iconInputs()', () => {
    it('should map size sm/md/lg to fixed pixel values', () => {
      expect(component.iconInputs().size).toBe(22);
      fixture.componentRef.setInput('size', 'sm');
      expect(component.iconInputs().size).toBe(18);
      fixture.componentRef.setInput('size', 'lg');
      expect(component.iconInputs().size).toBe(28);
      fixture.componentRef.setInput('size', 'xl');
      expect(component.iconInputs().size).toBe(48);
    });

    it('should leave title undefined when no label is set', () => {
      expect(component.iconInputs().title).toBeUndefined();
    });

    it('should forward label as title', () => {
      fixture.componentRef.setInput('label', 'Cerrar');
      expect(component.iconInputs().title).toBe('Cerrar');
    });
  });

  describe('iconType()', () => {
    it('should resolve a component type for a known icon name', () => {
      expect(component.iconType()).toBeTruthy();
    });

    it('should resolve a different type when name changes', () => {
      const homeType = component.iconType();
      fixture.componentRef.setInput('name', 'trash');
      expect(component.iconType()).not.toBe(homeType);
    });
  });

  describe('template', () => {
    it('should render an svg element', () => {
      const svg = fixture.nativeElement.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });
});
