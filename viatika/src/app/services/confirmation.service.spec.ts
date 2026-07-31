import { TestBed } from '@angular/core/testing';
import { ConfirmationService } from './confirmation.service';

describe('ConfirmationService', () => {
  let service: ConfirmationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConfirmationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initial state', () => {
    it('should start with default title', () => {
      expect(service.title()).toBe('Confirmación');
    });

    it('should start with empty message', () => {
      expect(service.message()).toBe('');
    });

    it('should start hidden', () => {
      expect(service.visible()).toBeFalse();
    });

    it('should start with no-op accept callback', () => {
      expect(() => service.acceptCallback()()).not.toThrow();
    });

    it('should start with no-op reject callback', () => {
      expect(() => service.rejectCallback()()).not.toThrow();
    });
  });

  describe('show()', () => {
    it('should set the message', () => {
      service.show('Are you sure?', () => {});
      expect(service.message()).toBe('Are you sure?');
    });

    it('should set visible to true', () => {
      service.show('Test', () => {});
      expect(service.visible()).toBeTrue();
    });

    it('should reset title to default', () => {
      service.show('Test', () => {});
      expect(service.title()).toBe('Confirmación');
    });

    it('should store the accept callback', () => {
      const spy = jasmine.createSpy('callback');
      service.show('Test', spy);
      service.acceptCallback()();
      expect(spy).toHaveBeenCalledOnceWith();
    });

    it('should reset reject callback to no-op', () => {
      service.show('Test', () => {});
      expect(() => service.rejectCallback()()).not.toThrow();
    });
  });

  describe('confirm()', () => {
    it('should set the message', () => {
      service.confirm({ message: 'Delete this?', accept: () => {} });
      expect(service.message()).toBe('Delete this?');
    });

    it('should set visible to true', () => {
      service.confirm({ message: 'Test', accept: () => {} });
      expect(service.visible()).toBeTrue();
    });

    it('should use provided title', () => {
      service.confirm({ title: 'My Title', message: 'Test', accept: () => {} });
      expect(service.title()).toBe('My Title');
    });

    it('should default to "Confirmación" when title is omitted', () => {
      service.confirm({ message: 'Test', accept: () => {} });
      expect(service.title()).toBe('Confirmación');
    });

    it('should store the accept callback', () => {
      const acceptSpy = jasmine.createSpy('accept');
      service.confirm({ message: 'Test', accept: acceptSpy });
      service.acceptCallback()();
      expect(acceptSpy).toHaveBeenCalledOnceWith();
    });

    it('should store the reject callback', () => {
      const rejectSpy = jasmine.createSpy('reject');
      service.confirm({ message: 'Test', accept: () => {}, reject: rejectSpy });
      service.rejectCallback()();
      expect(rejectSpy).toHaveBeenCalledOnceWith();
    });

    it('should use no-op reject callback when reject is omitted', () => {
      service.confirm({ message: 'Test', accept: () => {} });
      expect(() => service.rejectCallback()()).not.toThrow();
    });
  });

  describe('hide()', () => {
    it('should set visible to false', () => {
      service.show('Test', () => {});
      service.hide();
      expect(service.visible()).toBeFalse();
    });

    it('should clear the message', () => {
      service.show('Test', () => {});
      service.hide();
      expect(service.message()).toBe('');
    });

    it('should reset title to default', () => {
      service.confirm({ title: 'Custom', message: 'Test', accept: () => {} });
      service.hide();
      expect(service.title()).toBe('Confirmación');
    });

    it('should reset callbacks to no-ops', () => {
      service.show('Test', () => { throw new Error('should not call'); });
      service.hide();
      expect(() => service.acceptCallback()()).not.toThrow();
      expect(() => service.rejectCallback()()).not.toThrow();
    });

    it('should be idempotent when already hidden', () => {
      service.hide();
      expect(service.visible()).toBeFalse();
    });
  });

  describe('accept()', () => {
    it('should invoke the accept callback', () => {
      const spy = jasmine.createSpy('accept');
      service.show('Test', spy);
      service.accept();
      expect(spy).toHaveBeenCalledOnceWith();
    });

    it('should hide after accepting', () => {
      service.show('Test', () => {});
      service.accept();
      expect(service.visible()).toBeFalse();
    });

    it('should not throw when no callback is set', () => {
      expect(() => service.accept()).not.toThrow();
    });
  });

  describe('reject()', () => {
    it('should invoke the reject callback', () => {
      const spy = jasmine.createSpy('reject');
      service.confirm({ message: 'Test', accept: () => {}, reject: spy });
      service.reject();
      expect(spy).toHaveBeenCalledOnceWith();
    });

    it('should hide after rejecting', () => {
      service.show('Test', () => {});
      service.reject();
      expect(service.visible()).toBeFalse();
    });

    it('should not throw when no reject callback is set', () => {
      service.show('Test', () => {});
      expect(() => service.reject()).not.toThrow();
    });
  });

  describe('cancel()', () => {
    it('should hide the dialog', () => {
      service.show('Test', () => {});
      service.cancel();
      expect(service.visible()).toBeFalse();
    });

    it('should clear the message', () => {
      service.show('Cancel me', () => {});
      service.cancel();
      expect(service.message()).toBe('');
    });

    it('should not invoke accept or reject callbacks', () => {
      const acceptSpy = jasmine.createSpy('accept');
      const rejectSpy = jasmine.createSpy('reject');
      service.confirm({ message: 'Test', accept: acceptSpy, reject: rejectSpy });
      service.cancel();
      expect(acceptSpy).not.toHaveBeenCalled();
      expect(rejectSpy).not.toHaveBeenCalled();
    });

    it('should be idempotent when already hidden', () => {
      service.cancel();
      expect(service.visible()).toBeFalse();
    });
  });
});
