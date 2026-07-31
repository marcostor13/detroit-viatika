# Usuario inicial y arranque

Cómo dejar una instalación de Viatika lista para usar: crea los roles, el
**SuperAdministrador** de plataforma, la **primera empresa** y su **primer
Administrador**.

## Script de arranque

```bash
cd viatika-back
npm run init
```

- **Idempotente**: se puede correr varias veces sin duplicar (upsert por
  código de empresa y por email).
- Trae fix de DNS (para el SRV de Atlas) y un guard de seguridad remoto.

### Contra una base remota (Atlas)

Requiere confirmación explícita:

```bash
SEED_ALLOW_REMOTE=yes npm run init
```

### Con datos reales (recomendado por variables de entorno)

Así no quedan contraseñas ni datos hardcodeados en el repo:

```bash
SEED_ALLOW_REMOTE=yes \
COMPANY_CODE="DETROIT" \
COMPANY_NAME="Detroit" \
COMPANY_LEGAL="Detroit SAC" \
COMPANY_RUC="20XXXXXXXXX" \
ADMIN_EMAIL="admin@detroit.pe" \
ADMIN_NAME="Administrador Detroit" \
ADMIN_PASSWORD="una-clave-fuerte" \
npm run init
```

También puedes editar el bloque `CONFIG` al inicio de `viatika-back/src/init.ts`.

## Usuarios que crea

| Usuario | Rol | Email (default) | Contraseña (default) | Notas |
|---|---|---|---|---|
| SuperAdministrador | `Superadministrador` | `admin@viatika.com` | `@Libido2010` | Sin empresa. Gestiona empresas/clientes. |
| Administrador de empresa | `Administrador` | `admin@miempresa.com` | `Cambiar2026$` | Ligado a la primera empresa. `mustChangePassword=true`. |

> Los defaults se sobreescriben con las variables de entorno
> (`SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD`, `ADMIN_EMAIL/ADMIN_PASSWORD`, etc.).
> El Administrador se crea con `mustChangePassword`, así que **debe cambiar la
> contraseña en el primer login**. Cambia también la del SuperAdmin.

## Nota sobre el seeder automático

Al **iniciar el backend** (`npm run start:dev` / `start:prod`) corre
automáticamente `DatabaseSeederService`, que ya crea los **roles** y el
**SuperAdmin** por defecto, y aplica migraciones legacy. `npm run seed` hace
lo mismo de forma manual.

`npm run init` va un paso más allá: además del SuperAdmin, deja creada la
**primera empresa** y su **Administrador**, que es lo que el arranque
automático no hace.

## Después de `init` (configuración que queda por hacer)

`init` a propósito **no** crea centros de costo ni asigna aprobadores (son
decisiones de negocio). Entrando como el Administrador:

1. Crear **centros de costo** y definir sus aprobadores **N1/N2/N3**.
2. Asignar a cada **colaborador** sus centros de costo
   (`/admin-users/:id/permisos`) y marcar el principal.

Sin esos dos pasos, los comprobantes muestran "Aprobación no generada" porque
no hay cadena de aprobadores que construir (regla 1.4).
