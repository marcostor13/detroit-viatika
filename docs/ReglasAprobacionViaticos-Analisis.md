# Reglas de Aprobación de Viáticos por Centro de Costo — Estado de Implementación

> **Última actualización:** 17/07/2026 (regla 1.9 — cadena al subir el comprobante)
> **Alcance:** backend NestJS (`viatika-back`) y frontend Angular (`viatika`).
> **Objetivo:** documentar las reglas de negocio del flujo de aprobación de solicitudes y
> rendiciones de viáticos, y contrastarlas con lo que efectivamente está implementado hoy.
>
> Este documento describía originalmente (14/07/2026) un sistema **previo** al motor de
> cadena de aprobación por centro de costo. Ese motor ya existe y está en producción
> (`approval-chain.util.ts` + `Project.approverLevels` + `User.permissions.projectIds`) —
> la mayoría de lo que antes figuraba como "❌ Falta" está implementado. Ver también
> [DiagramaCadenaAprobacion.md](./DiagramaCadenaAprobacion.md) para los diagramas.

---

## 1. Reglas de negocio

### 1.1 Asignación de centros de costo al colaborador
- Cada colaborador tiene asignados **N centros de costo**, uno marcado **principal**.

### 1.2 Aprobadores por centro de costo
- Cada centro de costo tiene **N aprobadores**, organizados por **niveles**: N1, N2, N3…

### 1.3 Flujo de aprobación de la **SOLICITUD** de viáticos

**Caso A — centro seleccionado asignado al colaborador:**
1. Aprobador **N2** del centro **seleccionado**.
2. **Contabilidad**.

**Caso B — centro seleccionado NO asignado:**
1. Aprobador **N2** del centro **principal**.
2. Aprobador **N2** del centro **seleccionado**.

_(Caso B: Contabilidad no interviene en la etapa de solicitud — el paso 2 mismo la
antecede en el flujo de rendición/pago.)_

### 1.4 Flujo de aprobación de la **RENDICIÓN** y documentos
Aplica a rendiciones de viáticos y a rendiciones directas.

**Caso A — centro de la rendición asignado:**
1. Aprobador **N1** del centro **principal**.
2. Aprobador **N2** del centro **principal**.
3. **Contabilidad**.

**Caso B — centro de la rendición NO asignado:**
1. Aprobador **N1** del centro **principal**.
2. Aprobador **N2** del centro **principal**.
3. Aprobador **N2** del centro **seleccionado**.
4. **Contabilidad**.

### 1.5 Escalamiento por auto-aprobación
Si el creador de la solicitud/rendición es también uno de los aprobadores de un paso,
ese paso escala al siguiente nivel existente (N1→N2, N2→N3…); si no hay nivel superior,
usa a los demás aprobadores del mismo nivel; si el creador era el único, el paso se omite.

### 1.6 Los niveles son ranuras explícitas, no posicionales
Cada nivel (N1/N2/N3…) es una identidad fija por centro de costo, no una posición en una
lista. Un nivel sin aprobadores configurados se **omite sin renumerar** — si un centro no
tiene N1, el flujo salta directo a N2, y N2 **sigue siendo N2** (nunca "se convierte" en N1).

### 1.7 Caja chica también requiere aprobación
La aprobación por niveles de la regla 1.4 debe aplicar también a la rendición de caja
chica (cambio respecto al comportamiento histórico, donde se acumulaba sin aprobación).

