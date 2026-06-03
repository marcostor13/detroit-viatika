# Plan de desarrollo por fases — Viátika

**Fuente de alcance:** [Funcionalidades.md](./Funcionalidades.md) — Sección 4 *Alcance funcional detallado por fases* y reglas/transversales citadas en el mismo documento.

**Objetivo:** Ordenar entregas de desarrollo respetando las fases del documento de alcance y las dependencias entre módulos.

---

## Visión general

El alcance está organizado en **10 fases funcionales**. El desarrollo debe seguir este orden **salvo trabajo paralelo** en aspectos transversal (SMTP, librería PDF, logs), integrándolos cuando cada fase lo exija.

| Fase | Nombre (documento) |
|:----:|---------------------|
| 1 | Configuración inicial |
| 2 | Solicitud de viáticos |
| 3 | Aprobación de viáticos |
| 4 | Gestión de pago por tesorería |
| 5 | Ingreso y validación de gastos |
| 6 | Reembolsos |
| 7 | Devolución de saldos |
| 8 | Cierre definitivo |
| 9 | Reembolso directo |
| 10 | Caja chica |

---

## Fase 1 — Configuración inicial

**Referencia:** Funcionalidades.md — FASE 1 (apartados 1.1 a 1.6).

| Orden | Entregable |
|:-----:|------------|
| 1.1 | CRUD centros de costo: código único, nombre proyecto, nombre cliente; formato en selectores `[Código - Proyecto - Cliente]`; validación de unicidad. |
| 1.2 | Carga masiva Excel de centros de costo: plantilla, columnas requeridas, detección de duplicados, reporte de errores, reintento corregido. |
| 1.3 | CRUD categorías de gasto con límite en soles; validación de tope; alerta al 90% del límite. |
| 1.4 | Carga masiva de usuarios: plantilla, tipos de contrato, coordinador opcional, duplicados por documento/email, contraseña temporal y cambio en primer login. |
| 1.5 | Gestión de usuarios en web: CRUD, permisos granulares (checkboxes), campos adicionales (fecha creación, estado, último acceso), búsqueda y filtros. |
| 1.6 | Registro de firma digital en perfil; validación de archivo; almacenamiento seguro; bloqueo de funcionalidades transaccionales hasta registrar firma. |

**Dependencia:** Sin Fase 1 no hay datos maestros ni control de acceso alineado al documento.

---

## Fase 2 — Solicitud de viáticos

**Referencia:** Funcionalidades.md — FASE 2.

- Formulario del colaborador: lugar con autocompletado/geolocalización, fechas (fin ≥ inicio), centro de costo, tabla dinámica por categoría con totales calculados, observaciones opcionales.
- Notificación automática al coordinador asignado al enviar la solicitud (contenido y registro de envío según documento).

**Depende de:** centros de costo y categorías; usuarios y asignación de coordinador; firma digital si se aplica el bloqueo transaccional antes de operar.

**Implementación en código (referencia):** Backend — `POST /advance` con cuerpo extendido (lugar, fechas, proyecto, líneas, observaciones), validación de totales y firma; correo al coordinador + `coordinatorNotification`. Frontend — modal «Solicitud de viáticos» (Mis rendiciones y detalle de rendición con Places y tabla por categoría); campo coordinador en alta/edición de usuario colaborador.

---

## Fase 3 — Aprobación de viáticos

**Referencia:** Funcionalidades.md — FASE 3.

- Rechazo con observación obligatoria (mínimo caracteres según documento), estado rechazado, notificación al colaborador, re-edición con historial.
- Aprobación con registro de usuario y momento; notificación a contabilidad (prioridad urgente si fecha inicio es hoy o mañana); datos obligatorios del solicitante y del aprobador; **registro de compromiso presupuestal** en el centro de costo.

**Depende de:** Fase 2 y motor de notificaciones mínimo viable.

---

## Fase 4 — Gestión de pago por tesorería

**Referencia:** Funcionalidades.md — FASE 4.

- Registro de comprobante de pago por usuario con permiso contabilidad; validación de archivo; acción que marca estado **Pagado**, adjunta comprobante y **activa el módulo de gastos** para el colaborador.
- Notificación a colaborador y coordinador con PDF adjunto y enlace para registrar gastos.

**Depende de:** solicitud en estado aprobado; capacidad básica de adjuntos/PDF según especificación.

---

## Fase 5 — Ingreso y validación de gastos

**Referencia:** Funcionalidades.md — FASE 5 y reglas asociadas en sección 5 del documento.

Orden lógico sugerido de construcción:

