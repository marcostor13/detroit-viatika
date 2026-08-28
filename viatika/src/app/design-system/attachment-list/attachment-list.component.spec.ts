import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AttachmentListComponent } from './attachment-list.component';

@Component({
  standalone: true,
  imports: [AttachmentListComponent],
  template: `<app-attachment-list [urls]="urls" [heading]="heading" />`,
})
class HostComponent {
  urls: string[] = [];
  heading = '';
}

describe('AttachmentListComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const filas = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('sin adjuntos no pinta nada', () => {
    expect(filas().length).toBe(0);
    expect(texto().trim()).toBe('');
  });

  it('pinta una fila por adjunto, numerada y con el nombre del archivo', () => {
    host.urls = ['http://s3/uno.pdf', 'http://s3/boleta%20taxi.jpg'];
    fixture.detectChanges();

    expect(filas().length).toBe(2);
    expect(texto()).toContain('uno.pdf');
    expect(texto()).toContain('boleta taxi.jpg');
    expect(texto()).toContain('1');
    expect(texto()).toContain('2');
  });

  it('el encabezado lleva la cantidad delante', () => {
    host.urls = ['http://s3/uno.pdf', 'http://s3/dos.pdf'];
    host.heading = 'adjuntos de respaldo';
    fixture.detectChanges();

    expect(texto()).toContain('2 adjuntos de respaldo');
  });

  it('sin heading no pinta encabezado', () => {
    host.urls = ['http://s3/uno.pdf'];
    fixture.detectChanges();

    expect(texto()).not.toContain('adjuntos de respaldo');
  });

  // De uno en uno: abrir todos de golpe lo corta el bloqueador de emergentes.
  it('abre el adjunto en una pestaña nueva', () => {
    const open = spyOn(window, 'open');
    host.urls = ['http://s3/uno.pdf', 'http://s3/dos.pdf'];
    fixture.detectChanges();

    filas()[1].click();

    expect(open).toHaveBeenCalledOnceWith(
      'http://s3/dos.pdf',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
