# Avance por etapas — Viátika

**Referencia:** [PlanDesarrolloPorFases.md](./PlanDesarrolloPorFases.md) · [Funcionalidades.md](./Funcionalidades.md)

**Contraste código vs alcance (Fase 1):** [ContrasteFase1-AlcanceVsCodigo.md](./ContrasteFase1-AlcanceVsCodigo.md)

**Cómo usar:** Marcá con `[x]` lo terminado y `[ ]` lo pendiente. Actualizá la línea **Avance** de cada fase y la tabla resumen (porcentajes son manuales). Los ítems `[x]` pueden tener **deuda** respecto al PDF; el contraste lo detalla.

---

## Resumen por fase

| Fase | Nombre | Ítems listos | Total ítems | % |
|:----:|--------|:------------:|:-----------:|:-:|
| 1 | Configuración inicial | 4 | 6 | ~67% |
| 2 | Solicitud de viáticos | 2 | 2 | 100% |
| 3 | Aprobación de viáticos | 2 | 2 | 100% |
| 4 | Pago tesorería | 2 | 2 | 100% |
| 5 | Ingreso y validación de gastos | 11 | 11 | 100% |
| 6 | Reembolsos | 5 | 5 | 100% |
| 7 | Devolución de saldos | 0 | 4 | 0% |
| 8 | Cierre definitivo | 0 | 4 | 0% |
| 9 | Reembolso directo | 0 | 3 | 0% |
| 10 | Caja chica | 0 | 3 | 0% |
| T | Transversal / soporte | 0 | 6 | 0% |

**Total ítems:** 48 · **Avance global:** 26 / 48 → **~54%**

---

## Fase 1 — Configuración inicial

**Avance:** 4 / 6 → **~67%** (varios puntos del PDF siguen pendientes — ver contraste)

- [x] 1.1 CRUD centros de costo + unicidad de código *(pendiente respecto al doc: campo “nombre cliente” dedicado y formato de selector `[Código - Proyecto - Cliente]`)*
- [ ] 1.2 Carga masiva Excel centros de costo + duplicados + errores
- [x] 1.3 CRUD categorías + límites en datos *(pendiente: bloqueo por tope y alerta 90% al registrar gastos, según doc / Fase 5)*
- [ ] 1.4 Carga masiva usuarios + duplicados + primer login
- [x] 1.5 Gestión usuarios web + permisos por módulo *(pendiente respecto al doc: Excel masivo, coordinador, tipo contrato, filtros área/cargo/contrato)*
- [x] 1.6 Firma digital en perfil *(pendiente respecto al doc: carga archivo PNG/JPG 500KB y **guard** que bloquee lo transaccional sin firma)*

---

## Fase 2 — Solicitud de viáticos

**Avance:** 2 / 2 → **100%** *(formulario colaborador + correo/log backend; coordinador asignable en alta/edición usuario tipo Colaborador)*

- [x] Formulario solicitud (lugar, fechas, centro de costo, detalle categorías, totales) *(modal `app-solicitud-viaticos-modal`: Mis rendiciones + «Solicitar más viáticos» en detalle; Places si hay API key en `environment`; selector `[Código - Proyecto]` + cliente cuando el API lo devuelve)*
- [x] Notificación al coordinador al enviar + log de envío *(plantilla correo + `coordinatorNotification` en anticipo; requiere `coordinatorId` en el colaborador)*

---

## Fase 3 — Aprobación de viáticos

**Avance:** 2 / 2 → **100%** *(notificación contabilidad: usuarios Administrador del cliente + módulo `tesoreria`; urgencia si fecha inicio viaje es hoy o mañana; compromiso en campo `committedAdvanceTotal` del centro de costo hasta registrar pago)*

- [x] Rechazo con observación + notificación + re-edición con historial *(mín. 10 caracteres en `RejectAdvanceDto`; correo `viatico-rechazo-colaborador`; `PATCH /advance/:id/resubmit`; historial con acción `resubmitted`; UI Mis rendiciones + modal + tesorería “Historial”)*
- [x] Aprobación + notificación contabilidad (urgente si aplica) + compromiso presupuestal *(correo `viatico-aprobacion-contabilidad`; `committedAdvanceTotal` en proyecto; liberación al `register-payment`)*

---

## Fase 4 — Gestión de pago por tesorería

