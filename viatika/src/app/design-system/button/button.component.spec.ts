import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ButtonComponent } from './button.component';

describe('ButtonComponent', () => {
  let component: ButtonComponent;
  let fixture: ComponentFixture<ButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ButtonComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ButtonComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('label', 'Click me');
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('default inputs', () => {
    it('should default variant to primary', () => {
      expect(component.variant()).toBe('primary');
    });

    it('should default size to md', () => {
      expect(component.size()).toBe('md');
    });

    it('should default disabled to false', () => {
      expect(component.disabled()).toBeFalse();
    });

    it('should default fullWidth to false', () => {
      expect(component.fullWidth()).toBeFalse();
    });

    it('should default type to button', () => {
      expect(component.type()).toBe('button');
    });
  });

  describe('buttonClasses()', () => {
    it('should contain base classes', () => {
      const classes = component.buttonClasses();
      expect(classes).toContain('font-medium');
      expect(classes).toContain('transition-all');
      expect(classes).toContain('flex');
      expect(classes).toContain('items-center');
    });

    it('should contain primary variant classes by default', () => {
      expect(component.buttonClasses()).toContain('bg-primary');
    });

    it('should contain secondary variant classes when set', () => {
      fixture.componentRef.setInput('variant', 'secondary');
      expect(component.buttonClasses()).toContain('border-divider');
    });

    it('should contain ghost variant classes when set', () => {
      fixture.componentRef.setInput('variant', 'ghost');
      expect(component.buttonClasses()).toContain('bg-transparent');
    });

    it('should contain danger variant classes when set', () => {
      fixture.componentRef.setInput('variant', 'danger');
      expect(component.buttonClasses()).toContain('bg-error');
    });

    it('should contain success variant classes when set', () => {
      fixture.componentRef.setInput('variant', 'success');
      expect(component.buttonClasses()).toContain('bg-success');
    });

    it('should contain md size classes by default', () => {
      expect(component.buttonClasses()).toContain('h-[42px]');
    });

    it('should contain sm size classes when set', () => {
      fixture.componentRef.setInput('size', 'sm');
      expect(component.buttonClasses()).toContain('h-9');
    });

    it('should contain lg size classes when set', () => {
      fixture.componentRef.setInput('size', 'lg');
      expect(component.buttonClasses()).toContain('h-12');
    });

    it('should include w-full when fullWidth is true', () => {
      fixture.componentRef.setInput('fullWidth', true);
      expect(component.buttonClasses()).toContain('w-full');
    });

    it('should not include w-full when fullWidth is false', () => {
      expect(component.buttonClasses()).not.toContain('w-full');
    });
  });

  describe('onClick()', () => {
    it('should emit clicked when not disabled', () => {
      spyOn(component.clicked, 'emit');
      component.onClick();
      expect(component.clicked.emit).toHaveBeenCalledTimes(1);
    });

    it('should not emit clicked when disabled', () => {
      fixture.componentRef.setInput('disabled', true);
      spyOn(component.clicked, 'emit');
      component.onClick();
      expect(component.clicked.emit).not.toHaveBeenCalled();
    });

    it('should emit clicked when button element is clicked and not disabled', () => {
      spyOn(component.clicked, 'emit');
      const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      btn.click();
      expect(component.clicked.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('template', () => {
    it('should render the label text', () => {
      const span = fixture.nativeElement.querySelector('span');
      expect(span.textContent.trim()).toBe('Click me');
    });

    it('should set button type attribute', () => {
      fixture.componentRef.setInput('type', 'submit');
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('button');
      expect(btn.type).toBe('submit');
    });

    it('should disable the button when disabled input is true', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      expect(btn.disabled).toBeTrue();
    });
  });
});
