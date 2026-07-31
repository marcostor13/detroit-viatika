# Funcionalidades de la plataforma Viatika

## 1. Autenticación y multi-tenancy
- Login email/password, OAuth Google
- Multi-empresa: un mismo email puede pertenecer a varias empresas (clientId); roles Contabilidad/Administrador tienen "hub token" y selector de empresa (`/hub`)
- Cambio de contraseña forzado (`mustChangePassword`), reseteo de contraseña por admin
- JWT con roles, clientId, permisos y flag de cambio de contraseña obligatorio

## 2. Gestión de usuarios y permisos
- CRUD de usuarios (scope por cliente), activar/desactivar, borrado (soft/hard)
- Permisos granulares por usuario: módulos habilitados, `canApproveL1`/`canApproveL2`, categorías asignadas, centros de costo asignados (ordenados, el primero es el principal)
- Cadena de aprobadores configurable por usuario (`approverIds[]`, reemplaza al antiguo `coordinatorId` único)
- Importación masiva de usuarios vía Excel (plantilla descargable, genera contraseñas, resuelve coordinador por email)
- Autogestión: editar perfil/foto, cambiar contraseña, firma digital
- Listado ligero de colaboradores para selectores (ej. filas de planilla de movilidad)

## 3. Gestión de empresas (multi-tenant, Superadmin)
- CRUD de clientes/empresas (razón social, RUC, logo, contacto)
- Onboarding en un solo paso: crea empresa + usuario admin + config SUNAT
- Configuración de notificaciones por empresa (activar/desactivar, frecuencia semanal/mensual, día de aviso)
- Borrado de empresa en cascada (elimina usuarios)
- Panel `clients-admin`: edición inline, gestión de usuarios y credenciales SUNAT por empresa

## 4. Comprobantes / Gastos (Invoices)
- 4 tipos de comprobante: **factura**, **planilla de movilidad**, **recibo de caja**, **otros gastos** (con subtipos TK/BV/RC/DJ/OT)
- OCR + extracción con IA (OpenAI visión) desde imagen o PDF, con paso de revisión post-OCR
- Validación contra SUNAT (consulta RUC, validación de comprobante, credenciales por empresa, prueba de conexión)
- Detección de comprobantes duplicados, avisos de límite de categoría excedido
- Planilla de movilidad: filas dinámicas con origen/destino (Google Places), distancia auto-calculada, límite diario configurable, gasto de terceros
- Declaración Jurada (DJ): requiere firma digital guardada + checkbox de aceptación
- Aprobación dual por comprobante: Coordinador y Contabilidad (independientes), aprobación en lote por rendición
- Edición de desglose contable (base/IGV/tasa/inafecto) por Contabilidad antes de generar asientos
- Pipeline legado paralelo en módulo `invoice`: OCR con Tesseract.js, upload de acta de aceptación, workflow PENDING/APPROVED/REJECTED propio

## 5. Rendiciones (Expense Reports) — ciclo unificado
- Estados: `open → submitted → pending_accounting → approved/rejected → reimbursed → closed` (+ cancelación)
- **Rendición Directa**: iniciada por Contabilidad, con depósito adelantado opcional, cadena de aprobación propia por centro de costo
- **Caja Chica** (rendición): creación permisos-gated, listado de disponibles
- **Viáticos unificados**: viven en la misma entidad — solicitud, aprobación multinivel (L1/L2 + gate final de Contabilidad), reenvío tras rechazo, cancelación, registro de pago (parcial/múltiple), devolución de saldo (iniciar/subir comprobante/validar)
- Reembolso: pago de diferencia a favor del colaborador
- Liquidación automática: reembolso / devolución / equilibrado según anticipo vs gasto real
- Cierre definitivo con flujo de reapertura (directa o por solicitud+aprobación)
- Generación de Declaración Jurada (afidávit) para viáticos nacionales/viajes al exterior
- Vista previa de borrado con cascada (desvincula anticipos, actualiza cajas chicas)
- Exportación PDF (jsPDF) y Excel (ExcelJS) de la rendición completa, de planillas de movilidad y de recibos de caja individualmente

## 6. Viáticos/Anticipos (Advance) — flujo clásico paralelo
- Solicitud con líneas por categoría (personas, GLP/día, días, total)
- Cadena de aprobación dinámica por usuario (no solo umbral fijo)
- Aprobar/rechazar por nivel, reenvío, cancelación por el propio dueño
- Registro de pago (transferencia/efectivo/cheque) con OCR del comprobante
- Devolución de saldo no usado con validación por Contabilidad
- Reenvío manual de notificación al coordinador
- Vista de anticipos "huérfanos" (sin rendición vinculada)

## 7. Tesorería (pagos)
- Registro de pago de viáticos/anticipos (transferencia/efectivo), con OCR de comprobante que **detecta discordancia de titular/monto** (fuzzy matching)
- Registro de reembolsos a colaboradores
- Registro y validación de devoluciones de saldo (rechazo requiere motivo ≥50 caracteres)
- Pagos parciales con acumulador de saldo restante
- Creación de rendición directa con depósito adelantado
- Historial de aprobación por anticipo

## 8. Caja Chica (fondo de efectivo)
- **Petty-cash fund** (`petty-cash`, distinto de `caja-chica-report`): fondo por responsable/periodo, límites por gasto/día, categorías permitidas
- Ciclo: `pending_funding → active → closed`; fondeo con comprobante de transferencia
- Vinculación de gastos al fondo (descuenta saldo)
- **Caja-chica-report**: consolidación de varias rendiciones de caja chica en un reporte único para Contabilidad, con cierre ("finalize") que bloquea edición, exportación PDF/Excel con desglose por fila

