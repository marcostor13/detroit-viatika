import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';

describe('ModalComponent', () => {
  let component: ModalComponent;
  let fixture: ComponentFixture<ModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ModalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('rendering', () => {
    it('should not render the dialog when closed', () => {
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    });

    it('should render the dialog when open', () => {
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
    });

    it('should render the title header only when a title is set', () => {
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('h2')).toBeNull();

      fixture.componentRef.setInput('title', 'Confirmar');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('h2')?.textContent.trim()).toBe('Confirmar');
    });
  });

  describe('sizeClasses()', () => {
    it('should default to md', () => {
      expect(component.sizeClasses()).toBe('max-w-lg');
    });

    it('should reflect size changes', () => {
      fixture.componentRef.setInput('size', 'xl');
      expect(component.sizeClasses()).toBe('max-w-4xl');
    });
  });

  describe('close()', () => {
    it('should emit closed', () => {
      spyOn(component.closed, 'emit');
      component.close();
      expect(component.closed.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('onEscape()', () => {
    it('should close when open', () => {
      fixture.componentRef.setInput('open', true);
      spyOn(component.closed, 'emit');
      component.onEscape();
      expect(component.closed.emit).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when already closed', () => {
      spyOn(component.closed, 'emit');
      component.onEscape();
      expect(component.closed.emit).not.toHaveBeenCalled();
    });
  });

  describe('onBackdropClick()', () => {
    it('should close by default', () => {
      spyOn(component.closed, 'emit');
      component.onBackdropClick();
      expect(component.closed.emit).toHaveBeenCalledTimes(1);
    });

    it('should not close when closeOnBackdrop is false', () => {
      fixture.componentRef.setInput('closeOnBackdrop', false);
      spyOn(component.closed, 'emit');
      component.onBackdropClick();
      expect(component.closed.emit).not.toHaveBeenCalled();
    });
  });
});
