import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  CajaChicaReport,
  CajaChicaReportDocument,
} from './entities/caja-chica-report.entity'
import {
  ExpenseReport,
  ExpenseReportDocument,
} from '../expense-report/entities/expense-report.entity'
import { CreateCajaChicaReportDto } from './dto/create-caja-chica-report.dto'
import {
  generarCodigoCorrelativo,
  maxSecuencia,
} from '../../common/codigo-correlativo.util'

@Injectable()
export class CajaChicaReportService {

  /**
   * Equivalente en moneda base de un gasto. Los comprobantes en moneda
   * extranjera guardan su conversión congelada; sumar `total` a secas mezclaría
   * monedas en el total del reporte de caja chica.
   */
  private expenseAmountBase(e: any): number {
    return Number(e?.montoBase ?? e?.total) || 0
  }
  constructor(
    @InjectModel(CajaChicaReport.name)
    private readonly model: Model<CajaChicaReportDocument>,
    @InjectModel(ExpenseReport.name)
    private readonly expenseReportModel: Model<ExpenseReportDocument>
  ) {}

  /**
   * Código autoincremental único por empresa (CC-0001), atómico y a prueba de
   * que el contador quede por detrás de los códigos ya emitidos. Ver
   * `generarCodigoCorrelativo`.
   */
  private async generateCodigo(clientId: string): Promise<string> {
    const cid = new Types.ObjectId(clientId)
    return generarCodigoCorrelativo({
      counters: this.model.db.collection('counters') as any,
      key: `caja-chica-report:${clientId}`,
      prefijo: 'CC',
      estaTomado: async codigo => !!(await this.model.exists({ clientId: cid, codigo })),
      ultimoEmitido: async () => {
        const docs = await this.model
          .find({ clientId: cid, codigo: { $regex: '^CC-\\d+$' } })
          .select('codigo')
          .lean<{ codigo: string }[]>()
          .exec()
        return maxSecuencia(docs.map(d => d.codigo), 'CC')
      },
    })
  }

  async create(
    dto: CreateCajaChicaReportDto,
    createdBy: string,
    clientId: string
  ) {
    const effectiveClientId = dto.clientId || clientId
    if (!effectiveClientId) {
      throw new BadRequestException('No se pudo determinar el cliente.')
    }
    const codigo = await this.generateCodigo(effectiveClientId)
    const report = new this.model({
      codigo,
      title: dto.title.trim(),
      clientId: new Types.ObjectId(effectiveClientId),
      createdBy: new Types.ObjectId(createdBy),
      status: 'draft',
      selectedReports: [],
      totalAmount: 0,
    })
    return report.save()
  }

  async findAllByClient(clientId: string) {
    const reports = await this.model
      .find({ clientId: new Types.ObjectId(clientId) })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean()
      .exec()

    // `totalAmount` es un valor denormalizado que puede quedar obsoleto, así que
    // lo recalculamos en vivo también para la lista. Para no caer en N+1, se
    // traen todas las rendiciones referenciadas en una sola consulta y se arma
    // un mapa expenseReportId -> suma de montos.
    const expReportIds = [
      ...new Set(
        reports.flatMap((r: any) =>
          (r.selectedReports ?? []).map((sr: any) => String(sr.expenseReportId))
        )
      ),
    ]

    const totalsByExpReport = new Map<string, number>()
    if (expReportIds.length) {
      const expReports = await this.expenseReportModel
        .find({ _id: { $in: expReportIds } })
        .populate('expenseIds', 'total montoBase moneda')
        .lean()
        .exec()
      for (const er of expReports as any[]) {
        const sum = (er.expenseIds ?? []).reduce(
          (s: number, e: any) => s + this.expenseAmountBase(e),
          0
        )
        totalsByExpReport.set(String(er._id), sum)
      }
    }

    const drifted: { _id: any; totalAmount: number }[] = []
    const result = reports.map((r: any) => {
      const totalAmount = (r.selectedReports ?? []).reduce(
        (sum: number, sr: any) =>
          sum + (totalsByExpReport.get(String(sr.expenseReportId)) ?? 0),
        0
      )
      if (totalAmount !== r.totalAmount) {
        drifted.push({ _id: r._id, totalAmount })
      }
      return { ...r, totalAmount }
    })

    // Persistir los que difieran para que exportaciones y futuras lecturas
    // queden corregidas.
    if (drifted.length) {
      await this.model.bulkWrite(
        drifted.map(d => ({
          updateOne: {
            filter: { _id: d._id },
            update: { $set: { totalAmount: d.totalAmount } },
          },
        }))
      )
    }

    return result
  }

