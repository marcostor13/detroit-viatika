# Usuarios del sistema

> Estado al 15-ago-2026, sobre la base nueva levantada tras el compromiso de
> la anterior. Las empresas IGNIA y Maya que figuraban aquí vivían en la base
> vieja y **ya no existen**. Ver
> [carga-inicial-detroit-2026-08.md](carga-inicial-detroit-2026-08.md).

- **Frontend**: https://rendiciones.detroit.pe/
- **API**: `https://apidetroit.viatika.tecdidata.com/api`

## Resumen

| Usuario | Email | Rol | Empresa |
|---------|-------|-----|---------|
| Super Administrator | admin@viatika.com | Superadministrador | — |
| Ivan Torres | ivantorres22_8@hotmail.com | Administrador | DETROIT |
| 153 colaboradores de Detroit | `*@detroit.pe` | Colaborador | DETROIT |

## Detalle por empresa

### Sin empresa (global)

| Usuario | Email | Rol |
|---------|-------|-----|
| Super Administrator | admin@viatika.com | Superadministrador |

### DETROIT

Razón social: DETROIT POWER SYSTEM PERU. RUC 20606142499.
`clientId` = `6a8201c9e9c98076615c6216`.

| Usuario | Email | Rol | Notas |
|---------|-------|-----|-------|
| Ivan Torres | ivantorres22_8@hotmail.com | Administrador | `isCompanyAdmin`, los 10 módulos, L1 y L2 |
| 153 colaboradores | ver Excel de personal | Colaborador | módulos `mis-rendiciones` + `viaticos`; los aprobadores suman `rendiciones` |

Ningún usuario tiene rol **Contabilidad** ni **Tesorería**: sin ellos no hay
quien registre pagos ni reciba los correos de "pendiente de pago". Pendiente
de decisión del cliente.

## Contraseñas conocidas

| Email | Contraseña |
|-------|-----------|
| admin@viatika.com | @Libido2010 |
| ivantorres22_8@hotmail.com | 12345678 |
| Los 153 colaboradores de Detroit | 12345678 |

Todos entran con `mustChangePassword: false`, es decir sin pantalla forzada de
cambio de clave. **Son contraseñas temporales de puesta en marcha: hay que
forzar el cambio antes de considerar el entorno productivo.**

Para un usuario creado fuera de esa carga, la contraseña es la temporal
aleatoria que devuelve el alta. Se obtiene una nueva con "Resetear contraseña"
en /clients-admin, o fijando una conocida con el flujo
`login con la temporal` + `PATCH /user/profile/password`.
