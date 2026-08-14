# Deuda técnica

Lo que queda pendiente de verificar o de limpiar, con su motivo. Cuando algo de
acá se cierra, se borra la entrada.

## Sección "Gastos" de rendiciones directas sin uso (2026-08-13)

**Qué:** `viatika/src/app/modules/rendiciones-directas/` tiene una sub-pestaña
"Gastos" (vista por comprobante) que hoy **no ve nadie**: `showGastosTab` quedó
en `false` porque Contabilidad nunca la tuvo y el cliente pidió que todos vean
esa pantalla igual que ella. Con ella quedan sin uso su tabla (~250 líneas de
plantilla), `loadData()`, `findDirectRendicionExpenses` en el servicio y el
endpoint `GET /expense-report/directas/expenses/:clientId`.

**Por qué no se borró:** es la única vista por comprobante de las directas y sus
acciones (marcar revisado por Contabilidad, eliminar) no están acotadas por rol;
si se rehabilita hay que gatearlas antes, o a un aprobador le responden 403.

**Cómo saldarla:** decidir con el cliente si esa vista vuelve (entonces: gatear
las acciones por rol) o se borra (entonces: quitar plantilla, método, servicio y
endpoint de una).

## Tests sin correr de "Tesorería ve /rendiciones igual que Contabilidad" (2026-08-13)

**Qué:** `viatika/src/app/modules/admin-users/rendiciones-admin/rendiciones-tabs.component.spec.ts`
pasa a cubrir la visibilidad de la pestaña Caja Chica por rol y el `?tab=` de un
aprobador. **Sin spec propio** quedan: el `cajaChicaDetalleGuard` nuevo
(`viatika/src/app/guards/auth-caja-chica-detalle.guard.ts`), los dos `@Roles` del
backend que suman TESORERIA (`caja-chica-report.controller.ts` y
`caja-chica/available` en `expense-report.controller.ts`) y —lo más delicado— el
acotado de las directas por aprobador (`directaReportIdsForApprover` +
`directasApproverScope`): nada verifica que un aprobador reciba solo sus
rendiciones ni que Contabilidad/Tesorería sigan recibiéndolas todas. **No se
ejecutó nada:** la suite de Karma cuelga la máquina de desarrollo.

**Qué sí se verificó:** `npx tsc --noEmit -p tsconfig.json` en front y back — sin
errores nuevos (quedan los preexistentes de `playwright.config.ts` y
`rendicion-export.service.ts:1956`). El tipado no prueba comportamiento ni
plantillas, y las rutas del backend no se probaron con una petición real.

**Cómo saldarla:** correr acotado en una máquina que lo aguante:

```bash
cd viatika
npx ng test --include='**/rendiciones-tabs.component.spec.ts' --watch=false --browsers=ChromeHeadless
```

Y una pasada manual como Tesorería por las tres pestañas de `/rendiciones`,
entrando al detalle de una caja chica (es la ruta que cambió de guard).

**Riesgo si no se salda:** el spec inyecta un `UserStateService` con dos espías
(`isContabilidadInCompany` e `isTesoreria`); si el componente pasara a consultar
un tercer método, los tests fallan por espía faltante y no por la regla de
negocio. Del lado del backend, nada cubre que Tesorería siga sin poder entrar a
los endpoints que no se tocaron.

## Candados del flujo secuencial sin cubrir (2026-08-13/14)

**Cómo correr jest acá:** `npm run test` lanza workers en paralelo y cuelga la
máquina de desarrollo. Serializado corre sin problema — la suite entera son 63
suites / 872 tests en ~31 s:

```bash
cd viatika-back
npx jest --runInBand --silent                              # suite completa
npx jest --runInBand --testPathPattern="modules/expense"   # acotado a un módulo
```

Baseline al 2026-08-14: **872/872 en verde**. Cualquier rojo es del cambio.

**Qué SÍ quedó cubierto** de los candados que introdujo el fix del orden
envío → aprobadores → contabilidad: `buildChainForNewExpense` (construye solo con
la rendición enviada, y no pisa una cadena existente), el `true`/`false` de
`advanceToAccountingIfAllExpensesApproved` con sus casos de comprobante
observado y de cadena de reporte del viático, y `rejectByCoord` fuera de
`submitted`.

**Qué sigue SIN spec:**

1. `ExpenseService.approveByContabilidad` exige la rendición en
   `pending_accounting`.
2. `update(status: 'approved')` exige que Contabilidad haya aprobado todos los
   comprobantes (`assertAllExpensesApprovedByAccounting`).
3. `removeExpenseFromReport` reevalúa el avance a Contabilidad (quitar el último
   comprobante sin aprobar dejaba la rendición colgada).
4. Agregar un comprobante a una rendición que ya estaba en `pending_accounting`
   la devuelve a `submitted`.
5. `rejectByContabilidad` NO valida el estado de la rendición, al revés que su
   contraparte `approveByContabilidad`. No se llega desde la interfaz, pero por
   API observaría un comprobante fuera de fase y devolvería la rendición entera
   al colaborador desde `submitted`.

**Riesgo si no se salda:** son gates que cortan flujos en producción. Un
allowlist de estados mal puesto (por ejemplo olvidar `partially_paid` o `paid` en
la rendición de un viático) bloquea a un usuario real sin que ningún test avise.
