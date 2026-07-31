# VIATIKA — Mapa de Progreso de Implementación

> Referencia rápida para evitar trabajo duplicado. Actualizar al iniciar/terminar cada funcionalidad.
> Última actualización: 2026-05-05 (sesión 2)

---

## Estado general

| Fase | Funcionalidades | Implementadas | Parciales | Pendientes |
|------|:-:|:-:|:-:|:-:|
| Fase 1 — Configuración Inicial | 6 | 4 | 0 | 2 |
| Fase 2 — Solicitud de Viáticos | 2 | 0 | 1 | 1 |
| Fase 3 — Aprobación de Viáticos | 2 | 2 | 0 | 0 |
| Fase 4 — Gestión de Pago por Tesorería | 3 | 1 | 0 | 2 |
| Fase 5 — Ingreso y Validación de Gastos | 13 | 0 | 3 | 10 |
| Fase 6 — Gestión de Reembolsos | 1 | 1 | 0 | 0 |
| Fase 7 — Devolución de Saldos | 1 | 1 | 0 | 0 |
| Fase 8 — Cierre Definitivo de la Rendición | 1 | 0 | 1 | 0 |
| Fase 9 — Reembolso Directo | 2 | 0 | 0 | 2 |
| Fase 10 — Caja Chica | 3 | 0 | 0 | 3 |
| Transversales | 11 | 4 | 2 | 5 |
| **TOTAL** | **45** | **11** | **9** | **25** |

---

## Leyenda

- `[x]` Implementado — backend + frontend funcional
- `[~]` Parcial — existe el módulo pero faltan campos o flujos críticos
- `[ ]` Pendiente — no iniciado

---

## Fase 1 — Configuración Inicial

### FUNC-01-01 — Gestión CRUD de Centros de Costo `[x]`
- Módulo backend: `project`
- Métodos: `create`, `findAll`, `findOne`, `update`, `remove`
- Campos: `name`, `code` (único por cliente, auto-generado), `isActive`
- Frontend: formulario con `code` opcional e `isActive` toggle, tabla con estado y código.

### FUNC-01-02 — Carga Masiva de Centros de Costo desde Excel `[ ]`
- Módulo backend: no existe
- Pendiente: endpoint `POST /project/bulk-import`, lectura de Excel (xlsx), validación de duplicados, plantilla descargable.

### FUNC-01-03 — Administración de Categorías de Gasto con Límites `[x]`
- Módulo backend: `category`
- Métodos: `create`, `findAll` (paginado+jerarquía), `findAllFlat`, `findOne`, `findByKey`, `update`, `remove`
- Campos: `name`, `key` (auto-generado), `description`, `isActive`, `limit` (monto máximo, null = sin límite), `parentId`
- Frontend: CRUD completo con jerarquía expandible, buscador, paginación, formulario con límite visible.
- Pendiente: lógica de alerta al 90% y bloqueo al 100% (se implementará en validación de gastos, Fase 5).

### FUNC-01-04 — Carga Masiva de Usuarios desde Excel `[ ]`
- Módulo backend: no existe
- Pendiente: endpoint `POST /user/bulk-import`, lectura de Excel, asignación de coordinador, envío de credenciales por email.

### FUNC-01-05 — Gestión de Usuarios y Permisos Granulares `[~]`
- Módulo backend: `user`
- Métodos: `findAllWithClient`, `findByEmail`, `findOne`, `create`, `findAll`, `update`, `delete`, `findAdminsByClient`
- Módulo: `user-permissions` (frontend)
- Notas: CRUD completo. Permisos granulares en JWT. **Gap:** no hay `isActive` toggle con advertencia de rendiciones abiertas, no hay forzar cambio de contraseña en primer login, no hay reset de contraseña por admin.

### FUNC-01-06 — Registro de Firma Digital del Usuario `[ ]`
- Módulo backend: no existe (upload existe pero no vinculado a firma)
- Pendiente: campo `signatureUrl` en user schema, endpoint de upload de firma, bloqueo de operaciones transaccionales sin firma.

---

## Fase 2 — Solicitud de Viáticos

### FUNC-02-01 — Formulario de Solicitud de Viáticos `[~]`
- Módulo backend: `advance`
- Notas: El módulo `advance` maneja la solicitud de anticipo monetario, no el formulario de viáticos con filas por categoría. **Gap:** el schema no tiene `destination` (lugar con lat/long), `startDate`, `endDate`, `projectId`, ni `detailRows[]`. La "solicitud de viáticos" tal como se describe en el documento puede ser diferente de un "anticipo".

### FUNC-02-02 — Notificación Automática al Coordinador `[ ]`
- Módulo backend: `email`, `notifications` (existen)
- Notas: El módulo email existe pero no hay lógica de disparo automático al crear solicitud ni retry.

---

## Fase 3 — Aprobación de Viáticos

### FUNC-03-01 — Rechazo de Solicitud de Viáticos `[x]`
- Módulo backend: `advance` → método `reject`
- Valida estados `pending_l1` / `pending_l2`, registra motivo en `approvalHistory`.

### FUNC-03-02 — Aprobación de Solicitud de Viáticos `[x]`
- Módulo backend: `advance` → métodos `approveL1`, `approveL2`
- Umbral L1_MAX = 500, flujo 1 o 2 niveles según monto.

---

## Fase 4 — Gestión de Pago por Tesorería

