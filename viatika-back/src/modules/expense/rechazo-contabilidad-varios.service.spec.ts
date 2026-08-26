import { Types } from 'mongoose'
import { ExpenseService } from './expense.service'

/**
 * Contabilidad rechazaba UN comprobante y ya no podia rechazar mas: el rechazo
 * por comprobante devolvia toda la rendicion al colaborador, la sacaba de
 * `pending_accounting` y con eso desaparecian los botones de los demas
 * comprobantes.
 *
 * Ahora observar un comprobante solo lo marca a el; la rendicion sigue en
 * Contabilidad hasta que se use "Rechazar rendicion" (update → 'rejected'),
 * que es el unico acto que la devuelve y reabre los no observados.
 */
describe('ExpenseService.rejectByContabilidad — observar varios comprobantes', () => {
  const reportId = new Types.ObjectId()
  const expenseId = new Types.ObjectId()
  const actor = { userId: String(new Types.ObjectId()), roleName: 'Contabilidad', clientId: String(new Types.ObjectId()) }

  const montar = () => {
    const svc = Object.create(ExpenseService.prototype) as any
    const expense = {
      _id: expenseId,
      createdBy: new Types.ObjectId(),
      expenseReportId: reportId,
      status: 'pending',
    }
    const devueltas: string[] = []
    const notificaciones: any[] = []
    svc.findOne = async () => expense
    svc.assertCompanyAccess = () => undefined
    svc.expenseRepository = {
      findByIdAndUpdate: (_id: unknown, u: any) => ({
        exec: async () => ({ ...expense, ...u.$set }),
      }),
    }
    svc.expenseReportService = {
      reopenExpensesForCollaboratorCorrection: async (id: string) => {
        devueltas.push(id)
      },
    }
    svc.notificationsService = {
      create: (n: any) => {
        notificaciones.push(n)
        return { catch: () => undefined }
      },
    }
    svc.logger = { warn: () => undefined, error: () => undefined }
    return { svc, devueltas, notificaciones }
  }

  it('marca el comprobante como observado sin devolver la rendicion', async () => {
    const { svc, devueltas } = montar()
    const updated = await svc.rejectByContabilidad(
      String(expenseId),
      actor,
      'falta el detalle del gasto'
    )
    expect(updated.contabilidadStatus).toBe('rejected')
    expect(updated.status).toBe('rejected')
    expect(updated.contabilidadRejectionReason).toBe('falta el detalle del gasto')
    // La rendicion NO se devuelve aqui: sigue en Contabilidad para observar mas.
    expect(devueltas).toHaveLength(0)
  })

  it('avisa al colaborador del comprobante observado, no de una rendicion devuelta', async () => {
    const { svc, notificaciones } = montar()
    await svc.rejectByContabilidad(String(expenseId), actor, 'monto incorrecto')
    expect(notificaciones).toHaveLength(1)
    expect(notificaciones[0].title).toBe('Comprobante observado por Contabilidad')
  })

  it('exige motivo', async () => {
    const { svc } = montar()
    await expect(
      svc.rejectByContabilidad(String(expenseId), actor, '   ')
    ).rejects.toThrow(/motivo/i)
  })
})
