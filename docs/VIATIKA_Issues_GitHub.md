# VIATIKA — Backlog de Historias de Usuario para GitHub Issues

> Catálogo de **191 historias de usuario** distribuidas en **45 funcionalidades** del sistema VIATIKA (TEMA LITOCLEAN SAC).
> Cada bloque delimitado por `---ISSUE---` es un issue independiente listo para crear con `gh issue create`.

---

## 📋 Cómo usar este archivo

### Opción A — Crear issues uno a uno (manual)

Copia el **título** y el **body** de cualquier sección y ejecuta:

```bash
gh issue create \
  --title "[HU-01-01-01] Crear un nuevo centro de costo" \
  --label "fase-1,func-01-01,historia-usuario,rol:admin" \
  --milestone "Fase 1" \
  --body-file - <<'EOF'
… (pegar aquí el body markdown de la historia) …
EOF
```

### Opción B — Crear los 191 issues en bloque (automatizado)

Guarda este archivo como `viatika-issues.md` y ejecuta el siguiente script Python:

```python
#!/usr/bin/env python3
# bulk_create_issues.py — crea todos los issues de viatika-issues.md
import re, subprocess, sys, pathlib

REPO = "tu-org/tu-repo"   # <-- AJUSTAR
MD = pathlib.Path("viatika-issues.md").read_text(encoding="utf-8")

# Cada issue está entre líneas '---ISSUE---' y '---END-ISSUE---'
issues = re.findall(r'---ISSUE---\s*\n(.*?)\n---END-ISSUE---', MD, re.DOTALL)
print(f"Encontrados {len(issues)} issues")

for i, blk in enumerate(issues, 1):
    title  = re.search(r'^TITLE:\s*(.+)$',  blk, re.M).group(1).strip()
    labels = re.search(r'^LABELS:\s*(.+)$', blk, re.M).group(1).strip()
    milest = re.search(r'^MILESTONE:\s*(.+)$', blk, re.M).group(1).strip()
    body   = re.search(r'^BODY:\s*\n(.*)$', blk, re.DOTALL | re.M).group(1).strip()

    print(f"[{i}/{len(issues)}] {title}")
    cmd = ["gh","issue","create","--repo",REPO,
           "--title",title,"--label",labels,"--milestone",milest,"--body",body]
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"  ⚠️ Falló: {e}", file=sys.stderr)
```

> **Antes de ejecutar:** crea los milestones (`Fase 1` … `Fase 10`, `Transversales`) y los labels (`fase-1`…`fase-10`, `transversal`, `historia-usuario`, `func-XX-YY`, `rol:*`) en tu repositorio con `gh label create` y `gh api repos/.../milestones`.

### Opción C — Pre-crear labels y milestones

```bash
# Labels base
gh label create "historia-usuario" --color "1F4E79"
gh label create "transversal"      --color "2E75B6"
for n in 1 2 3 4 5 6 7 8 9 10; do
  gh label create "fase-$n" --color "C00000"
done

# Milestones (uno por fase)
for n in 1 2 3 4 5 6 7 8 9 10; do
  gh api repos/:owner/:repo/milestones -f title="Fase $n" >/dev/null
done
gh api repos/:owner/:repo/milestones -f title="Transversales" >/dev/null
```

---

## 📊 Resumen del backlog

| Fase | Funcionalidades | Historias |
|---|---:|---:|
| **Fase 1** — Configuración Inicial | 6 | 21 |
| **Fase 2** — Solicitud de Viáticos | 2 | 9 |
| **Fase 3** — Aprobación de Viáticos | 2 | 7 |
| **Fase 4** — Gestión de Pago por Tesorería | 3 | 7 |
| **Fase 5** — Ingreso y Validación de Gastos | 13 | 38 |
| **Fase 6** — Gestión de Reembolsos | 1 | 8 |
| **Fase 7** — Devolución de Saldos a Favor de la Empresa | 1 | 7 |
| **Fase 8** — Cierre Definitivo de la Rendición | 1 | 9 |
| **Fase 9** — Reembolso Directo | 2 | 11 |
| **Fase 10** — Caja Chica | 3 | 19 |
| **Transversales** — Funcionalidades Transversales | 11 | 55 |
| **TOTAL** | **45** | **191** |

---

## 🎫 Issues

### FUNC-01-01 — Gestión CRUD de Centros de Costo

_Fase: **Fase 1** · Historias: **4**_

---ISSUE---
TITLE: [HU-01-01-01] Crear un nuevo centro de costo
LABELS: historia-usuario,fase-1,func-01-01,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-01-01 — Crear un nuevo centro de costo

**Funcionalidad padre:** `FUNC-01-01` — Gestión CRUD de Centros de Costo
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** crear un nuevo centro de costo ingresando código, nombre de proyecto y nombre de cliente,
**para que** habilitarlo como destino de imputación presupuestal en las solicitudes de viáticos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario de creación expone como obligatorios: Código, Nombre del Proyecto, Nombre del Cliente.
- [ ] **CA-2:** Si el Código ya existe, el sistema impide guardar y muestra el mensaje: "Ya existe un centro de costo con el código X".
- [ ] **CA-3:** Tras guardar, el centro de costo aparece inmediatamente disponible en los selectores con el formato [Código - Proyecto - Cliente].
- [ ] **CA-4:** Cada creación queda registrada en la bitácora de auditoría con usuario, fecha y hora.

### 📎 Referencias

- Funcionalidad: `FUNC-01-01` — Gestión CRUD de Centros de Costo
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-01-02] Editar un centro de costo existente
LABELS: historia-usuario,fase-1,func-01-01,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-01-02 — Editar un centro de costo existente

**Funcionalidad padre:** `FUNC-01-01` — Gestión CRUD de Centros de Costo
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** modificar el nombre del proyecto o cliente de un centro de costo,
**para que** mantener la información alineada cuando un proyecto cambia de denominación o cliente.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El campo Código no es editable; aparece deshabilitado en el formulario.
- [ ] **CA-2:** Los cambios se reflejan en el selector y en futuras solicitudes; las solicitudes históricas conservan los valores al momento de su creación.
- [ ] **CA-3:** Cada modificación se registra en auditoría con valores antes y después.

### 📎 Referencias

- Funcionalidad: `FUNC-01-01` — Gestión CRUD de Centros de Costo
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-01-03] Desactivar un centro de costo
LABELS: historia-usuario,fase-1,func-01-01,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-01-03 — Desactivar un centro de costo

**Funcionalidad padre:** `FUNC-01-01` — Gestión CRUD de Centros de Costo
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** desactivar un centro de costo que ya no se utiliza,
**para que** evitar que aparezca en los selectores de nuevas solicitudes pero conservar el histórico.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si el centro tiene solicitudes activas, el sistema permite desactivar pero advierte al usuario.
- [ ] **CA-2:** Tras desactivar, el centro de costo no aparece en los selectores de Solicitud o Gastos.
- [ ] **CA-3:** El histórico de rendiciones que utilizaron ese centro se mantiene visible y consultable.
- [ ] **CA-4:** Existe la opción de reactivarlo posteriormente.

### 📎 Referencias

- Funcionalidad: `FUNC-01-01` — Gestión CRUD de Centros de Costo
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-01-04] Listar y filtrar centros de costo
LABELS: historia-usuario,fase-1,func-01-01,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-01-04 — Listar y filtrar centros de costo

**Funcionalidad padre:** `FUNC-01-01` — Gestión CRUD de Centros de Costo
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** ver el listado de centros de costo con filtros por estado y búsqueda por código o cliente,
**para que** gestionar de forma eficiente cuando existan decenas o centenas de centros configurados.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El listado es paginado y permite ordenamiento por Código, Cliente o Fecha de Creación.
- [ ] **CA-2:** El filtro por estado distingue Activos, Inactivos y Todos.
- [ ] **CA-3:** El campo de búsqueda es textual y busca coincidencia parcial en Código, Proyecto y Cliente.

### 📎 Referencias

- Funcionalidad: `FUNC-01-01` — Gestión CRUD de Centros de Costo
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-01-02 — Carga Masiva de Centros de Costo desde Excel

_Fase: **Fase 1** · Historias: **3**_

---ISSUE---
TITLE: [HU-01-02-01] Descargar plantilla Excel para carga masiva
LABELS: historia-usuario,fase-1,func-01-02,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-02-01 — Descargar plantilla Excel para carga masiva

**Funcionalidad padre:** `FUNC-01-02` — Carga Masiva de Centros de Costo desde Excel
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** descargar la plantilla Excel oficial con las columnas requeridas,
**para que** preparar mi archivo de importación con el formato exacto que espera la plataforma.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe un botón "Descargar plantilla" visible en la pantalla de Carga Masiva de Centros de Costo.
- [ ] **CA-2:** La plantilla descargada incluye encabezados: Código, Nombre Proyecto, Nombre Cliente.
- [ ] **CA-3:** La plantilla incluye una fila de ejemplo y comentarios explicativos en las celdas de encabezado.

### 📎 Referencias

- Funcionalidad: `FUNC-01-02` — Carga Masiva de Centros de Costo desde Excel
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-02-02] Importar archivo Excel sin duplicados
LABELS: historia-usuario,fase-1,func-01-02,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-02-02 — Importar archivo Excel sin duplicados

**Funcionalidad padre:** `FUNC-01-02` — Carga Masiva de Centros de Costo desde Excel
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** subir un archivo Excel con varios centros de costo nuevos,
**para que** registrar masivamente varios proyectos sin tener que crearlos uno por uno.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al seleccionar el archivo, el sistema valida la estructura antes de procesar.
- [ ] **CA-2:** Si todos los registros son válidos, los importa y muestra: "X centros de costo importados correctamente".
- [ ] **CA-3:** Los registros importados aparecen inmediatamente disponibles en el listado y en los selectores.

### 📎 Referencias

- Funcionalidad: `FUNC-01-02` — Carga Masiva de Centros de Costo desde Excel
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-02-03] Detectar y corregir duplicados durante la carga
LABELS: historia-usuario,fase-1,func-01-02,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-02-03 — Detectar y corregir duplicados durante la carga

**Funcionalidad padre:** `FUNC-01-02` — Carga Masiva de Centros de Costo desde Excel
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** que el sistema detecte automáticamente códigos duplicados en mi archivo Excel y muestre un reporte de errores,
**para que** corregir el archivo y reintentar sin tener que importar todos los registros desde cero.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema detecta duplicados contra la base de datos y dentro del propio archivo.
- [ ] **CA-2:** Genera un reporte en pantalla con columna "Estado" por cada fila: Importado, Duplicado, Error.
- [ ] **CA-3:** Permite eliminar filas duplicadas o erróneas desde el mismo reporte y reintentar.
- [ ] **CA-4:** Importa solo los registros válidos cuando se opta por importación parcial.

### 📎 Referencias

- Funcionalidad: `FUNC-01-02` — Carga Masiva de Centros de Costo desde Excel
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-01-03 — Administración de Categorías de Gasto con Límites

_Fase: **Fase 1** · Historias: **4**_

---ISSUE---
TITLE: [HU-01-03-01] Crear nueva categoría de gasto con límite
LABELS: historia-usuario,fase-1,func-01-03,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-03-01 — Crear nueva categoría de gasto con límite

**Funcionalidad padre:** `FUNC-01-03` — Administración de Categorías de Gasto con Límites
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** crear una categoría de gasto definiendo nombre y límite máximo permitido,
**para que** controlar el gasto de los colaboradores por tipo de concepto.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario expone: Nombre (obligatorio, único), Descripción, Límite (numérico ≥ 0).
- [ ] **CA-2:** Tras guardar, la categoría queda activa y disponible en los formularios de gastos.
- [ ] **CA-3:** El nombre de la categoría debe ser único en el sistema.

### 📎 Referencias

- Funcionalidad: `FUNC-01-03` — Administración de Categorías de Gasto con Límites
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-03-02] Editar el límite de una categoría existente
LABELS: historia-usuario,fase-1,func-01-03,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-03-02 — Editar el límite de una categoría existente

**Funcionalidad padre:** `FUNC-01-03` — Administración de Categorías de Gasto con Límites
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** modificar el monto límite de una categoría,
**para que** ajustar las políticas de gasto cuando cambian los costos del mercado.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Tras modificar el límite, las nuevas validaciones aplican a todos los gastos posteriores.
- [ ] **CA-2:** Las rendiciones cerradas no se ven afectadas; mantienen el límite vigente al momento del cierre.
- [ ] **CA-3:** El cambio queda registrado con valor anterior, valor nuevo, usuario y fecha.

### 📎 Referencias

- Funcionalidad: `FUNC-01-03` — Administración de Categorías de Gasto con Límites
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-03-03] Mostrar alerta al alcanzar el 90% del límite
LABELS: historia-usuario,fase-1,func-01-03,rol:sistema
MILESTONE: Fase 1
BODY:
## HU-01-03-03 — Mostrar alerta al alcanzar el 90% del límite

**Funcionalidad padre:** `FUNC-01-03` — Administración de Categorías de Gasto con Límites
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** mostrar al colaborador una alerta amarilla cuando los gastos en una categoría alcancen el 90% del límite,
**para que** que el colaborador pueda solicitar ampliación de presupuesto antes de quedarse sin saldo.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al registrar un gasto, el sistema calcula (total_categoría / límite) × 100.
- [ ] **CA-2:** Si el resultado ≥ 90% y < 100%, muestra modal no bloqueante con texto: "⚠️ Ha utilizado el 90% del presupuesto para [Categoría]. Si requiere más fondos, solicite una ampliación de presupuesto antes de continuar.".
- [ ] **CA-3:** El colaborador puede continuar registrando gastos hasta alcanzar el 100%.

### 📎 Referencias

- Funcionalidad: `FUNC-01-03` — Administración de Categorías de Gasto con Límites
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-03-04] Bloquear gasto cuando se alcanza el 100% del límite
LABELS: historia-usuario,fase-1,func-01-03,rol:sistema
MILESTONE: Fase 1
BODY:
## HU-01-03-04 — Bloquear gasto cuando se alcanza el 100% del límite

**Funcionalidad padre:** `FUNC-01-03` — Administración de Categorías de Gasto con Límites
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** bloquear el registro de gastos cuando la categoría alcance el 100% del límite,
**para que** garantizar el cumplimiento del control presupuestal.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si (total_categoría / límite) × 100 ≥ 100%, el sistema impide guardar el nuevo gasto.
- [ ] **CA-2:** Muestra modal bloqueante en rojo: "❌ Límite de categoría [Categoría] alcanzado. No se permiten más gastos en esta categoría. Solicite ampliación de presupuesto.".
- [ ] **CA-3:** El colaborador puede iniciar el flujo de Ampliación de Presupuesto desde el mismo modal.

### 📎 Referencias

- Funcionalidad: `FUNC-01-03` — Administración de Categorías de Gasto con Límites
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-01-04 — Carga Masiva de Usuarios desde Excel

_Fase: **Fase 1** · Historias: **3**_

---ISSUE---
TITLE: [HU-01-04-01] Cargar masivamente usuarios desde Excel
LABELS: historia-usuario,fase-1,func-01-04,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-04-01 — Cargar masivamente usuarios desde Excel

**Funcionalidad padre:** `FUNC-01-04` — Carga Masiva de Usuarios desde Excel
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** subir un archivo Excel con múltiples usuarios y sus datos completos,
**para que** habilitar el acceso a la plataforma a varios colaboradores en una sola operación.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema valida la estructura del archivo: encabezados y tipos de dato por columna.
- [ ] **CA-2:** Detecta duplicados por N° de Documento o Email y los reporta como errores.
- [ ] **CA-3:** Si la columna Contraseña Temporal está vacía, el sistema genera una automáticamente.
- [ ] **CA-4:** Tras importar, envía email de bienvenida a cada usuario con sus credenciales temporales.
- [ ] **CA-5:** Muestra resumen final: X usuarios importados, Y usuarios con errores con causa específica.

### 📎 Referencias

- Funcionalidad: `FUNC-01-04` — Carga Masiva de Usuarios desde Excel
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-04-02] Asignar coordinador durante la carga masiva
LABELS: historia-usuario,fase-1,func-01-04,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-04-02 — Asignar coordinador durante la carga masiva

**Funcionalidad padre:** `FUNC-01-04` — Carga Masiva de Usuarios desde Excel
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** asignar un coordinador a cada usuario en el mismo Excel de carga,
**para que** configurar desde el inicio quién aprobará las solicitudes de cada colaborador.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** La columna Coordinador acepta el email o N° de Documento de un usuario ya creado.
- [ ] **CA-2:** Si el coordinador referenciado no existe, la fila se reporta como error.
- [ ] **CA-3:** El coordinador puede dejarse en blanco; el usuario quedará sin coordinador asignado y podrá configurarse después.

### 📎 Referencias

- Funcionalidad: `FUNC-01-04` — Carga Masiva de Usuarios desde Excel
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-04-03] Forzar cambio de contraseña en el primer login
LABELS: historia-usuario,fase-1,func-01-04,rol:sistema
MILESTONE: Fase 1
BODY:
## HU-01-04-03 — Forzar cambio de contraseña en el primer login

**Funcionalidad padre:** `FUNC-01-04` — Carga Masiva de Usuarios desde Excel
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** forzar al nuevo usuario a cambiar su contraseña temporal en el primer login,
**para que** garantizar que solo el titular conozca su contraseña final.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al iniciar sesión por primera vez con la contraseña temporal, el sistema redirige a una pantalla de cambio obligatorio.
- [ ] **CA-2:** Hasta que no cambie la contraseña, el usuario no puede acceder a otros módulos.
- [ ] **CA-3:** La nueva contraseña debe cumplir la política de seguridad: mínimo 8 caracteres, mayúsculas, minúsculas, números y un carácter especial.

### 📎 Referencias

- Funcionalidad: `FUNC-01-04` — Carga Masiva de Usuarios desde Excel
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-01-05 — Gestión de Usuarios y Permisos Granulares

_Fase: **Fase 1** · Historias: **4**_

---ISSUE---
TITLE: [HU-01-05-01] Crear usuario con permisos granulares
LABELS: historia-usuario,fase-1,func-01-05,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-05-01 — Crear usuario con permisos granulares

**Funcionalidad padre:** `FUNC-01-05` — Gestión de Usuarios y Permisos Granulares
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** crear un usuario y configurar exactamente qué módulos y acciones puede ejecutar,
**para que** aplicar el principio de mínimo privilegio según el rol funcional del colaborador.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario muestra una sección de checkboxes agrupados por módulo.
- [ ] **CA-2:** Por defecto el sistema sugiere un perfil base según el rol seleccionado (Administrador, Coordinador, Colaborador).
- [ ] **CA-3:** El administrador puede ajustar manualmente cada checkbox, manteniendo o quitando permisos del perfil base.
- [ ] **CA-4:** Los cambios surten efecto en el siguiente login del usuario.

### 📎 Referencias

- Funcionalidad: `FUNC-01-05` — Gestión de Usuarios y Permisos Granulares
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-05-02] Buscar y filtrar usuarios
LABELS: historia-usuario,fase-1,func-01-05,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-05-02 — Buscar y filtrar usuarios

**Funcionalidad padre:** `FUNC-01-05` — Gestión de Usuarios y Permisos Granulares
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** buscar usuarios por nombre, documento o email y filtrar por área, cargo o estado,
**para que** encontrar rápidamente al usuario que necesito gestionar.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** La búsqueda textual encuentra coincidencias parciales en nombre, documento y email.
- [ ] **CA-2:** Los filtros se combinan con AND lógico.
- [ ] **CA-3:** Los resultados se paginan a 25 por página por defecto.
- [ ] **CA-4:** Se puede ordenar por columnas: Nombre, Área, Último Acceso, Estado.

### 📎 Referencias

- Funcionalidad: `FUNC-01-05` — Gestión de Usuarios y Permisos Granulares
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-05-03] Desactivar usuario manteniendo histórico
LABELS: historia-usuario,fase-1,func-01-05,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-05-03 — Desactivar usuario manteniendo histórico

**Funcionalidad padre:** `FUNC-01-05` — Gestión de Usuarios y Permisos Granulares
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** desactivar un usuario que dejó la empresa en lugar de eliminarlo,
**para que** conservar la trazabilidad de las solicitudes y gastos que ese usuario gestionó.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El usuario desactivado no puede iniciar sesión.
- [ ] **CA-2:** Sus rendiciones, solicitudes y gastos previos siguen visibles en reportes y consultas.
- [ ] **CA-3:** Si tiene rendiciones abiertas, el sistema advierte al administrador antes de confirmar la desactivación.
- [ ] **CA-4:** Existe la posibilidad de reactivarlo en el futuro.

### 📎 Referencias

- Funcionalidad: `FUNC-01-05` — Gestión de Usuarios y Permisos Granulares
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-05-04] Resetear contraseña de un usuario
LABELS: historia-usuario,fase-1,func-01-05,rol:admin
MILESTONE: Fase 1
BODY:
## HU-01-05-04 — Resetear contraseña de un usuario

**Funcionalidad padre:** `FUNC-01-05` — Gestión de Usuarios y Permisos Granulares
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** forzar el reseteo de contraseña de un usuario que la olvidó,
**para que** permitirle recuperar el acceso sin tener que conocer su contraseña actual.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al pulsar "Resetear contraseña", el sistema genera una contraseña temporal aleatoria.
- [ ] **CA-2:** Envía email al usuario con la contraseña temporal y un enlace para iniciar sesión.
- [ ] **CA-3:** El sistema fuerza el cambio de contraseña en el siguiente login.

### 📎 Referencias

- Funcionalidad: `FUNC-01-05` — Gestión de Usuarios y Permisos Granulares
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-01-06 — Registro de Firma Digital del Usuario

_Fase: **Fase 1** · Historias: **3**_

---ISSUE---
TITLE: [HU-01-06-01] Subir firma digital al perfil
LABELS: historia-usuario,fase-1,func-01-06,rol:otro
MILESTONE: Fase 1
BODY:
## HU-01-06-01 — Subir firma digital al perfil

**Funcionalidad padre:** `FUNC-01-06` — Registro de Firma Digital del Usuario
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Usuario (cualquier rol),
**quiero** subir mi firma digital desde mi perfil personal,
**para que** habilitar la operación de las funcionalidades transaccionales y firmar mis documentos oficiales.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema acepta archivos .png o .jpg con tamaño máximo 500 KB.
- [ ] **CA-2:** Si las dimensiones exceden los recomendados, muestra advertencia pero permite continuar.
- [ ] **CA-3:** Tras guardar, la firma queda asociada a mi usuario y se desbloquean las funcionalidades transaccionales.
- [ ] **CA-4:** Puedo previsualizar mi firma cargada antes de guardar definitivamente.

### 📎 Referencias

- Funcionalidad: `FUNC-01-06` — Registro de Firma Digital del Usuario
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-06-02] Bloqueo por falta de firma digital
LABELS: historia-usuario,fase-1,func-01-06,rol:sistema
MILESTONE: Fase 1
BODY:
## HU-01-06-02 — Bloqueo por falta de firma digital

**Funcionalidad padre:** `FUNC-01-06` — Registro de Firma Digital del Usuario
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** impedir el acceso a operaciones transaccionales si el usuario no ha registrado su firma,
**para que** garantizar que todos los documentos generados puedan firmarse al cierre de la rendición.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al intentar acceder a Solicitar viáticos, Aprobar, Registrar gastos o Cerrar rendición sin firma, el sistema redirige al perfil.
- [ ] **CA-2:** Muestra mensaje: "Para operar esta funcionalidad debe registrar su firma digital. Cárguela en su perfil para continuar.".
- [ ] **CA-3:** Una vez registrada la firma, el usuario puede acceder normalmente.

### 📎 Referencias

- Funcionalidad: `FUNC-01-06` — Registro de Firma Digital del Usuario
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-01-06-03] Reemplazar firma digital existente
LABELS: historia-usuario,fase-1,func-01-06,rol:otro
MILESTONE: Fase 1
BODY:
## HU-01-06-03 — Reemplazar firma digital existente

**Funcionalidad padre:** `FUNC-01-06` — Registro de Firma Digital del Usuario
**Fase:** Fase 1 (Configuración Inicial)

### 📝 Historia de Usuario

**Como** Usuario (cualquier rol),
**quiero** reemplazar mi firma digital cuando cambia mi rúbrica,
**para que** mantener actualizada la firma incrustada en los documentos futuros.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema permite subir una nueva imagen que reemplaza la anterior.
- [ ] **CA-2:** Los documentos previamente cerrados conservan la firma original al momento del cierre.
- [ ] **CA-3:** El cambio queda registrado en la bitácora con fecha, hora y archivo anterior.

### 📎 Referencias

- Funcionalidad: `FUNC-01-06` — Registro de Firma Digital del Usuario
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-02-01 — Formulario de Solicitud de Viáticos

_Fase: **Fase 2** · Historias: **6**_

