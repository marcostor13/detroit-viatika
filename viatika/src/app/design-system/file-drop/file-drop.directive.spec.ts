import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FileDropDirective } from './file-drop.directive';

/** DragEvent falso: jsdom/Chrome headless no permite construir un DataTransfer real. */
function dragEvent(tipo: string, files: File[] = [], types = ['Files']): any {
  return {
    type: tipo,
    dataTransfer: { files, types, dropEffect: '' },
    preventDefault: jasmine.createSpy('preventDefault'),
    stopPropagation: jasmine.createSpy('stopPropagation'),
  };
}

const archivo = (nombre: string, mime = '') =>
  new File(['x'], nombre, { type: mime });

@Component({
  standalone: true,
  imports: [FileDropDirective],
  template: `<div
    appFileDrop
    [accept]="accept"
    [fileDropDisabled]="deshabilitado"
    (filesDropped)="aceptados = $event"
    (filesRejected)="rechazados = $event"
  ></div>`,
})
class HostComponent {
  accept = '.pdf,image/*';
  deshabilitado = false;
  aceptados: File[] | null = null;
  rechazados: File[] | null = null;
}

describe('FileDropDirective (VD-134)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let dir: FileDropDirective;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    dir = fixture.debugElement
      .query(By.directive(FileDropDirective))
      .injector.get(FileDropDirective);
  });

  it('emite los archivos soltados', () => {
    dir.onDrop(dragEvent('drop', [archivo('factura.pdf', 'application/pdf')]));
    expect(host.aceptados?.map(f => f.name)).toEqual(['factura.pdf']);
    expect(host.rechazados).toBeNull();
  });

  /**
   * Sin `preventDefault` el navegador ABRE el archivo en la pestaña y se pierde
   * el formulario a medio llenar. Es el motivo de que exista el handler de
   * `dragover`, asi que se comprueba explicitamente.
   */
  it('evita que el navegador abra el archivo', () => {
    const ev = dragEvent('dragover');
    dir.onDragOver(ev);
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(ev.dataTransfer.dropEffect).toBe('copy');
  });

  // La caja abre el selector al hacer clic: sin parar la propagacion, soltar
  // encima abria ademas el dialogo del sistema.
  it('no deja que el drop dispare el clic de la zona', () => {
    const ev = dragEvent('drop', [archivo('a.pdf', 'application/pdf')]);
    dir.onDrop(ev);
    expect(ev.stopPropagation).toHaveBeenCalled();
  });

  it('separa lo que no cumple accept, en vez de tragarselo', () => {
    dir.onDrop(
      dragEvent('drop', [
        archivo('ok.pdf', 'application/pdf'),
        archivo('hoja.xlsx', 'application/vnd.ms-excel'),
      ])
    );
    expect(host.aceptados?.map(f => f.name)).toEqual(['ok.pdf']);
    expect(host.rechazados?.map(f => f.name)).toEqual(['hoja.xlsx']);
  });

  it('accept admite extension, MIME y comodin', () => {
    dir.onDrop(dragEvent('drop', [archivo('foto.PNG', 'image/png')]));
    expect(host.aceptados?.map(f => f.name)).toEqual(['foto.PNG']);
  });

  it('sin accept pasa cualquier archivo', () => {
    host.accept = '';
    fixture.detectChanges();
    dir.onDrop(dragEvent('drop', [archivo('cualquier.cosa')]));
    expect(host.aceptados?.length).toBe(1);
  });

  describe('resaltado', () => {
    /**
     * `dragleave` salta tambien al pasar sobre un hijo de la caja (el icono, el
     * texto). Con un booleano el resaltado parpadeaba al mover el cursor por
     * dentro; por eso se cuentan entradas y salidas.
     */
    it('no parpadea al pasar por encima de los hijos', () => {
      dir.onDragEnter(dragEvent('dragenter'));
      dir.onDragEnter(dragEvent('dragenter')); // entra en un hijo
      expect(dir.dragging).toBeTrue();

      dir.onDragLeave(dragEvent('dragleave')); // sale del hijo, sigue dentro
      expect(dir.dragging).toBeTrue();

      dir.onDragLeave(dragEvent('dragleave'));
      expect(dir.dragging).toBeFalse();
    });

    it('se apaga al soltar', () => {
      dir.onDragEnter(dragEvent('dragenter'));
      dir.onDrop(dragEvent('drop', [archivo('a.pdf', 'application/pdf')]));
      expect(dir.dragging).toBeFalse();
    });

    // Arrastrar texto o un enlace tambien dispara los eventos de drag.
    it('ignora lo que no son archivos', () => {
      dir.onDragEnter(dragEvent('dragenter', [], ['text/plain']));
      expect(dir.dragging).toBeFalse();
    });
  });

  it('deshabilitada no hace nada', () => {
    host.deshabilitado = true;
    fixture.detectChanges();
    dir.onDragEnter(dragEvent('dragenter'));
    dir.onDrop(dragEvent('drop', [archivo('a.pdf', 'application/pdf')]));
    expect(dir.dragging).toBeFalse();
    expect(host.aceptados).toBeNull();
  });
});
