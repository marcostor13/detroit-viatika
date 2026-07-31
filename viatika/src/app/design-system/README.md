# Design system

Toda pantalla nueva o editada se construye exclusivamente con estos componentes. Ver la regla completa en `CLAUDE.md` → "UI Kit". Si un patrón se repite en 2+ pantallas y ningún componente lo cubre, se construye el componente antes de seguir copiando el patrón.

## Tokens

Fuente única de verdad: `tailwind.config.js`. No declarar colores en otro lado (ni hex sueltos, ni Sass, ni CSS vars nuevas).

- Marca: `primary`, `accent`, `secondary`, `tertiary`, `quaternary`, `background`, `divider`
- Neutros de texto: `ink-900` / `ink-700` / `ink-500` / `ink-300` / `ink-100` — usar en vez de `gray-*`
- Semánticos: `success` / `warning` / `error` para fondos e íconos; `success-ink` / `warning-ink` / `error-ink` para **texto** sobre fondos claros (los tokens base no pasan contraste AA como texto pequeño)
- Radio: Tailwind por defecto (`sm`/`md`/`lg`) + overrides de marca `xl` (20px) / `2xl` (30px) / `3xl` (40px)
- Sombra: `shadow-soft` (`0 2px 4px rgba(0,0,0,.05)`)

## Componentes

### `app-button`
```html
<app-button label="Guardar" variant="primary" size="md" (clicked)="onSave()" />
<app-button label="Cancelar" variant="secondary" (clicked)="onCancel()" />
```
`variant`: `primary | secondary | ghost | danger`. `size`: `sm | md | lg`. `disabled`, `fullWidth`, `loading` + `loadingLabel`, `type`.

### `app-input`
```html
<app-input
  label="Correo"
  type="email"
  [(value)]="email"
  [error]="emailError"
  helperText="Usa tu correo corporativo"
  required
/>
```
Implementa `ControlValueAccessor` (funciona con `[(value)]`, `formControlName` o `ngModel`). Ya trae label/error asociados por `id`/`for`/`aria-describedby` — no envolver en `app-form-field`.

### `app-form-field`
Wrapper de label + error/help para **cualquier control que no sea `app-input`**: `<select>`, checkbox, radio, date picker, `app-project-select`, `app-worker-select`. El control proyectado debe enlazar `fieldId` y `describedBy()` él mismo:
```html
<app-form-field #field label="Proyecto" [error]="projectError" required>
  <app-project-select
    [id]="field.fieldId"
    [attr.aria-describedby]="field.describedBy()"
    [projects]="projects"
    [(ngModel)]="projectId"
  />
</app-form-field>
```

### `app-card`
```html
<app-card variant="default" padding="md">
  <h3>Resumen</h3>
  ...
</app-card>
```
`variant`: `default | elevated | outlined`. `padding`: `none | sm | md | lg`. `hover` (default `true`) agrega elevación al pasar el mouse — poner `[hover]="false"` en tarjetas no interactivas (paneles de solo lectura).

### `app-modal`
```html
<app-modal [open]="showConfirm" title="Eliminar rendición" size="sm" (closed)="showConfirm = false">
  <p>Esta acción no se puede deshacer.</p>
  <div class="flex justify-end gap-2 mt-4">
    <app-button label="Cancelar" variant="secondary" (clicked)="showConfirm = false" />
    <app-button label="Eliminar" variant="danger" (clicked)="confirmDelete()" />
  </div>
</app-modal>
```
Maneja foco (trap + restore al cerrar), cierre con Escape y overlay unificado. `size`: `sm | md | lg | xl`. `closeOnBackdrop` (default `true`).

### `app-badge`
```html
<app-badge variant="warning" dot>Pendiente L2</app-badge>
<app-badge variant="success">Pagado</app-badge>
```
`variant`: `neutral | info | success | warning | error`. `size`: `sm | md`. Usar para todo estado de rendición/anticipo/comprobante — nunca un `text-color` suelto para indicar estado.

### `app-tabs`
```ts
tabs = [
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'aprobados', label: 'En pago' },
  { value: 'devoluciones', label: 'Devoluciones', badge: pendingReturns.length },
];
```
```html
<app-tabs [tabs]="tabs" [(active)]="activeTab" />
```
Navegación con flechas/Home/End integrada (`role="tablist"`/`role="tab"` con roving tabindex).

### `app-icon`
```html
<app-icon name="trash" size="sm" class="text-error" />
<app-icon name="bell" size="md" />
```
`size`: `sm` (18px) / `md` (22px, default) / `lg` (28px). El color se hereda de la clase `text-*` puesta en el propio `<app-icon>` (Lucide usa `stroke="currentColor"`). Decorativo por defecto (`aria-hidden`); pasar `label` solo si el ícono es funcional y no está dentro de un control con su propio `aria-label`. Nombres disponibles: ver el mapa `ICONS` en `icon.component.ts` — agregar ahí los que falten, nunca pegar un `<svg>` a mano.

### `app-empty-state`
```html
<app-empty-state icon="receipt" title="Sin rendiciones" description="Crea tu primera rendición para empezar.">
  <app-button label="Nueva rendición" (clicked)="goToNew()" />
</app-empty-state>
```

### `app-data-table`
```html
<app-data-table [items]="rows" trackKey="_id" [rowClickable]="true" (rowClick)="openDetail($event.row)">
  <ng-container *appColumn="'Fecha'; let row">{{ row.date | date }}</ng-container>
  <ng-container *appColumn="'Monto'; let row; align: 'right'">{{ row.amount | currency }}</ng-container>
  <ng-container *appColumn="'Notas'; let row; detail: true">{{ row.notes }}</ng-container>
</app-data-table>
```
Sin `minWidth`, la tabla se ajusta al contenedor (celdas envuelven texto) en vez de forzar scroll horizontal — preferible en pantallas nuevas para que el móvil no quede cortado. Columnas marcadas `detail: true` se agrupan en una fila expandible.

### `app-paginator`
```html
<app-paginator [total]="total" [page]="page" [pages]="totalPages" [limit]="limit"
  (pageChange)="onPageChange($event)" (limitChange)="onLimitChange($event)" />
```

### `app-export-button`
```html
<app-export-button (exportClicked)="onExport($event)" />
```
Emite `'excel' | 'pdf'`.

### `app-project-select` / `app-worker-select`
Reemplazos de `<select>` con buscador integrado, ambos `ControlValueAccessor`:
```html
<app-project-select [projects]="projects" [(ngModel)]="projectId" [invalid]="!!projectError" />
<app-worker-select [workers]="workers" [(ngModel)]="workerId" placeholder="Seleccione un colaborador…" />
```

## Íconos: por qué Lucide

La plataforma no tenía librería de íconos — 65 archivos con SVG de Heroicons pegado a mano, en 3 tamaños distintos para el mismo ícono conceptual. `app-icon` reemplaza eso con Lucide (`@lucide/angular`): trazo uniforme de 2px, tree-shakeable, y un único punto de control de tamaño/color. La migración de los SVG existentes es progresiva (ver plan de UI kit) — no reemplazar todo de una vez.