---ISSUE---
TITLE: [HU-02-01-01] Crear solicitud de viáticos con autocompletado geográfico
LABELS: historia-usuario,fase-2,func-02-01,rol:colaborador
MILESTONE: Fase 2
BODY:
## HU-02-01-01 — Crear solicitud de viáticos con autocompletado geográfico

**Funcionalidad padre:** `FUNC-02-01` — Formulario de Solicitud de Viáticos
**Fase:** Fase 2 (Solicitud de Viáticos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** crear una nueva solicitud de viáticos seleccionando un lugar con autocompletado por GPS,
**para que** registrar de forma rápida y precisa el destino sin errores tipográficos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El campo Lugar muestra sugerencias mientras escribo (mínimo 3 caracteres).
- [ ] **CA-2:** Las sugerencias se restringen a Perú.
- [ ] **CA-3:** Al seleccionar una sugerencia, el sistema almacena las coordenadas (lat/long) además del texto.
- [ ] **CA-4:** Si el GPS del navegador está habilitado, ofrece como primera sugerencia mi ubicación actual.

### 📎 Referencias

- Funcionalidad: `FUNC-02-01` — Formulario de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-02-01-02] Seleccionar centro de costo en formato unificado
LABELS: historia-usuario,fase-2,func-02-01,rol:colaborador
MILESTONE: Fase 2
BODY:
## HU-02-01-02 — Seleccionar centro de costo en formato unificado

**Funcionalidad padre:** `FUNC-02-01` — Formulario de Solicitud de Viáticos
**Fase:** Fase 2 (Solicitud de Viáticos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** seleccionar el centro de costo desde un selector con formato [Código - Proyecto - Cliente],
**para que** elegir sin ambigüedad la imputación presupuestal correcta.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El selector muestra solo centros de costo activos.
- [ ] **CA-2:** Permite búsqueda parcial por código, proyecto o cliente.
- [ ] **CA-3:** Al guardar, queda asociado el ID interno del centro de costo a la solicitud.

### 📎 Referencias

- Funcionalidad: `FUNC-02-01` — Formulario de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-02-01-03] Validar fechas de inicio y fin
LABELS: historia-usuario,fase-2,func-02-01,rol:sistema
MILESTONE: Fase 2
BODY:
## HU-02-01-03 — Validar fechas de inicio y fin

**Funcionalidad padre:** `FUNC-02-01` — Formulario de Solicitud de Viáticos
**Fase:** Fase 2 (Solicitud de Viáticos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** validar que la fecha fin sea mayor o igual a la fecha inicio y advertir sobre fechas pasadas,
**para que** evitar solicitudes con datos inconsistentes o tardías sin justificación.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si fecha_fin < fecha_inicio, el sistema impide guardar y muestra mensaje claro.
- [ ] **CA-2:** Si fecha_inicio < hoy, muestra advertencia y solicita justificación obligatoria en Observaciones.
- [ ] **CA-3:** Las fechas se ingresan vía datepicker en formato dd/mm/yyyy.

### 📎 Referencias

- Funcionalidad: `FUNC-02-01` — Formulario de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-02-01-04] Agregar y calcular filas de detalle de viáticos
LABELS: historia-usuario,fase-2,func-02-01,rol:colaborador
MILESTONE: Fase 2
BODY:
## HU-02-01-04 — Agregar y calcular filas de detalle de viáticos

**Funcionalidad padre:** `FUNC-02-01` — Formulario de Solicitud de Viáticos
**Fase:** Fase 2 (Solicitud de Viáticos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** agregar múltiples filas con categoría, importe, cantidad de personas, GLP/día y días, y ver el total calculado automáticamente,
**para que** desglosar mi solicitud por concepto sin tener que sumar manualmente.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Cada fila calcula Total = Importe × Cantidad Personas × Días (GLP/día se aplica solo a categorías de combustible si corresponde).
- [ ] **CA-2:** El campo Total General es la suma de los Totales por fila y no es editable.
- [ ] **CA-3:** Puedo agregar y eliminar filas dinámicamente sin recargar la página.
- [ ] **CA-4:** Si una fila está incompleta, no contribuye al total y el sistema la marca con icono de error.

### 📎 Referencias

- Funcionalidad: `FUNC-02-01` — Formulario de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-02-01-05] Guardar solicitud como borrador
LABELS: historia-usuario,fase-2,func-02-01,rol:colaborador
MILESTONE: Fase 2
BODY:
## HU-02-01-05 — Guardar solicitud como borrador

**Funcionalidad padre:** `FUNC-02-01` — Formulario de Solicitud de Viáticos
**Fase:** Fase 2 (Solicitud de Viáticos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** guardar mi solicitud como borrador para terminarla más tarde,
**para que** no perder los datos cuando aún me faltan cotizaciones o información.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El estado Borrador no dispara notificaciones a coordinadores.
- [ ] **CA-2:** Puedo editar o eliminar la solicitud mientras esté en Borrador.
- [ ] **CA-3:** El borrador aparece en mi panel principal con badge "Borrador".

### 📎 Referencias

- Funcionalidad: `FUNC-02-01` — Formulario de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-02-01-06] Enviar solicitud para aprobación
LABELS: historia-usuario,fase-2,func-02-01,rol:colaborador
MILESTONE: Fase 2
BODY:
## HU-02-01-06 — Enviar solicitud para aprobación

**Funcionalidad padre:** `FUNC-02-01` — Formulario de Solicitud de Viáticos
**Fase:** Fase 2 (Solicitud de Viáticos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** enviar mi solicitud al coordinador para su aprobación,
**para que** iniciar el flujo de aprobación y eventualmente recibir el desembolso.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al pulsar Enviar, el sistema valida que todos los campos obligatorios estén completos.
- [ ] **CA-2:** Cambia el estado a "Pendiente de Aprobación" y bloquea la edición por parte del colaborador.
- [ ] **CA-3:** Dispara la notificación automática al coordinador asignado en el perfil del colaborador.

### 📎 Referencias

- Funcionalidad: `FUNC-02-01` — Formulario de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-02-02 — Notificación Automática al Coordinador sobre Nueva Solicitud

_Fase: **Fase 2** · Historias: **3**_

---ISSUE---
TITLE: [HU-02-02-01] Recibir notificación de nueva solicitud
LABELS: historia-usuario,fase-2,func-02-02,rol:coordinador
MILESTONE: Fase 2
BODY:
## HU-02-02-01 — Recibir notificación de nueva solicitud

**Funcionalidad padre:** `FUNC-02-02` — Notificación Automática al Coordinador sobre Nueva Solicitud
**Fase:** Fase 2 (Solicitud de Viáticos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** recibir un email automático cuando un colaborador a mi cargo envía una solicitud de viáticos,
**para que** enterarme inmediatamente y poder revisarla y aprobarla sin demoras.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El email se envía dentro de los 2 minutos posteriores al envío de la solicitud por parte del colaborador.
- [ ] **CA-2:** El asunto incluye "Nueva solicitud de viáticos" + N° Centro de Costo + Nombre Proyecto.
- [ ] **CA-3:** El cuerpo incluye nombre completo, documento, área y cargo del colaborador, lugar, fechas y monto total.
- [ ] **CA-4:** El email contiene un enlace directo a la solicitud en la plataforma.

### 📎 Referencias

- Funcionalidad: `FUNC-02-02` — Notificación Automática al Coordinador sobre Nueva Solicitud
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-02-02-02] Reenviar notificación si falla la entrega
LABELS: historia-usuario,fase-2,func-02-02,rol:sistema
MILESTONE: Fase 2
BODY:
## HU-02-02-02 — Reenviar notificación si falla la entrega

**Funcionalidad padre:** `FUNC-02-02` — Notificación Automática al Coordinador sobre Nueva Solicitud
**Fase:** Fase 2 (Solicitud de Viáticos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** reintentar automáticamente el envío de la notificación hasta 2 veces si falla,
**para que** garantizar que el coordinador reciba el aviso aun ante fallos transitorios.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema reintenta con intervalos crecientes (30s, 2min).
- [ ] **CA-2:** Tras 2 reintentos fallidos, marca el envío como "Pendiente" y notifica al administrador.
- [ ] **CA-3:** El administrador puede ejecutar un reenvío manual desde el log de notificaciones.

### 📎 Referencias

- Funcionalidad: `FUNC-02-02` — Notificación Automática al Coordinador sobre Nueva Solicitud
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-02-02-03] Auditar el envío de notificaciones
LABELS: historia-usuario,fase-2,func-02-02,rol:admin
MILESTONE: Fase 2
BODY:
## HU-02-02-03 — Auditar el envío de notificaciones

**Funcionalidad padre:** `FUNC-02-02` — Notificación Automática al Coordinador sobre Nueva Solicitud
**Fase:** Fase 2 (Solicitud de Viáticos)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** consultar el log de notificaciones por fecha, destinatario y estado,
**para que** verificar que las comunicaciones críticas del flujo se entregaron correctamente.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El log incluye: fecha/hora, destinatario, tipo de notificación, estado (Enviado/Pendiente/Fallido), reintentos.
- [ ] **CA-2:** Permite filtrar por rango de fechas, destinatario y estado.
- [ ] **CA-3:** Permite reenviar manualmente notificaciones fallidas.

### 📎 Referencias

- Funcionalidad: `FUNC-02-02` — Notificación Automática al Coordinador sobre Nueva Solicitud
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-03-01 — Rechazo de Solicitud de Viáticos

_Fase: **Fase 3** · Historias: **3**_

---ISSUE---
TITLE: [HU-03-01-01] Rechazar solicitud con observación obligatoria
LABELS: historia-usuario,fase-3,func-03-01,rol:coordinador
MILESTONE: Fase 3
BODY:
## HU-03-01-01 — Rechazar solicitud con observación obligatoria

**Funcionalidad padre:** `FUNC-03-01` — Rechazo de Solicitud de Viáticos
**Fase:** Fase 3 (Aprobación de Viáticos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** rechazar una solicitud ingresando el motivo del rechazo,
**para que** comunicar al colaborador qué debe corregir antes de reenviarla.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al pulsar "Rechazar", se abre un modal con campo de texto obligatorio (mínimo 10 caracteres).
- [ ] **CA-2:** Si el texto es menor a 10 caracteres, no se puede confirmar el rechazo.
- [ ] **CA-3:** Tras confirmar, el estado de la solicitud cambia a "Rechazada".
- [ ] **CA-4:** Se registra la observación, el usuario rechazante, fecha y hora.

### 📎 Referencias

- Funcionalidad: `FUNC-03-01` — Rechazo de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-03-01-02] Recibir notificación de rechazo
LABELS: historia-usuario,fase-3,func-03-01,rol:colaborador
MILESTONE: Fase 3
BODY:
## HU-03-01-02 — Recibir notificación de rechazo

**Funcionalidad padre:** `FUNC-03-01` — Rechazo de Solicitud de Viáticos
**Fase:** Fase 3 (Aprobación de Viáticos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** recibir un email cuando mi solicitud es rechazada con la observación completa,
**para que** saber qué debo corregir y volver a enviarla.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El email se envía dentro de los 2 minutos posteriores al rechazo.
- [ ] **CA-2:** Incluye asunto "Rechazo de solicitud de viáticos - [N° Centro de Costo]".
- [ ] **CA-3:** Contiene la observación del coordinador en el cuerpo del mensaje.
- [ ] **CA-4:** Incluye un link directo a la solicitud para re-editarla.

### 📎 Referencias

- Funcionalidad: `FUNC-03-01` — Rechazo de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-03-01-03] Re-editar solicitud rechazada
LABELS: historia-usuario,fase-3,func-03-01,rol:colaborador
MILESTONE: Fase 3
BODY:
## HU-03-01-03 — Re-editar solicitud rechazada

**Funcionalidad padre:** `FUNC-03-01` — Rechazo de Solicitud de Viáticos
**Fase:** Fase 3 (Aprobación de Viáticos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** modificar mi solicitud rechazada y reenviarla,
**para que** subsanar las observaciones del coordinador sin tener que crear una solicitud nueva desde cero.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** La solicitud rechazada vuelve a ser editable.
- [ ] **CA-2:** El historial conserva la versión rechazada con su observación.
- [ ] **CA-3:** Al reenviar, se genera una nueva versión vinculada a la original (mismo ID raíz).
- [ ] **CA-4:** Se notifica al coordinador como si fuera una solicitud nueva.

### 📎 Referencias

- Funcionalidad: `FUNC-03-01` — Rechazo de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-03-02 — Aprobación de Solicitud de Viáticos

_Fase: **Fase 3** · Historias: **4**_

---ISSUE---
TITLE: [HU-03-02-01] Aprobar solicitud y reservar presupuesto
LABELS: historia-usuario,fase-3,func-03-02,rol:coordinador
MILESTONE: Fase 3
BODY:
## HU-03-02-01 — Aprobar solicitud y reservar presupuesto

**Funcionalidad padre:** `FUNC-03-02` — Aprobación de Solicitud de Viáticos
**Fase:** Fase 3 (Aprobación de Viáticos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** aprobar una solicitud de viáticos y que el sistema reserve automáticamente el monto en el centro de costo,
**para que** asegurar que ese presupuesto quede comprometido y no sea utilizado por otra solicitud.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al pulsar "Aprobar", el sistema cambia el estado a "Aprobada" y registra la operación.
- [ ] **CA-2:** Reserva el monto aprobado en el presupuesto del centro de costo asociado.
- [ ] **CA-3:** El presupuesto reservado disminuye el saldo disponible mostrado en reportes.

### 📎 Referencias

- Funcionalidad: `FUNC-03-02` — Aprobación de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-03-02-02] Notificar a Contabilidad con urgencia automática
LABELS: historia-usuario,fase-3,func-03-02,rol:sistema
MILESTONE: Fase 3
BODY:
## HU-03-02-02 — Notificar a Contabilidad con urgencia automática

**Funcionalidad padre:** `FUNC-03-02` — Aprobación de Solicitud de Viáticos
**Fase:** Fase 3 (Aprobación de Viáticos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** notificar a Contabilidad cada solicitud aprobada y marcarla como URGENTE si la fecha de inicio es hoy o mañana,
**para que** que Contabilidad priorice los desembolsos críticos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El email se envía a todos los usuarios con permiso "Contabilidad" activado.
- [ ] **CA-2:** Si fecha_inicio_viaje ∈ {hoy, mañana}, el asunto se prefija con "[🔴 URGENTE]".
- [ ] **CA-3:** El cuerpo incluye colaborador, aprobador, lugar, fechas, centro de costo, desglose por categoría y monto total.
- [ ] **CA-4:** Incluye link directo a la solicitud para registro de pago.

### 📎 Referencias

- Funcionalidad: `FUNC-03-02` — Aprobación de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-03-02-03] Incluir datos completos del colaborador en la notificación
LABELS: historia-usuario,fase-3,func-03-02,rol:sistema
MILESTONE: Fase 3
BODY:
## HU-03-02-03 — Incluir datos completos del colaborador en la notificación

**Funcionalidad padre:** `FUNC-03-02` — Aprobación de Solicitud de Viáticos
**Fase:** Fase 3 (Aprobación de Viáticos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** incluir en cada notificación de aprobación los datos completos del colaborador y del aprobador,
**para que** que Contabilidad cuente con toda la información necesaria sin tener que abrir la plataforma para casos simples.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El cuerpo del email incluye nombre completo, documento, área y cargo del colaborador.
- [ ] **CA-2:** Incluye nombre completo y cargo del aprobador.
- [ ] **CA-3:** Incluye datos bancarios del colaborador (Banco, N° Cuenta, CCI) para facilitar el desembolso.

### 📎 Referencias

- Funcionalidad: `FUNC-03-02` — Aprobación de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-03-02-04] Visualizar solicitud aprobada en histórico
LABELS: historia-usuario,fase-3,func-03-02,rol:coordinador
MILESTONE: Fase 3
BODY:
## HU-03-02-04 — Visualizar solicitud aprobada en histórico

**Funcionalidad padre:** `FUNC-03-02` — Aprobación de Solicitud de Viáticos
**Fase:** Fase 3 (Aprobación de Viáticos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** ver el histórico de solicitudes que he aprobado con sus estados actuales,
**para que** hacer seguimiento al progreso de los viajes que autoricé.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe una vista "Mis Aprobaciones" para el coordinador.
- [ ] **CA-2:** Cada solicitud muestra: número, colaborador, fecha de aprobación, estado actual (Pagada / En Progreso / Cerrada).
- [ ] **CA-3:** Se puede filtrar por estado y rango de fechas.

### 📎 Referencias

- Funcionalidad: `FUNC-03-02` — Aprobación de Solicitud de Viáticos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-04-01 — Registro de Comprobante de Pago

_Fase: **Fase 4** · Historias: **3**_

---ISSUE---
TITLE: [HU-04-01-01] Subir comprobante de pago bancario
LABELS: historia-usuario,fase-4,func-04-01,rol:contabilidad
MILESTONE: Fase 4
BODY:
## HU-04-01-01 — Subir comprobante de pago bancario

**Funcionalidad padre:** `FUNC-04-01` — Registro de Comprobante de Pago
**Fase:** Fase 4 (Gestión de Pago por Tesorería)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** subir el comprobante del depósito bancario realizado al colaborador,
**para que** registrar formalmente el desembolso y activar el módulo de gastos para el colaborador.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema acepta archivos PDF, JPG o PNG con tamaño máximo 10 MB.
- [ ] **CA-2:** Si el archivo excede el tamaño o tiene formato inválido, muestra mensaje de error claro.
- [ ] **CA-3:** El comprobante queda vinculado a la solicitud aprobada y disponible para consulta posterior.

### 📎 Referencias

- Funcionalidad: `FUNC-04-01` — Registro de Comprobante de Pago
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-04-01-02] Confirmar pago y activar módulo de gastos
LABELS: historia-usuario,fase-4,func-04-01,rol:contabilidad
MILESTONE: Fase 4
BODY:
## HU-04-01-02 — Confirmar pago y activar módulo de gastos

**Funcionalidad padre:** `FUNC-04-01` — Registro de Comprobante de Pago
**Fase:** Fase 4 (Gestión de Pago por Tesorería)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** confirmar el pago al pulsar el botón "Enviar aprobación de viáticos",
**para que** que el colaborador pueda comenzar a registrar sus gastos con el viático recibido.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Tras confirmar, el estado de la solicitud cambia a "Pagado".
- [ ] **CA-2:** Se activa automáticamente en la cuenta del colaborador el botón "Registrar Gastos".
- [ ] **CA-3:** Se dispara la notificación al colaborador y coordinador.
- [ ] **CA-4:** La operación queda registrada en auditoría con usuario, fecha y hora.

### 📎 Referencias

- Funcionalidad: `FUNC-04-01` — Registro de Comprobante de Pago
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-04-01-03] Registrar datos bancarios del depósito
LABELS: historia-usuario,fase-4,func-04-01,rol:contabilidad
MILESTONE: Fase 4
BODY:
## HU-04-01-03 — Registrar datos bancarios del depósito

**Funcionalidad padre:** `FUNC-04-01` — Registro de Comprobante de Pago
**Fase:** Fase 4 (Gestión de Pago por Tesorería)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** registrar fecha del depósito, monto pagado, banco y número de operación,
**para que** tener trazabilidad completa de la transacción bancaria.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario captura fecha (datepicker), monto (numérico), banco (selector) y número de operación (texto).
- [ ] **CA-2:** El monto debe coincidir con el monto aprobado de la solicitud.
- [ ] **CA-3:** Si hay diferencia de monto, el sistema solicita confirmación explícita.

### 📎 Referencias

- Funcionalidad: `FUNC-04-01` — Registro de Comprobante de Pago
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-04-02 — Notificación de Pago Realizado

_Fase: **Fase 4** · Historias: **2**_

---ISSUE---
TITLE: [HU-04-02-01] Recibir confirmación de pago con comprobante adjunto
LABELS: historia-usuario,fase-4,func-04-02,rol:colaborador
MILESTONE: Fase 4
BODY:
## HU-04-02-01 — Recibir confirmación de pago con comprobante adjunto

**Funcionalidad padre:** `FUNC-04-02` — Notificación de Pago Realizado
**Fase:** Fase 4 (Gestión de Pago por Tesorería)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** recibir un email con el comprobante de pago adjunto cuando Contabilidad confirma el desembolso,
**para que** tener evidencia del pago y comenzar a registrar mis gastos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El email se envía dentro de los 2 minutos posteriores a la confirmación de pago.
- [ ] **CA-2:** Incluye el archivo del comprobante de pago como adjunto.
- [ ] **CA-3:** Contiene los datos bancarios: monto, fecha de depósito, banco y número de operación.
- [ ] **CA-4:** Incluye link directo a la plataforma para iniciar el registro de gastos.

### 📎 Referencias

- Funcionalidad: `FUNC-04-02` — Notificación de Pago Realizado
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-04-02-02] Notificación al coordinador sobre el pago efectivo
LABELS: historia-usuario,fase-4,func-04-02,rol:coordinador
MILESTONE: Fase 4
BODY:
## HU-04-02-02 — Notificación al coordinador sobre el pago efectivo

**Funcionalidad padre:** `FUNC-04-02` — Notificación de Pago Realizado
**Fase:** Fase 4 (Gestión de Pago por Tesorería)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** recibir notificación cuando los viáticos que aprobé son pagados,
**para que** saber que el desembolso se realizó y dar seguimiento al colaborador en el viaje.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El coordinador recibe el mismo email que el colaborador.
- [ ] **CA-2:** Puede acceder a la solicitud desde el link y ver el comprobante.

### 📎 Referencias

- Funcionalidad: `FUNC-04-02` — Notificación de Pago Realizado
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-04-03 — Activación Automática del Módulo de Gastos

_Fase: **Fase 4** · Historias: **2**_

---ISSUE---
TITLE: [HU-04-03-01] Habilitar módulo de gastos al recibir el pago
LABELS: historia-usuario,fase-4,func-04-03,rol:sistema
MILESTONE: Fase 4
BODY:
## HU-04-03-01 — Habilitar módulo de gastos al recibir el pago

**Funcionalidad padre:** `FUNC-04-03` — Activación Automática del Módulo de Gastos
**Fase:** Fase 4 (Gestión de Pago por Tesorería)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** habilitar automáticamente el módulo de Gastos para el colaborador cuando la solicitud pasa a estado "Pagado",
**para que** que el colaborador pueda comenzar a registrar gastos sin depender de una activación manual.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al confirmar el pago en Fase 4.1, el sistema habilita en la cuenta del colaborador los formularios de Factura, Planilla de Movilidad, Recibo de Caja y Comprobante de Caja.
- [ ] **CA-2:** El estado de la rendición cambia a "En Progreso - Registrando Gastos".
- [ ] **CA-3:** El cambio se refleja inmediatamente en el dashboard del colaborador.

### 📎 Referencias

- Funcionalidad: `FUNC-04-03` — Activación Automática del Módulo de Gastos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-04-03-02] Visualizar rendición en progreso desde el dashboard
LABELS: historia-usuario,fase-4,func-04-03,rol:colaborador
MILESTONE: Fase 4
BODY:
## HU-04-03-02 — Visualizar rendición en progreso desde el dashboard

**Funcionalidad padre:** `FUNC-04-03` — Activación Automática del Módulo de Gastos
**Fase:** Fase 4 (Gestión de Pago por Tesorería)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** ver mi rendición activa con estado "En Progreso - Registrando Gastos" en mi dashboard,
**para que** saber que ya puedo iniciar el registro de gastos contra el viático recibido.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El dashboard muestra la rendición con badge "En Progreso".
- [ ] **CA-2:** Muestra el saldo disponible (monto recibido - gastos registrados).
- [ ] **CA-3:** Incluye accesos rápidos a los 4 tipos de comprobantes.

### 📎 Referencias

- Funcionalidad: `FUNC-04-03` — Activación Automática del Módulo de Gastos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-01 — Registro de Factura Electrónica con OCR y Validación SUNAT

_Fase: **Fase 5** · Historias: **5**_

---ISSUE---
TITLE: [HU-05-01-01] Registrar factura mediante captura con cámara
LABELS: historia-usuario,fase-5,func-05-01,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-01-01 — Registrar factura mediante captura con cámara

**Funcionalidad padre:** `FUNC-05-01` — Registro de Factura Electrónica con OCR y Validación SUNAT
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** tomar una foto de mi factura física con la cámara del celular,
**para que** registrarla rápidamente sin tener que digitar manualmente los datos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema activa la cámara del navegador con permiso del usuario.
- [ ] **CA-2:** Tras tomar la foto, ejecuta OCR y completa automáticamente RUC, fecha, monto y número.
- [ ] **CA-3:** Muestra los datos extraídos en un formulario editable.
- [ ] **CA-4:** La imagen original queda almacenada como respaldo.

### 📎 Referencias

