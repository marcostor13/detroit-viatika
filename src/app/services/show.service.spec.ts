import { TestBed } from '@angular/core/testing';
import { ShowService } from './show.service';
import { IMessageResponse } from '../interfaces/message.interface';

describe('ShowService', () => {
  let service: ShowService;

  const msg = { type: 'success', message: 'Done' } as unknown as IMessageResponse;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ShowService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('isShow returns false initially', () => {
    expect(service.isShow()).toBeFalse();
  });

  it('show() sets visible state and stores message', () => {
    service.show(msg);
    expect(service.isShow()).toBeTrue();
    expect(service.getMessage()).toEqual(msg);
  });

  it('hide() sets visible state to false', () => {
    service.show(msg);
    service.hide();
    expect(service.isShow()).toBeFalse();
  });

  it('show$ emits true after show()', (done) => {
    service.show$.subscribe(v => {
      if (v) { expect(v).toBeTrue(); done(); }
    });
    service.show(msg);
  });

  it('message$ emits the message after show()', (done) => {
    service.message$.subscribe(m => {
      if ((m as any).message) { expect(m).toEqual(msg); done(); }
    });
    service.show(msg);
  });
});
