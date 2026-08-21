import { Directive, HostBinding, HostListener, input, output } from '@angular/core';

/**
 * Arrastrar y soltar archivos sobre una zona de subida (VD-134).
 *
 * Es una DIRECTIVA y no un componente a propósito: las zonas de subida que ya
 * existen son cajas punteadas con su propio contenido (icono, textos, nombre del
 * archivo elegido, estados de error), distintas entre sí. Un componente
 * obligaría a reescribirlas; la directiva se cuelga de la caja que ya está y
 * solo añade el comportamiento.
 *
 *   <div appFileDrop (filesDropped)="onFiles($event)" accept=".pdf,.jpg">
 *
 * `dragging` se expone como clase en el host para que cada zona lo pinte con sus
 * propios colores en vez de imponerle un estilo desde aquí.
 */
@Directive({
  selector: '[appFileDrop]',
  standalone: true,
})
export class FileDropDirective {
  /**
   * Extensiones o MIME aceptados, en el mismo formato del `accept` de un input
   * de archivo (`.pdf,.jpg,image/*`). Vacío = se acepta cualquier cosa, igual
   * que un input sin `accept`.
   */
  accept = input<string>('');

  /** Deshabilita el arrastre sin tener que quitar la directiva del template. */
  fileDropDisabled = input<boolean>(false);

  /** Archivos soltados que pasaron el filtro de `accept`. Nunca vacío. */
  filesDropped = output<File[]>();

  /**
   * Se soltó algo, pero nada cumplía `accept`. Se emite aparte para que la
   * pantalla avise: si se ignorara en silencio, el usuario ve que no pasa nada
   * y no sabe si el arrastre no funciona o su archivo no servía.
   */
  filesRejected = output<File[]>();

  @HostBinding('class.is-dragging') dragging = false;

  /**
   * Contador de entradas/salidas. `dragleave` salta también al pasar sobre un
   * hijo de la caja (el icono, el texto), así que con un booleano el resaltado
   * parpadeaba mientras se movía el cursor por dentro.
   */
  private profundidad = 0;

  @HostListener('dragenter', ['$event'])
  onDragEnter(event: DragEvent): void {
    if (this.fileDropDisabled() || !this.tieneArchivos(event)) return;
    event.preventDefault();
    this.profundidad++;
    this.dragging = true;
  }

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    if (this.fileDropDisabled() || !this.tieneArchivos(event)) return;
    // Sin esto el navegador ABRE el archivo en la pestaña y se pierde el
    // formulario a medio llenar.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    if (this.fileDropDisabled()) return;
    event.preventDefault();
    this.profundidad = Math.max(0, this.profundidad - 1);
    if (this.profundidad === 0) this.dragging = false;
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    if (this.fileDropDisabled()) return;
    event.preventDefault();
    // El click de la caja abre el selector de archivos: sin parar la
    // propagación, soltar encima abría además el diálogo del sistema.
    event.stopPropagation();
    this.profundidad = 0;
    this.dragging = false;

    const archivos = Array.from(event.dataTransfer?.files ?? []);
    if (archivos.length === 0) return;

    const aceptados = archivos.filter(f => this.cumpleAccept(f));
    const rechazados = archivos.filter(f => !this.cumpleAccept(f));

    if (aceptados.length > 0) this.filesDropped.emit(aceptados);
    if (rechazados.length > 0) this.filesRejected.emit(rechazados);
  }

  /**
   * Arrastrar texto o un enlace también dispara los eventos de drag. Sin este
   * filtro la caja se resaltaba al pasar por encima seleccionando texto.
   */
  private tieneArchivos(event: DragEvent): boolean {
    const tipos = event.dataTransfer?.types;
    return !!tipos && Array.from(tipos).includes('Files');
  }

  /** Misma semántica que el `accept` de un input: extensión, MIME o `tipo/*`. */
  private cumpleAccept(file: File): boolean {
    const accept = this.accept().trim();
    if (!accept || accept === '*/*') return true;

    const nombre = file.name.toLowerCase();
    const mime = (file.type || '').toLowerCase();

    return accept
      .split(',')
      .map(x => x.trim().toLowerCase())
      .filter(Boolean)
      .some(regla => {
        if (regla.startsWith('.')) return nombre.endsWith(regla);
        if (regla.endsWith('/*')) return mime.startsWith(regla.slice(0, -1));
        return mime === regla;
      });
  }
}
