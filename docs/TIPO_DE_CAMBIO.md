# Tipo de Cambio / Multi-Moneda

> Documento de referencia del feature de tipo de cambio (TC) y soporte multi-moneda.
> Cubre backend (`viatika-back/`) y frontend (`viatika/`).

---

## 1. Resumen

VIATIKA opera con una **moneda base por cliente** (`AccountingConfig.monedaBase`, normalmente
`PEN`). Comprobantes, anticipos y rendiciones pueden registrarse en una **moneda distinta**
(típicamente `USD`); el sistema congela un tipo de cambio al momento del registro y guarda
tanto el monto original como su equivalente en moneda base. Ese equivalente (`montoBase`) es
el que se usa para totales, agregaciones del dashboard, umbrales de aprobación y asientos
contables — nunca se mezclan montos de distintas monedas sin convertir.

**Principio de diseño:** el TC se **congela una sola vez** al crear/editar el monto y no se
recalcula después, aunque el TC del día cambie. Esto evita que una liquidación ya cerrada
cambie de valor retroactivamente.

---

## 2. Modelo de datos

Todo documento con un monto en moneda potencialmente extranjera lleva el mismo cuarteto de
campos:

| Campo | Significado |
|---|---|
| `moneda` | Código ISO 4217 de la moneda original (`'PEN'`, `'USD'`, …) |
| `montoBase` (o `*Base` según la entidad) | Equivalente del monto original en la moneda base del cliente |
| `tipoCambio` | TC moneda→base aplicado (1 si `moneda === monedaBase`) |
| `tcFecha` | Fecha (`YYYY-MM-DD`) del TC usado |

| Entidad | Campo de monto original | Campo `*Base` | Archivo |
|---|---|---|---|
| `Expense` (comprobante) | `total` | `montoBase` | `viatika-back/src/modules/expense/entities/expense.entity.ts` |
| `Advance` (anticipo legacy) | `amount` | `montoBase` | `viatika-back/src/modules/advance/entities/advance.entity.ts` |
| `ExpenseReport` (rendición / viático unificado) | `budget`, `viaticoAmount`, `viaticoPaidAmount`, `pendingBalanceAmount` | `budgetBase`, `viaticoAmountBase`, `viaticoPaidAmountBase`, `pendingBalanceAmountBase` | `viatika-back/src/modules/expense-report/entities/expense-report.entity.ts` |
| `Saldo` (bolsa) | `amount` | — (nace ya en moneda base, no requiere conversión) | `viatika-back/src/modules/saldo/` |
| `PettyCash` (caja chica) | `fundAmount` | — (fondo declarado en una sola moneda, sin conversión) | `viatika-back/src/modules/petty-cash/entities/petty-cash.entity.ts` |

**Nota histórica:** conviven dos modelos de solicitud de viático — el legacy `Advance` y el
unificado `ExpenseReport` con `type='viatico'`. Ambos tienen el pipeline de moneda completo.

---

## 3. Servicios core (backend)

### 3.1 `ExchangeRateService` — TC oficial SUNAT

`viatika-back/src/modules/exchange-rate/exchange-rate.service.ts`

Resuelve **soles por dólar (PEN/USD)** para una fecha dada, con caché en BD (colección
`exchangerates`, índice único por `fecha`).

