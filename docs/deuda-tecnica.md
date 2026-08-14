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

## Tests sin correr del fix "rendición atascada en submitted" (2026-08-13)

**Qué:** `viatika-back/src/modules/expense-report/expense-report.service.spec.ts`
suma 4 tests nuevos (avance a Contabilidad al enviar, el `true`/`false` de
`advanceToAccountingIfAllExpensesApproved`, el guard de la cadena de reporte del
viático y la omisión de la convocatoria a aprobadores). **No se ejecutaron.**

**Por qué:** la suite completa de jest cuelga la máquina de desarrollo. Se
verificó solamente el tipado (`npx tsc --noEmit -p tsconfig.json`, sin errores),
que compila specs y fuente pero no prueba comportamiento.

**Cómo saldarla:** correr acotado en una máquina que lo aguante, antes del deploy:

```bash
cd viatika-back
npx jest --runInBand modules/expense-report/expense-report.service.spec.ts
```

Si `--runInBand` tampoco alcanza, `npx jest -w 1 -t "advanceToAccounting"` acota
más. La baseline del backend es **0 fallos**: cualquier rojo ahí es del cambio.

**Riesgo si no se salda:** el fix toca el envío de TODAS las rendiciones
(`update()` con `status: 'submitted'`), no solo las directas. Los tests son la
única red que cubre que un envío normal siga convocando a los aprobadores.

**Sin test todavía:** `removeExpenseFromReport` también reevalúa el avance ahora
(quitar el último comprobante sin aprobar dejaba la rendición colgada igual que
aprobar antes del envío). No tiene spec propio; entra en la misma deuda.

## Flujo secuencial de aprobación, sin tests (2026-08-13)

**Qué:** cuatro candados nuevos, ninguno con spec. Solo se verificó que compila
(backend `tsc --noEmit` limpio, front `ng build` limpio):

1. `buildChainForNewExpense` construye la cadena solo si la rendición ya está
   enviada. Antes se construía al registrar el comprobante.
2. `ExpenseService.approveByCoord` exige la rendición en `submitted`.
3. `ExpenseService.approveByContabilidad` exige la rendición en
   `pending_accounting`.
4. `update(status: 'approved')` exige que Contabilidad haya aprobado todos los
   comprobantes (`assertAllExpensesApprovedByAccounting`).

Además, agregar un comprobante a una rendición que ya estaba en
`pending_accounting` la devuelve a `submitted` (si no, ese comprobante no lo
podía aprobar nadie y la rendición quedaba trabada).

**Qué probar cuando se pueda correr jest:** que un comprobante recién creado en
una rendición abierta NO tenga `approverChain`; que al enviar sí la tenga; que
aprobar como coordinador falle con la rendición abierta; que Contabilidad no
pueda aprobar en `submitted`; y que la rendición no pase a `approved` con un
comprobante sin aprobar por Contabilidad.

**Riesgo si no se salda:** son gates que cortan flujos en producción. Un
allowlist de estados mal puesto (por ejemplo olvidar `partially_paid` o `paid` en
la rendición de un viático) bloquea a un usuario real sin que ningún test avise.

## Sellado de la cadena de reporte del viático, sin correr jest (2026-08-14)

**Qué:** `advanceToAccountingIfAllExpensesApproved` ya no se detiene ante una
`rendicionApproverChain` incompleta: la sella (pasos aprobados + historial, con
el aprobador que firmó ese nivel en los comprobantes) y avanza a
`pending_accounting`. El guard anterior dejaba **toda** rendición de viático
atascada en `submitted`, porque VD-87 quitó el botón "Aprobar Rendición" que era
lo único que completaba esa cadena.

**Qué se verificó:** `tsc --noEmit` limpio. El spec
`expense-report.service.spec.ts` se actualizó ("sella la cadena de reporte del
viático y avanza", antes "NO avanza un viático con su cadena de reporte
incompleta") pero **no se pudo correr**: jest está bloqueado en este entorno.

**Qué probar cuando se pueda correr jest:**

```bash
npx jest --runInBand -t "advanceToAccountingIfAllExpensesApproved"
```

**Riesgo si no se salda:** el sellado escribe en `rendicionApproverChain`,
`rendicionApprovalLevel` y `rendicionApprovalHistory` de todos los viáticos que
llegan a Contabilidad. Un error ahí no rompe el flujo (el estado avanza igual)
pero deja el historial de aprobación en falso.
