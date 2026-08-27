import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';

import { InputComponent } from './input.component';

@Component({
  standalone: true,
  imports: [InputComponent],
  template: `
    <app-input label="Serie" />
    <app-input label="Fecha de emisión" type="date" />
    <app-input label="Total" type="number" />
  `,
})
class HostComponent {}

describe('InputComponent', () => {
  /**
   * `@tailwindcss/forms` estiliza por atributo (`[type=date]`, `[type=number]`)
   * sin nombre de etiqueta, y el `type` del componente queda escrito en el host.
   * Sin el reset del `:host`, `<app-input type="date">` matcheaba esas reglas y
   * dibujaba un segundo borde alrededor de la etiqueta y del campo.
   */
  it('no pinta borde en el host, tenga o no un type explícito', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const hosts: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('app-input')
    );
    expect(hosts.length).toBe(3);
    hosts.forEach((host) => {
      expect(getComputedStyle(host).borderTopWidth).toBe('0px');
    });
  });

  it('deja el borde en el input real, no en el host', () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const input: HTMLInputElement =
      fixture.nativeElement.querySelector('app-input input');
    expect(getComputedStyle(input).borderTopWidth).toBe('1px');
  });
});
