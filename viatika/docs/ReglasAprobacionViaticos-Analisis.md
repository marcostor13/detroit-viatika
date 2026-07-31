# Reglas de Aprobación de Viáticos por Centro de Costo — Análisis de Factibilidad y Plan de Implementación

> **Fecha original:** 14/07/2026 · **Actualizado:** 15/07/2026
> **Alcance:** frontend (`viatika/`, Angular 19) **y** backend (`viatika-back/`, NestJS), ambos en este mismo repositorio de trabajo.
> **Objetivo:** analizar las reglas de negocio propuestas para el flujo de aprobación de solicitudes, rendiciones y caja chica, contrastarlas con el estado real del código (no solo el frontend) y dejar un plan de implementación completo.

> **Nota de la actualización del 15/07/2026:** la versión del 14/07/2026 de este documento se escribió analizando **solo el repositorio frontend** y concluyó que la regla 1.3 (cadena de SOLICITUD) estaba completamente ausente. Al revisar también `viatika-back/` se confirmó que **eso es incorrecto**: ya existe una implementación en producción (`combineCostCenterChain` + `buildCostCenterChain`, ver §2.4) que resuelve una versión simplificada (sin niveles nombrados) de la regla 1.3. Las secciones 2 a 6 de este documento fueron reescritas para reflejar el estado real y se agregó la sección 7 con el plan de implementación detallado y las decisiones de diseño confirmadas.
>
> **Segunda actualización, mismo día:** el plan original (§7) dejaba 3 riesgos abiertos pendientes de validar con producto. Ya se resolvieron (ver §7.0.1) y cambian el diseño de forma material: la aprobación de rendiciones se mantiene **por comprobante** (no pasa a ser un gate único por reporte, §7.4), se confirma el retiro del proceso legado de `Advance` para viáticos con **borrado directo en base de datos** de la data legacy (ambiente de desarrollo, §7.3), y el motor nuevo se implementa **sin capa de compatibilidad** con el formato de cadena viejo, también con borrado directo de los documentos en vuelo antes del corte (§7.2).

---

## 1. Reglas de negocio propuestas (enunciado ordenado)

### 1.1 Asignación de centros de costo al colaborador
- Cada colaborador tiene asignados **N centros de costo**.
- Entre esos centros, **uno es el principal (primario)**.

### 1.2 Aprobadores por centro de costo
- Cada centro de costo tiene asignados **N aprobadores**, organizados por **niveles**: nivel 1 (N1), nivel 2 (N2), nivel 3 (N3), etc.

### 1.3 Flujo de aprobación de la **SOLICITUD** de viáticos

**Caso A — el centro de costo seleccionado SÍ está asignado al colaborador:**
1. Aprobador **N2** del centro de costo **seleccionado**.
2. **Contabilidad**.

**Caso B — el centro de costo seleccionado NO está asignado al colaborador:**
1. Aprobador **N2** del centro de costo **principal (primario)** del colaborador.
2. Aprobador **N2** del centro de costo **seleccionado**.

### 1.4 Flujo de aprobación de la **RENDICIÓN** y documentos
Aplica a rendiciones de viáticos, **rendiciones directas** y (por decisión de diseño, ver §7.0) **caja chica**.

**Caso A — el centro de costo de la rendición SÍ está asignado al colaborador:**
1. Aprobador **N1** del centro de costo **principal**.
2. Aprobador **N2** del centro de costo **principal**.
3. **Contabilidad**.

**Caso B — el centro de costo de la rendición NO está asignado al colaborador:**
1. Aprobador **N1** del centro de costo **principal**.
2. Aprobador **N2** del centro de costo **principal**.
3. Aprobador **N2** del centro de costo **seleccionado**.
4. **Contabilidad**.

### 1.5 Regla de escalamiento por auto-aprobación
- Si el colaborador que crea la solicitud/rendición es **también uno de los aprobadores** de la cadena, **sus aprobaciones se escalan un nivel** (N1→N2, N2→N3…).
- Si tras escalar el destino coincide con otro paso ya presente en la cadena para el mismo centro/aprobador, ambos se **colapsan** en uno solo.
- Si no hay nivel superior definido, se usan los **demás aprobadores del mismo nivel** (excluyendo al creador).
- Si el creador era el **único** aprobador de ese nivel y no hay nivel superior, el paso se **omite**.

### 1.6 Los niveles son ranuras (slots) EXPLÍCITAS, no posicionales
- Cada nivel es un **campo específico y nombrado** en el centro de costo, no "la posición N en una lista".
- Un nivel puede estar **vacío**; si lo está, el paso correspondiente se **omite** sin desplazar la numeración de los demás (N2 nunca "se convierte en N1").

### 1.7 El flujo de CAJA CHICA también requiere aprobación
- La aprobación por niveles de la regla 1.4 aplica también a la caja chica, que hoy se acumula **sin aprobación intermedia**.

---

## 2. Cómo funciona hoy el sistema (estado real, backend + frontend)

### 2.1 Modelo de Centro de Costo (`Project`)
Archivos: `viatika-back/src/modules/project/entities/project.entity.ts`, `viatika/src/app/modules/invoices/interfaces/project.interface.ts`

