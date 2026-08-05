# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Approach

- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Don't guess APIs, versions, flags, or package names. Verify by reading code or docs first.
- Return code first. Explanation after, only if non-obvious.
- Prefer editing over rewriting whole files.
- Never speculate without reading relevant code first.
- State bug, location, and fix in one step. No suggestions outside scope.
- Keep solutions simple and direct.
- User instructions always override this file.

---

# Commands

## Frontend (`viatika/`)

```bash
npm run start        # dev server on :4200
npm run build        # production build
npm run test         # Karma/Jasmine (all tests)
```

## Backend (`viatika-back/`)

```bash
npm run start:dev    # watch mode on :3016
npm run build        # nest build
npm run test         # jest (all tests)
npm run test:watch   # jest --watch
npm run test:cov     # jest --coverage
npx jest --testPathPattern=expense-report   # single test file
npm run lint         # eslint --fix
npm run seed         # seed initial data
```

---

# Architecture

## Project Layout

```
code-viatika/
  viatika/          Angular 19 frontend (signals, Tailwind CSS)
  viatika-back/     NestJS 11 backend (MongoDB/Mongoose, JWT)
```

Backend global prefix: `/api`. CORS open to all origins.

## Multi-Tenant Pattern

Every schema includes `clientId` (ref: `Client`). All queries must be scoped to `clientId`. The JWT payload includes `clientId` so controllers can extract it from `req.user` without an extra DB call.

## Backend Module Anatomy

Each feature under `viatika-back/src/modules/<name>/` follows the standard NestJS pattern: `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, `schemas/<name>.schema.ts`, `dto/`, optional `guards/` and `enums/`. Key modules:

- **auth** — JWT + local + Google OAuth strategies; `JwtAuthGuard`, `RolesGuard`; login builds JWT payload including `permissions` and `clientId`
- **user** — Schema with `permissions: { modules, canApproveL1, canApproveL2 }`; `PATCH /user/:id/permissions`
- **advance** — Viaticos/anticipo multi-level approval engine (see Advance Flow below)
- **expense-report** — Rendiciones (collections of expense invoices); `submitted → approved → …`
- **invoice** — Individual comprobantes (factura, planilla_movilidad, recibo_caja, otros_gastos); S3-backed file upload
- **upload** — AWS S3 integration; used by invoice and advance for file storage
- **ai** — OpenAI only (`gpt-5.1` vision for invoice OCR in `expense.service.ts`, `gpt-4o` for the conversational assistant in `ai/providers/openai.provider.ts`); PDF parse + OCR (tesseract.js) for document extraction. `@anthropic-ai/sdk` and `@google/genai` are in `package.json` but unused — no Claude/Gemini provider exists in code.
- **email** — Nodemailer via `@nestjs-modules/mailer`; coordinator/approval notifications
- **audit-log** — Immutable action log; called from service layer, not controller

## Frontend Architecture

**State** — `UserStateService` (`src/app/services/user-state.service.ts`) holds the logged-in user as an Angular signal, persisted in `localStorage`. All role/permission checks go through this service. Never read `localStorage` directly elsewhere.

**Routing guards** — `src/app/guards/`. Function guards (`authModuleGuard`) and class guards (`AuthTesoreroGuard`, etc.) redirect based on role + permissions. The `authModuleGuard(module, bypassForAdmin)` factory is the standard pattern for module-gated routes.

**PDF/Excel generation** — Frontend uses `jsPDF` + `jspdf-autotable` for PDFs and `ExcelJS` for spreadsheets. These are already installed; import from `jspdf`, `jspdf-autotable`, `exceljs`.

**HTTP** — Each feature module has a `services/` subfolder with an Angular service using `HttpClient`. No global HTTP wrapper; errors are handled per-call.

**Lazy loading** — All feature routes use `loadComponent` or `loadChildren`. Add new routes the same way.

**Forms and editing** — Create and edit forms must always be independent routed screens, never inline forms or modals. The pattern is: list page at `/resource`, create at `/resource/nueva`, edit at `/resource/:id/editar`. Each form screen has a back button (`router.navigate(['/resource'])`), its own component file, and its own route registered in `app.routes.ts` with the same guard as the list. Never expand a form inside the list component; always navigate.

## UI Kit (`src/app/design-system/`)

Every screen — new or edited — is built exclusively from `src/app/design-system/` components: `app-button`, `app-input`, `app-form-field`, `app-card`, `app-modal`, `app-badge`, `app-tabs`, `app-icon`, `app-empty-state`, `app-data-table`, `app-paginator`, `app-export-button`, `app-project-select`, `app-worker-select`. See `src/app/design-system/README.md` for the usage pattern of each.

Forbidden in new/edited templates:
- Native `<button>`/`<input>` with hand-rolled Tailwind classes — use `app-button`/`app-input` (+ `app-form-field` for non-input controls like select/checkbox/date-picker).
- Raw hex colors or stock Tailwind palette classes (`gray-*`, `red-*`, `green-*`, etc.) — use the tokens in `tailwind.config.js` (`primary`, `secondary`, `tertiary`, `ink-*`, `success`/`success-ink`, `warning`/`warning-ink`, `error`/`error-ink`, `divider`, `background`).
- Hand-pasted inline `<svg>` icons — use `app-icon` (Lucide-backed, sizes `sm`/`md`/`lg`). Add new icon names to the map in `icon.component.ts` as needed.
- One-off modal/overlay markup — use `app-modal` (handles focus trap, Escape, and focus restore).

If a pattern repeats in 2+ screens and no design-system component covers it, build the component before copying the pattern again.

## Invoice (Comprobante) Types

The `expenseType` field on an invoice determines its form and download behavior:

| Value | Description |
|-------|-------------|
| `factura` | Standard invoice with PDF/XML upload |
| `planilla_movilidad` | Mobility payroll sheet; has `movilidadRows[]` line items and `declaracionJurada` |
| `recibo_caja` | Cash receipt; has `receiptFecha`, `receiptProveedor`, `receiptConcepto` |
| `otros_gastos` | Other expenses; requires `declaracionJurada` + `declaracionJuradaFirmante` (auto-set to current user name) |

Schema file: `viatika-back/src/modules/invoice/schemas/invoice.schema.ts`

## Expense Report (Rendición) States

```
open → submitted → approved → paid → settled
     ↘ rejected (returns to open)
