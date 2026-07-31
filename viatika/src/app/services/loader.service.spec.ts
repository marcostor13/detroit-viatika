import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { LoaderService } from './loader.service';

describe('LoaderService', () => {
  let service: LoaderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoaderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('isLoading returns false initially', () => {
    expect(service.isLoading()).toBeFalse();
  });

  it('show() causes loading$ to emit true after microtask', fakeAsync(() => {
    service.show();
    expect(service.isLoading()).toBeFalse();
    flushMicrotasks();
    expect(service.isLoading()).toBeTrue();
  }));

  it('hide() sets isLoading to false after 200ms debounce', fakeAsync(() => {
    service.show();
    flushMicrotasks();
    service.hide();
    expect(service.isLoading()).toBeTrue();
    tick(200);
    expect(service.isLoading()).toBeFalse();
  }));

  it('multiple show() calls require equal hide() calls before loading stops', fakeAsync(() => {
    service.show();
    service.show();
    flushMicrotasks();
    service.hide();
    tick(200);
    expect(service.isLoading()).toBeTrue();
    service.hide();
    tick(200);
    expect(service.isLoading()).toBeFalse();
  }));

  it('loading$ observable emits boolean values', fakeAsync(() => {
    const values: boolean[] = [];
    service.loading$.subscribe(v => values.push(v));
    service.show();
    flushMicrotasks();
    service.hide();
    tick(200);
    expect(values).toContain(true);
    expect(values).toContain(false);
  }));
});
