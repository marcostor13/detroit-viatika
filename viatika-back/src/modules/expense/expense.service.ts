import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { CreateExpenseDto } from './dto/create-expense.dto'
import {
  CreateDeclaracionJuradaDto,
  DeclaracionJuradaSeccionDto,
} from './dto/create-declaracion-jurada.dto'
import { UpdateExpenseDto } from './dto/update-expense.dto'
import { ConfigService } from '@nestjs/config'
import { findActionableChainStep, isChainFullyApproved, plainChainStep, describeChainStep, titularCubiertoEnPaso, ChainStep } from '../advance/approval-chain.util'
import { Model, Types } from 'mongoose'
import { Expense } from './entities/expense.entity'
import { InjectModel } from '@nestjs/mongoose'
import { EmailService } from '../email/email.service'
import { PROMPT1 } from './constants/prompt1'
import OpenAI from 'openai'
import { ApprovalDto } from './dto/approval.dto'
import { SunatConfigService } from '../sunat-config/sunat-config.service'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { UserService } from '../user/user.service'
import { UploadService } from '../upload/upload.service'
import { ExpenseReportService } from '../expense-report/expense-report.service'
import { ROLES } from '../auth/enums/roles.enum'
import { NotificationsService } from '../notifications/notifications.service'
import { CategoryService } from '../category/category.service'
import {
  Client,
  TipoComida,
  topeComida,
  topeComprobante,
} from '../client/entities/client.entity'
import { CurrencyService } from '../exchange-rate/currency.service'
import { AccountingConfigDocument } from '../accounting-config/entities/accounting-config.entity'
import { DEFAULT_MONEDA, normalizeMoneda } from '../../common/moneda.constants'
import {
  applyFechaEmisionDisplayToExpense,
  applyFechaEmisionDisplayToExpenses,
  formatFechaEmisionDdMmYyyy,
  normalizeFechaEmisionInDataJson,
  parseFechaEmisionInput,
} from './utils/fecha-emision.util'
import {
  PdfSinContenidoLegibleError,
  PdfVisionInput,
  buildTextoParaPrompt,
  preparePdfVisionInput,
} from './utils/pdf-vision-input.util'
import { normalizeExtraccionOcr } from './utils/ocr-normalize.util'
import {
  OcrGuardResult,
  describeOcrIssues,
  runOcrGuards,
} from './utils/ocr-guards.util'

/** Usuario autenticado para autorización de gastos (PATCH/DELETE/GET). */
export interface ExpenseActorContext {
  userId: string
  roleName: string
  clientId?: string
}

// Tipos auxiliares
interface ExtractedInvoiceData {
  rucEmisor?: string
  serie?: string
  correlativo?: string
  fechaEmision?: string
  montoTotal?: number
  tipoComprobante?: string
  moneda?: string
  razonSocial?: string
  direccionEmisor?: string
  comentario?: string
  placaVehiculo?: string
  baseAfecta?: number
  igv?: number
  tasaIgv?: number
  inafecto?: number
  comprobanteDetallado?: Record<string, unknown>
  [key: string]: unknown
}

export interface SunatValidationMeta {
  status: string
  details: unknown
  message: string
}

/** Datos extraídos de un comprobante de depósito/transferencia bancaria. */
export interface DepositScanResult {
  amount: number
  fecha?: string
  hora?: string
  operationNumber?: string
  titular?: string
  /** Banco que emite el comprobante (de donde sale el dinero). */
  banco?: string
}