**Avance:** 2 / 2 → **100%**

- [x] Registro comprobante pago → estado Pagado + activación módulo gastos *(backend `register-payment` exige comprobante PDF/JPG/PNG (máx. 10MB), guarda metadata y cambia estado a `paid`; en Mis Rendiciones se muestra “En Progreso - Registrando Gastos” con acceso a “Registrar gastos” en la rendición vinculada)*
- [x] Notificación colaborador + coordinador con PDF y enlace *(correo `viatico-pago-realizado` al colaborador y su coordinador con monto, fecha, referencia y enlace directo al comprobante y a la plataforma)*

---

## Fase 5 — Ingreso y validación de gastos

**Avance:** 11 / 11 → **100%**

**Pruebas automatizadas (regresión Fase 5):** en `viatika-back`, `npm test` incluye `expense-report.service.spec.ts` (envío/aprobación final/declaración jurada) y `expense.service.spec.ts` (plazo de ingreso y límites 90%/100% por categoría). En `viatika`, `ng test` incluye `expense-reports.service.spec.ts` (`createAffidavit`).

- [x] UI gastos habilitada cuando Pagado + estado rendición en panel *(frontend: detalle de rendición solo habilita “Añadir gasto” cuando existe anticipo en estado `paid/settled`; si aún no hay pago, muestra aviso al colaborador. En panel “Mis Rendiciones” se muestra estado “EN PROGRESO - REGISTRANDO GASTOS” cuando la rendición `open` ya tiene anticipo pagado.)*
- [x] Factura: OCR + validación SUNAT + edición post-OCR *(flujo factura mantiene OCR + SUNAT; se añadió revisión post-OCR en la misma pantalla de carga para editar RUC/fecha/serie/correlativo antes de confirmar guardado, y luego ejecutar validación SUNAT con datos corregidos.)*
- [x] Planilla movilidad: GPS, correlativo, PDF *(GPS y distancia ya operativos en formulario. Se añadió correlativo interno por usuario en backend (`internalCode`, formato iniciales+secuencia) al crear planilla de movilidad y descarga de PDF específico de planilla desde el detalle de comprobante.)*
- [x] Recibo de caja (OCR/manual + archivo obligatorio) *(se implementó flujo manual completo con archivo obligatorio: nuevo tipo `recibo_caja`, endpoint backend dedicado, validaciones de fecha no futura/monto > 0/archivo requerido, y formulario frontend para captura estructurada + adjunto.)*
- [x] Comprobante de caja: correlativo, PDF plantilla *(nuevo tipo `comprobante_caja` en backend/frontend, generación de correlativo por usuario (iniciales+secuencia), guardado del formulario interno y descarga PDF dedicada del comprobante desde el detalle de rendición.)*
- [x] Reglas plazo ingreso (normal / observado / bloqueo mes) *(backend: marca `observado` + detalle cuando supera 2 días dentro del mismo mes; bloquea guardado si supera 2 días y cambia de mes. Front: muestra badge/alerta “Observado” y mensaje en detalle de comprobante)*
- [x] Alertas y bloqueos límite categoría (90% / 100%) *(backend: valida contra `limit` de categoría acumulando gastos por rendición/categoría y bloquea al llegar a 100%; en 90% devuelve advertencia y % usado. Front: notificación warning al registrar gasto y visualización de alerta en ficha de comprobante)*
- [x] Revisión coordinador: listado, aprobar/rechazar, historial *(flujo de aprobación/rechazo por comprobante activo en detalle de rendición; backend ahora registra `reviewHistory` por ítem (acción, fecha, motivo) y frontend lo muestra en la ficha del comprobante para trazabilidad de revisiones)*
- [x] Cierre rendición colaborador → envío aprobación final *(backend: al pasar a `submitted` valida que exista al menos un gasto, que no haya comprobantes rechazados y que todos tengan archivo adjunto; frontend: deshabilita “Enviar rendición” y muestra guía cuando no cumple condiciones, evitando envíos inválidos antes del test)*
- [x] Aprobación final rendición coordinador + rechazo con observación *(backend: al aprobar rendición valida que todos los gastos estén en `approved`; si no, bloquea con mensaje explícito. Además se reforzó permiso por rol para impedir que colaborador apruebe/rechace/cierre rendiciones por API.)*
- [x] PDF rendición completa + declaración jurada contabilidad *(PDF de rendición ya disponible en detalle. Se agregó flujo de Declaración Jurada para Admin/Contabilidad: modal para seleccionar tipo y comprobantes, endpoint backend `POST /expense-report/:id/affidavit` con validación de rendición cerrada + registro en historial/auditoría, y descarga de PDF de DJ desde frontend.)*

