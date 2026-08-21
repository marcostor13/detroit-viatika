import { Types } from 'mongoose'
import { BadRequestException } from '@nestjs/common'
import { ExpenseReportService } from './expense-report.service'

/**
 * VD-139: con 2 solicitudes de fondos pendientes de que Tesoreria las cierre, el
 * colaborador no puede generar una tercera.
 */
describe('createViatico — tope de solicitudes sin cerrar (VD-139)', () => {
  const userId = new Types.ObjectId().toString()
  const clientId = new Types.ObjectId().toString()

  const montar = (abiertas: any[]) => {
    const svc = Object.create(ExpenseReportService.prototype) as any
    let filtro: any = null
    svc.userService = {
      findTransactionalProfile: async () => ({ signature: 'firma', projectIds: ['p1'] }),
    }
    svc.expenseReportModel = {
      find: (f: any) => {
        filtro = f
        return {
          select: () => ({ lean: () => ({ exec: async () => abiertas }) }),
        }
      },
    }
    return { svc, verFiltro: () => filtro }
  }

  const crear = (svc: any) =>
    svc.createViatico({ projectId: 'p1', amount: 100 } as any, userId, clientId)

  it('con 2 pendientes bloquea la nueva solicitud', async () => {
    const { svc } = montar([{ codigo: 'RE-AB-0001' }, { codigo: 'RE-AB-0002' }])
    await expect(crear(svc)).rejects.toThrow(BadRequestException)
  })

  // Un "no puedes" a secas deja al colaborador sin saber que tiene que rendir.
  it('el mensaje nombra las solicitudes pendientes', async () => {
    const { svc } = montar([{ codigo: 'RE-AB-0001' }, { viaticoPlace: 'Ica, Peru' }])
    await expect(crear(svc)).rejects.toThrow(/RE-AB-0001, Ica, Peru/)
  })

  it('con 1 pendiente deja continuar', async () => {
    const { svc } = montar([{ codigo: 'RE-AB-0001' }])
    // Pasa el tope y sigue adelante; falla despues, ya fuera de esta validacion.
    await expect(crear(svc)).rejects.not.toThrow(BadRequestException)
  })

  /**
   * Cerrar es accion de Tesoreria; rechazada y cancelada entran porque tampoco
   * van a rendirse nunca. La caja chica es otro tramite y no ocupa cupo.
   */
  it('solo cuenta solicitudes de fondos sin cerrar, sin caja chica', async () => {
    const { svc, verFiltro } = montar([])
    await crear(svc).catch(() => undefined)
    const f = verFiltro()
    expect(f.type).toBe('viatico')
    expect(f.isSolicitudCajaChica).toEqual({ $ne: true })
    expect(f.status.$nin).toEqual(['closed', 'rejected', 'cancelled'])
    expect(String(f.userId)).toBe(userId)
  })
})
