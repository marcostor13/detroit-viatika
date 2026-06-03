import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    jasmine.clock().install();
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('should start with empty message', () => {
      expect(service.message.getValue()).toBe('');
    });

    it('should start with type success', () => {
      expect(service.type.getValue()).toBe('success');
    });

    it('should start hidden', () => {
      expect(service.visible.getValue()).toBeFalse();
    });
  });

  describe('show()', () => {
    it('should set the message', () => {
      service.show('Operation completed');
      expect(service.message.getValue()).toBe('Operation completed');
    });

    it('should default to success type', () => {
      service.show('Hello');
      expect(service.type.getValue()).toBe('success');
    });

    it('should set success type explicitly', () => {
      service.show('OK', 'success');
      expect(service.type.getValue()).toBe('success');
    });

    it('should set error type', () => {
      service.show('Failed', 'error');
      expect(service.type.getValue()).toBe('error');
    });

    it('should set warning type', () => {
      service.show('Caution', 'warning');
      expect(service.type.getValue()).toBe('warning');
    });

    it('should set visible to true', () => {
      service.show('Visible');
      expect(service.visible.getValue()).toBeTrue();
    });

    it('should update when called multiple times', () => {
      service.show('First', 'success');
      service.show('Second', 'error');
      expect(service.message.getValue()).toBe('Second');
      expect(service.type.getValue()).toBe('error');
    });

    it('should still be visible before 5000ms', () => {
      service.show('Test');
      jasmine.clock().tick(4999);
      expect(service.visible.getValue()).toBeTrue();
    });

    it('should auto-hide after 5000ms', () => {
      service.show('Auto hide');
      jasmine.clock().tick(5001);
      expect(service.visible.getValue()).toBeFalse();
    });
  });

  describe('hide()', () => {
    it('should set visible to false', () => {
      service.show('Test');
      service.hide();
      expect(service.visible.getValue()).toBeFalse();
    });

    it('should not affect message or type', () => {
      service.show('Keep me', 'error');
      service.hide();
      expect(service.message.getValue()).toBe('Keep me');
      expect(service.type.getValue()).toBe('error');
    });

    it('should be idempotent when already hidden', () => {
      service.hide();
      expect(service.visible.getValue()).toBeFalse();
    });
  });

  describe('isVisible()', () => {
    it('should return an observable', () => {
      const obs = service.isVisible();
      expect(typeof obs.subscribe).toBe('function');
    });

    it('should emit current visible state on subscribe', (done) => {
      service.isVisible().subscribe((v) => {
        expect(v).toBeFalse();
        done();
      });
    });

    it('should emit true after show()', () => {
      const values: boolean[] = [];
      service.isVisible().subscribe((v) => values.push(v));
      service.show('Now visible');
      expect(values).toContain(true);
    });

    it('should emit false after hide()', () => {
      const values: boolean[] = [];
      service.isVisible().subscribe((v) => values.push(v));
      service.show('Show then hide');
      service.hide();
      expect(values[values.length - 1]).toBeFalse();
    });
  });
});