Campos actuales: identificación (`name`, `code`, `isActive`), `lineaNegocioId`, mapeo contable Contanet (`cuentaAnalitica9x`, `cuentaDestino6x`, `centroCosto`, `subCentroCosto`, `area`, `esAdministrativo`), `committedAdvanceTotal`, y:

```ts
/** Aprobador de las solicitudes de viático que se imputan a este centro de costo. */
approverId?: Types.ObjectId
```

Es decir: **ya existe** un aprobador por centro de costo, pero es **un solo `ObjectId`, sin niveles**. No hay `approverLevels`, `N1`/`N2`/`N3`, ni arreglo de aprobadores. El formulario `centros-de-costo/form/` ya lo edita (campo `approverId`, ver `centros-de-costo-form.component.ts`/`.html`).

### 2.2 Asignación de centros de costo a usuarios
Archivos: `viatika-back/src/modules/user/schemas/user.schema.ts`, `viatika-back/src/modules/user/dto/update-user.dto.ts`, `viatika/src/app/interfaces/user.interface.ts`

`User.permissions.projectIds: string[]` **sí existe** y **sí** es la asignación de centros de costo al colaborador:

```ts
/**
 * Centros de costo (Project) asignados al colaborador, ORDENADOS: el primer
 * elemento es su centro de costo principal — el que se usa como primer
 * aprobador cuando solicita hacia un centro de costo que no tiene asignado.
 */
projectIds: string[]
```

Es editable vía `PATCH /user/:id/permissions` (`UpdatePermissionsDto.projectIds`, `@IsMongoId({each:true})`). El "principal" se determina **por posición** (`projectIds[0]`) — **no** existe un campo `isPrimary` explícito (cero resultados en todo el repo); reordenar el arreglo cambia silenciosamente quién es el principal.

Además existe `User.approverIds?: Types.ObjectId[]` — una cadena **plana, por usuario, global**, sin relación con centros de costo ni niveles, usada por el módulo `Advance` legacy (ver §2.4) y heredera del ya deprecado `coordinatorId`.

> La distinción de la versión anterior de este documento entre "categoría/perfil" y "centro de costo" (`categoryIds` vs `categoryProfileIds` vs centros) sigue siendo válida para el sistema de **categorías visibles**, pero es un mecanismo **distinto** del de asignación de centros de costo (`projectIds`), que sí está cableado.

### 2.3 Modelo de niveles de aprobación (actual)
- No existe ningún nivel **nombrado** por centro de costo (N1/N2/N3). Lo único parecido a "niveles" hoy son:
  - `IUserPermissions.canApproveL1/canApproveL2` — flags de **rol de usuario**, globales, sin relación con centro de costo. Siguen existiendo pero ya no gobiernan el flujo de viático/rendición directa (ver abajo); se usan en la rendición "normal" (§2.6) y en checks dispersos de UI.
  - Los pasos de la cadena de centro de costo (`viaticoApproverChain`, `directaApproverChain`) son posicionales (`chain[0]`, `chain[1]`), **no** etiquetados N1/N2.
- No existe `canApproveL3` ni concepto de nivel 3 en ninguna parte.

### 2.4 Flujo de aprobación actual — SOLICITUD de viáticos

**Hay dos implementaciones divergentes conviviendo:**

**(a) La real/en uso — `ExpenseReport` tipo `'viatico'`.** Archivo: `viatika-back/src/modules/expense-report/expense-report.service.ts`.

```
Colaborador crea la solicitud (POST /expense-report/viatico → createViatico, línea 3742)
        │
        │  buildCostCenterChain (línea 3724) llama a combineCostCenterChain
        │  (viatika-back/src/modules/advance/approval-chain.util.ts:60-96):
        │    - Si el centro SELECCIONADO ∈ profile.projectIds (asignados) → cadena = [approverId(seleccionado)]
        │    - Si NO está asignado → cadena = [approverId(principal=projectIds[0]), approverId(seleccionado)]
        │      (colapsa a 1 si ambos approverId son la misma persona)
        ▼
viaticoApproverChain[0] aprueba (approveViatico, línea 3850) ──► ¿queda otro nivel? ──► lo notifica y espera
        ▼ (cadena completa)
status = 'pending_contabilidad'
        ▼
Contabilidad aprueba (approveViaticoContabilidad, línea 3907) ──► status = 'viatico_approved' ──► notifica Tesorería
```

Esto **ya implementa una versión simplificada de la regla 1.3**: un paso "N2(seleccionado)" o dos pasos "N2(principal) → N2(seleccionado)" (sin niveles nombrados, porque `Project` solo tiene un `approverId`), seguido **siempre** de Contabilidad — en ambos casos A y B, sin distinguir asignado/no-asignado para el gate de Contabilidad (confirmado en `approveViaticoContabilidad`, que no lee `assigned`/`not-assigned` en ningún punto).

**(b) La legacy — módulo `Advance`.** Archivo: `viatika-back/src/modules/advance/advance.service.ts`. `createViaticoSolicitud`/`createSimpleAdvance` arman la cadena con `buildApproverChain(profile.approverIds)` — la lista **plana de `User.approverIds`**, ignorando por completo centros de costo. Sigue siendo alcanzable desde `POST /advance`, invocado por `viatika/src/app/modules/mis-rendiciones/solicitud-viaticos-modal/solicitud-viaticos-modal.component.ts` (todavía referenciado desde `rendicion-detail.component.html`), en paralelo a la página ruteada real `mis-rendiciones/solicitud-viaticos/` (que sí usa `createViatico`, el flujo (a)).

