# Órdenes de Trabajo (OT)

Módulo CRUD para gestionar las Órdenes de Trabajo usadas para imputar el gasto de una factura a un centro de costo.

## Estructura

Cada OT tiene tres campos:

| Campo | Descripción |
|---|---|
| **Nombre** | Texto libre que escribe el usuario (ej. `Lim-Com-1`). Es el identificador visible de la OT y **único por empresa** (índice `{ nombre, clientId }`) — dos empresas distintas pueden repetir el mismo nombre, la misma empresa no. |
| **Centro de costo** | Referencia a un `Project` (centro de costo). Relación **1 centro de costo → N OT**. |
| **Estado** | `isActive` — Activa / Inactiva. |

Nombre y Centro de costo son editables en cualquier momento (a diferencia de un código autogenerado inmutable).

## Permisos y acceso

El módulo se protege igual que los demás maestros administrativos de la app (Centros de Costo, Categorías, Líneas de Negocio, Perfiles de Categoría): **no tiene un permiso granular propio**, sino que usa el guard `AuthAdmin2Guard` en el frontend y `@Roles(...)` en el backend.

- **Quién puede crear / editar / eliminar:** rol **Administrador** o **Contabilidad** (frontend), y adicionalmente **Superadministrador** a nivel de API.
- **Quién puede solo ver (listar/consultar):** cualquier usuario autenticado (Administrador, Contabilidad, Colaborador, Superadministrador) vía `GET`.
- El enlace **"Órdenes de Trabajo"** aparece en el sidebar dentro del grupo colapsable **Configuración**, junto a Centros de Costo, Categorías, Líneas de Negocio y Perfiles de Categoría.

## Archivos

### Backend — `viatika-back/src/modules/orden-trabajo/`

| Archivo | Contenido |
|---|---|
| `entities/orden-trabajo.entity.ts` | Schema `OrdenTrabajo` (`nombre`, `costCenterId` ref `Project`, `isActive`, `clientId`). Índice único `{ nombre, clientId }`; índice de búsqueda `{ clientId, costCenterId }`. |
| `dto/create-orden-trabajo.dto.ts` | `nombre` (requerido), `costCenterId` (requerido, `IsMongoId`), `isActive` (opcional) |
| `dto/update-orden-trabajo.dto.ts` | `nombre`, `costCenterId`, `isActive` — todos opcionales; se puede renombrar, reasignar de centro de costo o activar/desactivar |
| `orden-trabajo.service.ts` | CRUD; valida que `costCenterId` exista y pertenezca a la empresa (`assertCostCenter`); valida unicidad de `nombre` por empresa (`ensureUniqueNombre`) |
| `orden-trabajo.controller.ts` | Endpoints REST + `@Roles` + registro en audit log |
| `orden-trabajo.module.ts` | Registro de schema y providers |

Registrado en `viatika-back/src/app.module.ts`. Acciones de auditoría en `AuditAction` (`audit-log/entities/audit-log.entity.ts`): `create_orden_trabajo`, `update_orden_trabajo`, `delete_orden_trabajo`.

### Frontend — `viatika/src/app/modules/ordenes-trabajo/`

| Archivo | Contenido |
|---|---|
| `ordenes-trabajo.component.ts/html` | Lista con búsqueda por nombre, filtro por centro de costo, tabla (`app-data-table`, columnas Nombre / Centro de costo / Estado / Creado / Acciones), paginación |
| `form/ordenes-trabajo-form.component.ts/html` | Crear/Editar: Nombre (`app-input`), Centro de Costo (`app-project-select`), Activo (checkbox) — todos editables |

Además: `services/orden-trabajo.service.ts`, `interfaces/orden-trabajo.interface.ts` (`IOrdenTrabajo`: `_id`, `nombre`, `costCenterId` — string o poblado `{_id, code?, name, isActive?}` —, `isActive`, `clientId`, `createdAt`, `updatedAt`).

Rutas registradas en `app.routes.ts`: `/ordenes-trabajo`, `/ordenes-trabajo/nueva`, `/ordenes-trabajo/:id/editar`, todas con `AuthAdmin2Guard`. Enlace en `components/sidebar/sidebar.component.html` (versión escritorio y móvil).

## Endpoints

| Método | Ruta | Roles |
|---|---|---|
| `POST` | `/orden-trabajo` | Superadmin, Admin, Contabilidad |
| `GET` | `/orden-trabajo/:clientId` | Superadmin, Admin, Colaborador, Contabilidad — acepta `?page&limit&search&costCenterId` |
| `GET` | `/orden-trabajo/:id/:clientId` | Superadmin, Admin, Colaborador, Contabilidad |
| `PATCH` | `/orden-trabajo/:id` | Superadmin, Admin, Contabilidad |
| `DELETE` | `/orden-trabajo/:id` | Superadmin, Admin, Contabilidad |

