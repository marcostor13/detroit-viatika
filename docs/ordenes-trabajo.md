# Órdenes de Trabajo (OT)

Módulo CRUD para gestionar las Órdenes de Trabajo usadas para imputar el gasto de una factura a un centro de costo.

## Estructura

Cada OT tiene tres campos:

| Campo | Descripción |
|---|---|
| **Nombre** | Texto libre que escribe el usuario (ej. `Lim-Com-1`). Es el identificador visible de la OT y **único por empresa** (índice `{ nombre, clientId }`) — dos empresas distintas pueden repetir el mismo nombre, la misma empresa no. |
| **Centros de costo** | Lista de referencias a `Project` (`costCenterIds`). Una OT puede usarse desde **varios** centros de costo (las OT `SMI` se cargan desde los cinco centros de SERVICIO MINERIA: 123, 223, 423, 523 y 823). El **primero es el principal** y se guarda además en `costCenterId`: es el que muestran los reportes oficiales, que llevan un único centro de costo por OT. |
| **Estado** | `isActive` — Activa / Inactiva. |

Nombre y centros de costo son editables en cualquier momento (a diferencia de un código autogenerado inmutable).

## Permisos y acceso

El módulo se protege igual que los demás maestros administrativos de la app (Centros de Costo, Categorías, Líneas de Negocio, Perfiles de Categoría): **no tiene un permiso granular propio**, sino que usa el guard `AuthAdmin2Guard` en el frontend y `@Roles(...)` en el backend.

- **Quién puede crear / editar / eliminar:** rol **Administrador** o **Contabilidad** (frontend), y adicionalmente **Superadministrador** a nivel de API.
- **Quién puede solo ver (listar/consultar):** cualquier usuario autenticado (Administrador, Contabilidad, Colaborador, Superadministrador) vía `GET`.
- El enlace **"Órdenes de Trabajo"** aparece en el sidebar dentro del grupo colapsable **Configuración**, junto a Centros de Costo, Categorías, Líneas de Negocio y Perfiles de Categoría.

## Archivos

### Backend — `viatika-back/src/modules/orden-trabajo/`

| Archivo | Contenido |
|---|---|
| `entities/orden-trabajo.entity.ts` | Schema `OrdenTrabajo` (`nombre`, `costCenterId` principal, `costCenterIds` lista, ambos ref `Project`, `isActive`, `clientId`). Índice único `{ nombre, clientId }`; índices de búsqueda `{ clientId, costCenterId }` y `{ clientId, costCenterIds }` (multiclave). |
| `dto/create-orden-trabajo.dto.ts` | `nombre` (requerido), `costCenterIds` (lista de `IsMongoId`; el primero es el principal), `costCenterId` (opcional, compatibilidad: equivale a una lista de uno), `isActive` (opcional). Tiene que llegar al menos uno de los dos campos de centro de costo. |
| `dto/update-orden-trabajo.dto.ts` | `nombre`, `costCenterIds` (o `costCenterId`), `isActive` — todos opcionales; se puede renombrar, reasignar los centros de costo o activar/desactivar |
| `orden-trabajo.service.ts` | CRUD; valida que cada centro de costo exista y pertenezca a la empresa (`assertCostCenters`, sin repetidos); mantiene `costCenterId` = primero de la lista; filtra por `costCenterIds`; valida unicidad de `nombre` por empresa (`ensureUniqueNombre`). La carga masiva admite varios centros de costo en la misma celda separados por coma, punto y coma o barra. |
| `orden-trabajo.controller.ts` | Endpoints REST + `@Roles` + registro en audit log |
| `orden-trabajo.module.ts` | Registro de schema y providers |

Registrado en `viatika-back/src/app.module.ts`. Acciones de auditoría en `AuditAction` (`audit-log/entities/audit-log.entity.ts`): `create_orden_trabajo`, `update_orden_trabajo`, `delete_orden_trabajo`.

### Frontend — `viatika/src/app/modules/ordenes-trabajo/`

| Archivo | Contenido |
|---|---|
| `ordenes-trabajo.component.ts/html` | Lista con búsqueda por nombre, filtro por centro de costo, tabla (`app-data-table`, columnas Nombre / Centros de costo — un chip por centro, el principal destacado — / Estado / Creado / Acciones), paginación |
| `form/ordenes-trabajo-form.component.ts/html` | Crear/Editar: Nombre, Centros de costo (buscador + lista de checkboxes; chips arriba con el elegido, se toca un chip para volverlo principal), Activo (checkbox) — todos editables |

Además: `services/orden-trabajo.service.ts`, `interfaces/orden-trabajo.interface.ts` (`IOrdenTrabajo`: `_id`, `nombre`, `costCenterId` y `costCenterIds` — string o poblado `{_id, code?, name, isActive?}` —, `isActive`, `clientId`, `createdAt`, `updatedAt`). Ahí viven los helpers compartidos `otCentroCostoIds`, `otPerteneceACentroCosto`, `otCentroCostoLabel` y `otCentroCostoLabels`: **toda pantalla que filtre OT por centro de costo usa `otPerteneceACentroCosto`**, nunca compara `costCenterId` a mano (antes cada pantalla tenía su propia copia del helper y solo miraba el principal).