- Funcionalidad: `FUNC-05-01` — Registro de Factura Electrónica con OCR y Validación SUNAT
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-01-02] Subir factura como archivo
LABELS: historia-usuario,fase-5,func-05-01,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-01-02 — Subir factura como archivo

**Funcionalidad padre:** `FUNC-05-01` — Registro de Factura Electrónica con OCR y Validación SUNAT
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** subir un archivo PDF o JPG de la factura desde mi computadora,
**para que** registrar facturas electrónicas que recibí por email.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema acepta PDF y JPG.
- [ ] **CA-2:** Tras subir, ejecuta OCR sobre el archivo y extrae los datos.
- [ ] **CA-3:** Si el OCR no logra extraer un campo, lo deja vacío para llenado manual.

### 📎 Referencias

- Funcionalidad: `FUNC-05-01` — Registro de Factura Electrónica con OCR y Validación SUNAT
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-01-03] Validar factura contra SUNAT en tiempo real
LABELS: historia-usuario,fase-5,func-05-01,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-01-03 — Validar factura contra SUNAT en tiempo real

**Funcionalidad padre:** `FUNC-05-01` — Registro de Factura Electrónica con OCR y Validación SUNAT
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** validar automáticamente cada factura cargada contra el servicio de SUNAT,
**para que** garantizar que solo se registren comprobantes válidos y emitidos a la empresa.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema consulta el endpoint de SUNAT enviando RUC emisor, número de comprobante, fecha y monto.
- [ ] **CA-2:** Si la factura es válida y emitida a [Empresa], la guarda y registra el gasto.
- [ ] **CA-3:** Si no es válida, muestra mensaje específico según el motivo (anulada, no existe, no emitida a empresa).
- [ ] **CA-4:** Si el servicio SUNAT está indisponible, reintenta 2 veces antes de mostrar error.

### 📎 Referencias

- Funcionalidad: `FUNC-05-01` — Registro de Factura Electrónica con OCR y Validación SUNAT
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-01-04] Editar datos extraídos por OCR antes de guardar
LABELS: historia-usuario,fase-5,func-05-01,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-01-04 — Editar datos extraídos por OCR antes de guardar

**Funcionalidad padre:** `FUNC-05-01` — Registro de Factura Electrónica con OCR y Validación SUNAT
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** editar los campos que extrajo el OCR antes de guardar la factura,
**para que** corregir cualquier error de reconocimiento automático sin tener que descartar el comprobante.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Todos los campos extraídos son editables: RUC, fecha, monto, número.
- [ ] **CA-2:** El sistema valida que el formato de cada campo sea correcto antes de permitir guardar.
- [ ] **CA-3:** Si edito el RUC, el sistema vuelve a ejecutar la validación SUNAT.

### 📎 Referencias

- Funcionalidad: `FUNC-05-01` — Registro de Factura Electrónica con OCR y Validación SUNAT
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-01-05] Manejo de error cuando SUNAT no está disponible
LABELS: historia-usuario,fase-5,func-05-01,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-01-05 — Manejo de error cuando SUNAT no está disponible

**Funcionalidad padre:** `FUNC-05-01` — Registro de Factura Electrónica con OCR y Validación SUNAT
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** permitir registrar facturas con validación posterior cuando SUNAT no responde,
**para que** no bloquear al colaborador en zonas con conectividad limitada o ante caídas del servicio externo.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Tras 2 reintentos fallidos, el sistema muestra: "Servicio SUNAT no disponible. Puede registrar el comprobante con validación posterior.".
- [ ] **CA-2:** El comprobante queda en estado "Pendiente de Validación SUNAT".
- [ ] **CA-3:** Un proceso batch nocturno reintenta la validación en estos comprobantes.
- [ ] **CA-4:** Cuando se valida exitosamente, el estado pasa a "Aprobado"; si la validación falla, se marca como "Observado" para revisión.

### 📎 Referencias

- Funcionalidad: `FUNC-05-01` — Registro de Factura Electrónica con OCR y Validación SUNAT
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-02 — Registro de Planilla de Movilidad con Geolocalización

_Fase: **Fase 5** · Historias: **4**_

---ISSUE---
TITLE: [HU-05-02-01] Registrar trayecto de movilidad con GPS
LABELS: historia-usuario,fase-5,func-05-02,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-02-01 — Registrar trayecto de movilidad con GPS

**Funcionalidad padre:** `FUNC-05-02` — Registro de Planilla de Movilidad con Geolocalización
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** registrar mi planilla de movilidad capturando los lugares de inicio y fin con GPS,
**para que** documentar mis traslados de forma precisa sin riesgo de errores manuales en direcciones.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El campo Lugar Inicio sugiere ubicaciones mientras escribo y permite seleccionar una con coordenadas asociadas.
- [ ] **CA-2:** El campo Lugar Fin opera de la misma manera.
- [ ] **CA-3:** El sistema calcula y muestra la distancia en km entre ambos puntos usando la fórmula Haversine.

### 📎 Referencias

- Funcionalidad: `FUNC-05-02` — Registro de Planilla de Movilidad con Geolocalización
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-02-02] Agregar múltiples filas de movilidad
LABELS: historia-usuario,fase-5,func-05-02,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-02-02 — Agregar múltiples filas de movilidad

**Funcionalidad padre:** `FUNC-05-02` — Registro de Planilla de Movilidad con Geolocalización
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** agregar varias filas en una misma planilla de movilidad,
**para que** registrar múltiples traslados del mismo viaje en un solo comprobante.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Puedo agregar y eliminar filas dinámicamente sin recargar la página.
- [ ] **CA-2:** Cada fila incluye Fecha, Cliente/Proveedor, Lugar Inicio, Lugar Fin, Gestión y Total.
- [ ] **CA-3:** El Total General se actualiza automáticamente al modificar las filas.

### 📎 Referencias

- Funcionalidad: `FUNC-05-02` — Registro de Planilla de Movilidad con Geolocalización
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-02-03] Generar correlativo único por colaborador
LABELS: historia-usuario,fase-5,func-05-02,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-02-03 — Generar correlativo único por colaborador

**Funcionalidad padre:** `FUNC-05-02` — Registro de Planilla de Movilidad con Geolocalización
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** generar correlativos personalizados por colaborador (ej: JSC001, JSC002),
**para que** que cada colaborador tenga su propia secuencia identificable en sus documentos internos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Las iniciales se calculan desde el nombre y apellidos del colaborador (1ra letra de nombre + 1ra letra de apellido paterno + 1ra letra de apellido materno).
- [ ] **CA-2:** El correlativo es secuencial por usuario y tipo de documento, con formato de 3 dígitos.
- [ ] **CA-3:** El sistema mantiene la secuencia ininterrumpida aunque otros usuarios generen documentos en paralelo.

### 📎 Referencias

- Funcionalidad: `FUNC-05-02` — Registro de Planilla de Movilidad con Geolocalización
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-02-04] Descargar PDF de planilla de movilidad firmada
LABELS: historia-usuario,fase-5,func-05-02,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-02-04 — Descargar PDF de planilla de movilidad firmada

**Funcionalidad padre:** `FUNC-05-02` — Registro de Planilla de Movilidad con Geolocalización
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** descargar la planilla de movilidad en PDF con mi firma digital incrustada,
**para que** tener un comprobante formal con respaldo de la empresa para uso administrativo.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El PDF incluye razón social y RUC de TEMA LITOCLEAN SAC.
- [ ] **CA-2:** Incluye nombre completo y DNI del colaborador.
- [ ] **CA-3:** Incluye el correlativo personalizado.
- [ ] **CA-4:** Incluye el detalle completo del formulario y los totales.
- [ ] **CA-5:** La firma digital se incrusta solo cuando la rendición está en estado "Cerrado".
- [ ] **CA-6:** El PDF incluye lugar y fecha de generación + pie de página corporativo (dirección, teléfono, web, email).

### 📎 Referencias

- Funcionalidad: `FUNC-05-02` — Registro de Planilla de Movilidad con Geolocalización
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-03 — Registro de Recibo de Caja con OCR

_Fase: **Fase 5** · Historias: **2**_

---ISSUE---
TITLE: [HU-05-03-01] Registrar recibo con captura OCR
LABELS: historia-usuario,fase-5,func-05-03,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-03-01 — Registrar recibo con captura OCR

**Funcionalidad padre:** `FUNC-05-03` — Registro de Recibo de Caja con OCR
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** tomar una foto de un recibo de caja y que el OCR llene los campos automáticamente,
**para que** ahorrar tiempo y reducir errores de digitación.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema extrae Razón Social, RUC, Fecha, Concepto, N° Documento y Monto.
- [ ] **CA-2:** Permite editar cualquier campo antes de guardar.
- [ ] **CA-3:** Almacena la imagen original como respaldo.

### 📎 Referencias

- Funcionalidad: `FUNC-05-03` — Registro de Recibo de Caja con OCR
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-03-02] Registrar recibo manualmente con archivo adjunto
LABELS: historia-usuario,fase-5,func-05-03,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-03-02 — Registrar recibo manualmente con archivo adjunto

**Funcionalidad padre:** `FUNC-05-03` — Registro de Recibo de Caja con OCR
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** ingresar manualmente los datos del recibo cuando el OCR no funciona o no aplica,
**para que** no quedar bloqueado en casos de recibos con caligrafía difícil de reconocer.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario manual habilita los mismos campos que el flujo OCR.
- [ ] **CA-2:** Es obligatorio adjuntar la foto o archivo del comprobante físico.
- [ ] **CA-3:** El sistema valida que la fecha no sea futura y el monto > 0.

### 📎 Referencias

- Funcionalidad: `FUNC-05-03` — Registro de Recibo de Caja con OCR
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-04 — Registro de Comprobante de Caja (Formulario Interno)

_Fase: **Fase 5** · Historias: **2**_

---ISSUE---
TITLE: [HU-05-04-01] Registrar comprobante de caja interno
LABELS: historia-usuario,fase-5,func-05-04,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-04-01 — Registrar comprobante de caja interno

**Funcionalidad padre:** `FUNC-05-04` — Registro de Comprobante de Caja (Formulario Interno)
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** registrar un comprobante de caja para gastos menores sin factura,
**para que** documentar legítimamente gastos como propinas, peajes o consumos menores en zonas sin facturación.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario captura: Entregado a, Dirección (opcional), Concepto, Monto, Proyecto.
- [ ] **CA-2:** El sistema genera automáticamente el código con iniciales del colaborador y correlativo.
- [ ] **CA-3:** La fecha es la del día de generación, no editable.
- [ ] **CA-4:** Tras guardar, queda asociado al centro de costo seleccionado.

### 📎 Referencias

- Funcionalidad: `FUNC-05-04` — Registro de Comprobante de Caja (Formulario Interno)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-04-02] Descargar PDF del comprobante con plantilla oficial
LABELS: historia-usuario,fase-5,func-05-04,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-04-02 — Descargar PDF del comprobante con plantilla oficial

**Funcionalidad padre:** `FUNC-05-04` — Registro de Comprobante de Caja (Formulario Interno)
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** descargar el comprobante de caja en PDF con el formato corporativo idéntico a la plantilla Excel,
**para que** tener un documento formal para entregar al beneficiario o al área de administración.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El PDF respeta visualmente la plantilla COMPROBANTE DE CAJA (1).XLSX.
- [ ] **CA-2:** Incluye el correlativo personalizado del colaborador.
- [ ] **CA-3:** Incluye la firma digital solo cuando la rendición está cerrada.

### 📎 Referencias

- Funcionalidad: `FUNC-05-04` — Registro de Comprobante de Caja (Formulario Interno)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-05 — Generación de Declaración Jurada (Exclusivo Contabilidad)

_Fase: **Fase 5** · Historias: **2**_

---ISSUE---
TITLE: [HU-05-05-01] Generar declaración jurada por viáticos nacionales
LABELS: historia-usuario,fase-5,func-05-05,rol:contabilidad
MILESTONE: Fase 5
BODY:
## HU-05-05-01 — Generar declaración jurada por viáticos nacionales

**Funcionalidad padre:** `FUNC-05-05` — Generación de Declaración Jurada (Exclusivo Contabilidad)
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** generar una declaración jurada de viáticos nacionales seleccionando los comprobantes de caja de una rendición,
**para que** cumplir con la documentación tributaria requerida por SUNAT.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario muestra los comprobantes de caja registrados en la rendición seleccionada con checkboxes.
- [ ] **CA-2:** Solo permite generar la declaración si la rendición está en estado "Cerrado".
- [ ] **CA-3:** Genera un PDF en formato oficial con todos los datos consolidados.
- [ ] **CA-4:** Incluye la firma digital del colaborador.
- [ ] **CA-5:** Registra en auditoría: quién generó, cuándo, comprobantes incluidos.

### 📎 Referencias

- Funcionalidad: `FUNC-05-05` — Generación de Declaración Jurada (Exclusivo Contabilidad)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-05-02] Generar declaración jurada por viaje al exterior
LABELS: historia-usuario,fase-5,func-05-05,rol:contabilidad
MILESTONE: Fase 5
BODY:
## HU-05-05-02 — Generar declaración jurada por viaje al exterior

**Funcionalidad padre:** `FUNC-05-05` — Generación de Declaración Jurada (Exclusivo Contabilidad)
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** generar una declaración jurada para viajes al exterior,
**para que** documentar formalmente los gastos realizados fuera del país.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema utiliza un formato oficial diferenciado para viajes al exterior.
- [ ] **CA-2:** Permite seleccionar comprobantes de caja del viaje al exterior.
- [ ] **CA-3:** El PDF incluye campos específicos: país, moneda y tipo de cambio.

### 📎 Referencias

- Funcionalidad: `FUNC-05-05` — Generación de Declaración Jurada (Exclusivo Contabilidad)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-06 — Validación de Plazo de Ingreso de Comprobantes

_Fase: **Fase 5** · Historias: **4**_

---ISSUE---
TITLE: [HU-05-06-01] Permitir carga normal dentro de plazo
LABELS: historia-usuario,fase-5,func-05-06,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-06-01 — Permitir carga normal dentro de plazo

**Funcionalidad padre:** `FUNC-05-06` — Validación de Plazo de Ingreso de Comprobantes
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** permitir la carga sin restricciones cuando la diferencia entre emisión y carga es ≤ 2 días,
**para que** no obstaculizar el flujo cuando el colaborador opera dentro de los plazos normales.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si la diferencia es ≤ 2 días, el comprobante se guarda con estado normal.
- [ ] **CA-2:** No se muestra ninguna alerta o advertencia.

### 📎 Referencias

- Funcionalidad: `FUNC-05-06` — Validación de Plazo de Ingreso de Comprobantes
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-06-02] Marcar como observado por carga tardía dentro del mismo mes
LABELS: historia-usuario,fase-5,func-05-06,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-06-02 — Marcar como observado por carga tardía dentro del mismo mes

**Funcionalidad padre:** `FUNC-05-06` — Validación de Plazo de Ingreso de Comprobantes
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** marcar el comprobante como "Observado" cuando se carga con más de 2 días pero dentro del mismo mes,
**para que** permitir continuidad operativa pero con alerta para revisión posterior.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Antes de guardar, el sistema muestra alerta: "Comprobante fuera de plazo (más de 2 días). Se registrará como OBSERVADO.".
- [ ] **CA-2:** Si el colaborador acepta, el comprobante se guarda con flag observado = true.
- [ ] **CA-3:** El comprobante observado aparece destacado visualmente en la lista de gastos.
- [ ] **CA-4:** El coordinador ve este flag en su revisión.

### 📎 Referencias

- Funcionalidad: `FUNC-05-06` — Validación de Plazo de Ingreso de Comprobantes
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-06-03] Bloquear carga por cambio de mes con retraso
LABELS: historia-usuario,fase-5,func-05-06,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-06-03 — Bloquear carga por cambio de mes con retraso

**Funcionalidad padre:** `FUNC-05-06` — Validación de Plazo de Ingreso de Comprobantes
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** bloquear totalmente la carga cuando hay cambio de mes y diferencia > 2 días,
**para que** garantizar el cierre tributario y contable mensual.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si mes_emision ≠ mes_carga y diferencia > 2 días, el sistema impide guardar el comprobante.
- [ ] **CA-2:** Muestra mensaje: "No se permite cargar comprobantes de meses anteriores con más de 2 días de retraso. Contacte a Contabilidad.".
- [ ] **CA-3:** El colaborador no puede continuar; debe escalar a Contabilidad para autorización excepcional.

### 📎 Referencias

- Funcionalidad: `FUNC-05-06` — Validación de Plazo de Ingreso de Comprobantes
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-06-04] Impedir registro de comprobantes con fecha futura
LABELS: historia-usuario,fase-5,func-05-06,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-06-04 — Impedir registro de comprobantes con fecha futura

**Funcionalidad padre:** `FUNC-05-06` — Validación de Plazo de Ingreso de Comprobantes
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** impedir el registro de comprobantes con fecha posterior a hoy,
**para que** garantizar la coherencia temporal de los gastos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El datepicker tiene maxDate = today.
- [ ] **CA-2:** Si por edición manual se ingresa una fecha futura, el sistema rechaza el guardado con mensaje claro.

### 📎 Referencias

- Funcionalidad: `FUNC-05-06` — Validación de Plazo de Ingreso de Comprobantes
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-07 — Revisión de Gastos por Coordinador en Tiempo Real

_Fase: **Fase 5** · Historias: **4**_

---ISSUE---
TITLE: [HU-05-07-01] Visualizar gastos pendientes de revisión
LABELS: historia-usuario,fase-5,func-05-07,rol:coordinador
MILESTONE: Fase 5
BODY:
## HU-05-07-01 — Visualizar gastos pendientes de revisión

**Funcionalidad padre:** `FUNC-05-07` — Revisión de Gastos por Coordinador en Tiempo Real
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** ver en mi dashboard todos los gastos registrados por colaboradores a mi cargo pendientes de revisión,
**para que** priorizar mi trabajo de revisión y aprobación.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El dashboard muestra solo gastos en estado "Pendiente" por defecto.
- [ ] **CA-2:** Permite filtrar por fecha, categoría, colaborador y estado.
- [ ] **CA-3:** Cada gasto muestra: colaborador, fecha, categoría, monto, tipo de comprobante, flag observado si aplica.

### 📎 Referencias

- Funcionalidad: `FUNC-05-07` — Revisión de Gastos por Coordinador en Tiempo Real
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-07-02] Aprobar un gasto individual
LABELS: historia-usuario,fase-5,func-05-07,rol:coordinador
MILESTONE: Fase 5
BODY:
## HU-05-07-02 — Aprobar un gasto individual

**Funcionalidad padre:** `FUNC-05-07` — Revisión de Gastos por Coordinador en Tiempo Real
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** aprobar un gasto individual revisado,
**para que** validarlo dentro de la rendición y avanzar hacia la aprobación final.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al aprobar, el estado del gasto cambia a "Aprobado".
- [ ] **CA-2:** El gasto aprobado no puede ser editado por el colaborador.
- [ ] **CA-3:** El monto aprobado suma al total aprobado de la rendición.

### 📎 Referencias

- Funcionalidad: `FUNC-05-07` — Revisión de Gastos por Coordinador en Tiempo Real
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-07-03] Rechazar un gasto con motivo obligatorio
LABELS: historia-usuario,fase-5,func-05-07,rol:coordinador
MILESTONE: Fase 5
BODY:
## HU-05-07-03 — Rechazar un gasto con motivo obligatorio

**Funcionalidad padre:** `FUNC-05-07` — Revisión de Gastos por Coordinador en Tiempo Real
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** rechazar un gasto ingresando un motivo de rechazo obligatorio,
**para que** que el colaborador sepa qué corregir y pueda re-editarlo.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al rechazar, se abre un modal con campo "Motivo de rechazo" (mínimo 10 caracteres).
- [ ] **CA-2:** Tras confirmar, el estado cambia a "Rechazado" y se notifica al colaborador.
- [ ] **CA-3:** El colaborador puede editar el gasto rechazado y reenviarlo.

### 📎 Referencias

- Funcionalidad: `FUNC-05-07` — Revisión de Gastos por Coordinador en Tiempo Real
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-07-04] Consultar historial de revisiones
LABELS: historia-usuario,fase-5,func-05-07,rol:coordinador
MILESTONE: Fase 5
BODY:
## HU-05-07-04 — Consultar historial de revisiones

**Funcionalidad padre:** `FUNC-05-07` — Revisión de Gastos por Coordinador en Tiempo Real
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** consultar el historial de aprobaciones y rechazos de cada gasto,
**para que** tener trazabilidad de mis decisiones y los cambios.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Cada gasto muestra log con cada cambio de estado: usuario, fecha, hora y observación si aplica.
- [ ] **CA-2:** Se pueden filtrar por colaborador, rango de fechas y tipo de acción.

### 📎 Referencias

- Funcionalidad: `FUNC-05-07` — Revisión de Gastos por Coordinador en Tiempo Real
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-08 — Cierre y Envío de Rendición por Colaborador

_Fase: **Fase 5** · Historias: **2**_

---ISSUE---
TITLE: [HU-05-08-01] Validar rendición antes de enviarla
LABELS: historia-usuario,fase-5,func-05-08,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-08-01 — Validar rendición antes de enviarla

**Funcionalidad padre:** `FUNC-05-08` — Cierre y Envío de Rendición por Colaborador
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** validar que todos los gastos tengan comprobante adjunto y no haya rechazos pendientes antes de permitir cerrar la rendición,
**para que** evitar que se envíen rendiciones incompletas que el coordinador deba devolver.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si algún gasto no tiene comprobante, muestra mensaje específico con el listado de gastos faltantes.
- [ ] **CA-2:** Si hay gastos rechazados sin re-editar, muestra mensaje listándolos.
- [ ] **CA-3:** El botón "Cerrar y Enviar" se deshabilita hasta que se cumplan ambas condiciones.

### 📎 Referencias

- Funcionalidad: `FUNC-05-08` — Cierre y Envío de Rendición por Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-08-02] Enviar rendición para aprobación final
LABELS: historia-usuario,fase-5,func-05-08,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-08-02 — Enviar rendición para aprobación final

**Funcionalidad padre:** `FUNC-05-08` — Cierre y Envío de Rendición por Colaborador
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** enviar mi rendición completa al coordinador para su aprobación final,
**para que** iniciar el cierre del flujo y eventualmente el cierre definitivo.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al enviar, la rendición pasa a estado "Enviada para Aprobación Final".
- [ ] **CA-2:** El coordinador recibe notificación automática.
- [ ] **CA-3:** Yo no puedo seguir agregando o editando gastos en este estado.

### 📎 Referencias

- Funcionalidad: `FUNC-05-08` — Cierre y Envío de Rendición por Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-09 — Aprobación Final de Rendición Completa por Coordinador

_Fase: **Fase 5** · Historias: **3**_

---ISSUE---
TITLE: [HU-05-09-01] Aprobar rendición completa solo con gastos aprobados
LABELS: historia-usuario,fase-5,func-05-09,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-09-01 — Aprobar rendición completa solo con gastos aprobados

**Funcionalidad padre:** `FUNC-05-09` — Aprobación Final de Rendición Completa por Coordinador
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** permitir la aprobación final solo cuando todos los gastos individuales están aprobados,
**para que** garantizar la integridad del flujo y evitar aprobaciones de rendiciones incompletas.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si algún gasto está "Pendiente" o "Rechazado", el botón "Aprobar Rendición" se deshabilita.
- [ ] **CA-2:** Muestra mensaje: "Apruebe todos los gastos individuales para habilitar la aprobación final".
- [ ] **CA-3:** Cuando todos los gastos están aprobados, el botón se habilita automáticamente.

### 📎 Referencias

- Funcionalidad: `FUNC-05-09` — Aprobación Final de Rendición Completa por Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-09-02] Aprobar rendición y notificar a Contabilidad
LABELS: historia-usuario,fase-5,func-05-09,rol:coordinador
MILESTONE: Fase 5
BODY:
## HU-05-09-02 — Aprobar rendición y notificar a Contabilidad

**Funcionalidad padre:** `FUNC-05-09` — Aprobación Final de Rendición Completa por Coordinador
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** aprobar la rendición completa de un colaborador,
**para que** que Contabilidad ejecute la liquidación final (reembolso o devolución).

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al aprobar, el estado pasa a "Aprobada".
- [ ] **CA-2:** Se notifica automáticamente a Contabilidad con resumen y link.
- [ ] **CA-3:** La rendición ya no puede ser editada por colaborador ni coordinador.

### 📎 Referencias

- Funcionalidad: `FUNC-05-09` — Aprobación Final de Rendición Completa por Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-09-03] Rechazar rendición con observación general
LABELS: historia-usuario,fase-5,func-05-09,rol:coordinador
MILESTONE: Fase 5
BODY:
## HU-05-09-03 — Rechazar rendición con observación general

