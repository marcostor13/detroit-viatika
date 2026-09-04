import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Expense, ExpenseDocument } from '../expense/entities/expense.entity'
import {
  ExpenseReport,
  ExpenseReportDocument,
} from '../expense-report/entities/expense-report.entity'
import { User, UserDocument } from '../user/schemas/user.schema'
import { DashboardQueryDto } from './dto/dashboard-query.dto'
import { AccountingConfigService } from '../accounting-config/accounting-config.service'
import { ROLES } from '../auth/enums/roles.enum'
import {
  DEPARTAMENTO_DESCONOCIDO,
  DESTINO_EXTERIOR,
  departamentoLabel,
  DEPARTAMENTO_COORDS,
} from '../../common/peru-departments.util'
import { ESTADOS_SOLICITUD_CERRADA } from '../../common/solicitud-estados.constants'

/**
 * Días desde que el colaborador recibe el dinero hasta que se le considera
 * atrasado en rendir. Lo fijó el cliente en la revisión del dashboard.
 */
export const DIAS_PARA_RENDIR = 20

/**
 * Roles que ven la empresa completa. El resto (Colaborador y Coordinador) solo
 * ve sus centros de costo asignados: es el pedido del cliente para que cada
 * coordinador vea su gestión y no la de los demás.
 */
const ROLES_SIN_LIMITE: string[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.CONTABILIDAD,
  ROLES.TESORERIA,
]

/** Estados de devolución que siguen abiertos. */
const ESTADOS_DEVOLUCION_PENDIENTE = ['pending', 'proof_uploaded']

/**
 * Rendiciones que ya no van a convertirse en gasto: quedan fuera de los dos
 * lados del corte (ni cerrado ni en proceso).
 */
const ESTADOS_RENDICION_MUERTA = ['rejected', 'cancelled']

/**
 * Estado del gasto para el corte "cerrado / en proceso" que pidió el cliente.
 * Cerrado es el `closed` que deja `ExpenseReportService.close()`, el único que
 * bloquea toda edición posterior; el resto del camino es proceso.
 */
type EstadoGasto = 'cerrado' | 'enProceso'

/** Expresión Mongo que clasifica un gasto según el estado de su rendición. */
const ESTADO_GASTO_EXPR = {
  $cond: [{ $eq: ['$rep0.status', 'closed'] }, 'cerrado', 'enProceso'],
}

interface ResolvedRange {
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
}

/** Quién mira el dashboard. Define hasta dónde llega su vista. */
export interface DashboardViewer {
  userId: string
  role: string
}

/**
 * Recorte de la vista: qué centros de costo y qué reportes puede sumar esta
 * consulta. `undefined` en un campo significa "sin recorte por ahí".
 */
interface DashboardScope {
  /** Centros de costo permitidos (rol acotado) o el filtrado explícitamente. */
  projectIds?: Types.ObjectId[]
  /** Solo los registros propios: colaborador acotado sin centros de costo. */
  ownerId?: Types.ObjectId
  /** Reportes que pasan los filtros de OT y departamento. */
  reportIds?: Types.ObjectId[]
  /** true si la vista quedó limitada al alcance del usuario. */
  restricted: boolean
}

type MonthBucket = 'directas' | 'cajaChica'