Estados: `pending_l1` (esperando la cadena de centro de costo) → `pending_contabilidad` → `viatico_approved` → `partially_paid`/`paid` → `settled`.

### 2.5 Flujo de aprobación actual — RENDICIÓN y rendición directa

**Rendición "normal"** (no directa, no viático). Archivo: `expense-report.service.ts`. Usa `assignedCoordinatorId` (entity líneas 145/286) — un **snapshot de un solo `Project.approverId`**, sin cadena ni niveles. La aprobación ocurre **por comprobante** (`invoice/:id/approve-coord` → coordinador, `invoice/:id/approve-cont` → Contabilidad, más los `batch-approve-*`), no como cadena de pasos del reporte. Estados: `open → submitted → pending_accounting → approved → paid → settled`.

**Rendición directa** (`isDirecta: true`). Reutiliza el **mismo mecanismo que la SOLICITUD** (`directaApproverChain`/`directaApprovalLevel`/`directaRequiredLevels`, entity líneas 599-607): al enviar (`update()` con `status: 'submitted'`, líneas ~1203-1235) llama a `buildCostCenterChain` — es decir, hoy la rendición directa tiene la **forma de la regla 1.3** (1-2 pasos + Contabilidad), no la forma de doble-paso-principal de la regla 1.4 (`N1(principal)→N2(principal)→...`). Es una brecha de forma, no solo de "falta implementar".

### 2.6 Flujo actual — CAJA CHICA
Dos conceptos distintos bajo ese nombre, ambos relevantes:

- **`PettyCash`** (el fondo): `viatika-back/src/modules/petty-cash/`. Ciclo `pending_funding → active → closed`. Es el **fondeo** por Contabilidad, no la aprobación de gastos. Sin cadena de aprobación.
- **`ExpenseReport` con `isCajaChica: true`** (el reporte de gastos de caja chica, análogo a una rendición): también **sin cadena de aprobación** hoy — no usa `viaticoApproverChain` ni `directaApproverChain`, no tiene pasos N1/N2.

Confirma lo que decía la versión anterior del documento: la caja chica no pasa por ninguna aprobación intermedia hoy.

### 2.7 Niveles explícitos y regla de auto-aprobación (escalamiento)
No existe ninguna lógica de escalamiento en ningún módulo. El único hit de "escalat*" en todo el backend es `ReturnRecord.escalatedAt` (recordatorios de devoluciones vencidas de anticipos) — no tiene relación con aprobación. `canActOnChain`/`advanceChain` (`approval-chain.util.ts`) no detectan si el actor esperado es también el creador de la solicitud.

---

## 3. Contraste regla por regla: ¿implementado o faltante? (corregido)

| # | Regla de negocio | Estado | Detalle |
|---|---|---|---|
| 1.1 | Colaborador con N centros de costo, uno principal | ⚠️ **Parcial** | `User.permissions.projectIds` (ordenado) **ya existe y está cableado** (API + UI de permisos). Falta: marca explícita de "principal" (hoy es posicional, frágil ante reordenamientos). |
| 1.2 | Centro de costo con N aprobadores por nivel (N1, N2, N3…) | ❌ **Falta** | `Project.approverId` es **un solo aprobador, sin niveles**. Esta es la pieza estructural de la que dependen 1.2, 1.5, 1.6 y la forma correcta de 1.4. |
| 1.3-A | Solicitud (centro asignado): N2 seleccionado → Contabilidad | ⚠️ **Parcial, más avanzado de lo que decía la v1** | `combineCostCenterChain`/`buildCostCenterChain` + `approveViaticoContabilidad` **ya implementan esta forma en producción** (`POST /expense-report/viatico`). Falta solo el etiquetado N1/N2/N3 explícito (hoy es "el aprobador del proyecto", implícitamente N2). |
| 1.3-B | Solicitud (centro no asignado): N2 principal → N2 seleccionado | ⚠️ **Parcial** | La forma de 2 pasos ya existe. Diferencia con el enunciado 1.3-B original: Contabilidad **sí** participa también en este caso hoy — decisión confirmada (§7.0): se mantiene así. |
| 1.4-A | Rendición (centro asignado): N1 ppal → N2 ppal → Contabilidad | ❌ **Falta** | Rendición normal usa 1 solo aprobador snapshot (`assignedCoordinatorId`) por comprobante, no una cadena de reporte. Rendición directa usa la forma de 1.3, no la de 1.4. |
| 1.4-B | Rendición (no asignado): N1 ppal → N2 ppal → N2 seleccionado → Contabilidad | ❌ **Falta** | Ídem — ninguna variante implementa el triple/cuádruple paso. |
| 1.5 | Escalamiento si el creador es aprobador | ❌ **Falta** | Depende de 1.2 (niveles por identidad). |
| 1.6 | Niveles como ranuras explícitas; nivel vacío se omite sin renumerar | ❌ **Falta** | Depende de 1.2. |
| 1.7 | Caja chica también requiere aprobación por niveles | ❌ **Falta** | Confirmado sin cambios: ni `PettyCash` ni `ExpenseReport.isCajaChica` tienen cadena de aprobación. |