**Funcionalidad padre:** `FUNC-05-09` — Aprobación Final de Rendición Completa por Coordinador
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** rechazar la rendición completa con una observación general,
**para que** devolverla al colaborador cuando hay observaciones que requieren retrabajo de varios gastos a la vez.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al rechazar se abre un modal con observación general obligatoria.
- [ ] **CA-2:** El estado de la rendición vuelve a "En Progreso - Registrando Gastos".
- [ ] **CA-3:** Los gastos que el coordinador marque para corrección se desbloquean para edición.
- [ ] **CA-4:** Se notifica al colaborador con la observación.

### 📎 Referencias

- Funcionalidad: `FUNC-05-09` — Aprobación Final de Rendición Completa por Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-10 — Descarga de Rendición Completa en PDF

_Fase: **Fase 5** · Historias: **3**_

---ISSUE---
TITLE: [HU-05-10-01] Descargar PDF de rendición consolidada
LABELS: historia-usuario,fase-5,func-05-10,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-10-01 — Descargar PDF de rendición consolidada

**Funcionalidad padre:** `FUNC-05-10` — Descarga de Rendición Completa en PDF
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** descargar el PDF consolidado de mi rendición con todos los gastos y resumen financiero,
**para que** tener evidencia completa de mi gestión y compartirla con áreas internas.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El PDF incluye los datos del colaborador, viaje, tabla completa de gastos y resumen financiero.
- [ ] **CA-2:** La firma digital se incrusta solo cuando la rendición está "Cerrado".
- [ ] **CA-3:** El pie de página incluye fecha de generación, usuario que descargó y hash de integridad.

### 📎 Referencias

- Funcionalidad: `FUNC-05-10` — Descarga de Rendición Completa en PDF
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-10-02] Identificar visualmente gastos observados en el PDF
LABELS: historia-usuario,fase-5,func-05-10,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-10-02 — Identificar visualmente gastos observados en el PDF

**Funcionalidad padre:** `FUNC-05-10` — Descarga de Rendición Completa en PDF
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** marcar visualmente los gastos en estado "Observado" en la tabla del PDF,
**para que** facilitar al lector identificar qué gastos requieren atención adicional.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** La columna Estado muestra "Observado" con color destacado.
- [ ] **CA-2:** Los gastos observados se ordenan al final de la tabla.
- [ ] **CA-3:** Se incluye nota al pie explicando el significado de "Observado".

### 📎 Referencias

- Funcionalidad: `FUNC-05-10` — Descarga de Rendición Completa en PDF
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-10-03] Verificar integridad del PDF descargado
LABELS: historia-usuario,fase-5,func-05-10,rol:otro
MILESTONE: Fase 5
BODY:
## HU-05-10-03 — Verificar integridad del PDF descargado

**Funcionalidad padre:** `FUNC-05-10` — Descarga de Rendición Completa en PDF
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Auditor,
**quiero** verificar que un PDF descargado no haya sido modificado posteriormente,
**para que** garantizar la integridad documental para auditoría.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El pie del PDF incluye un hash SHA-256 calculado en el momento de la generación.
- [ ] **CA-2:** El hash queda registrado en el sistema con la rendición.
- [ ] **CA-3:** Cualquier persona puede recalcular el hash del PDF y compararlo con el registrado para verificar integridad.

### 📎 Referencias

- Funcionalidad: `FUNC-05-10` — Descarga de Rendición Completa en PDF
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-11 — Ampliación de Plazo de Rendición por Coordinador

_Fase: **Fase 5** · Historias: **2**_

---ISSUE---
TITLE: [HU-05-11-01] Ampliar plazo de rendición
LABELS: historia-usuario,fase-5,func-05-11,rol:coordinador
MILESTONE: Fase 5
BODY:
## HU-05-11-01 — Ampliar plazo de rendición

**Funcionalidad padre:** `FUNC-05-11` — Ampliación de Plazo de Rendición por Coordinador
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** ampliar la fecha límite de rendición de un colaborador,
**para que** darle más tiempo cuando el viaje se extiende o aparecen circunstancias justificadas.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El botón "Ampliar Plazo" solo está disponible cuando la rendición está en estado "En Progreso".
- [ ] **CA-2:** El modal valida que la nueva fecha sea ≥ fecha actual.
- [ ] **CA-3:** Al guardar, se notifica al colaborador con la nueva fecha límite.
- [ ] **CA-4:** Se registra el cambio en auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-05-11` — Ampliación de Plazo de Rendición por Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-11-02] Recibir notificación de ampliación de plazo
LABELS: historia-usuario,fase-5,func-05-11,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-11-02 — Recibir notificación de ampliación de plazo

**Funcionalidad padre:** `FUNC-05-11` — Ampliación de Plazo de Rendición por Coordinador
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** recibir notificación cuando el coordinador amplía mi plazo de rendición,
**para que** saber hasta cuándo tengo para completar mis registros.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Email con asunto "Su plazo para registrar gastos ha sido ampliado hasta [Nueva Fecha]".
- [ ] **CA-2:** El cuerpo incluye el nombre del coordinador, la nueva fecha y un recordatorio de los pendientes.

### 📎 Referencias

- Funcionalidad: `FUNC-05-11` — Ampliación de Plazo de Rendición por Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-12 — Solicitud de Ampliación de Presupuesto por Colaborador

_Fase: **Fase 5** · Historias: **2**_

---ISSUE---
TITLE: [HU-05-12-01] Solicitar ampliación de presupuesto
LABELS: historia-usuario,fase-5,func-05-12,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-12-01 — Solicitar ampliación de presupuesto

**Funcionalidad padre:** `FUNC-05-12` — Solicitud de Ampliación de Presupuesto por Colaborador
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** solicitar una ampliación de presupuesto vinculada a mi rendición actual cuando alcanzo el límite de una categoría,
**para que** poder seguir registrando gastos sin tener que crear una rendición independiente.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario me permite seleccionar las categorías a ampliar e ingresar el monto adicional por cada una.
- [ ] **CA-2:** Es obligatorio justificar el motivo.
- [ ] **CA-3:** Al guardar, la nueva solicitud queda vinculada a la rendición original (solicitud_raiz_id).
- [ ] **CA-4:** Sigue el mismo flujo de aprobación que una solicitud nueva.

### 📎 Referencias

- Funcionalidad: `FUNC-05-12` — Solicitud de Ampliación de Presupuesto por Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-12-02] Consolidar montos en reporte final
LABELS: historia-usuario,fase-5,func-05-12,rol:sistema
MILESTONE: Fase 5
BODY:
## HU-05-12-02 — Consolidar montos en reporte final

**Funcionalidad padre:** `FUNC-05-12` — Solicitud de Ampliación de Presupuesto por Colaborador
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** consolidar el monto original + monto ampliación aprobada en el reporte final,
**para que** que la rendición refleje el presupuesto total realmente disponible.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al descargar la rendición completa, el sistema suma todos los montos de las solicitudes vinculadas.
- [ ] **CA-2:** El resumen financiero muestra el desglose: monto original, monto ampliación, total disponible.
- [ ] **CA-3:** Los gastos se contabilizan contra el total consolidado.

### 📎 Referencias

- Funcionalidad: `FUNC-05-12` — Solicitud de Ampliación de Presupuesto por Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-05-13 — Panel Principal del Colaborador (Dashboard Personal)

_Fase: **Fase 5** · Historias: **3**_

---ISSUE---
TITLE: [HU-05-13-01] Visualizar mis rendiciones desde un solo dashboard
LABELS: historia-usuario,fase-5,func-05-13,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-13-01 — Visualizar mis rendiciones desde un solo dashboard

**Funcionalidad padre:** `FUNC-05-13` — Panel Principal del Colaborador (Dashboard Personal)
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** ver todas mis rendiciones con sus estados, saldos y documentos en una sola pantalla,
**para que** gestionar de forma centralizada el avance de mis gastos y entregables.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El dashboard muestra todas mis rendiciones ordenadas por fecha de creación descendente.
- [ ] **CA-2:** Cada rendición tiene un badge de color según el estado.
- [ ] **CA-3:** Puedo filtrar por estado, rango de fechas o centro de costo.
- [ ] **CA-4:** Cada fila incluye accesos rápidos a las acciones disponibles según el estado.

### 📎 Referencias

- Funcionalidad: `FUNC-05-13` — Panel Principal del Colaborador (Dashboard Personal)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-13-02] Iniciar nueva solicitud desde el dashboard
LABELS: historia-usuario,fase-5,func-05-13,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-13-02 — Iniciar nueva solicitud desde el dashboard

**Funcionalidad padre:** `FUNC-05-13` — Panel Principal del Colaborador (Dashboard Personal)
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** tener un botón "+ Nueva Solicitud" siempre visible en mi dashboard,
**para que** iniciar rápidamente una nueva solicitud sin navegar por menús.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El botón está visible en la parte superior del dashboard.
- [ ] **CA-2:** Al pulsarlo, abre directamente el formulario de solicitud nueva.

### 📎 Referencias

- Funcionalidad: `FUNC-05-13` — Panel Principal del Colaborador (Dashboard Personal)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-05-13-03] Acceder a documentos descargables
LABELS: historia-usuario,fase-5,func-05-13,rol:colaborador
MILESTONE: Fase 5
BODY:
## HU-05-13-03 — Acceder a documentos descargables

**Funcionalidad padre:** `FUNC-05-13` — Panel Principal del Colaborador (Dashboard Personal)
**Fase:** Fase 5 (Ingreso y Validación de Gastos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** acceder rápidamente a la descarga de mis documentos firmados desde mi dashboard,
**para que** obtener mis comprobantes oficiales sin tener que navegar por la rendición completa.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe un menú "Mis Documentos" desde el dashboard.
- [ ] **CA-2:** Lista todos los PDFs disponibles agrupados por tipo (Solicitudes, Planillas, Comprobantes, Rendiciones).
- [ ] **CA-3:** Solo aparecen documentos con firma digital cuando la rendición está "Cerrado".

### 📎 Referencias

- Funcionalidad: `FUNC-05-13` — Panel Principal del Colaborador (Dashboard Personal)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-06-01 — Gestión Integral de Reembolsos al Colaborador

_Fase: **Fase 6** · Historias: **8**_

---ISSUE---
TITLE: [HU-06-01-01] Cálculo automático del reembolso al cerrar rendición
LABELS: historia-usuario,fase-6,func-06-01,rol:sistema
MILESTONE: Fase 6
BODY:
## HU-06-01-01 — Cálculo automático del reembolso al cerrar rendición

**Funcionalidad padre:** `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
**Fase:** Fase 6 (Gestión de Reembolsos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** calcular automáticamente el monto del reembolso cuando los gastos superen el anticipo entregado,
**para que** evitar errores manuales y garantizar que ningún saldo a favor del colaborador quede sin procesar.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al ejecutar FUNC-05-08 (cierre de rendición), el sistema evalúa la condición: total_gastado > monto_entregado.
- [ ] **CA-2:** Si la condición se cumple, calcula: monto_reembolso = total_gastado - monto_entregado.
- [ ] **CA-3:** Crea un registro en la tabla de reembolsos con estado "Pendiente de Pago" y solicitud_origen_id apuntando a la rendición.
- [ ] **CA-4:** El monto se muestra en la vista de la rendición en una sección "Saldo a Favor del Colaborador: S/ [monto]" con color resaltado.
- [ ] **CA-5:** Si total_gastado <= monto_entregado, no se genera reembolso (Fase 6 no se activa).

### 📎 Referencias

- Funcionalidad: `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-06-01-02] Notificación inmediata a Contabilidad sobre reembolso pendiente
LABELS: historia-usuario,fase-6,func-06-01,rol:sistema
MILESTONE: Fase 6
BODY:
## HU-06-01-02 — Notificación inmediata a Contabilidad sobre reembolso pendiente

**Funcionalidad padre:** `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
**Fase:** Fase 6 (Gestión de Reembolsos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** enviar correo automático a Contabilidad cuando se genere un reembolso,
**para que** iniciar oportunamente el proceso de pago al colaborador sin demoras administrativas.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El email se envía en el momento exacto de creación del registro de reembolso.
- [ ] **CA-2:** Asunto del email: "REEMBOLSO PENDIENTE — [Nombre Colaborador] — Rendición N° [###]".
- [ ] **CA-3:** Cuerpo incluye: nombre completo, documento de identidad, área, cargo, monto a reembolsar, fecha de generación.
- [ ] **CA-4:** Incluye datos bancarios del colaborador: Banco, N° Cuenta, CCI (Código de Cuenta Interbancario).
- [ ] **CA-5:** Incluye enlace directo al detalle de la rendición y al panel de Reembolsos Pendientes.
- [ ] **CA-6:** El envío queda registrado en el log de notificaciones del sistema.

### 📎 Referencias

- Funcionalidad: `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-06-01-03] Visualización de reembolsos pendientes por procesar
LABELS: historia-usuario,fase-6,func-06-01,rol:contabilidad
MILESTONE: Fase 6
BODY:
## HU-06-01-03 — Visualización de reembolsos pendientes por procesar

**Funcionalidad padre:** `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
**Fase:** Fase 6 (Gestión de Reembolsos)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** acceder a una bandeja consolidada con todos los reembolsos pendientes de pago,
**para que** priorizar y procesar los pagos de manera eficiente.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe un menú "Reembolsos Pendientes" accesible desde el dashboard de Contabilidad.
- [ ] **CA-2:** La bandeja muestra columnas: N° Rendición, Colaborador, Monto, Fecha Generación, Antigüedad (días), Acción.
- [ ] **CA-3:** Los registros se ordenan por antigüedad descendente (más antiguos primero) por defecto.
- [ ] **CA-4:** Permite filtrar por colaborador, rango de fechas y rango de monto.
- [ ] **CA-5:** Los registros con antigüedad mayor a 30 días se marcan en color rojo con etiqueta "DEMORADO".
- [ ] **CA-6:** Muestra contador total: "X reembolsos pendientes — Total S/ Y" en la cabecera.

### 📎 Referencias

- Funcionalidad: `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-06-01-04] Registro de pago de reembolso con comprobante
LABELS: historia-usuario,fase-6,func-06-01,rol:contabilidad
MILESTONE: Fase 6
BODY:
## HU-06-01-04 — Registro de pago de reembolso con comprobante

**Funcionalidad padre:** `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
**Fase:** Fase 6 (Gestión de Reembolsos)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** registrar el pago de un reembolso adjuntando el comprobante de transferencia,
**para que** dejar evidencia documentada de que el desembolso fue efectivamente realizado.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al pulsar "Procesar Pago" se abre formulario con campos: Fecha de Pago, Monto Pagado, N° Operación, Comprobante (archivo).
- [ ] **CA-2:** El campo Monto Pagado viene pre-llenado con el monto calculado pero es editable.
- [ ] **CA-3:** El sistema valida que el archivo del comprobante sea PDF, JPG o PNG, con tamaño máximo 10 MB.
- [ ] **CA-4:** Si el monto pagado difiere del monto calculado en más de S/ 0.10, exige campo "Justificación" obligatorio (mínimo 50 caracteres).
- [ ] **CA-5:** Al confirmar, el reembolso pasa a estado "Pagado" y queda bloqueado para edición.
- [ ] **CA-6:** El comprobante queda almacenado de forma permanente en el sistema y descargable desde el detalle de la rendición.

### 📎 Referencias

- Funcionalidad: `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-06-01-05] Notificación al colaborador sobre reembolso efectuado
LABELS: historia-usuario,fase-6,func-06-01,rol:colaborador
MILESTONE: Fase 6
BODY:
## HU-06-01-05 — Notificación al colaborador sobre reembolso efectuado

**Funcionalidad padre:** `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
**Fase:** Fase 6 (Gestión de Reembolsos)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** recibir confirmación por correo cuando mi reembolso haya sido procesado,
**para que** verificar que el dinero ha sido transferido y conservar el comprobante.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El email se envía automáticamente al confirmar el pago en el sistema.
- [ ] **CA-2:** Asunto: "Reembolso procesado — Rendición N° [###]".
- [ ] **CA-3:** Cuerpo incluye: monto reembolsado, fecha de pago, número de operación, número de cuenta destino (parcialmente enmascarada por seguridad).
- [ ] **CA-4:** Adjunta el comprobante de transferencia cargado por Contabilidad.
- [ ] **CA-5:** Incluye enlace al detalle completo de la rendición en la plataforma.

### 📎 Referencias

- Funcionalidad: `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-06-01-06] Bloqueo de cierre con reembolsos pendientes
LABELS: historia-usuario,fase-6,func-06-01,rol:sistema
MILESTONE: Fase 6
BODY:
## HU-06-01-06 — Bloqueo de cierre con reembolsos pendientes

**Funcionalidad padre:** `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
**Fase:** Fase 6 (Gestión de Reembolsos)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** impedir que una rendición pase a estado "Cerrado" mientras tenga reembolsos sin pagar,
**para que** asegurar la integridad financiera del proceso y evitar cierres prematuros.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al intentar el cierre definitivo (Fase 8), el sistema valida el estado de todos los reembolsos asociados.
- [ ] **CA-2:** Si existe al menos un reembolso en estado "Pendiente de Pago", la acción se bloquea.
- [ ] **CA-3:** Se muestra mensaje: "No es posible cerrar definitivamente. Existen [N] reembolsos pendientes por un total de S/ [X].".
- [ ] **CA-4:** El mensaje incluye enlace directo al detalle de los reembolsos pendientes.
- [ ] **CA-5:** La validación se ejecuta del lado del servidor (no solo en frontend) para evitar saltos de seguridad.

### 📎 Referencias

- Funcionalidad: `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-06-01-07] Trazabilidad de movimientos económicos en la rendición
LABELS: historia-usuario,fase-6,func-06-01,rol:contabilidad
MILESTONE: Fase 6
BODY:
## HU-06-01-07 — Trazabilidad de movimientos económicos en la rendición

**Funcionalidad padre:** `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
**Fase:** Fase 6 (Gestión de Reembolsos)

### 📝 Historia de Usuario

**Como** Auditor / Contabilidad,
**quiero** ver en el detalle de la rendición la sección "Movimientos Económicos" con todos los flujos,
**para que** auditar de forma transparente la entrega, gasto, devolución o reembolso del dinero.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** En el detalle de cada rendición existe una sección "Movimientos Económicos".
- [ ] **CA-2:** Muestra: Monto Solicitado, Monto Aprobado, Monto Entregado por Tesorería, Total Rendido, Diferencia, Tipo de Diferencia (a favor empresa / a favor colaborador), Estado del cierre económico.
- [ ] **CA-3:** Si hay reembolso o devolución, muestra fecha, monto, n° operación y enlace al comprobante.
- [ ] **CA-4:** La información es exportable como PDF independiente con firma digital del responsable.

### 📎 Referencias

- Funcionalidad: `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-06-01-08] Histórico de reembolsos por colaborador
LABELS: historia-usuario,fase-6,func-06-01,rol:contabilidad
MILESTONE: Fase 6
BODY:
## HU-06-01-08 — Histórico de reembolsos por colaborador

**Funcionalidad padre:** `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
**Fase:** Fase 6 (Gestión de Reembolsos)

### 📝 Historia de Usuario

**Como** Gerencia / Contabilidad,
**quiero** consultar el histórico completo de reembolsos efectuados a un colaborador específico,
**para que** analizar patrones de uso, detectar irregularidades y validar la consistencia del proceso.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El menú "Reportes" incluye opción "Histórico de Reembolsos".
- [ ] **CA-2:** Permite filtrar por colaborador, área, rango de fechas, rango de monto y estado.
- [ ] **CA-3:** Muestra columnas: Fecha, N° Rendición, Concepto, Monto Reembolsado, N° Operación, Estado.
- [ ] **CA-4:** Calcula totales en pie de tabla: cantidad de reembolsos, monto total, promedio.
- [ ] **CA-5:** Permite exportar el histórico filtrado a Excel y PDF.

### 📎 Referencias

- Funcionalidad: `FUNC-06-01` — Gestión Integral de Reembolsos al Colaborador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-07-01 — Gestión de Devolución de Saldos a Favor de la Empresa

_Fase: **Fase 7** · Historias: **7**_

---ISSUE---
TITLE: [HU-07-01-01] Cálculo automático del saldo a devolver
LABELS: historia-usuario,fase-7,func-07-01,rol:sistema
MILESTONE: Fase 7
BODY:
## HU-07-01-01 — Cálculo automático del saldo a devolver

**Funcionalidad padre:** `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
**Fase:** Fase 7 (Devolución de Saldos a Favor de la Empresa)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** calcular automáticamente el monto a devolver cuando los gastos sean menores al anticipo entregado,
**para que** garantizar la recuperación de fondos no utilizados sin depender de cálculos manuales.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al ejecutar el cierre de rendición, evalúa la condición: total_gastado < monto_entregado.
- [ ] **CA-2:** Si se cumple, calcula: monto_devolucion = monto_entregado - total_gastado.
- [ ] **CA-3:** Crea un registro en estado "Pendiente de Devolución por Colaborador".
- [ ] **CA-4:** El monto se muestra en la vista de la rendición en sección "Saldo a Favor de la Empresa: S/ [monto]" resaltado.
- [ ] **CA-5:** Establece la fecha límite de devolución sumando 10 días hábiles a la fecha de creación.

### 📎 Referencias

- Funcionalidad: `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-07-01-02] Notificación al colaborador con datos bancarios para devolución
LABELS: historia-usuario,fase-7,func-07-01,rol:sistema
MILESTONE: Fase 7
BODY:
## HU-07-01-02 — Notificación al colaborador con datos bancarios para devolución

**Funcionalidad padre:** `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
**Fase:** Fase 7 (Devolución de Saldos a Favor de la Empresa)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** enviar email al colaborador con todos los datos necesarios para realizar la devolución,
**para que** facilitar al colaborador la operación bancaria sin tener que solicitar la información a Contabilidad.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Email se envía inmediatamente al generarse el registro de devolución.
- [ ] **CA-2:** Asunto: "DEVOLUCIÓN PENDIENTE — Rendición N° [###] — Monto S/ [X]".
- [ ] **CA-3:** Cuerpo incluye datos bancarios completos de la empresa: Banco, Nombre/Razón Social del titular, RUC, N° Cuenta, CCI.
- [ ] **CA-4:** Incluye monto exacto a devolver (sin centavos redondeados arbitrariamente).
- [ ] **CA-5:** Incluye fecha límite (formato dd/mm/aaaa) y días hábiles restantes.
- [ ] **CA-6:** Incluye instrucciones paso a paso para realizar la transferencia y cargar el comprobante.
- [ ] **CA-7:** Incluye enlace directo a la pantalla de carga de comprobante.

### 📎 Referencias

- Funcionalidad: `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-07-01-03] Carga de comprobante de depósito por el colaborador
LABELS: historia-usuario,fase-7,func-07-01,rol:colaborador
MILESTONE: Fase 7
BODY:
## HU-07-01-03 — Carga de comprobante de depósito por el colaborador

**Funcionalidad padre:** `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
**Fase:** Fase 7 (Devolución de Saldos a Favor de la Empresa)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** cargar el comprobante de la transferencia/depósito que realicé a la cuenta de la empresa,
**para que** evidenciar el cumplimiento de la devolución y desbloquear el cierre de mi rendición.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe un formulario en "Mis Devoluciones Pendientes" con acción "Cargar Comprobante".
- [ ] **CA-2:** Campos: Fecha del Depósito (date picker, no permite fechas futuras), Monto Devuelto (numérico, S/), Banco Origen (lista o texto libre), N° de Operación (texto), Archivo (PDF/JPG/PNG, máx 10 MB).
- [ ] **CA-3:** Validación: el monto devuelto debe ser >= monto calculado. Si es menor, muestra mensaje de error y bloquea el envío.
- [ ] **CA-4:** Si es mayor, permite enviar pero registra observación automática "Excedente de S/ [diferencia] — pendiente reconciliación".
- [ ] **CA-5:** Al confirmar, el registro pasa a "Comprobante Cargado — Pendiente Validación".
- [ ] **CA-6:** El colaborador recibe correo de confirmación con copia del comprobante cargado.

### 📎 Referencias

- Funcionalidad: `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-07-01-04] Validación de la devolución por Contabilidad
LABELS: historia-usuario,fase-7,func-07-01,rol:contabilidad
MILESTONE: Fase 7
BODY:
## HU-07-01-04 — Validación de la devolución por Contabilidad

