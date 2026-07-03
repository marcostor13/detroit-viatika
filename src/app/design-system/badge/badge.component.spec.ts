import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BadgeComponent } from './badge.component';

describe('BadgeComponent', () => {
  let component: BadgeComponent;
  let fixture: ComponentFixture<BadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BadgeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BadgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('default inputs', () => {
    it('should default variant to neutral', () => {
      expect(component.variant()).toBe('neutral');
    });

    it('should default size to md', () => {
      expect(component.size()).toBe('md');
    });

    it('should default dot to false', () => {
      expect(component.dot()).toBeFalse();
    });
  });

  describe('badgeClasses()', () => {
    it('should use readable -ink text tokens for semantic variants, not the raw base token', () => {
      fixture.componentRef.setInput('variant', 'success');
      expect(component.badgeClasses()).toContain('text-success-ink');

      fixture.componentRef.setInput('variant', 'warning');
      expect(component.badgeClasses()).toContain('text-warning-ink');

      fixture.componentRef.setInput('variant', 'error');
      expect(component.badgeClasses()).toContain('text-error-ink');
    });

    it('should apply sm size classes when set', () => {
      fixture.componentRef.setInput('size', 'sm');
      expect(component.badgeClasses()).toContain('text-[11px]');
    });
  });

  describe('dot rendering', () => {
    it('should not render a dot by default', () => {
      expect(fixture.nativeElement.querySelector('span > span')).toBeNull();
    });

    it('should render a dot when enabled', () => {
      fixture.componentRef.setInput('dot', true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('span > span')).toBeTruthy();
    });
  });
});