**Leyenda:** ✅ Implementado · ⚠️ Parcial · ❌ Falta

---

## 4. Veredicto de factibilidad (corregido)

**Alta a nivel de producto, esfuerzo medio-alto** (se reduce respecto al veredicto original, que asumía que había que construir el motor de enrutamiento desde cero). Ya existen: un motor de cadena secuencial genérico (`canActOnChain`/`advanceChain`), un cadena-builder de 1-2 pasos por centro de costo (`combineCostCenterChain`), asignación de centros al colaborador con principal posicional (`projectIds`), un aprobador por centro de costo (`Project.approverId`), historial de aprobaciones y notificaciones por etapa — todo reutilizable.

**La pieza que falta y de la que depende casi todo lo demás** es extender `Project` de "un aprobador" a "aprobadores por **nivel nombrado**" (N1/N2/N3…, con niveles vacíos permitidos) y generalizar el motor de cadena para: (a) resolver un nivel por identidad con omisión de vacíos (1.6), (b) aplicar escalamiento por auto-aprobación (1.5), y (c) construir la cadena de 2-4 pasos de la RENDICIÓN (1.4), hoy inexistente en esa forma.

**Riesgo principal:** hay **tres implementaciones de cadena de aprobación divergentes hoy** (solicitud real vía `ExpenseReport.viatico`, solicitud legacy vía `Advance`, y rendición directa reusando por error la forma de solicitud) más un cuarto patrón completamente distinto (rendición normal por comprobante). Antes de generalizar el motor conviene unificarlas, o el nuevo motor de niveles tendría que replicarse 3-4 veces.

---

## 5. (fusionada con la sección 7 — ver plan de implementación abajo)

## 6. Resumen ejecutivo

- **Lo que YA existe (más de lo que se pensaba originalmente):** un aprobador por centro de costo (`Project.approverId`), centros de costo asignados al colaborador con principal posicional (`User.permissions.projectIds`), y una cadena de 1-2 pasos + Contabilidad **ya funcionando en producción** para la solicitud de viáticos (`ExpenseReport` tipo `viatico`). Motor de cadena secuencial genérico, historial y notificaciones por etapa ya montados y reutilizables.
- **Lo que FALTA (núcleo de las reglas nuevas):**
  1. Aprobadores **por nivel nombrado** en el centro de costo (N1/N2/N3…), como ranuras explícitas que pueden faltar sin renumerar (1.2, 1.6).
  2. Marca explícita de centro **principal** en `User.permissions` (hoy es posicional).
  3. La **forma correcta de la cadena de RENDICIÓN** (N1 ppal → N2 ppal → [N2 sel] → Contabilidad), hoy inexistente tanto en rendición normal (que usa 1 aprobador por comprobante) como en rendición directa (que reusa la forma de solicitud).
  4. **Escalamiento por auto-aprobación** (1.5).
  5. **Caja chica** (`ExpenseReport.isCajaChica`) sin ninguna cadena de aprobación (1.7).
  6. Unificar las **tres implementaciones divergentes** de cadena antes/mientras se generaliza el motor (solicitud real, solicitud legacy vía `Advance`, rendición directa).
- **Factibilidad:** alta a nivel de producto; el esfuerzo real está concentrado en (a) el cambio de esquema de `Project` a niveles nombrados, (b) generalizar el motor de resolución/escalamiento, y (c) reconstruir la cadena de rendición con la forma correcta — más la limpieza de los caminos duplicados. Ver plan detallado en la sección 7.

---

## 7. Plan de implementación

### 7.0 Decisiones de diseño confirmadas (15/07/2026)

Antes de detallar el plan se resolvieron 4 ambigüedades de negocio que no podían derivarse del código:

| Decisión | Resolución |
|---|---|
| **Semántica de aprobación cuando un nivel tiene varios aprobadores** | **Cualquiera de ellos** aprueba y hace avanzar el paso (no se requiere que todos aprueben). Mantiene la semántica actual de "un actor por turno" y evita modelar sub-estados de aprobación parcial por nivel. |
| **Alcance de la regla 1.7 (caja chica)** | Aplica a **`ExpenseReport` con `isCajaChica: true`** (el reporte de gastos, análogo a una rendición) — **no** al ciclo de fondeo de `PettyCash`. |
| **Contabilidad en el Caso B de SOLICITUD (centro no asignado)** | Se **mantiene siempre** (comportamiento actual en producción). El enunciado original de la regla 1.3-B ("sin Contabilidad") no se implementa literalmente; se documenta esta desviación deliberada. |
| **Módulo `Advance` legacy** | Se **retira/migra**: se elimina la duplicación (`POST /advance` + `solicitud-viaticos-modal.component.ts`) en favor del único flujo real (`ExpenseReport` tipo `viatico`), para no mantener dos motores de aprobación divergentes durante ni después de este proyecto. |

Adicionalmente, una decisión técnica (no de negocio, se documenta por transparencia):

- **Migración de `Project.approverId` → nivel N2.** El aprobador único actual de cada centro de costo juega hoy el rol que la regla 1.3/1.4 asigna a N2 (es quien aprueba la solicitud/rendición del centro). Al migrar el esquema, su valor se traslada automáticamente a `approverLevels` nivel 2, dejando N1 vacío (se omite según 1.6) hasta que un administrador lo configure. Esto preserva el comportamiento actual sin interrupción.