### FUNC-04-01 — Registro de Pago de Anticipo `[x]`
- Módulo backend: `advance` → método `registerPayment`
- Registra `paymentInfo` (método, banco, cuenta, CCI, fecha, referencia), cambia estado a `paid`.

### FUNC-04-02 — Ampliación de Presupuesto `[ ]`
- No implementado. Requiere flujo separado de solicitud de ampliación de límite de categoría.

### FUNC-04-03 — Notificación de Pago al Colaborador `[ ]`
- No implementado. Email automático al registrar pago.

---

## Fase 5 — Ingreso y Validación de Gastos

### FUNC-05-01 — Registro de Gasto Individual `[~]`
- Módulo backend: `expense`
- Estado: módulo existe, falta revisar campos completos.

### FUNC-05-02 a FUNC-05-13 `[ ]`
- Pendiente: OCR de facturas, validación SUNAT, gastos de combustible, adjuntos múltiples, etc.
- Módulo `sunat-config` existe. `upload` existe.

---

## Fase 6 — Gestión de Reembolsos

### FUNC-06-01 — Liquidación y Reembolso `[x]`
- Módulo backend: `advance` → método `settle`
- Calcula diferencia anticipo vs gastos reales, determina tipo (`reembolso` / `devolucion` / `equilibrado`).

---

## Fase 7 — Devolución de Saldos a Favor de la Empresa

### FUNC-07-01 — Registro de Devolución `[x]`
- Módulo backend: `advance` → método `registerReturn`
- Estados válidos: `paid` o `settled`.

---

## Fase 8 — Cierre Definitivo de la Rendición

### FUNC-08-01 — Cierre de Rendición `[~]`
- Módulo backend: `expense-report`
- Estado: módulo existe con `updateSettlement`. Falta flujo de cierre con firma digital y generación de PDF.

---

## Fase 9 — Reembolso Directo

### FUNC-09-01 — Solicitud de Reembolso Directo `[ ]`
### FUNC-09-02 — Aprobación de Reembolso Directo `[ ]`
- No implementado. Flujo alternativo sin anticipo previo.

---

## Fase 10 — Caja Chica

### FUNC-10-01 a FUNC-10-03 `[ ]`
- No implementado. Módulo separado de caja chica.

---

## Transversales

### T-01 — Autenticación y Autorización `[x]`
- Módulo: `auth`, `user`
- JWT con roles y permisos en payload. Guards: `JwtAuthGuard`, `RolesGuard`.

### T-02 — Asistente AI (Viatika AI) `[x]`
- Módulo backend: `ai` → endpoint `POST /ai/chat`
- Frontend: `ai-assistant` component con SSE streaming
- Skills implementadas: `get_my_expense_reports`, `get_my_advances`, `get_pending_approvals`, `get_expense_summary`

### T-03 — Gestión de Clientes/Empresas `[x]`
- Módulo: `client`

### T-04 — Roles del Sistema `[x]`
- Módulo: `role` (Superadministrador, Administrador, Colaborador)

### T-05 — Notificaciones Email `[~]`
- Módulo: `email`, `notifications`
- Existe infraestructura pero no los disparadores automáticos por flujo.

### T-06 — Upload de Archivos (S3) `[~]`
- Módulo: `upload`
- Existe endpoint. Falta integración con firma digital y adjuntos de gastos.

### T-07 — Bitácora de Auditoría `[ ]`
- Módulo: `audit-log` (existe pero sin llamadas desde otros servicios)

### T-08 — Firma Digital `[ ]`
- No implementado. Requiere campo en user + validación en operaciones transaccionales.

### T-09 — Consolidado `[ ]`
- Módulo frontend existe. Backend pendiente.

### T-10 — Configuración SUNAT `[~]`
- Módulo: `sunat-config` (existe). Integración OCR/validación pendiente.

### T-11 — Paginación y Filtros Avanzados `[ ]`
- Los endpoints actuales devuelven todos los registros sin paginación.

---

## Módulos backend existentes

| Módulo | Descripción | Estado |
|--------|-------------|--------|
| `advance` | Anticipo/Viático: aprobación, pago, liquidación | Completo |
| `ai` | Asistente IA con herramientas | Completo |
| `audit-log` | Bitácora de auditoría | Sin integrar |
| `auth` | Login, registro, JWT | Completo |
| `category` | Categorías de gasto | Parcial (falta `limit`) |
| `client` | Gestión de empresas | Completo |
| `email` | Envío de emails | Infraestructura lista |
| `expense` | Gastos individuales | Parcial |
| `expense-report` | Rendición/reporte de gastos | Parcial |
| `invoice` | Facturas | Parcial |
| `notifications` | Notificaciones in-app | Parcial |
| `project` | Centros de costo | Parcial (falta `code`, `isActive`) |
| `role` | Roles del sistema | Completo |
| `sunat-config` | Config. SUNAT | Parcial |
| `upload` | Upload a S3 | Completo |
| `user` | Usuarios y permisos | Parcial (falta reset pw, desactivación) |

---

## Pruebas unitarias

| Módulo | Archivo spec | Estado |
|--------|-------------|--------|
| `advance` | `advance.service.spec.ts` | Creado |
| `project` | `project.service.spec.ts` | Creado |
| `category` | `category.service.spec.ts` | Creado |
| `auth` | `auth.service.spec.ts` | Creado |
| `user` | `user.service.spec.ts` | Creado |
