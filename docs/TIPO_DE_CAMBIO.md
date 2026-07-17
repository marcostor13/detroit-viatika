# Moneda en viáticos

> Documento de referencia del soporte multi-moneda en la solicitud de viáticos.
> Cubre backend (`viatika-back/`) y frontend (`viatika/`).

---

## 1. Resumen

Un viático (solicitud de anticipo de viaje) se registra en **una moneda nativa**, elegida por
el colaborador al crear la solicitud entre las monedas configuradas por su empresa en
"Plan de Cuentas y Bancos" (`AccountingConfig`). **No hay conversión de moneda ni tipo de
cambio**: el monto se guarda y se muestra siempre en la moneda elegida, en todas las pantallas
(creación, aprobación, tesorería, exports, correos).

Esto es una decisión de producto explícita, no una limitación: si una empresa gestiona viáticos
en soles y dólares, cada solicitud vive en su propia moneda de punta a punta; no se mezclan ni
se totalizan entre monedas.

**Nota:** el TC (`ExchangeRateService`, PEN/USD por fecha vía API pública) y los códigos SUNAT de
`AccountingConfig` (`monedaOrigen`/`monedaRegistro`/`bankAccounts[].moneda`) ya existían antes de
este feature — se usan para el export contable Contanet (`accounting-entries`), que sí aplica TC
para el asiento en la moneda de registro de la empresa. El feature de viáticos descrito aquí es
independiente de eso: es moneda nativa, sin conversión.

---

## 2. Modelo de datos

Se guarda el **código de moneda SUNAT** (no el símbolo), con `'01'` (soles) como default para
compatibilidad con registros previos al feature (que no tenían campo de moneda):

| Código | Símbolo | Moneda |
|---|---|---|
| `'01'` | `S/` | Soles (PEN) |
| `'02'` | `$` | Dólares (USD) |

| Entidad | Campo | Archivo |
|---|---|---|
| `Advance` (anticipo/viático legacy) | `moneda: string` (default `'01'`) | `viatika-back/src/modules/advance/entities/advance.entity.ts` |
| `ExpenseReport` (`type='viatico'`, unificado) | `viaticoMoneda?: string` (default `'01'`) | `viatika-back/src/modules/expense-report/entities/expense-report.entity.ts` |

**Nota histórica:** conviven dos modelos de solicitud de viático — el legacy `Advance` y el
unificado `ExpenseReport` con `type='viatico'`. Ambos llevan el campo de moneda.

Catálogo canónico de monedas (código → símbolo/label), duplicado en ambos lados del stack:

- Backend: `viatika-back/src/common/moneda.constants.ts` (`MONEDA_SYMBOLS`, `monedaSymbol()`)
- Frontend: `viatika/src/app/constants/moneda.ts` (`MONEDA_CATALOG`, `monedaSymbol()`)

---

## 3. Fuente de monedas disponibles

