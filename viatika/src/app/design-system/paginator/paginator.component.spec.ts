import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginatorComponent } from './paginator.component';

describe('PaginatorComponent', () => {
  let component: PaginatorComponent;
  let fixture: ComponentFixture<PaginatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaginatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginatorComponent);
    component = fixture.componentInstance;
    // Default: 3 pages, on page 2, 20 items/page, 60 total
    component.total = 60;
    component.page = 2;
    component.pages = 3;
    component.limit = 20;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('hasPrev', () => {
    it('should be true when page > 1', () => {
      component.page = 2;
      expect(component.hasPrev).toBeTrue();
    });

    it('should be false when on page 1', () => {
      component.page = 1;
      expect(component.hasPrev).toBeFalse();
    });
  });

  describe('hasNext', () => {
    it('should be true when page < pages', () => {
      component.page = 2;
      component.pages = 3;
      expect(component.hasNext).toBeTrue();
    });

    it('should be false when on last page', () => {
      component.page = 3;
      component.pages = 3;
      expect(component.hasNext).toBeFalse();
    });
  });

  describe('pageNumbers', () => {
    it('should return pages around the current page (window of 5)', () => {
      component.page = 5;
      component.pages = 10;
      expect(component.pageNumbers).toEqual([3, 4, 5, 6, 7]);
    });

    it('should clamp at start', () => {
      component.page = 1;
      component.pages = 10;
      expect(component.pageNumbers).toEqual([1, 2, 3]);
    });

    it('should clamp at end', () => {
      component.page = 10;
      component.pages = 10;
      expect(component.pageNumbers).toEqual([8, 9, 10]);
    });

    it('should return all pages when total pages fits in window', () => {
      component.page = 2;
      component.pages = 3;
      expect(component.pageNumbers).toEqual([1, 2, 3]);
    });

    it('should return [1] for single page', () => {
      component.page = 1;
      component.pages = 1;
      expect(component.pageNumbers).toEqual([1]);
    });
  });

  describe('from / to', () => {
    it('should return 0 for from when total is 0', () => {
      component.total = 0;
      expect(component.from).toBe(0);
    });

    it('should calculate correct from value', () => {
      component.page = 2;
      component.limit = 20;
      component.total = 60;
      expect(component.from).toBe(21);
    });

    it('should calculate from=1 for first page', () => {
      component.page = 1;
      component.limit = 20;
      component.total = 60;
      expect(component.from).toBe(1);
    });

    it('should calculate correct to value', () => {
      component.page = 2;
      component.limit = 20;
      component.total = 60;
      expect(component.to).toBe(40);
    });

    it('should cap to at total on last page', () => {
      component.page = 3;
      component.limit = 20;
      component.total = 55;
      expect(component.to).toBe(55);
    });

    it('should return 0 for to when total is 0', () => {
      component.total = 0;
      component.page = 1;
      component.limit = 20;
      expect(component.to).toBe(0);
    });
  });

  describe('prev()', () => {
    it('should emit page - 1 when hasPrev', () => {
      component.page = 3;
      const emitted: number[] = [];
      component.pageChange.subscribe((p) => emitted.push(p));
      component.prev();
      expect(emitted).toEqual([2]);
    });

    it('should not emit when on page 1', () => {
      component.page = 1;
      const emitted: number[] = [];
      component.pageChange.subscribe((p) => emitted.push(p));
      component.prev();
      expect(emitted).toEqual([]);
    });
  });

  describe('next()', () => {
    it('should emit page + 1 when hasNext', () => {
      component.page = 2;
      component.pages = 5;
      const emitted: number[] = [];
      component.pageChange.subscribe((p) => emitted.push(p));
      component.next();
      expect(emitted).toEqual([3]);
    });

    it('should not emit when on last page', () => {
      component.page = 3;
      component.pages = 3;
      const emitted: number[] = [];
      component.pageChange.subscribe((p) => emitted.push(p));
      component.next();
      expect(emitted).toEqual([]);
    });
  });

  describe('goTo()', () => {
    it('should emit the given page number', () => {
      const emitted: number[] = [];
      component.pageChange.subscribe((p) => emitted.push(p));
      component.goTo(4);
      expect(emitted).toEqual([4]);
    });
  });

  describe('changeLimit()', () => {
    it('should emit the new limit via limitChange', () => {
      const emitted: number[] = [];
      component.limitChange.subscribe((v) => emitted.push(v));
      const event = { target: { value: '50' } } as unknown as Event;
      component.changeLimit(event);
      expect(emitted).toEqual([50]);
    });

    it('should reset to page 1 via pageChange when limit changes', () => {
      const pages: number[] = [];
      component.pageChange.subscribe((p) => pages.push(p));
      const event = { target: { value: '50' } } as unknown as Event;
      component.changeLimit(event);
      expect(pages).toContain(1);
    });
  });
});
