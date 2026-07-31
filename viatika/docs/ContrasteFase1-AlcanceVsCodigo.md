# Contraste Fase 1 — Alcance (Funcionalidades.md) vs código actual

**Fecha de revisión:** 2026-05-05  
**Referencias:** [Funcionalidades.md](./Funcionalidades.md) §Fase 1, [PlanDesarrolloPorFases.md](./PlanDesarrolloPorFases.md)

Resumen ejecutivo: hay **base sólida** en CRUD de proyectos/centros de costo, categorías con límite, usuarios con permisos por módulo y firma en perfil. Varias piezas del documento de alcance **no aparecen implementadas** (cargas masivas Excel, modelo de datos completo de usuario, formato de selectores, bloqueo obligatorio por falta de firma, reglas de gasto por límite/90%).

---

## 1.1 Gestión de centros de costo

| Requisito (doc) | Estado | Notas / ubicación |
|-----------------|--------|-------------------|
| CRUD web | Cumple en lo esencial | `viatika/.../centros-de-costo/`, API `project` en backend |
| Campos: código único, nombre proyecto, **nombre cliente** | Parcial | Modelo `Project`: `name`, `code`, `clientId` (`viatika-back/.../project.entity.ts`). No hay campo explícito “nombre cliente”; el cliente es la empresa (`Client`), no el cliente del proyecto del doc |
| Formato selectores: `[Código - Nombre Proyecto - Nombre Cliente]` | No cumple | Ej.: `add-invoice.component.html` muestra solo `{{ proyect.name }}` |
| Unicidad de código | Cumple | Índice único `{ code, clientId }` en `project.entity.ts` |

---

## 1.2 Carga masiva de centros de costo

| Requisito (doc) | Estado | Notas |
|-----------------|--------|-------|
| Importación Excel .xlsx, plantilla, columnas código/proyecto/cliente | **No encontrado** | No hay endpoint ni pantalla de importación masiva de proyectos en el repo revisado |
| Duplicados, reporte de errores, re-subida | **No aplica** | Depende de lo anterior |

---

## 1.3 Categorías de gasto

| Requisito (doc) | Estado | Notas |
|-----------------|--------|-------|
| CRUD categorías | Cumple | `categorias.component`, `CategoriaService`, módulo `category` backend |
| Propiedad límite (soles) | Cumple | Campo `limit` en entidad y formulario UI |
| Bloqueo gasto ≥ límite (ej. máx. S/399.99 si límite 400) | **No verificado en gastos** | Búsqueda en `expense` backend sin reglas por `category.limit`; hay que implementar en creación/edición de gasto |
| Alerta 90% del límite al registrar gasto | **No verificado** | Corresponde a flujo de registro de gastos (Fase 5 del doc); no aparece en revisión rápida de Fase 1 |

---

## 1.4 Carga masiva de usuarios

| Requisito (doc) | Estado | Notas |
|-----------------|--------|-------|
| Plantilla Excel con columnas completas | **No encontrado** | |
| Tipo contrato Planilla/Externo | **No encontrado** | |
| Coordinador opcional | **No encontrado** | No hay campo coordinador en `user.schema.ts` revisado |
| Duplicados por documento/email | Solo email único en BD | `email` único en usuario; flujo Excel no existe |

---

## 1.5 Gestión de usuarios y permisos (web)

| Requisito (doc) | Estado | Notas |
|-----------------|--------|-------|
| CRUD usuarios | Cumple | `admin-users`, `create-user`, API `user` |
| Permisos granulares (módulos / acciones) | Parcial | `user-permissions.component`: lista de módulos (`invoices`, `mis-rendiciones`, etc.) + `canApproveL1` / `canApproveL2`. **No** replica literal la matriz del PDF (nombres de módulos distintos) |
| Campos: área, cargo, tipo contrato, banco, CCI, etc. | Parcial | Hay `dni`, `phone`, `bankAccount`, etc. en schema; formulario `create-user` visible es más reducido — conviene contrastar pantalla detalle vs doc |
| Filtros por área, cargo, tipo contrato, estado | Parcial | En listado admin hay búsqueda, rol y estado; **no** filtros área/cargo/tipo contrato como en el doc |
| Desactivar usuario / último acceso | Parcial | `isActive` existe; “último acceso” depende de si el backend lo expone en el listado |

---

## 1.6 Firma digital

| Requisito (doc) | Estado | Notas |
|-----------------|--------|-------|
| Carga imagen .png/.jpg, tamaño máx. 500 KB | **No cumple tal cual** | Implementación actual: **dibujo en canvas** y envío base64 (`firma-digital.component.ts`, `PATCH .../user/profile/signature`) |
| Firma encriptada / ligada al usuario | Parcial | Se guarda en usuario; criterio de encriptación no auditado en esta revisión |
| Bloqueo de funcionalidades transaccionales sin firma | **No cumple** | `auth-module.guard.ts` valida módulos y rol; **no** redirige por ausencia de firma (RN-10 del doc) |

---

## Conclusión para el equipo

1. **Si “Fase 1 lista” significa MVP interno:** es defendible para **continuar Fase 2**, asumiendo deuda técnica documentada arriba.  
2. **Si “Fase 1 lista” significa cumplimiento del PDF de Funcionalidades:** faltan **cargas masivas**, **modelo enriquecido de usuario/coordinador/contrato**, **selectores con formato triple**, **guard de firma**, y **reglas de límite/90% en gastos** (parte fuerte del valor del doc).

Siguiente paso recomendado: priorizar backlog de cerrar Fase 1 según contrato con el cliente (¿Excel obligatorio? ¿firma bloqueante día 1?).