Las monedas que puede elegir un colaborador salen de `AccountingConfig` (sección "Plan de
Cuentas y Bancos" en Configuración, solo Admin/Contabilidad): la unión de `monedaOrigen` y los
`bankAccounts[].moneda` configurados. Sin config guardada, solo se ofrece soles.

Como `GET /accounting-config/:clientId` está restringido a Admin/Contabilidad (expone cuentas
bancarias), existe un endpoint liviano aparte para el selector del formulario, accesible a
cualquier rol autenticado:

- **Backend:** `AccountingConfigService.getAvailableCurrencies(clientId)` →
  `GET /accounting-config/:clientId/currencies` (`accounting-config.controller.ts`)
- **Frontend:** `AccountingConfigService.getAvailableCurrencies(clientId)`
  (`viatika/src/app/services/accounting-config.service.ts`)

---

## 4. Dónde se captura la moneda

| Formulario | Componente | Detalle |
|---|---|---|
| Solicitud de viáticos (crear/reenviar) | `viatika/src/app/modules/mis-rendiciones/solicitud-viaticos/` | Select `moneda` junto al monto requerido, poblado desde `getAvailableCurrencies()`. Se envía en los 3 payloads (`ICreateViaticoPayload`, `IResubmitViaticoPayload`, `ICreateAdvancePayload`) y se restaura al editar/reenviar. |

Los DTOs backend (`CreateAdvanceDto`, `ResubmitAdvanceDto`, `CreateViaticoExpenseReportDto`,
`ResubmitViaticoDto`) aceptan `moneda?: string` opcional; si se omite, el servicio persiste
`'01'` por defecto.

---

## 5. Dónde se muestra

Todas las pantallas leen el símbolo de la moneda del propio registro (`advance.moneda` /
`report.viaticoMoneda`) en vez de asumir `S/` fijo:

| Pantalla | Componente |
|---|---|
| Lista y detalle de aprobación (coordinador/contabilidad) | `modules/viaticos/viaticos.component`, `modules/viaticos/viaticos-detail/` (incluye export PDF/Excel) |
| Mis viáticos (colaborador) | `modules/mis-rendiciones/mis-rendiciones.component` (tab `viaticos`) |
| Tesorería — lista, detalle y registro de pago | `modules/tesoreria/tesoreria.component`, `modules/tesoreria/tesoreria-detalle/` |
| Inicio (fila de solicitud) | `modules/inicio/inicio.component` |
| Aprobación admin/coordinador | `modules/admin-users/rendiciones-admin/` |
| Export "Rendición de Fondos" (bloque de presupuesto del viático embebido) | `services/rendicion-export.service.ts` (`RendicionExportData.moneda`) |
| Correos de solicitud/aprobación/pago/devolución de viático | `modules/email/email.service.ts` (`currencySymbol` en cada payload `sendViatico*`/`sendDevolucion*`), plantillas `.hbs` correspondientes |

Helper compartido en cada capa: `monedaSymbol(codigo)` — nunca se concatena `'S/'` a mano en
código nuevo relacionado a montos de viático.

---

## 6. Fuera de alcance (por diseño, no pendiente)

- **Conversión / tipo de cambio para viáticos.** No existe `montoBase` ni congelado de TC para
  el monto del viático — es moneda nativa desde la captura hasta el pago.
- **Comprobantes de gasto locales** (movilidad, recibo de caja, otros gastos, comprobante de
  caja) — siempre en soles por regla de negocio, no llevan selector de moneda.
- **Dashboard (KPIs agregados de anticipos)** — sigue sumando `Advance.amount` sin distinguir
  moneda (`dashboard.service.ts`). Si una empresa usa PEN y USD, esos totales agregados mezclan
  ambas monedas. Limitación conocida, no cubierta por este feature.
- **`accounting-entries` (export Contanet)** — su propio manejo de `monedaOrigen`/`monedaRegistro`
  y tipo de cambio no cambia; sigue aplicando una tasa por lote a los anticipos que exporta.
- **Diálogo de confirmación de borrado de rendición** (`rendiciones-admin`, "Anticipo vinculado…")
  — el preview de borrado (`IExpenseReportDeletionPreview.linkedAdvances`) no incluye moneda;
  sigue mostrando `S/` fijo en ese caso puntual.

---

## 7. Cómo verificar

1. **Backend:** `cd viatika-back && npm run build`; `npx jest --testPathPattern=expense-report`
   y `--testPathPattern=advance`.
2. **Frontend:** `cd viatika && npm run build`.
3. **Prueba manual end-to-end:**
   - En Configuración → Plan de Cuentas y Bancos, agregar un banco con moneda `02` (dólares).
   - Crear una solicitud de viático eligiendo "Dólares ($)" → el total del formulario muestra `$`.
   - Como coordinador/contabilidad, aprobar la solicitud → `viaticos-detail` muestra `$`, no `S/`.
   - En `/mis-rendiciones?tab=viaticos` la fila del viático muestra `$`.
   - En Tesorería, registrar el pago → el modal y el detalle muestran `$`.
   - Un viático creado antes de este feature (sin `moneda` guardada) sigue mostrando `S/`.