Rutas registradas en `app.routes.ts`: `/ordenes-trabajo`, `/ordenes-trabajo/nueva`, `/ordenes-trabajo/:id/editar`, todas con `AuthAdmin2Guard`. Enlace en `components/sidebar/sidebar.component.html` (versión escritorio y móvil).

## Endpoints

| Método | Ruta | Roles |
|---|---|---|
| `POST` | `/orden-trabajo` | Superadmin, Admin, Contabilidad |
| `GET` | `/orden-trabajo/:clientId` | Superadmin, Admin, Colaborador, Contabilidad — acepta `?page&limit&search&costCenterId` |
| `GET` | `/orden-trabajo/:id/:clientId` | Superadmin, Admin, Colaborador, Contabilidad |
| `PATCH` | `/orden-trabajo/:id` | Superadmin, Admin, Contabilidad |
| `DELETE` | `/orden-trabajo/:id` | Superadmin, Admin, Contabilidad |

| `POST` | `/orden-trabajo/import` | Superadmin, Admin, Contabilidad — Excel (multipart, máx. 2 MB) |

El `clientId` en `GET` se resuelve automáticamente (interceptor HTTP del frontend lo agrega a la URL); en `POST` se inyecta en el body; en `PATCH`/`DELETE` se resuelve en el backend desde el JWT.

## Carga masiva por Excel (VD-101)

El botón **Descargar Excel** de `/ordenes-trabajo` baja el archivo **con las OT que ya existen**, no una plantilla vacía. Se edita y se vuelve a subir con **Importar Excel**: las filas cuyo nombre ya existe en la empresa se **actualizan** y las nuevas se **crean** (`bulkCreate` es actualizar-o-crear; la llave es el `nombre`, único por empresa). Ninguna fila borra nada: para dar de baja una OT se pone `No` en Activo.

Columnas, en el vocabulario del informe de órdenes de Detroit:

| Columna | Requerida | Qué hace |
|---|---|---|
| `Suc` | No | Sucursal (LIM, ANT, TOQ…) |
| `Dep` | No | Departamento (SMI, SCA, COM, TAL, ABA, ICO…) |
| `Nº O/T` | No | Número de la orden tal como sale del informe (`00001463-G`); se le quitan los ceros de la izquierda |
| `Nombre` | Sí, o `Suc`+`Dep`+`Nº O/T` | Nombre único de la OT. Si viene vacío se arma como `Suc-Dep-Nº` → `LIM-SMI-1463-G`, que es como están cargadas hoy. Si viene, manda sobre las tres anteriores |
| `Centros de Costo*` | Sí en OT nuevas | Uno o varios **códigos** separados por coma/punto y coma/barra (`123, 223, 423`); el primero es el principal. Vacío en una OT existente = no se tocan los que tiene |
| `Activo` | No | `Sí`/`No`. **Vacío = no se cambia** (una OT nueva se crea activa). Así un archivo sin esa columna no reactiva OT dadas de baja |

Se siguen aceptando los encabezados de la plantilla anterior (`Nombre*`, `Código Centro de Costo*`, `Centro de Costo`) para no romper archivos ya armados. El mapeo de columnas está en `orden-trabajo.controller.ts` (`celda`, `nombreDesdeFormatoDetroit`) y el alta/actualización en `orden-trabajo.service.ts` (`bulkCreate`), que devuelve `{ created, updated, errors[] }` — una fila mala no aborta el lote.

**Ojo:** el informe del ERP *tal como sale* (`Reporte de OTS Vigentes.xlsx`) **no se puede subir directo**: trae tres filas de título y la cabecera partida en dos, y el importador espera los encabezados en la primera fila. Lo que se usa es el archivo que descarga la app, donde las columnas `Suc`/`Dep`/`Nº O/T` permiten pegar los datos del informe.

## Dónde se consume la OT (además del CRUD)

### Solicitud de viáticos

`viatika/src/app/modules/mis-rendiciones/solicitud-viaticos/` — selector opcional de OT justo debajo del selector de Centro de Costo, **filtrado por el centro de costo elegido** (la OT aparece si ese centro está entre sus `costCenterIds`). Si el colaborador cambia de centro de costo y la OT ya elegida no pertenece al nuevo, se limpia automáticamente (`clearOtIfNotInCostCenter`). Se persiste en el viático unificado (`ExpenseReport` `type: 'viatico'`) en el campo `viaticoOrdenTrabajoId`, poblado con `'nombre costCenterId'` en `findOne`, `findOneWithAdvances`, `findAllByUser`, `findViaticos` y `findMyViaticos`. Se restaura al editar/reenviar una solicitud rechazada.

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