```

`expenseIds[]` is populated with full Invoice documents on reads. Validation before `submitted`: at least 1 expense, no rejected expenses.

---

# Viatika — Roles, Permisos y Flujo de Aprobaciones

## Roles del Sistema

Solo existen **3 roles** en la plataforma:

| Rol | Nombre DB | Descripción |
|-----|-----------|-------------|
| Superadministrador | `Superadministrador` | Gestión global de clientes/empresas. Acceso total. |
| Administrador | `Administrador` | Gestiona su empresa: usuarios, aprobaciones, configuración. |
| Colaborador | `Colaborador` | Usuario operativo. Acceso según permisos asignados. |

> El rol `Tesoreria` existe en el sistema (además de `Contabilidad` y `Coordinador`, usados internamente) y tiene autoridad plena de pago: puede registrar pagos de anticipos/viáticos/reembolsos y devoluciones sin necesitar el permiso `canApproveL2` (tratado igual que `Contabilidad`/`Superadministrador` en los checks de `advance.service.ts` y `expense-report.service.ts`). Un colaborador también puede obtener acceso de solo-pantalla a Tesorería vía **permisos por usuario** (`canApproveL2`, módulo `tesoreria`).

---

## Acceso a Módulos por Rol

### Superadministrador
- Clientes (gestión multi-empresa)
- Colaboradores (admin-users)

### Administrador
- Aprobación de Facturas
- Consolidado
- Colaboradores (admin-users)
- Configuración
- Tesorería (siempre habilitada por rol)

### Colaborador (según permisos)
- Mis Rendiciones — siempre (pantalla de inicio del colaborador)
- Facturas — **NO aparece en el menú**; se accede desde el detalle de una rendición ("Añadir Gasto")
- Tesorería — solo si tiene permiso `modules: ['tesoreria']`
- Aprobación de Facturas — solo si tiene permiso `modules: ['invoice-approval']`
- Consolidado — solo si tiene permiso `modules: ['consolidated-invoices']`
- Configuración — solo si tiene permiso `modules: ['configuracion']`

---

## Sistema de Permisos por Usuario

Cada usuario tiene un objeto `permissions` en MongoDB:

```ts
permissions: {
  modules: string[]       // módulos accesibles: 'tesoreria', 'invoice-approval', etc.
  canApproveL1: boolean   // puede aprobar anticipos en nivel 1
  canApproveL2: boolean   // puede aprobar anticipos en nivel 2 y registrar pagos
  projectIds: string[]    // centros de costo asignados
  primaryProjectId?: string
  // Aprobadores propios por nivel (regla 1.10). Cuando hay al menos uno,
  // sustituyen a los del centro de costo principal al armar la cadena de
  // solicitudes y rendiciones. Vacío = se usan los del centro de costo.
  approverLevels?: { level: number; userIds: string[] }[]
}
```

`approverLevels` NO viaja en el JWT: lo lee el motor de cadena desde la base
(`UserService.findTransactionalProfile`). Ver `docs/ReglasAprobacionViaticos-Analisis.md`
(regla 1.10) y `viatika-back/src/modules/advance/approval-chain.util.ts`.

### Módulos disponibles para asignar

| Key | Label |
|-----|-------|
| `invoices` | Facturas |
| `mis-rendiciones` | Mis Rendiciones |
| `invoice-approval` | Aprobación de Facturas |
| `consolidated-invoices` | Consolidado |
| `tesoreria` | Tesorería |
| `configuracion` | Configuración |

### Gestión de permisos
El **Administrador** accede a `/admin-users/:id/permisos` para configurar los permisos de cada colaborador.

---

## Flujo de Aprobación de Anticipos

### Estados del anticipo

```
draft → pending_l1 → [pending_l2] → approved → paid → settled → returned
                  ↘ rejected