**Funcionalidad padre:** `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
**Fase:** Fase 7 (Devolución de Saldos a Favor de la Empresa)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** revisar y validar las devoluciones cargadas por los colaboradores,
**para que** confirmar que el depósito fue efectivamente recibido y la operación queda conciliada.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe vista "Devoluciones por Validar" en el panel de Contabilidad.
- [ ] **CA-2:** Cada registro permite visualizar el comprobante cargado, datos del colaborador, monto esperado vs. monto cargado, fecha del depósito.
- [ ] **CA-3:** Acciones disponibles: "Aprobar" o "Rechazar con Observación".
- [ ] **CA-4:** Al aprobar: el estado pasa a "Devolución Validada". Se notifica al colaborador.
- [ ] **CA-5:** Al rechazar: requiere campo "Motivo del Rechazo" obligatorio (mínimo 50 caracteres). El estado regresa a "Pendiente de Devolución". Se notifica al colaborador con el motivo.
- [ ] **CA-6:** Toda acción queda registrada con usuario, fecha/hora y observaciones en el log de auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-07-01-05] Recordatorios automáticos por proximidad de vencimiento
LABELS: historia-usuario,fase-7,func-07-01,rol:sistema
MILESTONE: Fase 7
BODY:
## HU-07-01-05 — Recordatorios automáticos por proximidad de vencimiento

**Funcionalidad padre:** `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
**Fase:** Fase 7 (Devolución de Saldos a Favor de la Empresa)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** enviar recordatorios al colaborador conforme se acerca el vencimiento del plazo,
**para que** reducir las devoluciones vencidas y evitar la escalación a jefaturas.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Recordatorio 1: a los 5 días hábiles desde la generación (50% del plazo).
- [ ] **CA-2:** Recordatorio 2: a los 8 días hábiles (con asunto "URGENTE — Plazo por vencer").
- [ ] **CA-3:** Recordatorio 3: el día del vencimiento (asunto "VENCE HOY").
- [ ] **CA-4:** Cada recordatorio incluye monto, fecha límite, días restantes y datos bancarios.
- [ ] **CA-5:** Los recordatorios cesan automáticamente al cargar el comprobante.

### 📎 Referencias

- Funcionalidad: `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-07-01-06] Escalación por incumplimiento de plazo
LABELS: historia-usuario,fase-7,func-07-01,rol:sistema
MILESTONE: Fase 7
BODY:
## HU-07-01-06 — Escalación por incumplimiento de plazo

**Funcionalidad padre:** `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
**Fase:** Fase 7 (Devolución de Saldos a Favor de la Empresa)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** escalar a las jefaturas y RR.HH. cuando una devolución supere el plazo permitido,
**para que** activar mecanismos administrativos de cobro cuando el colaborador no cumple voluntariamente.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** A los 10 días hábiles vencidos sin comprobante cargado: se notifica a la jefatura directa del colaborador y a Contabilidad.
- [ ] **CA-2:** El registro se marca con etiqueta visual "VENCIDO" en color rojo en todas las vistas.
- [ ] **CA-3:** A los 30 días vencidos: se notifica adicionalmente a Recursos Humanos para evaluación de descuento por planilla.
- [ ] **CA-4:** El colaborador queda con bandera "Devoluciones Vencidas" que aparece en su perfil.
- [ ] **CA-5:** El sistema NO permite al colaborador iniciar nuevas solicitudes de viático mientras tenga devoluciones vencidas (configurable por la Gerencia).

### 📎 Referencias

- Funcionalidad: `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-07-01-07] Bloqueo del cierre con devolución pendiente o no validada
LABELS: historia-usuario,fase-7,func-07-01,rol:sistema
MILESTONE: Fase 7
BODY:
## HU-07-01-07 — Bloqueo del cierre con devolución pendiente o no validada

**Funcionalidad padre:** `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
**Fase:** Fase 7 (Devolución de Saldos a Favor de la Empresa)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** impedir el cierre definitivo de la rendición mientras la devolución no esté validada,
**para que** asegurar que el saldo a favor de la empresa quede efectivamente recuperado antes del cierre.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al intentar el cierre definitivo, el sistema valida el estado de la devolución asociada.
- [ ] **CA-2:** Si está en "Pendiente de Devolución por Colaborador" o "Comprobante Cargado — Pendiente Validación" o "Rechazada", el cierre se bloquea.
- [ ] **CA-3:** Mensaje: "No es posible cerrar. Devolución en estado: [estado]. Se requiere validación de Contabilidad.".
- [ ] **CA-4:** Solo el estado "Devolución Validada" permite continuar al cierre definitivo.

### 📎 Referencias

- Funcionalidad: `FUNC-07-01` — Gestión de Devolución de Saldos a Favor de la Empresa
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-08-01 — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos

_Fase: **Fase 8** · Historias: **9**_

---ISSUE---
TITLE: [HU-08-01-01] Botón de cierre exclusivo para Contabilidad
LABELS: historia-usuario,fase-8,func-08-01,rol:contabilidad
MILESTONE: Fase 8
BODY:
## HU-08-01-01 — Botón de cierre exclusivo para Contabilidad

**Funcionalidad padre:** `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
**Fase:** Fase 8 (Cierre Definitivo de la Rendición)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** tener un botón "Cerrar Definitivamente" claramente visible cuando la rendición esté lista para cierre,
**para que** ejecutar el cierre formal de manera ágil cuando todas las validaciones financieras estén completas.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El botón se muestra únicamente al rol Contabilidad.
- [ ] **CA-2:** Aparece deshabilitado (gris) si la rendición no cumple las condiciones de cierre.
- [ ] **CA-3:** Al pasar el cursor sobre el botón deshabilitado, muestra tooltip explicando qué validación falta.
- [ ] **CA-4:** El botón se ubica en la barra de acciones principal del detalle de la rendición.
- [ ] **CA-5:** Su estilo visual es destacado (color primario) para indicar que es la acción definitiva.

### 📎 Referencias

- Funcionalidad: `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-08-01-02] Validaciones automáticas previas al cierre
LABELS: historia-usuario,fase-8,func-08-01,rol:sistema
MILESTONE: Fase 8
BODY:
## HU-08-01-02 — Validaciones automáticas previas al cierre

**Funcionalidad padre:** `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
**Fase:** Fase 8 (Cierre Definitivo de la Rendición)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** validar automáticamente todas las condiciones financieras antes de permitir el cierre,
**para que** evitar cierres prematuros que dejen flujos económicos inconsistentes.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al pulsar el botón de cierre, el sistema ejecuta el bloque de validaciones del lado del servidor.
- [ ] **CA-2:** Validación 1: ningún gasto en estado "Por Revisar" o "Pendiente Validación SUNAT".
- [ ] **CA-3:** Validación 2: si hay reembolso, está en estado "Pagado".
- [ ] **CA-4:** Validación 3: si hay devolución, está en estado "Devolución Validada".
- [ ] **CA-5:** Validación 4: la rendición está en estado "Aprobada Final" (no "En Proceso" ni anteriores).
- [ ] **CA-6:** Si alguna falla, muestra mensaje específico indicando qué validación no se cumple y bloquea la acción.
- [ ] **CA-7:** Si todas pasan, muestra el modal de confirmación.

### 📎 Referencias

- Funcionalidad: `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-08-01-03] Modal de confirmación con resumen ejecutivo
LABELS: historia-usuario,fase-8,func-08-01,rol:contabilidad
MILESTONE: Fase 8
BODY:
## HU-08-01-03 — Modal de confirmación con resumen ejecutivo

**Funcionalidad padre:** `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
**Fase:** Fase 8 (Cierre Definitivo de la Rendición)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** ver un resumen completo de la rendición antes de confirmar el cierre definitivo,
**para que** verificar de un vistazo que todos los datos son correctos antes de la acción irreversible.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El modal muestra: número de rendición, colaborador, área, fechas del viaje.
- [ ] **CA-2:** Sección Movimientos Económicos: monto entregado, total gastado, diferencia, tipo de diferencia.
- [ ] **CA-3:** Sección Gastos: cantidad total, cantidad aprobados, cantidad rechazados, monto total aprobado.
- [ ] **CA-4:** Sección Documentos: lista de PDFs que serán firmados al cerrar.
- [ ] **CA-5:** Botón de confirmación con leyenda "CONFIRMAR CIERRE DEFINITIVO" en color destacado.
- [ ] **CA-6:** Botón Cancelar para abortar la acción.
- [ ] **CA-7:** Mensaje de advertencia visible: "Esta acción es irreversible. La rendición quedará bloqueada para edición.".

### 📎 Referencias

- Funcionalidad: `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-08-01-04] Generación de firma digital en documentos al cerrar
LABELS: historia-usuario,fase-8,func-08-01,rol:sistema
MILESTONE: Fase 8
BODY:
## HU-08-01-04 — Generación de firma digital en documentos al cerrar

**Funcionalidad padre:** `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
**Fase:** Fase 8 (Cierre Definitivo de la Rendición)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** aplicar firma digital a todos los PDFs de la rendición en el momento del cierre,
**para que** garantizar la autenticidad e integridad de los documentos para fines de auditoría.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al confirmar el cierre, se firman automáticamente: Rendición Consolidada, Comprobante de Caja, Planilla de Movilidad (si aplica), Solicitud Original.
- [ ] **CA-2:** La firma incluye: nombre del firmante, cargo, fecha/hora de firma (formato ISO 8601), hash SHA-256 del documento.
- [ ] **CA-3:** Se aplica marca de agua "DEFINITIVO PARA AUDITORÍA" diagonal en cada página.
- [ ] **CA-4:** Se incluye un panel de firma visible en la última página con QR de verificación.
- [ ] **CA-5:** Los archivos se generan en formato PDF/A (estándar para archivo de larga duración).
- [ ] **CA-6:** El hash SHA-256 se almacena en base de datos para verificación posterior.

### 📎 Referencias

- Funcionalidad: `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-08-01-05] Bloqueo inmutable de la rendición cerrada
LABELS: historia-usuario,fase-8,func-08-01,rol:sistema
MILESTONE: Fase 8
BODY:
## HU-08-01-05 — Bloqueo inmutable de la rendición cerrada

**Funcionalidad padre:** `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
**Fase:** Fase 8 (Cierre Definitivo de la Rendición)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** bloquear toda posibilidad de edición sobre una rendición cerrada,
**para que** preservar la integridad de los registros contables y cumplir requisitos de auditoría.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Una rendición en estado "Cerrado" se muestra en modo "Solo Lectura" para todos los roles.
- [ ] **CA-2:** Los formularios de edición de gastos, agregar gastos, modificar montos, etiquetas y archivos están desactivados.
- [ ] **CA-3:** Los botones de acción (Aprobar, Rechazar, Cerrar, Reabrir) están ocultos.
- [ ] **CA-4:** Se muestra cintillo informativo en la parte superior: "RENDICIÓN CERRADA — [fecha de cierre] — Cerrado por [usuario]".
- [ ] **CA-5:** Las APIs de modificación retornan error 403 Forbidden si reciben intentos de edición sobre una rendición cerrada.
- [ ] **CA-6:** Esta restricción aplica también al rol Administrador (sin excepciones programáticas).

### 📎 Referencias

- Funcionalidad: `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-08-01-06] Reapertura excepcional con doble aprobación
LABELS: historia-usuario,fase-8,func-08-01,rol:gerencia
MILESTONE: Fase 8
BODY:
## HU-08-01-06 — Reapertura excepcional con doble aprobación

**Funcionalidad padre:** `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
**Fase:** Fase 8 (Cierre Definitivo de la Rendición)

### 📝 Historia de Usuario

**Como** Gerencia,
**quiero** poder solicitar la reapertura de una rendición cerrada en casos excepcionales debidamente justificados,
**para que** corregir errores graves detectados con posterioridad sin alterar el principio de inmutabilidad sin control.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe acción "Solicitar Reapertura" exclusiva del rol Gerencia, visible solo en rendiciones cerradas.
- [ ] **CA-2:** Requiere completar: motivo (mínimo 200 caracteres), evidencia documental (archivo) y campo de impacto financiero.
- [ ] **CA-3:** Al enviar, se notifica a Contabilidad y se queda en estado "Reapertura Solicitada".
- [ ] **CA-4:** Contabilidad debe aprobar o rechazar en su panel "Reaperturas Pendientes".
- [ ] **CA-5:** Si ambas (Gerencia y Contabilidad) confirman, la rendición pasa a "Reabierta" y se desbloquean ediciones específicas.
- [ ] **CA-6:** Queda etiqueta permanente "Reabierta — [fecha] — [motivo resumido]" visible en todas las vistas.
- [ ] **CA-7:** Toda la trazabilidad (quién solicitó, quién aprobó, motivo, evidencia) queda en log de auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-08-01-07] Verificación de integridad de documentos firmados
LABELS: historia-usuario,fase-8,func-08-01,rol:otro
MILESTONE: Fase 8
BODY:
## HU-08-01-07 — Verificación de integridad de documentos firmados

**Funcionalidad padre:** `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
**Fase:** Fase 8 (Cierre Definitivo de la Rendición)

### 📝 Historia de Usuario

**Como** Auditor,
**quiero** poder verificar la integridad de un documento firmado mediante su hash SHA-256,
**para que** garantizar que el documento no ha sido alterado desde su cierre.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El sistema expone una sección "Verificación de Integridad" en el módulo Auditoría.
- [ ] **CA-2:** Permite cargar un PDF y compara su hash con el almacenado en base de datos.
- [ ] **CA-3:** Resultado: "Documento Íntegro" (verde) o "Documento Alterado" (rojo).
- [ ] **CA-4:** Muestra fecha del cierre original, firmante, y datos de la rendición asociada.
- [ ] **CA-5:** El reporte de verificación es exportable como PDF firmado por el sistema.

### 📎 Referencias

- Funcionalidad: `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-08-01-08] Notificación de cierre a las partes involucradas
LABELS: historia-usuario,fase-8,func-08-01,rol:sistema
MILESTONE: Fase 8
BODY:
## HU-08-01-08 — Notificación de cierre a las partes involucradas

**Funcionalidad padre:** `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
**Fase:** Fase 8 (Cierre Definitivo de la Rendición)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** notificar por correo a colaborador, coordinador y Contabilidad cuando una rendición se cierra,
**para que** informar formalmente del cierre y proporcionar acceso a los documentos finales firmados.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El email se envía simultáneamente a las tres partes al confirmar el cierre.
- [ ] **CA-2:** Asunto: "Rendición Cerrada — N° [###] — Colaborador [Nombre]".
- [ ] **CA-3:** Cuerpo incluye resumen ejecutivo (monto, fechas, diferencia, estado de pagos/devoluciones).
- [ ] **CA-4:** Lista los documentos firmados disponibles con enlaces de descarga.
- [ ] **CA-5:** Incluye fecha/hora exacta del cierre y nombre del responsable que ejecutó la acción.

### 📎 Referencias

- Funcionalidad: `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-08-01-09] Disponibilidad de documentos en módulo de auditoría
LABELS: historia-usuario,fase-8,func-08-01,rol:otro
MILESTONE: Fase 8
BODY:
## HU-08-01-09 — Disponibilidad de documentos en módulo de auditoría

**Funcionalidad padre:** `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
**Fase:** Fase 8 (Cierre Definitivo de la Rendición)

### 📝 Historia de Usuario

**Como** Auditor,
**quiero** acceder a un módulo de auditoría con todas las rendiciones cerradas y sus documentos,
**para que** realizar revisiones contables y de cumplimiento de manera centralizada.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe módulo "Auditoría" accesible a roles Auditor y Administrador.
- [ ] **CA-2:** Lista todas las rendiciones cerradas con filtros: rango de fechas, colaborador, área, monto, estado de cierre (Cerrada / Reabierta).
- [ ] **CA-3:** Cada registro permite descarga inmediata de todos los PDFs firmados.
- [ ] **CA-4:** Permite visualizar el log de auditoría completo de la rendición (todas las acciones desde la solicitud hasta el cierre).
- [ ] **CA-5:** Permite exportar dossier completo de la rendición como ZIP con todos los documentos y log en PDF.

### 📎 Referencias

- Funcionalidad: `FUNC-08-01` — Cierre Definitivo, Bloqueo Inmutable y Firma de Documentos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-09-01 — Apertura de Reembolso Directo por el Coordinador

_Fase: **Fase 9** · Historias: **6**_

---ISSUE---
TITLE: [HU-09-01-01] Apertura de expediente de reembolso directo
LABELS: historia-usuario,fase-9,func-09-01,rol:coordinador
MILESTONE: Fase 9
BODY:
## HU-09-01-01 — Apertura de expediente de reembolso directo

**Funcionalidad padre:** `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** abrir un expediente de reembolso directo cuando un colaborador haya realizado gastos urgentes sin solicitud previa,
**para que** regularizar y reembolsar gastos legítimos atendiendo casos de excepción operativa.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe botón "Nuevo Reembolso Directo" en el panel del Coordinador.
- [ ] **CA-2:** El formulario solicita: Colaborador, Centro de Costo, Categoría preliminar, Justificación (mín 100 caracteres), Fecha del gasto, Monto estimado.
- [ ] **CA-3:** Permite adjuntar evidencia de respaldo opcional (PDF/imagen).
- [ ] **CA-4:** Al confirmar, se genera código RD-AAAA-NNNN y se asigna estado "Abierto — Pendiente de Carga de Gastos".
- [ ] **CA-5:** El expediente queda asociado al Coordinador que lo abrió como responsable.
- [ ] **CA-6:** Se registra evento en log de auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-09-01-02] Justificación obligatoria con detalle del caso
LABELS: historia-usuario,fase-9,func-09-01,rol:coordinador
MILESTONE: Fase 9
BODY:
## HU-09-01-02 — Justificación obligatoria con detalle del caso

**Funcionalidad padre:** `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Coordinador,
**quiero** ingresar una justificación detallada al abrir el reembolso directo,
**para que** documentar por qué no fue posible tramitar una solicitud previa, dejando trazabilidad para auditoría.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El campo "Justificación" es obligatorio con mínimo 100 caracteres.
- [ ] **CA-2:** El sistema valida la longitud antes de permitir el envío.
- [ ] **CA-3:** La justificación queda registrada en el expediente y se muestra en todas las vistas relacionadas.
- [ ] **CA-4:** El campo no es editable después de la creación; cualquier corrección requiere observación adicional.

### 📎 Referencias

- Funcionalidad: `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-09-01-03] Notificación al colaborador con instrucciones de carga
LABELS: historia-usuario,fase-9,func-09-01,rol:sistema
MILESTONE: Fase 9
BODY:
## HU-09-01-03 — Notificación al colaborador con instrucciones de carga

**Funcionalidad padre:** `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** notificar al colaborador que se le ha abierto un expediente de reembolso directo,
**para que** informarle del proceso y darle las indicaciones para cargar los comprobantes a tiempo.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Email enviado inmediatamente al confirmar la apertura.
- [ ] **CA-2:** Asunto: "Reembolso Directo Abierto — Código [RD-XXXX]".
- [ ] **CA-3:** Cuerpo incluye: código del expediente, monto estimado, justificación, plazo límite (formato dd/mm/aaaa), días hábiles disponibles.
- [ ] **CA-4:** Incluye instrucciones paso a paso para cargar gastos (igual flujo Fase 5).
- [ ] **CA-5:** Incluye enlace directo al expediente en la plataforma.

### 📎 Referencias

- Funcionalidad: `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-09-01-04] Notificación informativa a Contabilidad
LABELS: historia-usuario,fase-9,func-09-01,rol:sistema
MILESTONE: Fase 9
BODY:
## HU-09-01-04 — Notificación informativa a Contabilidad

**Funcionalidad padre:** `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** informar a Contabilidad de la apertura de cada reembolso directo,
**para que** que el área financiera tenga visibilidad temprana de las excepciones que afectarán al presupuesto.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Email enviado en paralelo al colaborador.
- [ ] **CA-2:** Asunto: "INFORMATIVO — Reembolso Directo Abierto — [Colaborador]".
- [ ] **CA-3:** Cuerpo incluye: coordinador responsable, colaborador, monto estimado, centro de costo afectado, justificación.
- [ ] **CA-4:** El email es solo informativo (no requiere acción inmediata de Contabilidad).

### 📎 Referencias

- Funcionalidad: `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-09-01-05] Control de plazo de carga de gastos
LABELS: historia-usuario,fase-9,func-09-01,rol:sistema
MILESTONE: Fase 9
BODY:
## HU-09-01-05 — Control de plazo de carga de gastos

**Funcionalidad padre:** `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** monitorear el plazo de 5 días hábiles para que el colaborador cargue los gastos,
**para que** evitar expedientes abiertos indefinidamente y mantener orden en el sistema.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Recordatorio al colaborador a los 3 días hábiles desde la apertura.
- [ ] **CA-2:** Recordatorio crítico el día 5 con asunto "VENCE HOY — Cargue los Gastos".
- [ ] **CA-3:** Si vencen los 5 días sin gastos cargados, el expediente pasa a "Vencido sin Cargas".
- [ ] **CA-4:** Al pasar a "Vencido sin Cargas", se notifica al coordinador responsable y a Contabilidad.
- [ ] **CA-5:** El coordinador puede solicitar extensión de plazo (5 días adicionales) con justificación, antes del vencimiento.

### 📎 Referencias

- Funcionalidad: `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-09-01-06] Reportes diferenciados de reembolsos directos
LABELS: historia-usuario,fase-9,func-09-01,rol:gerencia
MILESTONE: Fase 9
BODY:
## HU-09-01-06 — Reportes diferenciados de reembolsos directos

**Funcionalidad padre:** `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Gerencia,
**quiero** tener un reporte específico de reembolsos directos diferenciado del flujo regular,
**para que** monitorear la frecuencia de excepciones y tomar decisiones de control de procesos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El módulo Reportes incluye "Reembolsos Directos".
- [ ] **CA-2:** Filtros: rango de fechas, colaborador, área, centro de costo, coordinador responsable, estado.
- [ ] **CA-3:** Métricas: cantidad de reembolsos directos en el período, monto total, justificaciones más frecuentes (clasificadas por palabras clave).
- [ ] **CA-4:** Comparativo con cantidad de solicitudes regulares en el mismo período (% de excepciones sobre total).
- [ ] **CA-5:** Exportable a Excel y PDF.

### 📎 Referencias

- Funcionalidad: `FUNC-09-01` — Apertura de Reembolso Directo por el Coordinador
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-09-02 — Carga, Revisión y Aprobación de Gastos del Reembolso Directo

_Fase: **Fase 9** · Historias: **5**_

---ISSUE---
TITLE: [HU-09-02-01] Carga de gastos con el mismo flujo de Fase 5
LABELS: historia-usuario,fase-9,func-09-02,rol:colaborador
MILESTONE: Fase 9
BODY:
## HU-09-02-01 — Carga de gastos con el mismo flujo de Fase 5

**Funcionalidad padre:** `FUNC-09-02` — Carga, Revisión y Aprobación de Gastos del Reembolso Directo
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** cargar mis gastos del reembolso directo con los mismos formularios y validaciones que conozco,
**para que** no tener que aprender un proceso diferente y aprovechar las validaciones automáticas de SUNAT y OCR.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Desde el detalle del expediente RD, existe acción "Agregar Gasto".
- [ ] **CA-2:** Los tipos de comprobante disponibles son los mismos de Fase 5: Factura, Planilla de Movilidad, Recibo de Caja, Comprobante de Caja, Declaración Jurada.
- [ ] **CA-3:** Cada formulario aplica las mismas validaciones (SUNAT, OCR, geolocalización, Haversine).
- [ ] **CA-4:** La experiencia visual y los flujos son idénticos a la rendición regular.

### 📎 Referencias

- Funcionalidad: `FUNC-09-02` — Carga, Revisión y Aprobación de Gastos del Reembolso Directo
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-09-02-02] Tolerancia del 20% sobre el monto estimado
LABELS: historia-usuario,fase-9,func-09-02,rol:sistema
MILESTONE: Fase 9
BODY:
## HU-09-02-02 — Tolerancia del 20% sobre el monto estimado

**Funcionalidad padre:** `FUNC-09-02` — Carga, Revisión y Aprobación de Gastos del Reembolso Directo
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** permitir que el total cargado exceda el monto estimado hasta en 20% sin trabar el flujo,
**para que** atender la naturaleza imprecisa del monto estimado al abrir el expediente.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si total_cargado <= monto_estimado * 1.20, el flujo procede normalmente.
- [ ] **CA-2:** Si total_cargado > monto_estimado * 1.20, el sistema bloquea el envío a aprobación.
- [ ] **CA-3:** El bloqueo se desbloquea cuando el Coordinador agrega una "Justificación de Sobreejecución" (mín 100 caracteres).
- [ ] **CA-4:** La justificación queda registrada en el expediente.
- [ ] **CA-5:** El sistema genera alerta visual en el detalle: "Sobreejecución del [X]% — Justificación registrada".

### 📎 Referencias

- Funcionalidad: `FUNC-09-02` — Carga, Revisión y Aprobación de Gastos del Reembolso Directo
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-09-02-03] Aprobación del expediente por Contabilidad
LABELS: historia-usuario,fase-9,func-09-02,rol:contabilidad
MILESTONE: Fase 9
BODY:
## HU-09-02-03 — Aprobación del expediente por Contabilidad

