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

/** Opción mínima de trabajador para el selector. */
export interface WorkerOption {
  _id: string;
  name?: string;
  email?: string;
  dni?: string;
}

/**
 * Selector de trabajador / colaborador con buscador integrado.
 *
 * Replica el patrón de `ProjectSelectComponent`: implementa ControlValueAccessor
 * y expone el `_id` del usuario seleccionado (string vacío cuando no hay selección).
 * Busca por nombre, correo o DNI.
 */
@Component({
  selector: 'app-worker-select',
  standalone: true,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => WorkerSelectComponent),
      multi: true,
    },
  ],
  templateUrl: './worker-select.component.html',
})
export class WorkerSelectComponent implements ControlValueAccessor, OnDestroy {
  /** Lista de trabajadores disponibles. */
  workers = input<WorkerOption[]>([]);
  /** Texto que se muestra cuando no hay selección. */
  placeholder = input<string>('Seleccione un trabajador…');
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

  panelPos = signal<{ top: number; left: number; width: number; maxHeight: number; dropUp: boolean }>(
    { top: 0, left: 0, width: 0, maxHeight: 320, dropUp: false }
  );

  private readonly reposition = () => {
    if (this.open()) this.updatePosition();
  };

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private host: ElementRef<HTMLElement>) {}

  selectedWorker = computed<WorkerOption | null>(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.workers().find((w) => w._id === id) ?? null;
  });

  selectedLabel = computed<string>(() => {
    const w = this.selectedWorker();
    return w ? this.workerLabel(w) : '';
  });

  filteredWorkers = computed<WorkerOption[]>(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.workers();
    return this.workers().filter((w) =>
      `${w.name ?? ''} ${w.email ?? ''} ${w.dni ?? ''}`.toLowerCase().includes(term)
    );
  });

  workerLabel(w: WorkerOption): string {
    return w.name?.trim() || w.email || w.dni || '—';
  }

  /** Línea secundaria (correo / DNI) para diferenciar homónimos. */
  workerSubLabel(w: WorkerOption): string {
    const parts = [w.dni ? `DNI ${w.dni}` : '', w.email || ''].filter(Boolean);
    return parts.join(' · ');
  }

  toggle(): void {
    if (this.disabled()) return;
    this.open() ? this.close() : this.openPanel();
  }

  openPanel(): void {
    this.search.set('');
    this.updatePosition();
    this.open.set(true);
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    setTimeout(() => this.searchInput()?.nativeElement.focus());
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    this.onTouched();
  }

  private updatePosition(): void {
    const btn = this.triggerEl()?.nativeElement;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
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

  pick(w: WorkerOption): void {
    this.selectedId.set(w._id ?? '');
    this.onChange(this.selectedId());
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
