# Caja chica como bolsa (fondo revolvente)

Estado: diseño aprobado en lo esencial, pendiente de confirmar los puntos de la
sección 7. Fecha: 2026-08-17.

## 1. Qué se pide

El responsable de caja chica (ejemplo: Magaly) recibe un fondo fijo (ejemplo:
S/ 3000). Registra contra ese fondo los comprobantes que le entregan los
colaboradores, el saldo disponible baja, y cuando rinde y Tesorería aprueba el
pago, el fondo se repone hasta volver al monto original. La solicitud de fondo
se hace UNA sola vez; de ahí en adelante el ciclo es rendir y reponer.

```
Solicitud (una vez)      Uso continuo                 Rendición y reposición
S/ 3000                  bolsa 3000 / gastado 1800    Tesorería deposita 1800
aprobador -> Contab.     disponible 1200              bolsa vuelve a 3000
-> Tesorería paga
```

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Aprobadores de la rendición | Los del RESPONSABLE de la caja, tomados de `permissions.approverLevels`. NO se usa el centro de costo del comprobante. |
| Cantidad de niveles | Variable. La cadena recorre todos los niveles que el responsable tenga configurados (N genérico), no solo N1/N2. |
| Nomenclatura | Se llama **Presupuesto**, no "bolsa". |
| Monto del fondo | Lo pide el responsable en una solicitud. |
| Solicitudes posteriores | REEMPLAZAN el presupuesto vigente, para arriba o para abajo. No es "una sola vez". Solo se impide encimar dos solicitudes sin resolver. |
| Bajar el presupuesto | Genera un sobrante que el responsable debe devolver, adjuntando el comprobante del depósito. |
| Tope de gasto | La rendición no puede superar el presupuesto vigente. |
| Solicitud inicial | Reutiliza el flujo de Solicitud de Fondos existente, ocultando los campos que no aplican. |
| Centro de costo y OT por comprobante | Opcionales. |
| Colaborador por comprobante | No se registra. La caja chica opera como una rendición directa del responsable. |
| Firma por comprobante | Obligatoria, solo en caja chica. Se sube como imagen o PDF, no se escanea ni se dibuja. |
| Tope por comprobante | Configurable en Configuración de empresa, en Límites. Un solo valor, sin distinguir categoría, aplica a TODOS los tipos de rendición. Solo advierte, nunca bloquea. |
| Rechazo | Igual que en rendición directa: el comprobante vuelve a corrección y se reenvía. El cargo contra el fondo se mantiene; el saldo solo vuelve con la reposición. |
| Marco general | La rendición de caja chica se comporta como una rendición DIRECTA. Las únicas diferencias son las dos filas de arriba (centro de costo y OT por comprobante, opcionales) y el saldo disponible del fondo. |
| Centro de costo y OT de la solicitud | No se piden al solicitar el fondo. Se definen recién al subir cada gasto. |
| Fondo existente (`petty-cash`) | Queda como legacy de otro proyecto. Se crea una entidad nueva. |

### Por qué una entidad nueva y no `petty-cash`

`PettyCash` ([petty-cash.entity.ts](../viatika-back/src/modules/petty-cash/entities/petty-cash.entity.ts))
sirve para un fondo MENSUAL: `period` es obligatorio con índice único por
responsable y mes, y `funding` es un objeto único (un solo fondeo, sin
reposiciones). Lo que se pide es un fondo revolvente sin período y con N
movimientos. Además la pantalla `/caja-chica` está construida con modales, que
la guía del repo prohíbe para formularios. Reutilizarla obligaría a romper el
índice único, cambiar `funding` a lista y reescribir la pantalla, o sea todo
salvo el nombre. Se deja intacta.

## 3. Modelo de datos

### 3.1 Entidad nueva: `FondoCajaChica`

Módulo `viatika-back/src/modules/fondo-caja-chica/`.

```ts
{
  code: string                 // CCH-0001, correlativo por cliente
  clientId: ObjectId
  responsibleId: ObjectId      // un solo fondo activo por responsable y cliente
  fundAmount: number           // tope del fondo, del monto solicitado (3000)
  spentAmount: number          // cargado y aún no repuesto
  status: 'pending_funding' | 'active' | 'closed'
  solicitudReportId: ObjectId  // la solicitud que lo originó
  movements: FondoMovement[]
  closedAt?, closedBy?
}
```

`disponible = fundAmount - spentAmount`. No se persiste, se calcula.

