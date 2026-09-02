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

type MonthBucket = 'solicitudes' | 'directas' | 'cajaChica'

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
      reportByStatus,
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
      this.aggregateReportByStatus(clientOid, query, scope, range),
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
      monthlySeries,
      topCategories: this.withPct(topCategories, totalGasto),
      topOrdenesTrabajo,
      topProjects,
      topCollaborators,
      topLocations: destinos,
      departments,
      pendientes: { devoluciones, porRendir },
      reportByStatus,
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
    const match: Record<string, any> = {
      clientId,
      createdAt: { $gte: from, $lte: to },
    }
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

  /** Match para rendiciones (todo reporte que no sea caja chica). */
  private reportMatch(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    from: Date,
    to: Date
  ): Record<string, any> {
    const effectiveDate = { $ifNull: ['$createdAt', { $toDate: '$_id' }] }
    const match: Record<string, any> = {
      clientId,
      isCajaChica: { $ne: true },
      // Las solicitudes (type='viatico') SÍ cuentan como rendiciones: es lo que
      // hace la página /rendiciones. Solo se excluye la caja chica.
      $expr: {
        $and: [{ $gte: [effectiveDate, from] }, { $lte: [effectiveDate, to] }],
      },
    }
    if (scope.projectIds) match.projectId = { $in: scope.projectIds }
    this.applyUserMatch(match, query, scope)
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

  private async aggregateTopCategories(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ) {
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
          _id: '$categoryId',
          amount: { $sum: this.amountExpr },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'cat',
        },
      },
      {
        $project: {
          _id: 0,
          categoryId: '$_id',
          name: {
            $ifNull: [{ $arrayElemAt: ['$cat.name', 0] }, 'Sin categoría'],
          },
          amount: 1,
          count: 1,
        },
      },
    ])
  }

  private async aggregateTopProjects(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ) {
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
          _id: '$proyectId',
          amount: { $sum: this.amountExpr },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'projects',
          localField: '_id',
          foreignField: '_id',
          as: 'proj',
        },
      },
      {
        $project: {
          _id: 0,
          projectId: '$_id',
          name: {
            $ifNull: [
              { $arrayElemAt: ['$proj.name', 0] },
              'Sin centro de costo',
            ],
          },
          amount: 1,
          count: 1,
        },
      },
    ])
  }

  /**
   * Top de órdenes de trabajo por gasto. Los comprobantes sin OT quedan fuera:
   * el gráfico compara OT entre sí y un bloque "sin OT" se comería el ranking.
   */
  private async aggregateTopOrdenesTrabajo(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ) {
    const match = this.expenseMatch(clientId, query, scope, range.from, range.to)
    // `match` ya puede traer la OT filtrada; el guard solo aplica cuando no la hay.
    if (!match.ordenTrabajoId) match.ordenTrabajoId = { $nin: [null, undefined] }
    return this.expenseModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$ordenTrabajoId',
          amount: { $sum: this.amountExpr },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: 'ordentrabajos',
          localField: '_id',
          foreignField: '_id',
          as: 'ot',
        },
      },
      {
        $project: {
          _id: 0,
          ordenTrabajoId: '$_id',
          name: {
            $ifNull: [{ $arrayElemAt: ['$ot.nombre', 0] }, 'OT eliminada'],
          },
          amount: 1,
          count: 1,
        },
      },
    ])
  }

  private async aggregateTopCollaborators(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ) {
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
          _id: '$createdBy',
          amount: { $sum: this.amountExpr },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 10 },
      {
        $addFields: {
          userOid: {
            $convert: {
              input: '$_id',
              to: 'objectId',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userOid',
          foreignField: '_id',
          as: 'usr',
        },
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: {
            $ifNull: [{ $arrayElemAt: ['$usr.name', 0] }, 'Sin asignar'],
          },
          amount: 1,
          count: 1,
        },
      },
    ])
  }

  // ─── Serie mensual ────────────────────────────────────────────────────────

  /**
   * Las tres barras que pidió el cliente para cada mes: lo solicitado en fondos,
   * lo gastado en rendiciones directas y el consumo de caja chica (el consumo,
   * no el saldo de la bolsa). Se mantienen separadas a propósito: mezclar
   * anticipo y gasto en una sola serie era lo que hacía ilegible el gráfico
   * anterior.
   */
  private async aggregateMonthlySeries(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ): Promise<
    { month: string; solicitudes: number; directas: number; cajaChica: number }[]
  > {
    const [solicitudes, porTipo] = await Promise.all([
      this.reportModel.aggregate([
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
            _id: {
              $dateToString: {
                format: '%Y-%m',
                date: { $ifNull: ['$createdAt', { $toDate: '$_id' }] },
              },
            },
            amount: { $sum: this.solicitudAmountExpr },
          },
        },
        { $project: { _id: 0, month: '$_id', amount: 1 } },
      ]),
      this.aggregateExpenseMonthlyByReportType(clientId, query, scope, range),
    ])

    const meses = new Map<
      string,
      { month: string; solicitudes: number; directas: number; cajaChica: number }
    >()
    const bucket = (month: string) => {
      if (!meses.has(month)) {
        meses.set(month, { month, solicitudes: 0, directas: 0, cajaChica: 0 })
      }
      return meses.get(month)!
    }

    for (const s of solicitudes) bucket(s.month).solicitudes += s.amount
    for (const t of porTipo) {
      if (t.bucket === 'directas') bucket(t.month).directas += t.amount
      if (t.bucket === 'cajaChica') bucket(t.month).cajaChica += t.amount
    }

    return Array.from(meses.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    )
  }

  /**
   * Gasto mensual clasificado por el tipo del reporte al que pertenece cada
   * comprobante. El tipo solo vive en el reporte, de ahí el `$lookup`.
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
      {
        $lookup: {
          from: 'expensereports',
          localField: 'expenseReportId',
          foreignField: '_id',
          as: 'rep',
        },
      },
      {
        $addFields: {
          rep0: { $arrayElemAt: ['$rep', 0] },
        },
      },
      {
        $addFields: {
          bucket: {
            $cond: [
              { $eq: ['$rep0.isCajaChica', true] },
              'cajaChica',
              {
                $cond: [
                  { $eq: ['$rep0.isDirecta', true] },
                  'directas',
                  'solicitudes',
                ],
              },
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

  private async aggregateReportByStatus(
    clientId: Types.ObjectId,
    query: DashboardQueryDto,
    scope: DashboardScope,
    range: ResolvedRange
  ): Promise<{ status: string; count: number; budget: number }[]> {
    return this.reportModel.aggregate([
      {
        $match: this.reportMatch(clientId, query, scope, range.from, range.to),
      },
      {
        $group: {
          _id: { $ifNull: ['$status', 'open'] },
          count: { $sum: 1 },
          budget: { $sum: { $ifNull: ['$budget', 0] } },
        },
      },
      { $project: { _id: 0, status: '$_id', count: 1, budget: 1 } },
      { $sort: { count: -1 } },
    ])
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
    return Array.from(deps).sort((a, b) => {
      // "Sin departamento" siempre al final del selector.
      if (a === DEPARTAMENTO_DESCONOCIDO) return 1
      if (b === DEPARTAMENTO_DESCONOCIDO) return -1
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
      { $limit: 100 },
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
