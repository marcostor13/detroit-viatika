# Deuda técnica

Lo que queda pendiente de verificar o de limpiar, con su motivo. Cuando algo de
acá se cierra, se borra la entrada.

## Tests sin correr de "Tesorería ve las rendiciones directas" (2026-08-13)

**Qué:** `viatika/src/app/modules/admin-users/rendiciones-admin/rendiciones-tabs.component.spec.ts`
pasa a cubrir la visibilidad por rol de las pestañas (`showDirectasTab` /
`showCajaChicaTab`) y el `?tab=` que el usuario no tiene habilitado. **No se
ejecutaron:** la suite de Karma cuelga la máquina de desarrollo.

**Qué sí se verificó:** `npx tsc --noEmit -p tsconfig.json` — sin errores nuevos
(quedan los preexistentes de `playwright.config.ts` y
`rendicion-export.service.ts:1956`). El tipado no prueba comportamiento ni
plantillas.

**Cómo saldarla:** correr acotado en una máquina que lo aguante:

```bash
cd viatika
npx ng test --include='**/rendiciones-tabs.component.spec.ts' --watch=false --browsers=ChromeHeadless
```

**Riesgo si no se salda:** el spec ahora inyecta un `UserStateService` con dos
espías (`isContabilidadInCompany` e `isTesoreria`); si el componente pasara a
consultar un tercer método, los tests fallan por espía faltante y no por la
regla de negocio. Nadie se enteraría hasta que la suite vuelva a correr.

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