```ts
FondoMovement {
  type: 'fondeo' | 'cargo' | 'reverso' | 'reposicion'
  amount: number               // siempre positivo, el signo lo da `type`
  expenseId?: ObjectId         // en cargo y reverso
  expenseReportId?: ObjectId   // en cargo, reverso y reposicion
  registeredBy: string
  registeredAt: Date
  note?: string
}
```

| Movimiento | Cuándo | Efecto |
|---|---|---|
| `fondeo` | Tesorería paga la solicitud | `status = active`. No mueve `spentAmount`. |
| `cargo` | Se sube un comprobante a una rendición de caja chica | `spentAmount += monto` |
| `reverso` | Se elimina un comprobante de la rendición | `spentAmount -= monto` |
| `reposicion` | Tesorería registra el depósito de reposición | `spentAmount -= monto repuesto` |

El historial de movimientos es lo que permite auditar por qué el saldo es el que
es, y es la razón principal para no reutilizar `PettyCash.funding`.

### 3.2 Cambios en entidades existentes

**`Client.limits`** ([client.entity.ts:89](../viatika-back/src/modules/client/entities/client.entity.ts#L89)):
agregar `topeComprobante?: number`. Mismo tratamiento en
[create-client.dto.ts](../viatika-back/src/modules/client/dto/create-client.dto.ts).

**`Expense`** ([expense.entity.ts](../viatika-back/src/modules/expense/entities/expense.entity.ts)):

- `proyectId` pasa de `required: true` a opcional. Es el cambio de mayor
  alcance del plan: hoy es obligatorio para todos los comprobantes del sistema.
  La validación de obligatoriedad se mueve al servicio, que la exige salvo
  cuando el reporte es de caja chica.
- `firmaUrl?: string`, obligatoria a nivel de servicio cuando el reporte es de
  caja chica.
- `superaTopeComprobante?: boolean`, marcado al crear o editar el comprobante
  comparando `total` contra `Client.limits.topeComprobante`. Se persiste para
  que el aprobador vea la advertencia sin recalcular.

**`ExpenseReport`**: `isSolicitudCajaChica?: boolean` sobre el reporte
`type: 'viatico'` que representa la solicitud del fondo, y
`fondoCajaChicaId?: ObjectId` en las rendiciones de caja chica para saber a qué
fondo cargan.

## 4. Cadena de aprobación

El motor de [approval-chain.util.ts](../viatika-back/src/modules/advance/approval-chain.util.ts)
ya resuelve pasos desde los niveles propios del colaborador (regla 1.10,
`ownerOrProjectSource`). Lo único que sobra para caja chica es el paso extra que
`buildRendicionChain` agrega cuando el centro de costo del comprobante no está
entre los asignados al colaborador ([líneas 451-462](../viatika-back/src/modules/advance/approval-chain.util.ts#L451-L462)),
que es justo el caso F1/F2/F3 con tres aprobadores distintos que el cliente NO
quiere.

Función nueva en el mismo archivo:

```ts
buildCajaChicaChain({ ownerApproverLevels, fallbackProject, creatorId }): ChainStep[]
```

Recorre todos los niveles con aprobadores que tenga el responsable, ordenados,
resolviendo cada uno con `resolveStepFromSource` (que ya trae omisión de nivel
vacío y escalamiento si el creador es su propio aprobador), y colapsa pasos
consecutivos con el mismo conjunto. El centro de costo solo se usa para rellenar
`projectId`, que el subdocumento persistido declara obligatorio, y como fuente
de niveles si el responsable no tiene ninguno propio.

Queda N genérico sin tocar nada más: si el responsable tiene un solo nivel, la
cadena es de un paso; si tiene tres, de tres. Contabilidad sigue siendo el gate
final separado, igual que hoy.

La misma función sirve para la SOLICITUD del fondo. `buildSolicitudChain` no
puede usarse ahí: exige un centro de costo seleccionado y lanza si el
colaborador no tiene centros asignados, y la solicitud de caja chica no lleva
centro de costo.

Divergencia deliberada con las otras dos cadenas: aquí una cadena vacía lanza
`BadRequestException` en vez de pasar directo a Contabilidad. Con centro de
costo la omisión total es improbable; sin él, un responsable sin aprobadores
configurados dejaría el fondo aprobándose solo.

## 4.bis Formulario de la solicitud

Campos del formato en papel "SOLICITUD ASIGNACIÓN DE CAJA CHICA", confirmados
por el cliente el 2026-08-17. Casi todos salen del perfil del usuario, así que
lo único que escribe el responsable es el monto.

| Campo del papel | De dónde sale |
|---|---|
| Fecha solicitud | Automática, el día en que se genera |
| Nombre | `User.name` |
| DNI | `User.dni` |
| Área (departamento) | `User.area` |
| Monto solicitado S/ | Lo escribe el responsable |
| Centro de Costo | El del propio solicitante, no se elige |
| Banco / Cta. Bancaria / Cta. Interbancaria | `User.bankAccount.bankName` / `.accountNumber` / `.cci` |
| Motivo que lo origina | NO se incluye |
| Orden de trabajo | NO aplica |

Los campos existen todos en el esquema de usuario, no hay que agregar ninguno.

La parte inferior del formato (firmas y demás conceptos) debe salir en el PDF,
igual que en el formato de solicitudes usual. El `MODELO SOLICITUD VIÁTICOS.xls`
de `docs/` cierra con un bloque "Procedimiento" de 6 condiciones que el PDF
actual de Solicitud de Viáticos no imprime; el formato de rendición
(ADF-FOR-004) sí trae recuadros de firma reales (V°B° JEFE INMEDIATO y V°B°
FINANZAS, con las firmas de los usuarios) en `rendicion-export.service.ts`.
Falta la mitad inferior de la foto para saber qué recuadros lleva este formato.

## 5. Flujo completo

1. **Solicitud.** El responsable pide el fondo desde una pantalla propia que
   reutiliza el flujo de Solicitud de Fondos, con los campos de la sección
   4.bis. Se crea un `ExpenseReport type='viatico'` con
   `isSolicitudCajaChica: true` y la cadena armada con `buildCajaChicaChain`.
2. **Aprobación y pago.** Aprobadores del responsable, luego Contabilidad, luego
   Tesorería. Todo esto ya existe y no se toca.
3. **Fondeo.** Al registrar el pago de una solicitud con
   `isSolicitudCajaChica`, se crea el `FondoCajaChica` con
   `fundAmount = monto pagado`, movimiento `fondeo` y `status = active`.
4. **Carga de gastos.** El responsable crea una rendición de caja chica
   (`isCajaChica`, ya existe) y sube comprobantes. Por cada uno:
   - Centro de costo y OT opcionales.
   - Firma obligatoria.
   - Si `total > topeComprobante`, advertencia visible que no bloquea.
   - Si `total > disponible`, se bloquea: no se puede gastar lo que no hay.
   - Movimiento `cargo` en el fondo.
5. **Envío y aprobación.** Igual que la directa, con la cadena del punto 4.
   Rechazo idéntico al de directa: el comprobante vuelve a corrección.
6. **Reposición.** Aprobada la rendición y pasada por Contabilidad, entra a la
   cola de Tesorería. Al registrar el depósito se agrega el movimiento
   `reposicion` y el disponible vuelve al tope.

### Qué ve el aprobador

Todo el ciclo vive en `/rendiciones?tab=caja-chica`, no en "Solicitud de
Fondos": la pestaña Caja Chica dejó de ser exclusiva de Contabilidad y el
agrupador contable (`caja-chica-report`) pasó a ser una sub-vista dentro de
ella. La bandeja lista las solicitudes de fondo y las rendiciones de caja chica
de sus responsables.

La cadena se estampa en los comprobantes recién al ENVIAR la rendición
(`buildExpenseChains`), así que hasta ese momento no hay nada que enganchar por
cadena. Para que el aprobador no quede ciego mientras se consume el fondo que
autorizó, `findAllByCoordinator` suma las rendiciones de caja chica de los
responsables cuya cadena firma
(`ProjectService.findCajaChicaResponsibleIds`: sus niveles propios o, para quien
no tenga, el centro de costo principal, igual que `ownerOrProjectSource`).
Llegan en solo lectura: aprobar sigue siendo comprobante por comprobante desde
el detalle, igual que en una directa.

Contabilidad, Tesorería y los administradores ven la empresa completa: por eso
`findAllByClient` dejó de excluir `isCajaChica`, que era lo que les escondía la
rendición justo cuando les tocaba el gate.

## 6. Fases de implementación

Cada fase deja el sistema en un estado consistente y desplegable.

| Fase | Alcance | Depende de |
|---|---|---|
| 1 | HECHA (2026-08-17). Tope por comprobante: `Client.limits.topeComprobante`, DTO, pantalla de Configuración, marcado `superaTopeComprobante` al crear y editar comprobante, advertencia en el formulario y en la ficha del aprobador. Aplica a todos los tipos de rendición. | nada |
| 2 | HECHA (2026-08-17). `buildCajaChicaChain` + 8 tests en `approval-chain.util.spec.ts`. | nada |
| 3 | Backend HECHO (2026-08-17): entidad `FondoCajaChica`, módulo, servicio con los cuatro movimientos y 20 tests, endpoints. Falta la pantalla de saldo. | nada |
| 4 | HECHA (2026-08-17). Solicitud de fondo: flag `isSolicitudCajaChica` sobre un reporte `type: 'viatico'`, endpoint `POST /expense-report/solicitud-caja-chica`, pantalla `/mis-rendiciones/solicitud-caja-chica`, panel de bolsa en la pestaña Caja Chica y fondeo automático al registrar el pago. | 2, 3 |
| 5 | HECHA (2026-08-17). Cargo contra el presupuesto y tope de saldo en `addExpenseToReport` (con borrado del comprobante si no alcanza, y reverso al eliminarlo), `proyectId` opcional y `firmaUrl` obligatoria solo en caja chica. | 3 |
| 6 | HECHA (2026-08-17). Envío de la rendición, cadena por los aprobadores del responsable, entrada a la cola de Tesorería y reposición del presupuesto al registrar el pago. | 2, 3, 5 |

La fase 1 es independiente del resto y es la que el cliente puede ver antes.

## 6.bis Pruebas del ciclo (2026-08-18)

Tres scripts contra el backend local, en `viatika-back/scripts/`. Todos limpian
sus propios datos y se niegan a correr fuera de localhost.

| Script | Qué cubre |
|---|---|
| `probar-flujo-caja-chica.mjs` | Camino feliz completo: solicitud → aprobadores → Contabilidad → depósito → rendición con comprobantes → aprobación → reposición. |
| `probar-casos-borde-caja-chica.mjs` | 23 validaciones: firma, CC opcional, saldo, reversos, cambios de presupuesto, devolución del sobrante, visibilidad por rol. |
| `probar-tipos-y-bloqueos-caja-chica.mjs` | 14 casos: los cuatro tipos de comprobante y los puntos donde el aprobador o Contabilidad podrían trabarse (rechazos, borrados, comprobantes agregados después del envío, dos rendiciones en paralelo). |

`sembrar-caja-chica-demo.mjs` deja una rendición en cada etapa para revisar en
pantalla.

Bugs que encontraron y quedaron corregidos: el `select` de `update()` sin
`isCajaChica` (las cadenas salían por centro de costo), el cargo contra la caja
ajena, el presupuesto por debajo de lo gastado y la OT exigida a la planilla de
movilidad.

## 7. Puntos abiertos

0. **Validar o rechazar la devolución del sobrante.** Hoy se aplica al subir el
   comprobante, sin revisión de Tesorería. El cliente lo dejó pendiente el
   2026-08-18 para resolverlo junto con TODAS las devoluciones del sistema, que
   hoy funcionan distinto entre sí. Anotado en
   [deuda-tecnica.md](deuda-tecnica.md).


1. **Comprobante sin centro de costo.** RESUELTO (2026-08-18): se imputa al
   centro de costo del responsable, el mismo que quedó guardado en su primera
   solicitud de caja chica. Elegirlo por comprobante sigue siendo opcional para
   él; lo que ya no llega a Contabilidad es un gasto sin imputar.
   `ExpenseReportService.resolveCentroCostoCajaChica` lo resuelve desde la
   solicitud (para que no se mueva si mañana le cambian el centro de costo al
   colaborador) y cae al principal de su perfil como respaldo.
2. **Quién ve la advertencia de tope.** Se implementa visible tanto para quien
   sube el comprobante como para el aprobador. Confirmar que no molesta.
3. **Fondos por moneda.** Se asume un único fondo en soles por responsable. Si
   hiciera falta uno en dólares, el modelo lo soporta agregando `moneda`, pero
   no está contemplado.
4. **El tope global contra los topes por categoría de agosto.**
   [carga-inicial-detroit-2026-08.md](carga-inicial-detroit-2026-08.md) registra
   que el cliente había pedido alertas por comprobante con montos DISTINTOS por
   categoría (Alimentación LIMA 25, Alojamiento PROVINCIA 120) y lo dejó como
   desarrollo pendiente. Ahora pide un solo valor para todo. Se implementó el
   valor único, que es lo pedido; si vuelven los montos por categoría, el campo
   se replicaría en `Category` sin tocar el mecanismo de aviso.
5. **Segunda solicitud.** Si el cliente quisiera aumentar el fondo de 3000 a
   5000, hoy no hay camino. Se resolvería con una solicitud de ampliación que
   sube `fundAmount`. Fuera de alcance salvo indicación.