---

## Fase 6 — Reembolsos

**Avance:** 5 / 5 → **100%**

- [x] Cálculo saldo a favor colaborador + activación flujo *(al aprobar la rendición final, `AdvanceService.liquidateExpenseReport` consolida anticipos pagados vs gastos aprobados, actualiza `settlement` en la rendición y marca anticipos como liquidados; equivale a liquidación manual por anticipo pero alineada al cierre de rendición según Funcionalidades §6.1)*  
- [x] Notificación a contabilidad con enlace *(correo `rendicion-reembolso-contabilidad.hbs` a destinatarios `findViaticoAccountingNotifyRecipients`; asunto y cuerpo alineados al texto tipo Funcionalidades §6.1 paso 2 — rendición identificada, monto y colaborador; enlace al detalle; flag `reimbursementAccountingNotifiedAt` para evitar reenvíos)*  
- [x] Registro pago reembolso + comprobante *(endpoint `PATCH /expense-report/:id/register-reimbursement-payment`, validación PDF/JPG/PNG máx. 10MB como en pago de anticipo; UI en Tesorería — tabla «Reembolsos pendientes» + modal; API valida que la rendición y el listado de pendientes correspondan al `clientId` del JWT salvo `SUPER_ADMIN`)*  
- [x] Estado Reembolsado + notificación con PDF a colaborador *(estado `reimbursed`, correo `rendicion-reembolso-pagado.hbs` con adjunto del comprobante a colaborador y coordinador; notificación in-app)*  
- [x] Documentos disponibles en “Mis documentos” *(ruta `/mis-documentos` colaborador; `GET /expense-report/documents/my` agrupa comprobantes de pago de viático y de reembolso; rechazo 400 si la sesión no tiene cliente Mongo válido)*  

---

## Fase 7 — Devolución de saldos

**Avance:** 0 / 4 → **0%**

- [ ] Detección saldo a favor empresa + notificación con datos bancarios
- [ ] Carga comprobante por colaborador
- [ ] Validación contabilidad
- [ ] Estado Devolución completada + notificaciones finales

---

## Fase 8 — Cierre definitivo

**Avance:** 0 / 4 → **0%**

- [ ] Botón cierre solo contabilidad + condiciones (aprobada + liquidada)
- [ ] Validaciones pre-cierre (comprobantes, liquidación, observaciones)
- [ ] Estado Cerrado + bloqueo ediciones + logs
- [ ] Firma en PDFs definitivos + marca auditoría

---

## Fase 9 — Reembolso directo

**Avance:** 0 / 3 → **0%**

- [ ] Coordinador: alta reembolso directo (datos + urgencia)
- [ ] Notificaciones colaborador y contabilidad
- [ ] Flujo gastos y posteriores alineado a Fase 5

---

## Fase 10 — Caja chica

**Avance:** 0 / 3 → **0%**

- [ ] Apertura/fondeo mensual + habilitación gastos caja chica por centro
- [ ] Registro gastos sin aprobación por ítem + alertas fondo (sin bloqueo duro)
- [ ] Cierre mensual + PDF resumen + arrastre saldo al mes siguiente

---

## Transversal / soporte

**Avance:** 0 / 6 → **0%**

- [ ] Notificaciones y plantillas correo (§6.4, §7)
- [ ] API SUNAT + OCR con fallback / reintentos
- [ ] Geolocalización y distancias (§6.3)
- [ ] Correlativos + generación PDF (§6.5, §9)
- [ ] Reportes, dashboard, exportación (§8)
- [ ] Reglas de negocio RN aplicadas y probadas (§5)

---

## Notas

- Los porcentajes de la tabla **Resumen** y las líneas **Avance** hay que recalcularlos cuando cambien los checks (ej.: 3 de 6 → 50%).
- **Avance global** = suma de ítems con `[x]` / 48 (o excluí la fila Transversal si preferís medir solo fases 1–10: total 42).