  async findOne(id: string) {
    const report = await this.model
      .findById(id)
      .populate('createdBy', 'name email')
      .lean()
      .exec()
    if (!report) throw new NotFoundException(`Reporte CC ${id} no encontrado`)

    // Poblar cada rendición seleccionada con sus gastos
    const enriched = await Promise.all(
      (report.selectedReports ?? []).map(async (sr: any) => {
        const expReport = await this.expenseReportModel
          .findById(sr.expenseReportId)
          .populate('userId', 'name dni')
          .populate({
            path: 'expenseIds',
            populate: [
              { path: 'categoryId', select: 'name' },
              { path: 'proyectId', select: 'name code' },
            ],
          })
          .lean()
          .exec()
        return {
          ...sr,
          expenseReport: expReport,
        }
      })
    )

    // Recalcular el total desde los gastos ya poblados (mismo cálculo que el
    // front muestra por subtotal). `totalAmount` es un valor denormalizado que
    // solo se actualizaba al agregar/quitar rendiciones, por lo que podía
    // quedar obsoleto (p. ej. en 0) si los montos se ajustaban después. Lo
    // recalculamos en cada lectura y, si difiere, lo persistimos para que la
    // lista y las exportaciones también queden corregidas.
    const totalAmount = enriched.reduce((sum: number, sr: any) => {
      const expenses = (sr.expenseReport?.expenseIds ?? []) as any[]
      return sum + expenses.reduce((s, e) => s + this.expenseAmountBase(e), 0)
    }, 0)

    if (totalAmount !== report.totalAmount) {
      await this.model.updateOne({ _id: id }, { $set: { totalAmount } }).exec()
    }

    return { ...report, selectedReports: enriched, totalAmount }
  }

  async addReports(id: string, reportIds: string[], clientId: string) {
    const cajaChicaReport = await this.model.findById(id).exec()
    if (!cajaChicaReport)
      throw new NotFoundException(`Reporte CC ${id} no encontrado`)
    if (cajaChicaReport.status === 'finalized') {
      throw new BadRequestException(
        'No se puede modificar un reporte finalizado.'
      )
    }

    const existingIds = new Set(
      cajaChicaReport.selectedReports.map(r => String(r.expenseReportId))
    )

    for (const reportId of reportIds) {
      if (existingIds.has(reportId)) continue

      const expReport = await this.expenseReportModel
        .findById(reportId)
        .populate('userId', 'name email')
        .populate('expenseIds', 'total montoBase moneda')
        .lean()
        .exec()

      if (!expReport || !expReport.isCajaChica) {
        throw new BadRequestException(
          `La rendición ${reportId} no es de tipo caja chica o no existe.`
        )
      }
      if (String(expReport.clientId) !== clientId) {
        throw new BadRequestException(
          `La rendición ${reportId} no pertenece a este cliente.`
        )
      }

      const colaborador = expReport.userId as any
      cajaChicaReport.selectedReports.push({
        expenseReportId: new Types.ObjectId(reportId),
        colaboradorId: new Types.ObjectId(
          String(colaborador?._id || colaborador)
        ),
        colaboradorName: colaborador?.name || 'Colaborador',
      })
    }

    cajaChicaReport.totalAmount = await this.recalculateTotal(cajaChicaReport)
    return cajaChicaReport.save()
  }

  async removeReport(id: string, expenseReportId: string) {
    const report = await this.model.findById(id).exec()
    if (!report) throw new NotFoundException(`Reporte CC ${id} no encontrado`)
    if (report.status === 'finalized') {
      throw new BadRequestException(
        'No se puede modificar un reporte finalizado.'
      )
    }

    report.selectedReports = report.selectedReports.filter(
      r => String(r.expenseReportId) !== expenseReportId
    )
    report.totalAmount = await this.recalculateTotal(report)
    return report.save()
  }

  async finalize(id: string) {
    const report = await this.model.findById(id).exec()
    if (!report) throw new NotFoundException(`Reporte CC ${id} no encontrado`)
    if (report.status === 'finalized') {
      throw new BadRequestException('El reporte ya está finalizado.')
    }
    if (report.selectedReports.length === 0) {
      throw new BadRequestException(
        'Debe incluir al menos una rendición antes de finalizar.'
      )
    }
    // Congelar el total correcto al finalizar (los montos pudieron ajustarse
    // después de agregar las rendiciones).
    report.totalAmount = await this.recalculateTotal(report)
    report.status = 'finalized'
    return report.save()
  }

  private async recalculateTotal(
    report: CajaChicaReportDocument
  ): Promise<number> {
    let total = 0
    for (const sr of report.selectedReports) {
      const expReport = await this.expenseReportModel
        .findById(sr.expenseReportId)
        .populate('expenseIds', 'total montoBase moneda')
        .lean()
        .exec()
      if (!expReport) continue
      for (const exp of expReport.expenseIds as any[]) {
        total += this.expenseAmountBase(exp)
      }
    }
    return total
  }
}
