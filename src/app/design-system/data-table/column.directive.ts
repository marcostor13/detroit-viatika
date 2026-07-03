import { Directive, Input, TemplateRef } from '@angular/core';

/**
 * Define una columna para `<app-data-table>`. Es una directiva estructural: el
 * contenido marcado con `*appColumn` se captura como plantilla y la tabla lo
 * renderiza en la celda correspondiente.
 *
 * Uso:
 *   <ng-container *appColumn="'fecha'; header: 'Fecha'; align: 'left'; let row">
 *     {{ row.createdAt | date }}
 *   </ng-container>
 *
 * El contexto implícito (`let row`) es la fila actual; `let i = index` da el índice.
 */
@Directive({
  selector: '[appColumn]',
  standalone: true,
})
export class ColumnDirective {
  /** Clave única de la columna (también usada como track). */
  @Input('appColumn') key = '';

  /** Texto de cabecera (tabla) y etiqueta por defecto en card. */
  @Input('appColumnHeader') header = '';

  /** Alineación del contenido. */
  @Input('appColumnAlign') align: 'left' | 'center' | 'right' = 'left';

  /** Clases extra para la celda (td) y el contenedor en card. */
  @Input('appColumnCellClass') cellClass = '';

  /** Clases extra solo para la cabecera (th). */
  @Input('appColumnHeaderClass') headerClass = '';

  /**
   * Clases de visibilidad responsiva opcionales, p.ej. 'hidden md:table-cell'.
   * Por defecto vacío: la columna siempre se muestra y, al reducir la pantalla,
   * se accede mediante el scroll horizontal de la tabla.
   */
  @Input('appColumnHideOn') hideOn = '';

  /**
   * Si es `true`, la columna NO se muestra como columna fija de la tabla, sino
   * dentro del panel que se despliega al expandir la fila (chevron). Útil para
   * tablas con muchas columnas: las secundarias se marcan como detalle y la
   * tabla se ve completa sin scroll. Si ninguna columna es de detalle, la tabla
   * se comporta como una tabla normal (sin chevron).
   */
  @Input('appColumnDetail') detail = false;

  constructor(public tpl: TemplateRef<{ $implicit: any; index: number }>) {}

  // Permite el tipado del contexto de la plantilla en modo estricto.
  static ngTemplateContextGuard(
    _dir: ColumnDirective,
    _ctx: unknown,
  ): _ctx is { $implicit: any; index: number } {
    return true;
  }
}
