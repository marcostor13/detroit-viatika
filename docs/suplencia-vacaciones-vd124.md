# Suplencia por vacaciones (VD-124)

> Cuando un aprobador sale de vacaciones programadas tiene que asignar la
> persona que lo reemplazará.

## La idea en una línea

**No se reescriben las cadenas de aprobación. Se expande la identidad del actor.**

## Por qué

Las cadenas se sellan al enviar el documento (`ChainStep.approverIds`, ver
[`approval-chain.util.ts`](../viatika-back/src/modules/advance/approval-chain.util.ts))
y nunca se reescriben. Un rediseño que reasignara aprobadores tendría que
recorrer y modificar cada documento en vuelo, y no alcanzaría a lo enviado antes
de que empezara el período — que es justo el caso que más duele: el aprobador se
va con quince rendiciones colgadas.

Pero todas las etapas —solicitud, comprobante, rendición, caja chica, bandeja,
contadores— hacen exactamente la misma pregunta: *¿este usuario está entre los
`approverIds` de un paso pendiente?* Basta con que durante el período el suplente
responda que sí también por la identidad de su titular:

```
actorIds = [ yo, ...titulares que me nombraron suplente y cuyo período está vigente ]
```

De ahí salen tres propiedades, sin código adicional:

- Cubre lo enviado **antes** de que empezara la vacación, no solo lo nuevo.
- Cubre **todas** las etapas, sin tocar ninguna regla de negocio.
- **Se apaga sola** al vencer el rango. No hay estado que limpiar ni migración
  que revertir.

## Modelo de datos

Un campo en la raíz del `User` del **titular**:

```ts
vacaciones?: {
  desde: Date        // normalizado a 00:00:00.000
  hasta: Date        // normalizado a 23:59:59.999 (inclusivo)
  suplenteId: ObjectId
}
```

**En la raíz, no dentro de `permissions`.** La razón de fondo es semántica: una
suplencia describe la disponibilidad de la persona, no un permiso que se le
otorga. La razón práctica es que `permissions` lo reescriben en bloque las
cargas masivas y el formulario de permisos — una suplencia vigente ahí adentro
habría desaparecido en la próxima corrida sin que nadie se entere.

Índice: `{ 'vacaciones.suplenteId': 1, 'vacaciones.desde': 1, 'vacaciones.hasta': 1 }`.
La consulta corre en cada acción de aprobación.

### Ojo con la zona horaria

`new Date('2026-09-01')` se parsea como medianoche **UTC**. En Lima (UTC-5) eso
cae el 31 de agosto a las 19:00, y la vacación arrancaría un día antes del que
el usuario eligió. El formulario manda `YYYY-MM-DD`, así que ese es el caso
normal, no el raro: `aFechaLocal()` en
[`suplencia.ts`](../viatika-back/src/common/types/suplencia.ts) lo interpreta
como fecha local.

## Las dos direcciones

| Dirección | Qué resuelve | Dónde |
|---|---|---|
| **Entrada** — `idsTitularesCubiertosPor` | permisos, bandeja, contadores | `findActionableChainStep` / `canActOnChain` reciben `cubreA`; las consultas pasan de `approverIds: uid` a `approverIds: { $in: identidades }`; `isApproverForClient` reconoce al suplente |
| **Salida** — `resolverSuplenteVigente` | correos y notificaciones | `conSuplentes()` expande los destinatarios en `notifyExpensePendingApprovers`, `notifyViaticoCoordinator` y los dos resolvers de destinatarios |

Sin la dirección de salida el suplente puede firmar pero nunca se entera de que
tiene algo pendiente — es la mitad de la funcionalidad, no un extra.

## Decisiones

1. **Aditiva.** El titular no pierde sus permisos: si entra desde el celular,
   firma igual. Un rango mal puesto nunca deja un documento sin quién lo apruebe.
2. **Un solo salto.** Si el suplente también está de vacaciones, no se resuelve
   en cadena hacia su suplente. Evita ciclos y es explicable.
3. **Sin autoaprobación.** La suplencia no habilita a firmar lo que el propio
   suplente creó (`idsTitularesCubiertosPara` devuelve vacío en ese caso), misma
   idea que el escalamiento de la regla 1.5. Ese documento espera al titular o a
   otro nivel de la cadena.
4. **Trazabilidad.** `ChainStep.approvedOnBehalfOf` guarda a quién cubría el que
   firmó. `approvedBy` sigue siendo la persona real que hizo clic.
5. **Lo configuran ambos.** El propio aprobador desde su perfil, y
   Admin/Contabilidad para el caso típico: se fue sin dejarlo puesto.

## Superficie

**Backend**

- `common/types/suplencia.ts` — tipo, normalización y vigencia (puro, testeable).
- `user.schema.ts` — campo `vacaciones` + índice.
- `user.service.ts` — `setVacaciones`, `findTitularesCubiertosPor`,
  `idsTitularesCubiertosPor`, `idsTitularesCubiertosPara`, `resolverSuplenteVigente`.
- `user.controller.ts` — `PATCH|DELETE /user/profile/vacaciones`,
  `PATCH|DELETE /user/:id/vacaciones`, `GET /user/profile/suplencias`.
  Las rutas `profile/…` van declaradas **antes** que `:id/…`: Express casa por
  orden de registro.
- `approval-chain.util.ts` — `cubreA` en `findActionableChainStep` y
  `canActOnChain`; `identidadesDelActor`, `titularCubiertoEnPaso`.
- `expense.service.ts`, `expense-report.service.ts`, `advance.service.ts` —
  puntos de aprobación y consultas de bandeja.
- `project.service.ts` — `isApproverForClient` reconoce al suplente. Sin esto el
  suplente cae en el filtro de "solo lo mío" y no ve nada.

**Frontend**

- `services/suplencia.service.ts`
- `mi-perfil` — sección "Vacaciones y reemplazo".
- `components/suplencia-banner` — aviso "estás aprobando en reemplazo de X" en
  `/rendiciones` y `/viaticos`. La bandeja mezcla los documentos del titular con
  los propios sin ninguna marca; sin el aviso alguien firma sin saber en nombre
  de quién.

## Fuera de alcance

Solicitud de vacaciones, saldo de días, aprobación de RRHH y calendario. VD-124
pide designar un reemplazo; un módulo de vacaciones completo es otro ticket.
