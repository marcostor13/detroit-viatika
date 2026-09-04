import { ForbiddenException } from '@nestjs/common'
import { Types } from 'mongoose'
import { ExpenseReportService } from './expense-report.service'
import { ROLES } from '../auth/enums/roles.enum'

/**
 * La devolucion de saldo solo la podia cargar el colaborador dueño desde su
 * rendicion. Cuando el deposito entra por fuera de la app —ventanilla, o el
 * colaborador que avisa por telefono— nadie podia asentarlo y la rendicion se
 * quedaba sin poder cerrar (`validateClosureConditions` la traba sin
 * comprobante). Tesoreria lo registra a mano desde Pagos → Devoluciones.
 */
describe('registerReturnVoucher — registro manual de Tesoreria', () => {
  const reportId = new Types.ObjectId()
  const ownerId = new Types.ObjectId()
  const tesoreriaId = new Types.ObjectId()
  const clientId = new Types.ObjectId()

  const dto = {
    depositDate: '2026-09-01',
    bankOrigin: 'BCP',
    operationNumber: '000123',
    amountReturned: 120,
    fileUrl: 'https://s3/constancia.pdf',
    fileName: 'constancia.pdf',
  }

  const montar = () => {
    const svc = Object.create(ExpenseReportService.prototype) as any
    const guardado: any[] = []
    const notificados: any[] = []
    const correosDevolucion: string[] = []

    const report = {
      _id: reportId,
      userId: ownerId,
      clientId,
      title: 'Viaje a Tacna',
      status: 'approved',
      expenseIds: [{ total: 380, status: 'approved', montoBase: 380 }],
      viaticoPaidAmount: 500,
      settlement: { type: 'devolucion', difference: 120 },
    }

    svc.expenseReportModel = {
      findById: () => ({
        populate: () => ({ exec: async () => report }),
        exec: async () => report,
      }),
      findByIdAndUpdate: (_id: any, update: any) => {
        guardado.push(update.$set)
        return { exec: async () => report }
      },
    }
    svc.advanceService = { findByExpenseReportId: async () => [] }
    svc.emailService = {
      buildAppUrl: (p: string) => `https://app${p}`,
      formatDateDDMMYYYY: () => '01/09/2026',
      sendRendicionCerrada: async () => undefined,
      sendRendicionDevolucionCargada: async (email: string) => {
        correosDevolucion.push(email)
      },
    }
    svc.userService = {
      findEmailNameClient: async (id: string) =>
        id === String(ownerId)
          ? { email: 'colaborador@detroit.pe', name: 'Colaborador Prueba' }
          : { email: 'tesoreria@detroit.pe', name: 'Tesoreria Test' },
      isEmailEnabled: async () => false,
      findTesoreriaRecipientsWithIds: async () => [
        { _id: String(tesoreriaId), email: 'tesoreria@detroit.pe', name: 'Tesoreria Test' },
      ],
    }
    svc.notificationsService = {
      create: async (n: any) => {
        notificados.push(n)
      },
    }
    return { svc, guardado, notificados, correosDevolucion }
  }

  const tesoreria = { role: ROLES.TESORERIA, name: 'Tesoreria Test' }

  it('deja a Tesoreria asentar el deposito del colaborador', async () => {
    const { svc, guardado } = montar()
    await svc.registerReturnVoucher(String(reportId), dto, String(tesoreriaId), tesoreria)

    expect(guardado[0].returnVoucher.url).toBe(dto.fileUrl)
    expect(guardado[0].returnVoucher.amountReturned).toBe(120)
  })

  // Sin la marca no habria como distinguir el asiento de Tesoreria del
  // comprobante que sube el propio colaborador.
  it('marca quien lo registro cuando no es el dueño', async () => {
    const { svc, guardado } = montar()
    await svc.registerReturnVoucher(String(reportId), dto, String(tesoreriaId), tesoreria)

    expect(String(guardado[0].returnVoucher.registeredBy)).toBe(String(tesoreriaId))
    expect(guardado[0].returnVoucher.registeredByName).toBe('Tesoreria Test')
  })

  it('no marca nada cuando lo carga el propio colaborador', async () => {
    const { svc, guardado } = montar()
    await svc.registerReturnVoucher(String(reportId), dto, String(ownerId), {
      role: ROLES.COLABORADOR,
      name: 'Colaborador Prueba',
    })

    expect(guardado[0].returnVoucher.registeredBy).toBeUndefined()
    expect(guardado[0].returnVoucher.registeredByName).toBeUndefined()
  })

  // El aviso es del DUEÑO: si fuera de quien carga, el colaborador nunca se
  // enteraria de que su devolucion quedo registrada.
  it('avisa al dueño de la rendicion, no a quien registro', async () => {
    const { svc, notificados } = montar()
    await svc.registerReturnVoucher(String(reportId), dto, String(tesoreriaId), tesoreria)

    const avisoColaborador = notificados.find(n => String(n.userId) === String(ownerId))
    expect(avisoColaborador).toBeDefined()
    expect(avisoColaborador.title).toBe('Devolución registrada por Tesorería')
    expect(notificados.some(n => String(n.userId) === String(tesoreriaId))).toBe(false)
  })

  // El correo diria que el colaborador adjunto un comprobante que nunca
  // adjunto, y le pediria verificar un deposito que acaba de verificar.
  it('no le manda a Tesoreria el aviso de comprobante recibido si lo cargo ella', async () => {
    const { svc, correosDevolucion } = montar()
    await svc.registerReturnVoucher(String(reportId), dto, String(tesoreriaId), tesoreria)

    expect(correosDevolucion).toHaveLength(0)
  })

  it('sigue avisando a Tesoreria cuando lo carga el colaborador', async () => {
    const { svc, correosDevolucion } = montar()
    await svc.registerReturnVoucher(String(reportId), dto, String(ownerId), {
      role: ROLES.COLABORADOR,
    })

    expect(correosDevolucion).toEqual(['tesoreria@detroit.pe'])
  })

  it('rechaza a un tercero sin autoridad de pago', async () => {
    const { svc } = montar()
    await expect(
      svc.registerReturnVoucher(String(reportId), dto, String(tesoreriaId), {
        role: ROLES.COLABORADOR,
        name: 'Otro Colaborador',
      })
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  // Mismo criterio que el pago de reembolso: por rol el Coordinador no participa
  // del dinero, aunque el RolesGuard lo aliase a Administrador.
  it('rechaza al Coordinador aunque tenga canApproveL2', async () => {
    const { svc } = montar()
    await expect(
      svc.registerReturnVoucher(String(reportId), dto, String(tesoreriaId), {
        role: ROLES.COORDINADOR,
        permissions: { canApproveL2: true },
      })
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('acepta a un delegado con canApproveL2', async () => {
    const { svc, guardado } = montar()
    await svc.registerReturnVoucher(String(reportId), dto, String(tesoreriaId), {
      role: ROLES.COLABORADOR,
      permissions: { canApproveL2: true },
      name: 'Delegado',
    })

    expect(guardado[0].returnVoucher.registeredByName).toBe('Delegado')
  })
})