### 7.0.1 Decisiones sobre los 3 riesgos abiertos (segunda ronda, 15/07/2026)

La v1 de este plan dejaba 3 riesgos pendientes de validar con producto (§7.9 original). Ya se resolvieron los 3; **cambian de forma material el diseño de las fases 7.2 a 7.5**, descritas más abajo con el diseño ya actualizado:

| Riesgo | Decisión | Consecuencia en el diseño |
|---|---|---|
| **1 — Granularidad de aprobación en rendición** | Se **mantiene la aprobación por documento** (por comprobante), no se reemplaza por un solo gate a nivel de reporte. | La cadena N1(principal)→N2(principal)→[N2(seleccionado)]→Contabilidad de la regla 1.4 se aplica **a cada comprobante (`Expense`) individualmente**, usando el `proyectId` propio de ese comprobante — no un chain único por `ExpenseReport`. Reemplaza los campos binarios `approvalCoord`/`approvalCont` de `Expense` por el mismo mecanismo de cadena que ya usa viático. Ver §7.4 reescrita. |
| **2 — Módulo `Advance` legacy** | **Procede la eliminación** del proceso legacy de solicitud de viático dentro de `Advance`. Como el proyecto está en desarrollo, **se elimina directamente de la base de datos** el dato legacy en vez de migrarlo. | Se retira solo la rama de creación de viático (`createViaticoSolicitud`) — `createSimpleAdvance` (anticipo genérico sin viaje) **se conserva intacto**, no tiene equivalente en `ExpenseReport` y está fuera del alcance de estas reglas. Ver §7.3 reescrita, incluye el filtro exacto de borrado. |
| **3 — Formato de cadena viejo vs. nuevo** | **Se procede con el motor nuevo sin capa de compatibilidad.** El formato viejo (`ObjectId[]`) no se soporta; los documentos en vuelo con ese formato **se eliminan de la base de datos** antes del corte. | `canActOnChain`/`advanceChain`/`resolveApprovalStep` se implementan **solo** para el formato nuevo (`ChainStep[]`), sin ramas de compatibilidad que luego haya que retirar. Ver §7.2 reescrita, incluye el filtro exacto de borrado. |

### 7.1 Backend — Fase 1: Modelo de datos

**`Project`** (`viatika-back/src/modules/project/entities/project.entity.ts`):
```ts
export interface ApproverLevel {
  level: number            // identidad fija: 1, 2, 3… — no posicional
  userIds: Types.ObjectId[]
}
approverLevels?: ApproverLevel[]   // reemplaza approverId
/** @deprecated usar approverLevels (nivel 2). Se conserva para migración. */
approverId?: Types.ObjectId
```
- Script de migración (one-off, corrida en despliegue): por cada `Project` con `approverId` definido, crear `approverLevels = [{ level: 2, userIds: [approverId] }]`.
- DTOs (`create-project.dto.ts`/`update-project.dto.ts`) y `project.service.ts` (`findManyByIds`, etc.) deben exponer/aceptar `approverLevels`.

**`User`** (`viatika-back/src/modules/user/schemas/user.schema.ts`):
```ts
export interface UserPermissions {
  ...
  projectIds: string[]          // se mantiene: orden = prioridad, [0] = principal (comportamiento actual)
  primaryProjectId?: string     // NUEVO: marca explícita, evita ambigüedad si se reordena projectIds
}
```
- `primaryProjectId` se valida server-side: debe estar contenido en `projectIds`; si no se define, se sigue usando `projectIds[0]` como fallback (retrocompatible).
- `UpdatePermissionsDto` gana `primaryProjectId?: string` (`@IsMongoId()`, opcional).

### 7.2 Backend — Fase 2: Motor de resolución y escalamiento

Nuevo módulo (reemplaza gradualmente `approval-chain.util.ts`, puede vivir en `viatika-back/src/modules/approval-chain/` compartido entre `expense-report` y `project`):

```ts
type ChainStep = {
  level: number
  projectId: Types.ObjectId
  projectRole: 'principal' | 'seleccionado'
  approverIds: Types.ObjectId[]   // cualquiera de ellos puede aprobar (decisión 7.0)
  escalatedFrom?: number          // presente si este paso es resultado de un escalamiento
}

function resolveApprovalStep(
  project: { approverLevels?: ApproverLevel[] },
  requestedLevel: number,
  creatorId: string,
  projectRole: 'principal' | 'seleccionado'
): ChainStep | null
```

Implementa exactamente el algoritmo de `DiagramaCadenaAprobacion.md` §6:
1. Si el nivel exacto no existe o no tiene aprobadores → `null` (paso omitido, regla 1.6).
2. Si existe y el creador **no** está entre los aprobadores → devuelve el paso con esos aprobadores.
3. Si el creador **sí** está:
   - Si existe un nivel superior con aprobadores → recursión sobre ese nivel (marca `escalatedFrom`).
   - Si no existe nivel superior pero quedan otros aprobadores en el mismo nivel (excluyendo al creador) → devuelve el paso con esos aprobadores.
   - Si no queda nadie → `null` (paso omitido).