1. Habilitar UI de registro de gastos cuando la solicitud está **Pagado**; estado de rendición visible en panel del colaborador.
2. Registro de comprobantes: factura electrónica (OCR + validación SUNAT), planilla de movilidad (GPS, correlativo, PDF), recibo de caja, comprobante de caja (correlativo por usuario, PDF plantilla).
3. Reglas de plazo de ingreso: carga normal / observado / bloqueo por cambio de mes (RN del documento).
4. Alertas y bloqueos por límite de categoría (90% no bloqueante, 100% bloqueante según documento).
5. Revisión en tiempo real por coordinador: listado, aprobar/rechazar con motivo, historial.
6. Cierre de rendición por colaborador (validaciones previas) → estado enviado para aprobación final; notificación al coordinador.
7. Aprobación final de rendición por coordinador (solo si todos los gastos están aprobados); rechazo con observación según documento.
8. Descarga de rendición completa en PDF (contenido según documento); firma digital incrustada **solo si estado Cerrado** (efecto completo al cerrar Fase 8).
9. Ampliación de plazo (coordinador) y solicitud de ampliación de presupuesto (colaborador, flujo vinculado 2→3→4).
10. Panel principal del colaborador (listado, columnas, filtros, accesos rápidos, badges de estado).
11. Declaración jurada (solo contabilidad): tipos, selección de comprobantes de caja, PDF, firma y auditoría.

**Depende de:** Fases 2–4; categorías y límites; integraciones SUNAT/OCR/geolocalización según prioridad (contemplar fallback si servicios externos fallan).

---

## Fase 6 — Reembolsos

**Referencia:** Funcionalidades.md — FASE 6.

- Cálculo de saldo a favor del colaborador; activación del flujo; notificación a contabilidad; registro de pago; estado **Reembolsado**; notificación con comprobante y documentos en “Mis documentos”.

**Depende de:** modelo de liquidación y estados de rendición definidos en Fase 5.

---

## Fase 7 — Devolución de saldos

**Referencia:** Funcionalidades.md — FASE 7.

- Saldo a favor de la empresa; notificación al colaborador con datos bancarios; carga de comprobante por colaborador; validación por contabilidad; estado **Devolución completada** y notificaciones finales.

**Depende de:** mismo modelo de estados y liquidación que Fase 6.

---

## Fase 8 — Cierre definitivo

**Referencia:** Funcionalidades.md — FASE 8.

- Acción de cierre exclusiva contabilidad cuando la rendición está aprobada y liquidación resuelta; validaciones pre-cierre; estado **Cerrado**; bloqueo total de ediciones; logs; habilitación definitiva de firma en PDFs y marca para auditoría.

**Depende de:** Fases 5–7 y reglas de inmutabilidad del documento.

---

## Fase 9 — Reembolso directo

**Referencia:** Funcionalidades.md — FASE 9.

- Coordinador crea reembolso directo (colaborador, concepto, monto estimado, centro de costo, urgencia); notificaciones a colaborador y contabilidad; flujo de registro de gastos y posteriores igual que desde Fase 5.

**Depende de:** Fase 5 en adelante; datos maestros de Fase 1.

---

## Fase 10 — Caja chica

**Referencia:** Funcionalidades.md — FASE 10.

- Apertura y fondeo mensual por contabilidad con comprobante y centro de costo; habilitación de “gastos caja chica” para colaboradores del centro.
- Registro de gastos sin aprobación individual por gasto; mismos tipos de comprobante que Fase 5; alertas 90%/100% sobre fondo mensual **sin bloqueo duro** según documento.
- Cierre mensual (fecha configurable), PDF resumen, arrastre de saldo al mes siguiente sin reembolsos/devoluciones por ese concepto.

**Depende de:** modelo de gastos/comprobantes (Fase 5) y centros de costo (Fase 1).

---

## Transversal / soporte (según Funcionalidades.md)

Implementación gradual recomendada:

| Área | Secciones del documento | Cuándo integrar |
|------|-------------------------|-----------------|
| Notificaciones y plantillas | §6.4, §7 | Desde Fase 2; ampliar con cada evento nuevo. |
| API SUNAT y OCR | §6.1, §6.2 | Fase 5 (priorizar factura/recibo); timeout y reintentos según documento. |
| Geolocalización y distancias | §6.3 | Fase 2 (lugar) y Fase 5 (movilidad). |
| Correlativos y generador PDF | §6.5, §9 | Fase 5 en adelante; firma según RN del documento al cerrar. |
| Reportes, dashboard, exportación | §8 | Tras flujo mínimo Fase 5 con datos reales o semilla. |
| Reglas de negocio RN | §5 | Validar por fase (presupuesto, plazos, estados, firma). |

---

## Criterios de uso del plan

1. No dar por cerrada una fase si falta el **contrato de API/datos** que la siguiente necesita (listados, estados, permisos).
2. Diseñar **estados de rendición y transiciones** de forma explícita antes de implementar solo el camino feliz (especialmente entre Fases 5–8).
3. Verificar entregas contra **criterios de aceptación** del documento (§10.1) cuando existan para el módulo entregado.

---

## Referencia cruzada

- Alcance funcional completo: [Funcionalidades.md](./Funcionalidades.md)