**Funcionalidad padre:** `FUNC-09-02` — Carga, Revisión y Aprobación de Gastos del Reembolso Directo
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** revisar y aprobar el expediente de reembolso directo después de la revisión del Coordinador,
**para que** ejecutar el pago al colaborador siguiendo los controles internos establecidos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El expediente llega a Contabilidad después de que el Coordinador apruebe todos los gastos.
- [ ] **CA-2:** Contabilidad ve el resumen consolidado y puede aprobar o rechazar con observación.
- [ ] **CA-3:** Al aprobar, el expediente pasa a "Aprobado — Pendiente de Pago".
- [ ] **CA-4:** Al rechazar, regresa al Coordinador con motivo (mínimo 50 caracteres).

### 📎 Referencias

- Funcionalidad: `FUNC-09-02` — Carga, Revisión y Aprobación de Gastos del Reembolso Directo
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-09-02-04] Pago directo al colaborador con comprobante
LABELS: historia-usuario,fase-9,func-09-02,rol:contabilidad
MILESTONE: Fase 9
BODY:
## HU-09-02-04 — Pago directo al colaborador con comprobante

**Funcionalidad padre:** `FUNC-09-02` — Carga, Revisión y Aprobación de Gastos del Reembolso Directo
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** ejecutar el pago al colaborador y cargar el comprobante de transferencia,
**para que** completar el desembolso del reembolso directo y dejar evidencia documentada.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe vista "Reembolsos Directos por Pagar" para Contabilidad.
- [ ] **CA-2:** Al procesar el pago, completa: fecha, monto, n° operación, archivo de comprobante.
- [ ] **CA-3:** El sistema valida que el monto pagado coincida con el monto aprobado del expediente.
- [ ] **CA-4:** Al confirmar, el expediente pasa a "Pagado — Listo para Cierre".
- [ ] **CA-5:** Se notifica al colaborador con el comprobante adjunto.

### 📎 Referencias

- Funcionalidad: `FUNC-09-02` — Carga, Revisión y Aprobación de Gastos del Reembolso Directo
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-09-02-05] Cierre definitivo del expediente
LABELS: historia-usuario,fase-9,func-09-02,rol:contabilidad
MILESTONE: Fase 9
BODY:
## HU-09-02-05 — Cierre definitivo del expediente

**Funcionalidad padre:** `FUNC-09-02` — Carga, Revisión y Aprobación de Gastos del Reembolso Directo
**Fase:** Fase 9 (Reembolso Directo)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** ejecutar el cierre definitivo del expediente RD aplicando la Fase 8,
**para que** firmar digitalmente los documentos y bloquear el expediente para auditoría.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El expediente RD entra al mismo flujo de cierre que las rendiciones regulares (Fase 8).
- [ ] **CA-2:** Aplican las mismas validaciones, firmas digitales, marca de agua y bloqueo inmutable.
- [ ] **CA-3:** Los documentos firmados quedan disponibles en el módulo Auditoría diferenciados como "Reembolso Directo".

### 📎 Referencias

- Funcionalidad: `FUNC-09-02` — Carga, Revisión y Aprobación de Gastos del Reembolso Directo
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-10-01 — Apertura y Fondeo Mensual de la Caja Chica

_Fase: **Fase 10** · Historias: **4**_

---ISSUE---
TITLE: [HU-10-01-01] Creación de caja chica mensual con responsable y categorías
LABELS: historia-usuario,fase-10,func-10-01,rol:contabilidad
MILESTONE: Fase 10
BODY:
## HU-10-01-01 — Creación de caja chica mensual con responsable y categorías

**Funcionalidad padre:** `FUNC-10-01` — Apertura y Fondeo Mensual de la Caja Chica
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** crear una caja chica mensual asignando responsable, monto y categorías permitidas,
**para que** habilitar la gestión descentralizada de gastos menores con controles claros.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario solicita: Responsable, Centro de Costo, Período (mes/año), Monto, Categorías permitidas, Topes opcionales.
- [ ] **CA-2:** Validación: el responsable no puede tener otra caja chica activa para el mismo período.
- [ ] **CA-3:** Validación: el monto debe ser mayor a S/ 0.
- [ ] **CA-4:** Al confirmar se genera código CCH-AAAAMM-NNN y el estado es "Pendiente de Fondeo".
- [ ] **CA-5:** El sistema notifica al responsable de la creación de la caja.

### 📎 Referencias

- Funcionalidad: `FUNC-10-01` — Apertura y Fondeo Mensual de la Caja Chica
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-01-02] Registro del fondeo inicial con comprobante
LABELS: historia-usuario,fase-10,func-10-01,rol:contabilidad
MILESTONE: Fase 10
BODY:
## HU-10-01-02 — Registro del fondeo inicial con comprobante

**Funcionalidad padre:** `FUNC-10-01` — Apertura y Fondeo Mensual de la Caja Chica
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** registrar el fondeo inicial de la caja chica con el comprobante de transferencia,
**para que** activar la caja para que el responsable pueda comenzar a registrar gastos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Acción "Registrar Fondeo" disponible cuando la caja está en "Pendiente de Fondeo".
- [ ] **CA-2:** Campos: Fecha, Monto (debe coincidir con el aprobado), N° Operación, Comprobante (PDF/imagen máx 10 MB).
- [ ] **CA-3:** Al confirmar, la caja pasa a "Activa" y se notifica al responsable.
- [ ] **CA-4:** El comprobante queda disponible en el detalle de la caja.

### 📎 Referencias

- Funcionalidad: `FUNC-10-01` — Apertura y Fondeo Mensual de la Caja Chica
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-01-03] Definición de topes por gasto y por día
LABELS: historia-usuario,fase-10,func-10-01,rol:contabilidad
MILESTONE: Fase 10
BODY:
## HU-10-01-03 — Definición de topes por gasto y por día

**Funcionalidad padre:** `FUNC-10-01` — Apertura y Fondeo Mensual de la Caja Chica
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** configurar topes opcionales por gasto individual y por día,
**para que** controlar la dispersión y prevenir uso indebido del fondo.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario incluye campo opcional "Tope por Gasto" (S/) y "Tope Diario" (S/).
- [ ] **CA-2:** Si están definidos, el sistema los valida al registrar cada gasto en la operación de la caja.
- [ ] **CA-3:** Si no están definidos, no se aplica límite específico (solo el saldo total).
- [ ] **CA-4:** Los topes son visibles para el responsable en su panel de la caja.

### 📎 Referencias

- Funcionalidad: `FUNC-10-01` — Apertura y Fondeo Mensual de la Caja Chica
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-01-04] Vista del responsable con saldo y alertas
LABELS: historia-usuario,fase-10,func-10-01,rol:responsable-caja
MILESTONE: Fase 10
BODY:
## HU-10-01-04 — Vista del responsable con saldo y alertas

**Funcionalidad padre:** `FUNC-10-01` — Apertura y Fondeo Mensual de la Caja Chica
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Responsable de Caja Chica,
**quiero** tener un panel claro con el saldo disponible, gastos registrados y alertas,
**para que** controlar en tiempo real el uso del fondo y evitar excederme.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Panel "Mi Caja Chica" accesible desde el menú principal.
- [ ] **CA-2:** Muestra: monto del fondo, total gastado, saldo disponible, % consumido, días restantes del mes.
- [ ] **CA-3:** Lista cronológica de gastos registrados con tipo, monto, fecha, categoría.
- [ ] **CA-4:** Botón "Registrar Gasto" siempre visible.
- [ ] **CA-5:** Indicador visual del estado de la caja (Activa / Próxima a Cerrar / Cerrada).

### 📎 Referencias

- Funcionalidad: `FUNC-10-01` — Apertura y Fondeo Mensual de la Caja Chica
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-10-02 — Registro de Gastos sin Aprobación Intermedia

_Fase: **Fase 10** · Historias: **7**_

---ISSUE---
TITLE: [HU-10-02-01] Registro directo de gastos sin pasar por aprobación previa
LABELS: historia-usuario,fase-10,func-10-02,rol:responsable-caja
MILESTONE: Fase 10
BODY:
## HU-10-02-01 — Registro directo de gastos sin pasar por aprobación previa

**Funcionalidad padre:** `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Responsable de Caja Chica,
**quiero** registrar gastos directamente desde mi caja chica sin esperar aprobación,
**para que** agilizar la operación diaria y atender gastos menores en tiempo real.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Botón "Registrar Gasto" disponible siempre que la caja esté en estado "Activa".
- [ ] **CA-2:** Permite seleccionar tipo de comprobante: Factura, Recibo de Caja, Comprobante de Caja, Declaración Jurada.
- [ ] **CA-3:** El formulario aplica las mismas validaciones que en Fase 5 según el tipo de comprobante.
- [ ] **CA-4:** Al confirmar, el gasto queda en estado "Aprobado" automáticamente.
- [ ] **CA-5:** El saldo disponible se actualiza en tiempo real en el panel.

### 📎 Referencias

- Funcionalidad: `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-02-02] Validación de saldo disponible antes de registrar
LABELS: historia-usuario,fase-10,func-10-02,rol:sistema
MILESTONE: Fase 10
BODY:
## HU-10-02-02 — Validación de saldo disponible antes de registrar

**Funcionalidad padre:** `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** validar que el saldo disponible es suficiente antes de aceptar un nuevo gasto,
**para que** controlar que no se exceda el fondo sin justificación documentada.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Antes de guardar, el sistema verifica: monto_gasto <= saldo_disponible.
- [ ] **CA-2:** Si se cumple, el gasto se registra normalmente.
- [ ] **CA-3:** Si excede el saldo, muestra alerta: "Este gasto excede el saldo de la caja en S/ [diferencia]. Para continuar, agregue justificación.".
- [ ] **CA-4:** Solicita campo "Justificación de Excedente" obligatorio (mín 80 caracteres).
- [ ] **CA-5:** Al confirmar con justificación, el gasto se registra con etiqueta "Excedido — Pendiente Reposición".

### 📎 Referencias

- Funcionalidad: `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-02-03] Alerta automática al alcanzar 75%, 90% y 100% del fondo
LABELS: historia-usuario,fase-10,func-10-02,rol:sistema
MILESTONE: Fase 10
BODY:
## HU-10-02-03 — Alerta automática al alcanzar 75%, 90% y 100% del fondo

**Funcionalidad padre:** `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** emitir alertas progresivas al responsable y a Contabilidad cuando el consumo del fondo se acerque al límite,
**para que** permitir reaccionar oportunamente y planificar reposiciones o cierres.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al alcanzar 75% del fondo consumido: notificación al responsable con asunto "Caja Chica al 75%".
- [ ] **CA-2:** Al alcanzar 90%: notificación al responsable y a Contabilidad con asunto "Caja Chica al 90% — Atención".
- [ ] **CA-3:** Al alcanzar 100%: notificación a responsable, Contabilidad y Gerencia con asunto "Caja Chica AGOTADA — Reposición Requerida".
- [ ] **CA-4:** El panel del responsable muestra indicadores visuales (amarillo, naranja, rojo) según el nivel.
- [ ] **CA-5:** Las alertas son automáticas, sin requerir acción manual.

### 📎 Referencias

- Funcionalidad: `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-02-04] Validación de tope individual y tope diario
LABELS: historia-usuario,fase-10,func-10-02,rol:sistema
MILESTONE: Fase 10
BODY:
## HU-10-02-04 — Validación de tope individual y tope diario

**Funcionalidad padre:** `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** validar los topes individuales y diarios definidos al abrir la caja,
**para que** alertar al responsable y a Contabilidad sobre gastos atípicos sin bloquear la operación.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si el monto del gasto excede el tope individual: alerta y solicita justificación obligatoria.
- [ ] **CA-2:** Si la suma de gastos del día excede el tope diario: alerta y solicita justificación.
- [ ] **CA-3:** Las justificaciones quedan asociadas al gasto y son visibles en el panel y reportes.
- [ ] **CA-4:** Los gastos con justificación quedan marcados con etiqueta "Sobre Tope — Revisar en Cierre".
- [ ] **CA-5:** Si no se definieron topes al abrir la caja, no se aplica esta validación.

### 📎 Referencias

- Funcionalidad: `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-02-05] Validación de categoría permitida
LABELS: historia-usuario,fase-10,func-10-02,rol:sistema
MILESTONE: Fase 10
BODY:
## HU-10-02-05 — Validación de categoría permitida

**Funcionalidad padre:** `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** permitir solo gastos en las categorías definidas al abrir la caja,
**para que** garantizar que el fondo se use según el propósito acordado.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El formulario de gasto muestra solo las categorías permitidas para esa caja.
- [ ] **CA-2:** Si por algún medio se intenta enviar una categoría no permitida (vía API), el sistema rechaza con error 400.
- [ ] **CA-3:** Mensaje al responsable: "La categoría seleccionada no está permitida para esta caja chica. Categorías permitidas: [lista]".
- [ ] **CA-4:** Las categorías permitidas son visibles en el panel del responsable.

### 📎 Referencias

- Funcionalidad: `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-02-06] Reuso de validaciones SUNAT y OCR para Caja Chica
LABELS: historia-usuario,fase-10,func-10-02,rol:sistema
MILESTONE: Fase 10
BODY:
## HU-10-02-06 — Reuso de validaciones SUNAT y OCR para Caja Chica

**Funcionalidad padre:** `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** aplicar las mismas validaciones de SUNAT y OCR que usamos en la Fase 5,
**para que** mantener la calidad de los comprobantes y reducir el riesgo tributario.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Para Facturas: validación con API SUNAT obligatoria.
- [ ] **CA-2:** Para imágenes de comprobantes: extracción OCR para pre-llenar campos.
- [ ] **CA-3:** Si SUNAT falla por timeout, el gasto se registra con etiqueta "Pendiente Validación SUNAT".
- [ ] **CA-4:** Las mismas reglas de reintento y plazo de Fase 5 aplican.

### 📎 Referencias

- Funcionalidad: `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-02-07] Registro de gasto con justificación si excede saldo o topes
LABELS: historia-usuario,fase-10,func-10-02,rol:responsable-caja
MILESTONE: Fase 10
BODY:
## HU-10-02-07 — Registro de gasto con justificación si excede saldo o topes

**Funcionalidad padre:** `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Responsable de Caja Chica,
**quiero** poder registrar un gasto que exceda el saldo o los topes adjuntando justificación,
**para que** atender necesidades operativas excepcionales sin tener que esperar aprobaciones manuales.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si el gasto excede saldo o topes, el formulario solicita campo "Justificación" obligatorio.
- [ ] **CA-2:** Mínimo 80 caracteres en la justificación.
- [ ] **CA-3:** El gasto se registra con etiqueta "Sobre Tope" o "Excedido — Pendiente Reposición" según corresponda.
- [ ] **CA-4:** La justificación es visible en el detalle del gasto y se incluye en el reporte de cierre mensual.

### 📎 Referencias

- Funcionalidad: `FUNC-10-02` — Registro de Gastos sin Aprobación Intermedia
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-10-03 — Cierre Mensual con Arrastre Automático de Saldos

_Fase: **Fase 10** · Historias: **8**_

---ISSUE---
TITLE: [HU-10-03-01] Validaciones automáticas previas al cierre mensual
LABELS: historia-usuario,fase-10,func-10-03,rol:sistema
MILESTONE: Fase 10
BODY:
## HU-10-03-01 — Validaciones automáticas previas al cierre mensual

**Funcionalidad padre:** `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** validar que todos los gastos están en estado final antes de permitir el cierre,
**para que** evitar cierres con gastos pendientes que comprometan la consistencia del reporte.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al iniciar el cierre, el sistema verifica: ningún gasto en estado "Pendiente Validación SUNAT" sin resolver.
- [ ] **CA-2:** Verifica: todos los gastos "Sobre Tope" o "Excedido" tienen justificación documentada.
- [ ] **CA-3:** Verifica: el período de la caja está vencido (mes calendario completo).
- [ ] **CA-4:** Si alguna falla, muestra mensaje específico y bloquea el cierre.
- [ ] **CA-5:** Si todas pasan, permite continuar con el cierre.

### 📎 Referencias

- Funcionalidad: `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-03-02] Cálculo del saldo final y determinación del flujo
LABELS: historia-usuario,fase-10,func-10-03,rol:sistema
MILESTONE: Fase 10
BODY:
## HU-10-03-02 — Cálculo del saldo final y determinación del flujo

**Funcionalidad padre:** `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** calcular automáticamente el saldo final y determinar si corresponde arrastre, devolución o reposición,
**para que** automatizar la conciliación financiera del cierre mensual.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Calcula: saldo_final = monto_fondo - total_gastos.
- [ ] **CA-2:** Si saldo_final > 0: ofrece a Contabilidad opción "Arrastrar al mes siguiente" o "Solicitar Devolución".
- [ ] **CA-3:** Si saldo_final < 0: marca "Reposición Pendiente al Responsable" por el monto |saldo_final|.
- [ ] **CA-4:** Si saldo_final = 0: marca "Cierre Exacto" sin acciones adicionales.
- [ ] **CA-5:** El cálculo se muestra en la pantalla de cierre con todos los detalles.

### 📎 Referencias

- Funcionalidad: `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-03-03] Arrastre automático del saldo al mes siguiente
LABELS: historia-usuario,fase-10,func-10-03,rol:contabilidad
MILESTONE: Fase 10
BODY:
## HU-10-03-03 — Arrastre automático del saldo al mes siguiente

**Funcionalidad padre:** `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** arrastrar el saldo positivo al fondo del mes siguiente cuando exista una caja activa,
**para que** evitar movimientos bancarios innecesarios y simplificar la operación.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Acción "Arrastrar al Mes Siguiente" disponible solo si existe caja chica abierta para el mes siguiente con el mismo responsable y centro de costo.
- [ ] **CA-2:** Al confirmar, el sistema suma el saldo al monto del fondo del mes siguiente automáticamente.
- [ ] **CA-3:** Genera registro contable del arrastre.
- [ ] **CA-4:** Notifica al responsable con el detalle del arrastre.
- [ ] **CA-5:** El cierre del mes actual se ejecuta normalmente con saldo trasladado.

### 📎 Referencias

- Funcionalidad: `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-03-04] Devolución de saldo positivo cuando no hay arrastre
LABELS: historia-usuario,fase-10,func-10-03,rol:contabilidad
MILESTONE: Fase 10
BODY:
## HU-10-03-04 — Devolución de saldo positivo cuando no hay arrastre

**Funcionalidad padre:** `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** gestionar la devolución del saldo positivo cuando no exista caja del mes siguiente o se opte por devolver,
**para que** recuperar fondos no utilizados y dejar la caja conciliada.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al optar por devolución, el sistema crea un registro de "Devolución de Caja Chica" usando el flujo Fase 7.
- [ ] **CA-2:** Notifica al responsable con datos bancarios para depositar.
- [ ] **CA-3:** El responsable carga comprobante; Contabilidad valida.
- [ ] **CA-4:** El cierre de la caja se completa solo cuando la devolución está validada.

### 📎 Referencias

- Funcionalidad: `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-03-05] Reposición de excedente al responsable
LABELS: historia-usuario,fase-10,func-10-03,rol:contabilidad
MILESTONE: Fase 10
BODY:
## HU-10-03-05 — Reposición de excedente al responsable

**Funcionalidad padre:** `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** ejecutar la reposición al responsable cuando el saldo sea negativo,
**para que** reembolsar al colaborador los gastos que excedieron el fondo asignado.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Cuando saldo_final < 0, el sistema crea registro de "Reposición a Responsable" usando el flujo Fase 6.
- [ ] **CA-2:** Notifica a Contabilidad para procesar el pago.
- [ ] **CA-3:** Contabilidad transfiere el monto y carga comprobante.
- [ ] **CA-4:** Notifica al responsable con el comprobante.
- [ ] **CA-5:** El cierre de la caja se completa cuando la reposición está pagada.

### 📎 Referencias

- Funcionalidad: `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-03-06] Generación del reporte consolidado de cierre
LABELS: historia-usuario,fase-10,func-10-03,rol:sistema
MILESTONE: Fase 10
BODY:
## HU-10-03-06 — Generación del reporte consolidado de cierre

**Funcionalidad padre:** `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** generar un reporte consolidado en PDF firmado al cerrar la caja chica,
**para que** tener un documento oficial del período para fines contables y de auditoría.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El reporte incluye: identificación de la caja, responsable, período, monto del fondo, total gastos, saldo final, tipo de cierre.
- [ ] **CA-2:** Lista todos los gastos del período con: fecha, comprobante, proveedor, monto, categoría, etiquetas.
- [ ] **CA-3:** Incluye totales por categoría con gráfico simple.
- [ ] **CA-4:** Lista justificaciones de gastos sobre tope y excedidos.
- [ ] **CA-5:** PDF firmado digitalmente con marca "DEFINITIVO PARA AUDITORÍA".
- [ ] **CA-6:** Disponible para descarga desde el detalle de la caja y módulo Auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-03-07] Cierre inmutable de la caja chica
LABELS: historia-usuario,fase-10,func-10-03,rol:sistema
MILESTONE: Fase 10
BODY:
## HU-10-03-07 — Cierre inmutable de la caja chica

**Funcionalidad padre:** `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** bloquear la caja chica para edición tras el cierre,
**para que** preservar la integridad de los registros mensuales conforme a las reglas de inmutabilidad.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al confirmar el cierre, la caja pasa a estado "Cerrada" en modo solo lectura.
- [ ] **CA-2:** Se aplican las mismas reglas de RN-09 y Fase 8 (inmutabilidad, firma digital, hash SHA-256).
- [ ] **CA-3:** Las APIs rechazan modificaciones con error 403.
- [ ] **CA-4:** La reapertura excepcional sigue el mismo flujo de Fase 8 (doble aprobación Gerencia + Contabilidad).

### 📎 Referencias

- Funcionalidad: `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-10-03-08] Notificaciones de cierre a responsable, Contabilidad y Gerencia
LABELS: historia-usuario,fase-10,func-10-03,rol:sistema
MILESTONE: Fase 10
BODY:
## HU-10-03-08 — Notificaciones de cierre a responsable, Contabilidad y Gerencia

**Funcionalidad padre:** `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
**Fase:** Fase 10 (Caja Chica)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** notificar a las partes involucradas cuando se cierre la caja chica,
**para que** comunicar formalmente el cierre y proporcionar acceso a los documentos consolidados.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Email enviado a responsable, Contabilidad y Gerencia simultáneamente.
- [ ] **CA-2:** Asunto: "Caja Chica Cerrada — [Código] — [Período]".
- [ ] **CA-3:** Cuerpo incluye: monto del fondo, total gastos, saldo final, tipo de cierre, enlace al reporte PDF.
- [ ] **CA-4:** Adjunta el reporte consolidado en PDF.

### 📎 Referencias

- Funcionalidad: `FUNC-10-03` — Cierre Mensual con Arrastre Automático de Saldos
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-01 — Motor de Notificaciones por Email con Plantillas y Logs

_Fase: **Transversales** · Historias: **6**_

---ISSUE---
TITLE: [HU-FT-01-01] Configuración del servidor SMTP por el Administrador
LABELS: historia-usuario,transversal,func-ft-01,rol:admin
MILESTONE: Transversales
BODY:
## HU-FT-01-01 — Configuración del servidor SMTP por el Administrador

**Funcionalidad padre:** `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** configurar las credenciales del servidor SMTP o servicio de email transaccional,
**para que** habilitar el envío de notificaciones desde la plataforma.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe sección "Configuración de Email" en el panel de administración.
- [ ] **CA-2:** Campos: Servidor SMTP (host, puerto, TLS), Usuario, Contraseña (almacenada encriptada), Email remitente, Nombre remitente.
- [ ] **CA-3:** Botón "Probar Conexión" envía email de prueba al administrador.
- [ ] **CA-4:** Cambios quedan registrados en log de auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-01-02] Aplicación automática de etiqueta URGENTE
LABELS: historia-usuario,transversal,func-ft-01,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-01-02 — Aplicación automática de etiqueta URGENTE

**Funcionalidad padre:** `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** aplicar etiqueta URGENTE a notificaciones de aprobación cuando el viaje sea hoy o mañana,
**para que** destacar visualmente las acciones que requieren atención inmediata.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al enviar notificación de "Solicitud Aprobada", el sistema verifica fecha_viaje vs fecha_actual.
- [ ] **CA-2:** Si fecha_viaje = hoy o fecha_viaje = mañana, agrega prefijo "[URGENTE]" al asunto.
- [ ] **CA-3:** El cuerpo del email incluye banner rojo con leyenda "VIAJE INMEDIATO — Procesar lo antes posible".
- [ ] **CA-4:** El log registra el flag de urgencia para reportes posteriores.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-01-03] Reintentos automáticos ante fallos de envío
LABELS: historia-usuario,transversal,func-ft-01,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-01-03 — Reintentos automáticos ante fallos de envío

**Funcionalidad padre:** `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** reintentar el envío de notificaciones que fallaron por errores temporales,
**para que** garantizar la entrega ante fallos transitorios sin acción manual del operador.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si el envío falla con error 4xx (excepto 4xx por destinatario inválido), se programa reintento.
- [ ] **CA-2:** Reintentos: 1 min, 5 min, 15 min (backoff exponencial).
- [ ] **CA-3:** Después de 3 reintentos fallidos, el envío se marca "Fallido Definitivo".
- [ ] **CA-4:** Notifica al Administrador del fallo definitivo.
- [ ] **CA-5:** Cada intento queda registrado en el log con fecha/hora y código de error.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-01-04] Histórico de notificaciones por usuario
LABELS: historia-usuario,transversal,func-ft-01,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-01-04 — Histórico de notificaciones por usuario