**Chain builders** (reemplazan `combineCostCenterChain`):
```ts
function buildSolicitudChain(opts): ChainStep[]   // regla 1.3 — usa resolveApprovalStep(..., level=2, ...)
function buildRendicionChain(opts): ChainStep[]   // regla 1.4 — usa niveles 1 y 2, reutilizado por rendición normal, directa y caja chica
```
- Ambos colapsan pasos consecutivos con el mismo `approverIds` (mismo criterio que el `combineCostCenterChain` actual) para no pedir doble aprobación a la misma persona.
- Ambos agregan el paso final "Contabilidad" fuera del arreglo `ChainStep[]` (se mantiene como gate separado — `pending_contabilidad`/`approveXContabilidad` — igual que hoy), en ambos casos A y B (decisión 7.0).

**Tests:** unitarios exhaustivos por caso del diagrama (asignado/no asignado × nivel vacío × escalamiento con y sin nivel superior × colapso × único aprobador que se omite), migrando y ampliando `approval-chain.util.spec.ts`.

**Aprobador único (`canActOnChain`):** cambia de comparar `expectedApproverId === actorId` a `expectedStep.approverIds.some(id => id.toString() === actorId)`. **Sin rama de compatibilidad** con el formato viejo (`ObjectId[]`) — decisión 7.0.1, riesgo 3: se implementa solo para `ChainStep[]`.

**Corte limpio de documentos en vuelo (decisión 7.0.1, riesgo 3):** como el proyecto está en desarrollo, no se soporta el formato viejo en paralelo. Antes de desplegar el motor nuevo, se eliminan directamente de la base de datos los documentos que quedarían en un formato de cadena incompatible:

```js
// ExpenseReport: viático y rendición directa con cadena en formato viejo, no terminados
db.expensereports.deleteMany({
  $or: [
    { type: 'viatico', status: { $nin: ['viatico_approved', 'rejected'] } },
    { isDirecta: true, status: { $nin: ['approved', 'rejected'] } },
  ],
})
// Expense: comprobantes con approvalCoord/approvalCont aún pendientes (antes de migrar a approverChain, §7.4)
db.expenses.updateMany(
  { $or: [{ 'approvalCoord.status': 'pending' }, { 'approvalCont.status': 'pending' }] },
  { $set: { status: 'pending' } } // o deleteMany si el reporte completo se descarta con él
)
```
Filtros exactos a confirmar por el equipo antes de correr el borrado (ver §7.9) — no ejecutar contra una base con datos reales sin revisar el filtro primero.

### 7.3 Backend — Fase 3: SOLICITUD de viáticos

- `expense-report.service.ts`: reemplazar `buildCostCenterChain` (línea 3724) por `buildSolicitudChain` sobre el nuevo motor. `createViatico` (3742), `approveViatico` (3850), `notifyViaticoCoordinator` (3797) se adaptan al nuevo shape `ChainStep[]` (antes `ObjectId[]`) y a "cualquiera de `approverIds`" en vez de un solo actor esperado.
- `approveViaticoContabilidad` (3907): sin cambios de negocio (Contabilidad se mantiene siempre, decisión 7.0); solo ajustar lectura de `viaticoRequiredLevels`/historial al nuevo shape.
- **Retiro del módulo `Advance` — solo la rama de viático** (decisión 7.0.1, riesgo 2). Se confirmó revisando `advance.controller.ts`/`advance.service.ts` completos que `POST /advance` sirve **dos propósitos distintos**: `createViaticoSolicitud` (con lugar/fechas/centro de costo — esto es lo que reemplaza `ExpenseReport.viatico`) y `createSimpleAdvance` (anticipo genérico sin viaje, **sin equivalente** en `ExpenseReport`, usado por otro flujo fuera de este proyecto). Alcance del retiro:
  - `advance.service.ts:121-134` (`create()`): eliminar la rama `createViaticoSolicitud` (y su detección `isViaticoSolicitudPartial`); `POST /advance` queda exclusivamente para `createSimpleAdvance`. El resto del módulo (`approve`, `reject`, `register-payment`, `return/*`, `cancel`, `remove`) **se conserva sin cambios** — son genéricos y los sigue usando el anticipo simple.
  - `viatika/src/app/modules/viaticos/viaticos.component.ts:242,250,317-320,353-354`: quitar la llamada a `advanceService.findForViaticosPage()` y la bifurcación de aprobar/rechazar por tipo de ítem — `/viaticos` pasa a leer **solo** de `expenseReportsService.getViaticosList()`.
  - Eliminar `solicitud-viaticos-modal.component.ts` y su referencia en `rendicion-detail.component.html`.
  - **Limpieza de base de datos (decisión 7.0.1, en desarrollo, sin migración):**
    ```js
    // Advance de tipo viático: identificables por tener los 4 campos exclusivos de createViaticoSolicitud
    db.advances.deleteMany({
      projectId: { $exists: true },
      startDate: { $exists: true },
      endDate: { $exists: true },
      place: { $exists: true },
    })
    ```
    Confirmar el filtro con el equipo antes de correr — debe capturar únicamente los `Advance` de viático y **no** tocar los de `createSimpleAdvance` (que no tienen `place`/`startDate`/`endDate`/`projectId`).

### 7.4 Backend — Fase 4: RENDICIÓN (normal + directa) — aprobación por documento

