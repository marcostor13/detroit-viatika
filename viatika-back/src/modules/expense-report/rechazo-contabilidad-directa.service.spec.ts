import { Types } from 'mongoose'
import { ExpenseReportService } from './expense-report.service'

/**
 * Contabilidad no podia rechazar comprobantes de una rendicion DIRECTA: el
 * boton estaba escondido en el front tras un `@if (!report.isDirecta)`, asi que
 * tenia "Marcar revisado" pero nada con que devolver el comprobante.
 *
 * El backend siempre lo soporto. Estas pruebas lo fijan, para que el arreglo del
 * front no se pueda revertir sin que salte algo.
 */
describe('returnToCollaboratorOnAccountingRejection — rendicion directa', () => {
  const reportId = new Types.ObjectId()
  const observado = new Types.ObjectId()
  const otro = new Types.ObjectId()

  const montar = (report: any) => {
    const svc = Object.create(ExpenseReportService.prototype) as any
    const actualizados: any[] = []
    svc.expenseReportModel = {
      findById: async () => report,
    }
    svc.expenseModel = {
      find: () => ({
        select: () => ({
          lean: () => ({
            exec: async () => [
              { _id: observado, approverChain: [{ level: 1, approved: true, approverIds: [] }] },
              { _id: otro, approverChain: [{ level: 1, approved: true, approverIds: [] }] },
            ],
          }),
        }),
      }),
      updateOne: async (f: any, u: any) => actualizados.push({ id: String(f._id), set: u.$set }),
    }
    svc.notificationsService = { create: async () => undefined }
    svc.emailService = {}
    svc.userService = { findEmailNameClient: async () => null, isEmailEnabled: async () => false }
    svc.logger = { warn: () => undefined, error: () => undefined }
    return { svc, actualizados }
  }

  const reportDirecta = (status: string) => ({
    _id: reportId,
    isDirecta: true,
    status,
    expenseIds: [observado, otro],
    save: async function () { return this },
  })

  it('una directa en contabilidad vuelve al colaborador', async () => {
    const report = reportDirecta('pending_accounting')
    const { svc } = montar(report)
    await svc.returnToCollaboratorOnAccountingRejection(
      String(reportId),
      String(observado),
      'Falta el detalle del gasto'
    )
    expect(report.status).toBe('rejected')
  })

  // Los demas comprobantes se reabren: si quedaran aprobados, el colaborador no
  // podria corregir la rendicion.
  it('reabre los otros comprobantes y deja el observado como rechazado', async () => {
    const { svc, actualizados } = montar(reportDirecta('pending_accounting'))
    await svc.returnToCollaboratorOnAccountingRejection(
      String(reportId),
      String(observado),
      'Falta el detalle'
    )
    const delOtro = actualizados.find(a => a.id === String(otro))
    expect(delOtro.set.status).toBe('pending')
    expect(delOtro.set.approverChain[0].approved).toBe(false)

    const delObservado = actualizados.find(a => a.id === String(observado))
    expect(delObservado.set.status).toBeUndefined()
  })

  it('en un estado donde no aplica no toca nada', async () => {
    const report = reportDirecta('closed')
    const { svc, actualizados } = montar(report)
    await svc.returnToCollaboratorOnAccountingRejection(
      String(reportId),
      String(observado),
      'motivo'
    )
    expect(report.status).toBe('closed')
    expect(actualizados).toHaveLength(0)
  })
})
