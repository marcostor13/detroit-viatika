import { Component, OnInit, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';

/**
 * Panel de filtros de una pantalla de listado.
 *
 * En escritorio es la tarjeta de siempre: la rejilla de campos siempre visible.
 * En movil se pliega detras de un boton "Filtros", porque seis campos apilados
 * ocupaban la pantalla entera y empujaban la lista —lo que el usuario viene a
 * ver— fuera del primer pantallazo. El boton lleva cuantos filtros hay puestos,
 * para que plegado no esconda que la lista esta acotada.
 *
 * Arranca desplegado si la pantalla ya venia filtrada (los listados recuerdan
 * los filtros del usuario entre visitas), para que nadie vea una lista acotada
 * sin poder ver por que. Despues manda lo que el usuario haya tocado: el estado
 * inicial se lee una sola vez, si no el panel se abriria solo al poner el primer
 * filtro y se cerraria al quitarlo, saltando bajo el dedo.
 */
@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './filter-panel.component.html',
  styleUrl: './filter-panel.component.scss',
})
export class FilterPanelComponent implements OnInit {
  /** Cuantos filtros tiene puestos el usuario. 0 = sin filtrar. */
  activeCount = input<number>(0);
  /** Texto del boton que pliega/despliega en movil. */
  label = input<string>('Filtros');

  /** Pedido de limpiar. El listado decide que significa. */
  cleared = output<void>();

  /** Desplegado en movil. En escritorio la rejilla se ve siempre. */
  readonly open = signal(false);

  ngOnInit(): void {
    this.open.set(this.activeCount() > 0);
  }

  toggle(): void {
    this.open.update(v => !v);
  }

  clear(): void {
    this.cleared.emit();
  }
}
