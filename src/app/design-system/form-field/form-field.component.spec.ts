import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormFieldComponent } from './form-field.component';

describe('FormFieldComponent', () => {
  let component: FormFieldComponent;
  let fixture: ComponentFixture<FormFieldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormFieldComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FormFieldComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('should give each instance a unique fieldId', () => {
    const other = TestBed.createComponent(FormFieldComponent).componentInstance;
    expect(component.fieldId).not.toBe(other.fieldId);
  });

  it('should derive errorId and helpId from fieldId', () => {
    expect(component.errorId).toBe(`${component.fieldId}-error`);
    expect(component.helpId).toBe(`${component.fieldId}-help`);
  });

  describe('describedBy()', () => {
    it('should be null with no error or helper text', () => {
      expect(component.describedBy()).toBeNull();
    });

    it('should point to helpId when only helper text is set', () => {
      fixture.componentRef.setInput('helperText', 'Formato: correo@empresa.com');
      expect(component.describedBy()).toBe(component.helpId);
    });

    it('should prefer errorId over helpId when both are set', () => {
      fixture.componentRef.setInput('helperText', 'Formato: correo@empresa.com');
      fixture.componentRef.setInput('error', 'Correo inválido');
      expect(component.describedBy()).toBe(component.errorId);
    });
  });

  describe('template', () => {
    it('should associate the label with fieldId via for', () => {
      fixture.componentRef.setInput('label', 'Correo');
      fixture.detectChanges();
      const label = fixture.nativeElement.querySelector('label');
      expect(label.getAttribute('for')).toBe(component.fieldId);
    });

    it('should render the error with role alert', () => {
      fixture.componentRef.setInput('error', 'Correo inválido');
      fixture.detectChanges();
      const error = fixture.nativeElement.querySelector('[role="alert"]');
      expect(error.textContent.trim()).toBe('Correo inválido');
    });
  });
});