**Funcionalidad padre:** `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Usuario,
**quiero** consultar el histórico de notificaciones recibidas en mi cuenta,
**para que** verificar qué correos fueron enviados y reenviar si es necesario.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe menú "Mis Notificaciones" en el perfil del usuario.
- [ ] **CA-2:** Lista cronológica con: fecha/hora, asunto, evento asociado, estado.
- [ ] **CA-3:** Permite filtrar por tipo de evento, rango de fechas y estado.
- [ ] **CA-4:** Acción "Reenviar" disponible para volver a recibir el correo.
- [ ] **CA-5:** Acción "Ver Detalle" muestra el contenido HTML completo.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-01-05] Preferencias configurables del usuario
LABELS: historia-usuario,transversal,func-ft-01,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-01-05 — Preferencias configurables del usuario

**Funcionalidad padre:** `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Usuario,
**quiero** configurar qué notificaciones no críticas deseo recibir,
**para que** personalizar mi experiencia y reducir ruido en mi bandeja de entrada.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe sección "Preferencias de Notificaciones" en el perfil del usuario.
- [ ] **CA-2:** Lista las notificaciones no-críticas con checkboxes para activar/desactivar.
- [ ] **CA-3:** Las notificaciones críticas (aprobaciones, pagos, cierres) están bloqueadas y no pueden desactivarse.
- [ ] **CA-4:** Cambios se aplican de inmediato y quedan registrados en log.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-01-06] Plantillas HTML configurables
LABELS: historia-usuario,transversal,func-ft-01,rol:admin
MILESTONE: Transversales
BODY:
## HU-FT-01-06 — Plantillas HTML configurables

**Funcionalidad padre:** `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** personalizar las plantillas HTML de cada tipo de notificación,
**para que** alinear la comunicación con la identidad corporativa del cliente.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe módulo "Plantillas de Email" en panel de administración.
- [ ] **CA-2:** Editor con vista previa, variables disponibles documentadas y compatibilidad responsive.
- [ ] **CA-3:** Permite incluir logo corporativo, colores y firma institucional.
- [ ] **CA-4:** Botón "Enviar Vista Previa" para validar antes de guardar.
- [ ] **CA-5:** Cambios versionados en log de auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-01` — Motor de Notificaciones por Email con Plantillas y Logs
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-02 — Reportes Operativos Exportables y Filtrables

_Fase: **Transversales** · Historias: **4**_

---ISSUE---
TITLE: [HU-FT-02-01] Acceso a reportes con filtros y exportación
LABELS: historia-usuario,transversal,func-ft-02,rol:coordinador
MILESTONE: Transversales
BODY:
## HU-FT-02-01 — Acceso a reportes con filtros y exportación

**Funcionalidad padre:** `FUNC-FT-02` — Reportes Operativos Exportables y Filtrables
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Coordinador / Contabilidad / Gerencia,
**quiero** acceder al módulo de reportes y filtrar la información según mis necesidades de análisis,
**para que** tomar decisiones informadas y cumplir con los requerimientos de control interno.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El menú "Reportes" lista los reportes disponibles para el rol del usuario.
- [ ] **CA-2:** Cada reporte tiene formulario de filtros previo a la generación.
- [ ] **CA-3:** Los resultados se muestran en tabla con paginación y ordenamiento por columnas.
- [ ] **CA-4:** Botones "Exportar Excel" y "Exportar PDF" siempre visibles.
- [ ] **CA-5:** Los archivos exportados incluyen los filtros aplicados en la cabecera.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-02` — Reportes Operativos Exportables y Filtrables
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-02-02] Programación de reportes recurrentes por email
LABELS: historia-usuario,transversal,func-ft-02,rol:gerencia
MILESTONE: Transversales
BODY:
## HU-FT-02-02 — Programación de reportes recurrentes por email

**Funcionalidad padre:** `FUNC-FT-02` — Reportes Operativos Exportables y Filtrables
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Gerencia,
**quiero** programar el envío automático de reportes ejecutivos de forma recurrente,
**para que** recibir información clave sin tener que generar reportes manualmente cada vez.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Acción "Programar Envío" disponible en cada reporte.
- [ ] **CA-2:** Permite definir: frecuencia (diaria/semanal/mensual), destinatarios (multi-email), filtros fijos.
- [ ] **CA-3:** El sistema envía el reporte en la hora configurada con archivos adjuntos.
- [ ] **CA-4:** Los envíos programados son visibles y editables en "Mis Programaciones".

### 📎 Referencias

- Funcionalidad: `FUNC-FT-02` — Reportes Operativos Exportables y Filtrables
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-02-03] Restricción de visibilidad por rol y área
LABELS: historia-usuario,transversal,func-ft-02,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-02-03 — Restricción de visibilidad por rol y área

**Funcionalidad padre:** `FUNC-FT-02` — Reportes Operativos Exportables y Filtrables
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** restringir la visibilidad de los datos en reportes según el rol y área del usuario,
**para que** respetar la segregación funcional y evitar acceso a información no autorizada.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Un Coordinador solo ve datos de su área asignada.
- [ ] **CA-2:** Un Colaborador no tiene acceso al módulo de reportes globales (solo sus propias rendiciones).
- [ ] **CA-3:** Contabilidad ve todos los datos financieros de la organización.
- [ ] **CA-4:** Gerencia tiene visibilidad transversal completa.
- [ ] **CA-5:** Auditor accede solo en modo lectura.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-02` — Reportes Operativos Exportables y Filtrables
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-02-04] Registro de cada generación de reporte
LABELS: historia-usuario,transversal,func-ft-02,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-02-04 — Registro de cada generación de reporte

**Funcionalidad padre:** `FUNC-FT-02` — Reportes Operativos Exportables y Filtrables
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Auditor,
**quiero** ver el log de quién generó qué reportes y con qué filtros,
**para que** controlar el acceso a información sensible y detectar usos atípicos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Cada generación se registra con: usuario, fecha/hora, IP, reporte, filtros aplicados, formato.
- [ ] **CA-2:** El log es visible en el módulo Auditoría con filtros por usuario y rango de fechas.
- [ ] **CA-3:** Permite exportar el log a Excel.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-02` — Reportes Operativos Exportables y Filtrables
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-03 — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas

_Fase: **Transversales** · Historias: **5**_

---ISSUE---
TITLE: [HU-FT-03-01] Visualización de KPIs principales en el dashboard
LABELS: historia-usuario,transversal,func-ft-03,rol:gerencia
MILESTONE: Transversales
BODY:
## HU-FT-03-01 — Visualización de KPIs principales en el dashboard

**Funcionalidad padre:** `FUNC-FT-03` — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Gerencia,
**quiero** ver los KPIs operativos y financieros principales en una pantalla integrada,
**para que** tener una visión rápida del estado de la gestión de viáticos y tomar decisiones.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Los 6 KPIs se muestran como tarjetas (cards) en la parte superior del dashboard.
- [ ] **CA-2:** Cada tarjeta muestra: nombre del KPI, valor actual, variación vs. mes anterior (% y flecha).
- [ ] **CA-3:** Las tarjetas son clickeables y abren el detalle drilldown del KPI.
- [ ] **CA-4:** Se actualizan al cargar el dashboard y al refrescar manualmente.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-03` — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-03-02] Gráficos interactivos por dimensión
LABELS: historia-usuario,transversal,func-ft-03,rol:gerencia
MILESTONE: Transversales
BODY:
## HU-FT-03-02 — Gráficos interactivos por dimensión

**Funcionalidad padre:** `FUNC-FT-03` — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Gerencia,
**quiero** ver gráficos interactivos de gastos por centro de costo, categoría y evolución temporal,
**para que** identificar tendencias, áreas de mayor gasto y patrones de comportamiento.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Gráfico de barras horizontales para Gasto por Centro de Costo (top 10).
- [ ] **CA-2:** Pie chart para Distribución por Categoría (top 8 + "Otros").
- [ ] **CA-3:** Líneas temporales para Evolución mensual de los últimos 12 meses.
- [ ] **CA-4:** Cada gráfico permite hover para ver detalles y click para drilldown.
- [ ] **CA-5:** Filtros transversales (período, área) afectan todos los gráficos simultáneamente.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-03` — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-03-03] Mapa geográfico de viajes activos
LABELS: historia-usuario,transversal,func-ft-03,rol:gerencia
MILESTONE: Transversales
BODY:
## HU-FT-03-03 — Mapa geográfico de viajes activos

**Funcionalidad padre:** `FUNC-FT-03` — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Gerencia,
**quiero** ver en un mapa los viajes actualmente activos con detalles del colaborador y monto,
**para que** tener visibilidad geográfica de la ejecución y detectar concentraciones.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Mapa interactivo (Google Maps o Leaflet) en widget del dashboard.
- [ ] **CA-2:** Marcadores en ubicaciones de destino de viajes activos.
- [ ] **CA-3:** Hover sobre marcador muestra: colaborador, fechas, monto, área.
- [ ] **CA-4:** Click en marcador abre el detalle de la solicitud.
- [ ] **CA-5:** Filtros por área y centro de costo afectan los marcadores mostrados.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-03` — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-03-04] Panel de alertas críticas
LABELS: historia-usuario,transversal,func-ft-03,rol:gerencia
MILESTONE: Transversales
BODY:
## HU-FT-03-04 — Panel de alertas críticas

**Funcionalidad padre:** `FUNC-FT-03` — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Gerencia,
**quiero** ver un panel con todas las alertas críticas activas que requieren atención,
**para que** actuar oportunamente sobre los problemas operativos y financieros.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Panel "Alertas Críticas" en posición destacada del dashboard.
- [ ] **CA-2:** Lista alertas con: tipo, descripción, severidad (alta/media), responsable sugerido, antigüedad.
- [ ] **CA-3:** Las alertas se priorizan automáticamente: vencimientos > excesos > demoras.
- [ ] **CA-4:** Click en cada alerta abre el detalle del registro asociado.
- [ ] **CA-5:** Contador total de alertas visibles en la cabecera con badge rojo si hay alertas críticas.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-03` — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-03-05] Personalización de widgets por usuario
LABELS: historia-usuario,transversal,func-ft-03,rol:gerencia
MILESTONE: Transversales
BODY:
## HU-FT-03-05 — Personalización de widgets por usuario

**Funcionalidad padre:** `FUNC-FT-03` — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Gerencia,
**quiero** personalizar qué widgets ver en mi dashboard y en qué orden,
**para que** enfocarme en la información que más me interesa según mi área de responsabilidad.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Modo "Edición" del dashboard activable con botón.
- [ ] **CA-2:** Permite arrastrar y soltar widgets para reordenar.
- [ ] **CA-3:** Permite ocultar/mostrar widgets desde catálogo de widgets disponibles.
- [ ] **CA-4:** La configuración se guarda por usuario y persiste entre sesiones.
- [ ] **CA-5:** Botón "Restaurar Predeterminado" para volver a la configuración inicial.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-03` — Dashboard Ejecutivo con KPIs, Gráficos, Mapa y Alertas
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-04 — Integración con API SUNAT (Validación de Comprobantes)

_Fase: **Transversales** · Historias: **5**_

---ISSUE---
TITLE: [HU-FT-04-01] Validación automática de facturas con SUNAT
LABELS: historia-usuario,transversal,func-ft-04,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-04-01 — Validación automática de facturas con SUNAT

**Funcionalidad padre:** `FUNC-FT-04` — Integración con API SUNAT (Validación de Comprobantes)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** consultar la API SUNAT al registrar cada factura para validar su autenticidad,
**para que** garantizar que solo se aceptan comprobantes válidos y vigentes.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al guardar una factura, el sistema invoca el endpoint de SUNAT con los datos del comprobante.
- [ ] **CA-2:** Si la respuesta es "Aceptado", la factura queda validada con etiqueta verde "Validado SUNAT".
- [ ] **CA-3:** Si es "Rechazado" o "No Encontrado", se rechaza el registro con mensaje específico al colaborador.
- [ ] **CA-4:** La razón social retornada por SUNAT se compara con la ingresada (alerta si difieren significativamente).

### 📎 Referencias

- Funcionalidad: `FUNC-FT-04` — Integración con API SUNAT (Validación de Comprobantes)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-04-02] Manejo de timeout y modo degradado
LABELS: historia-usuario,transversal,func-ft-04,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-04-02 — Manejo de timeout y modo degradado

**Funcionalidad padre:** `FUNC-FT-04` — Integración con API SUNAT (Validación de Comprobantes)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** manejar correctamente los timeouts de la API SUNAT y aplicar modo degradado,
**para que** no bloquear al colaborador por fallas externas y mantener la operatividad.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si la consulta excede 5 segundos, se reintenta hasta 3 veces (2s, 5s, 10s).
- [ ] **CA-2:** Si todos los reintentos fallan, la factura se registra con etiqueta "Pendiente Validación SUNAT" en color amarillo.
- [ ] **CA-3:** El sistema programa revalidación automática cada 4 horas durante las próximas 48 horas.
- [ ] **CA-4:** Si después de 48 horas no se valida, notifica al Administrador.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-04` — Integración con API SUNAT (Validación de Comprobantes)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-04-03] Caché de validaciones exitosas
LABELS: historia-usuario,transversal,func-ft-04,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-04-03 — Caché de validaciones exitosas

**Funcionalidad padre:** `FUNC-FT-04` — Integración con API SUNAT (Validación de Comprobantes)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** cachear las validaciones exitosas por 30 días,
**para que** reducir el número de consultas redundantes y mejorar el rendimiento.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Las validaciones "Aceptadas" se almacenan en caché con clave: RUC + serie + número + fecha.
- [ ] **CA-2:** TTL del caché: 30 días.
- [ ] **CA-3:** Antes de consultar SUNAT, el sistema verifica el caché.
- [ ] **CA-4:** El caché es invalidable manualmente por el Administrador.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-04` — Integración con API SUNAT (Validación de Comprobantes)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-04-04] Validación manual on-demand por Contabilidad
LABELS: historia-usuario,transversal,func-ft-04,rol:contabilidad
MILESTONE: Transversales
BODY:
## HU-FT-04-04 — Validación manual on-demand por Contabilidad

**Funcionalidad padre:** `FUNC-FT-04` — Integración con API SUNAT (Validación de Comprobantes)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Contabilidad,
**quiero** poder forzar una validación manual de SUNAT sobre una factura específica,
**para que** resolver casos en "Pendiente Validación" sin esperar la revalidación automática.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Botón "Validar con SUNAT" disponible para Contabilidad en el detalle de cada factura.
- [ ] **CA-2:** Al pulsar, ejecuta la consulta inmediatamente.
- [ ] **CA-3:** Muestra el resultado en pantalla y actualiza el estado del comprobante.
- [ ] **CA-4:** La acción queda registrada en el log con usuario y fecha/hora.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-04` — Integración con API SUNAT (Validación de Comprobantes)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-04-05] Configuración del endpoint y token de SUNAT
LABELS: historia-usuario,transversal,func-ft-04,rol:admin
MILESTONE: Transversales
BODY:
## HU-FT-04-05 — Configuración del endpoint y token de SUNAT

**Funcionalidad padre:** `FUNC-FT-04` — Integración con API SUNAT (Validación de Comprobantes)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** configurar el endpoint y el token de la API SUNAT desde el panel de administración,
**para que** actualizar las credenciales sin requerir despliegue de código.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe sección "Integración SUNAT" en el panel de administración.
- [ ] **CA-2:** Campos: Endpoint URL, Token (encriptado), Tiempo de timeout, Frecuencia de revalidación.
- [ ] **CA-3:** Botón "Probar Conexión" envía consulta de prueba.
- [ ] **CA-4:** Cambios quedan registrados en log de auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-04` — Integración con API SUNAT (Validación de Comprobantes)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-05 — Integración con Motor OCR (Extracción de Datos de Imágenes)

_Fase: **Transversales** · Historias: **4**_

---ISSUE---
TITLE: [HU-FT-05-01] Pre-llenado automático del formulario con OCR
LABELS: historia-usuario,transversal,func-ft-05,rol:colaborador
MILESTONE: Transversales
BODY:
## HU-FT-05-01 — Pre-llenado automático del formulario con OCR

**Funcionalidad padre:** `FUNC-FT-05` — Integración con Motor OCR (Extracción de Datos de Imágenes)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** que al subir la imagen de un comprobante, el sistema lea los datos automáticamente,
**para que** ahorrar tiempo en la digitación y reducir errores.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al cargar una imagen en el formulario de gasto, el sistema procesa el OCR en segundo plano.
- [ ] **CA-2:** Una vez completo (2-5s), los campos detectados se rellenan automáticamente.
- [ ] **CA-3:** Cada campo extraído muestra indicador de confianza con código de color (verde/amarillo/rojo).
- [ ] **CA-4:** El usuario puede corregir cualquier campo antes de guardar.
- [ ] **CA-5:** Si OCR falla, se muestra mensaje no bloqueante y el usuario completa manualmente.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-05` — Integración con Motor OCR (Extracción de Datos de Imágenes)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-05-02] Selección del motor OCR por el Administrador
LABELS: historia-usuario,transversal,func-ft-05,rol:admin
MILESTONE: Transversales
BODY:
## HU-FT-05-02 — Selección del motor OCR por el Administrador

**Funcionalidad padre:** `FUNC-FT-05` — Integración con Motor OCR (Extracción de Datos de Imágenes)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** elegir entre Google Vision API y Tesseract local según las necesidades del cliente,
**para que** balancear costo, precisión y dependencia de servicios externos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Existe configuración "Motor OCR" con opciones: Google Vision, Tesseract.
- [ ] **CA-2:** Si se elige Google Vision, requiere ingresar credenciales (API Key) encriptadas.
- [ ] **CA-3:** Si se elige Tesseract, no requiere credenciales pero exige instalación local.
- [ ] **CA-4:** Cambios quedan registrados en log de auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-05` — Integración con Motor OCR (Extracción de Datos de Imágenes)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-05-03] Indicador de confianza por campo extraído
LABELS: historia-usuario,transversal,func-ft-05,rol:colaborador
MILESTONE: Transversales
BODY:
## HU-FT-05-03 — Indicador de confianza por campo extraído

**Funcionalidad padre:** `FUNC-FT-05` — Integración con Motor OCR (Extracción de Datos de Imágenes)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** ver el nivel de confianza del OCR para cada campo,
**para que** saber cuáles datos requieren mi revisión cuidadosa.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Cada campo extraído tiene un ícono con porcentaje de confianza al lado.
- [ ] **CA-2:** Verde (>= 90%): alta confianza, sin acción requerida.
- [ ] **CA-3:** Amarillo (70-89%): confianza media, sugiere revisión.
- [ ] **CA-4:** Rojo (< 70%): baja confianza, requiere verificación manual.
- [ ] **CA-5:** Tooltip explica qué representa el indicador.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-05` — Integración con Motor OCR (Extracción de Datos de Imágenes)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-05-04] Caché de resultados OCR por hash
LABELS: historia-usuario,transversal,func-ft-05,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-05-04 — Caché de resultados OCR por hash

**Funcionalidad padre:** `FUNC-FT-05` — Integración con Motor OCR (Extracción de Datos de Imágenes)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** evitar reprocesar el mismo archivo OCR cuando ya tiene resultado,
**para que** optimizar costos en Google Vision y mejorar el rendimiento.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Cada archivo cargado se hashea (SHA-256) al subirse.
- [ ] **CA-2:** Si el hash existe en caché, se devuelve el resultado anterior inmediatamente.
- [ ] **CA-3:** Si no existe, se procesa OCR y se guarda en caché.
- [ ] **CA-4:** TTL del caché: indefinido (mientras el archivo exista).

### 📎 Referencias

- Funcionalidad: `FUNC-FT-05` — Integración con Motor OCR (Extracción de Datos de Imágenes)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-06 — Integración con API de Geolocalización (Validación de Distancias)

_Fase: **Transversales** · Historias: **5**_

---ISSUE---
TITLE: [HU-FT-06-01] Autocomplete de ubicaciones con Google Places
LABELS: historia-usuario,transversal,func-ft-06,rol:colaborador
MILESTONE: Transversales
BODY:
## HU-FT-06-01 — Autocomplete de ubicaciones con Google Places

**Funcionalidad padre:** `FUNC-FT-06` — Integración con API de Geolocalización (Validación de Distancias)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Colaborador,
**quiero** que al escribir una dirección el sistema me sugiera opciones de Google Places,
**para que** ingresar ubicaciones precisas sin errores tipográficos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Los campos de Origen y Destino muestran sugerencias mientras escribo.
- [ ] **CA-2:** Las sugerencias incluyen nombre formateado completo (ej: "Av. Javier Prado Este 123, San Isidro, Lima").
- [ ] **CA-3:** Al seleccionar una sugerencia, se guardan automáticamente las coordenadas (lat/lng).
- [ ] **CA-4:** Si no hay coincidencias, permite ingreso manual con coordenadas opcionales.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-06` — Integración con API de Geolocalización (Validación de Distancias)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-06-02] Cálculo automático de distancia con Haversine
LABELS: historia-usuario,transversal,func-ft-06,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-06-02 — Cálculo automático de distancia con Haversine

**Funcionalidad padre:** `FUNC-FT-06` — Integración con API de Geolocalización (Validación de Distancias)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** calcular automáticamente la distancia entre origen y destino usando Haversine,
**para que** validar la coherencia de la distancia declarada por el colaborador.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al guardar la planilla de movilidad con coordenadas válidas, calcula la distancia.
- [ ] **CA-2:** Compara con el campo "distancia_declarada".
- [ ] **CA-3:** Si la diferencia es <= 30%, se acepta sin observación.
- [ ] **CA-4:** Si > 30%, se marca con etiqueta amarilla "Distancia Discrepante — Revisar".
- [ ] **CA-5:** El cálculo y la observación quedan registrados.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-06` — Integración con API de Geolocalización (Validación de Distancias)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-06-03] Visualización en mapa de origen y destino
LABELS: historia-usuario,transversal,func-ft-06,rol:colaborador
MILESTONE: Transversales
BODY:
## HU-FT-06-03 — Visualización en mapa de origen y destino

**Funcionalidad padre:** `FUNC-FT-06` — Integración con API de Geolocalización (Validación de Distancias)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Colaborador / Coordinador,
**quiero** ver en un mapa el origen y destino de cada movilidad,
**para que** validar visualmente que la ruta declarada es coherente.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Widget de mapa en el detalle de la planilla de movilidad.
- [ ] **CA-2:** Marcadores de origen (verde) y destino (rojo).
- [ ] **CA-3:** Línea recta entre los puntos con etiqueta de distancia calculada.
- [ ] **CA-4:** El mapa permite zoom y pan.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-06` — Integración con API de Geolocalización (Validación de Distancias)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-06-04] Modo offline si la API falla
LABELS: historia-usuario,transversal,func-ft-06,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-06-04 — Modo offline si la API falla

**Funcionalidad padre:** `FUNC-FT-06` — Integración con API de Geolocalización (Validación de Distancias)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** permitir ingreso manual de ubicaciones cuando la API de geolocalización falle,
**para que** no bloquear al colaborador por fallas externas del servicio.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Si Google Places retorna error, se muestra mensaje no bloqueante.
- [ ] **CA-2:** Permite ingreso manual de origen y destino como texto libre.
- [ ] **CA-3:** Permite ingreso opcional de coordenadas si el usuario las conoce.
- [ ] **CA-4:** Sin coordenadas, el cálculo Haversine queda pendiente.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-06` — Integración con API de Geolocalización (Validación de Distancias)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-06-05] Configuración de cuota diaria de la API
LABELS: historia-usuario,transversal,func-ft-06,rol:admin
MILESTONE: Transversales
BODY:
## HU-FT-06-05 — Configuración de cuota diaria de la API

**Funcionalidad padre:** `FUNC-FT-06` — Integración con API de Geolocalización (Validación de Distancias)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** configurar la cuota diaria de consultas a Google Places,
**para que** controlar los costos del servicio externo.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Sección "Geolocalización" en panel de administración.
- [ ] **CA-2:** Campo "Cuota Diaria" (numérico).
- [ ] **CA-3:** Si se alcanza la cuota, el sistema suspende llamadas hasta el día siguiente.
- [ ] **CA-4:** Notifica al Administrador cuando se alcanza el 90% de la cuota.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-06` — Integración con API de Geolocalización (Validación de Distancias)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-07 — Generador de Correlativos Únicos (JSC, KAG, RD, CCH)