```

| Estado | Descripción |
|--------|-------------|
| `draft` | Borrador (no usado actualmente) |
| `pending_l1` | Esperando aprobación nivel 1 |
| `pending_l2` | Esperando aprobación nivel 2 (montos > S/ 500) |
| `approved` | Aprobado, listo para pago |
| `paid` | Pago registrado por tesorería |
| `settled` | Liquidado (comparado contra gastos reales) |
| `returned` | Saldo devuelto por el colaborador |
| `rejected` | Rechazado en cualquier nivel |

### Umbral de aprobación

- **≤ S/ 500** → 1 nivel de aprobación (solo L1)
- **> S/ 500** → 2 niveles (L1 + L2)

Definido en `viatika-back/src/modules/advance/entities/advance.entity.ts`:
```ts
export const ADVANCE_THRESHOLDS = { L1_MAX: 500 }
```

### ¿Quién puede hacer qué?

| Acción | Roles con acceso | Permiso requerido |
|--------|-----------------|-------------------|
| Solicitar anticipo | Todos | — |
| Aprobar L1 | Administrador, Superadministrador | o `canApproveL1 = true` |
| Aprobar L2 | Superadministrador | o `canApproveL2 = true` |
| Rechazar | Administrador, Superadministrador | o `canApproveL1 = true` o `canApproveL2 = true` |
| Registrar pago | Superadministrador, Contabilidad, Tesorería | o `canApproveL2 = true` |
| Liquidar | Administrador, Superadministrador | o `canApproveL2 = true` |
| Registrar devolución | Administrador, Superadministrador, Tesorería | o `canApproveL2 = true` |

Los usuarios con rol `Tesoreria` reciben los correos "pendiente de pago" (rendición aprobada / viático aprobado) vía `UserService.findTesoreriaNotifyRecipients(clientId)`. Ya no existe una lista de correos configurable por empresa (`Client.tesoreriaEmails` fue removido); la notificación depende exclusivamente de qué usuarios tengan el rol `Tesoreria` en ese cliente.

Los permisos se incluyen en el **JWT** al hacer login. Si se cambian los permisos, el usuario debe volver a iniciar sesión para que los cambios surtan efecto.

---

## Guards del Frontend

| Guard | Ruta protegida | Condición |
|-------|---------------|-----------|
| `AuthColaboradorGuard` | `/invoices`, `/invoices/*`, `/mis-rendiciones/*` | Autenticado (cualquier rol) |
| `AuthAdmin2Guard` | `/admin-users/*`, `/configuracion`, `/consolidated-invoices/*`, `/invoice-approval`, `/clients` | Rol Administrador o Superadministrador |
| `AuthSuperGuard` | `/clients-admin`, `/super/*` | Rol Superadministrador |
| `AuthTesoreroGuard` | `/tesoreria` | `hasModulePermission('tesoreria')` — Admins siempre, Colaboradores si tienen permiso |

---

## Archivos Clave

### Backend
- `src/modules/auth/enums/roles.enum.ts` — Enum de roles
- `src/modules/user/schemas/user.schema.ts` — Schema de usuario con permissions
- `src/modules/user/dto/update-user.dto.ts` — DTO con UpdatePermissionsDto
- `src/modules/user/user.controller.ts` — Endpoint `PATCH /user/:id/permissions`
- `src/modules/advance/advance.service.ts` — Lógica de aprobación con permissions
- `src/modules/advance/advance.controller.ts` — Endpoints de anticipos
- `src/modules/auth/auth.service.ts` — JWT payload incluye permissions y clientId
- `src/modules/auth/strategies/jwt.strategy.ts` — Valida y expone permissions en req.user
- `src/modules/invoice/schemas/invoice.schema.ts` — Schema con expenseType y todos los campos de comprobante
- `src/modules/expense-report/expense-report.service.ts` — Validaciones de estado de rendición

### Frontend
- `src/app/interfaces/user.interface.ts` — IUserPermissions, IUserResponse
- `src/app/services/user-state.service.ts` — hasModulePermission(), canApproveL1(), canApproveL2(), canAccessTesoreria()
- `src/app/guards/auth-tesorero.guard.ts` — Usa canAccessTesoreria() (basado en permisos)
- `src/app/modules/admin-users/user-permissions/` — Página de gestión de permisos
- `src/app/modules/admin-users/services/admin-users.service.ts` — updatePermissions()
- `src/app/components/sidebar/` — Menú adaptado a rol + permisos
- `src/app/app.routes.ts` — Ruta `/admin-users/:id/permisos`
- `src/app/modules/invoices/add-invoice/` — Formulario de comprobante (todos los tipos)
- `src/app/modules/mis-rendiciones/rendicion-detail/` — Detalle de rendición con ficha de comprobante