- **Proveedor:** [Decolecta](https://decolecta.com) (TC oficial SUNAT), requiere `API_DECOLECTA`
  en el entorno. Límite de **100 peticiones/mes** — por eso la caché es crítica.
- Se persiste el **TC venta** (`sell_price`), exigido por el Reglamento del IGV para
  provisiones de compra / crédito fiscal en moneda extranjera.
- **Estrategia de caché:**
  1. Cache hit (origen confiable) → 0 llamadas al API.
  2. `ok` → se guarda bajo esa fecha.
  3. `no_data` (feriado/fin de semana) → se usa el último TC previo cacheado; si la fecha ya
     pasó, se congela ese fallback bajo la fecha para no volver a gastar cuota.
  4. `error` (fallo transitorio o cuota agotada) → se devuelve el fallback pero **no se
     persiste**, para reintentar en la próxima consulta.
- Dos orígenes confiables (`TRUSTED_SOURCES`): `sunat-oficial` (import manual, máxima
  prioridad) y `decolecta` (API). Orígenes antiguos (`api`, `sunat` de un proveedor previo)
  no se confían y se refrescan la primera vez que se piden.
- `getRatesBatch(dates)`: una sola query `$in` para las fechas cacheadas + API en paralelo
  solo para las faltantes. Usado por `accounting-entries.service.ts` (asientos contables) y
  `prefetchRates`, evita N `findOne` cuando una rendición tiene decenas de comprobantes.
- `importOfficialRates(rows)`: importa tasas oficiales SUNAT en bloque (ver §7, `seed:tc`).

No tiene controller HTTP propio — se consume internamente vía `CurrencyService`.

### 3.2 `CurrencyService` — conversión a moneda base

`viatika-back/src/modules/exchange-rate/currency.service.ts`

- `resolveRate(moneda, date, config)`:
  - `moneda === monedaBase` → TC `1`.
  - `moneda === 'USD'` con base `PEN` → TC oficial SUNAT del día vía `ExchangeRateService`.
  - Cualquier otra moneda → TC manual configurado en
    `AccountingConfig.supportedCurrencies[].manualRate` (no hay integración a un proveedor FX
    externo para monedas distintas de USD).
- `toBase(monto, moneda, date, config)`: convierte y **congela** el resultado
  (`{ montoBase, tipoCambio, tcFecha }`). Se llama una sola vez al registrar el documento.
- `resolveApprovalThresholdL1(clientId, moneda)`: umbral de aprobación de anticipos **en su
  propia moneda** (ej. S/ 500 o USD 150 por defecto, configurable por cliente). Comparar en
  la moneda original evita que el TC del día distorsione qué nivel de aprobación aplica.
- `getConfig(clientId)`: config contable efectiva del cliente (con defaults si aún no la
  configuró) — delega en `AccountingConfigService.getEffective`.

---

## 4. Dónde se aplica la conversión

| Módulo | Método | Estado |
|---|---|---|
| `expense.service.ts` | `computeCurrencyFreeze` (privado), usado en `create()`/`update()` | ✅ Completo |
| `advance.service.ts` (legacy) | `computeAdvanceCurrencyFreeze` (privado), usado en `createSimpleAdvance()` y `createViaticoSolicitud()` | ✅ Completo |
| `expense-report.service.ts` (unificado, `type='viatico'`) | `computeViaticoCurrencyFreeze` (privado), usado en `createViatico()` y `resubmitViatico()` | ✅ Completo (corregido 2026-07-15, ver §9) |
| `dashboard.service.ts` | Agregaciones Mongo (`$group`) usan `montoBase`/expresión equivalente con fallback a `total` para documentos pre-migración | ✅ Completo |
| `accounting-entries.service.ts` (asientos Contanet) | `getRatesBatch` + manejo propio de moneda extranjera en el export | ✅ Completo |
| `invoice.service.ts` (módulo `Invoice`, código muerto) | No aplica | ⚠️ N/A — este módulo no lo usa el frontend real (ver `invoices.service.ts` → apunta a `/expense`); no requiere trabajo |
| `petty-cash.service.ts` | Ninguno | ❌ Sin conversión — fondo de caja chica es siempre en una sola moneda por diseño |

---

## 5. Configuración de monedas soportadas

`AccountingConfig` (`viatika-back/src/modules/accounting-config/entities/accounting-config.entity.ts`)

```ts
monedaBase: string                      // default 'PEN'
supportedCurrencies: {
  code: string             // ISO 4217: 'PEN', 'USD', 'EUR'…
  symbol: string            // 'S/', '$', '€'
  contanetCode: string      // Tabla 3 de Contanet: '01' soles, '02' dólares…
  decimals: number
  approvalThresholdL1: number   // umbral de aprobación L1 de anticipos, en esta moneda
  manualRate?: number           // TC manual moneda→base (no aplica a monedaBase ni a USD)
}[]
```

Defaults de fábrica: `PEN` (S/, umbral 500) y `USD` ($, umbral 150, TC vía SUNAT).

- **Endpoints:** `GET /api/accounting-config/:clientId`, `PUT /api/accounting-config/:clientId`
  (`accounting-config.controller.ts`).
- **UI:** sección "Plan de Cuentas y Bancos" en `viatika/src/app/modules/configuracion/`
  (`configuracion.component.ts:629-747` + `.html:773-848`) — el Administrador puede
  agregar/quitar monedas, fijar TC manual y ve validación de que toda moneda no-base y no-USD
  requiera `manualRate`. Protegido contra borrar la moneda base.

---

## 6. Frontend

### 6.1 Selector de moneda (captura)

El usuario puede elegir/corregir la moneda al crear los dos tipos de documento donde
realísticamente aparece moneda extranjera:

| Formulario | Componente | Detalle |
|---|---|---|
| Factura (comprobante) | `viatika/src/app/modules/invoices/add-invoice/` | Select `moneda` visible en la revisión post-OCR (imagen y PDF) y al editar una factura existente. Poblado desde `AccountingConfigService.getConfig(clientId).supportedCurrencies`. Solo aplica a `expenseType='factura'` — el resto de tipos (movilidad, recibo caja, otros gastos, comprobante caja) son gastos locales en soles por diseño y no llevan selector. |
| Solicitud de viáticos | `viatika/src/app/modules/mis-rendiciones/solicitud-viaticos/` | Control `moneda` a nivel de formulario completo (no por línea), incluido en los 3 payloads de envío (`ICreateViaticoPayload`, `IResubmitViaticoPayload`, `ICreateAdvancePayload`) y restaurado correctamente al editar/reenviar. |

Antes de esto, la moneda solo se detectaba por OCR o quedaba en el default `'PEN'`; el
usuario no podía elegirla.

### 6.2 Visualización (display)

| Pantalla | Componente | Qué muestra |
|---|---|---|
| Detalle de comprobante | `mis-rendiciones/gasto-detalle/` | Monto original + moneda + monto convertido a S/ + TC, cuando la moneda es extranjera |
| Detalle de rendición | `mis-rendiciones/rendicion-detail/` | Igual, por línea de gasto. El total de la rendición (`calculateTotals()`) suma `montoBase` (antes sumaba el monto crudo sin convertir — ver bug corregido en §9) |
| Tesorería (lista + detalle de anticipo) | `tesoreria/`, `tesoreria/tesoreria-detalle/` | Moneda, monto convertido y TC en la tabla de anticipos, el modal de registro de pago y el detalle |

### 6.3 Interfaces TypeScript relevantes

- `IInvoiceResponse` (`invoices/interfaces/invoices.interface.ts`) — `moneda`, `montoBase`, `tipoCambio`, `tcFecha`
- `IAdvance` (`interfaces/advance.interface.ts`) — ídem
- `IExpenseReport` (`interfaces/expense-report.interface.ts`) — `moneda`, `budgetBase`, `viaticoAmountBase`, `viaticoPaidAmountBase`, `pendingBalanceAmountBase`, `tipoCambio`, `tcFecha`
- `ICurrencyConfig` (`interfaces/accounting-config.interface.ts`) — shape de cada moneda soportada

---

## 7. Scripts operativos

Ejecutar desde `viatika-back/`:

```bash
# Backfill de moneda='PEN'/tipoCambio=1/montoBase=* en documentos existentes
# (idempotente: solo toca documentos donde `moneda` aún no existe)
npx ts-node -r tsconfig-paths/register src/scripts/backfill-currency-fields.ts

# Importa tasas oficiales SUNAT desde un JSON export (docs/tipos_de_cambio.json por defecto)
# Marca origen 'sunat-oficial' (máxima prioridad, nunca gasta cuota de Decolecta)
npm run seed:tc
npm run seed:tc -- --file=/ruta/al/tc.json
```

---

## 8. Reglas de negocio clave

1. **TC venta, no compra:** el Reglamento del IGV exige el TC **venta** publicado a la fecha
   de emisión del comprobante para provisiones de compra / crédito fiscal en moneda
   extranjera — es el que persiste `ExchangeRateService`.
2. **Congelado, no recalculado:** el TC se resuelve una sola vez al registrar/editar el
   monto. Cambios posteriores del TC del día no afectan documentos ya guardados.
3. **Fallback en feriados/fines de semana:** si SUNAT no publicó TC para una fecha, se usa el
   último TC previo publicado (regla SUNAT), y si la fecha ya pasó se congela ese fallback
   para no reconsultar el API.
4. **Umbral de aprobación en moneda original:** el anticipo se compara contra el umbral L1 en
   **su propia moneda** (no convertido), para que el TC del día no cambie cuántos niveles de
   aprobación requiere.
5. **`montoBase` es la fuente de verdad para agregaciones:** dashboard, totales de rendición y
   asientos contables siempre operan sobre el monto en moneda base, nunca mezclan montos de
   distintas monedas sin convertir.

---

## 9. Bug corregido (2026-07-15)

El flujo **unificado** de solicitud de viáticos (`ExpenseReportService.createViatico` /
`resubmitViatico`, el que usa el frontend actual vía `ICreateViaticoPayload`) **no calculaba
el congelado de moneda** a pesar de que `ExpenseReportDocument` ya tenía los campos
`moneda`/`viaticoAmountBase`/`budgetBase`/`tipoCambio`/`tcFecha` con el comentario "heredada
del anticipo". `validateViaticoLines` ya aceptaba `dto.moneda` en su firma (para resolver el
umbral L1 en la moneda correcta) pero `createViatico` nunca se lo pasaba, y no se llamaba a
ningún equivalente de `toBase()`.