_Fase: **Transversales** · Historias: **4**_

---ISSUE---
TITLE: [HU-FT-07-01] Generación atómica de correlativos bajo concurrencia
LABELS: historia-usuario,transversal,func-ft-07,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-07-01 — Generación atómica de correlativos bajo concurrencia

**Funcionalidad padre:** `FUNC-FT-07` — Generador de Correlativos Únicos (JSC, KAG, RD, CCH)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** garantizar que los correlativos sean únicos incluso cuando múltiples usuarios crean documentos simultáneamente,
**para que** evitar duplicados que comprometan la integridad contable.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al crear un documento, el sistema invoca el generador con bloqueo a nivel de tabla.
- [ ] **CA-2:** Retorna el siguiente correlativo y lo marca como reservado en la misma transacción.
- [ ] **CA-3:** Si la creación falla después de obtener el correlativo, este queda "saltado" pero no se reutiliza.
- [ ] **CA-4:** Pruebas de carga: 100 generaciones simultáneas sin colisiones.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-07` — Generador de Correlativos Únicos (JSC, KAG, RD, CCH)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-07-02] Reset anual de correlativos por tipo
LABELS: historia-usuario,transversal,func-ft-07,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-07-02 — Reset anual de correlativos por tipo

**Funcionalidad padre:** `FUNC-FT-07` — Generador de Correlativos Únicos (JSC, KAG, RD, CCH)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** resetear los correlativos RD, CCH, RDV y RMB cada año automáticamente,
**para que** facilitar el orden contable por períodos fiscales.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El primer documento del año genera correlativo terminado en 0001.
- [ ] **CA-2:** Los formatos respetan: RD-2026-0001, CCH-202601-001, RDV-2026-0001, RMB-2026-0001.
- [ ] **CA-3:** Los correlativos JSC y KAG no se resetean (continúan globalmente).

### 📎 Referencias

- Funcionalidad: `FUNC-FT-07` — Generador de Correlativos Únicos (JSC, KAG, RD, CCH)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-07-03] Configuración de prefijos y rangos iniciales
LABELS: historia-usuario,transversal,func-ft-07,rol:admin
MILESTONE: Transversales
BODY:
## HU-FT-07-03 — Configuración de prefijos y rangos iniciales

**Funcionalidad padre:** `FUNC-FT-07` — Generador de Correlativos Únicos (JSC, KAG, RD, CCH)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** configurar los prefijos y números iniciales de cada tipo de correlativo,
**para que** adaptar el sistema a las convenciones específicas del cliente.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Sección "Correlativos" en panel de administración.
- [ ] **CA-2:** Permite definir prefijo (alfabético), formato (con/sin año), número inicial.
- [ ] **CA-3:** Cambios solo son posibles si no hay documentos generados con ese tipo (o con confirmación explícita).
- [ ] **CA-4:** Cambios quedan registrados en log de auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-07` — Generador de Correlativos Únicos (JSC, KAG, RD, CCH)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-07-04] Reporte de continuidad de correlativos
LABELS: historia-usuario,transversal,func-ft-07,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-07-04 — Reporte de continuidad de correlativos

**Funcionalidad padre:** `FUNC-FT-07` — Generador de Correlativos Únicos (JSC, KAG, RD, CCH)
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Auditor,
**quiero** ver un reporte que verifique la continuidad de los correlativos,
**para que** detectar saltos o anomalías que podrían indicar fallas en el sistema.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Reporte "Continuidad de Correlativos" en módulo Auditoría.
- [ ] **CA-2:** Filtros: tipo de correlativo, rango de fechas.
- [ ] **CA-3:** Lista los correlativos generados con: número, tipo, fecha, documento asociado.
- [ ] **CA-4:** Detecta saltos y los marca con etiqueta amarilla.
- [ ] **CA-5:** Permite explorar el motivo del salto (cancelación, fallo en creación, etc.).

### 📎 Referencias

- Funcionalidad: `FUNC-FT-07` — Generador de Correlativos Únicos (JSC, KAG, RD, CCH)
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-08 — Autenticación, Política de Contraseñas y Sesiones

_Fase: **Transversales** · Historias: **6**_

---ISSUE---
TITLE: [HU-FT-08-01] Login con credenciales y validación robusta
LABELS: historia-usuario,transversal,func-ft-08,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-08-01 — Login con credenciales y validación robusta

**Funcionalidad padre:** `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Usuario,
**quiero** iniciar sesión con mi email corporativo y contraseña,
**para que** acceder a la plataforma de manera segura.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Pantalla de login con campos Usuario y Contraseña.
- [ ] **CA-2:** Validación cliente: email con formato válido, contraseña no vacía.
- [ ] **CA-3:** Validación servidor: credenciales correctas, cuenta activa, no bloqueada.
- [ ] **CA-4:** Tras 5 intentos fallidos, bloqueo automático de cuenta por 30 minutos.
- [ ] **CA-5:** Mensaje de error genérico ("Usuario o contraseña incorrectos") sin revelar cuál falló.
- [ ] **CA-6:** Al éxito, redirige al dashboard correspondiente al rol.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-08-02] Política de contraseñas con validación en tiempo real
LABELS: historia-usuario,transversal,func-ft-08,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-08-02 — Política de contraseñas con validación en tiempo real

**Funcionalidad padre:** `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Usuario,
**quiero** ver en tiempo real si mi nueva contraseña cumple con la política,
**para que** crear contraseñas seguras sin frustración por errores tardíos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** En el formulario de cambio/registro, indicadores visuales de cumplimiento:
- [ ] **CA-2:** ✓/✗ Mínimo 8 caracteres
- [ ] **CA-3:** ✓/✗ Al menos 1 mayúscula
- [ ] **CA-4:** ✓/✗ Al menos 1 minúscula
- [ ] **CA-5:** ✓/✗ Al menos 1 número
- [ ] **CA-6:** ✓/✗ Al menos 1 carácter especial
- [ ] **CA-7:** Botón Guardar deshabilitado hasta que todos los criterios se cumplan.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-08-03] Recuperación de contraseña con enlace único
LABELS: historia-usuario,transversal,func-ft-08,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-08-03 — Recuperación de contraseña con enlace único

**Funcionalidad padre:** `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Usuario,
**quiero** recuperar mi contraseña vía email cuando la haya olvidado,
**para que** recuperar el acceso sin contactar al Administrador.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Botón "Recuperar Contraseña" en pantalla de login.
- [ ] **CA-2:** Solicita email del usuario.
- [ ] **CA-3:** Envía email con enlace único de restablecimiento (expira en 1 hora).
- [ ] **CA-4:** El enlace solo es usable una vez.
- [ ] **CA-5:** Tras restablecer, se notifica al usuario y se invalidan todas las sesiones activas.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-08-04] Activación de 2FA por el usuario
LABELS: historia-usuario,transversal,func-ft-08,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-08-04 — Activación de 2FA por el usuario

**Funcionalidad padre:** `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Usuario,
**quiero** activar autenticación de dos factores en mi cuenta,
**para que** agregar una capa adicional de seguridad.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Sección "Seguridad" en perfil del usuario con opción "Activar 2FA".
- [ ] **CA-2:** Genera código QR para escanear con Google Authenticator/Authy.
- [ ] **CA-3:** Solicita código de 6 dígitos de la app para confirmar activación.
- [ ] **CA-4:** Genera 10 códigos de respaldo descargables para emergencias.
- [ ] **CA-5:** Una vez activo, el login solicita código TOTP además de la contraseña.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-08-05] Forzar 2FA para roles críticos por Administrador
LABELS: historia-usuario,transversal,func-ft-08,rol:admin
MILESTONE: Transversales
BODY:
## HU-FT-08-05 — Forzar 2FA para roles críticos por Administrador

**Funcionalidad padre:** `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** forzar la activación de 2FA para los roles Contabilidad, Gerencia, Auditor y Administrador,
**para que** elevar la seguridad de los roles con mayor capacidad de impacto.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Sección "Política de Seguridad" en panel de administración.
- [ ] **CA-2:** Toggle "Forzar 2FA" por rol con lista de roles disponibles.
- [ ] **CA-3:** Si está activo, los usuarios de ese rol reciben aviso al iniciar sesión y deben activar 2FA en 7 días.
- [ ] **CA-4:** Pasados los 7 días sin activación, la cuenta se bloquea y solo el Administrador puede desbloquear.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-08-06] Cierre de sesión por inactividad
LABELS: historia-usuario,transversal,func-ft-08,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-08-06 — Cierre de sesión por inactividad

**Funcionalidad padre:** `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** cerrar la sesión automáticamente tras 30 minutos de inactividad,
**para que** reducir el riesgo de accesos no autorizados desde dispositivos desatendidos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** El cliente registra la última actividad del usuario.
- [ ] **CA-2:** Si pasan 30 minutos sin actividad, se invalida el token JWT.
- [ ] **CA-3:** Al siguiente request, se redirige al login.
- [ ] **CA-4:** El usuario es notificado en pantalla del cierre por inactividad.
- [ ] **CA-5:** El plazo es configurable por el Administrador (mínimo 15, máximo 120 minutos).

### 📎 Referencias

- Funcionalidad: `FUNC-FT-08` — Autenticación, Política de Contraseñas y Sesiones
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-09 — Log de Auditoría Completo del Sistema

_Fase: **Transversales** · Historias: **6**_

---ISSUE---
TITLE: [HU-FT-09-01] Registro automático de toda acción relevante
LABELS: historia-usuario,transversal,func-ft-09,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-09-01 — Registro automático de toda acción relevante

**Funcionalidad padre:** `FUNC-FT-09` — Log de Auditoría Completo del Sistema
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** registrar automáticamente toda acción relevante en el log de auditoría,
**para que** mantener trazabilidad completa para cumplimiento y resolución de incidentes.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Cada acción de tipo CREATE, UPDATE, DELETE en entidades principales registra evento.
- [ ] **CA-2:** Cada login/logout registra evento.
- [ ] **CA-3:** Cada generación de PDF, descarga de archivo y consulta a SUNAT registra evento.
- [ ] **CA-4:** El registro incluye snapshot de datos antes/después para acciones de modificación.
- [ ] **CA-5:** El registro es asincrónico (no impacta tiempo de respuesta de la acción principal).

### 📎 Referencias

- Funcionalidad: `FUNC-FT-09` — Log de Auditoría Completo del Sistema
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-09-02] Consulta del log con filtros avanzados
LABELS: historia-usuario,transversal,func-ft-09,rol:admin
MILESTONE: Transversales
BODY:
## HU-FT-09-02 — Consulta del log con filtros avanzados

**Funcionalidad padre:** `FUNC-FT-09` — Log de Auditoría Completo del Sistema
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Auditor / Administrador,
**quiero** consultar el log de auditoría con filtros avanzados,
**para que** investigar incidentes específicos o realizar revisiones periódicas.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Módulo "Auditoría — Log del Sistema" accesible solo a roles Auditor y Administrador.
- [ ] **CA-2:** Filtros: usuario, rol, rango de fechas, módulo, acción, recurso, IP.
- [ ] **CA-3:** Búsqueda full-text en los datos del evento.
- [ ] **CA-4:** Resultados paginados con ordenamiento por fecha (descendente por defecto).
- [ ] **CA-5:** Cada fila permite expandir para ver el detalle completo del evento.
- [ ] **CA-6:** Exportable a Excel y CSV.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-09` — Log de Auditoría Completo del Sistema
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-09-03] Inmutabilidad del log de auditoría
LABELS: historia-usuario,transversal,func-ft-09,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-09-03 — Inmutabilidad del log de auditoría

**Funcionalidad padre:** `FUNC-FT-09` — Log de Auditoría Completo del Sistema
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** garantizar que ningún usuario pueda modificar o eliminar registros del log,
**para que** preservar la confiabilidad del registro de auditoría.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** La interfaz no expone acciones de eliminación ni edición sobre los registros del log.
- [ ] **CA-2:** Las APIs rechazan operaciones DELETE y UPDATE sobre la tabla del log con error 403.
- [ ] **CA-3:** Los permisos de la base de datos restringen estas operaciones a nivel de DBA.
- [ ] **CA-4:** Cualquier intento de modificación queda registrado en el meta-log.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-09` — Log de Auditoría Completo del Sistema
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-09-04] Meta-log de consultas al log
LABELS: historia-usuario,transversal,func-ft-09,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-09-04 — Meta-log de consultas al log

**Funcionalidad padre:** `FUNC-FT-09` — Log de Auditoría Completo del Sistema
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** registrar quién consulta el log de auditoría y con qué filtros,
**para que** tener trazabilidad incluso del acceso al sistema de auditoría.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Cada consulta al módulo de Auditoría se registra: usuario, fecha/hora, filtros, cantidad de resultados.
- [ ] **CA-2:** El meta-log es accesible solo al Administrador.
- [ ] **CA-3:** El meta-log no es accesible vía API expuesta al usuario.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-09` — Log de Auditoría Completo del Sistema
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-09-05] Alertas por patrones sospechosos
LABELS: historia-usuario,transversal,func-ft-09,rol:admin
MILESTONE: Transversales
BODY:
## HU-FT-09-05 — Alertas por patrones sospechosos

**Funcionalidad padre:** `FUNC-FT-09` — Log de Auditoría Completo del Sistema
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Administrador,
**quiero** configurar alertas por patrones sospechosos en el log,
**para que** detectar proactivamente comportamientos anómalos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Sección "Alertas de Auditoría" en panel de administración.
- [ ] **CA-2:** Plantillas pre-definidas: múltiples logins fallidos, accesos fuera de horario, descargas masivas.
- [ ] **CA-3:** Permite crear reglas custom con condiciones lógicas (AND/OR sobre campos del log).
- [ ] **CA-4:** Las alertas se envían por email al Administrador y/o roles configurados.
- [ ] **CA-5:** Cada alerta queda registrada en panel "Alertas Activas".

### 📎 Referencias

- Funcionalidad: `FUNC-FT-09` — Log de Auditoría Completo del Sistema
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-09-06] Retención de logs y archivado
LABELS: historia-usuario,transversal,func-ft-09,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-09-06 — Retención de logs y archivado

**Funcionalidad padre:** `FUNC-FT-09` — Log de Auditoría Completo del Sistema
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** retener los logs por al menos 5 años con posibilidad de archivado,
**para que** cumplir con normativas de auditoría y optimizar costos de almacenamiento.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Los logs activos se mantienen en la base de datos principal.
- [ ] **CA-2:** Logs con antigüedad > 1 año se archivan automáticamente en almacenamiento frío (S3 Glacier o similar).
- [ ] **CA-3:** Logs archivados son consultables pero con latencia mayor (1-5 minutos).
- [ ] **CA-4:** Los logs se eliminan definitivamente solo después de 5 años, con confirmación dual del Administrador y la Gerencia.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-09` — Log de Auditoría Completo del Sistema
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-10 — Hash SHA-256 para Integridad de Documentos PDF

_Fase: **Transversales** · Historias: **4**_

---ISSUE---
TITLE: [HU-FT-10-01] Generación automática del hash al cerrar
LABELS: historia-usuario,transversal,func-ft-10,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-10-01 — Generación automática del hash al cerrar

**Funcionalidad padre:** `FUNC-FT-10` — Hash SHA-256 para Integridad de Documentos PDF
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** generar y almacenar el hash SHA-256 de cada PDF firmado al cerrar definitivamente,
**para que** tener un identificador único de integridad para verificación posterior.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al ejecutar el cierre, se calcula SHA-256 sobre el archivo PDF final.
- [ ] **CA-2:** El hash se almacena con id_documento, tipo, hash (string hexadecimal), fecha_generación, usuario.
- [ ] **CA-3:** El hash es visible en el detalle del documento.
- [ ] **CA-4:** El registro es inmutable.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-10` — Hash SHA-256 para Integridad de Documentos PDF
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-10-02] Verificación de integridad por carga de archivo
LABELS: historia-usuario,transversal,func-ft-10,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-10-02 — Verificación de integridad por carga de archivo

**Funcionalidad padre:** `FUNC-FT-10` — Hash SHA-256 para Integridad de Documentos PDF
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Auditor,
**quiero** verificar la integridad de un PDF cargándolo en la plataforma,
**para que** confirmar que el documento no ha sido alterado desde su cierre.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Sección "Verificar Integridad" accesible al Auditor.
- [ ] **CA-2:** Permite arrastrar/seleccionar un PDF.
- [ ] **CA-3:** El sistema calcula su hash SHA-256 en el cliente o servidor.
- [ ] **CA-4:** Compara con todos los hashes almacenados en la base.
- [ ] **CA-5:** Resultado: "Documento Íntegro" en verde con datos de la rendición original, o "Documento Alterado" en rojo.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-10` — Hash SHA-256 para Integridad de Documentos PDF
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-10-03] Reporte PDF firmado de la verificación
LABELS: historia-usuario,transversal,func-ft-10,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-10-03 — Reporte PDF firmado de la verificación

**Funcionalidad padre:** `FUNC-FT-10` — Hash SHA-256 para Integridad de Documentos PDF
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Auditor,
**quiero** generar un reporte de la verificación de integridad,
**para que** documentar la revisión y compartirla con stakeholders externos.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Después de verificar, botón "Generar Reporte" disponible.
- [ ] **CA-2:** El reporte incluye: hash calculado, hash esperado, resultado, fecha/hora, usuario, datos del documento.
- [ ] **CA-3:** El reporte es PDF firmado digitalmente por el sistema.
- [ ] **CA-4:** Se descarga inmediatamente.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-10` — Hash SHA-256 para Integridad de Documentos PDF
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-10-04] Verificación en lote por carga de ZIP
LABELS: historia-usuario,transversal,func-ft-10,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-10-04 — Verificación en lote por carga de ZIP

**Funcionalidad padre:** `FUNC-FT-10` — Hash SHA-256 para Integridad de Documentos PDF
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Auditor,
**quiero** verificar múltiples documentos en una sola operación cargando un ZIP,
**para que** agilizar revisiones masivas en auditorías programadas.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Acción "Verificar en Lote" permite cargar archivo ZIP.
- [ ] **CA-2:** El sistema descomprime y procesa cada PDF interno.
- [ ] **CA-3:** Muestra tabla con resultado por archivo: nombre, hash calculado, resultado.
- [ ] **CA-4:** Genera reporte consolidado descargable.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-10` — Hash SHA-256 para Integridad de Documentos PDF
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


### FUNC-FT-11 — Cumplimiento Normativo y Protección de Datos Personales

_Fase: **Transversales** · Historias: **6**_

---ISSUE---
TITLE: [HU-FT-11-01] Aceptación de Política de Privacidad y Términos
LABELS: historia-usuario,transversal,func-ft-11,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-11-01 — Aceptación de Política de Privacidad y Términos

**Funcionalidad padre:** `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Usuario,
**quiero** aceptar la Política de Privacidad y Términos al primer ingreso,
**para que** estar informado sobre el tratamiento de mis datos y dar mi consentimiento explícito.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Al primer login, modal con la Política de Privacidad completa y los Términos.
- [ ] **CA-2:** Checkboxes obligatorios: "He leído y acepto la Política de Privacidad" y "He leído y acepto los Términos del Servicio".
- [ ] **CA-3:** Botón "Acepto y Continuar" habilitado solo cuando ambos checkboxes están marcados.
- [ ] **CA-4:** La aceptación queda registrada con: usuario, fecha/hora, IP, versión de los documentos.
- [ ] **CA-5:** Si los documentos cambian (nueva versión), se solicita re-aceptación.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-11-02] Solicitud de reporte ARCO de datos personales
LABELS: historia-usuario,transversal,func-ft-11,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-11-02 — Solicitud de reporte ARCO de datos personales

**Funcionalidad padre:** `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Usuario,
**quiero** solicitar un reporte de todos los datos personales que el sistema almacena sobre mí,
**para que** ejercer mi derecho de acceso conforme a la Ley 29733.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Sección "Mis Derechos ARCO" en perfil del usuario con botón "Solicitar Reporte de Mis Datos".
- [ ] **CA-2:** El reporte se genera y se envía al email del usuario en máximo 20 días hábiles.
- [ ] **CA-3:** El reporte incluye: datos personales, datos bancarios, histórico de solicitudes y rendiciones, log de mis accesos.
- [ ] **CA-4:** El reporte se entrega en Excel y PDF con firma digital.
- [ ] **CA-5:** La solicitud queda registrada en el log de auditoría.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-11-03] Rectificación de datos personales por el usuario
LABELS: historia-usuario,transversal,func-ft-11,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-11-03 — Rectificación de datos personales por el usuario

**Funcionalidad padre:** `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Usuario,
**quiero** modificar mis datos personales como teléfono, dirección y datos bancarios,
**para que** mantener mi información actualizada.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Sección "Mi Perfil" con campos editables.
- [ ] **CA-2:** Cambios de datos bancarios o documento de identidad requieren validación: confirmación por email + aprobación del Administrador.
- [ ] **CA-3:** Cambios menores (teléfono, dirección) se aplican inmediatamente.
- [ ] **CA-4:** Toda modificación queda registrada en log de auditoría.
- [ ] **CA-5:** Se notifica al usuario por email cada vez que cambien sus datos.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-11-04] Solicitud de cancelación de cuenta
LABELS: historia-usuario,transversal,func-ft-11,rol:otro
MILESTONE: Transversales
BODY:
## HU-FT-11-04 — Solicitud de cancelación de cuenta

**Funcionalidad padre:** `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Usuario,
**quiero** solicitar el cierre y anonimización de mi cuenta,
**para que** ejercer mi derecho de cancelación cuando deje la organización.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Sección "Mis Derechos ARCO" con botón "Solicitar Cancelación".
- [ ] **CA-2:** Modal de confirmación advierte que datos transaccionales se conservan por 10 años.
- [ ] **CA-3:** La solicitud queda en estado "En Revisión" y notifica al Administrador.
- [ ] **CA-4:** Tras aprobación, los datos personales se reemplazan por hashes ("USUARIO_ANONIMIZADO_[hash]").
- [ ] **CA-5:** Se conserva el ID interno y los datos transaccionales para integridad contable.
- [ ] **CA-6:** Se confirma al usuario por email la cancelación.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-11-05] Encriptación de datos sensibles en reposo
LABELS: historia-usuario,transversal,func-ft-11,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-11-05 — Encriptación de datos sensibles en reposo

**Funcionalidad padre:** `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** almacenar datos sensibles con encriptación AES-256,
**para que** cumplir con buenas prácticas de seguridad y proteger información en caso de brecha.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** Contraseñas: hash bcrypt (factor 12).
- [ ] **CA-2:** Tokens y secrets: encriptación AES-256 con clave maestra en KMS.
- [ ] **CA-3:** Datos bancarios (N° Cuenta, CCI): encriptación AES-256.
- [ ] **CA-4:** Documentos de identidad: encriptación AES-256.
- [ ] **CA-5:** Las claves de encriptación se rotan anualmente.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---

---ISSUE---
TITLE: [HU-FT-11-06] Enmascaramiento de datos sensibles según rol
LABELS: historia-usuario,transversal,func-ft-11,rol:sistema
MILESTONE: Transversales
BODY:
## HU-FT-11-06 — Enmascaramiento de datos sensibles según rol

**Funcionalidad padre:** `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
**Fase:** Transversales (Funcionalidades Transversales)

### 📝 Historia de Usuario

**Como** Sistema,
**quiero** mostrar datos sensibles enmascarados a roles que no los requieren,
**para que** minimizar la exposición de información personal.

### ✅ Criterios de Aceptación

- [ ] **CA-1:** N° de Cuenta Bancaria: se muestra como "****1234" para roles distintos a Contabilidad/Tesorería/Titular.
- [ ] **CA-2:** Documento de Identidad: se muestra como "********567" para roles distintos a RR.HH./Administrador/Titular.
- [ ] **CA-3:** Las APIs respetan la misma lógica de enmascaramiento según rol del solicitante.
- [ ] **CA-4:** Los reportes exportados también respetan el enmascaramiento.

### 📎 Referencias

- Funcionalidad: `FUNC-FT-11` — Cumplimiento Normativo y Protección de Datos Personales
- Documento de alcance funcional VIATIKA v2.0
- Catálogo de funcionalidades e historias de usuario (Word doc)

### 🧪 Definición de Hecho (DoD)

- [ ] Todos los criterios de aceptación verificados
- [ ] Pruebas unitarias y de integración con cobertura ≥ 80%
- [ ] Code review aprobado por al menos un par
- [ ] Validado en ambiente UAT por usuario funcional designado
- [ ] Documentación técnica actualizada
---END-ISSUE---


---

_Generado a partir del catálogo VIATIKA — 45 funcionalidades · 191 historias de usuario._
_Cliente: TEMA LITOCLEAN SAC · Elaborado por: Tecdidata SAC · 2026._