@Injectable()
export class ExpenseService {
  private readonly logger = new Logger(ExpenseService.name)
  private readonly openai: OpenAI
  private readonly visionModel = 'gpt-5.4-mini'
  /**
   * Máximo de páginas de un PDF que se analizan. Las facturas/boletas peruanas
   * casi siempre son de 1 página; el límite evita costos descontrolados en PDFs
   * largos o malformados. Cuando el PDF tiene más páginas que este tope se
   * priorizan las que contienen anclas de comprobante (RUC, IMPORTE TOTAL, IGV,
   * serie), porque en un escaneo agrupado la factura puede no estar en la
   * primera. El tope real de costo lo pone `MAX_IMAGENES_VISION`: una página
   * escaneada aporta varias bandas.
   */
  private readonly PDF_MAX_PAGES = 5

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Expense.name)
    private expenseRepository: Model<Expense>,
    @InjectModel(Client.name)
    private clientModel: Model<Client>,
    private readonly emailService: EmailService,
    private readonly userService: UserService,
    private readonly sunatConfigService: SunatConfigService,
    private readonly httpService: HttpService,
    private readonly uploadService: UploadService,
    private readonly expenseReportService: ExpenseReportService,
    private readonly notificationsService: NotificationsService,
    private readonly categoryService: CategoryService,
    private readonly currencyService: CurrencyService
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured.')
    }
    this.openai = new OpenAI({ apiKey })
  }

  private normalizeClientId(raw: unknown): string {
    if (raw == null) return ''
    if (typeof raw === 'object' && raw !== null && '_id' in raw) {
      return String((raw as { _id: unknown })._id)
    }
    return String(raw)
  }

  private expenseReportIdString(expense: Expense): string | null {
    const raw = (
      expense as unknown as {
        expenseReportId?: Types.ObjectId | { _id: Types.ObjectId } | null
      }
    ).expenseReportId
    if (!raw) return null
    if (typeof raw === 'object' && '_id' in raw) {
      return String((raw as { _id: Types.ObjectId })._id)
    }
    return String(raw)
  }

  private assertCompanyAccess(
    expense: Expense,
    actor: ExpenseActorContext
  ): void {
    if (
      actor.roleName === ROLES.SUPER_ADMIN ||
      actor.roleName === ROLES.CONTABILIDAD
    )
      return
    const expClient = this.normalizeClientId(
      (expense as unknown as { clientId: unknown }).clientId
    )
    const userClient = this.normalizeClientId(actor.clientId)
    if (!userClient || expClient !== userClient) {
      throw new ForbiddenException('No autorizado para acceder a este gasto')
    }
  }

  private assertCanReadExpense(
    expense: Expense,
    actor: ExpenseActorContext
  ): void {
    this.assertCompanyAccess(expense, actor)
    if (actor.roleName === ROLES.COLABORADOR) {
      const ownerId = String(expense.createdBy || '').trim()
      if (!ownerId || ownerId !== actor.userId) {
        throw new ForbiddenException('Solo puedes ver tus propios comprobantes')
      }
    }
  }

  /**
   * Roles con permiso transversal para corregir comprobantes ajenos.
   * Contabilidad los corrige como parte de su revisión; Admin/Superadmin operan
   * soporte. Cualquier otro rol solo puede tocar los suyos (ver
   * `assertCanMutateExpense`).
   */
  // VD-69: ni los aprobadores N1/N2 ni Contabilidad pueden editar/eliminar el
  // comprobante de otro. Solo quedan los roles de sistema (SUPER_ADMIN/ADMIN)
  // como escotilla de soporte; no tienen botón en la UI. Contabilidad se
  // limita a aprobar o rechazar el comprobante, nunca a mutarlo.
  private static readonly EXPENSE_MUTATION_PRIVILEGED_ROLES: string[] = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
  ]

  private async assertCanMutateExpense(
    expense: Expense,
    actor: ExpenseActorContext
  ): Promise<void> {
    this.assertCanReadExpense(expense, actor)
    // VD-69: ni los aprobadores N1/N2 ni Contabilidad pueden editar/eliminar
    // comprobantes. El aprobador no tiene un rol propio (es quien figure en la
    // cadena del centro de costo) y su perfil habitual es Coordinador, así que
    // en vez de vetar un rol se exige ser el creador a todo el que no sea un
    // rol de sistema (SUPER_ADMIN/ADMIN). No se controla vía @Roles porque el
    // alias Coordinador → Administrador de roles.guard.ts lo haría inútil.
    if (
      ExpenseService.EXPENSE_MUTATION_PRIVILEGED_ROLES.includes(actor.roleName)
    ) {
      return
    }
    const ownerId = String(expense.createdBy || '').trim()
    if (!ownerId || ownerId !== actor.userId) {
      throw new ForbiddenException(
        'Solo puedes modificar tus propios comprobantes.'
      )
    }
    const status = expense.status || 'pending'
    if (status === 'approved') {
      throw new ForbiddenException(
        'No puedes modificar un comprobante ya aprobado.'
      )
    }
    const reportId = this.expenseReportIdString(expense)
    if (!reportId) return
    const report = await this.expenseReportService.findOne(reportId)

    // Caja chica finalizada: el total quedó congelado, el colaborador ya no
    // puede modificar/eliminar gastos (mismo criterio que para agregarlos).
    if (
      (report as unknown as { lockedByCajaChica?: boolean }).lockedByCajaChica
    ) {
      throw new ForbiddenException(
        'La caja chica de esta rendición fue finalizada por Contabilidad. No se pueden modificar más gastos.'
      )
    }

    // Viático con pago parcial: contabilidad ya depositó parte del anticipo y el
    // colaborador sigue en fase de carga de gastos (el pago se completa después),
    // por lo que puede editar/eliminar igual que en una rendición abierta.
    const isPartialViatico =
      (report as unknown as { type?: string }).type === 'viatico' &&
      report.status === 'partially_paid'

    // Gasto rechazado por Coordinador o Contabilidad: el colaborador puede
    // corregirlo mientras la rendición siga en revisión (no aprobada/pagada/cerrada).
    // El rechazo es por-comprobante, así que la rendición permanece en
    // `submitted` (revisión del coordinador) o `pending_accounting` (revisión de
    // contabilidad); ambos estados deben permitir la corrección.
    if (status === 'rejected') {
      const correctableStatuses = [
        'open',
        'rejected',
        'submitted',
        'pending_accounting',
      ]
      if (!correctableStatuses.includes(report.status) && !isPartialViatico) {
        throw new ForbiddenException(
          'No puedes corregir este gasto porque la rendición ya no está en revisión.'
        )
      }
      return
    }

    // Resto de estados (pendiente / validación SUNAT): edición normal, permitida
    // solo en rendiciones abiertas o rechazadas.
    if (
      report.status !== 'open' &&
      report.status !== 'rejected' &&
      !isPartialViatico
    ) {
      throw new ForbiddenException(
        'Solo puedes editar o eliminar gastos en rendiciones abiertas o rechazadas.'
      )
    }
  }

  /**
   * El estado de la RENDICIÓN manda sobre lo que se puede hacer con sus
   * comprobantes: los aprobadores actúan solo con la rendición enviada, y
   * Contabilidad solo cuando los aprobadores terminaron y la rendición llegó a
   * `pending_accounting`. Sin esto cada gate mira únicamente su comprobante y
   * el orden del flujo se puede saltar (aprobar un borrador que el colaborador
   * todavía puede editar, o que Contabilidad revise antes que los aprobadores).
   */
  private async assertReportInStatus(
    expense: Expense,
    allowed: string[],
    message: string
  ): Promise<void> {
    const reportId = this.expenseReportIdString(expense)
    if (!reportId) return
    const report = await this.expenseReportService.findOne(reportId)
    const status = (report as unknown as { status?: string })?.status
    if (!status || !allowed.includes(status)) {
      throw new BadRequestException(message)
    }
  }

  private async loadExpenseOrThrow(id: string): Promise<Expense> {
    const expense = await this.findOne(id)
    if (!expense) {
      throw new NotFoundException(`Gasto con ID ${id} no encontrado`)
    }
    return expense
  }

  // Construcción del mensaje para Vision. Acepta una o varias imágenes (PDF
  // multi-página o rasterizado en bandas): el modelo las lee en el orden dado.
  // `textoExtra` es la capa de texto del PDF, que va antes de las imágenes con
  // su regla de precedencia (ver buildTextoParaPrompt).
  private buildVisionMessages(
    prompt: string,
    imageUrls: string | string[],
    textoExtra?: string | null
  ) {
    const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls]
    return [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: prompt },
          ...(textoExtra
            ? [{ type: 'text' as const, text: textoExtra }]
            : []),
          ...urls.map(url => ({
            type: 'image_url' as const,
            image_url: { url },
          })),
        ],
      },
    ]
  }

  /**
   * Parseo robusto del contenido JSON devuelto por OpenAI.
   *
   * Antes cualquier respuesta que no fuera JSON exacto terminaba en un 502
   * genérico sin dejar rastro de qué había llegado, así que no se podía
   * distinguir una respuesta vacía de una truncada o de una con preámbulo. Ahora
   * se recorta el bloque markdown, se intenta extraer el objeto por llaves (el
   * mismo respaldo que ya tenía el escaneo de depósitos) y, si igual falla, se
   * loguea el contenido crudo recortado.
   */
  private parseOpenAiJsonContent(
    content?: string | null,
    contexto = 'comprobante'
  ): ExtractedInvoiceData {
    const safe = (content || '')
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()

    const candidatos = [safe]
    // Respaldo: el objeto más externo entre la primera { y la última }.
    const primera = safe.indexOf('{')
    const ultima = safe.lastIndexOf('}')
    if (primera > 0 || (ultima > -1 && ultima < safe.length - 1)) {
      if (primera > -1 && ultima > primera) {
        candidatos.push(safe.slice(primera, ultima + 1))
      }
    }

    for (const candidato of candidatos) {
      if (!candidato) continue
      try {
        const parsed = JSON.parse(candidato) as ExtractedInvoiceData
        parsed.comentario = this.sanitizeComentario(
          parsed.comentario,
          parsed.razonSocial
        )
        return parsed
      } catch {
        /* se prueba el siguiente candidato */
      }
    }

    this.logger.error(
      `No se pudo parsear la respuesta de OpenAI (${contexto}). ` +
        `Longitud=${safe.length}. Contenido recortado: ${safe.slice(0, 1500) || '(vacío)'}`
    )
    throw new HttpException(
      safe.length === 0
        ? 'El analizador no devolvió contenido. Reintenta el escaneo.'
        : 'Respuesta inválida del analizador de comprobantes.',
      HttpStatus.BAD_GATEWAY
    )
  }

  /**
   * Deja en el log lo necesario para diagnosticar un escaneo sin datos:
   * el motivo de corte (`finish_reason`) y el consumo de tokens. Un
   * `finish_reason = 'length'` significa JSON truncado, que es una causa de
   * campos vacíos distinta de una lectura mala y no se podía distinguir.
   */
  private logCompletionDiagnostics(
    contexto: string,
    completion: OpenAI.Chat.Completions.ChatCompletion
  ): void {
    const choice = completion.choices?.[0]
    const usage = completion.usage
    const mensaje =
      `OCR ${contexto}: modelo=${completion.model} finish_reason=${choice?.finish_reason ?? 'n/d'} ` +
      `tokens(prompt=${usage?.prompt_tokens ?? '?'}, completion=${usage?.completion_tokens ?? '?'}) ` +
      `chars=${choice?.message?.content?.length ?? 0}`
    if (choice?.finish_reason && choice.finish_reason !== 'stop') {
      this.logger.warn(`${mensaje} <- la respuesta no terminó normalmente`)
      return
    }
    this.logger.log(mensaje)
  }

  /**
   * VD-103: el comentario que propone el OCR debe ser una descripción breve del
   * concepto, sin montos ni nombres de empresas. El prompt ya lo pide, pero el
   * modelo reincide, así que se limpia también aquí (determinista).
   */
  private sanitizeComentario(
    comentario?: string,
    razonSocial?: string
  ): string | undefined {
    if (typeof comentario !== 'string') return comentario
    let text = comentario.trim()
    if (!text) return undefined

    // Nombre del emisor tal como lo devolvió el OCR ("... por ACME S.A.C.").
    const emisor = (razonSocial ?? '').trim()
    if (emisor.length > 2) {
      const escaped = emisor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      text = text.replace(
        // Sin `\b` al final: la razón social suele terminar en punto ("S.A.").
        new RegExp(`\\s*(?:\\b(?:por|de|a|en)\\s+)?${escaped}\\.?(?!\\w)`, 'gi'),
        ' '
      )
    }
    // Formas societarias sueltas que queden colgando (S.A., S.A.C., E.I.R.L.).
    text = text.replace(/\s*\b(?:S\.?A\.?C?\.?|E\.?I\.?R\.?L\.?|S\.?R\.?L\.?)\b\.?/gi, ' ')
    // Importes: "S/ 1,000.00", "$ 90", "PEN 1000", "por 1,000.00".
    text = text.replace(
      /\s*(?:\bpor\s+)?(?:S\/\.?|\$|US\$|PEN|USD|soles?|d[oó]lares?)\s*\d[\d.,]*/gi,
      ' '
    )
    text = text.replace(/\s*\bpor\s+\d[\d.,]*\b/gi, ' ')
    // Restos: conectores o puntuación al final tras los recortes.
    text = text.replace(/\s{2,}/g, ' ').trim()
    text = text.replace(/[\s,;:.]*(?:\b(?:por|de|del|para|con|a|en)\b)?[\s,;:.]*$/i, '')
    text = text.trim()
    if (!text) return undefined

    // Una sola frase corta.
    const firstSentence = text.split(/(?<=[.!?])\s+/)[0] ?? text
    text = firstSentence.replace(/[.\s]+$/, '')
    if (text.length > 60) {
      const cut = text.slice(0, 60)
      const lastSpace = cut.lastIndexOf(' ')
      text = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()
    }
    return text || undefined
  }

  private determineCodComp(tipo?: string): string {
    // Catálogo SUNAT (cat. 01) de tipo de comprobante → codComp. Se mantiene
    // completo aunque el formulario hoy solo exponga Factura/Boleta, para que
    // habilitar más tipos sea trivial (agregar la opción en el selector, sin
    // tocar backend). Case-insensitive y tolerante a variantes (p. ej. "Boleta
    // Electrónica", "FACTURA"): un tipo mal detectado haría que SUNAT valide con
    // el codComp equivocado (VD-70).
    const t = (tipo ?? '').trim().toLowerCase()
    if (t.includes('crédito') || t.includes('credito')) return '07' // Nota de crédito
    if (t.includes('débito') || t.includes('debito')) return '08' // Nota de débito
    if (t.includes('boleta')) return '03'
    if (t.includes('factura')) return '01'
    return '01'
  }

  private formatDateForSunat(dateStr?: string): string | undefined {
    if (!dateStr) return undefined
    return dateStr.replace(/-/g, '/')
  }

  private parseExpenseDate(raw?: string | Date | null): Date | null {
    return parseFechaEmisionInput(raw ?? undefined)
  }

  private normalizeFechaEmisionValue(
    raw?: string | Date | null
  ): string | undefined {
    return formatFechaEmisionDdMmYyyy(raw ?? undefined)
  }

  private sanitizeFechaEmisionOnWrite(
    dto: Partial<CreateExpenseDto | UpdateExpenseDto>
  ): void {
    if (dto.fechaEmision != null && dto.fechaEmision !== '') {
      const normalized = this.normalizeFechaEmisionValue(
        dto.fechaEmision as string | Date
      )
      if (normalized) dto.fechaEmision = normalized
    }
    if (dto.data != null && typeof dto.data === 'string') {
      dto.data = normalizeFechaEmisionInDataJson(dto.data) ?? dto.data
    }
  }

  /** Mantiene comentario/placa en raíz del gasto alineados con el JSON `data`. */
  private syncComentarioPlacaFromData(
    dto: Partial<CreateExpenseDto | UpdateExpenseDto>
  ): void {
    if (dto.data == null || typeof dto.data !== 'string') return
    try {
      const parsed = JSON.parse(dto.data) as Record<string, unknown>
      if (
        dto.comentario === undefined &&
        typeof parsed.comentario === 'string'
      ) {
        const c = parsed.comentario.trim()
        if (c) dto.comentario = c
      }
      if (
        dto.placaVehiculo === undefined &&
        typeof parsed.placaVehiculo === 'string'
      ) {
        const p = parsed.placaVehiculo.trim()
        if (p) dto.placaVehiculo = p
      }
    } catch {
      /* mantener dto original */
    }
  }

  private evaluateDeadline(fechaEmisionRaw?: string | null): {
    observado: boolean
    observacionPlazo?: string
    diasRetraso?: number
  } {
    void fechaEmisionRaw
    return { observado: false }
  }

  /**
   * Consumo del presupuesto de una categoría dentro de una rendición, sin
   * decidir qué hacer con él. Se separó del gate porque el alta BLOQUEA al
   * llegar al 100% mientras que la corrección de categoría por Contabilidad
   * solo recalcula el aviso: negarle mover un gasto a la categoría correcta
   * porque esa categoría ya llegó a su tope la dejaría sin la corrección y
   * obligaría al reproceso que este cambio venía a evitar.
   */
  private async computeCategoryLimit(
    clientId: string,
    expenseReportId: string,
    categoryId: string,
    amount: number,
    /** Se descuenta del acumulado: es el gasto que se está moviendo. */
    excludeExpenseId?: string
  ): Promise<{ percent?: number; warning?: string; exceeded?: boolean }> {
    if (!expenseReportId || !categoryId || !clientId || amount <= 0) {
      return {}
    }

    const category = await this.categoryService.findOne(categoryId, clientId)
    const limit = Number(category?.limit ?? 0)
    if (!limit || Number.isNaN(limit) || limit <= 0) return {}

    const match: Record<string, unknown> = {
      expenseReportId: new Types.ObjectId(expenseReportId),
      categoryId: new Types.ObjectId(categoryId),
      status: { $ne: 'rejected' },
    }
    if (excludeExpenseId) {
      match['_id'] = { $ne: new Types.ObjectId(excludeExpenseId) }
    }

    const aggregation = await this.expenseRepository.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$total', 0] } },
        },
      },
    ])

    const current = Number(aggregation?.[0]?.total ?? 0)
    const projected = current + amount
    const percent = Number(((projected / limit) * 100).toFixed(2))

    if (percent >= 100) return { percent, exceeded: true }

    if (percent >= 90) {
      return {
        percent,
        warning:
          'Ha utilizado el 90% del presupuesto de esta categoría. Si requiere más fondos, solicite una ampliación de presupuesto antes de continuar.',
      }
    }

    return { percent }
  }

  private async evaluateCategoryLimit(
    body: CreateExpenseDto,
    amount: number
  ): Promise<{ percent?: number; warning?: string }> {
    const { percent, warning, exceeded } = await this.computeCategoryLimit(
      String(body.clientId ?? ''),
      String(body.expenseReportId ?? ''),
      String(body.categoryId ?? ''),
      amount
    )

    if (exceeded) {
      throw new BadRequestException(
        `Límite de categoría alcanzado. No se permiten más gastos en esta categoría. Solicite ampliación de presupuesto.`
      )
    }

    // Sin categoría, sin tope configurado o sin monto no hay nada que informar:
    // se devuelve el objeto vacío, como antes de separar el cálculo del gate.
    if (percent === undefined) return {}
    return warning ? { percent, warning } : { percent }
  }

  private buildUserInitials(name?: string | null): string {
    const raw = String(name || '').trim()
    if (!raw) return 'USR'

    // Formato esperado en BD: "APELLIDO1 APELLIDO2, NOMBRE [NOMBRE2 ...]"
    // Resultado deseado: inicial(NOMBRE) + inicial(APELLIDO1) + inicial(APELLIDO2)
    // Ej: "SALAZAR PEREZ, CHRISTIAN" -> "CSP"
    //     "CARRASCO PERALTA, CHRISTIAN WILMER" -> "CCP"
    if (raw.includes(',')) {
      const [apellidosPart = '', nombresPart = ''] = raw.split(',', 2)
      const apellidos = apellidosPart.trim().split(/\s+/).filter(Boolean)
      const nombres = nombresPart.trim().split(/\s+/).filter(Boolean)
      const nombreInicial = nombres[0]?.charAt(0).toUpperCase() ?? ''
      const apellido1Inicial = apellidos[0]?.charAt(0).toUpperCase() ?? ''
      const apellido2Inicial = apellidos[1]?.charAt(0).toUpperCase() ?? ''
      const initials = `${nombreInicial}${apellido1Inicial}${apellido2Inicial}`
      if (initials) return initials.padEnd(3, 'X').slice(0, 3)
    }

    // Fallback (sin coma): asumir orden "NOMBRE APELLIDO1 APELLIDO2".
    const words = raw.split(/\s+/).filter(Boolean)
    const initials = words
      .slice(0, 3)
      .map(w => w.charAt(0).toUpperCase())
      .join('')
    return initials.padEnd(3, 'X').slice(0, 3)
  }

  private async resolveOwnerUserId(
    fallbackUserId: string | undefined,
    expenseReportId: string | undefined
  ): Promise<string | undefined> {
    if (expenseReportId) {
      try {
        const report = await this.expenseReportService.findOne(expenseReportId)
        const reportUserId = (report as any)?.userId
        if (reportUserId) {
          if (typeof reportUserId === 'object' && '_id' in reportUserId) {
            return String((reportUserId as { _id: unknown })._id)
          }
          return String(reportUserId)
        }
      } catch {
        // Si la rendición no se puede resolver, caemos al userId del creador.
      }
    }
    return fallbackUserId
  }

  private async generateInternalCode(
    userId: string | undefined,
    expenseType: 'planilla_movilidad',
    expenseReportId?: string
  ): Promise<string> {
    const ownerUserId = await this.resolveOwnerUserId(userId, expenseReportId)
    if (!ownerUserId) return `USR001`
    const user = await this.userService.findOne(ownerUserId)
    const initials = this.buildUserInitials(user?.name)
    const count = await this.expenseRepository.countDocuments({
      createdBy: ownerUserId,
      expenseType,
    })
    const correlativo = String(count + 1).padStart(3, '0')
    return `${initials}${correlativo}`
  }

  private async validateDuplicateInvoiceIfAny(
    data: ExtractedInvoiceData,
    clientId: string
  ): Promise<void> {
    if (data.serie && data.correlativo && data.rucEmisor) {
      const existingInvoice = await this.findBySeriAndCorrelativo(
        data.serie,
        data.correlativo,
        clientId,
        data.rucEmisor
      )
      if (existingInvoice) {
        throw new HttpException(
          `Ya existe una factura/boleta del emisor con RUC ${data.rucEmisor} y número ${data.serie}-${data.correlativo}`,
          HttpStatus.CONFLICT
        )
      }
    }
  }

  private async validateWithSunatIfPossible(
    data: ExtractedInvoiceData,
    clientId: string,
    companyRuc: string | undefined
  ): Promise<{ validation: SunatValidationMeta; expenseStatus: string }> {
    let validation: SunatValidationMeta = {
      status: 'PENDING',
      details: null,
      message: 'Validación pendiente',
    }
    let expenseStatus = 'pending'

    if (data.rucEmisor && data.serie && data.correlativo && companyRuc) {
      try {
        const sunatApiUrl = `https://api.sunat.gob.pe/v1/contribuyente/contribuyentes/${companyRuc}/validarcomprobante`
        this.logger.log(`Usando RUC empresa para consulta SUNAT: ${companyRuc}`)

        const sunatToken = await this.generateTokenSunat(clientId)
        if (sunatToken?.access_token) {
          const fechaEmision = this.formatDateForSunat(data.fechaEmision)

          const params = {
            numRuc: data.rucEmisor,
            codComp: this.determineCodComp(data.tipoComprobante),
            numeroSerie: data.serie,
            numero: data.correlativo,
            fechaEmision: fechaEmision,
            monto:
              typeof data.montoTotal === 'number' && data.montoTotal > 0
                ? data.montoTotal.toFixed(2)
                : undefined,
          }

          const headers = {
            Authorization: `Bearer ${sunatToken.access_token}`,
            'Content-Type': 'application/json',
          }

          try {
            const response = await firstValueFrom(
              this.httpService.post(sunatApiUrl, params, { headers })
            )
            console.log(
              '[SUNAT] Raw response:',
              JSON.stringify(response.data, null, 2)
            )
            validation = this.interpretSunatResponse(response.data)
            expenseStatus = validation.status
          } catch (error) {
            expenseStatus = 'sunat_error'
            validation = {
              status: 'ERROR_SUNAT',
              details: (error as Error).message,
              message: 'Error en la comunicación con SUNAT.',
            }
          }
        } else {
          expenseStatus = 'sunat_error'
        }
      } catch {
        expenseStatus = 'sunat_error'
      }
    }

    return { validation, expenseStatus }
  }

  /**
   * Tope de ALERTA por comprobante de la empresa (Configuración > Límites). Un
   * solo valor para todas las categorías y todos los tipos de rendición. A
   * diferencia de `assertTopeComida`, nunca lanza: solo marca el gasto. El tope
   * vigente se congela en el documento para que el aprobador vea contra qué se
   * comparó, aunque la empresa lo cambie después.
   *
   * Se compara contra el monto en MONEDA BASE: el tope está expresado en soles
   * y un comprobante en dólares tiene que medirse con la misma vara.
   */
  private async evaluateTopeComprobante(
    clientId: string | undefined,
    montoBase: number | undefined
  ): Promise<{ superaTopeComprobante?: boolean; topeComprobante?: number }> {
    if (!clientId) return {}
    const client = await this.clientModel.findById(clientId).lean().exec()
    const tope = topeComprobante(client?.limits)
    if (tope === null) return {}
    return {
      superaTopeComprobante: Number(montoBase ?? 0) > tope,
      topeComprobante: tope,
    }
  }

  /**
   * Reglas propias del comprobante de caja chica, comunes a todas las vías de
   * alta:
   * - El centro de costo (y con él la orden de trabajo) es OPCIONAL. En
   *   cualquier otra rendición se sigue exigiendo, como siempre.
   * - La firma es OBLIGATORIA: el papel llega firmado por quien recibió el
   *   dinero y ese respaldo tiene que quedar guardado.
   *
   * Devuelve el centro de costo ya casteado, o `undefined` si no lleva.
   */
  private async resolveComprobanteCajaChica(
    body: CreateExpenseDto
  ): Promise<Types.ObjectId | undefined> {
    const esCajaChica = await this.expenseReportService.isReportCajaChica(
      body.expenseReportId
    )

    if (!esCajaChica) {
      if (!body.proyectId) {
        throw new HttpException(
          'El centro de costo es requerido',
          HttpStatus.BAD_REQUEST
        )
      }
      return new Types.ObjectId(body.proyectId)
    }

    if (!body.firmaUrl?.trim()) {
      throw new HttpException(
        'Adjunte la firma del comprobante. En caja chica es obligatoria.',
        HttpStatus.BAD_REQUEST
      )
    }
    if (body.proyectId) return new Types.ObjectId(body.proyectId)
    // Sin centro de costo elegido se imputa al del responsable (el de su
    // solicitud). El colaborador sigue sin estar obligado a elegirlo, pero
    // Contabilidad ya no recibe un gasto sin imputar.
    return this.expenseReportService.resolveCentroCostoCajaChica(
      String(body.expenseReportId ?? '')
    )
  }

  private async createExpenseDocument(
    body: CreateExpenseDto,
    data: ExtractedInvoiceData,
    validation: SunatValidationMeta,
    status: string
  ) {
    if (!body.clientId) {
      throw new HttpException('clientId es requerido', HttpStatus.BAD_REQUEST)
    }
    if (!body.categoryId) {
      throw new HttpException('La categoría es requerida', HttpStatus.BAD_REQUEST)
    }

    const categoryObject = Types.ObjectId.createFromHexString(body.categoryId)
    const projectObject = await this.resolveComprobanteCajaChica(body)

    const normalizedFechaEmision = this.normalizeFechaEmisionValue(
      data.fechaEmision
    )
    const dataPayload = {
      ...data,
      fechaEmision: normalizedFechaEmision ?? data.fechaEmision,
      sunatValidation: validation,
    }

    const deadlineMeta = this.evaluateDeadline(dataPayload.fechaEmision)
    const amount = Number(data.montoTotal ?? 0)

    // La moneda la manda el comprobante: el OCR ya la extrae ('PEN' / 'USD').
    // El body solo la sobreescribe si el usuario la corrigió a mano.
    const fx = await this.freezeExpenseCurrency({
      clientId: body.clientId,
      total: amount,
      moneda: body.moneda || data.moneda,
      fecha: normalizedFechaEmision ?? data.fechaEmision,
      expenseReportId: body.expenseReportId,
    })
    // El límite de la categoría está definido en la moneda base.
    const categoryMeta = await this.evaluateCategoryLimit(body, fx.montoBase)
    const topeMeta = await this.evaluateTopeComprobante(
      body.clientId,
      fx.montoBase
    )

    return this.expenseRepository.create({
      categoryId: categoryObject,
      proyectId: projectObject,
      firmaUrl: body.firmaUrl?.trim() || undefined,
      clientId: body.clientId,
      expenseReportId: body.expenseReportId
        ? new Types.ObjectId(body.expenseReportId)
        : undefined,
      total: data.montoTotal,
      ...fx,
      data: JSON.stringify(dataPayload),
      file: body.imageUrl,
      status: status,
      createdBy: body.userId || 'system',
      fechaEmision: dataPayload.fechaEmision,
      observado: deadlineMeta.observado,
      observacionPlazo: deadlineMeta.observacionPlazo,
      diasRetraso: deadlineMeta.diasRetraso,
      categoryLimitPercent: categoryMeta.percent,
      categoryLimitWarning: categoryMeta.warning,
      ...topeMeta,
      comentario: data.comentario || undefined,
      placaVehiculo: data.placaVehiculo || undefined,
      baseAfecta:
        typeof data.baseAfecta === 'number' ? data.baseAfecta : undefined,
      igv: typeof data.igv === 'number' ? data.igv : undefined,
      tasaIgv: typeof data.tasaIgv === 'number' ? data.tasaIgv : undefined,
      inafecto: typeof data.inafecto === 'number' ? data.inafecto : undefined,
      comprobanteDetallado:
        data.comprobanteDetallado &&
        typeof data.comprobanteDetallado === 'object'
          ? data.comprobanteDetallado
          : undefined,
    })
  }

  async generateTokenSunat(clientId: string) {
    try {
      const credentials = await this.sunatConfigService.getCredentials(clientId)

      const client_id = credentials.clientId
      const client_secret = credentials.clientSecret
      const ruc = credentials.ruc

      if (!client_id || !client_secret) {
        throw new HttpException(
          'Credenciales SUNAT incompletas: falta clientId o clientSecret',
          HttpStatus.BAD_REQUEST
        )
      }

      const api = `https://api-seguridad.sunat.gob.pe/v1/clientesextranet/${client_id}/oauth2/token/`
      const scope = 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes'

      // Formato oficial SUNAT: credenciales en body, sin Basic Auth header
      const body = new URLSearchParams()
      body.set('grant_type', 'client_credentials')
      body.set('scope', scope)
      body.set('client_id', client_id)
      body.set('client_secret', client_secret)

      this.logger.log(`[SUNAT Token] clientId interno: ${clientId}`)
      this.logger.log(`[SUNAT Token] client_id SUNAT: ${client_id}`)
      this.logger.log(`[SUNAT Token] RUC: ${ruc}`)
      this.logger.log(`[SUNAT Token] URL: ${api}`)

      const response = await firstValueFrom(
        this.httpService.post(api, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      )

      this.logger.log(
        `[SUNAT Token] Token obtenido exitosamente para client_id: ${client_id}`
      )

      await this.sunatConfigService.update(credentials._id, { isActive: true })

      return response.data
    } catch (error) {
      const sunatError = error?.response?.data
      const status = error?.response?.status

      this.logger.error(
        `[SUNAT Token] Error al generar token — HTTP ${status ?? 'N/A'}: ${JSON.stringify(sunatError ?? error?.message)}`
      )

      if (sunatError?.error) {
        throw new HttpException(
          {
            message: 'Error de autenticación SUNAT',
            sunat_error: sunatError.error,
            sunat_description: sunatError.error_description,
          },
          HttpStatus.BAD_GATEWAY
        )
      }

      throw new HttpException(
        error?.message || 'Error al generar token de SUNAT',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getRucInfo(
    ruc: string,
    clientId: string
  ): Promise<{ razonSocial: string | null; fuente: string }> {
    // Option A: SUNAT API oficial con el mismo token OAuth2
    try {
      const token = await this.generateTokenSunat(clientId)
      if (token?.access_token) {
        const url = `https://api.sunat.gob.pe/v1/contribuyente/contribuyentes/${ruc}`
        const response = await firstValueFrom(
          this.httpService.get(url, {
            headers: { Authorization: `Bearer ${token.access_token}` },
          })
        )
        console.log(
          `[RUC Info] SUNAT respuesta para ${ruc}:`,
          JSON.stringify(response.data)
        )
        const data = response.data
        const razonSocial =
          data?.ddp_nombre ?? data?.razonSocial ?? data?.nombre ?? null
        if (razonSocial) {
          this.logger.log(`[RUC Info] ${ruc} via SUNAT oficial: ${razonSocial}`)
          return { razonSocial, fuente: 'sunat' }
        }
      }
    } catch (err: any) {
      console.log(
        `[RUC Info] SUNAT error para ${ruc}:`,
        err?.response?.status,
        JSON.stringify(err?.response?.data ?? err?.message)
      )
    }

    // Option B-1: api.apis.net.pe v2 (requiere token si lo hay en env)
    try {
      const headers: any = { Accept: 'application/json' }
      const apisToken = process.env.APIS_NET_PE_TOKEN
      if (apisToken) headers['Authorization'] = `Bearer ${apisToken}`

      const url = `https://api.apis.net.pe/v2/sunat/ruc?numero=${ruc}`
      const response = await firstValueFrom(
        this.httpService.get(url, { headers, timeout: 6000 } as any)
      )
      console.log(
        `[RUC Info] api.apis.net.pe v2 respuesta para ${ruc}:`,
        JSON.stringify(response.data)
      )
      const data = response.data
      const razonSocial = data?.razonSocial ?? data?.nombre ?? null
      if (razonSocial) {
        this.logger.log(
          `[RUC Info] ${ruc} via api.apis.net.pe v2: ${razonSocial}`
        )
        return { razonSocial, fuente: 'tercero' }
      }
    } catch (err: any) {
      console.log(
        `[RUC Info] api.apis.net.pe v2 error para ${ruc}:`,
        err?.response?.status,
        JSON.stringify(err?.response?.data ?? err?.message)
      )
    }

    // Option B-2: api.apis.net.pe v1 (puede funcionar sin token)
    try {
      const url = `https://api.apis.net.pe/v1/ruc?numero=${ruc}`
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 6000 } as any)
      )
      console.log(
        `[RUC Info] api.apis.net.pe v1 respuesta para ${ruc}:`,
        JSON.stringify(response.data)
      )
      const data = response.data
      const razonSocial = data?.razonSocial ?? data?.nombre ?? null
      if (razonSocial) {
        this.logger.log(
          `[RUC Info] ${ruc} via api.apis.net.pe v1: ${razonSocial}`
        )
        return { razonSocial, fuente: 'tercero' }
      }
    } catch (err: any) {
      console.log(
        `[RUC Info] api.apis.net.pe v1 error para ${ruc}:`,
        err?.response?.status,
        JSON.stringify(err?.response?.data ?? err?.message)
      )
    }

    return { razonSocial: null, fuente: 'not_found' }
  }

  private interpretSunatResponse(sunatData: any): {
    status: string
    details: any
    message: string
  } {
    if (sunatData.success === true && sunatData.data?.estadoCp === '1') {
      return {
        status: 'VALIDO_ACEPTADO',
        details: sunatData.data,
        message: 'El comprobante es válido y fue facturado a esta empresa.',
      }
    } else if (sunatData.success === true && sunatData.data?.estadoCp === '0') {
      return {
        status: 'VALIDO_NO_PERTENECE',
        details: sunatData.data,
        message:
          'El comprobante es válido, pero no fue facturado a esta empresa.',
      }
    } else if (sunatData.cod === '98') {
      return {
        status: 'NO_ENCONTRADO',
        details: sunatData.msg || 'El comprobante no existe en SUNAT.',
        message: 'El comprobante no existe en SUNAT.',
      }
    } else {
      return {
        status: 'ERROR_SUNAT',
        details: sunatData,
        message: 'Error al validar el comprobante.',
      }
    }
  }

  /**
   * Escanea un comprobante de depósito/transferencia (imagen o PDF, por URL) y
   * extrae monto, fecha, hora, número de operación y titular/beneficiario.
   * Ligero: no persiste Expense ni valida SUNAT. Usado por Contabilidad al crear
   * una rendición directa con saldo. Soporta los formatos BCP, Scotiabank y BBVA.
   */
  async extractDepositInfo(
    url: string,
    mimeType?: string
  ): Promise<DepositScanResult> {
    const isPdf =
      (mimeType ? mimeType.toLowerCase().includes('pdf') : false) ||
      /\.pdf(\?|$)/i.test(url)

    const prompt =
      'Eres un asistente que extrae datos de un comprobante de depósito o ' +
      'transferencia bancaria (BCP, Scotiabank, BBVA u otro). Devuelve ' +
      'EXCLUSIVAMENTE un JSON con la forma {"amount": <número>, "fecha": ' +
      '"<dd/mm/aaaa>", "hora": "<hh:mm>", "operationNumber": "<texto>", ' +
      '"titular": "<texto>", "banco": "<texto>"}. amount es el monto ' +
      'depositado/transferido como número (sin símbolo de moneda ni ' +
      'separadores de miles, punto decimal). ' +
      'fecha es la fecha de la operación; hora la hora de la operación; ' +
      'operationNumber el número de operación o constancia; titular el nombre ' +
      'del beneficiario o titular de la cuenta destino que recibe el dinero; ' +
      'banco el banco ORIGEN, el que emite el comprobante y desde el que sale ' +
      'el dinero (BCP, BBVA, Interbank, Scotiabank...), solo el nombre. ' +
      'Si un dato no aparece, usa cadena vacía (o 0 para amount).'

    try {
      let content: string
      if (isPdf) {
        const buffer = await this.fetchUrlAsBuffer(url)
        const pdfModule = await import('pdf-parse')
        const pdfParse: (data: Buffer) => Promise<{ text: string }> =
          pdfModule.default ?? pdfModule
        const parsed = await pdfParse(buffer)
        const text = (parsed.text || '').substring(0, 15000)
        const completion = await this.openai.chat.completions.create({
          model: this.visionModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'text', text },
              ],
            },
          ],
          temperature: 0,
          max_completion_tokens: 512,
        })
        content = completion.choices[0]?.message?.content || ''
      } else {
        const completion = await this.openai.chat.completions.create({
          model: this.visionModel,
          messages: this.buildVisionMessages(prompt, url),
          temperature: 0,
          max_completion_tokens: 512,
        })
        content = completion.choices[0]?.message?.content || ''
      }
      return this.parseDepositScan(content)
    } catch (error) {
      this.logger.error('Error al escanear el comprobante de depósito:', error)
      throw new HttpException(
        'No se pudo escanear el comprobante de depósito.',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  private async fetchUrlAsBuffer(url: string): Promise<Buffer> {
    const response = await firstValueFrom(
      this.httpService.get(url, { responseType: 'arraybuffer' })
    )
    return Buffer.from(response.data as ArrayBuffer)
  }

  private parseDepositScan(raw: string): DepositScanResult {
    const cleaned = (raw || '')
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    let obj: any = {}
    try {
      obj = JSON.parse(cleaned)
    } catch {
      const m = cleaned.match(/[\d,]+\.?\d*/)
      if (m) obj.amount = Number(m[0].replace(/,/g, '')) || 0
    }
    const amount =
      typeof obj.amount === 'string'
        ? Number(String(obj.amount).replace(/,/g, '')) || 0
        : Number(obj.amount) || 0
    const str = (v: unknown) => {
      const s = v == null ? '' : String(v).trim()
      return s.length ? s : undefined
    }
    return {
      amount: amount > 0 ? amount : 0,
      fecha: str(obj.fecha),
      hora: str(obj.hora),
      operationNumber: str(obj.operationNumber),
      titular: str(obj.titular),
      banco: str(obj.banco),
    }
  }

  /**
   * OCR + validación SUNAT de una extracción, SIN persistir ni subir nada
   * (VD-70 Parte B). Devuelve el mismo shape que consume el panel post-OCR del
   * frontend: `data` (JSON con OCR + sunatValidation), `total` y `status`.
   */
  private async runOcrScan(
    extraction: ExtractedInvoiceData,
    clientId: string,
    contexto = 'comprobante'
  ): Promise<{ data: string; total: number; status: string }> {
    // findOne lanza si la empresa no tiene config SUNAT; para el escaneo se
    // tolera (queda como PENDING) en vez de romper el análisis.
    const configSunat = await this.sunatConfigService
      .findOne(clientId)
      .catch(() => null)

    // 1. El prompt pide los datos planos y anidados; si el modelo sólo llenó
    // `comprobanteDetallado`, los campos planos se recuperan de ahí. Antes ese
    // caso llegaba al formulario en blanco y con total 0 aunque el dato viniera.
    const { extraccion: normalizada, camposRecuperados } =
      normalizeExtraccionOcr(extraction)
    if (camposRecuperados.length) {
      this.logger.warn(
        `OCR ${contexto}: campos recuperados de comprobanteDetallado: ${camposRecuperados.join(', ')}`
      )
    }

    // 2. Guardas deterministas antes de validar contra SUNAT: un RUC con un
    // dígito mal leído hace fallar la validación sin explicar por qué.
    const guards = runOcrGuards(normalizada, { rucEmpresa: configSunat?.ruc })
    if (guards.issues.length) {
      const nivel = guards.hasErrors ? 'error' : 'warn'
      this.logger[nivel === 'error' ? 'error' : 'warn'](
        `OCR ${contexto}: ${describeOcrIssues(guards)}`
      )
    }

    await this.validateDuplicateInvoiceIfAny(normalizada, clientId)
    const { validation, expenseStatus } = await this.validateWithSunatIfPossible(
      normalizada,
      clientId,
      configSunat?.ruc
    )
    const normalizedFecha = this.normalizeFechaEmisionValue(
      normalizada.fechaEmision
    )
    const dataPayload = {
      ...normalizada,
      fechaEmision: normalizedFecha ?? normalizada.fechaEmision,
      sunatValidation: validation,
      // Viaja al panel post-OCR para poder marcar los campos en conflicto en vez
      // de aceptar en silencio una lectura incoherente.
      ocrIssues: guards.issues,
      ocrRequiereRevision: guards.requiereRevision,
    }
    return {
      data: JSON.stringify(dataPayload),
      total: Number(normalizada.montoTotal ?? 0),
      status: expenseStatus,
    }
  }

  /** Guardas del último intento, para decidir si vale reintentar el escaneo. */
  private evaluarGuardas(extraction: ExtractedInvoiceData): OcrGuardResult {
    const { extraccion } = normalizeExtraccionOcr(extraction)
    return runOcrGuards(extraccion)
  }

  /**
   * Escanea (OCR + SUNAT) una imagen de factura SIN subirla a storage ni crear
   * el gasto (VD-70 Parte B). El archivo llega en memoria y se envía a OpenAI
   * como data URL base64.
   */
  async scanInvoiceImage(
    body: CreateExpenseDto,
    file: Express.Multer.File
  ): Promise<{ data: string; total: number; status: string }> {
    if (!file || !file.buffer) {
      throw new HttpException('Imagen no provista', HttpStatus.BAD_REQUEST)
    }
    await this.expenseReportService.assertReportNotLockedByCajaChica(
      body.expenseReportId
    )
    await this.expenseReportService.assertPuedeCargarEnCajaChica(
      body.expenseReportId,
      body.userId
    )
    try {
      const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      const completion = await this.openai.chat.completions.create({
        model: this.visionModel,
        messages: this.buildVisionMessages(PROMPT1, dataUrl),
        temperature: 0,
        max_completion_tokens: 8192,
      })
      this.logCompletionDiagnostics('imagen', completion)
      const extraction = this.parseOpenAiJsonContent(
        completion.choices[0]?.message?.content,
        'imagen'
      )
      return await this.runOcrScan(extraction, body.clientId, 'imagen')
    } catch (error) {
      if (error instanceof HttpException) throw error
      this.logger.error('OpenAI API Error Response:', error)
      throw new HttpException(
        'Error al analizar la imagen con OpenAI.',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Escanea (OCR + SUNAT) un PDF de factura SIN subirlo a storage ni crear el
   * gasto (VD-70 Parte B).
   *
   * Se le mandan al modelo dos señales: la capa de texto del PDF (exacta, con
   * las palabras reagrupadas en su orden visual) y las imágenes rasterizadas
   * (contexto de layout en páginas digitales, bandas de alta resolución en
   * páginas escaneadas). Si las guardas deterministas encuentran errores en la
   * lectura y el PDF era digital, se reintenta una vez con las páginas en
   * bandas, que es la lectura más cara y más nítida.
   */
  async scanInvoicePdf(
    body: CreateExpenseDto,
    file: Express.Multer.File
  ): Promise<{ data: string; total: number; status: string }> {
    if (!file || !file.buffer) {
      throw new HttpException('Archivo PDF no provisto', HttpStatus.BAD_REQUEST)
    }
    await this.expenseReportService.assertReportNotLockedByCajaChica(
      body.expenseReportId
    )
    await this.expenseReportService.assertPuedeCargarEnCajaChica(
      body.expenseReportId,
      body.userId
    )
    try {
      const input = await preparePdfVisionInput(file.buffer, {
        maxPaginas: this.PDF_MAX_PAGES,
      })
      this.logger.log(`OCR pdf: ${input.resumen}`)
      for (const warning of input.warnings) {
        this.logger.warn(`OCR pdf: ${warning}`)
      }

      let extraction = await this.extractFromPdfInput(input, 'pdf')

      // Reintento único: si la lectura no pasa las guardas y todavía no se
      // mandaron bandas, se vuelve a intentar forzándolas. Sube el costo sólo en
      // el caso que ya venía mal.
      const guards = this.evaluarGuardas(extraction)
      if (guards.hasErrors && !input.tieneEscaneos) {
        this.logger.warn(
          `OCR pdf: reintento en bandas por ${describeOcrIssues(guards)}`
        )
        const reintento = await preparePdfVisionInput(file.buffer, {
          maxPaginas: this.PDF_MAX_PAGES,
          forzarBandas: true,
        })
        const extraccionReintento = await this.extractFromPdfInput(
          reintento,
          'pdf (bandas)'
        )
        if (!this.evaluarGuardas(extraccionReintento).hasErrors) {
          extraction = extraccionReintento
        }
      }

      return await this.runOcrScan(extraction, body.clientId, 'pdf')
    } catch (error) {
      if (error instanceof HttpException) throw error
      if (error instanceof PdfSinContenidoLegibleError) {
        this.logger.error(`OCR pdf: ${error.message}`)
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST)
      }
      this.logger.error('Error al analizar PDF:', error)
      throw new HttpException(
        'Error al analizar el PDF.',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /** Una pasada de lectura del PDF con las señales ya preparadas. */
  private async extractFromPdfInput(
    input: PdfVisionInput,
    contexto: string
  ): Promise<ExtractedInvoiceData> {
    const completion = await this.openai.chat.completions.create({
      model: this.visionModel,
      messages: this.buildVisionMessages(
        PROMPT1,
        input.imagenes,
        buildTextoParaPrompt(input)
      ),
      temperature: 0,
      max_completion_tokens: 8192,
    })
    this.logCompletionDiagnostics(contexto, completion)
    return this.parseOpenAiJsonContent(
      completion.choices[0]?.message?.content,
      contexto
    )
  }

  /**
   * Valida datos de comprobante contra SUNAT sin un gasto persistido (VD-70
   * Parte B): lo usa el botón "Revalidar SUNAT" del panel post-OCR, donde el
   * gasto aún no existe.
   */
  async validateSunatStateless(
    data: {
      rucEmisor?: string
      serie?: string
      correlativo?: string
      fechaEmision?: string
      montoTotal?: number
      tipoComprobante?: string
    },
    clientId: string
  ): Promise<SunatValidationMeta> {
    const configSunat = await this.sunatConfigService
      .findOne(clientId)
      .catch(() => null)
    const { validation } = await this.validateWithSunatIfPossible(
      data as ExtractedInvoiceData,
      clientId,
      configSunat?.ruc
    )
    return validation
  }

  /**
   * Crea el gasto de factura al CONFIRMAR (VD-70 Parte B): antes se creaba
   * durante el escaneo y quedaba huérfano si el usuario cancelaba. El frontend
   * envía en `body.data` el JSON final (OCR editado + sunatValidation) y en
   * `body.imageUrl` la URL del archivo ya subido en este paso. Reutiliza
   * createExpenseDocument para conservar plazo/límite de categoría, y arma la
   * cadena + engancha a la rendición como antes.
   */
  async createInvoiceFromScan(body: CreateExpenseDto): Promise<Expense> {
    await this.expenseReportService.assertReportNotLockedByCajaChica(
      body.expenseReportId
    )
    await this.expenseReportService.assertPuedeCargarEnCajaChica(
      body.expenseReportId,
      body.userId
    )
    let parsed: any = {}
    try {
      parsed = body.data ? JSON.parse(body.data) : {}
    } catch {
      parsed = {}
    }
    const validation: SunatValidationMeta = parsed.sunatValidation ?? {
      status: 'PENDING',
      details: null,
      message: 'Validación pendiente',
    }
    const extraction: ExtractedInvoiceData = {
      ...parsed,
      montoTotal: Number(body.total ?? parsed.montoTotal ?? 0),
      fechaEmision: body.fechaEmision ?? parsed.fechaEmision,
      comentario: body.comentario ?? parsed.comentario,
      placaVehiculo: body.placaVehiculo ?? parsed.placaVehiculo,
    }
    const status = body.status || validation.status || 'pending'

    // El escaneo ya valida duplicados, pero confirmar es un endpoint aparte: sin
    // esta comprobación, dos clics en "Confirmar" (o un reintento tras un error
    // posterior al alta) creaban dos comprobantes idénticos.
    await this.validateDuplicateInvoiceIfAny(extraction, body.clientId)

    const expense = await this.createExpenseDocument(
      body,
      extraction,
      validation,
      status
    )

    // Todo lo que sigue al alta se compensa si falla. Sin esto, un error acá
    // (por ejemplo un centro de costo borrado, que hace fallar la construcción
    // de la cadena) dejaba el comprobante creado pero nunca enganchado a la
    // rendición: invisible en la tabla, imposible de borrar desde la interfaz, y
    // bloqueando la recarga del mismo archivo por duplicado.
    try {
      if (body.userId) {
        await this.expenseReportService.buildChainForNewExpense(
          expense._id.toString(),
          body.userId,
          body.clientId
        )
      }
      if (body.expenseReportId) {
        await this.expenseReportService.addExpenseToReport(
          body.expenseReportId,
          expense._id.toString()
        )
      }
    } catch (error) {
      await this.deleteOrphanExpense(expense._id.toString(), error)
      throw error
    }

    return expense
  }

  /**
   * Borra un comprobante que quedó a medio crear y deja rastro. Si el borrado
   * mismo falla se registra el id en el log: es la única forma de encontrarlo
   * después, porque un comprobante sin rendición no aparece en ninguna pantalla.
   */
  private async deleteOrphanExpense(
    expenseId: string,
    causa: unknown
  ): Promise<void> {
    const motivo = causa instanceof Error ? causa.message : String(causa)
    try {
      await this.expenseRepository.findByIdAndDelete(expenseId).exec()
      this.logger.warn(
        `Comprobante ${expenseId} eliminado tras fallar el alta: ${motivo}`
      )
    } catch (deleteError) {
      this.logger.error(
        `HUÉRFANO: no se pudo eliminar el comprobante ${expenseId} tras fallar el alta ` +
          `(${motivo}). Error al borrar: ${
            deleteError instanceof Error ? deleteError.message : String(deleteError)
          }`
      )
    }
  }

  /**
   * VD-89: resuelve la categoría "Planilla de movilidad" del colaborador cuando
   * el formulario no la envía (rendición directa). Devuelve el id solo si es
   * inequívoca: la única categoría de planilla de movilidad asignada al
   * colaborador; si no tiene categorías asignadas, la única del cliente. Cadena
   * vacía si hay 0 o más de una (ambigua) para que el caller lance el error.
   */
  private async resolveMovilidadCategoryId(
    userId: string | undefined,
    clientId: string
  ): Promise<string> {
    const clientCats = await this.categoryService.findAllFlat(clientId)
    const movilidad = clientCats.filter(c =>
      /planilla de movilidad/i.test(c.name)
    )
    if (movilidad.length === 0) return ''
    let candidates = movilidad
    if (userId) {
      const user = await this.userService.findOne(userId)
      const assigned = (
        ((user?.permissions as any)?.categoryIds ?? []) as unknown[]
      ).map(String)
      if (assigned.length > 0) {
        const restricted = movilidad.filter(c =>
          assigned.includes(String((c as any)._id))
        )
        if (restricted.length > 0) candidates = restricted
      }
    }
    return candidates.length === 1 ? String((candidates[0] as any)._id) : ''
  }

  /**
   * Límite diario de la planilla de movilidad. Está configurado en soles, así
   * que se compara contra el equivalente en moneda base: en una rendición en
   * dólares las filas van en dólares y medirlas crudas dejaría pasar un día
   * de $30 (S/ 101) contra un tope de S/ 30. Mismo criterio que el tope de
   * comida y el tope por comprobante.
   */
  private async assertLimiteDiarioMovilidad(
    clientId: string,
    rows: { fecha?: string; total?: number }[],
    tipoCambio: number
  ): Promise<void> {
    const client = await this.clientModel.findById(clientId).lean().exec()
    const dailyLimit = client?.limits?.movilidadDiario ?? null
    if (dailyLimit === null) return

    const tc = Number(tipoCambio) || 1
    const porDia = new Map<string, number>()
    for (const row of rows) {
      const fecha = row.fecha || ''
      porDia.set(fecha, (porDia.get(fecha) ?? 0) + (row.total || 0))
    }
    for (const [fecha, totalDia] of porDia) {
      const enBase = this.round2(totalDia * tc)
      if (enBase > dailyLimit) {
        throw new BadRequestException(
          `El total del día ${fecha} (S/ ${enBase.toFixed(2)}) supera el límite diario de S/ ${dailyLimit.toFixed(2)}`
        )
      }
    }
  }

  /**
   * Lista de adjuntos a guardar, con `imageUrl` siempre a la cabeza.
   *
   * El frontend manda `attachments` con todos los archivos e `imageUrl` con el
   * primero; se normaliza igual por si llega solo uno de los dos (un cliente
   * viejo, o una carga por API). Sin adjuntos devuelve `undefined` para no
   * dejar un arreglo vacío en la base.
   */
  private normalizeAttachments(body: CreateExpenseDto): string[] | undefined {
    const urls = [body.imageUrl, ...(body.attachments ?? [])]
      .map((u) => (typeof u === 'string' ? u.trim() : ''))
      .filter((u) => u.length > 0)
    const unicas = [...new Set(urls)]
    return unicas.length ? unicas : undefined
  }

  async createMobilitySheet(body: CreateExpenseDto): Promise<Expense> {
    if (!body.clientId) {
      throw new HttpException('clientId es requerido', HttpStatus.BAD_REQUEST)
    }
    // Caja chica finalizada: no se permiten más gastos.
    await this.expenseReportService.assertReportNotLockedByCajaChica(
      body.expenseReportId
    )
    await this.expenseReportService.assertPuedeCargarEnCajaChica(
      body.expenseReportId,
      body.userId
    )
    if (!body.mobilityRows || body.mobilityRows.length === 0) {
      throw new HttpException(
        'Se requiere al menos una fila en la planilla',
        HttpStatus.BAD_REQUEST
      )
    }
    // El formato oficial (ADF-FOR-005) exige la Orden de Trabajo junto al Centro de
    // Costo. Excepción: la planilla hereda la OT de la rendición (viático VD-28 o
    // directa) y en ambas la OT es opcional; si la rendición no la lleva no hay
    // nada que heredar ni que el colaborador pueda elegir en el formulario.
    if (
      !body.ordenTrabajoId &&
      !(await this.expenseReportService.isReportSinOrdenTrabajo(
        body.expenseReportId
      ))
    ) {
      throw new HttpException(
        'Se requiere seleccionar la Orden de Trabajo (OT)',
        HttpStatus.BAD_REQUEST
      )
    }

    // La categoría de la planilla de movilidad se elige entre las categorías
    // "Planilla de movilidad" asignadas al colaborador (el frontend la resuelve
    // sola si solo tiene una, o le pide elegir si tiene más de una). El backend
    // valida que exista, pertenezca al cliente y sea efectivamente una categoría
    // de planilla de movilidad.
    // VD-89: en rendición directa el formulario no envía la categoría (el gasto
    // hereda el centro de costo/OT de la rendición). Si no llega, la resolvemos
    // automáticamente cuando es inequívoca para el colaborador.
    if (!body.categoryId) {
      body.categoryId = await this.resolveMovilidadCategoryId(
        body.userId,
        body.clientId
      )
    }
    if (!body.categoryId) {
      throw new HttpException(
        'No tienes asignada ninguna categoría de Planilla de movilidad. Contacta a un administrador para que te asigne una.',
        HttpStatus.BAD_REQUEST
      )
    }
    const movilidadCategory = await this.categoryService.findOne(
      body.categoryId,
      body.clientId
    )
    if (!/planilla de movilidad/i.test(movilidadCategory.name)) {
      throw new HttpException(
        'La categoría seleccionada no es una categoría de Planilla de movilidad.',
        HttpStatus.BAD_REQUEST
      )
    }
    body.categoryId = (movilidadCategory as any)._id.toString()

    const total = body.mobilityRows.reduce(
      (sum, row) => sum + (row.total || 0),
      0
    )
    const earliestDate = body.mobilityRows
      .map(r => this.parseExpenseDate(r.fecha))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0]
    const deadlineMeta = this.evaluateDeadline(
      earliestDate ? earliestDate.toISOString().slice(0, 10) : undefined
    )

    const internalCode = await this.generateInternalCode(
      body.userId,
      'planilla_movilidad',
      body.expenseReportId
    )
    const fx = await this.freezeExpenseCurrency({
      clientId: body.clientId,
      total,
      moneda: body.moneda,
      fecha: this.normalizeFechaEmisionValue(body.fechaEmision) ?? body.fechaEmision,
      expenseReportId: body.expenseReportId,
    })
    await this.assertLimiteDiarioMovilidad(
      body.clientId,
      body.mobilityRows,
      fx.tipoCambio
    )
    // El límite de la categoría está definido en la moneda base.
    const categoryMeta = await this.evaluateCategoryLimit(body, fx.montoBase)
    const topeMeta = await this.evaluateTopeComprobante(
      body.clientId,
      fx.montoBase
    )
    const expense = await this.expenseRepository.create({
      categoryId: new Types.ObjectId(body.categoryId),
      proyectId: await this.resolveComprobanteCajaChica(body),
      firmaUrl: body.firmaUrl?.trim() || undefined,
      // Sin OT (viático que no la lleva) no se castea: `new Types.ObjectId(undefined)`
      // generaría un id nuevo y dejaría el gasto apuntando a una OT inexistente.
      ordenTrabajoId: body.ordenTrabajoId
        ? new Types.ObjectId(body.ordenTrabajoId)
        : undefined,
      clientId: body.clientId,
      expenseReportId: body.expenseReportId
        ? new Types.ObjectId(body.expenseReportId)
        : undefined,
      total,
      ...fx,
      expenseType: 'planilla_movilidad',
      mobilityRows: body.mobilityRows,
      file: body.imageUrl,
      attachments: this.normalizeAttachments(body),
      status: 'pending',
      createdBy: body.userId || 'system',
      observado: deadlineMeta.observado,
      observacionPlazo: deadlineMeta.observacionPlazo,
      diasRetraso: deadlineMeta.diasRetraso,
      categoryLimitPercent: categoryMeta.percent,
      categoryLimitWarning: categoryMeta.warning,
      ...topeMeta,
      internalCode,
      data: JSON.stringify({
        type: 'planilla_movilidad',
        rows: body.mobilityRows,
      }),
    })

    if (body.userId) {
      await this.expenseReportService.buildChainForNewExpense(
        (expense as any)._id.toString(),
        body.userId,
        body.clientId
      )
    }

    if (body.expenseReportId) {
      await this.expenseReportService.addExpenseToReport(
        body.expenseReportId,
        (expense as any)._id.toString()
      )
    }

    return expense
  }

  /** Etiqueta de la comida para la descripción del gasto (VD-109). */
  private readonly ETIQUETA_COMIDA: Record<TipoComida, string> = {
    desayuno: 'Desayuno',
    almuerzo: 'Almuerzo',
    cena: 'Cena',
  }

  /**
   * VD-109: el monto de un gasto de Alimentación sin documentación no puede
   * pasar del tope que la empresa configuró para esa comida. El tope se mide
   * por gasto, no por el acumulado del día. Sin tope configurado no valida.
   *
   * Se compara contra el monto en MONEDA BASE: el tope está en soles, así que
   * una comida cargada en dólares tiene que medirse con la misma vara. Mismo
   * criterio que `evaluateTopeComprobante`.
   */
  private async assertTopeComida(
    clientId: string,
    tipo: TipoComida,
    montoBase: number
  ): Promise<void> {
    const client = await this.clientModel.findById(clientId).lean().exec()
    const tope = topeComida(client?.limits, tipo)
    if (tope === null || montoBase <= tope) return
    throw new HttpException(
      `El monto de ${this.ETIQUETA_COMIDA[tipo].toLowerCase()} (S/ ${montoBase.toFixed(2)}) supera el tope de S/ ${tope.toFixed(2)}`,
      HttpStatus.BAD_REQUEST
    )
  }

  async createOtherExpense(body: CreateExpenseDto): Promise<Expense> {
    if (!body.clientId) {
      throw new HttpException('clientId es requerido', HttpStatus.BAD_REQUEST)
    }
    if (!body.categoryId) {
      throw new HttpException('La categoría es requerida', HttpStatus.BAD_REQUEST)
    }
    // Caja chica finalizada: no se permiten más gastos.
    await this.expenseReportService.assertReportNotLockedByCajaChica(
      body.expenseReportId
    )
    await this.expenseReportService.assertPuedeCargarEnCajaChica(
      body.expenseReportId,
      body.userId
    )
    if (!body.total || body.total <= 0) {
      throw new HttpException(
        'Se requiere un monto válido',
        HttpStatus.BAD_REQUEST
      )
    }
    // El adjunto (comprobante) es obligatorio salvo AL (Alimentación sin
    // documentación), que por definición no lleva comprobante (VD-91).
    if ((body.subTipo || 'OT') !== 'AL' && !body.imageUrl) {
      throw new HttpException(
        'Se requiere adjuntar el comprobante',
        HttpStatus.BAD_REQUEST
      )
    }

    const subTipo = body.subTipo || 'OT'
    // VD-83/VD-91: DJE (DJ al extranjero) y AL (Alimentación sin documentación)
    // se comportan como una DJ (requieren firma y declaración jurada, sin
    // documento con RUC); AL además va sin adjunto.
    const requiereDeclaracion = ['AL', 'DJ', 'DJE'].includes(subTipo)

    // La DJ al extranjero se registra con su propio detalle diario por rubro
    // (Alimentación/Movilidad) — ver `createDeclaracionJurada`.
    if (subTipo === 'DJE') {
      throw new HttpException(
        'Usa el endpoint de Declaración Jurada (declaracion-jurada) para este sub-tipo',
        HttpStatus.BAD_REQUEST
      )
    }

    // VD-109: AL declara qué comida es (reemplaza a la descripción libre) y su
    // monto no puede pasar del tope que la empresa configuró para esa comida.
    let tipoComida: TipoComida | undefined
    if (subTipo === 'AL') {
      tipoComida = body.tipoComida
      if (!tipoComida) {
        throw new HttpException(
          'Indica si el gasto es desayuno, almuerzo o cena',
          HttpStatus.BAD_REQUEST
        )
      }
      // El tope se valida más abajo, contra el monto en moneda base: hace
      // falta la conversión congelada para poder compararlo.
    }

    // EXD (Documentos del viaje al extranjero): el comprobante lo emitió un
    // proveedor de fuera del Perú, así que no lleva RUC ni pasa por SUNAT, y
    // se registra en dólares — que es la moneda en la que se rinde el viaje.
    const moneda = subTipo === 'EXD' ? 'USD' : body.moneda

    // RUC Emisor obligatorio para los sub-tipos con documento físico (TK, BV, RC)
    if (['TK', 'BV', 'RC'].includes(subTipo) && !body.rucEmisor?.trim()) {
      throw new HttpException(
        'Se requiere el RUC del emisor',
        HttpStatus.BAD_REQUEST
      )
    }

    // DJ/DJE y AL requieren firma y aceptación del checkbox de declaración jurada
    if (requiereDeclaracion) {
      if (!body.declaracionJurada) {
        throw new HttpException(
          'Se requiere firmar la declaración jurada',
          HttpStatus.BAD_REQUEST
        )
      }
      if (body.userId) {
        const profile = await this.userService.findTransactionalProfile(
          body.userId
        )
        if (!profile?.signature) {
          throw new HttpException(
            'Debes registrar tu firma digital antes de enviar una Declaración Jurada. Ve a tu perfil para añadirla.',
            HttpStatus.UNPROCESSABLE_ENTITY
          )
        }
      }
    }

    const normalizedFecha = this.normalizeFechaEmisionValue(body.fechaEmision)
    const deadlineMeta = this.evaluateDeadline(
      normalizedFecha ?? body.fechaEmision
    )
    const fx = await this.freezeExpenseCurrency({
      clientId: body.clientId,
      total: body.total,
      moneda,
      fecha: normalizedFecha ?? body.fechaEmision,
      expenseReportId: body.expenseReportId,
    })
    if (tipoComida) {
      await this.assertTopeComida(body.clientId, tipoComida, fx.montoBase)
    }
    // El límite de la categoría está definido en la moneda base.
    const categoryMeta = await this.evaluateCategoryLimit(body, fx.montoBase)
    const topeMeta = await this.evaluateTopeComprobante(
      body.clientId,
      fx.montoBase
    )
    const expense = await this.expenseRepository.create({
      categoryId: new Types.ObjectId(body.categoryId),
      proyectId: await this.resolveComprobanteCajaChica(body),
      // OT opcional del comprobante. La factura y la planilla ya la guardaban;
      // Otros Gastos la descartaba aunque el formulario la mandara. Sin OT no se
      // castea: `new Types.ObjectId(undefined)` generaría un id nuevo.
      ordenTrabajoId: body.ordenTrabajoId
        ? this.toObjectIdOrRaw(body.ordenTrabajoId)
        : undefined,
      firmaUrl: body.firmaUrl?.trim() || undefined,
      clientId: body.clientId,
      expenseReportId: body.expenseReportId
        ? new Types.ObjectId(body.expenseReportId)
        : undefined,
      total: body.total,
      ...fx,
      // En AL la descripción es la comida declarada (VD-109).
      description: tipoComida ? this.ETIQUETA_COMIDA[tipoComida] : body.data,
      expenseType: 'otros_gastos',
      subTipo,
      tipoComida,
      declaracionJurada: requiereDeclaracion,
      declaracionJuradaFirmante: requiereDeclaracion
        ? body.declaracionJuradaFirmante
        : undefined,
      file: body.imageUrl || undefined,
      attachments: this.normalizeAttachments(body),
      // Nota libre del colaborador. En AL la descripción la ocupa la comida
      // declarada (VD-109), así que el comentario es su único texto propio: sin
      // guardarlo, el gasto llegaba al revisor sin explicación.
      comentario: body.comentario?.trim() || undefined,
      status: 'pending',
      createdBy: body.userId || 'system',
      fechaEmision: normalizedFecha ?? body.fechaEmision,
      observado: deadlineMeta.observado,
      observacionPlazo: deadlineMeta.observacionPlazo,
      diasRetraso: deadlineMeta.diasRetraso,
      categoryLimitPercent: categoryMeta.percent,
      categoryLimitWarning: categoryMeta.warning,
      ...topeMeta,
      data: JSON.stringify({
        type: 'otros_gastos',
        subTipo,
        tipoComida,
        declaracionJurada: requiereDeclaracion,
        firmante: requiereDeclaracion ? body.declaracionJuradaFirmante : undefined,
        description: tipoComida ? this.ETIQUETA_COMIDA[tipoComida] : body.data,
        comentario: body.comentario?.trim() || undefined,
        serie: body.serie || undefined,
        correlativo: body.correlativo || undefined,
        rucEmisor: body.rucEmisor || undefined,
      }),
    })

    if (body.userId) {
      await this.expenseReportService.buildChainForNewExpense(
        (expense as any)._id.toString(),
        body.userId,
        body.clientId
      )
    }

    if (body.expenseReportId) {
      await this.expenseReportService.addExpenseToReport(
        body.expenseReportId,
        (expense as any)._id.toString()
      )
    }

    return expense
  }

  private round2(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100
  }

  /**
   * Congela la conversión de un gasto en el momento de registrarlo.
   *
   * Devuelve dos equivalencias, ambas con su tasa:
   *  - `montoBase`: en la moneda base de la empresa. Es lo que consumen
   *    liquidación, tesorería, dashboard y asientos.
   *  - `montoReporte`: en la moneda de la rendición a la que se adjunta. Es lo
   *    que permite que un viático en dólares totalice sus boletas en soles.
   *
   * Una boleta en soles dentro de un viático en dólares es correcta tal como
   * está: se guarda en soles y se convierte para mostrarse, no se reescribe.
   */
  private async freezeExpenseCurrency(opts: {
    clientId: string
    total: number
    moneda?: string
    fecha?: string | Date
    expenseReportId?: string
  }): Promise<{
    moneda: string
    montoBase: number
    tipoCambio: number
    tcFecha: string
    monedaReporte?: string
    tcReporte?: number
    montoReporte?: number
  }> {
    const config = await this.currencyService.getConfig(opts.clientId)
    // Sin moneda declarada manda la de la rendición, no la base de la empresa.
    // Quien tipea 120 en una rendición directa en dólares está diciendo $120;
    // asumir soles ahí metía un importe falso en el total del reporte. La
    // factura escaneada sí trae su propia moneda del OCR y esta rama no aplica.
    const monedaReporte = opts.expenseReportId
      ? (await this.expenseReportService.findCurrencyMeta(opts.expenseReportId))
          ?.moneda
      : undefined
    const moneda = normalizeMoneda(
      opts.moneda ?? monedaReporte ?? config.monedaBase
    )
    const fecha = opts.fecha || new Date()
    const { montoBase, tipoCambio, tcFecha } = await this.currencyService.toBase(
      opts.total,
      moneda,
      fecha,
      config
    )

    const base: {
      moneda: string
      montoBase: number
      tipoCambio: number
      tcFecha: string
      monedaReporte?: string
      tcReporte?: number
      montoReporte?: number
    } = { moneda, montoBase, tipoCambio, tcFecha }

    return {
      ...base,
      ...(await this.resolveMontoReporte(
        opts.expenseReportId,
        moneda,
        opts.total,
        montoBase
      )),
    }
  }

  /**
   * Expresa un gasto en la moneda de su rendición.
   *
   * El TC del reporte (moneda del viático → base) se congeló al crearlo, así
   * que la equivalencia no se mueve aunque la tasa cambie después. Sin esto,
   * un viático en dólares no podría totalizar sus boletas en soles.
   */
  private async resolveMontoReporte(
    expenseReportId: string | undefined,
    moneda: string,
    total: number,
    montoBase: number
  ): Promise<{
    monedaReporte?: string
    tcReporte?: number
    montoReporte?: number
  }> {
    if (!expenseReportId) return {}
    const reporte = await this.expenseReportService.findCurrencyMeta(
      expenseReportId
    )
    if (!reporte?.moneda) return {}

    // Misma moneda: no hay nada que convertir.
    if (reporte.moneda === moneda) {
      return {
        monedaReporte: reporte.moneda,
        tcReporte: 1,
        montoReporte: this.round2(total),
      }
    }

    // Sin TC congelado NO se cae a 1: eso trataría dólares como soles y
    // metería un importe falso en el total de la rendición. Es preferible
    // dejar el gasto sin equivalencia y que se note.
    const tcReporte = Number(reporte.tipoCambio)
    if (!tcReporte || tcReporte <= 0) {
      this.logger.warn(
        `Rendición ${expenseReportId} en ${reporte.moneda} sin tipo de cambio congelado: el gasto queda sin equivalencia en la moneda del reporte.`
      )
      return { monedaReporte: reporte.moneda }
    }

    return {
      monedaReporte: reporte.moneda,
      tcReporte,
      montoReporte: this.round2(montoBase / tcReporte),
    }
  }

  /**
   * Reexpresa las equivalencias de un gasto cuando su importe cambia al editarlo.
   *
   * `update` NO re-congela la moneda —el tipo de cambio de un gasto no se
   * recalcula nunca—, pero `montoBase` y `montoReporte` sí tienen que seguir al
   * nuevo `total`: son los campos que leen la ficha de la rendición, el PDF y la
   * liquidación (`montoReporte ?? total`), no `total` a secas. Sin esto, agregar
   * tramos a una planilla de movilidad ya guardada dejaba el importe del primer
   * guardado a la vista aunque `total` ya estuviera bien.
   *
   * Se reusan las tasas que el gasto ya tenía congeladas: lo único que se
   * recalcula es el producto.
   */
  private reexpressFrozenAmounts(
    existing: Expense,
    total: number
  ): { montoBase: number; montoReporte?: number } {
    const frozen = existing as unknown as {
      moneda?: string
      tipoCambio?: number
      monedaReporte?: string
      tcReporte?: number
      montoReporte?: number
    }
    const montoBase = this.round2(total * (Number(frozen.tipoCambio) || 1))

    // Sin equivalencia previa no se inventa una: o el gasto no pertenece a una
    // rendición, o quedó adrede sin ella porque el reporte no tenía TC congelado
    // (ver resolveMontoReporte). Recalcularla aquí metería un importe falso.
    if (frozen.montoReporte == null) return { montoBase }

    // Misma moneda que la rendición: no hay nada que convertir, igual que al
    // registrarlo. Dividir por `tcReporte` daría el importe en la moneda base,
    // que es otra cosa cuando la rendición no está en la base de la empresa.
    if (frozen.monedaReporte === frozen.moneda) {
      return { montoBase, montoReporte: this.round2(total) }
    }

    const tcReporte = Number(frozen.tcReporte)
    if (!tcReporte || tcReporte <= 0) return { montoBase }
    return { montoBase, montoReporte: this.round2(montoBase / tcReporte) }
  }

  /**
   * Convierte las filas de un rubro de la DJ a la moneda base.
   *
   * Se resuelve el tipo de cambio de la fecha de CADA fila, no uno solo para
   * toda la DJ: una declaración cubre varios días de viaje y la tasa cambia. Si
   * alguna fecha no tiene tasa resoluble se aborta, en vez de guardar una
   * conversión inventada.
   */
  private async convertDeclaracionRowsToBase(
    rows: { fecha: string; monto: number }[],
    moneda: string,
    config: AccountingConfigDocument
  ): Promise<{ fecha: string; monto: number; tipoCambio: number; montoBase: number }[]> {
    const converted: {
      fecha: string
      monto: number
      tipoCambio: number
      montoBase: number
    }[] = []
    for (const row of rows) {
      const tipoCambio = await this.currencyService.resolveRate(
        moneda,
        row.fecha,
        config
      )
      if (!tipoCambio || tipoCambio <= 0) {
        throw new HttpException(
          `No se pudo obtener el tipo de cambio de ${moneda} del ${row.fecha}. Intenta nuevamente en unos minutos.`,
          HttpStatus.UNPROCESSABLE_ENTITY
        )
      }
      converted.push({
        fecha: row.fecha,
        monto: this.round2(row.monto),
        tipoCambio,
        montoBase: this.round2(Number(row.monto) * tipoCambio),
      })
    }
    return converted
  }

  /**
   * Declaración jurada de gastos al exterior (sub-tipo DJE de Otros Gastos).
   *
   * Crea un gasto por rubro declarado (alimentación y/o movilidad), unidos por
   * `groupId`. Los importes se declaran en moneda extranjera y aquí se
   * convierten a soles: `total` queda SIEMPRE en soles —es lo que consumen
   * liquidación, tesorería, dashboard y asientos— y `montoOriginal` +
   * `tipoCambio` conservan lo que se firmó, para poder auditarlo después.
   */
  async createDeclaracionJurada(
    body: CreateDeclaracionJuradaDto
  ): Promise<{ groupId: string; expenses: Expense[] }> {
    if (!body.clientId) {
      throw new HttpException('clientId es requerido', HttpStatus.BAD_REQUEST)
    }
    if (!body.proyectId) {
      throw new HttpException(
        'El centro de costo es requerido',
        HttpStatus.BAD_REQUEST
      )
    }
    // Caja chica finalizada: no se permiten más gastos.
    await this.expenseReportService.assertReportNotLockedByCajaChica(
      body.expenseReportId
    )
    await this.expenseReportService.assertPuedeCargarEnCajaChica(
      body.expenseReportId,
      body.userId
    )

    const rubros = [
      { rubro: 'alimentacion' as const, seccion: body.alimentacion },
      { rubro: 'movilidad' as const, seccion: body.movilidad },
    ].filter(r => (r.seccion?.rows?.length ?? 0) > 0)

    if (!rubros.length) {
      throw new HttpException(
        'Debes ingresar al menos un gasto de Alimentación o Movilidad',
        HttpStatus.BAD_REQUEST
      )
    }

    // El proyecto no monta un ValidationPipe global, así que los decoradores del
    // DTO no corren: sin esto entraban filas con monto 0 o sin fecha y se creaba
    // un gasto vacío.
    for (const { rubro, seccion } of rubros) {
      const nombreRubro = rubro === 'alimentacion' ? 'Alimentación' : 'Movilidad'
      if (!Types.ObjectId.isValid(seccion?.categoryId || '')) {
        throw new HttpException(
          `Falta la categoría de ${nombreRubro}`,
          HttpStatus.BAD_REQUEST
        )
      }
      for (const row of seccion!.rows) {
        if (!String(row?.fecha ?? '').trim()) {
          throw new HttpException(
            `Cada fila de ${nombreRubro} requiere una fecha`,
            HttpStatus.BAD_REQUEST
          )
        }
        if (!(Number(row?.monto) > 0)) {
          throw new HttpException(
            `Cada fila de ${nombreRubro} requiere un monto mayor a 0`,
            HttpStatus.BAD_REQUEST
          )
        }
      }
    }

    // La DJ se sustenta con la firma del colaborador, no con un comprobante:
    // mismo requisito que la DJ nacional (createOtherExpense).
    let firmante = ''
    if (body.userId) {
      const profile = await this.userService.findTransactionalProfile(
        body.userId
      )
      if (!profile?.signature) {
        throw new HttpException(
          'Debes registrar tu firma digital antes de enviar una Declaración Jurada. Ve a tu perfil para añadirla.',
          HttpStatus.UNPROCESSABLE_ENTITY
        )
      }
      firmante =
        (await this.userService.findEmailNameClient(body.userId))?.name ?? ''
    }

    const moneda = normalizeMoneda(body.moneda)
    const config = await this.currencyService.getConfig(body.clientId)
    const groupId = new Types.ObjectId().toString()
    const expenses: Expense[] = []

    for (const { rubro, seccion } of rubros) {
      const rows = await this.convertDeclaracionRowsToBase(
        seccion!.rows,
        moneda,
        config
      )
      // `total` queda en la moneda declarada (coincide al céntimo con el
      // documento firmado) y `montoBase` lleva la conversión congelada.
      const total = this.round2(rows.reduce((s, r) => s + r.monto, 0))
      const montoBase = this.round2(rows.reduce((s, r) => s + r.montoBase, 0))
      // Tasa efectiva de la DJ completa. El detalle por fila queda en `data`.
      const tipoCambio = total > 0 ? Number((montoBase / total).toFixed(4)) : 1
      // La DJ se fecha con el último día declarado del rubro.
      const fechaDeclarada = rows
        .map(r => r.fecha)
        .sort()
        .slice(-1)[0]

      // Equivalencia en la moneda de la rendición (la DJ ya trae la suya).
      const djReporte = await this.resolveMontoReporte(
        body.expenseReportId,
        moneda,
        total,
        montoBase
      )

      const rubroLabel = rubro === 'alimentacion' ? 'Alimentación' : 'Movilidad'
      const destinoLabel = [body.destino, body.pais].filter(Boolean).join(', ')
      const description = destinoLabel
        ? `Declaración jurada de gastos al exterior - ${rubroLabel} (${destinoLabel})`
        : `Declaración jurada de gastos al exterior - ${rubroLabel}`

      const normalizedFecha = this.normalizeFechaEmisionValue(fechaDeclarada)
      const deadlineMeta = this.evaluateDeadline(
        normalizedFecha ?? fechaDeclarada
      )
      const categoryMeta = await this.evaluateCategoryLimit(
        {
          expenseReportId: body.expenseReportId,
          categoryId: seccion!.categoryId,
          clientId: body.clientId,
        } as CreateExpenseDto,
        // El límite de la categoría está definido en la moneda base.
        montoBase
      )
      const topeMeta = await this.evaluateTopeComprobante(
        body.clientId,
        montoBase
      )

      const expense = await this.expenseRepository.create({
        categoryId: new Types.ObjectId(seccion!.categoryId),
        // La DJ de gastos al exterior es de viáticos, no de caja chica: su
        // centro de costo sigue siendo obligatorio y no lleva firma adjunta
        // (se sustenta con la firma del propio documento).
        proyectId: new Types.ObjectId(body.proyectId),
        clientId: body.clientId,
        expenseReportId: body.expenseReportId
          ? new Types.ObjectId(body.expenseReportId)
          : undefined,
        total,
        moneda,
        montoBase,
        tipoCambio,
        tcFecha: fechaDeclarada,
        ...djReporte,
        declaracionJuradaGroupId: groupId,
        description,
        expenseType: 'otros_gastos',
        subTipo: 'DJE',
        declaracionJurada: true,
        declaracionJuradaFirmante: firmante || undefined,
        // Persistidos en el documento (VD-91): son la fuente con la que se
        // regenera el PDF firmado sin volver a parsear `data`.
        declaracionJuradaRows: seccion!.rows,
        declaracionJuradaMoneda: moneda,
        declaracionJuradaDestino: body.destino,
        declaracionJuradaPais: body.pais,
        declaracionJuradaLugarFirma: body.lugarFirma,
        file: body.imageUrl || undefined,
        status: 'pending',
        createdBy: body.userId || 'system',
        fechaEmision: normalizedFecha ?? fechaDeclarada,
        observado: deadlineMeta.observado,
        observacionPlazo: deadlineMeta.observacionPlazo,
        diasRetraso: deadlineMeta.diasRetraso,
        ...topeMeta,
        categoryLimitPercent: categoryMeta.percent,
        categoryLimitWarning: categoryMeta.warning,
        data: JSON.stringify({
          type: 'otros_gastos',
          subTipo: 'DJE',
          declaracionJurada: true,
          firmante: firmante || undefined,
          description,
          rubro,
          destino: body.destino || undefined,
          pais: body.pais || undefined,
          lugarFirma: body.lugarFirma || undefined,
          moneda,
          montoBase,
          tipoCambio,
          rows,
        }),
      })

      if (body.userId) {
        await this.expenseReportService.buildChainForNewExpense(
          (expense as any)._id.toString(),
          body.userId,
          body.clientId
        )
      }

      if (body.expenseReportId) {
        await this.expenseReportService.addExpenseToReport(
          body.expenseReportId,
          (expense as any)._id.toString()
        )
      }

      expenses.push(expense)
    }

    return { groupId, expenses }
  }

  async createCashReceiptExpense(body: CreateExpenseDto): Promise<Expense> {
    if (!body.clientId) {
      throw new HttpException('clientId es requerido', HttpStatus.BAD_REQUEST)
    }
    if (!body.categoryId) {
      throw new HttpException('La categoría es requerida', HttpStatus.BAD_REQUEST)
    }
    // Caja chica finalizada: no se permiten más gastos.
    await this.expenseReportService.assertReportNotLockedByCajaChica(
      body.expenseReportId
    )
    await this.expenseReportService.assertPuedeCargarEnCajaChica(
      body.expenseReportId,
      body.userId
    )
    if (!body.imageUrl) {
      throw new HttpException(
        'Debe adjuntar la foto/archivo del recibo de caja',
        HttpStatus.BAD_REQUEST
      )
    }
    if (!body.total || body.total <= 0) {
      throw new HttpException(
        'Se requiere un monto válido',
        HttpStatus.BAD_REQUEST
      )
    }
    if (!body.fechaEmision) {
      throw new HttpException(
        'La fecha del comprobante es obligatoria',
        HttpStatus.BAD_REQUEST
      )
    }

    const receiptDate = this.parseExpenseDate(body.fechaEmision)
    if (!receiptDate) {
      throw new HttpException(
        'La fecha del comprobante es inválida',
        HttpStatus.BAD_REQUEST
      )
    }
    const today = new Date()
    const todayUtc = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    )
    if (receiptDate.getTime() > todayUtc.getTime()) {
      throw new HttpException(
        'La fecha del comprobante no puede ser futura',
        HttpStatus.BAD_REQUEST
      )
    }

    const normalizedFecha = this.normalizeFechaEmisionValue(body.fechaEmision)
    const deadlineMeta = this.evaluateDeadline(
      normalizedFecha ?? body.fechaEmision
    )
    const fx = await this.freezeExpenseCurrency({
      clientId: body.clientId,
      total: body.total,
      moneda: body.moneda,
      fecha: normalizedFecha ?? body.fechaEmision,
      expenseReportId: body.expenseReportId,
    })
    // El límite de la categoría está definido en la moneda base.
    const categoryMeta = await this.evaluateCategoryLimit(body, fx.montoBase)
    const topeMeta = await this.evaluateTopeComprobante(
      body.clientId,
      fx.montoBase
    )
    const expense = await this.expenseRepository.create({
      categoryId: new Types.ObjectId(body.categoryId),
      proyectId: await this.resolveComprobanteCajaChica(body),
      firmaUrl: body.firmaUrl?.trim() || undefined,
      clientId: body.clientId,
      expenseReportId: body.expenseReportId
        ? new Types.ObjectId(body.expenseReportId)
        : undefined,
      total: body.total,
      ...fx,
      description: body.data,
      expenseType: 'recibo_caja',
      file: body.imageUrl,
      status: 'pending',
      createdBy: body.userId || 'system',
      fechaEmision: normalizedFecha ?? body.fechaEmision,
      observado: deadlineMeta.observado,
      observacionPlazo: deadlineMeta.observacionPlazo,
      diasRetraso: deadlineMeta.diasRetraso,
      categoryLimitPercent: categoryMeta.percent,
      categoryLimitWarning: categoryMeta.warning,
      ...topeMeta,
      data: JSON.stringify({
        type: 'recibo_caja',
        payload: body.data || '',
      }),
    })

    if (body.userId) {
      await this.expenseReportService.buildChainForNewExpense(
        (expense as any)._id.toString(),
        body.userId,
        body.clientId
      )
    }

    if (body.expenseReportId) {
      await this.expenseReportService.addExpenseToReport(
        body.expenseReportId,
        (expense as any)._id.toString()
      )
    }

    return expense
  }

  /**
   * Castea un id (proyectId/categoryId) a ObjectId si viene como string hex de
   * 24 chars. Evita guardar la referencia como string, que rompe los $lookup /
   * match estrictos del backend (consola de rendiciones directas, dashboard,
   * conteo de gastos por proyecto, etc.).
   */
  private toObjectIdOrRaw(value: unknown): unknown {
    return typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)
      ? new Types.ObjectId(value)
      : value
  }

  /**
   * Rellena el desglose contable (base/IGV/tasa/inafecto) desde el JSON `data`
   * del OCR cuando el DTO no lo trae explícito. No sobreescribe valores ya provistos.
   */
  private syncDesgloseFromData(
    dto: Partial<CreateExpenseDto | UpdateExpenseDto>
  ): void {
    if (dto.data == null || typeof dto.data !== 'string') return
    try {
      const parsed = JSON.parse(dto.data) as Record<string, unknown>
      const num = (v: unknown): number | undefined =>
        typeof v === 'number' && !Number.isNaN(v) ? v : undefined
      if (dto.baseAfecta === undefined) dto.baseAfecta = num(parsed.baseAfecta)
      if (dto.igv === undefined) dto.igv = num(parsed.igv)
      if (dto.tasaIgv === undefined) dto.tasaIgv = num(parsed.tasaIgv)
      if (dto.inafecto === undefined) dto.inafecto = num(parsed.inafecto)
      if (
        dto.comprobanteDetallado === undefined &&
        parsed.comprobanteDetallado &&
        typeof parsed.comprobanteDetallado === 'object'
      ) {
        dto.comprobanteDetallado = parsed.comprobanteDetallado as Record<
          string,
          unknown
        >
      }
    } catch {
      /* mantener dto original */
    }
  }

  async create(createExpenseDto: CreateExpenseDto): Promise<Expense> {
    // Caja chica finalizada: no se permiten más gastos.
    await this.expenseReportService.assertReportNotLockedByCajaChica(
      createExpenseDto.expenseReportId
    )
    const dto = { ...createExpenseDto }
    this.sanitizeFechaEmisionOnWrite(dto)
    this.syncComentarioPlacaFromData(dto)
    this.syncDesgloseFromData(dto)

    if (!dto.fechaEmision && dto.data) {
      try {
        const dataObj =
          typeof dto.data === 'string' ? JSON.parse(dto.data) : dto.data
        const fromData = this.normalizeFechaEmisionValue(dataObj?.fechaEmision)
        if (fromData) dto.fechaEmision = fromData
      } catch {
        /* ignore */
      }
    }

    // Congelar la conversión también en esta vía. Es la que usa el alta genérica
    // de comprobantes, y sin `montoBase`/`montoReporte` la liquidación cae al
    // `total` crudo: una factura en dólares se sumaría como si fueran soles.
    const fx = await this.freezeExpenseCurrency({
      clientId: createExpenseDto.clientId,
      total: Number(dto.total) || 0,
      moneda: dto.moneda,
      fecha: dto.fechaEmision,
      expenseReportId: dto.expenseReportId,
    })

    const createdExpense = new this.expenseRepository({
      ...dto,
      ...fx,
      // Forzar ObjectId: en este flujo el modelo no castea estos ids por sí solo
      // (a diferencia de los create tipados), y guardarlos como string rompe los
      // $lookup/match estrictos del backend.
      proyectId: this.toObjectIdOrRaw(dto.proyectId),
      ordenTrabajoId: dto.ordenTrabajoId
        ? this.toObjectIdOrRaw(dto.ordenTrabajoId)
        : undefined,
      categoryId: this.toObjectIdOrRaw(dto.categoryId),
      clientId: new Types.ObjectId(createExpenseDto.clientId),
      createdBy: createExpenseDto.userId,
    })
    const expense = await createdExpense.save()

    if (createExpenseDto.userId) {
      await this.expenseReportService.buildChainForNewExpense(
        expense._id.toString(),
        createExpenseDto.userId,
        createExpenseDto.clientId
      )
    }

    if (createExpenseDto.expenseReportId) {
      await this.expenseReportService.addExpenseToReport(
        createExpenseDto.expenseReportId,
        expense._id.toString()
      )
    }

    return expense
  }

  async findAll(
    clientId: string,
    filters: any = {}
  ): Promise<{
    data: Expense[]
    total: number
    page: number
    pages: number
    limit: number
  }> {
    const query: any = { clientId }
    const page = filters.page
      ? Math.max(1, parseInt(String(filters.page), 10))
      : 1
    const limit = filters.limit
      ? Math.min(200, parseInt(String(filters.limit), 10))
      : 20
    const skip = (page - 1) * limit

    const isValidObjectId = (id: string): boolean => {
      return /^[0-9a-fA-F]{24}$/.test(id)
    }

    if (filters.createdBy) {
      if (isValidObjectId(filters.createdBy)) {
        query.createdBy = filters.createdBy
      }
    }

    if (filters.projectId) {
      if (isValidObjectId(filters.projectId)) {
        query.$or = [
          { proyectId: filters.projectId },
          { proyectId: Types.ObjectId.createFromHexString(filters.projectId) },
        ]
      }
    }

    if (filters.proyectId) {
      if (isValidObjectId(filters.proyectId)) {
        query.$or = [
          { proyectId: filters.proyectId },
          { proyectId: Types.ObjectId.createFromHexString(filters.proyectId) },
        ]
      }
    }

    if (filters.categoryId) {
      if (isValidObjectId(filters.categoryId)) {
        if (query.$or) {
          const projectConditions = query.$or
          delete query.$or
          query.$and = [
            { $or: projectConditions },
            {
              $or: [
                { categoryId: filters.categoryId },
                {
                  categoryId: Types.ObjectId.createFromHexString(
                    filters.categoryId
                  ),
                },
              ],
            },
          ]
        } else {
          query.$or = [
            { categoryId: filters.categoryId },
            {
              categoryId: Types.ObjectId.createFromHexString(
                filters.categoryId
              ),
            },
          ]
        }
      }
    }

    if (filters.status) query.status = filters.status

    if (filters.amountMin || filters.amountMax) {
      query.total = {}
      if (filters.amountMin) query.total.$gte = Number(filters.amountMin)
      if (filters.amountMax) query.total.$lte = Number(filters.amountMax)
    }

    if (filters.serie && filters.correlativo) {
      const expense = await this.findBySeriAndCorrelativo(
        filters.serie,
        filters.correlativo,
        clientId
      )
      const data = expense ? [expense] : []
      return { data, total: data.length, page: 1, pages: 1, limit }
    }

    // Si hay filtros de fecha, usar agregación para comparar fechas correctamente
    if (filters.dateFrom || filters.dateTo) {
      // Usar agregación para convertir strings de fecha a fechas reales y comparar
      const pipeline: any[] = []

      // Match por clientId y otros filtros básicos
      const matchStage: any = { clientId: new Types.ObjectId(clientId) }

      // Aplicar otros filtros básicos
      if (filters.createdBy && /^[0-9a-fA-F]{24}$/.test(filters.createdBy)) {
        matchStage.createdBy = filters.createdBy
      }

      if (filters.status) {
        matchStage.status = filters.status
      }

      if (filters.amountMin || filters.amountMax) {
        matchStage.total = {}
        if (filters.amountMin) matchStage.total.$gte = Number(filters.amountMin)
        if (filters.amountMax) matchStage.total.$lte = Number(filters.amountMax)
      }

      pipeline.push({ $match: matchStage })

      // Agregar filtros de proyecto y categoría si existen
      if (filters.projectId || filters.proyectId) {
        const projectId = filters.projectId || filters.proyectId
        if (/^[0-9a-fA-F]{24}$/.test(projectId)) {
          pipeline.push({
            $match: {
              $or: [
                { proyectId: new Types.ObjectId(projectId) },
                { proyectId: projectId },
              ],
            },
          })
        }
      }

      if (filters.categoryId && /^[0-9a-fA-F]{24}$/.test(filters.categoryId)) {
        pipeline.push({
          $match: {
            $or: [
              { categoryId: new Types.ObjectId(filters.categoryId) },
              { categoryId: filters.categoryId },
            ],
          },
        })
      }

      // Agregar stage para convertir fechaEmision a fecha real y filtrar
      // Handles both dd-mm-yyyy and yyyy-mm-dd storage formats
      pipeline.push({
        $addFields: {
          fechaEmisionDate: {
            $dateFromString: {
              dateString: {
                $let: {
                  vars: { parts: { $split: ['$fechaEmision', '-'] } },
                  in: {
                    $cond: {
                      if: {
                        $eq: [
                          {
                            $strLenCP: {
                              $ifNull: [{ $arrayElemAt: ['$$parts', 0] }, ''],
                            },
                          },
                          4,
                        ],
                      },
                      then: '$fechaEmision',
                      else: {
                        $concat: [
                          { $arrayElemAt: ['$$parts', 2] },
                          '-',
                          { $arrayElemAt: ['$$parts', 1] },
                          '-',
                          { $arrayElemAt: ['$$parts', 0] },
                        ],
                      },
                    },
                  },
                },
              },
              timezone: 'UTC',
              onError: null,
              onNull: null,
            },
          },
        },
      })

      // Filtrar por fechas
      const dateFilter: any = {}
      if (filters.dateFrom) {
        const [yearFrom, monthFrom, dayFrom] = filters.dateFrom
          .split('-')
          .map(Number)
        // Usar UTC para evitar problemas de zona horaria
        const fromDate = new Date(
          Date.UTC(yearFrom, monthFrom - 1, dayFrom, 0, 0, 0, 0)
        )
        dateFilter.fechaEmisionDate = { $gte: fromDate }
      }

      if (filters.dateTo) {
        const [yearTo, monthTo, dayTo] = filters.dateTo.split('-').map(Number)
        // Usar UTC para evitar problemas de zona horaria, incluir todo el día
        const toDate = new Date(
          Date.UTC(yearTo, monthTo - 1, dayTo, 23, 59, 59, 999)
        )
        if (dateFilter.fechaEmisionDate) {
          dateFilter.fechaEmisionDate.$lte = toDate
        } else {
          dateFilter.fechaEmisionDate = { $lte: toDate }
        }
      }

      if (Object.keys(dateFilter).length > 0) {
        pipeline.push({ $match: dateFilter })
      }

      // Sort by parsed date for correct ordering, then paginate
      const sortBy = filters.sortBy || 'fechaEmision'
      const sortOrder = filters.sortOrder || 'desc'
      const sortField = sortBy === 'fechaEmision' ? 'fechaEmisionDate' : sortBy
      pipeline.push({ $sort: { [sortField]: sortOrder === 'desc' ? -1 : 1 } })

      const [facetResult] = await this.expenseRepository.aggregate([
        ...pipeline,
        {
          $facet: {
            data: [
              { $skip: skip },
              { $limit: limit },
              { $project: { fechaEmisionDate: 0 } },
            ],
            count: [{ $count: 'total' }],
          },
        },
      ])
      const rawData = facetResult?.data ?? []
      const total = facetResult?.count?.[0]?.total ?? 0
      const populatedResult = (await this.expenseRepository.populate(rawData, [
        { path: 'proyectId' },
        { path: 'categoryId' },
      ])) as unknown as Expense[]
      return {
        data: applyFechaEmisionDisplayToExpenses(populatedResult),
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      }
    }

    const sortBy = filters.sortBy || 'fechaEmision'
    const sortOrder = filters.sortOrder || 'desc'
    const sortOptions: any = {}
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1

    const [result, total] = await Promise.all([
      this.expenseRepository
        .find(query)
        .populate('proyectId')
        .populate('ordenTrabajoId')
        .populate('categoryId')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.expenseRepository.countDocuments(query),
    ])

    let data: Expense[] = result
    if (sortBy === 'fechaEmision') {
      data = result.sort((a, b) => {
        const dateA = this.parseExpenseDate(a.fechaEmision as string)
        const dateB = this.parseExpenseDate(b.fechaEmision as string)
        if (!dateA || !dateB) return 0
        return sortOrder === 'desc'
          ? dateB.getTime() - dateA.getTime()
          : dateA.getTime() - dateB.getTime()
      })
    }

    return {
      data: applyFechaEmisionDisplayToExpenses(data),
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    }
  }

  async getStatusCounts(clientId: string): Promise<{
    pending: number
    approved: number
    rejected: number
    total: number
  }> {
    const match = { clientId: new Types.ObjectId(clientId) }
    const [total, approved, rejected] = await Promise.all([
      this.expenseRepository.countDocuments(match),
      this.expenseRepository.countDocuments({
        ...match,
        status: { $in: ['approved', 'APPROVED'] },
      }),
      this.expenseRepository.countDocuments({
        ...match,
        status: { $in: ['rejected', 'REJECTED'] },
      }),
    ])
    return { total, approved, rejected, pending: total - approved - rejected }
  }

  async findOne(id: string): Promise<Expense | null> {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      throw new Error(`ID de expense inválido: ${id}`)
    }

    const expenseIdObject = Types.ObjectId.createFromHexString(id)

    const expense = await this.expenseRepository
      .findOne({ _id: expenseIdObject })
      .populate('proyectId')
      .populate('ordenTrabajoId')
      .populate('categoryId')
      .exec()

    return expense ? applyFechaEmisionDisplayToExpense(expense) : null
  }

  async getSunatValidationInfo(id: string): Promise<any> {
    const expense = await this.findOne(id)

    if (!expense) {
      throw new NotFoundException(`Expense with ID ${id} not found`)
    }

    return this.buildSunatValidationInfoPayload(expense)
  }

  async getSunatValidationInfoForActor(
    id: string,
    actor: ExpenseActorContext
  ): Promise<Record<string, unknown>> {
    const expense = await this.loadExpenseOrThrow(id)
    this.assertCanReadExpense(expense, actor)
    return this.buildSunatValidationInfoPayload(expense)
  }

  private buildSunatValidationInfoPayload(
    expense: Expense
  ): Record<string, unknown> {
    try {
      const data = JSON.parse(expense.data)
      const sunatValidation = data.sunatValidation

      return {
        expenseId: String((expense as { _id?: Types.ObjectId })._id),
        status: expense.status,
        sunatValidation: sunatValidation || null,
        hasValidation: !!sunatValidation,
        message:
          sunatValidation?.message ||
          'No hay información de validación SUNAT disponible',
        extractedData: {
          rucEmisor: data.rucEmisor,
          serie: data.serie,
          correlativo: data.correlativo,
          fechaEmision: data.fechaEmision,
          montoTotal: data.montoTotal,
        },
      }
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error parsing expense data: ${err.message}`)
      return {
        expenseId: String((expense as { _id?: Types.ObjectId })._id),
        status: expense.status,
        sunatValidation: null,
        hasValidation: false,
        message: 'Error al procesar la información de validación SUNAT',
      }
    }
  }

  async findOneForActor(
    id: string,
    actor: ExpenseActorContext
  ): Promise<Expense> {
    const expense = await this.loadExpenseOrThrow(id)
    this.assertCanReadExpense(expense, actor)
    return applyFechaEmisionDisplayToExpense(expense)
  }

  async update(
    id: string,
    updateExpenseDto: UpdateExpenseDto,
    actor: ExpenseActorContext
  ): Promise<Expense | null> {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      throw new Error(`ID de expense inválido: ${id}`)
    }

    const expenseIdObject = Types.ObjectId.createFromHexString(id)
    const existing = await this.loadExpenseOrThrow(id)
    await this.assertCanMutateExpense(existing, actor)

    const dto = { ...updateExpenseDto }
    this.sanitizeFechaEmisionOnWrite(dto)
    this.syncComentarioPlacaFromData(dto)

    // VD-109: editar un gasto de Alimentación sin documentación tampoco puede
    // dejarlo por encima del tope de su comida.
    const existingAsRecord = existing as unknown as {
      subTipo?: string
      tipoComida?: TipoComida
      total?: number
      tipoCambio?: number
      clientId?: string
    }
    if (existingAsRecord.subTipo === 'AL') {
      const tipo = dto.tipoComida ?? existingAsRecord.tipoComida
      if (!tipo) {
        throw new HttpException(
          'Indica si el gasto es desayuno, almuerzo o cena',
          HttpStatus.BAD_REQUEST
        )
      }
      const total = dto.total ?? existingAsRecord.total ?? 0
      // El tope está en soles: se compara contra el equivalente en base, con
      // el TC que el gasto congeló al registrarse. Los gastos anteriores al
      // multimoneda no lo tienen y ya estaban asumidos en soles (TC 1).
      const tc = Number(existingAsRecord.tipoCambio) || 1
      await this.assertTopeComida(
        String(existingAsRecord.clientId),
        tipo,
        this.round2(total * tc)
      )
      dto.description = this.ETIQUETA_COMIDA[tipo]
    }

    if (dto.mobilityRows && dto.mobilityRows.length > 0) {
      // El tope está en soles: se mide contra el equivalente, con el TC que la
      // planilla congeló al registrarse (1 en las anteriores al multimoneda).
      await this.assertLimiteDiarioMovilidad(
        String(existing.clientId),
        dto.mobilityRows,
        Number((existing as any).tipoCambio) || 1
      )
      dto.total = dto.mobilityRows.reduce(
        (sum, row) => sum + (row.total || 0),
        0
      )
      dto.data = JSON.stringify({
        type: 'planilla_movilidad',
        rows: dto.mobilityRows,
      })
    }

    // Mismo criterio que create(): si la edición trae proyectId/categoryId como
    // string, forzarlos a ObjectId para no "ensuciar" el tipo al re-guardar.
    const updateDoc: any = { ...dto }
    if (updateDoc.proyectId !== undefined)
      updateDoc.proyectId = this.toObjectIdOrRaw(updateDoc.proyectId)
    if (updateDoc.ordenTrabajoId !== undefined)
      updateDoc.ordenTrabajoId = this.toObjectIdOrRaw(updateDoc.ordenTrabajoId)
    if (updateDoc.categoryId !== undefined)
      updateDoc.categoryId = this.toObjectIdOrRaw(updateDoc.categoryId)

    // El aviso de tope por comprobante se re-evalúa cuando cambia el monto: debe
    // reflejar el importe vigente, no el del registro inicial. Si la empresa
    // quitó el tope entretanto, los dos campos quedan limpios. Se reusa el
    // tipo de cambio ya congelado en el gasto, porque `update` no re-congela
    // la moneda.
    if (dto.total !== undefined) {
      const tipoCambio =
        Number((existing as unknown as { tipoCambio?: number }).tipoCambio) || 1
      const topeMeta = await this.evaluateTopeComprobante(
        String(existing.clientId),
        Number(dto.total) * tipoCambio
      )
      updateDoc.superaTopeComprobante = topeMeta.superaTopeComprobante ?? false
      updateDoc.topeComprobante = topeMeta.topeComprobante ?? null
      Object.assign(
        updateDoc,
        this.reexpressFrozenAmounts(existing, Number(dto.total))
      )
    }

    // Corrección de un comprobante rechazado por el colaborador dueño: vuelve a
    // revisión. El front reenvía el `status: 'rejected'` original del documento, así
    // que aquí se sobreescribe el estado y se reabre únicamente el lado que estaba
    // rechazado (la aprobación ya emitida por el otro rol se conserva). El lado
    // "coordinador" ahora es una cadena de niveles: reabrirlo reinicia el turno al
    // primer paso de la cadena ya construida (no se re-resuelve el centro de costo aquí).
    const existingAny = existing as unknown as {
      status?: string
      contabilidadStatus?: string
      approverChain?: ChainStep[]
      requiredLevels?: number
    }
    if (
      actor.roleName === ROLES.COLABORADOR &&
      existingAny.status === 'rejected'
    ) {
      const contRejected = existingAny.contabilidadStatus === 'rejected'
      const coordRejected = !contRejected
      const nextCont = contRejected ? 'pending' : (existingAny.contabilidadStatus ?? 'pending')
      if (coordRejected) {
        updateDoc.approvalLevel = 0
        // Aprobación en paralelo entre niveles: `approvalLevel` es solo el
        // contador — cada paso guarda su propio `approved`. Reabrir el
        // comprobante debe limpiar TODOS los pasos, no solo el contador, o
        // quedarían aprobaciones previas "fantasma" (approved:true) mientras
        // el contador ya muestra 0.
        updateDoc.approverChain = (existingAny.approverChain ?? []).map(step => ({
          ...plainChainStep(step),
          approved: false,
          approvedBy: undefined,
          approvedAt: undefined,
        }))
      }
      if (contRejected) {
        updateDoc.contabilidadStatus = 'pending'
        updateDoc.contabilidadRejectionReason = ''
      }
      const nextCoord = coordRejected
        ? 'pending'
        : this.chainCoordStatus(existingAny)
      updateDoc.status = this.computeCombinedStatus(nextCoord, nextCont)
      updateDoc.rejectionReason = ''
      updateDoc.rejectedBy = ''
    }

    const updated = await this.expenseRepository
      .findOneAndUpdate({ _id: expenseIdObject }, updateDoc, {
        new: true,
      })
      .populate('clientId')
      .populate('categoryId')
      .exec()

    // Corregir un comprobante NO reenvía la rendición. Antes, editar cualquier
    // gasto de una rendición rechazada la devolvía sola a `submitted`
    // (`resubmitSilent`), así que el colaborador perdía el control: no alcanzaba
    // a subir las facturas que le faltaban ni a pulsar "Reenviar" — la rendición
    // ya estaba otra vez con los aprobadores. El reenvío es suyo y explícito
    // (PATCH status 'submitted'), que además reconstruye las cadenas.
    return updated ? applyFechaEmisionDisplayToExpense(updated) : null
  }

  /**
   * Corrección de la categoría contable de un comprobante por Contabilidad,
   * durante SU etapa de revisión (rendición en `pending_accounting`).
   *
   * Hasta ahora, ante una categoría mal elegida la única salida era rechazar la
   * rendición: el colaborador la corregía y volvía a recorrer toda la cadena de
   * aprobadores. Como quien rinde no siempre tiene criterio contable, ese
   * reproceso era frecuente y caro. Contabilidad, que es quien sabe cuál
   * corresponde, la corrige aquí sin devolver nada.
   *
   * Deliberadamente NO pasa por `update()`: el resto del comprobante (monto,
   * fecha, adjuntos, documento) sigue siendo del colaborador y fuera del
   * alcance de Contabilidad (VD-69). Solo se toca `categoryId` y el aviso de
   * presupuesto, que quedaría hablando de la categoría anterior.
   *
   * Devuelve también el nombre de la categoría anterior, para la bitácora.
   */
  async updateCategoryByContabilidad(
    id: string,
    categoryId: string,
    actor: ExpenseActorContext
  ): Promise<{ expense: Expense | null; categoriaAnterior: string }> {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      throw new BadRequestException(`ID de expense inválido: ${id}`)
    }

    const existing = await this.loadExpenseOrThrow(id)
    this.assertCanReadExpense(existing, actor)
    await this.assertReportInStatus(
      existing,
      ['pending_accounting'],
      'La categoría solo se puede corregir mientras la rendición está en revisión de Contabilidad.'
    )

    // El comprobante manda el cliente, no el token: Contabilidad es un rol
    // multiempresa (`assertCompanyAccess` la deja pasar) y su `clientId` puede
    // no ser el de esta rendición.
    const clientId = this.normalizeClientId(
      (existing as unknown as { clientId: unknown }).clientId
    )
    // Valida de una vez que exista y que sea de la misma empresa: `findOne`
    // filtra por clientId y lanza 404 si no encaja.
    const category = await this.categoryService.findOne(categoryId, clientId)

    const anterior = (existing as unknown as { categoryId?: unknown }).categoryId
    const categoriaAnterior =
      anterior && typeof anterior === 'object' && 'name' in anterior
        ? String((anterior as { name: unknown }).name)
        : ''
    const anteriorId =
      anterior && typeof anterior === 'object' && '_id' in anterior
        ? String((anterior as { _id: unknown })._id)
        : String(anterior ?? '')

    if (anteriorId === String(category._id)) {
      return { expense: existing, categoriaAnterior }
    }

    // El aviso de presupuesto pasa a medirse contra la categoría nueva. Aquí no
    // bloquea: ver `computeCategoryLimit`.
    const limite = await this.computeCategoryLimit(
      clientId,
      this.expenseReportIdString(existing) ?? '',
      String(category._id),
      Number((existing as unknown as { total?: number }).total ?? 0),
      id
    )

    const updated = await this.expenseRepository
      .findOneAndUpdate(
        { _id: Types.ObjectId.createFromHexString(id) },
        {
          categoryId: category._id,
          categoryLimitPercent: limite.percent ?? null,
          categoryLimitWarning: limite.warning ?? null,
        },
        { new: true }
      )
      .populate('clientId')
      .populate('categoryId')
      .exec()

    return {
      expense: updated ? applyFechaEmisionDisplayToExpense(updated) : null,
      categoriaAnterior,
    }
  }

  async approveInvoice(id: string, approvalDto: ApprovalDto) {
    const expense = await this.findOne(id)
    if (!expense) {
      throw new NotFoundException(`Factura con ID ${id} no encontrada`)
    }

    if (expense.status === 'approved') {
      throw new HttpException(
        'La factura ya ha sido aprobada',
        HttpStatus.BAD_REQUEST
      )
    }

    const validUserId = null
    const userEmail = null
    const userName = null
    const userLastName = null
    const reviewerId = approvalDto.userId || undefined

    const updatedExpense = await this.expenseRepository
      .findByIdAndUpdate(
        id,
        {
          status: 'approved',
          statusDate: new Date(),
          approvedBy: validUserId,
          $push: {
            reviewHistory: {
              action: 'approved',
              reviewerId,
              reviewedAt: new Date(),
            },
          },
        },
        { new: true }
      )
      .exec()

    if (updatedExpense && updatedExpense.createdBy) {
      const invoiceData = updatedExpense.data
        ? JSON.parse(updatedExpense.data)
        : {}
      const nombreComprobante = `${invoiceData.serie || ''}-${invoiceData.correlativo || ''}`

      this.notificationsService
        .create({
          userId: updatedExpense.createdBy as unknown as string,
          title: 'Comprobante Aprobado',
          message: `Tu comprobante ${nombreComprobante} ha sido aprobado.`,
          type: 'success',
          actionUrl: `/mis-rendiciones/${this.expenseReportIdString(updatedExpense)}/detalle`,
        })
        .catch(err => this.logger.error('Error creando notificación', err))
    }

    this.logger.log(`Factura ${id} aprobada exitosamente`)
    return updatedExpense
  }

  private async sendApprovalEmails(
    expense: any,
    validUserId: string | null,
    userName?: string | null,
    userLastName?: string | null
  ) {
    try {
      let approverName = 'Administrador del Sistema'

      if (userName && userLastName) {
        approverName = `${userName} ${userLastName}`
        this.logger.debug(
          `Usando información de aprobador encontrada previamente: ${approverName}`
        )
      } else if (validUserId) {
        try {
          const approver = await this.userService.findOne(validUserId)
          if (approver) {
            approverName = approver.name

            this.logger.debug(
              `Información de aprobador obtenida de la BD: ${approverName}`
            )
          }
        } catch (error) {
          this.logger.warn('No se pudo obtener información del aprobador')
        }
      } else {
        this.logger.warn(
          'Usando valor predeterminado para el aprobador: Administrador del Sistema'
        )
      }

      const invoiceData = expense.data ? JSON.parse(expense.data) : {}

      if (expense.createdBy) {
        try {
          if (!/^[0-9a-fA-F]{24}$/.test(expense.createdBy)) {
            this.logger.warn(`ID del creador inválido: ${expense.createdBy}`)
            return
          }

          const creator = await this.userService.findOne(expense.createdBy)

          if (creator && creator.email) {
            const creatorFullName = creator.name

            this.logger.debug(
              `Enviando notificación de aprobación a ${creator.email}, rol: ${creator.role}`
            )
          } else {
            this.logger.warn(
              'No se encontró email para el creador de la factura'
            )
          }
        } catch (error) {
          this.logger.warn(
            'No se pudo encontrar al creador de la factura:',
            error
          )
        }
      } else {
        this.logger.warn(
          'La factura no tiene un creador asignado (createdBy es null)'
        )
      }

      try {
        const colaboradores = await this.userService.findAll(
          new Types.ObjectId(expense.clientId)
        )

        if (colaboradores && colaboradores.length > 0) {
          this.logger.debug(
            `Notificando a ${colaboradores.length} colaboradores sobre factura aprobada`
          )

          const creadorId = expense.createdBy || ''

          for (const colaborador of colaboradores) {
            if (colaborador.email && colaborador._id.toString() !== creadorId) {
              try {
                const emailEnabled = await this.userService.isEmailEnabled(
                  colaborador._id.toString()
                )
                if (!emailEnabled) continue
                await this.emailService.sendInvoiceApprovedToColaborador(
                  colaborador.email,
                  {
                    clientId:
                      expense.clientId?.toString?.() ??
                      String(expense.clientId),
                    providerName: colaborador.name,
                    invoiceNumber: `${invoiceData.serie || ''}-${
                      invoiceData.correlativo || ''
                    }`,
                    date:
                      invoiceData.fechaEmision ||
                      new Date().toISOString().split('T')[0],
                    type: invoiceData.tipoComprobante || 'Factura',
                    approvedBy: approverName,
                  }
                )
                this.logger.debug(
                  `Notificación de aprobación enviada a colaborador ${colaborador.email}`
                )
              } catch (error) {
                this.logger.warn(
                  `Error al enviar notificación de aprobación al colaborador ${colaborador.email}:`,
                  error
                )
              }
            }
          }
        } else {
          this.logger.debug(
            'No hay colaboradores activos para notificar sobre la factura aprobada'
          )
        }
      } catch (error) {
        this.logger.error(
          'Error al notificar a colaboradores sobre factura aprobada:',
          error
        )
      }
    } catch (error) {
      this.logger.error('Error al enviar notificación de aprobación:', error)
    }
  }

  async rejectInvoice(id: string, approvalDto: ApprovalDto) {
    const expense = await this.findOne(id)
    if (!expense) {
      throw new NotFoundException(`Factura con ID ${id} no encontrada`)
    }

    if (expense.status === 'approved') {
      throw new HttpException(
        'La factura ya ha sido aprobada',
        HttpStatus.BAD_REQUEST
      )
    }

    if (expense.status === 'rejected') {
      throw new HttpException(
        'La factura ya ha sido rechazada',
        HttpStatus.BAD_REQUEST
      )
    }

    if (!approvalDto.reason) {
      throw new HttpException(
        'Se requiere un motivo para rechazar la factura',
        HttpStatus.BAD_REQUEST
      )
    }

    const validUserId = null
    const userName = null
    const userLastName = null
    const reviewerId = approvalDto.userId || undefined

    const updatedExpense = await this.expenseRepository
      .findByIdAndUpdate(
        id,
        {
          status: 'rejected',
          statusDate: new Date(),
          rejectedBy: validUserId,
          rejectionReason: approvalDto.reason,
          $push: {
            reviewHistory: {
              action: 'rejected',
              reviewerId,
              reviewedAt: new Date(),
              reason: approvalDto.reason,
            },
          },
        },
        { new: true }
      )
      .exec()

    if (updatedExpense && updatedExpense.createdBy) {
      const invoiceData = updatedExpense.data
        ? JSON.parse(updatedExpense.data)
        : {}
      const nombreComprobante = `${invoiceData.serie || ''}-${invoiceData.correlativo || ''}`

      this.notificationsService
        .create({
          userId: updatedExpense.createdBy as unknown as string,
          title: 'Comprobante Rechazado',
          message: `Tu comprobante ${nombreComprobante} ha sido rechazado. Motivo: ${approvalDto.reason}`,
          type: 'error',
          actionUrl: `/mis-rendiciones/${this.expenseReportIdString(updatedExpense)}/detalle`,
        })
        .catch(err =>
          this.logger.error('Error creando notificación de rechazo', err)
        )
    }

    this.logger.log(`Factura ${id} rechazada exitosamente`)
    return updatedExpense
  }

  private async sendRejectionEmails(
    expense: any,
    validUserId: string | null,
    userName?: string | null,
    userLastName?: string | null,
    rejectionReason?: string
  ) {
    try {
      let rejectorName = 'Administrador del Sistema'

      if (userName && userLastName) {
        rejectorName = `${userName} ${userLastName}`
        this.logger.debug(
          `Usando información de rechazador encontrada previamente: ${rejectorName}`
        )
      } else if (validUserId) {
        try {
          const rejector = await this.userService.findOne(validUserId)
          if (rejector) {
            rejectorName = rejector.name

            this.logger.debug(
              `Información de rechazador obtenida de la BD: ${rejectorName}`
            )
          }
        } catch (error) {
          this.logger.warn(
            'No se pudo obtener información del administrador que rechazó'
          )
        }
      } else {
        this.logger.warn(
          'Usando valor predeterminado para el rechazador: Administrador del Sistema'
        )
      }

      const invoiceData = expense.data ? JSON.parse(expense.data) : {}

      if (expense.createdBy) {
        try {
          if (!/^[0-9a-fA-F]{24}$/.test(expense.createdBy)) {
            this.logger.warn(`ID del creador inválido: ${expense.createdBy}`)
            return
          }

          const creator = await this.userService.findOne(expense.createdBy)

          if (creator && creator.email) {
            const creatorFullName = creator.name

            this.logger.debug(
              `Enviando notificación de rechazo a ${creator.email}, rol: ${creator.role}`
            )
          } else {
            this.logger.warn(
              'No se encontró email para el creador de la factura'
            )
          }
        } catch (error) {
          this.logger.warn(
            'No se pudo encontrar al creador de la factura:',
            error
          )
        }
      } else {
        this.logger.warn(
          'La factura no tiene un creador asignado (createdBy es null)'
        )
      }
    } catch (error) {
      this.logger.error('Error al enviar notificación de rechazo:', error)
    }
  }

  async remove(id: string, actor: ExpenseActorContext): Promise<void> {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      throw new Error(`ID de expense inválido: ${id}`)
    }

    const existing = await this.loadExpenseOrThrow(id)
    await this.assertCanMutateExpense(existing, actor)

    const reportId = this.expenseReportIdString(existing)
    if (reportId) {
      // Devuelve el saldo al presupuesto de caja chica. Va ANTES de desenganchar
      // el comprobante: el reverso necesita saber a qué rendición pertenecía.
      await this.expenseReportService.descargarGastoDelPresupuesto(id)
      await this.expenseReportService.removeExpenseFromReport(reportId, id)
    }

    const expenseIdObject = Types.ObjectId.createFromHexString(id)
    await this.expenseRepository
      .findOneAndDelete({ _id: expenseIdObject })
      .exec()
  }

  async findBySeriAndCorrelativo(
    serie: string,
    correlativo: string,
    clientId?: string,
    rucEmisor?: string
  ): Promise<Expense | null> {
    try {
      this.logger.debug(
        `Buscando duplicados - Serie: ${serie}, Correlativo: ${correlativo}, clientId: ${clientId}, rucEmisor: ${rucEmisor}`
      )

      const query: any = {}

      if (clientId) {
        query.clientId = clientId
      }

      this.logger.debug(`Query de búsqueda: ${JSON.stringify(query)}`)

      const expenses = await this.expenseRepository.find(query).exec()

      this.logger.debug(`Encontradas ${expenses.length} facturas para revisar`)

      for (const expense of expenses) {
        if (expense.data) {
          try {
            let dataObj: any = expense.data
            if (typeof dataObj === 'string') {
              dataObj = JSON.parse(dataObj)
            }

            this.logger.debug(
              `Revisando factura ${expense._id}: Serie: ${dataObj?.serie}, Correlativo: ${dataObj?.correlativo}, RUC: ${dataObj?.rucEmisor}`
            )

            if (
              dataObj &&
              dataObj.serie === serie &&
              dataObj.correlativo === correlativo &&
              (!rucEmisor || dataObj.rucEmisor === rucEmisor)
            ) {
              this.logger.debug(`DUPLICADO ENCONTRADO: Factura ${expense._id}`)
              return expense
            }
          } catch (error) {
            this.logger.warn(
              `Error parseando data de factura ${expense._id}:`,
              error
            )
            continue
          }
        }
      }

      this.logger.debug(`No se encontraron duplicados`)
      return null
    } catch (error) {
      this.logger.error(
        'Error al buscar factura por serie y correlativo:',
        error
      )
      throw new HttpException(
        'Error al validar duplicados',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  private async uploadExpensePdfAndGetUrl(
    file: Express.Multer.File,
    clientId: string
  ): Promise<string> {
    const fileNameSafe = `expenses/${clientId}/${Date.now()}-${(file.originalname || 'document.pdf').replace(/\s+/g, '-')}`
    return this.uploadService.uploadImage(file, fileNameSafe)
  }

  async validateWithSunatData(
    id: string,
    data: {
      rucEmisor: string
      serie: string
      correlativo: string
      fechaEmision: string
      montoTotal?: number
      tipoComprobante?: string
    },
    clientId: string,
    actor: ExpenseActorContext
  ) {
    const expense = await this.loadExpenseOrThrow(id)
    await this.assertCanMutateExpense(expense, actor)

    try {
      // Paso 1: obtener razón social fresca para el RUC emisor
      let updatedData: string | undefined
      if (data.rucEmisor) {
        const { razonSocial } = await this.getRucInfo(data.rucEmisor, clientId)
        if (razonSocial) {
          let parsed: any = {}
          try {
            parsed =
              typeof expense.data === 'string'
                ? JSON.parse(expense.data)
                : (expense.data ?? {})
          } catch {}
          updatedData = JSON.stringify({ ...parsed, razonSocial })
          this.logger.log(
            `[validateWithSunatData] razonSocial actualizada para RUC ${data.rucEmisor}: ${razonSocial}`
          )
        }
      }

      // Paso 2: validar comprobante con SUNAT
      const configSunat = await this.sunatConfigService.findOne(clientId)
      const { validation, expenseStatus } =
        await this.validateWithSunatIfPossible(data, clientId, configSunat?.ruc)

      // Paso 3: guardar razón social + resultado de validación en un solo update
      const updateDoc: any = {
        sunatValidation: validation,
        status: expenseStatus,
      }
      if (updatedData !== undefined) updateDoc.data = updatedData

      const updatedExpense = await this.expenseRepository
        .findByIdAndUpdate(id, updateDoc, { new: true })
        .exec()

      return {
        message: 'Validación SUNAT completada',
        status: validation.status,
        details: validation.details,
        expense: updatedExpense,
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        return {
          message: 'No se encontró configuración SUNAT para esta empresa',
          status: 'SUNAT_CONFIG_NOT_FOUND',
          details: 'La empresa no tiene configuración SUNAT configurada',
          expense: expense,
        }
      }
      throw error
    }
  }

  // ─── Aprobación por documento: cadena de centro de costo / Contabilidad ─────

  /**
   * 'approved' si la cadena N1/N2/[N2 sel] del comprobante ya se completó.
   * `approverChain === undefined` significa que la cadena aún no se construyó
   * (la rendición no ha sido enviada — ver `buildExpenseChains`); eso NO es lo
   * mismo que una cadena ya construida y vacía por regla 1.6 (todos los niveles
   * omitidos), que sí cuenta como completada. Sin esta distinción, `0 >= 0`
   * marca como "approved" tanto lo uno como lo otro.
   */
  private chainCoordStatus(expense: {
    approverChain?: ChainStep[]
    approvalLevel?: number
    requiredLevels?: number
  }): 'pending' | 'approved' {
    if (expense.approverChain === undefined) return 'pending'
    const required = expense.requiredLevels ?? expense.approverChain.length ?? 0
    const level = expense.approvalLevel ?? 0
    return level >= required ? 'approved' : 'pending'
  }

  private computeCombinedStatus(
    coordStatus: string | undefined,
    contStatus: string | undefined
  ): 'pending' | 'approved' | 'rejected' {
    if (coordStatus === 'rejected' || contStatus === 'rejected')
      return 'rejected'
    if (coordStatus === 'approved' && contStatus === 'approved')
      return 'approved'
    return 'pending'
  }

  /**
   * Aprueba UN paso de la cadena de centro de costo (regla 1.4) del
   * comprobante. Aprobación en paralelo entre niveles: cualquier aprobador de
   * cualquier paso aún pendiente puede actuar, sin importar el orden (N2
   * puede aprobar antes que N1), o Superadministrador. Cuando TODOS los pasos
   * quedan aprobados, el comprobante pasa a la espera del gate de
   * Contabilidad — que exige la cadena completa, no un paso puntual.
   */
  async approveByCoord(
    id: string,
    actor: ExpenseActorContext
  ): Promise<Expense> {
    const expense = await this.loadExpenseOrThrow(id)
    this.assertCompanyAccess(expense, actor)
    await this.assertReportInStatus(
      expense,
      ['submitted'],
      'Esta rendición todavía no fue enviada por el colaborador. Los aprobadores intervienen recién cuando la envía.'
    )
    const existing = expense as any
    const chain: ChainStep[] = existing.approverChain ?? []
    if (chain.length === 0) {
      throw new BadRequestException(
        'Este comprobante aún no tiene una cadena de aprobación asignada — la rendición debe estar enviada.'
      )
    }
    const cubreA = await this.userService.idsTitularesCubiertosPara(actor.userId, existing)
    const stepIndex = findActionableChainStep({ chain, actorId: actor.userId, actorRole: actor.roleName, cubreA })
    if (stepIndex === -1) {
      throw new ForbiddenException('No te corresponde aprobar este comprobante en este momento')
    }

    const step = chain[stepIndex]
    const approvalLevel = existing.approvalLevel ?? 0
    const history = existing.approvalHistory ?? []
    history.push({ level: step.level, approvedBy: actor.userId, action: 'approved', date: new Date() })
    chain[stepIndex] = {
      ...plainChainStep(step),
      approved: true,
      approvedBy: new Types.ObjectId(actor.userId),
      approvedAt: new Date(),
      approvedOnBehalfOf: titularCubiertoEnPaso(step, actor.userId, cubreA),
    }
    const nextLevel = approvalLevel + 1
    const isComplete = isChainFullyApproved(chain)
    const contStatus = existing.contabilidadStatus ?? 'pending'
    const newCombined = this.computeCombinedStatus(isComplete ? 'approved' : 'pending', contStatus)

    const updated = await this.expenseRepository
      .findByIdAndUpdate(
        id,
        { $set: { approverChain: chain, approvalLevel: nextLevel, approvalHistory: history, status: newCombined } },
        { new: true }
      )
      .exec()
    if (!updated) throw new NotFoundException(`Expense ${id} no encontrado`)
    this.notificationsService
      .create({
        userId: String(expense.createdBy),
        title: 'Comprobante revisado por un aprobador',
        message: isComplete
          ? 'Tu comprobante fue aprobado por todos sus aprobadores.'
          : `Tu comprobante fue aprobado por ${describeChainStep(step)}. Falta la aprobación de los demás niveles pendientes.`,
        type: 'info',
        actionUrl: `/mis-rendiciones/${this.expenseReportIdString(expense)}/detalle`,
      })
      .catch(() => {})

    // VD-133: la cadena es consecutiva, así que al firmar este paso le toca al
    // siguiente nivel — y hay que avisarle. Antes no hacía falta: se notificaba a
    // todos los niveles al construir la cadena porque cualquiera podía firmar en
    // cualquier momento. Sin esto, el N2 no se enteraría nunca de su turno.
    const reportIdStr = this.expenseReportIdString(expense)
    if (!isComplete && reportIdStr) {
      // Sin contexto a propósito: el comprobante no tiene dueño con nombre
      // (`Expense` guarda `createdBy`, no un `userId` populado) ni el reporte
      // populado, así que lo que se pasaba desde aquí llegaba siempre vacío y
      // el correo salía con la fila en blanco. Los resuelve el propio aviso.
      void this.expenseReportService.notifySiguientePasoDeCadena(
        reportIdStr,
        chain,
        {}
      )
    }

    // VD-87: si con este comprobante quedaron aprobados TODOS los gastos de la
    // rendición, pasa directo a Contabilidad y se le envía el correo — sin un
    // segundo paso de "aprobar la rendición completa".
    if (isComplete && reportIdStr) {
      await this.expenseReportService
        .advanceToAccountingIfAllExpensesApproved(reportIdStr)
        .catch(() => {})
    }
    return updated
  }

  async rejectByCoord(
    id: string,
    actor: ExpenseActorContext,
    reason: string
  ): Promise<Expense> {
    if (!reason?.trim())
      throw new BadRequestException('El motivo de rechazo es obligatorio.')
    const expense = await this.loadExpenseOrThrow(id)
    this.assertCompanyAccess(expense, actor)
    // Mismo candado que `approveByCoord`: los aprobadores actúan solo con la
    // rendición enviada. Sin él, un rechazo con la rendición ya en
    // `pending_accounting` dejaba el comprobante en tierra de nadie: al
    // corregirlo se reinicia su cadena de centro de costo, y entonces no puede
    // aprobarlo ni un aprobador (la rendición ya no está en `submitted`) ni
    // Contabilidad (exige esa cadena completa). Contabilidad tiene su propia
    // vía para observar en esa fase: `rejectByContabilidad`, que devuelve la
    // rendición entera al colaborador.
    await this.assertReportInStatus(
      expense,
      ['submitted'],
      'Esta rendición ya no está en revisión de los aprobadores. Solo se puede observar un comprobante mientras la rendición está enviada.'
    )
    const existing = expense as any
    const chain: ChainStep[] = existing.approverChain ?? []
    const isAdminOverride = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.CONTABILIDAD].includes(actor.roleName as any)
    let rejectedAtLevel = (existing.approvalLevel ?? 0) + 1
    if (chain.length > 0) {
      // Aprobación en paralelo: cualquier aprobador de un paso aún pendiente
      // puede rechazar el comprobante completo — no solo "el turno actual".
      const cubreA = await this.userService.idsTitularesCubiertosPara(actor.userId, existing)
      const stepIndex = findActionableChainStep({ chain, actorId: actor.userId, actorRole: actor.roleName, cubreA })
      if (stepIndex === -1) {
        throw new ForbiddenException('No te corresponde rechazar este comprobante en este momento')
      }
      rejectedAtLevel = chain[stepIndex].level
    } else if (!isAdminOverride) {
      // Sin cadena configurada para este centro de costo: no hay un aprobador
      // de turno al que restringir, así que solo Administración/Contabilidad
      // pueden rechazar (evita que cualquier usuario autenticado lo haga).
      throw new ForbiddenException('No te corresponde rechazar este comprobante en este momento')
    }
    const history = existing.approvalHistory ?? []
    history.push({ level: rejectedAtLevel, approvedBy: actor.userId, action: 'rejected', notes: reason, date: new Date() })

    const updated = await this.expenseRepository
      .findByIdAndUpdate(
        id,
        {
          $set: {
            approvalHistory: history,
            status: 'rejected',
            rejectionReason: reason,
          },
        },
        { new: true }
      )
      .exec()
    if (!updated) throw new NotFoundException(`Expense ${id} no encontrado`)
    this.notificationsService
      .create({
        userId: String(expense.createdBy),
        title: 'Comprobante observado por un aprobador',
        message: `Tu comprobante fue rechazado por un aprobador: ${reason.slice(0, 80)}`,
        type: 'error',
        actionUrl: `/mis-rendiciones/${this.expenseReportIdString(expense)}/detalle`,
      })
      .catch(() => {})
    return updated
  }

  /** Gate final de Contabilidad, posterior a completar la cadena de centro de costo del comprobante. */
  async approveByContabilidad(
    id: string,
    actor: ExpenseActorContext
  ): Promise<Expense> {
    const expense = await this.loadExpenseOrThrow(id)
    this.assertCompanyAccess(expense, actor)
    // Contabilidad revisa recién cuando los aprobadores terminaron con TODA la
    // rendición, no comprobante por comprobante mientras ellos siguen: la
    // rendición llega a `pending_accounting` justamente cuando no queda ninguna
    // cadena de centro de costo pendiente.
    await this.assertReportInStatus(
      expense,
      ['pending_accounting'],
      'Esta rendición todavía no llegó a Contabilidad. Los aprobadores del centro de costo deben terminar con todos sus comprobantes primero.'
    )
    const existing = expense as any
    const coordStatus = this.chainCoordStatus(existing)
    if (coordStatus !== 'approved') {
      throw new BadRequestException(
        'Este comprobante aún no completó la cadena de aprobación de centro de costo (N1/N2). No puede aprobarse por Contabilidad todavía.'
      )
    }
    const newCombined = this.computeCombinedStatus(coordStatus, 'approved')
    const updated = await this.expenseRepository
      .findByIdAndUpdate(
        id,
        {
          $set: {
            contabilidadStatus: 'approved',
            contabilidadApprovedBy: actor.userId,
            contabilidadApprovedAt: new Date(),
            status: newCombined,
          },
        },
        { new: true }
      )
      .exec()
    if (!updated) throw new NotFoundException(`Expense ${id} no encontrado`)
    this.notificationsService
      .create({
        userId: String(expense.createdBy),
        title: 'Comprobante revisado por Contabilidad',
        message: `Tu comprobante fue aprobado por contabilidad.`,
        type: 'info',
        actionUrl: `/mis-rendiciones/${this.expenseReportIdString(expense)}/detalle`,
      })
      .catch(() => {})
    return updated
  }

  async rejectByContabilidad(
    id: string,
    actor: ExpenseActorContext,
    reason: string
  ): Promise<Expense> {
    if (!reason?.trim())
      throw new BadRequestException('El motivo de rechazo es obligatorio.')
    const expense = await this.loadExpenseOrThrow(id)
    this.assertCompanyAccess(expense, actor)
    const updated = await this.expenseRepository
      .findByIdAndUpdate(
        id,
        {
          $set: {
            contabilidadStatus: 'rejected',
            contabilidadApprovedBy: actor.userId,
            contabilidadApprovedAt: new Date(),
            contabilidadRejectionReason: reason,
            status: 'rejected',
            rejectionReason: reason,
          },
        },
        { new: true }
      )
      .exec()
    if (!updated) throw new NotFoundException(`Expense ${id} no encontrado`)

    // El rechazo es POR COMPROBANTE y la rendición SE QUEDA en
    // `pending_accounting`: Contabilidad tiene que poder observar varios
    // comprobantes en la misma revisión. Devolverla al colaborador es un acto
    // aparte y explícito — el botón "Rechazar rendición" (update → 'rejected'),
    // que ahí sí reabre los comprobantes no observados
    // (`reopenExpensesForCollaboratorCorrection`).
    //
    // Antes se devolvía la rendición desde aquí: el primer rechazo la sacaba de
    // `pending_accounting` y Contabilidad se quedaba sin botones para observar
    // los demás comprobantes (solo podía rechazar uno).
    this.notificationsService
      .create({
        userId: String(expense.createdBy),
        title: 'Comprobante observado por Contabilidad',
        message: `Contabilidad observó un comprobante de tu rendición: ${reason.slice(0, 80)}`,
        type: 'error',
        actionUrl: `/mis-rendiciones/${this.expenseReportIdString(expense)}/detalle`,
      })
      .catch(() => {})
    return updated
  }

  async batchApproveByCollaborator(
    reportId: string,
    actor: ExpenseActorContext
  ): Promise<{ approved: number }> {
    const report = await (this.expenseReportService as any).expenseReportModel
      ?.findById(reportId)
      .select('expenseIds clientId userId')
      .lean()
      .exec()
    if (!report)
      throw new NotFoundException(`Rendición ${reportId} no encontrada`)

    const clientId = this.normalizeClientId(report.clientId)
    if (
      actor.roleName !== ROLES.SUPER_ADMIN &&
      actor.clientId &&
      clientId !== actor.clientId
    ) {
      throw new ForbiddenException('No autorizado')
    }

    const ids = (report.expenseIds ?? []).map(
      (id: any) => new Types.ObjectId(String(id))
    )
    if (ids.length === 0) return { approved: 0 }

    const expenses = await this.expenseRepository
      .find({ _id: { $in: ids } })
      .select('contabilidadStatus approverChain approvalLevel requiredLevels status')
      .lean()
      .exec()

    let count = 0
    for (const expense of expenses) {
      const e = expense as any
      const contStatus = e.contabilidadStatus ?? 'pending'
      const coordStatus = this.chainCoordStatus(e)
      const combined = this.computeCombinedStatus(coordStatus, contStatus)
      if (combined === 'approved' && e.status !== 'approved') {
        await this.expenseRepository
          .findByIdAndUpdate(String(e._id), { $set: { status: 'approved' } })
          .exec()
        count++
      }
    }
    return { approved: count }
  }

  /**
   * Aprueba, para cada comprobante elegible del reporte, el paso pendiente en
   * el que le toca actuar al actor (aprobación en paralelo entre niveles —
   * un comprobante con más de un nivel pendiente solo resuelve el paso del
   * actor, los demás niveles siguen pendientes hasta que actúen sus propios
   * aprobadores).
   */
  async batchApproveByCoord(
    reportId: string,
    actor: ExpenseActorContext
  ): Promise<{ approved: number }> {
    const report = await (this.expenseReportService as any).expenseReportModel
      ?.findById(reportId)
      .select('expenseIds clientId')
      .lean()
      .exec()
    if (!report)
      throw new NotFoundException(`Rendición ${reportId} no encontrada`)

    const clientId = this.normalizeClientId(report.clientId)
    if (
      actor.roleName !== ROLES.SUPER_ADMIN &&
      actor.clientId &&
      clientId !== actor.clientId
    ) {
      throw new ForbiddenException('No autorizado')
    }

    const ids = (report.expenseIds ?? []).map(
      (id: any) => new Types.ObjectId(String(id))
    )
    if (ids.length === 0) return { approved: 0 }

    const expenses = await this.expenseRepository
      .find({ _id: { $in: ids } })
      .select('approverChain approvalLevel requiredLevels approvalHistory contabilidadStatus status createdBy expenseReportId total')
      .exec()

    // Todos los comprobantes del lote son de la misma rendición, así que la
    // suplencia se resuelve una vez y no una por comprobante.
    const cubreA = await this.userService.idsTitularesCubiertosPara(actor.userId, report)

    let count = 0
    for (const expense of expenses) {
      const e = expense as any
      const chain: ChainStep[] = e.approverChain ?? []
      if (chain.length === 0 || e.status === 'rejected') continue
      const stepIndex = findActionableChainStep({ chain, actorId: actor.userId, actorRole: actor.roleName, cubreA })
      if (stepIndex === -1) continue

      const step = chain[stepIndex]
      const approvalLevel = e.approvalLevel ?? 0
      const history = e.approvalHistory ?? []
      history.push({ level: step.level, approvedBy: actor.userId, action: 'approved', date: new Date() })
      chain[stepIndex] = {
        ...plainChainStep(step),
        approved: true,
        approvedBy: new Types.ObjectId(actor.userId),
        approvedAt: new Date(),
        approvedOnBehalfOf: titularCubiertoEnPaso(step, actor.userId, cubreA),
      }
      const nextLevel = approvalLevel + 1
      const isComplete = isChainFullyApproved(chain)
      const contStatus = e.contabilidadStatus ?? 'pending'
      const newCombined = this.computeCombinedStatus(isComplete ? 'approved' : 'pending', contStatus)
      await this.expenseRepository
        .findByIdAndUpdate(String(e._id), {
          $set: { approverChain: chain, approvalLevel: nextLevel, approvalHistory: history, status: newCombined },
        })
        .exec()
      count++
    }
    return { approved: count }
  }

  /**
   * Gastos directos del colaborador: expenses sin rendición (loose) + expenses de rendiciones isDirecta.
   */
  async findMyDirectExpenses(
    userId: string,
    clientId: string,
    filters: {
      tipo?: string
      dateFrom?: string
      dateTo?: string
      page?: number
      limit?: number
    } = {}
  ) {
    const page = Math.max(1, filters.page ?? 1)
    const limit = Math.min(100, filters.limit ?? 50)
    const skip = (page - 1) * limit

    // Obtener IDs de rendiciones directas del usuario
    const ExpenseReport = this.expenseReportService['expenseReportModel'] as any
    const directReportDocs = await ExpenseReport.find({
      userId: new Types.ObjectId(userId),
      clientId: new Types.ObjectId(clientId),
      isDirecta: true,
    })
      .select('_id status')
      .lean()
      .exec()
    const directReportIds = directReportDocs.map((r: any) => r._id)
    const directReportStatusMap = new Map<string, string>(
      directReportDocs.map((r: any) => [String(r._id), r.status])
    )

    // Buscar expenses: loose (sin rendición) O en rendición directa, del mismo usuario/cliente
    const match: any = {
      clientId: new Types.ObjectId(clientId),
      createdBy: userId,
      $or: [
        { expenseReportId: { $exists: false } },
        { expenseReportId: null },
        ...(directReportIds.length > 0
          ? [{ expenseReportId: { $in: directReportIds } }]
          : []),
      ],
    }

    if (filters.tipo && filters.tipo !== 'all') {
      match.expenseType = filters.tipo
    }

    const pipeline: any[] = [{ $match: match }]

    if (filters.dateFrom || filters.dateTo) {
      pipeline.push({
        $addFields: {
          _parsedDate: {
            $cond: {
              if: {
                $regexMatch: {
                  input: { $ifNull: ['$fechaEmision', ''] },
                  regex: /^\d{2}\/\d{2}\/\d{4}$/,
                },
              },
              then: {
                $dateFromString: {
                  dateString: {
                    $concat: [
                      { $substr: ['$fechaEmision', 6, 4] },
                      '-',
                      { $substr: ['$fechaEmision', 3, 2] },
                      '-',
                      { $substr: ['$fechaEmision', 0, 2] },
                    ],
                  },
                },
              },
              else: {
                $dateFromString: {
                  dateString: { $ifNull: ['$fechaEmision', '1970-01-01'] },
                  onError: new Date('1970-01-01'),
                },
              },
            },
          },
        },
      })
      const dateMatch: any = {}
      if (filters.dateFrom) dateMatch.$gte = new Date(filters.dateFrom)
      if (filters.dateTo) {
        const to = new Date(filters.dateTo)
        to.setHours(23, 59, 59, 999)
        dateMatch.$lte = to
      }
      pipeline.push({ $match: { _parsedDate: dateMatch } })
    }

    pipeline.push(
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: '_cat',
        },
      },
      {
        $lookup: {
          from: 'projects',
          localField: 'proyectId',
          foreignField: '_id',
          as: '_proj',
        },
      }
    )

    const countPipeline = [...pipeline, { $count: 'total' }]
    const countResult = await this.expenseRepository
      .aggregate(countPipeline)
      .exec()
    const total = countResult[0]?.total ?? 0

    pipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    )

    const expenses = await this.expenseRepository.aggregate(pipeline).exec()

    const data = expenses.map((e: any) => ({
      ...e,
      _categoryDoc: e._cat?.[0] ?? null,
      _projectDoc: e._proj?.[0] ?? null,
      _reportStatus: e.expenseReportId
        ? (directReportStatusMap.get(String(e.expenseReportId)) ?? null)
        : null,
    }))

    return { data, total, page, limit, pages: Math.ceil(total / limit) }
  }

  /**
   * Agrupa los expenses loose del usuario en una rendición directa y la envía a contabilidad.
   */
  async submitMyDirectExpenses(
    userId: string,
    clientId: string,
    motivo?: string
  ) {
    // Buscar expenses loose (sin rendición) del usuario
    const looseExpenses = await this.expenseRepository
      .find({
        clientId: new Types.ObjectId(clientId),
        createdBy: userId,
        $or: [
          { expenseReportId: { $exists: false } },
          { expenseReportId: null },
        ],
      })
      .select('_id total')
      .lean()
      .exec()

    if (looseExpenses.length === 0) {
      throw new BadRequestException('No tienes gastos pendientes de enviar.')
    }

    const today = new Date()
    const label = today.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    const report = await this.expenseReportService.create(
      {
        motivo: motivo?.trim() || `Gastos del ${label}`,
        isDirecta: true,
        userId,
        clientId,
      } as any,
      userId,
      true
    )

    const reportId = (report as any)._id.toString()

    // Vincular expenses a la rendición
    await this.expenseRepository
      .updateMany(
        { _id: { $in: looseExpenses.map((e: any) => e._id) } },
        { $set: { expenseReportId: new Types.ObjectId(reportId) } }
      )
      .exec()

    // Registrar en la rendición
    await this.expenseReportService['expenseReportModel']
      .findByIdAndUpdate(reportId, {
        $set: { expenseIds: looseExpenses.map((e: any) => e._id) },
      })
      .exec()

    // Enviar a pending_accounting (isDirecta auto-transiciona desde submitted)
    const updatedReport = await this.expenseReportService.update(reportId, {
      status: 'submitted',
    } as any)

    return {
      reportId,
      expensesSubmitted: looseExpenses.length,
      report: updatedReport,
    }
  }
}
