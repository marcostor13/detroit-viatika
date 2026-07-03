import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IProject } from '../../modules/invoices/interfaces/project.interface';

/**
 * Selector de proyecto / centro de costo con buscador integrado.
 *
 * Implementa ControlValueAccessor para usarse como reemplazo directo de un
 * `<select formControlName="projectId">`. El valor expuesto es el `_id` del
 * proyecto seleccionado (string vacío cuando no hay selección).
 */
@Component({
  selector: 'app-project-select',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ProjectSelectComponent),
      multi: true,
    },
  ],
  templateUrl: './project-select.component.html',
})
export class ProjectSelectComponent implements ControlValueAccessor, OnDestroy {
  /** Lista de proyectos disponibles. */
  projects = input<IProject[]>([]);
  /** Texto que se muestra cuando no hay proyecto seleccionado. */
  placeholder = input<string>('Seleccione proyecto…');
  /** Permite no asignar proyecto (muestra una opción para limpiar la selección). */
  allowEmpty = input<boolean>(false);
  /** Etiqueta de la opción vacía cuando `allowEmpty` es true. */
  emptyLabel = input<string>('Sin asignar');
  /** Marca visual de error (borde rojo). */
  invalid = input<boolean>(false);
  /** Clases extra para el botón disparador. */
  triggerClass = input<string>('');

  private searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private triggerEl = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  selectedId = signal<string>('');
  open = signal<boolean>(false);
  search = signal<string>('');
  disabled = signal<boolean>(false);

  /**
   * Posición del panel en coordenadas de viewport. Se usa `position: fixed`
   * para que el desplegable no quede recortado por contenedores con overflow
   * (tarjetas, modales) y aparezca por encima de todo.
   */
  panelPos = signal<{ top: number; left: number; width: number; maxHeight: number; dropUp: boolean }>(
    { top: 0, left: 0, width: 0, maxHeight: 320, dropUp: false }
  );

  private readonly reposition = () => {
    if (this.open()) this.updatePosition();
  };

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private host: ElementRef<HTMLElement>) {}

  selectedProject = computed<IProject | null>(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.projects().find((p) => p._id === id) ?? null;
  });

  selectedLabel = computed<string>(() => {
    const p = this.selectedProject();
    return p ? this.projectLabel(p) : '';
  });

  filteredProjects = computed<IProject[]>(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.projects();
    return this.projects().filter((p) =>
      this.projectLabel(p).toLowerCase().includes(term)
    );
  });

  projectLabel(p: IProject): string {
    return p.code ? `${p.code} — ${p.name}` : p.name;
  }

  toggle(): void {
    if (this.disabled()) return;
    this.open() ? this.close() : this.openPanel();
  }

  openPanel(): void {
    this.search.set('');
    this.updatePosition();
    this.open.set(true);
    // Reposiciona al hacer scroll (en cualquier contenedor, de ahí el capture)
    // o al cambiar el tamaño de la ventana.
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    // El input se renderiza con @if; enfocamos en el siguiente tick.
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    this.onTouched();
  }

  /** Calcula la posición fija del panel a partir del botón disparador. */
  private updatePosition(): void {
    const btn = this.triggerEl()?.nativeElement;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    // Abre hacia arriba si abajo hay poco espacio y arriba hay más.
    const dropUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(360, Math.max(160, dropUp ? spaceAbove : spaceBelow));
    this.panelPos.set({
      top: dropUp ? rect.top : rect.bottom,
      left: rect.left,
      width: rect.width,
      maxHeight,
      dropUp,
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
  }

  pick(p: IProject): void {
    this.selectedId.set(p._id ?? '');
    this.onChange(this.selectedId());
    this.close();
  }

  clear(): void {
    this.selectedId.set('');
    this.onChange('');
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  // ControlValueAccessor
  writeValue(value: string | null): void {
    this.selectedId.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