/** Una fila de cualquiera de los cuatro rankings, partida por estado. */
export interface RankingRow {
  name: string
  cerrado: number
  enProceso: number
  amount: number
  count: number
  categoryId?: string
  ordenTrabajoId?: string
  projectId?: string
  userId?: string
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Expense.name)
    private readonly expenseModel: Model<ExpenseDocument>,
    @InjectModel(ExpenseReport.name)
    private readonly reportModel: Model<ExpenseReportDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly accountingConfigService: AccountingConfigService
  ) {}

  async getDashboard(
    clientId: string,
    query: DashboardQueryDto,
    viewer: DashboardViewer
  ) {
    const clientOid = new Types.ObjectId(clientId)
    const range = this.resolveRange(query.dateFrom, query.dateTo)
    // Los totales están consolidados en la moneda base de la empresa.
    const accountingConfig =
      await this.accountingConfigService.getEffective(clientId)

    const scope = await this.resolveScope(clientOid, query, viewer)

    const [
      expenseAgg,
      expenseAggPrev,
      expenseByType,
      topCategories,
      topProjects,
      topCollaborators,
      topOrdenesTrabajo,
      monthlySeries,
      solicitudAgg,
      destinos,
      departments,
      devoluciones,
      porRendir,
    ] = await Promise.all([
      this.aggregateExpenseTotals(clientOid, query, scope, range.from, range.to),
      this.aggregateExpenseTotals(
        clientOid,
        query,
        scope,
        range.prevFrom,
        range.prevTo
      ),
      this.aggregateExpenseByType(clientOid, query, scope, range),
      this.aggregateTopCategories(clientOid, query, scope, range),
      this.aggregateTopProjects(clientOid, query, scope, range),
      this.aggregateTopCollaborators(clientOid, query, scope, range),
      this.aggregateTopOrdenesTrabajo(clientOid, query, scope, range),
      this.aggregateMonthlySeries(clientOid, query, scope, range),
      this.aggregateSolicitudTotals(clientOid, query, scope, range),
      this.aggregateDestinos(clientOid, query, scope, range),
      this.listDepartments(clientOid),
      this.listDevolucionesPendientes(clientOid, query, scope),
      this.listPendientesPorRendir(clientOid, query, scope),
    ])

    const totalGasto = expenseAgg.amount
    const totalGastoPrev = expenseAggPrev.amount
    const deltaPct =
      totalGastoPrev > 0
        ? ((totalGasto - totalGastoPrev) / totalGastoPrev) * 100
        : totalGasto > 0
          ? 100
          : 0

    const sum = (rows: { amount: number }[]) =>
      rows.reduce((acc, r) => acc + r.amount, 0)
    const vencidos = porRendir.filter(r => r.dias > DIAS_PARA_RENDIR)

    return {
      range: {
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
      },
      currency: accountingConfig.monedaBase || 'PEN',
      scope: {
        restricted: scope.restricted,
        projectIds: (scope.projectIds ?? []).map(id => id.toString()),
      },
      kpis: {
        totalGasto,
        gastoCount: expenseAgg.count,
        totalGastoPrev,
        totalGastoDeltaPct: deltaPct,
        anticipoSolicitado: solicitudAgg.amount,
        anticipoSolicitadoCount: solicitudAgg.count,
        devolucionesPendientesAmount: sum(devoluciones),
        devolucionesPendientesCount: devoluciones.length,
        porRendirAmount: sum(porRendir),
        porRendirCount: porRendir.length,
        porRendirVencidoAmount: sum(vencidos),
        porRendirVencidoCount: vencidos.length,
      },
      /** Días a partir de los cuales una rendición pendiente se marca atrasada. */
      diasParaRendir: DIAS_PARA_RENDIR,
      porRendirBuckets: this.agruparPorAntiguedad(porRendir),
      monthlySeries,
      topCategories: this.withPct(topCategories, totalGasto),
      topOrdenesTrabajo,
      topProjects,
      topCollaborators,
      topLocations: destinos,
      departments,
      pendientes: { devoluciones, porRendir },
      expenseByType,
    }
  }

  // ─── Alcance de la vista ──────────────────────────────────────────────────

  /**
   * Traduce rol, permisos y filtros a los recortes que aplican todas las
   * agregaciones. Los filtros que no se pueden expresar sobre el propio
   * documento (OT y departamento del destino) se resuelven aquí a una lista de
   * reportes, que es lo que después cruzan gastos y solicitudes.
   */
  private async resolveScope(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    viewer: DashboardViewer
  ): Promise<DashboardScope> {
    const scope: DashboardScope = { restricted: false }

    if (!ROLES_SIN_LIMITE.includes(viewer.role)) {
      const user = await this.userModel
        .findById(viewer.userId)
        .select('permissions.projectIds')
        .lean<{ permissions?: { projectIds?: string[] } }>()
        .exec()
      const asignados = (user?.permissions?.projectIds ?? [])
        .filter(id => Types.ObjectId.isValid(id))
        .map(id => new Types.ObjectId(id))

      scope.restricted = true
      if (asignados.length) {
        scope.projectIds = asignados
      } else {
        // Sin centros de costo asignados no hay nada que "supervisar": se le
        // muestra solo lo suyo en vez de abrirle la empresa entera.
        scope.ownerId = new Types.ObjectId(viewer.userId)
      }
    }

    // El filtro explícito de centro de costo se interseca con lo permitido.
    if (query.projectId && Types.ObjectId.isValid(query.projectId)) {
      const pedido = new Types.ObjectId(query.projectId)
      const permitido =
        !scope.projectIds ||
        scope.projectIds.some(id => id.equals(pedido))
      scope.projectIds = permitido ? [pedido] : []
    }

    const porOt = await this.reportIdsByOrdenTrabajo(clientId, query)
    const porDepartamento = await this.reportIdsByDepartamento(clientId, query)
    scope.reportIds = this.intersectIds(porOt, porDepartamento)

    return scope
  }

  /** Intersección de dos listas opcionales de ids (undefined = sin filtro). */
  private intersectIds(
    a?: Types.ObjectId[],
    b?: Types.ObjectId[]
  ): Types.ObjectId[] | undefined {
    if (!a) return b
    if (!b) return a
    const set = new Set(b.map(id => id.toString()))
    return a.filter(id => set.has(id.toString()))
  }

  /**
   * Reportes alcanzados por el filtro de OT. Se aceptan tanto los que llevan la
   * OT en el propio reporte (solicitud o rendición directa) como aquellos cuyos
   * comprobantes la llevan: la OT se elige a veces al crear el reporte y otras
   * en cada gasto.
   */
  private async reportIdsByOrdenTrabajo(
    clientId: Types.ObjectId,
    query: DashboardQueryDto
  ): Promise<Types.ObjectId[] | undefined> {
    if (!query.ordenTrabajoId || !Types.ObjectId.isValid(query.ordenTrabajoId)) {
      return undefined
    }
    const otId = new Types.ObjectId(query.ordenTrabajoId)

    const [porReporte, porGasto] = await Promise.all([
      this.reportModel
        .find({
          clientId,
          $or: [
            { viaticoOrdenTrabajoId: otId },
            { directaOrdenTrabajoId: otId },
          ],
        })
        .select('_id')
        .lean<{ _id: Types.ObjectId }[]>()
        .exec(),
      this.expenseModel
        .find({ clientId, ordenTrabajoId: otId })
        .select('expenseReportId')
        .lean<{ expenseReportId?: Types.ObjectId }[]>()
        .exec(),
    ])

    const ids = new Map<string, Types.ObjectId>()
    for (const r of porReporte) ids.set(r._id.toString(), r._id)
    for (const e of porGasto) {
      if (e.expenseReportId) ids.set(e.expenseReportId.toString(), e.expenseReportId)
    }
    return Array.from(ids.values())
  }

  /**
   * Reportes cuyo destino cae en el departamento pedido. El departamento no
   * está persistido: se deduce del texto de `viaticoPlace` (ver
   * `peru-departments.util`), así que la resolución se hace en Node sobre los
   * destinos de la empresa, que son pocos.
   */
  private async reportIdsByDepartamento(
    clientId: Types.ObjectId,
    query: DashboardQueryDto
  ): Promise<Types.ObjectId[] | undefined> {
    if (!query.department) return undefined

    const rows = await this.reportModel
      .find({ clientId, viaticoPlace: { $exists: true, $nin: [null, ''] } })
      .select('_id viaticoPlace')
      .lean<{ _id: Types.ObjectId; viaticoPlace?: string }[]>()
      .exec()

    return rows
      .filter(r => departamentoLabel(r.viaticoPlace) === query.department)
      .map(r => r._id)
  }

  // ─── Helpers de rango ─────────────────────────────────────────────────────

  private resolveRange(dateFrom?: string, dateTo?: string): ResolvedRange {
    // Los filtros llegan como 'YYYY-MM-DD'. `new Date('YYYY-MM-DD')` los interpreta
    // como medianoche UTC y un `setHours` posterior corre en la zona local, lo que
    // desplaza el borde y deja fuera registros del propio día en zonas con offset
    // negativo (p. ej. America/Lima, UTC-5): al filtrar "hasta 15/07" se perdían los
    // viáticos creados esa misma tarde. Se construye el borde como día local completo.
    const to =
      this.parseLocalDate(dateTo, true) ??
      (() => {
        const d = new Date()
        d.setHours(23, 59, 59, 999)
        return d
      })()

    const from =
      this.parseLocalDate(dateFrom, false) ??
      (() => {
        const d = new Date(to)
        d.setMonth(d.getMonth() - 6)
        d.setHours(0, 0, 0, 0)
        return d
      })()

    const spanMs = to.getTime() - from.getTime()
    const prevTo = new Date(from.getTime() - 1)
    const prevFrom = new Date(prevTo.getTime() - spanMs)

    return { from, to, prevFrom, prevTo }
  }

  /**
   * Convierte 'YYYY-MM-DD' en el inicio (00:00:00.000) o fin (23:59:59.999) de ese
   * día calendario en la zona local del servidor. Evita el corrimiento de un día
   * que produce `new Date('YYYY-MM-DD')` (parseado en UTC) frente a `setHours` local.
   */
  private parseLocalDate(
    value: string | undefined,
    endOfDay: boolean
  ): Date | null {
    if (!value) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
    if (!m) {
      const d = new Date(value)
      if (isNaN(d.getTime())) return null
      d.setHours(
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0
      )
      return d
    }
    const [, y, mo, da] = m
    return new Date(
      Number(y),
      Number(mo) - 1,
      Number(da),
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0
    )
  }

  // ─── Matches ──────────────────────────────────────────────────────────────

  /**
   * Resuelve a qué colaborador se acota la consulta combinando el recorte del
   * rol con el filtro elegido. `null` = sin acotar; `false` = no debe devolver
   * nada (pidió los datos de otro estando acotado a los suyos).
   *
   * Sin esta combinación, poner `collaboratorId` en la URL pisaba el recorte y
   * un colaborador veía los gastos de cualquier otro.
   */
  private resolveCollaborator(
    query: DashboardQueryDto,
    scope: DashboardScope
  ): string | null | false {
    const propio = scope.ownerId?.toString()
    const pedido = query.collaboratorId || null
    if (!propio) return pedido
    if (!pedido || pedido === propio) return propio
    return false
  }

  /** Match base para gastos (Expense) en el rango/filtros. */
  private expenseMatch(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    from: Date,
    to: Date
  ): Record<string, any> {
    return {
      ...this.expenseMatchSinFecha(clientId, query, scope),
      createdAt: { $gte: from, $lte: to },
    }
  }

  /**
   * Los mismos filtros pero sin acotar por la fecha del comprobante, para
   * cuando el rango se aplica sobre el reporte al que pertenece y no sobre el
   * comprobante en si.
   */
  private expenseMatchSinFecha(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope
  ): Record<string, any> {
    const match: Record<string, any> = { clientId }
    if (scope.projectIds) match.proyectId = { $in: scope.projectIds }
    const creador = this.resolveCollaborator(query, scope)
    if (creador === false) match.createdBy = { $in: [] }
    else if (creador) match.createdBy = creador
    if (query.categoryId && Types.ObjectId.isValid(query.categoryId))
      match.categoryId = new Types.ObjectId(query.categoryId)
    // La OT sí vive en el comprobante: se filtra directo, más preciso que por reporte.
    if (query.ordenTrabajoId && Types.ObjectId.isValid(query.ordenTrabajoId))
      match.ordenTrabajoId = new Types.ObjectId(query.ordenTrabajoId)
    // El departamento solo se conoce a nivel de reporte.
    if (query.department) match.expenseReportId = { $in: scope.reportIds ?? [] }
    return match
  }

  /**
   * Match para solicitudes de fondos (ExpenseReport con type='viatico'), que en
   * Detroit son la fuente de los anticipos: la colección `advances` quedó sin uso.
   */
  private solicitudMatch(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    from?: Date,
    to?: Date
  ): Record<string, any> {
    const match: Record<string, any> = { clientId, type: 'viatico' }
    if (from && to) {
      // Las solicitudes antiguas no tienen `createdAt` (los timestamps se
      // agregaron después): se cae a la fecha embebida en el _id.
      const effectiveDate = { $ifNull: ['$createdAt', { $toDate: '$_id' }] }
      match.$expr = {
        $and: [{ $gte: [effectiveDate, from] }, { $lte: [effectiveDate, to] }],
      }
    }
    if (scope.projectIds) match.projectId = { $in: scope.projectIds }
    this.applyUserMatch(match, query, scope)
    if (query.categoryId && Types.ObjectId.isValid(query.categoryId))
      match['viaticoLines.categoryId'] = new Types.ObjectId(query.categoryId)
    if (scope.reportIds) match._id = { $in: scope.reportIds }
    return match
  }

  /** Aplica a `userId` (reportes) el colaborador resuelto para la consulta. */
  private applyUserMatch(
    match: Record<string, any>,
    query: DashboardQueryDto,
    scope: DashboardScope
  ) {
    const usuario = this.resolveCollaborator(query, scope)
    if (usuario === false || (usuario && !Types.ObjectId.isValid(usuario))) {
      match.userId = { $in: [] }
    } else if (usuario) {
      match.userId = new Types.ObjectId(usuario)
    }
  }

  /**
   * Monto en moneda base. Usa el `montoBase` congelado del comprobante y solo
   * cae a `total` en documentos previos al multimoneda, donde `montoBase` no
   * existe y el importe ya estaba asumido en moneda base.
   *
   * Sin esto los KPIs sumarían dólares y soles en un mismo total.
   */
  private readonly amountExpr = {
    $convert: {
      input: { $ifNull: ['$montoBase', '$total'] },
      to: 'double',
      onError: 0,
      onNull: 0,
    },
  }

  /** Monto solicitado de un viático, llevado a moneda base con el TC congelado. */
  private readonly solicitudAmountExpr = {
    $multiply: [
      { $ifNull: ['$viaticoAmount', 0] },
      { $ifNull: ['$tipoCambio', 1] },
    ],
  }

  // ─── Gastos ───────────────────────────────────────────────────────────────

  private async aggregateExpenseTotals(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    from: Date,
    to: Date
  ): Promise<{ amount: number; count: number }> {
    const res = await this.expenseModel.aggregate([
      { $match: this.expenseMatch(clientId, query, scope, from, to) },
      {
        $group: {
          _id: null,
          amount: { $sum: this.amountExpr },
          count: { $sum: 1 },
        },
      },
    ])
    return { amount: res[0]?.amount ?? 0, count: res[0]?.count ?? 0 }
  }

  private async aggregateExpenseByType(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ): Promise<{ type: string; amount: number; count: number }[]> {
    return this.expenseModel.aggregate([
      {
        $match: this.expenseMatch(
          clientId,
          query,
          scope,
          range.from,
          range.to
        ),
      },
      {
        $group: {
          _id: { $ifNull: ['$expenseType', 'factura'] },
          amount: { $sum: this.amountExpr },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, type: '$_id', amount: 1, count: 1 } },
      { $sort: { amount: -1 } },
    ])
  }

  /**
   * Ranking de gastos por una dimension (categoria, OT, centro de costo,
   * colaborador) partido en cerrado / en proceso, que es como el cliente quiere
   * leer los cuatro graficos: cuanto de lo que se ve ya esta liquidado y cuanto
   * sigue en camino.
   *
   * El estado vive en la rendicion, no en el comprobante, de ahi el `$lookup`.
   * Las rendiciones rechazadas y anuladas se descartan: no son ninguno de los
   * dos lados del corte.
   */
  private async aggregateRankingPorEstado(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange,
    opts: {
      /** Campo por el que se agrupa, ej. '$categoryId'. */
      groupBy: string
      /** Coleccion y campo del nombre legible. */
      lookup?: { from: string; nameField: string }
      /** Nombre cuando el lookup no encuentra nada. */
      fallbackName: string
      /** Clave con la que viaja el id en la respuesta. */
      idKey: 'categoryId' | 'ordenTrabajoId' | 'projectId' | 'userId'
      limit: number
      /** El campo agrupado es string y hay que convertirlo para el lookup. */
      idEsString?: boolean
      /** Condiciones extra sobre el comprobante. */
      matchExtra?: Record<string, any>
    }
  ): Promise<RankingRow[]> {
    const match = {
      ...this.expenseMatch(clientId, query, scope, range.from, range.to),
      ...(opts.matchExtra ?? {}),
    }

    const filas: {
      id: any
      estado: EstadoGasto
      amount: number
      count: number
      name?: string
    }[] = await this.expenseModel.aggregate([
      { $match: match },
      ...this.lookupRendicion(),
      {
        $group: {
          _id: { id: opts.groupBy, estado: ESTADO_GASTO_EXPR },
          amount: { $sum: this.amountExpr },
          count: { $sum: 1 },
        },
      },
      {
        $addFields: {
          idParaLookup: opts.idEsString
            ? {
                $convert: {
                  input: '$_id.id',
                  to: 'objectId',
                  onError: null,
                  onNull: null,
                },
              }
            : '$_id.id',
        },
      },
      ...(opts.lookup
        ? [
            {
              $lookup: {
                from: opts.lookup.from,
                localField: 'idParaLookup',
                foreignField: '_id',
                as: 'ref',
              },
            },
          ]
        : []),
      {
        $project: {
          _id: 0,
          id: '$_id.id',
          estado: '$_id.estado',
          amount: 1,
          count: 1,
          name: opts.lookup
            ? { $arrayElemAt: [`$ref.${opts.lookup.nameField}`, 0] }
            : null,
        },
      },
    ])

    // Las dos mitades de una misma dimension llegan como filas separadas.
    const porId = new Map<string, RankingRow>()
    for (const f of filas) {
      const clave = String(f.id ?? '')
      const cur =
        porId.get(clave) ??
        ({
          name: f.name || opts.fallbackName,
          cerrado: 0,
          enProceso: 0,
          amount: 0,
          count: 0,
          [opts.idKey]: clave || undefined,
        } as RankingRow)
      if (f.name) cur.name = f.name
      cur[f.estado] += f.amount
      cur.amount += f.amount
      cur.count += f.count
      porId.set(clave, cur)
    }

    return Array.from(porId.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, opts.limit)
  }

  /** Trae la rendicion de cada comprobante y descarta las muertas. */
  private lookupRendicion() {
    return [
      {
        $lookup: {
          from: 'expensereports',
          localField: 'expenseReportId',
          foreignField: '_id',
          as: 'rep',
        },
      },
      { $addFields: { rep0: { $arrayElemAt: ['$rep', 0] } } },
      {
        $match: {
          'rep0.status': { $nin: ESTADOS_RENDICION_MUERTA },
        },
      },
    ]
  }

  private aggregateTopCategories(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ) {
    return this.aggregateRankingPorEstado(clientId, query, scope, range, {
      groupBy: '$categoryId',
      lookup: { from: 'categories', nameField: 'name' },
      fallbackName: 'Sin categoría',
      idKey: 'categoryId',
      limit: 8,
    })
  }

  private aggregateTopProjects(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ) {
    return this.aggregateRankingPorEstado(clientId, query, scope, range, {
      groupBy: '$proyectId',
      lookup: { from: 'projects', nameField: 'name' },
      fallbackName: 'Sin centro de costo',
      idKey: 'projectId',
      limit: 8,
    })
  }

  /**
   * Los comprobantes sin OT quedan fuera: el grafico compara OT entre si y un
   * bloque "sin OT" se comeria el ranking.
   */
  private aggregateTopOrdenesTrabajo(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ) {
    return this.aggregateRankingPorEstado(clientId, query, scope, range, {
      groupBy: '$ordenTrabajoId',
      lookup: { from: 'ordentrabajos', nameField: 'nombre' },
      fallbackName: 'OT eliminada',
      idKey: 'ordenTrabajoId',
      limit: 8,
      matchExtra: { ordenTrabajoId: { $nin: [null, undefined] } },
    })
  }

  private aggregateTopCollaborators(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ) {
    return this.aggregateRankingPorEstado(clientId, query, scope, range, {
      groupBy: '$createdBy',
      lookup: { from: 'users', nameField: 'name' },
      fallbackName: 'Sin asignar',
      idKey: 'userId',
      limit: 10,
      idEsString: true,
    })
  }


  // ─── Serie mensual ────────────────────────────────────────────────────────

  /**
   * Las cuatro barras de cada mes: lo solicitado en fondos, lo que el
   * colaborador termino gastando contra esa solicitud, lo gastado en rendicion
   * directa y el consumo de caja chica (el consumo, no el saldo de la bolsa).
   *
   * Las dos primeras barras se anclan al mes de la SOLICITUD, no al dia en que
   * se subio cada comprobante: la gente viaja, vuelve y recien entonces carga
   * sus gastos, casi siempre ya entrado el mes siguiente. Anclando al
   * comprobante, agosto salia con S/ 20 mil solicitados y S/ 0 rendidos aunque
   * la plata si estuviera sustentada, y la distancia entre las dos barras
   * dejaba de significar lo que dice el subtitulo.
   *
   * Directa y caja chica no tienen contraparte que comparar, asi que siguen
   * contando por la fecha de su propio comprobante.
   */
  private async aggregateMonthlySeries(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ): Promise<
    {
      month: string
      solicitudes: number
      rendicionSolicitud: number
      directas: number
      cajaChica: number
    }[]
  > {
    const solicitudes: { _id: Types.ObjectId; month: string; amount: number }[] =
      await this.reportModel.aggregate([
        {
          $match: {
            ...this.solicitudMatch(
              clientId,
              query,
              scope,
              range.from,
              range.to
            ),
            // Una solicitud rechazada nunca se pago ni se va a rendir: en un
            // grafico que compara solicitado contra rendido, dejarla dentro
            // abre una brecha que no existe.
            status: { $nin: ESTADOS_RENDICION_MUERTA },
            // La reposicion de caja chica tambien es un ExpenseReport
            // type='viatico', pero no se rinde: su consumo ya es la cuarta
            // barra. Contarla aqui inflaba "Solicitud de fondos" con plata que
            // ninguna "Rendicion de solicitud" podia responder.
            isSolicitudCajaChica: { $ne: true },
          },
        },
        {
          $project: {
            month: {
              $dateToString: {
                format: '%Y-%m',
                date: { $ifNull: ['$createdAt', { $toDate: '$_id' }] },
              },
            },
            amount: this.solicitudAmountExpr,
          },
        },
      ])

    const [gastoPorSolicitud, porTipo] = await Promise.all([
      this.aggregateGastoDeSolicitudes(
        clientId,
        query,
        scope,
        solicitudes.map(s => s._id)
      ),
      this.aggregateExpenseMonthlyByReportType(clientId, query, scope, range),
    ])

    const meses = new Map<
      string,
      {
        month: string
        solicitudes: number
        rendicionSolicitud: number
        directas: number
        cajaChica: number
      }
    >()
    const bucket = (month: string) => {
      if (!meses.has(month)) {
        meses.set(month, {
          month,
          solicitudes: 0,
          rendicionSolicitud: 0,
          directas: 0,
          cajaChica: 0,
        })
      }
      return meses.get(month)!
    }

    for (const s of solicitudes) {
      const mes = bucket(s.month)
      mes.solicitudes += s.amount
      mes.rendicionSolicitud += gastoPorSolicitud.get(s._id.toString()) ?? 0
    }
    for (const t of porTipo) bucket(t.month)[t.bucket] += t.amount

    return Array.from(meses.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    )
  }

  /**
   * Cuanto se sustento contra cada solicitud, sin importar cuando se subio el
   * comprobante. Devuelve un mapa reporte -> monto para que el llamador lo
   * cuelgue del mes de la solicitud.
   */
  private async aggregateGastoDeSolicitudes(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    reportIds: Types.ObjectId[]
  ): Promise<Map<string, number>> {
    if (!reportIds.length) return new Map()
    const rows: { _id: Types.ObjectId; amount: number }[] =
      await this.expenseModel.aggregate([
        {
          $match: {
            ...this.expenseMatchSinFecha(clientId, query, scope),
            expenseReportId: { $in: reportIds },
          },
        },
        {
          $group: {
            _id: '$expenseReportId',
            amount: { $sum: this.amountExpr },
          },
        },
      ])
    return new Map(rows.map(r => [r._id.toString(), r.amount]))
  }

  /**
   * Gasto mensual de rendicion directa y caja chica, por la fecha del propio
   * comprobante. El tipo solo vive en el reporte, de ahi el `$lookup`; lo que
   * pertenece a una solicitud queda fuera porque se cuenta en el mes de esa
   * solicitud.
   */
  private async aggregateExpenseMonthlyByReportType(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ): Promise<{ month: string; bucket: MonthBucket; amount: number }[]> {
    return this.expenseModel.aggregate([
      {
        $match: this.expenseMatch(
          clientId,
          query,
          scope,
          range.from,
          range.to
        ),
      },
      ...this.lookupRendicion(),
      {
        $match: {
          $or: [{ 'rep0.isCajaChica': true }, { 'rep0.isDirecta': true }],
        },
      },
      {
        $addFields: {
          bucket: {
            $cond: [
              { $eq: ['$rep0.isCajaChica', true] },
              'cajaChica',
              'directas',
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            bucket: '$bucket',
          },
          amount: { $sum: this.amountExpr },
        },
      },
      {
        $project: {
          _id: 0,
          month: '$_id.month',
          bucket: '$_id.bucket',
          amount: 1,
        },
      },
    ])
  }

  // ─── Solicitudes de fondos ────────────────────────────────────────────────

  private async aggregateSolicitudTotals(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ): Promise<{ amount: number; count: number }> {
    const res = await this.reportModel.aggregate([
      {
        $match: this.solicitudMatch(
          clientId,
          query,
          scope,
          range.from,
          range.to
        ),
      },
      {
        $group: {
          _id: null,
          amount: { $sum: this.solicitudAmountExpr },
          count: { $sum: 1 },
        },
      },
    ])
    return { amount: res[0]?.amount ?? 0, count: res[0]?.count ?? 0 }
  }

  // ─── Destinos ─────────────────────────────────────────────────────────────

  /**
   * Gasto por departamento de destino. El destino solo existe en la solicitud
   * de fondos (`viaticoPlace`): las rendiciones directas y la caja chica no
   * registran a dónde se viajó, así que no entran aquí.
   *
   * Se devuelven las dos lecturas del destino porque el cliente las usa
   * distinto: `amount` es lo efectivamente gastado (comprobantes) y
   * `solicitado` lo que se pidió por adelantado.
   */
  private async aggregateDestinos(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ): Promise<
    {
      place: string
      count: number
      amount: number
      solicitado: number
      /** false para el agrupado "Sin departamento", que no es un destino real. */
      identificado: boolean
      lat?: number
      lng?: number
    }[]
  > {
    const match = this.solicitudMatch(
      clientId,
      query,
      scope,
      range.from,
      range.to
    )
    const rows: {
      place?: string
      solicitado: number
      gasto: number
      count: number
    }[] = await this.reportModel.aggregate([
      { $match: { ...match, viaticoPlace: { $exists: true, $nin: [null, ''] } } },
      {
        $lookup: {
          from: 'expenses',
          localField: '_id',
          foreignField: 'expenseReportId',
          as: 'gastos',
        },
      },
      {
        $project: {
          _id: 0,
          place: '$viaticoPlace',
          solicitado: this.solicitudAmountExpr,
          gasto: {
            $sum: {
              $map: {
                input: '$gastos',
                as: 'g',
                in: {
                  $convert: {
                    input: { $ifNull: ['$$g.montoBase', '$$g.total'] },
                    to: 'double',
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
            },
          },
        },
      },
    ])

    const porDepartamento = new Map<
      string,
      { place: string; count: number; amount: number; solicitado: number }
    >()
    for (const row of rows) {
      const dep = departamentoLabel(row.place)
      const cur = porDepartamento.get(dep) ?? {
        place: dep,
        count: 0,
        amount: 0,
        solicitado: 0,
      }
      cur.count += 1
      cur.amount += row.gasto ?? 0
      cur.solicitado += row.solicitado ?? 0
      porDepartamento.set(dep, cur)
    }

    return Array.from(porDepartamento.values())
      .map(d => ({
        ...d,
        identificado: d.place !== DEPARTAMENTO_DESCONOCIDO,
        ...(DEPARTAMENTO_COORDS[d.place] ?? {}),
      }))
      .sort((a, b) => b.amount - a.amount || b.solicitado - a.solicitado)
  }

  /** Departamentos con al menos un destino registrado, para el selector del filtro. */
  private async listDepartments(clientId: Types.ObjectId): Promise<string[]> {
    const places = await this.reportModel.distinct('viaticoPlace', {
      clientId,
      viaticoPlace: { $exists: true, $nin: [null, ''] },
    })
    const deps = new Set<string>()
    for (const p of places as string[]) deps.add(departamentoLabel(p))
    // "Exterior" y "Sin departamento" no son departamentos: van al final, en
    // ese orden, para no partir la lista alfabética por la mitad.
    const alFinal = [DESTINO_EXTERIOR, DEPARTAMENTO_DESCONOCIDO]
    return Array.from(deps).sort((a, b) => {
      const pa = alFinal.indexOf(a)
      const pb = alFinal.indexOf(b)
      if (pa !== -1 || pb !== -1) return pa - pb
      return a.localeCompare(b, 'es')
    })
  }

  // ─── Pendientes (estado a hoy, sin recortar por el rango) ─────────────────

  /**
   * Quién debe devolver saldo. No se acota al rango de fechas a propósito: una
   * devolución pendiente lo sigue estando aunque su solicitud sea de hace
   * meses, y el cliente pidió justamente ver quién tiene deuda abierta.
   */
  private async listDevolucionesPendientes(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope
  ) {
    const match = this.solicitudMatch(clientId, query, scope)
    const rows = await this.reportModel.aggregate([
      {
        $match: {
          ...match,
          'viaticoReturnRecord.status': { $in: ESTADOS_DEVOLUCION_PENDIENTE },
        },
      },
      { $sort: { 'viaticoReturnRecord.dueDate': 1 } },
      { $limit: 50 },
      ...this.lookupUserName(),
      {
        $project: {
          _id: 0,
          reportId: { $toString: '$_id' },
          codigo: { $ifNull: ['$codigo', ''] },
          place: { $ifNull: ['$viaticoPlace', ''] },
          userName: 1,
          amount: { $ifNull: ['$viaticoReturnRecord.amountDue', 0] },
          desde: {
            $ifNull: [
              '$viaticoReturnRecord.dueDate',
              { $ifNull: ['$createdAt', { $toDate: '$_id' }] },
            ],
          },
        },
      },
    ])
    return rows.map(r => ({ ...r, dias: this.diasDesde(r.desde) }))
  }

  /**
   * Solicitudes con dinero YA entregado que todavía no cierran: es lo que el
   * colaborador tiene en la mano y aún no sustenta. Los estados que cuentan
   * como cerrada son los mismos del tope de solicitudes abiertas (VD-139), para
   * que el dashboard no diga "0 pendientes" mientras el sistema le bloquea la
   * siguiente solicitud.
   *
   * Las solicitudes aprobadas pero no pagadas quedan fuera: ahí no hay nada que
   * rendir todavía, el pendiente es de Tesorería.
   */
  private async listPendientesPorRendir(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope
  ) {
    const match = this.solicitudMatch(clientId, query, scope)
    const rows = await this.reportModel.aggregate([
      {
        $match: {
          ...match,
          status: { $nin: ESTADOS_SOLICITUD_CERRADA },
          isSolicitudCajaChica: { $ne: true },
          viaticoPaidAmount: { $gt: 0 },
        },
      },
      ...this.lookupUserName(),
      {
        $project: {
          _id: 0,
          reportId: { $toString: '$_id' },
          codigo: { $ifNull: ['$codigo', ''] },
          place: { $ifNull: ['$viaticoPlace', ''] },
          status: { $ifNull: ['$status', 'pending_l1'] },
          userName: 1,
          amount: {
            $multiply: [
              { $ifNull: ['$viaticoPaidAmount', 0] },
              { $ifNull: ['$tipoCambio', 1] },
            ],
          },
          // El plazo corre desde que el colaborador recibe el dinero; si el pago
          // se registró sin fecha, desde que pidió.
          desde: {
            $ifNull: [
              { $min: '$viaticoPayments.transferDate' },
              { $ifNull: ['$createdAt', { $toDate: '$_id' }] },
            ],
          },
        },
      },
    ])
    return rows
      .map(r => ({ ...r, dias: this.diasDesde(r.desde) }))
      .sort((a, b) => b.dias - a.dias)
  }

  /**
   * Reparte lo entregado sin rendir en tramos de antiguedad, en multiplos del
   * plazo pactado. Es la lectura que la lista no da: cuanto de la deuda es
   * reciente y cuanto lleva meses sin sustentar.
   */
  private agruparPorAntiguedad(
    filas: { dias: number; amount: number }[]
  ): { label: string; amount: number; count: number; vencido: boolean }[] {
    const n = DIAS_PARA_RENDIR
    const tramos = [
      { label: `Al día (≤ ${n} d)`, hasta: n, vencido: false },
      { label: `${n + 1}–${n * 2} d`, hasta: n * 2, vencido: true },
      { label: `${n * 2 + 1}–${n * 3} d`, hasta: n * 3, vencido: true },
      { label: `+ ${n * 3} d`, hasta: Infinity, vencido: true },
    ]
    return tramos.map(t => ({
      label: t.label,
      vencido: t.vencido,
      amount: 0,
      count: 0,
    })).map((acc, i) => {
      const desde = i === 0 ? -Infinity : tramos[i - 1].hasta
      for (const f of filas) {
        if (f.dias > desde && f.dias <= tramos[i].hasta) {
          acc.amount += f.amount
          acc.count += 1
        }
      }
      return acc
    })
  }

  /** Etapas de `$lookup` que resuelven `userId` al nombre del colaborador. */
  private lookupUserName() {
    return [
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'usr',
        },
      },
      {
        $addFields: {
          userName: {
            $ifNull: [{ $arrayElemAt: ['$usr.name', 0] }, 'Sin asignar'],
          },
        },
      },
    ]
  }

  private diasDesde(fecha?: Date | string | null): number {
    if (!fecha) return 0
    const d = new Date(fecha)
    if (isNaN(d.getTime())) return 0
    return Math.max(
      0,
      Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
    )
  }

  // ─── Salida ───────────────────────────────────────────────────────────────

  /**
   * Agrega el porcentaje sobre el gasto total. El denominador es el total del
   * periodo, no la suma del top: así los porcentajes del gráfico no suman 100
   * cuando hay categorías fuera del top, que es lo correcto.
   */
  private withPct<T extends { amount: number }>(rows: T[], total: number) {
    return rows.map(r => ({
      ...r,
      pct: total > 0 ? (r.amount / total) * 100 : 0,
    }))
  }
}
