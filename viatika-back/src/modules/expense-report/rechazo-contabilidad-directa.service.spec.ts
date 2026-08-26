import { Types } from 'mongoose'
import { ExpenseReportService } from './expense-report.service'

/**
 * Contabilidad no podia rechazar comprobantes de una rendicion DIRECTA: el
 * boton estaba escondido en el front tras un `@if (!report.isDirecta)`, asi que
 * tenia "Marcar revisado" pero nada con que devolver el comprobante.
 *
 * El backend siempre lo soporto. Estas pruebas lo fijan, para que el arreglo del
 * front no se pueda revertir sin que salte algo.
 *
 * Observar un comprobante ya NO devuelve la rendicion (asi Contabilidad puede
 * observar varios); el reset de los no observados corre al rechazar la
 * RENDICION completa, que es lo que cubre esta prueba.
 */
describe('reopenExpensesForCollaboratorCorrection — rendicion directa', () => {
  const reportId = new Types.ObjectId()
  const observado = new Types.ObjectId()
  const otro = new Types.ObjectId()

  const montar = (report: any) => {
    const svc = Object.create(ExpenseReportService.prototype) as any
    const actualizados: any[] = []
    svc.expenseReportModel = {
      findById: () => ({
        select: () => ({ lean: () => ({ exec: async () => report }) }),
      }),
    }
    svc.expenseModel = {
      find: () => ({
        select: () => ({
          lean: () => ({
            exec: async () => [
              { _id: observado, status: 'rejected', approverChain: [{ level: 1, approved: true, approverIds: [] }] },
              { _id: otro, status: 'approved', approverChain: [{ level: 1, approved: true, approverIds: [] }] },
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

  const reportDirecta = () => ({
    _id: reportId,
    isDirecta: true,
    expenseIds: [observado, otro],
  })

  // Los demas comprobantes se reabren: si quedaran aprobados, el colaborador no
  // podria corregir la rendicion.
  it('reabre los otros comprobantes y deja el observado como rechazado', async () => {
    const { svc, actualizados } = montar(reportDirecta())
    await svc.reopenExpensesForCollaboratorCorrection(String(reportId))

    const delOtro = actualizados.find(a => a.id === String(otro))
    expect(delOtro.set.status).toBe('pending')
    expect(delOtro.set.approverChain[0].approved).toBe(false)

    const delObservado = actualizados.find(a => a.id === String(observado))
    expect(delObservado.set.status).toBeUndefined()
    expect(delObservado.set.approvalLevel).toBe(0)
  })

  it('sin rendicion no toca nada', async () => {
    const { svc, actualizados } = montar(null)
    await svc.reopenExpensesForCollaboratorCorrection(String(reportId))
    expect(actualizados).toHaveLength(0)
  })
})