El `clientId` en `GET` se resuelve automáticamente (interceptor HTTP del frontend lo agrega a la URL); en `POST` se inyecta en el body; en `PATCH`/`DELETE` se resuelve en el backend desde el JWT.

## Dónde se consume la OT (además del CRUD)

### Solicitud de viáticos

`viatika/src/app/modules/mis-rendiciones/solicitud-viaticos/` — selector opcional de OT justo debajo del selector de Centro de Costo, **filtrado por el centro de costo elegido** (una OT pertenece a un único centro de costo). Si el colaborador cambia de centro de costo y la OT ya elegida no pertenece al nuevo, se limpia automáticamente (`clearOtIfNotInCostCenter`). Se persiste en el viático unificado (`ExpenseReport` `type: 'viatico'`) en el campo `viaticoOrdenTrabajoId`, poblado con `'nombre costCenterId'` en `findOne`, `findOneWithAdvances`, `findAllByUser`, `findViaticos` y `findMyViaticos`. Se restaura al editar/reenviar una solicitud rechazada.

No se extendió al flujo legado `/viaticos/:id` (`ViaticosDetailComponent`, basado en `Advance`) — ese es el sistema anterior a la unificación de viáticos.

### Planilla de movilidad (comprobante)

El formato oficial de la empresa (**ADF-FOR-005**) exige la OT como campo de cabecera, junto al Centro de Costo. Por eso, a diferencia del viático, aquí la OT es **obligatoria**, no opcional:

- Backend: campo `ordenTrabajoId` en `Expense` (`viatika-back/src/modules/expense/entities/expense.entity.ts`), junto a `proyectId`. Validado como requerido en `ExpenseService.createMobilitySheet()`.
- Frontend: selector "Orden de Trabajo" en `viatika/src/app/modules/invoices/add-invoice/`, visible solo cuando `expenseType() === 'planilla_movilidad'`. Lista todas las OT activas de la empresa (sin filtrar por centro de costo elegido).
- La OT vive a nivel de todo el comprobante, no por fila de movilidad.

**Excepción: viático sin OT.** La OT es opcional al solicitar el viático y la planilla la hereda de la solicitud (VD-28, campo deshabilitado). Si la solicitud no llevó OT no hay ninguna que heredar ni que el colaborador pueda elegir, así que el campo **no se muestra ni se exige**: `viaticoSinOrdenTrabajo()` en el formulario y `ExpenseReportService.isViaticoSinOrdenTrabajo()` en `createMobilitySheet()`. En rendiciones directas y fuera de un viático la OT sigue siendo obligatoria.

El selector lista las OT del centro de costo de la rendición **más la OT heredada**, aunque esta sea de otro centro de costo o esté desactivada: sin ese añadido `app-search-select` no encuentra la opción y muestra el placeholder, con lo que el campo parece vacío aunque la rendición sí tenga OT.

## Historial

Este módulo pasó por dos diseños:

1. **Original** (el actual, descrito arriba): `nombre` + `costCenterId`, ambos editables.
2. **Rediseño temporal** (2026-07-02/03 a 2026-07-16): se reemplazó por `departamento` (tabla fija de 6 valores) + `codigo` autogenerado (`LIM-{depto}-{correlativo}`, con contador atómico por departamento/empresa), inmutables tras la creación. Ese rediseño se implementó solo en el **frontend** (interfaz, servicio, lista, formulario) y en esta documentación; el **backend nunca se migró** — `entity`/`DTOs`/`service`/`controller` siguieron devolviendo `nombre`/`costCenterId` todo este tiempo, igual que los consumidores backend (`expense-report.service.ts`, `expense.service.ts`, que ya populaban `'nombre costCenterId'`).

   Esto causó que la lista de OT dejara de mostrar Nombre/Centro de costo (el frontend pedía `codigo`/`departamento`, que el backend nunca devolvió) y que crear una OT nueva fallara (el formulario nuevo enviaba `departamento`, el backend exigía `nombre`+`costCenterId`). Se detectó y revirtió el 2026-07-16, restaurando el frontend al diseño original que el backend siempre tuvo. **No queda ningún rastro del diseño por departamento** — ni tabla de departamentos, ni prefijo `LIM`, ni contador atómico — en el código actual.