El flujo **legacy** (`AdvanceService.createViaticoSolicitud`) sí estaba completo desde antes
(`computeAdvanceCurrencyFreeze`). Se replicó el mismo patrón como
`ExpenseReportService.computeViaticoCurrencyFreeze` y se usa en ambos métodos. Los DTOs
`CreateViaticoExpenseReportDto` y `ResubmitViaticoDto` ganaron el campo `moneda?: string`.

También se corrigió un bug de frontend: `rendicion-detail.component.ts` `calculateTotals()`
sumaba `exp.total` crudo sin considerar la moneda — el total de una rendición con
comprobantes en USD salía mal calculado. Ahora suma `montoBase`.

---

## 10. Limitaciones conocidas / fuera de alcance

- **Solo un tipo de comprobante tiene selector de moneda** (factura). Movilidad, recibo de
  caja, otros gastos y comprobante de caja siempre se registran en la moneda base — decisión
  pragmática, no una limitación técnica del pipeline (el backend acepta `moneda` en cualquier
  tipo de `Expense`).
- **Caja chica (`PettyCash`) no tiene conversión de moneda.** El fondo se declara en una sola
  moneda (`moneda`, default `'PEN'`) sin `montoBase`/`tipoCambio`. Si un cliente necesitara
  cajas chicas en moneda extranjera, este es el punto pendiente.
- **Monedas distintas de PEN/USD dependen de TC manual** (`supportedCurrencies[].manualRate`)
  configurado por el cliente — no hay integración a un proveedor FX externo para EUR u otras.
- **El módulo backend `Invoice`** (`viatika-back/src/modules/invoice/`) es código muerto (no
  lo usa el frontend, que apunta a `/expense`) y no tiene conversión de moneda. No requiere
  trabajo salvo que se decida reactivar ese módulo.

---

## 11. Cómo verificar

1. **Backend:** `cd viatika-back && npm run build` (o `npx jest --testPathPattern=expense-report`
   / `advance` / `exchange-rate` para las suites relacionadas).
2. **Frontend:** `cd viatika && npx ng build --configuration production`.
3. **Prueba manual end-to-end:** crear una factura con moneda `USD` desde `add-invoice` →
   confirmar que `gasto-detalle` muestra el monto original en USD + el equivalente en S/ + el
   TC usado → confirmar que el total de la rendición en `rendicion-detail` está en soles
   (convertido, no la suma cruda) → si es un viático, confirmar en `tesorería` que el monto
   a pagar y el TC se muestran correctamente.