### 1.8 Aprobación EN PARALELO entre niveles, Contabilidad al final
Dentro de una misma cadena (regla 1.3 o 1.4), los pasos de nivel **no se aprueban en
orden estricto** — cualquier aprobador de cualquier paso aún pendiente puede actuar en
cualquier momento (N2 puede aprobar antes que N1). **Contabilidad es la única etapa
secuencial**: solo se habilita cuando **todos** los niveles anteriores ya aprobaron, sin
importar el orden en que lo hicieron. Ver el diagrama en
[DiagramaCadenaAprobacion.md §2.5](./DiagramaCadenaAprobacion.md#25-aprobación-en-paralelo-entre-niveles).

### 1.10 Los aprobadores del COLABORADOR sustituyen a los de su centro de costo
Cada colaborador puede tener sus propios niveles de aprobación (N1, N2, N3…) en sus
permisos (`User.permissions.approverLevels`), con **varios aprobadores por nivel**
(cualquiera completa el paso; **todos** reciben la notificación).

Cuando el colaborador tiene al menos un nivel con aprobadores configurado, esos niveles
**sustituyen** a los del centro de costo que le corresponde por su propio perfil:

| Flujo | Centro seleccionado ASIGNADO | Centro seleccionado NO asignado |
|---|---|---|
| SOLICITUD (1.3) | `N2(colaborador)` → Contabilidad | `N2(colaborador)` → `N2(centro seleccionado)` |
| RENDICIÓN (1.4) | `N1(colab)` → `N2(colab)` → Contabilidad | `N1(colab)` → `N2(colab)` → `N2(centro sel)` → Contabilidad |

- El paso del **centro seleccionado no asignado** no cambia: sigue saliendo del centro de
  costo, y se mantiene al final de la cadena.
- **Fallback**: si el colaborador no tiene ningún nivel con aprobadores, la cadena se arma
  con los niveles del centro de costo, exactamente como antes de esta regla. La migración
  es opt-in por usuario; nada cambia hasta que un administrador configure sus niveles.
- Los niveles que entran son los mismos que antes: la SOLICITUD usa solo el N2 y la
  RENDICIÓN usa N1 y N2. Un N3 propio solo interviene por escalamiento (regla 1.5).
- Las reglas 1.5 (escalamiento por auto-aprobación), 1.6 (slots explícitos, omisión sin
  renumerar) y 1.8 (aprobación en paralelo) aplican igual sobre los niveles del
  colaborador: solo cambia de dónde salen los niveles, no cómo se resuelven.
- Cada paso persiste su origen en `ChainStep.source` (`'user'` | `'project'`). Los pasos
  anteriores a esta regla no lo traen y se interpretan como `'project'`.
- El colaborador no puede ser su propio aprobador: se rechaza al guardar los permisos.

### 1.9 La cadena del comprobante se construye al SUBIRLO, no al enviar la rendición
Un comprobante (`Expense`) recibe su cadena de aprobación (regla 1.4: N1/N2/[N2
seleccionado]) en el momento en que se **registra**, no cuando el colaborador hace clic
en "Enviar" sobre la rendición que lo contiene. Esto significa que N1/N2/N3 pueden
aprobar (en paralelo, regla 1.8) desde que el comprobante existe — aunque la rendición
siga en estado `open` ("Aún no enviada" a nivel de reporte) y el colaborador todavía esté
agregando más comprobantes. El envío de la rendición (`update()` con `status: 'submitted'`)
ya no es lo que arma la cadena; solo actúa como red de seguridad idempotente para
comprobantes que por alguna razón no la tengan (legados, o creados sin `userId`).

---

## 2. Cómo funciona hoy (estado real del sistema)

### 2.1 Modelo de Centro de Costo (`Project` / `IProject`)
`viatika-back/src/modules/project/entities/project.entity.ts` — campo
`approverLevels?: ApproverLevel[]`, un array de `{ level: number, userIds: ObjectId[] }`.
Un nivel sin aprobadores no se persiste (se filtra en el guardado), lo que satisface la
regla 1.6 por omisión. Un campo `approverId` legado queda marcado `@deprecated` como
snapshot de migración, ya no es la fuente de verdad.

UI: `viatika/src/app/modules/centros-de-costo/form/centros-de-costo-form.component.ts` —
permite agregar/quitar aprobadores por nivel y agregar/quitar niveles completos.

### 2.2b Aprobadores propios del colaborador (regla 1.10)
`User.permissions.approverLevels: ApproverLevel[]` — misma forma que
`Project.approverLevels` (tipo compartido en
`viatika-back/src/common/types/approver-level.ts`). Se valida al guardar los permisos
(`UserService.validateApproverLevels`): aprobadores activos de la misma empresa, sin
niveles repetidos, sin auto-asignación; los niveles sin aprobadores se descartan. NO viaja
en el JWT (`AuthService.tokenPermissions` lo excluye) — solo lo lee el motor de cadena
vía `findTransactionalProfile`.

UI: `viatika/src/app/modules/admin-users/user-permissions/` usando
`design-system/approver-levels/`, el mismo editor que el formulario de centros de costo.

### 2.2 Asignación de centros de costo al colaborador
`User.permissions.projectIds: string[]` + `User.permissions.primaryProjectId?: string`
(`viatika-back/src/modules/user/schemas/user.schema.ts`). Si no hay `primaryProjectId`
explícito, se usa `projectIds[0]` como fallback (`findTransactionalProfile` en
`user.service.ts`).

UI: `viatika/src/app/modules/admin-users/user-permissions/user-permissions.component.ts`
— asignación de N centros y marcado del principal.

### 2.3 Motor de enrutamiento de aprobaciones
`viatika-back/src/modules/advance/approval-chain.util.ts`:
- `resolveStepFromSource()` — resuelve un nivel por identidad sobre una **fuente**
  (`ChainApproverSource`: centro de costo o colaborador, regla 1.10); aplica la omisión de
  slots vacíos (1.6) y el escalamiento por auto-aprobación (1.5).
- `resolveApprovalStep()` — envoltorio del anterior para una fuente de tipo centro de costo.
- `ownerOrProjectSource()` — elige la fuente según la regla 1.10: el colaborador si tiene
  niveles propios configurados, el centro de costo si no.
- `buildSolicitudChain()` — regla 1.3 (SOLICITUD, N2 principal/seleccionado).
- `buildRendicionChain()` — regla 1.4 (RENDICIÓN, N1/N2 principal + N2 seleccionado).
- `findActionableChainStep()` / `isChainFullyApproved()` — motor de aprobación **en
  paralelo** (regla 1.8): cada paso (`ChainStep`) tiene su propio flag `approved` +
  `approvedBy`/`approvedAt`; cualquier aprobador de cualquier paso pendiente puede
  actuar sobre ese paso específico, sin depender de un puntero secuencial único.

La cadena resuelta se persiste completa en el documento (`viaticoApproverChain` en
`ExpenseReport`, `approverChain` en `Expense`), no como un `requiredLevels` numérico
suelto — cada paso guarda su propia identidad, aprobadores y estado.

### 2.4 Flujo de aprobación — SOLICITUD de viático
`ExpenseReportService.createViatico()` arma la cadena con `buildSolicitudChain()` al
crear la solicitud. `approveViatico()`/`rejectViatico()` usan `findActionableChainStep()`
— cualquier aprobador de un paso pendiente puede actuar, sin importar el orden. Cuando
`isChainFullyApproved()` es `true`, la solicitud pasa a `pending_contabilidad`;
`approveViaticoContabilidad()` hace la aprobación final y dispara el pago.

Estados: `pending_l1 → pending_contabilidad → viatico_approved → partially_paid/paid →
settled`, más `rejected`/`returned`.

### 2.5 Flujo de aprobación — RENDICIÓN (normal, directa y viáticos post-pago)
Por **comprobante** (`Expense`), no por reporte completo. Desde la regla 1.9, la cadena
se arma al **registrar el comprobante**, no al enviar la rendición:
- `ExpenseReportService.buildChainForNewExpense(expenseId, ownerUserId, clientId)` —
  método público, llamado por `ExpenseService` justo después de guardar el documento en
  sus 5 puntos de creación (`analyzeImageWithUrl`, `analyzePdf` → `createExpenseDocument`;
  `createMobilitySheet`; `createOtherExpense`; `createCashReceiptExpense`; `create()`
  genérico). Internamente llama a `buildExpenseChains()` con `buildRendicionChain()`.
- `buildExpenseChains()` (privado) es **idempotente**: si el comprobante ya tiene
  `approverChain` construida, no la toca — evita pisar aprobaciones N1/N2 ya hechas antes
  de que se envíe la rendición. Se sigue llamando también al enviar la rendición
  (`update()` con `status: 'submitted'`) y al agregar un comprobante a una rendición ya
  enviada (`addExpenseToReport`), pero ahí actúa solo como red de seguridad para
  comprobantes sin cadena (legados o creados sin `userId`), no como el punto de
  construcción principal.
- Excepción — `opts.force: true`: cuando se **rechaza la rendición completa** (no un
  comprobante individual) y el colaborador corrige y reenvía
  (`addExpenseToReport`/`resubmitSilent` en su rama `wasRejected`), la cadena de **todos**
  los comprobantes se reconstruye desde cero, descartando cualquier aprobación N1/N2
  previa — el revisor vuelve a validar todo.
- Incluye las rendiciones de viático que ya recibieron pago y entraron en fase de carga de
  gastos (antes esto estaba excluido; corregido para que sigan la misma regla 1.4 que
  cualquier otra rendición).

`ExpenseService.approveByCoord()`/`rejectByCoord()` usan `findActionableChainStep()`
(aprobación en paralelo, regla 1.8). El gate de Contabilidad
(`ExpenseService.approveByContabilidad()`) exige `isChainFullyApproved()` — rechaza con
`BadRequestException` si algún nivel sigue pendiente.

El reporte (`ExpenseReport`) además tiene su propio ciclo `open → submitted →
pending_accounting → approved`, con `assignedCoordinatorId`/`coordinatorApprovedBy`/
`contabilidadApprovedBy` a nivel de reporte — una capa adicional de "visto bueno" del
coordinador/Contabilidad sobre el conjunto ya aprobado por comprobante, no un mecanismo
de aprobación por niveles alternativo.

### 2.6 Flujo — CAJA CHICA
`viatika-back/src/modules/caja-chica-report/` — el reporte de caja chica sigue teniendo
solo dos estados: **`draft | finalized`**. `finalize()` no pasa por `buildRendicionChain`
ni por ningún gate N1/N2/Contabilidad — sigue **sin aprobación por niveles**. La regla
1.7 exige añadirle la misma cadena de la rendición; es el único ítem de este documento
que sigue pendiente.

---

## 3. Contraste regla por regla

| # | Regla de negocio | Estado | Detalle |
|---|---|---|---|
| 1.1 | Colaborador con N centros de costo, uno principal | ✅ Implementado | `User.permissions.projectIds` + `primaryProjectId`, UI en `user-permissions.component.ts`. |
| 1.2 | Centro de costo con N aprobadores por nivel | ✅ Implementado | `Project.approverLevels`, UI en `centros-de-costo-form.component.ts`. |
| 1.3 | Solicitud: N2 seleccionado [→ N2 principal] → Contabilidad | ✅ Implementado | `buildSolicitudChain()`. |
| 1.4 | Rendición: N1 ppal → N2 ppal → [N2 sel] → Contabilidad | ✅ Implementado | `buildRendicionChain()`, por comprobante. |
| 1.5 | Escalamiento si el creador es aprobador | ✅ Implementado | `resolveApprovalStep()`. |
| 1.6 | Niveles como ranuras explícitas, omisión sin renumerar | ✅ Implementado | `resolveApprovalStep()` busca por identidad de nivel. |
| 1.7 | Caja chica requiere aprobación por niveles | ❌ Falta | `caja-chica-report` sigue en `draft \| finalized`, sin cadena. |
| 1.8 | Aprobación en paralelo entre niveles, Contabilidad al final | ✅ Implementado | `findActionableChainStep()` / `isChainFullyApproved()`. |
| 1.9 | Cadena del comprobante se construye al subirlo, no al enviar la rendición | ✅ Implementado | `ExpenseReportService.buildChainForNewExpense()`, llamado desde `ExpenseService` en sus 5 puntos de creación. |
| 1.10 | Aprobadores propios del colaborador sustituyen a los del centro principal | ✅ Implementado | `User.permissions.approverLevels` + `ownerOrProjectSource()`/`resolveStepFromSource()`; UI en `user-permissions.component.html` con `app-approver-levels`. |

**Leyenda:** ✅ Implementado · ⚠️ Parcial · ❌ Falta

---

## 4. Qué queda pendiente

**Caja chica (regla 1.7)** es el único punto real pendiente:
1. Backend: extender `CajaChicaReportStatus` con los estados de rendición
   (`open/submitted/pending_accounting/approved…`, o reutilizar el mismo enum) y llamar
   a `buildRendicionChain()`/`ExpenseService.approveByCoord` sobre sus comprobantes al
   enviarla, igual que una rendición normal.
2. Frontend: agregar la vista de aprobación (pasos, aprobar/rechazar) en
   `mis-rendiciones/nueva-caja-chica/` y `rendiciones-caja-chica/`, que hoy no la tienen
   porque el reporte nunca pasa por un estado "pendiente de aprobación".

Todo lo demás (1.1 a 1.6, 1.8, 1.9) ya está implementado end-to-end (backend + frontend) y
en uso en producción.
