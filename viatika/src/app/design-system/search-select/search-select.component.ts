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

/** Opción genérica del selector. `value` es lo que viaja al formulario. */
export interface SearchSelectOption {
  value: string;
  label: string;
  /** Segunda línea (cuenta contable, código, correo…) para diferenciar homónimos. */
  subLabel?: string;
  /** Texto extra que también entra en la búsqueda pero no se muestra. */
  searchText?: string;
}

/**
 * Selector genérico con buscador integrado.
 *
 * Misma mecánica que `ProjectSelectComponent` / `WorkerSelectComponent` (los dos
 * selectores con buscador que ya existían), pero sin atarse a una entidad: recibe
 * `options` ya mapeadas. Se usa donde la lista es larga y un `<select>` nativo
 * obliga a recorrerla a ojo — por ejemplo las ~53 categorías de Detroit.
 *
 * Implementa ControlValueAccessor, así que reemplaza directo a un
 * `<select formControlName="…">`; el valor expuesto es `option.value`
 * (string vacío cuando no hay selección).
 */
@Component({
  selector: 'app-search-select',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchSelectComponent),
      multi: true,
    },
  ],
  templateUrl: './search-select.component.html',
})
export class SearchSelectComponent implements ControlValueAccessor, OnDestroy {
  /** Opciones disponibles. */
  options = input<SearchSelectOption[]>([]);
  /** Texto que se muestra cuando no hay selección. */
  placeholder = input<string>('Seleccione una opción…');
  /** Placeholder del buscador dentro del panel. */
  searchPlaceholder = input<string>('Buscar…');
  /** Permite limpiar la selección (muestra una opción para dejarlo sin valor). */
  allowEmpty = input<boolean>(false);
  /** Etiqueta de la opción vacía cuando `allowEmpty` es true. */
  emptyLabel = input<string>('Sin asignar');
  /** Marca visual de error (borde rojo). */
  invalid = input<boolean>(false);
  /** Clases extra para el botón disparador. */
  triggerClass = input<string>('');

  private searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private triggerEl = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  selectedValue = signal<string>('');
  open = signal<boolean>(false);
  search = signal<string>('');
  disabled = signal<boolean>(false);

  /**
   * Posición del panel en coordenadas de viewport. Se usa `position: fixed`
   * para que el desplegable no quede recortado por contenedores con overflow.
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

  selectedOption = computed<SearchSelectOption | null>(() => {
    const value = this.selectedValue();
    if (!value) return null;
    return this.options().find((o) => o.value === value) ?? null;
  });

  selectedLabel = computed<string>(() => this.selectedOption()?.label ?? '');

  filteredOptions = computed<SearchSelectOption[]>(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.options();
    return this.options().filter((o) =>
      `${o.label} ${o.subLabel ?? ''} ${o.searchText ?? ''}`.toLowerCase().includes(term)
    );
  });

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

  pick(o: SearchSelectOption): void {
    this.selectedValue.set(o.value);
    this.onChange(this.selectedValue());
    this.close();
  }

  clear(): void {
    this.selectedValue.set('');
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
    this.selectedValue.set(value ?? '');
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