**Cambio de diseño respecto a la v1 de este plan (decisión 7.0.1, riesgo 1):** la cadena de la regla 1.4 **no** vive a nivel de `ExpenseReport` — vive a nivel de **cada comprobante (`Expense`)**, preservando la granularidad actual donde el coordinador puede aprobar/rechazar un gasto sin afectar a los demás de la misma rendición.

**Entidad que cambia:** `viatika-back/src/modules/expense/entities/expense.entity.ts`. Cada `Expense` ya tiene `proyectId: Types.ObjectId` (obligatorio, línea 19 hoy `ExpenseDocument`, línea ~19/97 según versión) y los binarios `approvalCoord?: ExpenseApproval` / `approvalCont?: ExpenseApproval` (líneas 126-127). Se reemplazan por:
```ts
approverChain?: ChainStep[]        // reemplaza approvalCoord — misma forma que viaticoApproverChain
approvalLevel?: number
requiredLevels?: number
approvalHistory?: ApprovalEntry[]
contabilidadStatus?: 'pending' | 'approved' | 'rejected'   // reemplaza approvalCont
contabilidadApprovedBy?: string
contabilidadApprovedAt?: Date
```

**Cuándo se construye la cadena:** al enviar el comprobante a aprobación (mismo punto donde hoy se inicializa `approvalCoord: { status: 'pending' }`), usando `buildRendicionChain(profile, expense.proyectId, clientId)` — el mismo motor de la Fase 2, aplicado por comprobante en vez de por reporte. El `profile` (centros asignados + principal) sigue siendo el del colaborador dueño de la rendición, no el del comprobante.

**Endpoints afectados** (`viatika-back/src/modules/expense/expense.controller.ts` + `expense.service.ts`):
- `PATCH invoice/:id/approve-coord` (`approveByCoord`, `expense.service.ts:2472`) y `reject-coord`: pasan de fijar `approvalCoord.status` directamente a usar `canActOnChain`/`advanceChain` contra `expense.approverChain`/`expense.approvalLevel`, igual que `approveViatico`. Cuando la cadena se completa, pasa a `contabilidadStatus: 'pending'` en vez de a un estado combinado inmediato.
- `PATCH invoice/:id/approve-cont` (`approveByContabilidad`, `expense.service.ts:2552`) y `reject-cont`: se convierten en el gate final (`contabilidadStatus`), análogo a `approveViaticoContabilidad`. Solo actúa cuando `approverChain` ya está completo.
- `PATCH report/:reportId/batch-approve-coord` / `batch-approve-collab`: siguen siendo por-lote, pero ahora avanzan el paso **actual** de la cadena de cada comprobante elegible del reporte (no fijan un único booleano) — un comprobante con más de un nivel pendiente no se salta niveles por estar en un batch.
- El estado agregado del `ExpenseReport` (`open → submitted → pending_accounting → approved`) se sigue derivando de agregar el estado de todos sus `Expense` (mismo patrón que hoy usa `computeCombinedStatus`, generalizado a "cadena completa + `contabilidadStatus: approved`" en vez de "`approvalCoord`+`approvalCont` ambos `approved`").

**Rendición directa:** se **elimina** el mecanismo report-level `directaApproverChain`/`directaApprovalLevel`/`directaRequiredLevels` (entity líneas 599-607) — quedaba mal planteado desde el inicio (reusaba la forma de solicitud, §2.5) y con la decisión del riesgo 1 pasa a ser innecesario: los comprobantes de una rendición directa son `Expense` igual que los de una rendición normal, así que heredan el mismo mecanismo por-documento de esta fase sin código adicional. Repasar `MobilityRow.proyectId` (centro de costo por fila, propio de rendiciones directas) y `ExpenseAnalyticDetail.proyectId` (reparto multi-proyecto contable): **la cadena de aprobación se calcula sobre `Expense.proyectId` (el del comprobante completo), no sobre estos sub-campos** — el reparto multi-proyecto es solo para asientos contables, no para el ruteo de aprobación. Confirmar este supuesto con el equipo (ver §7.9).

### 7.5 Backend — Fase 5: Caja chica

- Los gastos de un `ExpenseReport` con `isCajaChica: true` son `Expense` como cualquier otro (vinculados por `expenseReportId`) — al quedar la cadena de aprobación a nivel de comprobante (Fase 4, decisión riesgo 1), la caja chica **hereda automáticamente** el mismo mecanismo N1/N2/[N2 sel]/Contabilidad sin lógica adicional en el motor. Sigue aplicando solo a `ExpenseReport.isCajaChica` (decisión 7.0), **no** al fondo `PettyCash`.
- Lo que sí falta específicamente para caja chica: hoy el reporte de caja chica no pasa por los estados `submitted`/`pending_accounting` que sí usan rendición normal y directa (está limitado a `draft|finalized`, ver §2.6). Hay que sumar esos estados intermedios al ciclo de vida del reporte de caja chica para que la agregación de estado de sus `Expense` (misma lógica de la Fase 4) tenga dónde reflejarse antes de `finalized`.
- `PettyCash` (el fondo) queda **fuera de alcance**, sin cambios.

### 7.6 Frontend — Fase 6: Configuración

- `centros-de-costo/form/` (+ `project.interface.ts`, `bulk-import/`): reemplazar el campo único "Aprobador" por una UI de **niveles** (agregar/quitar N1, N2, N3…, cada uno con selector multi-usuario). Debe permitir dejar un nivel vacío sin afectar a los demás (regla 1.6).
- `admin-users/user-permissions/`: además de `projectIds` (ya existente), agregar selector de **centro principal** explícito (radio/estrella sobre la lista de centros asignados) que persista `primaryProjectId`.

