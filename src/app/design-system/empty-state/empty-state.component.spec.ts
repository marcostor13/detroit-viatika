import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  let component: EmptyStateComponent;
  let fixture: ComponentFixture<EmptyStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyStateComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyStateComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Sin resultados');
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('should default icon to search', () => {
    expect(component.icon()).toBe('search');
  });

  it('should render the title', () => {
    const title = fixture.nativeElement.querySelector('h3');
    expect(title.textContent.trim()).toBe('Sin resultados');
  });

  it('should not render a description paragraph when none is set', () => {
    expect(fixture.nativeElement.querySelector('p')).toBeNull();
  });

  it('should render the description when set', () => {
    fixture.componentRef.setInput('description', 'Intenta con otro filtro');
    fixture.detectChanges();
    const desc = fixture.nativeElement.querySelector('p');
    expect(desc.textContent.trim()).toBe('Intenta con otro filtro');
  });

  it('should render an icon', () => {
    expect(fixture.nativeElement.querySelector('svg')).toBeTruthy();
  });
});
