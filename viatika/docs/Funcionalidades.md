# 📄 DOCUMENTO DE ALCANCE FUNCIONAL Y TÉCNICO - VIATIKA

**Plataforma de Gestión Integral de Viáticos y Gastos Operativos**

- **Versión:** 2.0
- **Fecha de Emisión:** 15/04/2026
- **Cliente:** TEMA LITOCLEAN SAC
- **Elaborado por:** Tecdidata SAC

---

## 📋 ÍNDICE DE CONTENIDOS

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Objetivos del Proyecto](#2-objetivos-del-proyecto)
3. [Roles, Perfiles y Matriz de Permisos](#3-roles-perfiles-y-matriz-de-permisos)
4. [Alcance Funcional Detallado por Fases](#4-alcance-funcional-detallado-por-fases)
5. [Reglas de Negocio y Validaciones del Sistema](#5-reglas-de-negocio-y-validaciones-del-sistema)
6. [Integraciones Técnicas y Automatizaciones](#6-integraciones-técnicas-y-automatizaciones)
7. [Sistema de Notificaciones y Comunicación](#7-sistema-de-notificaciones-y-comunicación)
8. [Reportes, Dashboard y Exportación de Datos](#8-reportes-dashboard-y-exportación-de-datos)
9. [Plantillas de Documentos y Formatos de Salida](#9-plantillas-de-documentos-y-formatos-de-salida)
10. [Criterios de Aceptación y Condiciones de Entrega](#10-criterios-de-aceptación-y-condiciones-de-entrega)
11. [Supuestos, Dependencias y Exclusiones](#11-supuestos-dependencias-y-exclusiones)
12. [Anexos](#12-anexos)

---

## 1. RESUMEN EJECUTIVO

La presente plataforma web tiene como propósito centralizar, automatizar y auditar el **ciclo completo de gestión de viáticos y gastos operativos** de la organización. El sistema cubrirá desde la configuración inicial de centros de costo y usuarios, pasando por la solicitud, aprobación y desembolso de fondos, hasta el registro validado de gastos, liquidación final y generación de reportes tributarios.

### Beneficios Clave

- ✅ Cumplimiento normativo SUNAT mediante validación automática de comprobantes
- ✅ Trazabilidad financiera completa con auditoría de cada transacción
- ✅ Reducción de carga administrativa mediante automatización de flujos
- ✅ Control presupuestal en tiempo real con alertas preventivas
- ✅ Experiencia de usuario optimizada con geolocalización, OCR y firma digital

---

## 2. OBJETIVOS DEL PROYECTO

### 2.1 Objetivo General

Desarrollar e implementar una plataforma web integral que gestione de forma centralizada, segura y auditable todo el proceso de viáticos y gastos operativos, garantizando cumplimiento tributario, control presupuestal y eficiencia operativa.

### 2.2 Objetivos Específicos

| ID | Objetivo | Métrica de Éxito |
|---|---|---|
| OBJ-01 | Digitalizar el 100% del flujo de solicitud-aprobación-pago-rendición | Eliminación de procesos en papel |
| OBJ-02 | Validar automáticamente comprobantes tributarios con SUNAT | ≥95% de validaciones exitosas en tiempo real |
| OBJ-03 | Implementar control presupuestal por categoría con alertas preventivas | Alertas activadas al 90% del límite |
| OBJ-04 | Garantizar trazabilidad completa mediante logs de auditoría | Registro de cada acción de usuario |
| OBJ-05 | Facilitar la generación de reportes ejecutivos y tributarios | Exportación en PDF/Excel con filtros de fecha |
| OBJ-06 | Integrar firma digital para todos los documentos descargables | Firma aplicada automáticamente al cerrar rendición |

---

## 3. ROLES, PERFILES Y MATRIZ DE PERMISOS

### 3.1 Roles del Sistema

| Rol | Descripción | Acceso Principal |
|---|---|---|
| **Administrador / Contabilidad** | Usuario con permisos globales para configuración, validación tributaria, cierre de rendiciones, generación de declaraciones juradas y reportes financieros. | Configuración, Usuarios, Centros de Costo, Categorías, Validación SUNAT, Cierre, Reportes |
| **Coordinador / Aprobador** | Responsable de revisar y aprobar/rechazar solicitudes de viáticos y gastos individuales. Supervisa en tiempo real el avance de rendiciones de su equipo. | Aprobación de Solicitudes, Revisión de Gastos, Ampliación de Plazos, Dashboard de Equipo |
| **Colaborador / Empleado** | Usuario final que solicita viáticos, registra gastos, sube comprobantes, gestiona reembolsos/devoluciones y descarga documentos firmados. | Solicitud de Viáticos, Registro de Gastos, Panel Personal, Mis Documentos |

### 3.2 Matriz de Permisos Granulares

Los permisos se configuran por usuario mediante selección de módulos y acciones específicas:

| Módulo | Funcionalidad | Admin | Coordinador | Colaborador |
|---|---|:---:|:---:|:---:|
| **Configuración** | CRUD Centros de Costo | ✅ | ❌ | ❌ |
|  | Carga Masiva Excel | ✅ | ❌ | ❌ |
|  | CRUD Categorías + Límites | ✅ | ❌ | ❌ |
|  | Gestión de Usuarios | ✅ | ❌ | ❌ |
| **Solicitudes** | Crear Solicitud de Viáticos | ❌ | ❌ | ✅ |
|  | Aprobar/Rechazar Solicitud | ✅ | ✅ | ❌ |
|  | Ver Historial de Solicitudes | ✅ | ✅ (su equipo) | ✅ (propias) |
| **Gastos** | Registrar Comprobantes | ❌ | ❌ | ✅ |
|  | Aprobar/Rechazar Gasto Individual | ✅ | ✅ | ❌ |
|  | Editar Gasto Observado | ❌ | ❌ | ✅ |
| **Liquidación** | Cerrar Rendición | ✅ | ❌ | ✅ (enviar) |
|  | Gestionar Reembolsos/Devoluciones | ✅ | ❌ | ✅ (subir comprobante) |
| **Reportes** | Generar Declaración Jurada | ✅ | ❌ | ❌ |
|  | Exportar Reportes PDF/Excel | ✅ | ✅ | ✅ (propios) |
|  | Dashboard con Filtros | ✅ | ✅ | ✅ |
| **Perfil** | Registrar Firma Digital | ✅ | ✅ | ✅ |
|  | Gestionar Datos Personales | ✅ | ✅ | ✅ |

### 3.3 Requisito Obligatorio: Firma Digital

- **Condición de Acceso:** Ningún usuario podrá operar funcionalidades transaccionales (solicitar, aprobar, registrar gastos, cerrar rendición) sin haber registrado previamente su firma digital en su perfil.
- **Aplicación:** La firma se incrusta automáticamente en todos los documentos descargables **únicamente cuando la rendición está en estado "Cerrado"**.

---

## 4. ALCANCE FUNCIONAL DETALLADO POR FASES

### 🔹 FASE 1: CONFIGURACIÓN INICIAL

#### 1.1 Gestión de Centros de Costo

| Funcionalidad | Detalle Técnico |
|---|---|
| **CRUD Completo** | Crear, Editar, Eliminar centros de costo desde interfaz web |
| **Campos Obligatorios** | Código (único), Nombre del Proyecto, Nombre del Cliente |
| **Formato de Visualización** | En selectores: [Código - Nombre Proyecto - Nombre Cliente] |
| **Validación de Unicidad** | El sistema rechaza códigos duplicados al crear/editar |

#### 1.2 Carga Masiva de Centros de Costo

| Funcionalidad | Detalle Técnico |
|---|---|
| **Formato de Importación** | Archivo Excel (.xlsx) con plantilla corporativa predefinida |
| **Columnas Requeridas** | Código, Nombre Proyecto, Nombre Cliente |
| **Validación de Duplicados** | Al re-subir archivo: detecta códigos existentes, muestra reporte de errores con lista de registros duplicados |
| **Flujo de Corrección** | Usuario puede eliminar registros duplicados desde el reporte y volver a subir solo los nuevos |
| **Confirmación** | Mensaje de éxito con cantidad de registros importados correctamente |

#### 1.3 Administración de Categorías de Gasto

| Funcionalidad | Detalle Técnico |
|---|---|
| **CRUD Categorías** | Agregar, Editar, Eliminar categorías de gasto (Alimentación, Hospedaje, Movilidad, etc.) |
| **Propiedad "Límite"** | Campo numérico en soles que define el monto máximo permitido por categoría |
| **Regla de Validación** | Si Límite = S/400.00 → sistema bloquea gastos ≥ S/400.00 (máximo permitido: S/399.99) |
| **Alerta Preventiva** | Al alcanzar 90% del límite: muestra alerta 🟡 *"Próximo al límite. Solicite ampliación de presupuesto"* |

#### 1.4 Carga Masiva de Usuarios

| Funcionalidad | Detalle Técnico |
|---|---|
| **Plantilla Excel** | Archivo con columnas: Nombres, Apellidos, Teléfono, Tipo Doc, N° Doc, Área, Cargo, Banco, N° Cuenta, CCI, Email, Contraseña Temporal, Tipo Contrato, Coordinador (opcional) |
| **Tipos de Contrato** | Selector: Planilla / Externo |
| **Asignación de Coordinador** | Campo opcional con selector de usuarios ya creados en el sistema |
| **Validación de Duplicados** | Detecta usuarios existentes por N° de Documento o Email, muestra reporte de errores |
| **Contraseña Temporal** | Generada automáticamente o ingresada manualmente; obliga cambio en primer login |

#### 1.5 Gestión de Usuarios y Permisos (Interfaz Web)

| Funcionalidad | Detalle Técnico |
|---|---|
| **CRUD Usuarios** | Crear, Editar, Desactivar usuarios desde interfaz administrativa |
| **Configuración de Permisos** | Interfaz de checkboxes para seleccionar módulos y acciones accesibles por usuario |
| **Campos de Usuario** | Todos los listados en 1.4, más: Fecha de Creación, Estado (Activo/Inactivo), Último Acceso |
| **Búsqueda y Filtros** | Filtro por Área, Cargo, Tipo de Contrato, Estado |

#### 1.6 Registro de Firma Digital

| Funcionalidad | Detalle Técnico |
|---|---|
| **Carga de Firma** | Usuario sube imagen de firma (.png, .jpg) desde su perfil personal |
| **Validación de Formato** | Imagen máxima 500KB, dimensiones recomendadas 400x150px, fondo transparente preferible |
| **Almacenamiento Seguro** | Firma encriptada y vinculada exclusivamente al usuario propietario |
| **Bloqueo Funcional** | Sistema impide operar módulos transaccionales hasta registrar firma |

---

### 🔹 FASE 2: SOLICITUD DE VIÁTICOS

#### 2.1 Formulario de Solicitud (Colaborador)

| Campo | Tipo | Validación/Funcionalidad |
|---|---|---|
| **Lugar** | Texto con autocompletado | Integración con API de geolocalización (Google Places o similar) para sugerir direcciones |
| **Fecha Inicio - Fecha Fin** | Datepicker | Fecha fin ≥ fecha inicio; no permitir fechas pasadas sin justificación |
| **Centro de Costo** | Selector | Muestra formato [Código - Proyecto - Cliente]; filtra por centros activos |
| **Detalle de Viáticos** | Tabla dinámica | Filas con: Categoría (selector), Importe (numérico), Cantidad Personas, GLP/día, Días, Total Fila (calculado) |
| **Total General** | Campo calculado | Suma automática de todos los totales por fila; no editable manualmente |
| **Observaciones** | TextArea (opcional) | Campo libre para justificaciones adicionales |

#### 2.2 Notificación Automática al Coordinador

| Elemento | Contenido |
|---|---|
| **Destinatario** | Coordinador asignado al colaborador en su perfil de usuario |
| **Asunto** | Nueva solicitud de viáticos, [N° Centro de Costo - Nombre del Proyecto] |
| **Cuerpo del Mensaje** | Estimado/a [Nombre Coordinador]. El colaborador [Nombre Colaborador] ha enviado una nueva solicitud de viáticos. Revisar solicitud en la plataforma. Detalles rápidos: Lugar: [Lugar], Fechas: [Inicio] al [Fin], Monto Total: S/ [Monto] |
| **Datos Adjuntos** | Resumen en texto plano de la solicitud (no adjunta archivo) |
| **Registro de Envío** | Log interno con fecha/hora, estado de entrega, y link de reenvío manual si falla |

---

### 🔹 FASE 3: APROBACIÓN DE VIÁTICOS

#### 3.1 Rechazo de Solicitud (Aprobador)

| Paso | Acción del Sistema |
|---|---|
| 1. Aprobador selecciona "Rechazar" | Abre modal para ingresar observación obligatoria (mín. 10 caracteres) |
| 2. Confirma rechazo | Cambia estado de solicitud a "Rechazada" y registra: usuario, fecha, observación |
| 3. Notificación al Colaborador | **Asunto:** Rechazo de solicitud de viáticos - [N° Centro de Costo]. **Cuerpo:** Mensaje con observación completa + link para revisar/editar solicitud |
| 4. Re-edición Permitida | Colaborador puede modificar solicitud y reenviar (genera nueva versión con historial) |

#### 3.2 Aprobación de Solicitud (Aprobador)

| Paso | Acción del Sistema |
|---|---|
| 1. Aprobador selecciona "Aprobar" | Cambia estado a "Aprobada" y registra: usuario, fecha, hora |
| 2. Notificación a Contabilidad | **Destinatarios:** Usuarios con permiso "Contabilidad" activado. **Regla de Prioridad:** Si fecha inicio del viaje = HOY o MAÑANA → etiqueta 🟥 URGENTE en asunto y cuerpo. **Asunto:** [🔴 URGENTE] Solicitud aprobada - [N° Centro de Costo] (si aplica). **Cuerpo:** Detalle completo: colaborador, aprobador, lugar, fechas, centro de costo, desglose por categoría, monto total |
| 3. Registro de Compromiso Presupuestal | Sistema reserva el monto aprobado en el presupuesto del centro de costo seleccionado |

> **Nota de Consistencia:** Todas las notificaciones (aprobación/rechazo) incluyen obligatoriamente: nombre completo, documento, área y cargo del colaborador solicitante. En aprobaciones, adicionalmente se incluyen datos del aprobador.

---

### 🔹 FASE 4: GESTIÓN DE PAGO POR TESORERÍA

#### 4.1 Registro de Comprobante de Pago (Contabilidad)

| Funcionalidad | Detalle Técnico |
|---|---|
| **Acceso** | Exclusivo para usuarios con permiso "Contabilidad" |
| **Carga de Comprobante** | Subida de archivo (.pdf, .jpg, .png) del depósito bancario realizado (proceso externo) |
| **Validación de Archivo** | Tamaño máximo 10MB, formatos permitidos: PDF, JPG, PNG |
| **Confirmación de Pago** | Botón "Enviar aprobación de viáticos" que: (1) cambia estado a "Pagado", (2) registra comprobante, (3) activa módulo de gastos para el colaborador |

#### 4.2 Notificación de Pago Realizado

| Destinatarios | Contenido |
|---|---|
| **Colaborador** y **Coordinador** | **Asunto:** Viáticos aprobados y pagados - [N° Centro de Costo]. **Adjunto:** PDF del comprobante de pago cargado por contabilidad. **Cuerpo:** Confirmación de pago + link directo para registrar gastos en plataforma. **Datos:** Monto pagado, fecha de depósito, referencia bancaria |

#### 4.3 Activación de Módulo de Gastos

| Condición | Acción del Sistema |
|---|---|
| Solicitud en estado "Pagado" | Habilita automáticamente en la cuenta del colaborador: botón "Registrar Gastos", acceso a formularios de Factura, Movilidad, Recibo de Caja, Comprobante de Caja |
| Visualización | En dashboard del colaborador: la rendición aparece con estado "En Progreso - Registrando Gastos" |

---

### 🔹 FASE 5: INGRESO Y VALIDACIÓN DE GASTOS

#### 5.1 Registro de Comprobantes de Gasto (Colaborador)

##### a) Factura Electrónica

| Funcionalidad | Detalle Técnico |
|---|---|
| **Captura con Foto** | Cámara integrada o subida de imagen; OCR extrae: RUC emisor, fecha emisión, monto total, número de comprobante |
| **Carga como Archivo** | Opción alternativa: subir PDF/JPG de factura; mismo proceso de extracción OCR |
| **Validación SUNAT (API)** | Sistema consulta en tiempo real: (1) Vigencia del RUC emisor, (2) Que la factura esté emitida a razón social/RUC de la empresa, (3) Que no esté anulada |
| **Flujo de Validación** | ✅ Válida y emitida a empresa → Guarda datos y registra gasto. ❌ No válida o no emitida a empresa → Rechaza con mensaje específico: *"La factura no fue emitida a [Empresa]. Verifique el RUC o contacte al proveedor"* |
| **Edición Post-OCR** | Campos extraídos son editables por el colaborador antes de guardar (por si el OCR comete error) |

##### b) Planilla de Movilidad

| Campo del Formulario | Tipo/Funcionalidad |
|---|---|
| **Fecha** | Datepicker (no permitir fechas futuras) |
| **Cliente/Proveedor** | Texto libre con autocompletado desde base de datos de terceros |
| **Proyecto** | Selector de Centros de Costo activos |
| **Lugar Inicio / Fin** | Autocompletado con GPS + almacenamiento de coordenadas (lat/long) para cálculo de distancia |
| **Gestión** | TextArea para descripción detallada de la actividad |
| **Total por Fila** | Numérico, calculado o ingresado manualmente |
| **Total General** | Suma automática de todas las filas |
| **Lugar de Generación** | Autocompletado con GPS o selección manual |

**Elementos del Comprobante Descargable (PDF):**

- ✅ Razón Social y RUC de TEMA LITOCLEAN SAC
- ✅ Nombre completo y DNI del colaborador
- ✅ Número correlativo: [Iniciales][001] (ej: JSC001, generado por usuario, secuencial)
- ✅ Detalle completo del formulario ingresado
- ✅ Firma digital del colaborador (incrustada)
- ✅ Lugar y fecha de generación (fecha del día)
- ✅ Pie de página corporativo: dirección, teléfono, web, email

##### c) Recibo de Caja

| Funcionalidad | Detalle Técnico |
|---|---|
| **Captura con Foto** | OCR extrae: Razón Social, RUC, Fecha, Concepto, N° Documento, Monto Total |
| **Ingreso Manual** | Formulario alternativo para digitar datos; **obligatorio** adjuntar foto/archivo del comprobante físico |
| **Edición Post-OCR** | Todos los campos extraídos son editables antes de guardar |
| **Almacenamiento** | Siempre se guarda: (1) imagen/archivo original, (2) datos estructurados en BD |
| **Validación Básica** | Fecha del comprobante no puede ser futura; monto > 0 |

##### d) Comprobante de Caja (Formulario Interno)

| Campo | Detalle |
|---|---|
| **Entregado a** | Nombre completo del beneficiario |
| **Dirección** | Dirección del beneficiario (opcional) |
| **Concepto** | Descripción del gasto (texto libre) |
| **Monto** | Numérico en soles, con formato S/ X,XXX.XX |
| **Proyecto** | Selector de Centro de Costo |
| **Código Generado** | [Iniciales Colaborador][Correlativo] ej: KAG001, KAG002... (correlativo por usuario, no global) |
| **Firma Digital** | Automática, incrustada al generar PDF |
| **Fecha** | Automática: fecha del día de generación |
| **Formato de Salida** | PDF idéntico a plantilla COMPROBANTE DE CAJA (1).XLSX proporcionada |

##### e) Declaración Jurada (Exclusivo Contabilidad)

| Paso | Acción |
|---|---|
| 1. Selección de Tipo | Dropdown: Viajes al Exterior / Viáticos Nacionales |
| 2. Vinculación de Comprobantes | Checkbox para seleccionar Comprobantes de Caja registrados en la rendición a declarar |
| 3. Generación de PDF | Sistema arma documento en formato oficial SUNAT/empresa, con: datos de la empresa, colaborador, detalle de gastos seleccionados, monto total, fecha |
| 4. Firma Automática | Incrusta firma digital del colaborador (requiere rendición en estado "Cerrado") |
| 5. Descarga y Auditoría | PDF descargable + registro en log de quién generó, cuándo y qué comprobantes incluyó |

#### 5.2 Regla de Negocio: Plazo de Ingreso de Comprobantes

| Escenario | Comportamiento del Sistema |
|---|---|
| **Diferencia ≤ 2 días** (emisión vs. carga) | ✅ Permite carga normal, sin observaciones |
| **Diferencia > 2 días, MISMO mes** | ⚠️ Muestra alerta: *"Comprobante fuera de plazo (más de 2 días). Se registrará como OBSERVADO."* ✅ Permite continuar; registro se marca con flag `observado = true` |
| **Diferencia > 2 días, MES DIFERENTE** | 🚫 **BLOQUEO TOTAL**: *"No se permite cargar comprobantes de meses anteriores con más de 2 días de retraso. Contacte a Contabilidad."* ❌ No permite guardar; requiere intervención de administrador |

**Ejemplos:**

- ✅ 26/Abr → 30/Abr (4 días, mismo mes): Se carga como **Observado**
- 🚫 28/Abr → 01/May (3 días, cambio de mes): **Bloqueado**
- ✅ 01/May → 02/May (1 día): Carga normal

#### 5.3 Regla de Negocio: Alerta de Límite de Categoría

| Condición | Acción del Sistema |
|---|---|
| Al registrar un gasto, el sistema calcula: `(Total gastado en categoría / Límite asignado) * 100` | — |
| Si resultado ≥ 90% | 🟡 Muestra modal no bloqueante: *"⚠️ Ha utilizado el 90% del presupuesto para [Categoría]. Si requiere más fondos, solicite una **ampliación de presupuesto** antes de continuar."* |
| Si resultado ≥ 100% | 🔴 Muestra modal bloqueante: *"❌ Límite de categoría [Categoría] alcanzado. No se permiten más gastos en esta categoría. Solicite ampliación de presupuesto."* |

#### 5.4 Revisión de Gastos por Coordinador (En Tiempo Real)

| Funcionalidad | Detalle |
|---|---|
| **Dashboard de Gastos Pendientes** | Lista de todos los gastos registrados por colaboradores a su cargo, filtrable por fecha, categoría, estado |
| **Acciones por Gasto** | Botones: Aprobar / Rechazar / Ver Detalle |
| **Rechazo de Gasto** | Modal con campo obligatorio "Motivo de rechazo"; al guardar: notifica al colaborador, habilita edición del gasto |
| **Aprobación de Gasto** | Cambia estado a "Aprobado"; bloquea edición para el colaborador; suma al total aprobado de la rendición |
| **Historial de Revisiones** | Log visible: quién aprobó/rechazó, cuándo, y observaciones si aplica |

#### 5.5 Cierre de Rendición (Colaborador)

| Condición | Acción |
|---|---|
| Colaborador ha registrado todos sus gastos | Botón "Cerrar y Enviar Rendición" habilitado |
| Al hacer clic | Sistema valida: (1) Todos los gastos tienen comprobante adjunto, (2) No hay gastos en estado "Rechazado" sin re-edición; si pasa validación: cambia estado a "Enviada para Aprobación Final" y notifica al coordinador |

#### 5.6 Aprobación Final de Rendición Completa (Coordinador)

| Regla de Negocio | Implementación |
|---|---|
| **Condición para Aprobar** | Sistema verifica que **todos** los gastos individuales de la rendición estén en estado "Aprobado". Si hay alguno "Pendiente" o "Rechazado", deshabilita botón "Aprobar Rendición" y muestra mensaje: *"Apruebe todos los gastos individuales para habilitar la aprobación final"* |
| **Aprobación** | Cambia estado de rendición a "Aprobada"; notifica a Contabilidad para liquidación |
| **Rechazo de Rendición** | Modal con observación general; notifica al colaborador; habilita re-edición de gastos observados |

#### 5.7 Descarga de Rendición Completa (PDF)

| Contenido del PDF | Detalle |
|---|---|
| **Encabezado** | Logo empresa, título "RENDICIÓN DE VIÁTICOS", N° de rendición (correlativo interno) |
| **Datos del Colaborador** | Nombre completo, DNI, Área, Cargo, Banco, Cuenta, CCI |
| **Datos del Viaje** | Lugar, Fechas (inicio-fin), Centro de Costo [Código - Proyecto - Cliente] |
| **Tabla de Gastos** | Columnas: Ítem, Fecha Emisión, Tipo de Documento, N° Comprobante, Concepto, Categoría, Monto, Estado (Aprobado/Observado) |
| **Resumen Financiero** | Total Viáticos Aprobados, Total Gastos Registrados, Saldo (a favor de colaborador/empresa) |
| **Firma Digital** | Incrustada automáticamente **solo si estado = "Cerrado"** |
| **Pie de Página** | Fecha de generación, usuario que descargó, hash de integridad del documento |

#### 5.8 Ampliación de Plazo de Rendición (Coordinador)

| Condición | Acción |
|---|---|
| Rendición en estado "En Progreso - Registrando Gastos" | Coordinador ve botón "Ampliar Plazo" en detalle de rendición |
| Al hacer clic | Modal para ingresar nueva fecha límite (debe ser ≥ fecha actual); al guardar: actualiza fecha en sistema, notifica al colaborador: *"Su plazo para registrar gastos ha sido ampliado hasta [Nueva Fecha]"* |

#### 5.9 Solicitud de Ampliación de Presupuesto (Colaborador)

| Flujo | Detalle |
|---|---|
| **Origen** | Desde dashboard de rendición en progreso, botón "Solicitar Ampliación de Presupuesto" |
| **Formulario** | Similar a Fase 2: selecciona categorías a ampliar, justifica motivo, ingresa monto adicional por categoría |
| **Vinculación** | Sistema genera nueva solicitud con campo `solicitud_raiz_id = [ID de solicitud original]` |
| **Aprobación** | Sigue flujo estándar Fases 2→3→4 (notificación a coordinador, aprobación, pago) |
| **Consolidación en Reporte Final** | Al descargar rendición completa (5.7), el sistema suma automáticamente: Monto Solicitud Original + Monto Ampliación Aprobada |

#### 5.10 Panel Principal del Colaborador (Dashboard)

| Elemento | Detalle |
|---|---|
| **Listado de Rendiciones** | Tabla ordenada por fecha de creación (más reciente primero) |
| **Columnas por Rendición** | N° Rendición, Lugar, Fechas, Centro de Costo, Estado (Borrador/Enviada/Aprobada/Cerrada), Saldo Consolidado, N° Documentos Registrados |
| **Accesos Rápidos** | Botones: + Nueva Solicitud, Ampliar Presupuesto, Subir Comprobante, Descargar Documentos |
| **Indicadores Visuales** | Badges de estado con colores: 🟡 Borrador, 🔵 En Revisión, 🟢 Aprobada, ⚫ Cerrada, 🔴 Rechazada |
| **Filtros** | Por estado, por rango de fechas, por centro de costo |

---

### 🔹 FASE 6: REEMBOLSOS (Saldo a favor del colaborador)

#### 6.1 Proceso de Reembolso

| Paso | Actor | Acción del Sistema |
|---|---|---|
| 1. Liquidación con saldo positivo | Sistema | Calcula: Total Gastos Aprobados - Anticipo Recibido = Saldo a Reembolsar; si > 0, activa flujo de reembolso |
| 2. Notificación a Contabilidad | Sistema | Envía correo: *"Rendición [N°] requiere reembolso de S/ [Monto] a [Colaborador]"* con link a plataforma |
| 3. Registro de Pago | Contabilidad | Sube comprobante de transferencia/depósito realizado (externo) |
| 4. Confirmación y Notificación | Sistema | Cambia estado de rendición a "Reembolsado"; notifica al colaborador con PDF del comprobante adjunto; habilita descarga en "Mis Documentos" |

---

### 🔹 FASE 7: DEVOLUCIÓN DE SALDOS (Saldo a favor de la empresa)

#### 7.1 Proceso de Devolución

| Paso | Actor | Acción del Sistema |
|---|---|---|
| 1. Liquidación con saldo negativo | Sistema | Calcula: Anticipo Recibido - Total Gastos Aprobados = Saldo a Devolver; si > 0, activa flujo de devolución |
| 2. Notificación de Cobro | Sistema | Envía correo al colaborador: *"Rendición [N°] tiene saldo a devolver de S/ [Monto]. Datos de cuenta: [Banco, N° Cuenta, CCI, Titular]"* |
| 3. Carga de Comprobante | Colaborador | Sube comprobante de transferencia/depósito realizado a cuenta de la empresa |
| 4. Validación y Cierre | Contabilidad | Revisa comprobante; si conforme, cambia estado a "Devolución Completada"; sistema notifica confirmación a todas las partes |

---

### 🔹 FASE 8: CIERRE DEFINITIVO

#### 8.1 Cierre de Rendición (Contabilidad)

| Funcionalidad | Detalle Técnico |
|---|---|
| **Botón de Cierre** | Exclusivo para usuarios con permiso "Contabilidad"; visible solo cuando rendición está "Aprobada" y liquidada (reembolso/devolución completada) |
| **Validación Pre-Cierre** | Sistema verifica: (1) Todos los gastos tienen comprobante válido, (2) Liquidación financiera resuelta, (3) No hay observaciones pendientes |
| **Acción de Cierre** | Cambia estado a **"Cerrado"**; bloquea **todas** las ediciones posteriores (gastos, montos, documentos); registra en log: usuario, fecha, hora, IP |
| **Efecto en Documentos** | Habilita la inclusión de firma digital en PDFs descargables; marca documentos como "Definitivos para Auditoría" |

---

### 🔹 FASE 9: REEMBOLSO DIRECTO (Gastos sin Solicitud Previa)

#### 9.1 Creación y Autorización (Coordinador)

| Escenario | Flujo |
|---|---|
| Colaborador incurre en gasto operativo urgente sin viático solicitado | Coordinador accede a módulo "Reembolsos Directos" → Botón "Crear Reembolso" |
| **Formulario de Reembolso** | Selecciona colaborador, ingresa: concepto, monto estimado, centro de costo, justificación de urgencia |
| **Notificaciones Automáticas** | Al guardar: notifica a (1) Colaborador: *"Su reembolso directo ha sido autorizado. Registre sus gastos en la plataforma"*, (2) Contabilidad: *"Nuevo reembolso directo creado para [Colaborador] - Monto: S/ [X]"* |

#### 9.2 Registro de Gastos (Flujo Estándar)

| Condición | Acción |
|---|---|
| Reembolso directo en estado "Autorizado" | Colaborador ve la solicitud en su dashboard con estado "Listo para Registrar Gastos" |
| **Flujo Posterior** | Sigue exactamente el mismo proceso que Fase 5 en adelante: registro de comprobantes con validación SUNAT/OCR, revisión por coordinador, liquidación, cierre |

---

### 🔹 FASE 10: CAJA CHICA (Flujo Mensual)

#### 10.1 Apertura y Fondeo (Contabilidad)

| Paso | Acción |
|---|---|
| 1. Inicio de ciclo mensual | Contabilidad accede a módulo "Caja Chica" → Botón "Abrir Caja Chica [Mes/Año]" |
| 2. Registro de Fondeo | Sube comprobante de depósito del fondo asignado + selecciona Centro de Costo asociado |
| 3. Activación | Sistema habilita automáticamente para los colaboradores asignados a ese centro de costo la opción "Registrar Gastos - Caja Chica" |

#### 10.2 Registro de Gastos Simplificado

| Característica | Detalle |
|---|---|
| **Sin Aprobación Intermedia** | Los gastos registrados por colaboradores se acumulan directamente; **no requieren aprobación individual del coordinador** |
| **Tipos de Comprobantes** | Mismos que Fase 5.1: Factura (con validación SUNAT), Planilla de Movilidad, Recibo de Caja, Comprobante de Caja |
| **Control Presupuestal** | Sistema alerta al alcanzar 90%/100% del fondo mensual asignado, pero **no bloquea** la carga (flexibilidad operativa) |

#### 10.3 Cierre Mensual y Arrastre de Saldos

| Paso | Acción del Sistema |
|---|---|
| 1. Fecha de Cierre | Último día del mes a las 23:59, o fecha configurable por Contabilidad |
| 2. Generación de Reporte | PDF resumen: total gastado, total inicial, saldo restante, listado de gastos por colaborador |
| 3. Liquidación de Saldo | **No hay reembolsos ni devoluciones**. El saldo no utilizado se registra automáticamente como: "Saldo Anterior - Caja Chica [Mes Siguiente]" |
| 4. Reinicio de Ciclo | Para el nuevo mes, el fondo disponible = Monto Asignado Mensual + Saldo Anterior Arrastrado |

---

## 5. REGLAS DE NEGOCIO Y VALIDACIONES DEL SISTEMA

### 5.1 Reglas de Plazos y Fechas

| ID | Regla | Implementación Técnica |
|---|---|---|
| RN-01 | Plazo máximo de carga de comprobantes: 2 días posteriores a la fecha de emisión/gasto | Validación en backend al guardar: `if (fecha_carga - fecha_emision > 2 days) → marcar como observado` |
| RN-02 | Bloqueo por cambio de mes con retraso >2 días | Validación adicional: `if (mes_emision != mes_carga AND diferencia > 2 días) → bloquear carga` |
| RN-03 | No permitir fechas futuras en comprobantes | Datepicker con `maxDate = today` en formularios de registro |

### 5.2 Reglas Presupuestales

| ID | Regla | Implementación Técnica |
|---|---|---|
| RN-04 | Límite por categoría: gasto < límite configurado | Validación en frontend y backend: `if (monto_gasto >= limite_categoria) → error` |
| RN-05 | Alerta preventiva al 90% del límite | Cálculo en tiempo real al registrar gasto: `if ((total_categoria / limite) >= 0.9) → mostrar alerta` |
| RN-06 | Ampliación de presupuesto requiere nueva solicitud aprobada | Campo `solicitud_raiz_id` vincula solicitudes; reporte final consolida montos de solicitudes vinculadas |

### 5.3 Reglas de Aprobación y Estados

| ID | Regla | Implementación Técnica |
|---|---|---|
| RN-07 | Coordinador solo puede aprobar rendición completa si todos los gastos individuales están aprobados | Validación previa al cambio de estado: `if (gastos_rendicion.some(g => g.estado !== 'Aprobado')) → deshabilitar botón` |
| RN-08 | Gasto aprobado no puede ser editado por colaborador | Permiso de edición condicional: `editable = (estado === 'Pendiente' OR estado === 'Rechazado')` |
| RN-09 | Rendición cerrada es inmutable | Middleware de API: `if (rendicion.estado === 'Cerrado') → rechazar cualquier PUT/PATCH` |

### 5.4 Reglas de Documentos y Firma

| ID | Regla | Implementación Técnica |
|---|---|---|
| RN-10 | Firma digital obligatoria para operar | Middleware de autenticación: `if (!usuario.firma_registrada AND ruta_requiere_firma) → redirigir a perfil` |
| RN-11 | Firma solo se incrusta en documentos si rendición está "Cerrado" | Lógica de generación de PDF: `if (rendicion.estado === 'Cerrado') → incrustar_firma(usuario)` |
| RN-12 | Todos los documentos tributarios se exportan en PDF | Configuración de librería de generación de documentos: formato de salida forzado a PDF |

---

## 6. INTEGRACIONES TÉCNICAS Y AUTOMATIZACIONES

### 6.1 API SUNAT (Validación de Comprobantes)

| Endpoint | Función | Parámetros | Respuesta Esperada |
|---|---|---|---|
| `GET /api/sunat/validar-factura` | Verifica vigencia y titularidad de factura | ruc_emisor, numero_comprobante, fecha_emision, monto | `{ "valido": true, "emitido_a_empresa": true, "mensaje": "OK" }` |

**Manejo de Errores:** Timeout >5s → reintentar 2 veces; si falla, mostrar: *"Servicio SUNAT no disponible. Intente más tarde o cargue manualmente con validación posterior"*

### 6.2 OCR Inteligente (Extracción de Datos)

| Tecnología | Funcionalidad | Precisión Esperada |
|---|---|---|
| Google Cloud Vision API / Tesseract + reglas custom | Extraer de imágenes/PDF: RUC, fecha, monto, concepto, número de documento | ≥90% de precisión en campos clave; campos editables post-extracción para corrección manual |

### 6.3 Geolocalización y Cálculo de Distancias

| Funcionalidad | Implementación |
|---|---|
| Autocompletado de direcciones | Google Places API con restricción a territorio peruano |
| Captura de coordenadas | Geolocation API del navegador + almacenamiento en BD: latitud, longitud, precision_metros |
| Cálculo de distancia (Movilidad) | Fórmula Haversine entre coordenadas inicio/fin; resultado en km mostrado en formulario |

### 6.4 Motor de Notificaciones

| Canal | Configuración | Plantillas |
|---|---|---|
| **Correo Electrónico** | SMTP corporativo o servicio como SendGrid/AWS SES | Plantillas HTML responsivas con variables dinámicas: `{{nombre_colaborador}}`, `{{monto_total}}`, `{{link_plataforma}}` |
| **Etiqueta de Prioridad** | Lógica: `if (fecha_viaje in [today, tomorrow]) → asunto += "[🔴 URGENTE]"` | — |
| **Registro de Envíos** | Tabla `notification_logs`: usuario_destino, tipo_notificacion, fecha_envio, estado_entrega, reintentos | — |

### 6.5 Generador de Correlativos

| Algoritmo | Ejemplo |
|---|---|
| Para Planilla de Movilidad y Comprobante de Caja: `iniciales = primera_letra(nombre) + primera_letra(apellido_paterno) + primera_letra(apellido_materno)`; `correlativo = último_correlativo_usuario + 1` con formato 3 dígitos | José Solis Cruz → JSC001, siguiente → JSC002 |
| **Almacenamiento** | Tabla `correlativos_por_usuario`: user_id, tipo_documento, ultimo_numero |

---

## 7. SISTEMA DE NOTIFICACIONES Y COMUNICACIÓN

### 7.1 Matriz de Notificaciones Automáticas

| Evento | Destinatarios | Canal | Contenido Clave | Prioridad |
|---|---|---|---|---|
| Nueva Solicitud de Viáticos | Coordinador asignado | Email | Link a plataforma, resumen de solicitud | Normal |
| Solicitud Rechazada | Colaborador | Email | Observación completa, link para re-editar | Normal |
| Solicitud Aprobada | Contabilidad | Email | Detalle completo, monto total, etiqueta 🟥 URGENTE si aplica | Alta/Urgente |
| Pago Registrado | Colaborador + Coordinador | Email + Adjunto PDF comprobante | Confirmación de pago, link para registrar gastos | Alta |
| Gasto Rechazado | Colaborador | Email + In-App | Motivo de rechazo, botón para editar | Normal |
| Rendición Enviada | Coordinador | Email + In-App | Resumen de gastos, botón para aprobación final | Alta |
| Reembolso Procesado | Colaborador | Email + Adjunto PDF | Comprobante de pago, saldo reembolsado | Normal |
| Ampliación de Plazo | Colaborador | Email + In-App | Nueva fecha límite, recordatorio de pendientes | Normal |

---

## 8. REPORTES, DASHBOARD Y EXPORTACIÓN DE DATOS

### 8.1 Reportes Disponibles

| Reporte | Filtros Disponibles | Formato de Exportación | Frecuencia de Actualización |
|---|---|---|---|
| **Rendiciones por Colaborador** | Fecha, Área, Estado, Centro de Costo | PDF, Excel | Tiempo real |
| **Ejecución Presupuestal por Centro de Costo** | Fecha, Categoría, Proyecto | Excel (con gráficos), PDF | Tiempo real |
| **Gastos por Categoría/Proveedor** | Fecha, Tipo de Comprobante, Rango de Monto | Excel, CSV | Tiempo real |
| **Tiempos de Aprobación** | Fecha, Coordinador, Estado | Excel (con métricas: promedio, mediana) | Diario (batch nocturno) |
| **Desviaciones Presupuestales** | Fecha, % Desviación, Centro de Costo | PDF ejecutivo, Excel detallado | Tiempo real |
| **Declaraciones Juradas Generadas** | Fecha, Tipo (Exterior/Viáticos), Colaborador | PDF (formato SUNAT) | Tiempo real |

### 8.2 Dashboard Ejecutivo (Contabilidad/Coordinadores)

| Widget | Métrica | Visualización |
|---|---|---|
| **KPIs Principales** | Total viáticos aprobados este mes, % cumplimiento de plazos, saldo pendiente de reembolso | Tarjetas con tendencia vs. mes anterior |
| **Gráfico de Gastos por Categoría** | Distribución % del gasto por categoría | Gráfico de barras apiladas o dona |
| **Mapa de Viajes** | Ubicación de viáticos aprobados | Mapa interactivo con marcadores por lugar |
| **Alertas Activas** | Rendiciones próximas a vencer, categorías al 90%, comprobantes observados | Lista con prioridad por color y acción rápida |
| **Filtros Globales** | Rango de fechas, Centro de Costo, Área, Estado de Rendición | Panel superior persistente |

### 8.3 Exportación y Cumplimiento Tributario

| Requisito | Implementación |
|---|---|
| **Formato PDF para SUNAT** | Generación con librería que garantice: fuentes embebidas, metadatos de autoría, hash de integridad |
| **Filtros de Fecha Obligatorios** | Todos los reportes incluyen selector de rango de fechas (mínimo: mes actual) |
| **Auditoría de Exportaciones** | Log de quién exportó qué reporte, cuándo, y con qué filtros |

---

## 9. PLANTILLAS DE DOCUMENTOS Y FORMATOS DE SALIDA

### 9.1 Documentos Generados por la Plataforma

| Documento | Formato Base | Elementos Dinámicos | Firma Digital | Estado Requerido para Descarga |
|---|---|---|:---:|---|
| **Solicitud de Viáticos** | MODELO SOLICITUD VIÁTICOS (1).xls | Datos de colaborador, fechas, centro de costo, desglose de viáticos | ❌ No aplica | Borrador o superior |
| **Planilla de Movilidad** | PLANILLA DE MOVILIDAD - TEMA (1).xls | Fecha, cliente, proyecto, lugares con coordenadas, gestión, totales, correlativo JSC001 | ✅ Sí | Cerrado |
| **Comprobante de Caja** | COMPROBANTE DE CAJA (1).XLSX | Entregado a, concepto, monto, proyecto, correlativo KAG001, fecha automática | ✅ Sí | Cerrado |
| **Rendición Completa** | Formato corporativo personalizado | Todos los gastos aprobados, resumen financiero, datos de viaje | ✅ Sí | Cerrado |
| **Declaración Jurada** | Formato SUNAT/empresa | Tipo (Exterior/Viáticos), comprobantes seleccionados, montos consolidados | ✅ Sí | Cerrado |
| **Comprobante de Reembolso/Devolución** | Plantilla genérica corporativa | Datos de transferencia, monto, referencia bancaria, fechas | ❌ No aplica | Liquidado |

### 9.2 Especificaciones Técnicas de Generación de PDF

| Característica | Detalle |
|---|---|
| **Librería** | Puppeteer (Node.js) o WeasyPrint (Python) para renderizado fiel de HTML/CSS a PDF |
| **Fuentes** | Uso de fuentes corporativas embebidas (Arial, Calibri) para garantizar consistencia |
| **Metadatos** | Inclusión de: Título, Autor (sistema), Fecha de generación, Palabras clave (viáticos, SUNAT, rendición) |
| **Seguridad** | PDFs no encriptados para facilitar auditoría, pero con marca de agua discreta: "Documento generado por Plataforma Viáticos TEMA - [Fecha]" |
| **Accesibilidad** | Estructura de etiquetas PDF para compatibilidad con lectores de pantalla (cumplimiento básico WCAG) |

---

## 10. CRITERIOS DE ACEPTACIÓN Y CONDICIONES DE ENTREGA

### 10.1 Criterios de Aceptación por Módulo

| Módulo | Criterio de Aceptación | Método de Verificación |
|---|---|---|
| **Configuración** | Se pueden crear/editar/eliminar centros de costo y categorías; carga masiva detecta duplicados | Pruebas de integración con archivos Excel de prueba (con/sin duplicados) |
| **Solicitud de Viáticos** | Formulario valida fechas, calcula totales, autocompleta lugar con GPS; notificación llega a coordinador en <2 min | Pruebas E2E con usuario de prueba; monitoreo de cola de emails |
| **Validación SUNAT** | Facturas válidas y emitidas a empresa se aprueban; inválidas se rechazan con mensaje claro | Pruebas con RUCs de prueba de SUNAT (entorno de certificación) |
| **Flujo de Aprobación** | Coordinador no puede aprobar rendición si hay gastos pendientes; notificaciones incluyen datos obligatorios | Pruebas de roles con usuarios de prueba; revisión de logs de notificaciones |
| **Generación de PDFs** | Documentos descargados coinciden visualmente con plantillas Excel; firma se incrusta solo en estado "Cerrado" | Comparación visual automatizada (pixel-perfect) + validación de metadatos PDF |
| **Reglas de Plazos** | Comprobante con >2 días y cambio de mes se bloquea; mismo mes se marca como observado | Pruebas de límite con fechas controladas (mock de fecha en tests) |

### 10.2 Condiciones de Entrega Final

| Entregable | Formato | Responsable de Aprobación |
|---|---|---|
| **Plataforma en Producción** | URL accesible + credenciales de administrador | Cliente (Equipo de TI) |
| **Documentación Técnica** | PDF: Arquitectura, API Endpoints, Manual de Despliegue | Cliente (Equipo de TI) |
| **Manual de Usuario** | PDF interactivo + videos tutoriales cortos (<3 min por módulo) | Cliente (Usuarios Finales) |
| **Plan de Capacitación** | Agenda de sesiones virtuales/presenciales por rol | Cliente (RRHH / Coordinadores) |
| **Soporte Post-Lanzamiento** | 30 días de soporte prioritario (bugs críticos <4h de respuesta) | Cliente (Project Manager) |

### 10.3 Definición de "Listo para Producción"

- ✅ Todos los criterios de aceptación aprobados en entorno de staging
- ✅ Pruebas de carga: soporta 50 usuarios concurrentes sin degradación >2s en respuestas
- ✅ Auditoría de seguridad básica: validación de inputs, protección contra XSS/CSRF, logs de acceso
- ✅ Backup automático diario configurado + procedimiento de restauración documentado
- ✅ Cliente firma acta de aceptación formal

---

## 11. SUPUESTOS, DEPENDENCIAS Y EXCLUSIONES

### 11.1 Supuestos del Proyecto

| ID | Supuesto | Impacto si no se cumple |
|---|---|---|
| SUP-01 | El cliente proporcionará plantillas Excel finales aprobadas antes del desarrollo de módulos de descarga | Retraso en desarrollo de generación de PDFs |
| SUP-02 | SUNAT mantendrá disponible su API de validación de comprobantes durante la vida útil del sistema | Requerirá alternativa manual si API cambia sin aviso |
| SUP-03 | Los usuarios finales tendrán acceso a internet estable y dispositivos con cámara para captura de comprobantes | Limitación en registro de gastos en zonas sin conectividad (fuera de alcance offline) |
| SUP-04 | El equipo de Contabilidad del cliente asignará un responsable para validación de flujos tributarios durante UAT | Riesgo de no cumplir requisitos SUNAT en producción |

### 11.2 Dependencias Externas

| Dependencia | Proveedor/Responsable | Plan de Contingencia |
|---|---|---|
| API de Geolocalización | Google Cloud Platform | Fallback a autocompletado manual de direcciones si API falla |
| Servicio de Email Transaccional | SendGrid / AWS SES | Configuración de SMTP corporativo como backup |
| Almacenamiento de Archivos | AWS S3 / Azure Blob Storage | Réplica en segundo proveedor para alta disponibilidad |
| Validación SUNAT | SUNAT (Gobierno Peruano) | Módulo de "Validación Manual Posterior" para casos de indisponibilidad prolongada |

### 11.3 Exclusiones del Alcance (Fuera de Fase 1)

| Ítem | Razón de Exclusión | Posible Inclusión Futura |
|---|---|---|
| **Aplicación Móvil Nativa** | Alcance limitado a plataforma web responsive | Fase 2: Desarrollo de app iOS/Android con funcionalidades offline |
| **Integración con ERP Contable** | Requiere mapeo complejo de asientos contables específico del ERP del cliente | Fase 2: Conector personalizado para SAP/Oracle/QuickBooks |
| **Aprobación Multinivel** | Flujo actual: 1 nivel de aprobación (Coordinador) | Fase 2: Configuración de árboles de aprobación por monto/área |
| **Pago Integrado con Pasarela** | Los desembolsos se realizan externamente (transferencia bancaria) | Fase 2: Integración con Culqi/MercadoPago para reembolsos automáticos |
| **Análisis Predictivo de Gastos** | Requiere histórico de datos y modelo de ML | Fase 3: Módulo de Business Intelligence con pronósticos |

---

## 12. ANEXOS

### Anexo A: Referencia de Plantillas Excel

| Archivo | Propósito | Ubicación en Plataforma |
|---|---|---|
| MODELO SOLICITUD VIÁTICOS (1).xls | Formato de solicitud inicial de fondos | Módulo: Solicitud de Viáticos → Botón "Descargar Plantilla" |
| PLANILLA DE MOVILIDAD - TEMA (1).xls | Formato de registro de gastos de transporte | Módulo: Registro de Gastos → Tipo "Planilla de Movilidad" |
| COMPROBANTE DE CAJA (1).XLSX | Formato de gastos menores sin comprobante SUNAT | Módulo: Registro de Gastos → Tipo "Comprobante de Caja" |

> **Nota:** Las plantillas en la plataforma serán réplicas exactas en formato PDF, con campos dinámicos pre-llenados y firma digital incrustada según reglas de negocio.

### Anexo B: Glosario de Términos

| Término | Definición |
|---|---|
| **Centro de Costo** | Unidad de asignación presupuestal identificada por Código, Proyecto y Cliente |
| **Rendición** | Conjunto de gastos registrados por un colaborador para un viaje/proyecto específico |
| **Comprobante Observado** | Gasto cargado fuera de plazo (>2 días) pero dentro del mismo mes; requiere revisión adicional |
| **Correlativo por Usuario** | Secuencia numérica única por colaborador (ej: JSC001, JSC002) para documentos internos |
| **Estado "Cerrado"** | Rendición liquidada, auditada y bloqueada para ediciones; habilita firma digital en documentos |

---

### ✅ Próximos Pasos Sugeridos

- Revisión y firma de aceptación de este documento por parte del cliente
- Kick-off técnico con equipo de desarrollo y stakeholders
- Definición de cronograma detallado por sprints (metodología ágil recomendada)
- Configuración de entornos (Dev/Staging/Prod) y pipelines de CI/CD