### 7.7 Frontend — Fase 7: Flujo y visualización

- `viaticos-detail/`: reemplazar los checks `canApproveL1()/canApproveL2()` por "¿soy uno de los `approverIds` del paso pendiente de esta solicitud?" (cadena a nivel de reporte, sin cambios de granularidad respecto al plan original).
- `rendicion-detail/` (+ nueva vista de caja chica): con la aprobación por documento (decisión riesgo 1), la UI **conserva su forma actual** de lista de comprobantes con acción aprobar/rechazar por ítem — el cambio es que cada comprobante ahora expone su propia cadena N1/N2/[N2 sel]/Contabilidad en vez de un botón binario "aprobar como coordinador". Mostrar por comprobante: el paso actual, quién aprobó cada nivel, los niveles **omitidos** por slot vacío (1.6) y los pasos **escalados** (1.5, "escalado desde N_"). El batch-approve conserva su UX (aprobar varios comprobantes a la vez) pero cada uno avanza solo su paso actual.
- `mis-rendiciones/nueva-caja-chica/`, `rendiciones-caja-chica/`: agregar la vista de aprobación (pasos + acciones aprobar/rechazar) inexistente hoy.
- `inicio/`, `dashboard/`, `tesoreria/`: ajustar bandejas de "pendientes por aprobar" para leer `approverIds` del paso actual en vez de `coordinatorId`/flags de rol; incluir caja chica.
- Eliminar `solicitud-viaticos-modal.component.ts` y sus referencias en `rendicion-detail.component.html` (parte del retiro del módulo `Advance`, Fase 3).

### 7.8 Orden recomendado y dependencias

```
7.1 Modelo de datos ─┬─► 7.2 Motor de resolución ─┬─► 7.3 Solicitud (viático) ─► 7.6 Config UI centro de costo
                     │                             │                                          │
                     │                             ├─► 7.4 Rendición (normal+directa)         │
                     │                             │                                          ▼
                     │                             └─► 7.5 Caja chica                    7.7 Flujo/visualización UI
                     └─► 7.6 Config UI usuario (principal) ────────────────────────────────────┘
```

7.1 y 7.2 son prerrequisito de todo lo demás. 7.3 (solicitud), 7.4 (rendición normal + directa, a nivel de `Expense`) y 7.5 (caja chica, hereda de 7.4) pueden avanzar en paralelo una vez que 7.2 esté listo, ya que comparten el mismo motor mediante `buildSolicitudChain`/`buildRendicionChain`. El frontend de configuración (7.6) puede empezar en paralelo a 7.2 (solo depende del esquema de 7.1). El frontend de flujo/visualización (7.7) depende de que el backend correspondiente (7.3/7.4/7.5) esté desplegado. Los borrados de base de datos de §7.2 y §7.3 se ejecutan **una sola vez, inmediatamente antes** de desplegar 7.3/7.4 en el ambiente de desarrollo — no son parte del código de la aplicación, son un paso operativo del corte.

### 7.9 Riesgos y validaciones pendientes con el equipo de producto

Los 3 riesgos originales (aprobación por-comprobante, alcance de `Advance`, formato de cadena en vuelo) **ya fueron resueltos** — ver §7.0.1 y su reflejo en el diseño de §7.2/§7.3/§7.4. Quedan estos puntos abiertos, más acotados, que surgieron al detallar esas decisiones:

- **Filtro exacto de borrado de `Advance` legacy (§7.3):** confirmar que `{ projectId, startDate, endDate, place }` (los 4 campos exclusivos de `createViaticoSolicitud`) identifican sin falsos positivos a los `Advance` de viático, y que ningún `Advance` creado por `createSimpleAdvance` los tiene poblados — revisar contra datos reales del ambiente de desarrollo antes de correr el `deleteMany`.
- **Ventana de corte para el borrado de documentos en vuelo (§7.2):** decidir si se congela la creación de solicitudes/rendiciones un momento antes de correr los `deleteMany`/`updateMany` (para no borrar algo creado segundos antes del corte), o si se acepta el riesgo dado que es ambiente de desarrollo.
- **`Expense.proyectId` vs. reparto multi-proyecto (§7.4):** confirmar con el equipo que la cadena de aprobación debe calcularse siempre sobre `Expense.proyectId` (el campo principal del comprobante) y no sobre `MobilityRow.proyectId`/`ExpenseAnalyticDetail.proyectId` (sub-reparto por fila o por asiento contable, propio de rendiciones directas y del desglose contable).
- **Aprobación por-comprobante vs. bloqueo del reporte completo:** con la cadena ahora por documento, un reporte puede quedar con comprobantes en distintos niveles de aprobación simultáneamente (uno recién enviado, otro ya en Contabilidad). Confirmar que el estado agregado del reporte (`open/submitted/pending_accounting/approved`) debe esperar a que **todos** los comprobantes completen su cadena antes de avanzar — es el comportamiento implícito de mantener "aprobación por documento", pero vale confirmarlo explícitamente ya que cambia cómo se ve el progreso de una rendición con muchos comprobantes.