## 9. Órdenes de trabajo
- CRUD con formato `LIM-{depto}-{correlativo}`, vinculadas a centro de costo
- Requeridas en planillas de movilidad, viáticos y rendiciones directas (formato ADF-FOR-005)

## 10. Centros de costo (proyectos)
- CRUD con mapeo contable (cuenta analítica 9x, cuenta destino 6x, centro/subcentro de costo, área, flag administrativo)
- Selección de aprobador por centro de costo
- Importación/exportación masiva vía Excel con plantilla

## 11. Categorías
- CRUD con cuenta contable, cuenta destino, límite de gasto, observaciones
- Importación masiva Excel, generación de plantilla (2 hojas: datos + instrucciones)
- **Perfiles de categoría**: agrupaciones nombradas para asignar permisos de categoría en bloque a usuarios

## 12. Líneas de negocio
- CRUD simple (código + nombre) para clasificación/reporting

## 13. Configuración
- Datos de empresa + logo
- Límite diario de movilidad
- Configuración de notificaciones (frecuencia/día)
- Configuración SUNAT (credenciales, RUC, activar, probar conexión)
- **Configuración contable**: cuentas fijas (42/79/14/46), tabla de tasas IGV con mapeo a cuenta 40, lista de cuentas bancarias de la empresa, palabras clave "inafecto", defaults de exportación Contanet (módulo, fuentes, moneda)

## 14. Contabilidad / asientos contables
- Generación de archivos de asiento contable formato **Contanet** por tipo (solicitud, compra, aplicación, devolución, reembolso)
- Clasificación de cargos no-IGV como deducibles/no deducibles vía **IA (DeepSeek)**, cacheada por hash
- Cálculo de desglose analítico (afecto/inafecto, multi-proyecto), resolución de tipo de cambio
- Caché de generación (invalidable)

## 15. Tipo de cambio
- Resolución PEN/USD por fecha: caché en BD → API externa (con 4 mirrors en carrera) → fallback a última tasa cacheada anterior

## 16. Dashboard y analítica
- KPIs animados: gasto total (+ delta vs periodo anterior), ticket promedio, montos aprobados/pendientes/rechazados, tasa de aprobación, anticipos solicitados/aprobados/pagados/pendientes, devoluciones pendientes, conteo de rendiciones
- Gráficos (Chart.js): gasto mensual vs anticipo, top categorías, top proyectos, gasto por estado, anticipos por estado, top colaboradores, top ubicaciones de viáticos
- **Mapa interactivo (Leaflet + Google Geocoding)** de destinos de viáticos en Perú, con pines por monto
- Filtros por fecha, proyecto, categoría, colaborador
- Módulo legado `consolidated-invoices` con su propio set de gráficos y CRUD rápido de categoría/proyecto (parcialmente reemplazado por `dashboard`)

## 17. IA
- **OCR/extracción de comprobantes** (OpenAI visión) desde imagen o PDF
- **Escaneo de comprobantes de depósito/transferencia** (monto, fecha, hora, N° operación, titular) — reusado en pagos, devoluciones, reembolsos, fondeo de caja chica
- **Chat asistente** con streaming (SSE) y tool-calling: consulta rendiciones, viáticos, aprobaciones pendientes, resumen de gastos del usuario
- **Clasificación de deducibilidad tributaria** (DeepSeek) para asientos contables
- Pipeline legado con Tesseract.js OCR + regex en módulo `invoice`

## 18. Firma digital
- Firma dibujada a mano (canvas) o subida como imagen
- Requerida para presentar comprobantes tipo Declaración Jurada

## 19. Notificaciones
- Centro de notificaciones in-app (leer una/todas, navegación por `actionUrl`)
- Más de 45 plantillas de email transaccional (Handlebars) cubriendo todo el ciclo de vida
- **Cron diario** (8am): recordatorios de fin de periodo de viático, recordatorios por inactividad en viáticos largos, digest semanal/urgente a coordinadores y Contabilidad de pendientes de aprobación
- Endpoint de prueba de notificaciones protegido por key

## 20. Auditoría
- Log inmutable de acciones (60+ tipos), filtrable por módulo y texto, scope por cliente
- Registrado desde casi todos los módulos en create/update/delete/approve

## 21. Almacenamiento de archivos
- S3: URL prefirmada para subida directa, subida server-side (10MB máx), borrado por key
- Usado para comprobantes, actas, firmas, fotos de perfil, logos, comprobantes de depósito

## 22. Exportación
- PDF (jsPDF + autotable) y Excel (ExcelJS) para: rendiciones completas, planillas de movilidad, recibos de caja, reportes de caja chica consolidados, listados de facturas/consolidado

## 23. Roles
- CRUD de roles (solo Superadmin), variantes para selectores de UI que incluyen entrada sintética de Superadmin

---

## Notas sobre inconsistencias detectadas en el código
- `mis-documentos` (módulo frontend) no tiene entrada de ruta activa en `app.routes.ts` — parece código huérfano/inalcanzable.
- El componente lista de `viaticos` (`ViaticosComponent`) tampoco está enrutado — su función está duplicada por la pestaña "Rendiciones" en `admin-users`/`rendiciones`.
- `consolidated-invoices` como vista principal fue reemplazado por `dashboard`; solo sus sub-rutas `add-category`/`add-project`/`charts` siguen en uso.
