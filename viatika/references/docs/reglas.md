# Contexto del Proyecto y Guía de Buenas Prácticas (Stack 2025)

Este documento define las reglas y mejores prácticas para el desarrollo de la plataforma. El asistente de IA debe adherirse estrictamente a estas directrices al generar o refactorizar código.

**Fecha de Contexto:** 16 de Noviembre de 2025

## 1. Stack Tecnológico Principal

- **Framework:** Angular v20
- **Estilos (CSS):** Tailwind CSS

## 2. 🚀 Angular v20: Mejores Prácticas (Oficial)

Angular 20 ha consolidado la reactividad basada en Signals y la arquitectura Standalone.

### 2.1. Arquitectura: Standalone APIs

- **Regla:** TODO el código (componentes, directivas, pipes) DEBE ser `standalone: true`.
- **Prohibido:** No se deben generar `NgModules` (`@NgModule`). La gestión de dependencias se realiza directamente en el array `imports` del componente.
- **Enrutamiento:** Usar `provideRouter` y `loadComponent` para el _lazy loading_ a nivel de componente de ruta.

### 2.2. Reactividad: Signals (Zoneless)

- **Regla:** La gestión del estado y la reactividad DEBEN basarse en Signals (`signal()`, `computed()`, `effect()`).
- **Prioridad:** Las aplicaciones deben configurarse como `zoneless`. No se debe depender de `zone.js` para la detección de cambios.
- **Estado:** Usar `signal()` para el estado mutable.
- **Estado Derivado:** Usar `computed()` para valores derivados.
- **Efectos Secundarios:** Usar `effect()` solo cuando sea estrictamente necesario para reaccionar a cambios de estado (ej. logging, sincronización con `localStorage`).

### 2.3. Plantillas (Templates)

- **Control Flow:** Usar la nueva sintaxis de control flow (`@if`, `@for`, `@switch`).
- **Prohibido:** No usar las directivas estructurales `*ngIf`, `*ngFor`, `*ngSwitch`.
- **Rendimiento:** Usar `@defer` (bloques diferidos) de forma extensiva para la carga diferida de componentes no críticos y mejorar el **INP** (Interaction to Next Paint) y **LCP** (Largest Contentful Paint).
- **Track en `@for`:** El `track` es obligatorio en `@for`. Usar siempre un identificador único.

### 2.4. Inyección de Dependencias (DI)

- **Regla:** Preferir la función `inject()` sobre la inyección en el constructor.
  - **Ejemplo:** `const myService = inject(MyService);`

### 2.5. Formularios

- **Regla:** Usar **Reactive Forms** con **Tipado Estricto** (Strictly Typed Reactive Forms).

### 2.6. Notificaciones y Errores

- Todo mensaje de éxito, error o información debe enviarse mediante `NotificationService` y mostrarse con el componente global `NotificationCenterComponent` (toasts).
- Evitar banners o mensajes incrustados para eventos transitorios; centralizar los avisos en los toasts para mantener consistencia visual y funcional.

---

## 3. 🎨 Tailwind CSS: Mejores Prácticas

Tailwind es nuestro framework de CSS _utility-first_.

- **Utility-First:** Escribir clases de utilidad directamente en el HTML (`.html`). Evitar la creación de clases CSS personalizadas (ej. `.mi-boton`).
- **`@apply` (Uso Restringido):** Usar `@apply` solo para extraer componentes de UI muy pequeños y repetitivos (ej. una clase base de botón) en un archivo CSS global. No usarlo para estilizar secciones o componentes completos.
- **Configuración (`tailwind.config.js`):**
  - Definir todos los _design tokens_ (colores, espaciado, tipografía, breakpoints) en `theme.extend`.
  - No usar valores "mágicos" (ej. `w-[123px]`). Si se necesita un valor, debe agregarse al `theme`.
- **JIT / Purge:** Asegurarse de que el motor JIT esté configurado para escanear todos los archivos `*.html` y `*.ts` para el _tree-shaking_ de estilos no utilizados.
- **Plugins:** Usar plugins oficiales (`@tailwindcss/forms`, `@tailwindcss/typography`) cuando sea necesario.

## 4. Reglas de lint

- Utiliza ng lint para linting del código.
- Usa ng lint --fix para corregir automáticamente los errores de lint.
- No ignores los errores de lint.
- Siempre corrige los errores de lint luego de cada cambio.
