import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Types } from 'mongoose'
import { ExpenseReportService } from './expense-report.service'
import { ExpenseReport } from './entities/expense-report.entity'
import { Expense } from '../expense/entities/expense.entity'
import { CajaChicaReport } from '../caja-chica-report/entities/caja-chica-report.entity'
import { EmailService } from '../email/email.service'
import { NotificationsService } from '../notifications/notifications.service'
import { UserService } from '../user/user.service'
import { AdvanceService } from '../advance/advance.service'
import { UploadService } from '../upload/upload.service'
import { ProjectService } from '../project/project.service'
import { CategoryService } from '../category/category.service'
import { ROLES } from '../auth/enums/roles.enum'
import { ChainStep } from '../advance/approval-chain.util'
import { CurrencyService } from '../exchange-rate/currency.service'
import { FondoCajaChicaService } from '../fondo-caja-chica/fondo-caja-chica.service'

const mockAdvanceService = {
  liquidateExpenseReport: jest.fn().mockResolvedValue(undefined),
  findPaymentReceiptsForCollaborator: jest.fn().mockResolvedValue([]),
  findByExpenseReportId: jest.fn().mockResolvedValue([]),
}

const reportId = new Types.ObjectId().toString()
const expenseId1 = new Types.ObjectId().toString()
const expenseId2 = new Types.ObjectId().toString()
const clientId = new Types.ObjectId().toString()
const userId = new Types.ObjectId().toString()

const mockEmailService = {
  sendRendicionFullyApprovedEmail: jest.fn().mockResolvedValue(undefined),
  sendRendicionReembolsoPagado: jest.fn().mockResolvedValue(undefined),
  // VD-133: aviso de turno al siguiente nivel de la cadena.
  sendRendicionRecordatorioCoordinador: jest.fn().mockResolvedValue(undefined),
  buildAppUrl: jest.fn().mockReturnValue('http://localhost:4200/app'),
  formatDateDDMMYYYY: jest.fn().mockReturnValue('01/01/2026'),
}

const mockNotificationsService = {
  create: jest.fn().mockResolvedValue(undefined),
}

const mockUserService = {
  findAdminsByClient: jest.fn().mockResolvedValue([]),
  findOne: jest
    .fn()
    .mockResolvedValue({ name: 'Colaborador Test', email: 'c@test.com' }),
  findTransactionalProfile: jest.fn().mockResolvedValue(null),
  findEmailNameClient: jest.fn().mockResolvedValue(null),
  findContabilidadRecipients: jest.fn().mockResolvedValue([]),
  findTesoreriaNotifyRecipients: jest.fn().mockResolvedValue([]),
  isEmailEnabled: jest.fn().mockResolvedValue(true),
  idsTitularesCubiertosPara: jest.fn().mockResolvedValue([]),
  idsTitularesCubiertosPor: jest.fn().mockResolvedValue([]),
  resolverSuplenteVigente: jest.fn().mockResolvedValue(null),
}

describe('ExpenseReportService — Fase 5 (envío y aprobación final)', () => {
  let service: ExpenseReportService
  let mockExpenseReportModel: Record<string, jest.Mock>

  const fullReportDoc = () => ({
    _id: new Types.ObjectId(reportId),
    title: 'Rendición test',
    budget: 1000,
    clientId: new Types.ObjectId(clientId),
    userId: {
      _id: new Types.ObjectId(userId),
      name: 'Colaborador',
      email: 'u@test.com',
    },
    expenseIds: [],
    status: 'open',
  })

  beforeEach(async () => {
    jest.clearAllMocks()

    mockExpenseReportModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseReportService,
        {
          provide: getModelToken(ExpenseReport.name),
          useValue: mockExpenseReportModel,
        },
        { provide: getModelToken(Expense.name), useValue: {} },
        {
          provide: getModelToken(CajaChicaReport.name),
          useValue: {
            countDocuments: jest
              .fn()
              .mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
          },
        },
        { provide: EmailService, useValue: mockEmailService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: UserService, useValue: mockUserService },
        { provide: AdvanceService, useValue: mockAdvanceService },
        { provide: UploadService, useValue: {} },
        {
          // Solo lo usa la solicitud de caja chica: para el resto de pruebas
          // basta con que no haya ningún fondo vivo.
          provide: FondoCajaChicaService,
          useValue: {
            findVivoByResponsible: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            fondear: jest.fn(),
            registrarCargo: jest.fn(),
            reversarCargo: jest.fn(),
            reponer: jest.fn(),
          },
        },
        { provide: ProjectService, useValue: {} },
        { provide: CategoryService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            toBase: jest.fn().mockImplementation(async (monto: number) => ({
              montoBase: monto,
              tipoCambio: 1,
              tcFecha: '2026-01-01',
            })),
            resolveRate: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile()

    service = module.get<ExpenseReportService>(ExpenseReportService)
  })

  function mockFindByIdSequence(opts: {
    existingStatus: string
    submitPopulateResult?: { expenseIds: unknown[] }
  }) {
    let call = 0
    mockExpenseReportModel.findById.mockImplementation(() => {
      call++
      if (call === 1) {
        return {
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest
                .fn()
                .mockResolvedValue({ status: opts.existingStatus }),
            }),
          }),
        }
      }
      if (call === 2 && opts.submitPopulateResult !== undefined) {
        return {
          populate: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(opts.submitPopulateResult),
              }),
            }),
          }),
        }
      }
      const chain: { populate: jest.Mock; exec: jest.Mock } = {
        populate: jest.fn(),
        exec: jest.fn(),
      }
      chain.populate.mockReturnValue(chain)
      chain.exec.mockResolvedValue(fullReportDoc())
      return chain
    })
  }

  it('update(submitted): rechaza si no hay gastos', async () => {
    mockFindByIdSequence({
      existingStatus: 'open',
      submitPopulateResult: { expenseIds: [] },
    })

    await expect(
      service.update(reportId, { status: 'submitted' })
    ).rejects.toThrow(/al menos un gasto/)

    expect(mockExpenseReportModel.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('update(submitted): rechaza si hay gasto rechazado', async () => {
    mockFindByIdSequence({
      existingStatus: 'open',
      submitPopulateResult: {
        expenseIds: [{ _id: expenseId1, status: 'rejected', file: '/f.pdf' }],
      },
    })

    await expect(
      service.update(reportId, { status: 'submitted' })
    ).rejects.toThrow(/rechazados/)
    expect(mockExpenseReportModel.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('update(submitted): persiste aunque algún gasto no tenga archivo adjunto', async () => {
    mockFindByIdSequence({
      existingStatus: 'open',
      submitPopulateResult: {
        expenseIds: [{ _id: expenseId1, status: 'approved', file: '' }],
      },
    })

    const result = await service.update(reportId, { status: 'submitted' })

    expect(mockExpenseReportModel.findByIdAndUpdate).toHaveBeenCalled()
    expect(result).toBeDefined()
    expect(mockNotificationsService.create).not.toHaveBeenCalled()
    mockUserService.findAdminsByClient.mockResolvedValueOnce([
      { _id: new Types.ObjectId(), email: 'admin@test.com' },
    ])
    mockFindByIdSequence({
      existingStatus: 'open',
      submitPopulateResult: {
        expenseIds: [{ _id: expenseId1, status: 'approved', file: '/ok.pdf' }],
      },
    })
    await service.update(reportId, { status: 'submitted' })
    expect(mockNotificationsService.create).toHaveBeenCalled()
  })

  it('update(approved): rechaza si la rendicion no está en pending_accounting', async () => {
    mockExpenseReportModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ status: 'submitted' }),
        }),
      }),
    })

    await expect(
      service.update(reportId, { status: 'approved' })
    ).rejects.toThrow(
      /Solo se puede aprobar una rendicion pendiente de contabilidad/
    )
    expect(mockExpenseReportModel.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('update(approved): persiste cuando la rendicion está en pending_accounting', async () => {
    let call = 0
    mockExpenseReportModel.findById.mockImplementation(() => {
      call++
      if (call === 1) {
        return {
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest
                .fn()
                .mockResolvedValue({ status: 'pending_accounting' }),
            }),
          }),
        }
      }
      const chain: {
        populate: jest.Mock
        select: jest.Mock
        lean: jest.Mock
        exec: jest.Mock
      } = {
        populate: jest.fn(),
        select: jest.fn(),
        lean: jest.fn(),
        exec: jest.fn(),
      }
      chain.populate.mockReturnValue(chain)
      chain.select.mockReturnValue(chain)
      chain.lean.mockReturnValue(chain)
      chain.exec.mockResolvedValue({
        ...fullReportDoc(),
        expenseIds: [],
        status: 'approved',
      })
      return chain
    })

    await service.update(reportId, { status: 'approved' })

    expect(mockExpenseReportModel.findByIdAndUpdate).toHaveBeenCalled()
    expect(mockEmailService.sendRendicionFullyApprovedEmail).toHaveBeenCalled()
  })

  it('update(approved): rechaza si hay un comprobante observado', async () => {
    // Contabilidad no puede aprobar la rendición completa si quedó un comprobante
    // rechazado (assertNoRejectedExpenses). Cubre el caso de un rechazo por
    // aprobador que igual dejó avanzar la rendición a pending_accounting.
    mockFindByIdSequence({
      existingStatus: 'pending_accounting',
      submitPopulateResult: {
        expenseIds: [{ _id: expenseId1, status: 'rejected' }],
      },
    })

    await expect(
      service.update(reportId, { status: 'approved' })
    ).rejects.toThrow(/observados|devuelta al colaborador/)
    expect(mockExpenseReportModel.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  // Contabilidad observa varios comprobantes y recién después devuelve la
  // rendición: el reset de los no observados se hace al rechazar la RENDICIÓN,
  // no al rechazar cada comprobante (que antes la devolvía de una y dejaba a
  // Contabilidad sin poder observar un segundo).
  it('reopenExpensesForCollaboratorCorrection: reabre los no observados y conserva los rechazados', async () => {
    mockExpenseReportModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            expenseIds: [{ _id: expenseId1 }, { _id: expenseId2 }],
          }),
        }),
      }),
    })

    const updateOne = jest.fn().mockResolvedValue({})
    // Inyecta el mock de expenseModel sobre la instancia (el provider lo da como {}).
    ;(service as unknown as { expenseModel: Record<string, jest.Mock> }).expenseModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              {
                _id: expenseId1,
                status: 'rejected',
                approverChain: [{ level: 1, approved: true }],
              },
              {
                _id: expenseId2,
                status: 'approved',
                approverChain: [{ level: 1, approved: true }],
              },
            ]),
          }),
        }),
      }),
      updateOne,
    }

    await service.reopenExpensesForCollaboratorCorrection(reportId)

    const calls = updateOne.mock.calls
    const rejectedSet = calls.find(
      c => String(c[0]._id) === String(expenseId1)
    )![1].$set
    const otherSet = calls.find(
      c => String(c[0]._id) === String(expenseId2)
    )![1].$set
    // El comprobante NO observado vuelve a 'pending' (editable y re-aprobable).
    expect(otherSet.status).toBe('pending')
    expect(otherSet.contabilidadStatus).toBe('pending')
    expect(otherSet.approvalLevel).toBe(0)
    expect(otherSet.approverChain[0].approved).toBe(false)
    // El observado conserva su estado 'rejected' + motivo (solo se resetea su cadena).
    expect(rejectedSet.status).toBeUndefined()
    expect(rejectedSet.contabilidadStatus).toBeUndefined()
    expect(rejectedSet.approvalLevel).toBe(0)
  })

  it('update: rechazar la rendición desde contabilidad reabre sus comprobantes', async () => {
    mockFindByIdSequence({ existingStatus: 'pending_accounting' })
    const reabrir = jest
      .spyOn(service, 'reopenExpensesForCollaboratorCorrection')
      .mockResolvedValue(undefined)

    await service.update(reportId, {
      status: 'rejected',
      rejectionReason: 'faltan dos comprobantes',
    })

    expect(reabrir).toHaveBeenCalledWith(reportId)
    const $set = mockExpenseReportModel.findByIdAndUpdate.mock.calls[0][1].$set
    expect($set.status).toBe('rejected')
    expect($set.rejectedByRole).toBe('contabilidad')
  })

  it('update: rechazar una rendición enviada (aprobadores) NO reabre comprobantes', async () => {
    mockFindByIdSequence({ existingStatus: 'submitted' })
    const reabrir = jest
      .spyOn(service, 'reopenExpensesForCollaboratorCorrection')
      .mockResolvedValue(undefined)

    await service.update(reportId, {
      status: 'rejected',
      rejectionReason: 'motivo',
    })

    expect(reabrir).not.toHaveBeenCalled()
  })

  it('advanceToAccountingIfAllExpensesApproved: NO avanza si hay un comprobante observado', async () => {
    const reportObj: { status: string; expenseIds: string[]; userId: string; save: jest.Mock } = {
      status: 'submitted',
      expenseIds: [expenseId1, expenseId2],
      userId,
      save: jest.fn().mockResolvedValue(undefined),
    }
    mockExpenseReportModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(reportObj),
      }),
    })
    ;(service as unknown as { expenseModel: Record<string, jest.Mock> }).expenseModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              { _id: expenseId1, status: 'approved', approverChain: [{ level: 1 }], approvalLevel: 1, requiredLevels: 1 },
              { _id: expenseId2, status: 'rejected', approverChain: [{ level: 1 }], approvalLevel: 0, requiredLevels: 1 },
            ]),
          }),
        }),
      }),
    }

    const advanced =
      await service.advanceToAccountingIfAllExpensesApproved(reportId)

    // Queda en 'submitted' hasta que se corrija el comprobante observado.
    expect(advanced).toBe(false)
    expect(reportObj.status).toBe('submitted')
    expect(reportObj.save).not.toHaveBeenCalled()
  })

  it('advanceToAccountingIfAllExpensesApproved: avanza y devuelve true con toda la cadena completa', async () => {
    const reportObj: { status: string; expenseIds: string[]; userId: string; save: jest.Mock } = {
      status: 'submitted',
      expenseIds: [expenseId1, expenseId2],
      userId,
      save: jest.fn().mockResolvedValue(undefined),
    }
    mockExpenseReportModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(reportObj),
      }),
    })
    ;(service as unknown as { expenseModel: Record<string, jest.Mock> }).expenseModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              { _id: expenseId1, status: 'approved', approverChain: [{ level: 1 }], approvalLevel: 1, requiredLevels: 1 },
              { _id: expenseId2, status: 'approved', approverChain: [{ level: 2 }], approvalLevel: 1, requiredLevels: 1 },
            ]),
          }),
        }),
      }),
    }
    jest.spyOn(service, 'findOne').mockResolvedValue(fullReportDoc() as never)
    const notify = jest
      .spyOn(
        service as unknown as {
          notifyAccountingReportPendingApproval: (...a: unknown[]) => Promise<void>
        },
        'notifyAccountingReportPendingApproval'
      )
      .mockResolvedValue(undefined)

    const advanced =
      await service.advanceToAccountingIfAllExpensesApproved(reportId)

    expect(advanced).toBe(true)
    expect(reportObj.status).toBe('pending_accounting')
    expect(reportObj.save).toHaveBeenCalled()
    expect(notify).toHaveBeenCalled()
  })

  /**
   * Regresión: un viático llega a Contabilidad con las aprobaciones por
   * comprobante, sin esperar un segundo clic a nivel de reporte. Desde VD-87 no
   * existe el botón que completaba `rendicionApproverChain`, así que exigirla
   * dejaba la rendición atascada en `submitted` para siempre.
   */
  it('advanceToAccountingIfAllExpensesApproved: sella la cadena de reporte del viático y avanza', async () => {
    const approverN1 = new Types.ObjectId().toString()
    const reportObj: {
      status: string
      expenseIds: string[]
      userId: string
      rendicionApproverChain: {
        level: number
        approved: boolean
        approvedBy?: Types.ObjectId
      }[]
      rendicionApprovalLevel?: number
      rendicionApprovalHistory?: { level: number; approvedBy: string }[]
      save: jest.Mock
    } = {
      status: 'submitted',
      expenseIds: [expenseId1],
      userId,
      // Al enviar, la cadena a nivel de reporte se reconstruye en nivel 0.
      rendicionApproverChain: [
        { level: 1, approved: false },
        { level: 2, approved: false },
      ],
      save: jest.fn().mockResolvedValue(undefined),
    }
    mockExpenseReportModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(reportObj),
      }),
    })
    ;(service as unknown as { expenseModel: Record<string, jest.Mock> }).expenseModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([
              {
                _id: expenseId1,
                status: 'approved',
                approverChain: [
                  { level: 1, approved: true, approvedBy: approverN1 },
                ],
                approvalLevel: 1,
                requiredLevels: 1,
              },
            ]),
          }),
        }),
      }),
    }
    jest.spyOn(service, 'findOne').mockResolvedValue(fullReportDoc() as never)
    jest
      .spyOn(
        service as unknown as {
          notifyAccountingReportPendingApproval: (...a: unknown[]) => Promise<void>
        },
        'notifyAccountingReportPendingApproval'
      )
      .mockResolvedValue(undefined)

    const advanced =
      await service.advanceToAccountingIfAllExpensesApproved(reportId)

    expect(advanced).toBe(true)
    expect(reportObj.status).toBe('pending_accounting')
    // La cadena del reporte queda sellada con quien aprobó cada nivel en los
    // comprobantes; el nivel sin equivalente se sella sin firmante.
    expect(reportObj.rendicionApproverChain.every(s => s.approved)).toBe(true)
    expect(String(reportObj.rendicionApproverChain[0].approvedBy)).toBe(approverN1)
    expect(reportObj.rendicionApprovalLevel).toBe(2)
    expect(reportObj.rendicionApprovalHistory).toHaveLength(2)
  })

  /**
   * Regresión: los aprobadores pueden aprobar cada comprobante apenas se sube
   * (su cadena se construye al registrarlo, no al enviar la rendición). Si
   * terminan ANTES de que el colaborador haga clic en "Enviar", no queda ningún
   * `approveByCoord` posterior que dispare el avance a Contabilidad y la
   * rendición se quedaba atascada en `submitted` para siempre. El envío debe
   * reevaluarlo.
   */
  it('update(submitted): reevalúa el avance a Contabilidad al enviar', async () => {
    mockFindByIdSequence({
      existingStatus: 'open',
      submitPopulateResult: {
        expenseIds: [{ _id: expenseId1, status: 'approved', file: '/f.pdf' }],
      },
    })
    const advance = jest
      .spyOn(service, 'advanceToAccountingIfAllExpensesApproved')
      .mockResolvedValue(false)

    await service.update(reportId, { status: 'submitted' })

    expect(advance).toHaveBeenCalledWith(reportId)
  })

  it('update(submitted): si el envío ya la manda a Contabilidad, no convoca a los aprobadores', async () => {
    mockFindByIdSequence({
      existingStatus: 'open',
      submitPopulateResult: {
        expenseIds: [{ _id: expenseId1, status: 'approved', file: '/f.pdf' }],
      },
    })
    jest
      .spyOn(service, 'advanceToAccountingIfAllExpensesApproved')
      .mockResolvedValue(true)

    await service.update(reportId, { status: 'submitted' })

    // El bloque de "rendición enviada" (correos/notificaciones a los
    // aprobadores) se omite: acaban de aprobar todo, no tienen nada que hacer.
    expect(mockNotificationsService.create).not.toHaveBeenCalled()
    expect(mockUserService.findOne).not.toHaveBeenCalled()
  })

  // Suplencia por vacaciones (VD-124): los avisos son la mitad de la
  // funcionalidad. La cadena se sella con el id del TITULAR y nunca se
  // reescribe, así que sin expandir los destinatarios el suplente puede firmar
  // pero jamás se entera de que tiene algo pendiente.
  /**
   * VD-133: los avisos que PIDEN ACCION van al paso en curso; los informativos
   * (rechazo, reapertura, cancelacion) siguen alcanzando a toda la cadena.
   */
  /**
   * VD-133. Con la cadena consecutiva el aviso del envio solo alcanza al primer
   * nivel, asi que si nadie avisa al aprobar, el N2 no se entera NUNCA de su
   * turno y la rendicion se queda esperandolo en silencio.
   */
  describe('aviso de turno al siguiente nivel (VD-133)', () => {
    const n1 = new Types.ObjectId()
    const n2 = new Types.ObjectId()

    beforeEach(() => {
      mockUserService.resolverSuplenteVigente.mockResolvedValue(null)
      mockUserService.isEmailEnabled.mockResolvedValue(true)
      mockUserService.findEmailNameClient.mockImplementation(async (id: string) => ({
        _id: id,
        name: id === n1.toString() ? 'ANA' : 'BETO',
        email: id === n1.toString() ? 'ana@x.pe' : 'beto@x.pe',
      }))
      mockEmailService.sendRendicionRecordatorioCoordinador.mockClear()
    })

    it('escribe al nivel que acaba de recibir el turno, no al que ya firmo', async () => {
      const chain = [
        { level: 1, approved: true, approverIds: [n1] },
        { level: 2, approved: false, approverIds: [n2] },
      ]
      await (service as any).notifySiguientePasoDeCadena('r1', chain, {
        collaboratorName: 'COLAB',
        reportTitle: 'Rendicion X',
      })
      const destinos = mockEmailService.sendRendicionRecordatorioCoordinador.mock.calls.map(
        (c: any[]) => c[0]
      )
      expect(destinos).toEqual(['beto@x.pe'])
    })

    // El correo lista quién rinde y qué rendición es. Al aprobar un COMPROBANTE
    // el caller no tiene ninguno de los dos (el gasto no trae el reporte
    // populado ni el nombre del dueño), y salían vacíos: el aprobador recibía
    // una tabla en blanco, sin saber qué tenía pendiente.
    it('completa colaborador y título desde la rendición cuando el caller no los trae', async () => {
      const ownerId = new Types.ObjectId()
      mockExpenseReportModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              title: 'Viaje a Arequipa',
              userId: ownerId,
              clientId: new Types.ObjectId(),
              viaticoEndDate: new Date('2026-08-20T00:00:00.000Z'),
            }),
          }),
        }),
      })
      mockUserService.findEmailNameClient.mockImplementation(async (id: string) => {
        if (id === ownerId.toString()) return { _id: id, name: 'CARLA COLAB', email: 'carla@x.pe' }
        return { _id: id, name: 'BETO', email: 'beto@x.pe' }
      })
      const chain = [
        { level: 1, approved: true, approverIds: [n1] },
        { level: 2, approved: false, approverIds: [n2] },
      ]

      await (service as any).notifySiguientePasoDeCadena('r1', chain, {})

      const [, data] = mockEmailService.sendRendicionRecordatorioCoordinador.mock.calls[0]
      expect(data.reports[0].collaboratorName).toBe('CARLA COLAB')
      expect(data.reports[0].title).toBe('Viaje a Arequipa')
      expect(data.reports[0].endDateFormatted).toBeTruthy()
      // El botón lleva a ESA rendición, no al listado.
      expect(mockEmailService.buildAppUrl).toHaveBeenCalledWith('/mis-rendiciones/r1/detalle')
      expect(data.platformUrl).toBe('http://localhost:4200/app')
    })

    it('si la rendición no se puede leer, la tabla no sale vacía', async () => {
      mockExpenseReportModel.findById.mockImplementation(() => {
        throw new Error('sin base')
      })
      const chain = [
        { level: 1, approved: true, approverIds: [n1] },
        { level: 2, approved: false, approverIds: [n2] },
      ]

      await (service as any).notifySiguientePasoDeCadena('r1', chain, {})

      const [, data] = mockEmailService.sendRendicionRecordatorioCoordinador.mock.calls[0]
      expect(data.reports[0].collaboratorName).toBe('Colaborador')
      expect(data.reports[0].title).toBe('Rendición')
    })

    it('con la cadena completa no escribe a nadie', async () => {
      const chain = [
        { level: 1, approved: true, approverIds: [n1] },
        { level: 2, approved: true, approverIds: [n2] },
      ]
      await (service as any).notifySiguientePasoDeCadena('r1', chain, {})
      expect(mockEmailService.sendRendicionRecordatorioCoordinador).not.toHaveBeenCalled()
    })
  })

  describe('destinatarios del aviso "te toca aprobar" (VD-133)', () => {
    const n1 = new Types.ObjectId()
    const n2 = new Types.ObjectId()
    const reportId = new Types.ObjectId().toString()
    const expenseId = new Types.ObjectId()

    // Los dos modelos se inyectan sobre la instancia, como hace el resto del
    // spec: el provider los entrega vacios.
    const montarCadena = (primeroFirmado: boolean) => {
      ;(service as any).expenseReportModel = {
        findById: () => ({
          select: () => ({ lean: () => ({ exec: async () => ({ expenseIds: [expenseId] }) }) }),
        }),
      }
      ;(service as any).expenseModel = {
        find: () => ({
          select: () => ({
            lean: () => ({
              exec: async () => [
                {
                  approverChain: [
                    { level: 1, approved: primeroFirmado, approverIds: [n1] },
                    { level: 2, approved: false, approverIds: [n2] },
                  ],
                },
              ],
            }),
          }),
        }),
      }
      mockUserService.resolverSuplenteVigente.mockResolvedValue(null)
      mockUserService.findEmailNameClient.mockImplementation(async (id: string) => ({
        _id: id,
        name: id === n1.toString() ? 'ANA' : 'BETO',
        email: id === n1.toString() ? 'ana@x.pe' : 'beto@x.pe',
      }))
      mockUserService.isEmailEnabled.mockResolvedValue(true)
    }

    it('solo escribe al nivel al que le toca', async () => {
      montarCadena(false)
      const rec = await (service as any).resolveReportApproverRecipients(reportId, {
        soloPasoEnCurso: true,
      })
      expect(rec.map((r: any) => r.email)).toEqual(['ana@x.pe'])
    })

    it('cuando el N1 firma, el aviso pasa al N2', async () => {
      montarCadena(true)
      const rec = await (service as any).resolveReportApproverRecipients(reportId, {
        soloPasoEnCurso: true,
      })
      expect(rec.map((r: any) => r.email)).toEqual(['beto@x.pe'])
    })

    it('sin la opcion alcanza a toda la cadena: es lo que usan los avisos informativos', async () => {
      montarCadena(false)
      const rec = await (service as any).resolveReportApproverRecipients(reportId)
      expect(rec.map((r: any) => r.email).sort()).toEqual(['ana@x.pe', 'beto@x.pe'])
    })
  })

  describe('destinatarios con suplencia por vacaciones', () => {
    const titularId = new Types.ObjectId()
    const suplenteId = new Types.ObjectId()

    beforeEach(() => {
      mockUserService.findEmailNameClient.mockImplementation(async (id: string) =>
        id === String(suplenteId)
          ? { name: 'Suplente', email: 'suplente@test.com', clientId }
          : { name: 'Titular', email: 'titular@test.com', clientId }
      )
      mockUserService.isEmailEnabled.mockResolvedValue(true)
    })

    it('el correo a los aprobadores incluye al suplente, sin quitar al titular', async () => {
      mockUserService.resolverSuplenteVigente.mockImplementation(async (id: string) =>
        id === String(titularId)
          ? { _id: String(suplenteId), name: 'Suplente', email: 'suplente@test.com' }
          : null
      )

      const recipients = await (service as any).resolveViaticoApproverRecipients({
        viaticoApproverChain: [{ approverIds: [titularId] }],
      })

      const correos = recipients.map((r: any) => r.email).sort()
      expect(correos).toEqual(['suplente@test.com', 'titular@test.com'])
    })

    it('sin suplencia vigente los destinatarios no cambian', async () => {
      mockUserService.resolverSuplenteVigente.mockResolvedValue(null)

      const recipients = await (service as any).resolveViaticoApproverRecipients({
        viaticoApproverChain: [{ approverIds: [titularId] }],
      })

      expect(recipients.map((r: any) => r.email)).toEqual(['titular@test.com'])
    })

    // `excludeUserIds` se vuelve a aplicar DESPUÉS de expandir: si no, un
    // suplente que además es el colaborador que rinde recibiría el aviso de su
    // propia rendición.
    it('respeta las exclusiones también sobre el suplente agregado', async () => {
      mockUserService.resolverSuplenteVigente.mockImplementation(async (id: string) =>
        id === String(titularId)
          ? { _id: String(suplenteId), name: 'Suplente', email: 'suplente@test.com' }
          : null
      )

      const recipients = await (service as any).resolveViaticoApproverRecipients(
        { viaticoApproverChain: [{ approverIds: [titularId] }] },
        { excludeUserIds: [String(suplenteId)] }
      )

      expect(recipients.map((r: any) => r.email)).toEqual(['titular@test.com'])
    })

    it('la notificación del comprobante llega al suplente y al titular', async () => {
      mockUserService.resolverSuplenteVigente.mockImplementation(async (id: string) =>
        id === String(titularId)
          ? { _id: String(suplenteId), name: 'Suplente', email: 'suplente@test.com' }
          : null
      )
      mockNotificationsService.create.mockClear()

      await service.notifyExpensePendingApprovers(
        { _id: new Types.ObjectId(), total: 100, expenseReportId: new Types.ObjectId() },
        { level: 1, projectId: new Types.ObjectId(), projectRole: 'principal', approverIds: [titularId] } as any
      )

      const avisados = mockNotificationsService.create.mock.calls.map((c: any[]) => c[0].userId)
      expect(avisados).toContain(String(titularId))
      expect(avisados).toContain(String(suplenteId))
    })
  })

  describe('registerAffidavit — Fase 5 declaración jurada', () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('rechaza si la rendición no está cerrada', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...fullReportDoc(),
        status: 'approved',
        expenseIds: [{ _id: expenseId1 }],
      } as never)

      await expect(
        service.registerAffidavit(
          reportId,
          { type: 'viaticos_nacionales', expenseIds: [expenseId1] },
          userId
        )
      ).rejects.toThrow(/cerrada/)
    })

    it('rechaza si un gasto no pertenece a la rendición', async () => {
      const foreignId = new Types.ObjectId().toString()
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...fullReportDoc(),
        status: 'closed',
        expenseIds: [{ _id: expenseId1 }],
      } as never)

      await expect(
        service.registerAffidavit(
          reportId,
          { type: 'viajes_exterior', expenseIds: [foreignId] },
          userId
        )
      ).rejects.toThrow(/no pertenecen/)
    })

    it('actualiza el reporte cuando es válido', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        ...fullReportDoc(),
        status: 'closed',
        expenseIds: [{ _id: expenseId1 }, { _id: expenseId2 }],
      } as never)

      const out = await service.registerAffidavit(
        reportId,
        { type: 'viaticos_nacionales', expenseIds: [expenseId1] },
        userId
      )

      expect(mockExpenseReportModel.findByIdAndUpdate).toHaveBeenCalledWith(
        reportId,
        expect.objectContaining({
          $push: expect.objectContaining({
            affidavits: expect.objectContaining({
              type: 'viaticos_nacionales',
            }),
          }),
        })
      )
      expect(out.reportId).toBe(reportId)
      expect(out.expenseIds).toEqual([expenseId1])
    })
  })
})

describe('ExpenseReportService — Fase 8 (cierre definitivo)', () => {
  let service: ExpenseReportService
  let mockExpenseReportModel: Record<string, jest.Mock>

  const mockEmailServicePhase8 = {
    sendRendicionFullyApprovedEmail: jest.fn().mockResolvedValue(undefined),
    sendRendicionReembolsoPagado: jest.fn().mockResolvedValue(undefined),
    sendRendicionCerrada: jest.fn().mockResolvedValue(undefined),
    buildAppUrl: jest.fn().mockReturnValue('http://localhost:4200/app'),
    formatDateDDMMYYYY: jest.fn().mockReturnValue('01/01/2026'),
  }

  const mockUserServicePhase8 = {
    findAdminsByClient: jest.fn().mockResolvedValue([]),
    findOne: jest
      .fn()
      .mockResolvedValue({ name: 'Colaborador', email: 'c@test.com' }),
    findTransactionalProfile: jest.fn().mockResolvedValue(null),
    findEmailNameClient: jest
      .fn()
      .mockResolvedValue({ name: 'Colaborador', email: 'c@test.com' }),
    findAccountingRecipientsWithIds: jest.fn().mockResolvedValue([]),
    findTesoreriaRecipientsWithIds: jest.fn().mockResolvedValue([]),
    isEmailEnabled: jest.fn().mockResolvedValue(true),
    idsTitularesCubiertosPara: jest.fn().mockResolvedValue([]),
    idsTitularesCubiertosPor: jest.fn().mockResolvedValue([]),
    resolverSuplenteVigente: jest.fn().mockResolvedValue(null),
  }

  function makeReportDoc(overrides: Record<string, unknown> = {}) {
    return {
      _id: new Types.ObjectId(reportId),
      title: 'Rendición Test',
      status: 'approved',
      clientId: new Types.ObjectId(clientId),
      userId: new Types.ObjectId(userId),
      settlement: { type: 'reembolso' as const, difference: -50 },
      expenseIds: [],
      closureRecord: undefined,
      ...overrides,
    }
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    mockExpenseReportModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(makeReportDoc({ status: 'closed' })),
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseReportService,
        {
          provide: getModelToken(ExpenseReport.name),
          useValue: mockExpenseReportModel,
        },
        { provide: getModelToken(Expense.name), useValue: {} },
        {
          provide: getModelToken(CajaChicaReport.name),
          useValue: {
            countDocuments: jest
              .fn()
              .mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
          },
        },
        { provide: EmailService, useValue: mockEmailServicePhase8 },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: UserService, useValue: mockUserServicePhase8 },
        { provide: AdvanceService, useValue: mockAdvanceService },
        { provide: UploadService, useValue: {} },
        {
          // Solo lo usa la solicitud de caja chica: para el resto de pruebas
          // basta con que no haya ningún fondo vivo.
          provide: FondoCajaChicaService,
          useValue: {
            findVivoByResponsible: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            fondear: jest.fn(),
            registrarCargo: jest.fn(),
            reversarCargo: jest.fn(),
            reponer: jest.fn(),
          },
        },
        { provide: ProjectService, useValue: {} },
        { provide: CategoryService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            toBase: jest.fn().mockImplementation(async (monto: number) => ({
              montoBase: monto,
              tipoCambio: 1,
              tcFecha: '2026-01-01',
            })),
            resolveRate: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile()

    service = module.get<ExpenseReportService>(ExpenseReportService)
  })

  describe('validateClosureConditions', () => {
    it('devuelve error si la rendición ya está cerrada', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue(makeReportDoc({ status: 'closed' })),
        }),
      })
      const errors = await service.validateClosureConditions(reportId)
      expect(errors).toContain('La rendición ya está cerrada')
    })

    it('devuelve error si estado no es approved ni reimbursed', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue(makeReportDoc({ status: 'submitted' })),
        }),
      })
      const errors = await service.validateClosureConditions(reportId)
      expect(errors.some(e => e.includes('submitted'))).toBe(true)
    })

    it('devuelve error si hay gasto con devolución pendiente sin validar', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(
            makeReportDoc({
              status: 'reimbursed',
              settlement: { type: 'reembolso' },
              returnRecord: { status: 'proof_uploaded' },
            })
          ),
        }),
      })
      const errors = await service.validateClosureConditions(reportId)
      expect(errors.some(e => e.includes('Devolución pendiente'))).toBe(true)
    })

    it('devuelve lista vacía cuando todas las condiciones se cumplen', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(
            makeReportDoc({
              status: 'reimbursed',
              settlement: { type: 'reembolso' },
              reimbursementPaymentInfo: { method: 'transferencia_bancaria' },
              expenseIds: [],
            })
          ),
        }),
      })
      const errors = await service.validateClosureConditions(reportId)
      expect(errors).toHaveLength(0)
    })
  })

  describe('close', () => {
    it('lanza BadRequestException si hay errores de validación', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue(makeReportDoc({ status: 'submitted' })),
        }),
      })
      await expect(service.close(reportId, userId)).rejects.toThrow(
        BadRequestException
      )
    })

    it('cierra la rendición y envía email al colaborador', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(
            makeReportDoc({
              status: 'reimbursed',
              settlement: { type: 'reembolso' },
              reimbursementPaymentInfo: { method: 'transferencia_bancaria' },
            })
          ),
        }),
      })
      const updatedDoc = makeReportDoc({ status: 'closed' })
      mockExpenseReportModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedDoc),
      })

      const result = await service.close(reportId, userId)

      expect(mockExpenseReportModel.findByIdAndUpdate).toHaveBeenCalledWith(
        reportId,
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'closed' }),
        }),
        { new: true }
      )
      expect(result.status).toBe('closed')
    })
  })

  describe('requestReopening', () => {
    it('lanza BadRequestException si la rendición no está cerrada', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue(makeReportDoc({ status: 'approved' })),
      })
      const longReason = 'x'.repeat(200)
      await expect(
        service.requestReopening(reportId, userId, longReason)
      ).rejects.toThrow(/cerradas/)
    })

    it('lanza BadRequestException si el motivo es menor a 200 caracteres', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(makeReportDoc({ status: 'closed' })),
      })
      await expect(
        service.requestReopening(reportId, userId, 'corto')
      ).rejects.toThrow(/200 caracteres/)
    })

    it('persiste la solicitud de reapertura con motivo válido', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(
          makeReportDoc({
            status: 'closed',
            closureRecord: { reopeningStatus: 'none' },
          })
        ),
      })
      const updatedDoc = makeReportDoc({ status: 'closed' })
      mockExpenseReportModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedDoc),
      })

      const longReason = 'x'.repeat(200)
      await service.requestReopening(reportId, userId, longReason)

      expect(mockExpenseReportModel.findByIdAndUpdate).toHaveBeenCalledWith(
        reportId,
        expect.objectContaining({
          $set: expect.objectContaining({
            closureRecord: expect.objectContaining({
              reopeningStatus: 'requested',
            }),
          }),
        }),
        { new: true }
      )
    })
  })

  describe('approveReopening', () => {
    it('lanza BadRequestException si no hay solicitud de reapertura pendiente', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(
          makeReportDoc({
            status: 'closed',
            closureRecord: { reopeningStatus: 'none' },
          })
        ),
      })
      await expect(
        service.approveReopening(reportId, userId, true)
      ).rejects.toThrow(/pendiente/)
    })

    it('aprueba la reapertura: vuelve a estado approved', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(
          makeReportDoc({
            status: 'closed',
            closureRecord: {
              reopeningStatus: 'requested',
              closedAt: new Date(),
              closedBy: userId,
            },
          })
        ),
      })
      const updatedDoc = makeReportDoc({ status: 'approved' })
      mockExpenseReportModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedDoc),
      })

      const result = await service.approveReopening(reportId, userId, true)

      expect(mockExpenseReportModel.findByIdAndUpdate).toHaveBeenCalledWith(
        reportId,
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'approved' }),
        }),
        { new: true }
      )
      expect(result.status).toBe('approved')
    })

    it('rechaza la reapertura: mantiene estado closed', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(
          makeReportDoc({
            status: 'closed',
            closureRecord: {
              reopeningStatus: 'requested',
              closedAt: new Date(),
              closedBy: userId,
            },
          })
        ),
      })
      const updatedDoc = makeReportDoc({ status: 'closed' })
      mockExpenseReportModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedDoc),
      })

      await service.approveReopening(reportId, userId, false)

      const updateCall =
        mockExpenseReportModel.findByIdAndUpdate.mock.calls[0][1]
      expect(updateCall.$set.closureRecord.reopeningStatus).toBe('none')
      expect(updateCall.$set.status).toBeUndefined()
    })
  })

  describe('assertNotClosed', () => {
    it('lanza ForbiddenException si la rendición está cerrada', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue(makeReportDoc({ status: 'closed' })),
        }),
      })
      await expect(service.assertNotClosed(reportId)).rejects.toThrow(
        ForbiddenException
      )
    })

    it('no lanza si la rendición no está cerrada', async () => {
      mockExpenseReportModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue(makeReportDoc({ status: 'approved' })),
        }),
      })
      await expect(service.assertNotClosed(reportId)).resolves.toBeUndefined()
    })
  })
})

const validReimbursementDto = {
  method: 'transferencia_bancaria' as const,
  transferDate: '2025-01-15T00:00:00.000Z',
  paymentReceiptUrl: 'https://cdn.example.com/comprobante.pdf',
  paymentReceiptFileName: 'comprobante.pdf',
  paymentReceiptMimeType: 'application/pdf',
  paymentReceiptSizeBytes: 1024,
}

describe('ExpenseReportService — Fase 6 (reembolso: tenant y registro)', () => {
  let service: ExpenseReportService
  let mockExpenseReportModel: Record<string, jest.Mock>
  const clientA = new Types.ObjectId()
  const clientB = new Types.ObjectId()

  function reimbursementReportDoc(overrides: {
    clientId?: Types.ObjectId
    save?: jest.Mock
  }) {
    const save =
      overrides.save ??
      jest.fn().mockImplementation(function mockSave(this: unknown) {
        return Promise.resolve(this)
      })
    return {
      _id: new Types.ObjectId(reportId),
      title: 'Rendición reembolso',
      clientId: overrides.clientId ?? clientA,
      userId: {
        _id: new Types.ObjectId(userId),
        name: 'Colaborador',
        email: 'col@test.com',
      },
      status: 'approved',
      settlement: { type: 'reembolso' as const, difference: 120.5 },
      reimbursementPaymentInfo: undefined,
      save,
    }
  }

  function populateChainExecResult() {
    return {
      _id: new Types.ObjectId(reportId),
      title: 'Rendición reembolso',
      clientId: clientA,
      userId: {
        _id: new Types.ObjectId(userId),
        name: 'Colaborador',
        email: 'col@test.com',
      },
      status: 'reimbursed',
      settlement: { type: 'reembolso', difference: 120.5 },
      reimbursementPaymentInfo: {
        method: 'transferencia_bancaria',
        paymentReceiptUrl: validReimbursementDto.paymentReceiptUrl,
        paymentReceiptFileName: validReimbursementDto.paymentReceiptFileName,
        paymentReceiptMimeType: validReimbursementDto.paymentReceiptMimeType,
        transferDate: new Date(validReimbursementDto.transferDate),
        reference: 'REF-1',
      },
      expenseIds: [],
    }
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    mockExpenseReportModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({}),
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseReportService,
        {
          provide: getModelToken(ExpenseReport.name),
          useValue: mockExpenseReportModel,
        },
        { provide: getModelToken(Expense.name), useValue: {} },
        {
          provide: getModelToken(CajaChicaReport.name),
          useValue: {
            countDocuments: jest
              .fn()
              .mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
          },
        },
        { provide: EmailService, useValue: mockEmailService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: UserService, useValue: mockUserService },
        { provide: AdvanceService, useValue: mockAdvanceService },
        { provide: UploadService, useValue: {} },
        {
          // Solo lo usa la solicitud de caja chica: para el resto de pruebas
          // basta con que no haya ningún fondo vivo.
          provide: FondoCajaChicaService,
          useValue: {
            findVivoByResponsible: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            fondear: jest.fn(),
            registrarCargo: jest.fn(),
            reversarCargo: jest.fn(),
            reponer: jest.fn(),
          },
        },
        { provide: ProjectService, useValue: {} },
        { provide: CategoryService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            toBase: jest.fn().mockImplementation(async (monto: number) => ({
              montoBase: monto,
              tipoCambio: 1,
              tcFecha: '2026-01-01',
            })),
            resolveRate: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile()

    service = module.get<ExpenseReportService>(ExpenseReportService)
  })

  it('registerReimbursementPayment: Forbidden si tenant distinto al cliente de la rendición', async () => {
    const doc = reimbursementReportDoc({ clientId: clientA })
    mockExpenseReportModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(doc),
    })

    await expect(
      service.registerReimbursementPayment(
        reportId,
        validReimbursementDto,
        ROLES.ADMIN,
        { canApproveL2: true },
        { requestClientId: clientB.toHexString(), isSuperAdmin: false }
      )
    ).rejects.toThrow(ForbiddenException)

    expect(doc.save).not.toHaveBeenCalled()
  })

  it('registerReimbursementPayment: Forbidden si requestClientId vacío', async () => {
    const doc = reimbursementReportDoc({ clientId: clientA })
    mockExpenseReportModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(doc),
    })

    await expect(
      service.registerReimbursementPayment(
        reportId,
        validReimbursementDto,
        ROLES.ADMIN,
        { canApproveL2: true },
        { requestClientId: '', isSuperAdmin: false }
      )
    ).rejects.toThrow(ForbiddenException)

    expect(doc.save).not.toHaveBeenCalled()
  })

  it('registerReimbursementPayment: superadmin omite chequeo de tenant aunque clientId no coincida', async () => {
    const doc = reimbursementReportDoc({ clientId: clientA })
    const chain = {
      populate: jest.fn(),
      exec: jest.fn().mockResolvedValue(populateChainExecResult()),
    }
    chain.populate.mockReturnValue(chain)
    let findByIdCall = 0
    mockExpenseReportModel.findById.mockImplementation(() => {
      findByIdCall++
      if (findByIdCall === 1) {
        return { exec: jest.fn().mockResolvedValue(doc) }
      }
      return chain
    })

    await service.registerReimbursementPayment(
      reportId,
      validReimbursementDto,
      ROLES.SUPER_ADMIN,
      {},
      { requestClientId: clientB.toHexString(), isSuperAdmin: true }
    )

    expect(mockExpenseReportModel.findByIdAndUpdate).toHaveBeenCalled()
    expect(mockEmailService.sendRendicionReembolsoPagado).toHaveBeenCalled()
  })

  it('registerReimbursementPayment: persiste con tenant coincidente', async () => {
    const doc = reimbursementReportDoc({ clientId: clientA })
    const chain = {
      populate: jest.fn(),
      exec: jest.fn().mockResolvedValue(populateChainExecResult()),
    }
    chain.populate.mockReturnValue(chain)
    let findByIdCall = 0
    mockExpenseReportModel.findById.mockImplementation(() => {
      findByIdCall++
      if (findByIdCall === 1) {
        return { exec: jest.fn().mockResolvedValue(doc) }
      }
      return chain
    })

    const out = await service.registerReimbursementPayment(
      reportId,
      validReimbursementDto,
      ROLES.ADMIN,
      { canApproveL2: true },
      { requestClientId: clientA.toHexString(), isSuperAdmin: false }
    )

    expect(mockExpenseReportModel.findByIdAndUpdate).toHaveBeenCalled()
    expect(out.status).toBe('reimbursed')
    expect(mockEmailService.sendRendicionReembolsoPagado).toHaveBeenCalled()
  })
})

describe('ExpenseReportService — aprobación de SOLICITUD de viático (regla 1.3, cadena CONSECUTIVA VD-133)', () => {
  let service: ExpenseReportService
  let mockExpenseReportModel: Record<string, jest.Mock>

  const n1Id = new Types.ObjectId()
  const n2Id = new Types.ObjectId()
  const projectId = new Types.ObjectId()
  const solicitudReportId = new Types.ObjectId().toString()
  const solicitudUserId = new Types.ObjectId().toString()
  const solicitudClientId = new Types.ObjectId().toString()

  const mockUserServiceLocal = {
    findEmailNameClient: jest.fn().mockResolvedValue(null),
    findViaticoAccountingNotifyRecipients: jest.fn().mockResolvedValue([]),
    isEmailEnabled: jest.fn().mockResolvedValue(false),
    idsTitularesCubiertosPara: jest.fn().mockResolvedValue([]),
    idsTitularesCubiertosPor: jest.fn().mockResolvedValue([]),
    resolverSuplenteVigente: jest.fn().mockResolvedValue(null),
  }
  const mockNotificationsServiceLocal = { create: jest.fn().mockResolvedValue(undefined) }
  const mockAdvanceServiceLocal = {}

  function makeChain(): ChainStep[] {
    return [
      { level: 2, projectId, projectRole: 'seleccionado', approverIds: [n1Id] },
    ]
  }

  function makeTwoStepChain(): ChainStep[] {
    return [
      { level: 2, projectId, projectRole: 'principal', approverIds: [n1Id] },
      { level: 2, projectId, projectRole: 'seleccionado', approverIds: [n2Id] },
    ]
  }

  function reportDoc(overrides: Record<string, unknown> = {}) {
    return {
      _id: solicitudReportId,
      type: 'viatico',
      status: 'pending_l1',
      userId: solicitudUserId,
      clientId: solicitudClientId,
      viaticoApproverChain: makeChain(),
      viaticoApprovalLevel: 0,
      viaticoRequiredLevels: 1,
      viaticoApprovalHistory: [],
      viaticoAmount: 100,
      viaticoMoneda: '01',
      viaticoRejectedByRole: undefined as 'centro_costo' | 'contabilidad' | undefined,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    }
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    mockUserServiceLocal.findEmailNameClient.mockResolvedValue(null)
    mockUserServiceLocal.findViaticoAccountingNotifyRecipients.mockResolvedValue([])

    mockExpenseReportModel = {
      findById: jest.fn(),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseReportService,
        { provide: getModelToken(ExpenseReport.name), useValue: mockExpenseReportModel },
        { provide: getModelToken(Expense.name), useValue: {} },
        { provide: getModelToken(CajaChicaReport.name), useValue: { countDocuments: jest.fn() } },
        { provide: EmailService, useValue: {} },
        { provide: NotificationsService, useValue: mockNotificationsServiceLocal },
        { provide: UserService, useValue: mockUserServiceLocal },
        { provide: AdvanceService, useValue: mockAdvanceServiceLocal },
        { provide: UploadService, useValue: {} },
        {
          // Solo lo usa la solicitud de caja chica: para el resto de pruebas
          // basta con que no haya ningún fondo vivo.
          provide: FondoCajaChicaService,
          useValue: {
            findVivoByResponsible: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            fondear: jest.fn(),
            registrarCargo: jest.fn(),
            reversarCargo: jest.fn(),
            reponer: jest.fn(),
          },
        },
        { provide: ProjectService, useValue: {} },
        { provide: CategoryService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            toBase: jest.fn().mockImplementation(async (monto: number) => ({
              montoBase: monto,
              tipoCambio: 1,
              tcFecha: '2026-01-01',
            })),
            resolveRate: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile()

    service = module.get<ExpenseReportService>(ExpenseReportService)
    jest.spyOn(service, 'findOne').mockResolvedValue(reportDoc() as never)
  })

  describe('approveViatico', () => {
    // VD-133: antes el segundo paso era accionable desde el envio.
    it('el segundo paso NO se puede aprobar mientras el primero siga pendiente', async () => {
      const report = reportDoc({ viaticoApproverChain: makeTwoStepChain(), viaticoRequiredLevels: 2 })
      mockExpenseReportModel.findById.mockResolvedValue(report)

      await expect(
        service.approveViatico(
          solicitudReportId,
          { approvedBy: n2Id.toString() },
          n2Id.toString(),
          ROLES.COLABORADOR
        )
      ).rejects.toThrow()
      expect(report.viaticoApproverChain[1].approved).toBeFalsy()
      expect(report.status).toBe('pending_l1')
    })

    it('el segundo paso se habilita cuando el primero ya firmo', async () => {
      const chain = makeTwoStepChain()
      chain[0].approved = true
      const report = reportDoc({ viaticoApproverChain: chain, viaticoRequiredLevels: 2 })
      mockExpenseReportModel.findById.mockResolvedValue(report)

      await service.approveViatico(
        solicitudReportId,
        { approvedBy: n2Id.toString() },
        n2Id.toString(),
        ROLES.COLABORADOR
      )

      expect(report.viaticoApproverChain[1].approved).toBe(true)
      expect(report.status).toBe('pending_contabilidad')
    })

    it('rechaza a quien no es aprobador de ningún paso pendiente', async () => {
      const report = reportDoc({ viaticoApproverChain: makeTwoStepChain(), viaticoRequiredLevels: 2 })
      mockExpenseReportModel.findById.mockResolvedValue(report)
      const stranger = new Types.ObjectId().toString()

      await expect(
        service.approveViatico(solicitudReportId, { approvedBy: stranger }, stranger, ROLES.COLABORADOR)
      ).rejects.toThrow(ForbiddenException)
    })

    it('pasa a pending_contabilidad cuando ambos pasos ya aprobaron, sin importar el orden', async () => {
      const chain = makeTwoStepChain()
      chain[1].approved = true // N2(seleccionado) aprobó primero
      const report = reportDoc({ viaticoApproverChain: chain, viaticoRequiredLevels: 2, viaticoApprovalLevel: 1 })
      mockExpenseReportModel.findById.mockResolvedValue(report)

      await service.approveViatico(
        solicitudReportId,
        { approvedBy: n1Id.toString() },
        n1Id.toString(),
        ROLES.COLABORADOR
      )

      expect(report.viaticoApproverChain.every((s) => s.approved)).toBe(true)
      expect(report.status).toBe('pending_contabilidad')
    })
  })

  describe('rejectViatico', () => {
    // VD-133: el rechazo respeta el mismo orden que la aprobacion.
    it('rechaza la solicitud el aprobador al que le toca, con el paso previo ya firmado', async () => {
      const chain = makeTwoStepChain()
      chain[0].approved = true
      const report = reportDoc({ viaticoApproverChain: chain, viaticoRequiredLevels: 2 })
      mockExpenseReportModel.findById.mockResolvedValue(report)

      await service.rejectViatico(
        solicitudReportId,
        { rejectedBy: n2Id.toString(), rejectionReason: 'Falta sustento suficiente' },
        n2Id.toString(),
        ROLES.COLABORADOR
      )

      expect(report.status).toBe('rejected')
      expect(report.viaticoRejectedByRole).toBe('centro_costo')
    })

    it('rechaza a quien no es aprobador de ningún paso pendiente', async () => {
      const report = reportDoc({ viaticoApproverChain: makeTwoStepChain(), viaticoRequiredLevels: 2 })
      mockExpenseReportModel.findById.mockResolvedValue(report)
      const stranger = new Types.ObjectId().toString()

      await expect(
        service.rejectViatico(
          solicitudReportId,
          { rejectedBy: stranger, rejectionReason: 'motivo cualquiera' },
          stranger,
          ROLES.COLABORADOR
        )
      ).rejects.toThrow(ForbiddenException)
    })
  })
})

describe('ExpenseReportService — addExpenseToReport (reconstrucción de cadena por comprobante)', () => {
  let service: ExpenseReportService
  let mockExpenseReportModel: Record<string, jest.Mock>
  let mockExpenseModel: Record<string, jest.Mock>
  let mockProjectServiceLocal: {
    findManyByIds: jest.Mock
    findCajaChicaResponsibleIds: jest.Mock
  }
  let mockUserServiceLocal: {
    findTransactionalProfile: jest.Mock
    idsTitularesCubiertosPor: jest.Mock
    idsTitularesCubiertosPara: jest.Mock
    resolverSuplenteVigente: jest.Mock
  }
  let mockFondoService: {
    findVivoByResponsible: jest.Mock
    registrarCargo: jest.Mock
    reversarCargo: jest.Mock
  }

  const addReportId = new Types.ObjectId().toString()
  const addUserId = new Types.ObjectId().toString()
  const addClientId = new Types.ObjectId().toString()
  const existingExpenseId = new Types.ObjectId().toString()
  const newExpenseId = new Types.ObjectId().toString()
  const projectId = new Types.ObjectId().toString()

  function reportSelectResult(overrides: Record<string, unknown> = {}) {
    return {
      status: 'submitted',
      userId: addUserId,
      clientId: addClientId,
      expenseIds: [existingExpenseId],
      ...overrides,
    }
  }

  function mockFindByIdSelect(result: unknown) {
    mockExpenseReportModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(result),
        }),
      }),
    })
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    mockExpenseReportModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    }
    mockExpenseModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
    }
    mockProjectServiceLocal = {
      findManyByIds: jest.fn().mockResolvedValue([]),
      findCajaChicaResponsibleIds: jest.fn().mockResolvedValue([]),
    }
    mockUserServiceLocal = {
      findTransactionalProfile: jest.fn().mockResolvedValue(null),
      // Sin suplencias vigentes (VD-124): la bandeja se arma igual que antes.
      idsTitularesCubiertosPor: jest.fn().mockResolvedValue([]),
      idsTitularesCubiertosPara: jest.fn().mockResolvedValue([]),
      resolverSuplenteVigente: jest.fn().mockResolvedValue(null),
    }
    mockFondoService = {
      findVivoByResponsible: jest.fn().mockResolvedValue(null),
      registrarCargo: jest.fn().mockResolvedValue({}),
      reversarCargo: jest.fn().mockResolvedValue({}),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseReportService,
        { provide: getModelToken(ExpenseReport.name), useValue: mockExpenseReportModel },
        { provide: getModelToken(Expense.name), useValue: mockExpenseModel },
        { provide: getModelToken(CajaChicaReport.name), useValue: { countDocuments: jest.fn() } },
        { provide: EmailService, useValue: {} },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue(undefined) } },
        { provide: UserService, useValue: mockUserServiceLocal },
        { provide: AdvanceService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: FondoCajaChicaService, useValue: mockFondoService },
        { provide: ProjectService, useValue: mockProjectServiceLocal },
        { provide: CategoryService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            toBase: jest.fn().mockImplementation(async (monto: number) => ({
              montoBase: monto,
              tipoCambio: 1,
              tcFecha: '2026-01-01',
            })),
            resolveRate: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile()

    service = module.get<ExpenseReportService>(ExpenseReportService)
  })

  // El comprobante de caja chica descuenta del presupuesto y no puede superarlo.
  describe('caja chica: cargo contra el presupuesto', () => {
    beforeEach(() => {
      mockExpenseModel.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ montoBase: 500, total: 500 }),
          }),
        }),
      })
      mockExpenseModel.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 })
    })

    it('descuenta el comprobante del presupuesto', async () => {
      mockFindByIdSelect(reportSelectResult({ isCajaChica: true }))
      mockFondoService.findVivoByResponsible.mockResolvedValue({ _id: 'fondo-1' })

      await service.addExpenseToReport(addReportId, newExpenseId)

      expect(mockFondoService.registrarCargo).toHaveBeenCalledWith(
        'fondo-1',
        expect.objectContaining({ expenseId: newExpenseId, amount: 500 })
      )
    })

    it('si el gasto supera el presupuesto, no lo engancha y borra el comprobante', async () => {
      mockFindByIdSelect(reportSelectResult({ isCajaChica: true }))
      mockFondoService.findVivoByResponsible.mockResolvedValue({ _id: 'fondo-1' })
      mockFondoService.registrarCargo.mockRejectedValue(
        new BadRequestException('Saldo insuficiente en la caja chica CCH-0001')
      )

      await expect(
        service.addExpenseToReport(addReportId, newExpenseId)
      ).rejects.toThrow(/Saldo insuficiente/)

      expect(mockExpenseModel.deleteOne).toHaveBeenCalled()
      expect(mockExpenseReportModel.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('sin caja chica activa no deja cargar y borra el comprobante', async () => {
      mockFindByIdSelect(reportSelectResult({ isCajaChica: true }))
      mockFondoService.findVivoByResponsible.mockResolvedValue(null)

      await expect(
        service.addExpenseToReport(addReportId, newExpenseId)
      ).rejects.toThrow(/no tiene una caja chica activa/i)

      expect(mockExpenseModel.deleteOne).toHaveBeenCalled()
    })

    it('una rendición que NO es de caja chica no toca ningún presupuesto', async () => {
      mockFindByIdSelect(reportSelectResult({ status: 'submitted' }))

      await service.addExpenseToReport(addReportId, newExpenseId)

      expect(mockFondoService.registrarCargo).not.toHaveBeenCalled()
    })
  })

  // Decision del cliente (2026-08-18): el comprobante de caja chica sin centro
  // de costo se imputa al del responsable, el de su solicitud.
  describe('resolveCentroCostoCajaChica', () => {
    it('toma el centro de costo de la solicitud que abrio la caja', async () => {
      const ccSolicitud = new Types.ObjectId()
      const solicitudId = new Types.ObjectId()
      mockExpenseReportModel.findById = jest
        .fn()
        .mockReturnValueOnce({
          select: () => ({ lean: () => ({ exec: async () => ({ userId: addUserId, clientId: addClientId }) }) }),
        })
        .mockReturnValueOnce({
          select: () => ({ lean: () => ({ exec: async () => ({ projectId: ccSolicitud }) }) }),
        })
      mockFondoService.findVivoByResponsible.mockResolvedValue({ solicitudReportId: solicitudId })

      const cc = await service.resolveCentroCostoCajaChica(addReportId)

      expect(String(cc)).toBe(String(ccSolicitud))
      expect(mockUserServiceLocal.findTransactionalProfile).not.toHaveBeenCalled()
    })

    it('sin solicitud usable cae al centro de costo principal del responsable', async () => {
      const ccPerfil = new Types.ObjectId().toString()
      mockExpenseReportModel.findById = jest.fn().mockReturnValue({
        select: () => ({ lean: () => ({ exec: async () => ({ userId: addUserId, clientId: addClientId }) }) }),
      })
      mockFondoService.findVivoByResponsible.mockResolvedValue(null)
      mockUserServiceLocal.findTransactionalProfile.mockResolvedValue({
        primaryProjectId: ccPerfil,
        projectIds: [ccPerfil],
      })

      const cc = await service.resolveCentroCostoCajaChica(addReportId)

      expect(String(cc)).toBe(ccPerfil)
    })

    it('sin nada de donde sacarlo devuelve undefined', async () => {
      mockExpenseReportModel.findById = jest.fn().mockReturnValue({
        select: () => ({ lean: () => ({ exec: async () => null }) }),
      })

      await expect(service.resolveCentroCostoCajaChica(addReportId)).resolves.toBeUndefined()
    })
  })

  // Un tercero podia subir un comprobante a la caja chica ajena y consumirle el
  // presupuesto al dueño: el cargo va siempre contra el fondo del titular.
  describe('assertPuedeCargarEnCajaChica', () => {
    it('rechaza a quien no es el responsable de la caja chica', async () => {
      mockFindByIdSelect({ isCajaChica: true, userId: addUserId })

      await expect(
        service.assertPuedeCargarEnCajaChica(addReportId, new Types.ObjectId().toString())
      ).rejects.toThrow(/Solo el responsable de la caja chica/i)
    })

    it('deja pasar al responsable', async () => {
      mockFindByIdSelect({ isCajaChica: true, userId: addUserId })

      await expect(
        service.assertPuedeCargarEnCajaChica(addReportId, addUserId)
      ).resolves.toBeUndefined()
    })

    it('no se mete con las rendiciones que no son de caja chica', async () => {
      mockFindByIdSelect({ isCajaChica: false, userId: addUserId })

      await expect(
        service.assertPuedeCargarEnCajaChica(addReportId, new Types.ObjectId().toString())
      ).resolves.toBeUndefined()
    })
  })

  // El select de `update()` decide `esCajaChica`: sin el campo, los comprobantes
  // de una caja chica se enrutaban por el centro de costo de cada uno
  // (`buildRendicionChain`) en vez de por los aprobadores del responsable.
  // Solo se ejercita hasta la construccion de cadenas; el resto de `update()`
  // toca populate/correos que este mock no cubre, de ahi el catch.
  it('al ENVIAR una rendición de caja chica, las cadenas se arman con los aprobadores del responsable', async () => {
    mockFindByIdSelect(reportSelectResult({ status: 'open', isCajaChica: true }))
    const svc = service as unknown as Record<string, jest.Mock>
    jest.spyOn(svc as never, 'validateBeforeSubmit' as never).mockResolvedValue(undefined as never)
    const chains = jest
      .spyOn(svc as never, 'buildExpenseChains' as never)
      .mockResolvedValue(undefined as never)

    await service.update(addReportId, { status: 'submitted' } as never).catch(() => undefined)

    expect(chains).toHaveBeenCalledWith(
      expect.anything(),
      addUserId,
      addClientId,
      // `force` solo en el reenvío de una rendición rechazada; este envío es normal.
      { esCajaChica: true, force: false }
    )
  })

  it('el select de update() trae isCajaChica (de ahí sale esCajaChica)', async () => {
    const select = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(reportSelectResult({ status: 'open' })),
      }),
    })
    mockExpenseReportModel.findById.mockReturnValue({ select })

    await service.update(addReportId, { title: 'x' } as never).catch(() => undefined)

    expect(select.mock.calls[0][0]).toContain('isCajaChica')
  })

  it('agregar un comprobante a una rendición YA ENVIADA solo construye la cadena del nuevo (no toca los existentes)', async () => {
    mockFindByIdSelect(reportSelectResult({ status: 'submitted' }))

    await service.addExpenseToReport(addReportId, newExpenseId)

    expect(mockExpenseModel.find).toHaveBeenCalledTimes(1)
    const findArg = mockExpenseModel.find.mock.calls[0][0]
    expect(findArg._id.$in.map((id: Types.ObjectId) => id.toString())).toEqual([newExpenseId])
  })

  // Subir una factura a una rendición devuelta NO la reenvía: el colaborador
  // termina de corregir y pulsa "Reenviar" él mismo. Antes se reenviaba sola y
  // se quedaba sin poder subir el resto de comprobantes.
  it('agregar un comprobante a una rendición RECHAZADA reconstruye la cadena de TODOS y NO la reenvía', async () => {
    mockFindByIdSelect(reportSelectResult({ status: 'rejected' }))

    const result = await service.addExpenseToReport(addReportId, newExpenseId)

    const [, updateOp] = mockExpenseReportModel.findByIdAndUpdate.mock.calls[0]
    expect(updateOp.$set).toBeUndefined()
    expect(updateOp.$unset).toBeUndefined()
    expect(updateOp.$push.expenseIds.toString()).toBe(newExpenseId)
    expect(mockExpenseModel.find).toHaveBeenCalledTimes(1)
    const findArg = mockExpenseModel.find.mock.calls[0][0]
    expect(findArg._id.$in.map((id: Types.ObjectId) => id.toString()).sort()).toEqual(
      [existingExpenseId, newExpenseId].sort()
    )
    expect(result).toBeDefined()
  })

  it('agregar un comprobante a una rendición ABIERTA (aún no enviada) no construye ninguna cadena', async () => {
    mockFindByIdSelect(reportSelectResult({ status: 'open' }))

    await service.addExpenseToReport(addReportId, newExpenseId)

    expect(mockExpenseModel.find).not.toHaveBeenCalled()
  })

  const approverId = new Types.ObjectId().toString()

  function mockProjectWithOneLevel() {
    mockProjectServiceLocal.findManyByIds.mockResolvedValue([
      {
        _id: projectId,
        approverLevels: [{ level: 1, userIds: [new Types.ObjectId(approverId)] }],
      },
    ])
    mockUserServiceLocal.findTransactionalProfile.mockResolvedValue({
      projectIds: [projectId],
      primaryProjectId: projectId,
    })
  }

  function mockExpenseDoc(overrides: Record<string, unknown> = {}): {
    _id: Types.ObjectId
    proyectId: Types.ObjectId
    status: string
    approverChain: ChainStep[] | undefined
    requiredLevels?: number
    approvalLevel?: number
    save: jest.Mock
  } {
    return {
      _id: new Types.ObjectId(newExpenseId),
      proyectId: new Types.ObjectId(projectId),
      status: 'pending',
      approverChain: undefined,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    }
  }

  /** `expenseModel.findById(id).select('expenseReportId').lean().exec()` */
  function mockExpenseFindById(result: unknown) {
    mockExpenseModel.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(result),
        }),
      }),
    })
  }

  it('buildChainForNewExpense construye la cadena N1/N2 de un comprobante agregado a una rendición YA ENVIADA', async () => {
    mockProjectWithOneLevel()
    const expenseDoc = mockExpenseDoc()
    mockExpenseModel.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([expenseDoc]),
    })
    mockExpenseFindById({ expenseReportId: addReportId })
    mockFindByIdSelect(reportSelectResult({ status: 'submitted' }))

    await service.buildChainForNewExpense(newExpenseId, addUserId, addClientId)

    expect(expenseDoc.save).toHaveBeenCalledTimes(1)
    expect(expenseDoc.approverChain).toHaveLength(1)
    expect(expenseDoc.approverChain?.[0].approved).toBeFalsy()
    expect(expenseDoc.requiredLevels).toBe(1)
  })

  /**
   * La cadena se construye al ENVIAR, no al registrar el comprobante: mientras
   * la rendición siga abierta el colaborador todavía puede editar el monto, y
   * un comprobante ya aprobado antes del envío dejaba la rendición sin nadie
   * que la avanzara a Contabilidad.
   */
  it('buildChainForNewExpense NO construye nada mientras la rendición siga abierta', async () => {
    mockProjectWithOneLevel()
    mockExpenseFindById({ expenseReportId: addReportId })
    mockFindByIdSelect(reportSelectResult({ status: 'open' }))

    await service.buildChainForNewExpense(newExpenseId, addUserId, addClientId)

    expect(mockExpenseModel.find).not.toHaveBeenCalled()
  })

  it('buildChainForNewExpense no hace nada si falta ownerUserId o clientId', async () => {
    await service.buildChainForNewExpense(newExpenseId, '', addClientId)
    expect(mockExpenseModel.find).not.toHaveBeenCalled()
  })

  it('no reconstruye (ni pisa aprobaciones en curso de) un comprobante que YA tiene cadena — envío normal, safety net', async () => {
    mockProjectWithOneLevel()
    const existingChain: ChainStep[] = [
      {
        level: 1,
        projectId: new Types.ObjectId(projectId),
        projectRole: 'principal',
        approverIds: [new Types.ObjectId(approverId)],
        approved: true,
        approvedBy: new Types.ObjectId(approverId),
        approvedAt: new Date(),
      },
    ]
    const expenseDoc = mockExpenseDoc({ approverChain: existingChain })
    mockExpenseModel.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([expenseDoc]),
    })
    mockExpenseFindById({ expenseReportId: addReportId })
    mockFindByIdSelect(reportSelectResult({ status: 'submitted' }))

    // Reenvío normal (rama wasSubmitted de addExpenseToReport): solo agrega un
    // comprobante nuevo, pero si el motor volviera a mirar uno ya chained no
    // debe pisarlo.
    await service.buildChainForNewExpense(newExpenseId, addUserId, addClientId)

    expect(expenseDoc.save).not.toHaveBeenCalled()
    expect(expenseDoc.approverChain).toBe(existingChain)
  })

  it('agregar un comprobante a una rendición RECHAZADA SÍ reconstruye (force) la cadena de comprobantes que ya tenían aprobaciones', async () => {
    mockProjectWithOneLevel()
    const staleApprovedChain: ChainStep[] = [
      {
        level: 1,
        projectId: new Types.ObjectId(projectId),
        projectRole: 'principal',
        approverIds: [new Types.ObjectId(approverId)],
        approved: true,
        approvedBy: new Types.ObjectId(approverId),
        approvedAt: new Date(),
      },
    ]
    const existingDoc = mockExpenseDoc({
      _id: new Types.ObjectId(existingExpenseId),
      approverChain: staleApprovedChain,
    })
    mockExpenseModel.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([existingDoc]),
    })
    mockFindByIdSelect(reportSelectResult({ status: 'rejected', expenseIds: [existingExpenseId] }))

    await service.addExpenseToReport(addReportId, newExpenseId)

    expect(existingDoc.save).toHaveBeenCalledTimes(1)
    expect(existingDoc.approverChain).not.toBe(staleApprovedChain)
    expect(existingDoc.approverChain?.[0].approved).toBeFalsy()
  })

  it('findAllByCoordinator lista cualquier reporte con un comprobante en la cadena del aprobador, sin exigir isDirecta (regla 1.9 — visible desde el upload, aunque siga `open`)', async () => {
    const coordId = new Types.ObjectId().toString()
    const reportWithChain = new Types.ObjectId()

    // expenseModel.find(...).distinct('expenseReportId').exec() → reportes con
    // un comprobante donde el coordinador es aprobador.
    mockExpenseModel.find.mockReturnValue({
      distinct: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([reportWithChain]),
      }),
    })

    const chainable: Record<string, jest.Mock> = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }
    mockExpenseReportModel.find = jest.fn().mockReturnValue(chainable)

    await service.findAllByCoordinator(coordId, addClientId)

    const query = mockExpenseReportModel.find.mock.calls[0][0] as { $or: Array<Record<string, any>> }
    // Ninguna cláusula debe restringir a isDirecta: el match por cadena es general.
    expect(query.$or.some(c => c['isDirecta'] === true)).toBe(false)
    const chainClause = query.$or.find(c => c['_id']?.$in)
    expect(chainClause).toBeDefined()
    expect(
      chainClause!['_id'].$in.map((x: Types.ObjectId) => x.toString())
    ).toContain(reportWithChain.toString())
  })

  it('findAllByCoordinator suma las cajas chicas de los responsables que aprueba (visibles antes del envío, cuando todavía no hay cadena)', async () => {
    const coordId = new Types.ObjectId().toString()
    const responsableId = new Types.ObjectId().toString()
    mockProjectServiceLocal.findCajaChicaResponsibleIds.mockResolvedValue([responsableId])
    mockExpenseModel.find.mockReturnValue({
      distinct: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    })
    mockExpenseReportModel.find = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    })

    await service.findAllByCoordinator(coordId, addClientId)

    const query = mockExpenseReportModel.find.mock.calls[0][0] as { $or: Array<Record<string, any>> }
    const cajaChicaClause = query.$or.find(c => c['isCajaChica'] === true)
    expect(cajaChicaClause).toBeDefined()
    expect(
      cajaChicaClause!['userId'].$in.map((x: Types.ObjectId) => x.toString())
    ).toEqual([responsableId])
  })

  it('findAllByCoordinator no agrega la cláusula de caja chica si el usuario no aprueba a nadie', async () => {
    mockProjectServiceLocal.findCajaChicaResponsibleIds.mockResolvedValue([])
    mockExpenseModel.find.mockReturnValue({
      distinct: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    })
    mockExpenseReportModel.find = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    })

    await service.findAllByCoordinator(new Types.ObjectId().toString(), addClientId)

    const query = mockExpenseReportModel.find.mock.calls[0][0] as { $or: Array<Record<string, any>> }
    expect(query.$or.some(c => c['isCajaChica'] === true)).toBe(false)
  })

  // Regla 1.10 en la cadena de la RENDICIÓN a nivel de reporte (fase post-pago
  // del viático). `buildReportRendicionChain` es anterior a los aprobadores por
  // usuario y armaba la cadena solo con los niveles del centro de costo.
  it('buildReportRendicionChain usa los aprobadores propios del colaborador cuando los tiene', async () => {
    const ownApprover = new Types.ObjectId().toString()
    mockProjectServiceLocal.findManyByIds.mockResolvedValue([
      {
        _id: projectId,
        approverLevels: [{ level: 1, userIds: [new Types.ObjectId(approverId)] }],
      },
    ])
    mockUserServiceLocal.findTransactionalProfile.mockResolvedValue({
      projectIds: [projectId],
      primaryProjectId: projectId,
      approverLevels: [{ level: 1, userIds: [ownApprover] }],
    })

    const chain: ChainStep[] = await (
      service as unknown as {
        buildReportRendicionChain: (
          ownerUserId: string,
          clientId: string,
          reportProjectId: string
        ) => Promise<ChainStep[]>
      }
    ).buildReportRendicionChain(addUserId, addClientId, projectId)

    const approverIds = chain.flatMap(step =>
      step.approverIds.map(id => String(id))
    )
    expect(approverIds).toContain(ownApprover)
    expect(approverIds).not.toContain(approverId)
    // Y queda marcado que salieron del usuario, no del centro de costo.
    expect(chain.every(step => step.source === 'user')).toBe(true)
  })
})

describe('ExpenseReportService — findExpensesPaginated (búsqueda por RUC, VD-65)', () => {
  let service: ExpenseReportService
  let mockExpenseReportModel: Record<string, jest.Mock>
  let mockExpenseModel: Record<string, jest.Mock>

  const reportId = new Types.ObjectId().toString()
  const expenseId = new Types.ObjectId().toString()

  beforeEach(async () => {
    jest.clearAllMocks()

    mockExpenseReportModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ expenseIds: [expenseId] }),
        }),
      }),
    }
    mockExpenseModel = {
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseReportService,
        { provide: getModelToken(ExpenseReport.name), useValue: mockExpenseReportModel },
        { provide: getModelToken(Expense.name), useValue: mockExpenseModel },
        { provide: getModelToken(CajaChicaReport.name), useValue: { countDocuments: jest.fn() } },
        { provide: EmailService, useValue: {} },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        // Sin suplencias vigentes: estas pruebas son del motor de cadena puro
        // (VD-124 no cambia nada cuando nadie está de vacaciones).
        {
          provide: UserService,
          useValue: {
            idsTitularesCubiertosPara: jest.fn().mockResolvedValue([]),
            idsTitularesCubiertosPor: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: AdvanceService, useValue: {} },
        { provide: UploadService, useValue: {} },
        {
          // Solo lo usa la solicitud de caja chica: para el resto de pruebas
          // basta con que no haya ningún fondo vivo.
          provide: FondoCajaChicaService,
          useValue: {
            findVivoByResponsible: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            fondear: jest.fn(),
            registrarCargo: jest.fn(),
            reversarCargo: jest.fn(),
            reponer: jest.fn(),
          },
        },
        { provide: ProjectService, useValue: {} },
        { provide: CategoryService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            toBase: jest.fn().mockImplementation(async (monto: number) => ({
              montoBase: monto,
              tipoCambio: 1,
              tcFecha: '2026-01-01',
            })),
            resolveRate: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile()

    service = module.get<ExpenseReportService>(ExpenseReportService)
  })

  it('filtra por rucEmisor dentro del JSON data, no por concepto', async () => {
    await service.findExpensesPaginated(reportId, { page: 1, limit: 10, search: '20123456789' })

    const filter = mockExpenseModel.find.mock.calls[0][0] as {
      $and?: Array<Record<string, any>>
    }
    expect(filter.$and).toBeDefined()
    const clause = filter.$and![0]
    // Apunta al campo data con un regex anclado a la clave rucEmisor.
    expect(clause['data'].$regex).toContain('rucEmisor')
    expect(clause['data'].$regex).toContain('20123456789')
    // Ya no debe buscar por description ni por los campos de concepto/movilidad.
    expect(clause['description']).toBeUndefined()
    expect(clause['$or']).toBeUndefined()
  })

  it('no agrega filtro de búsqueda cuando el término está vacío', async () => {
    await service.findExpensesPaginated(reportId, { page: 1, limit: 10, search: '   ' })

    const filter = mockExpenseModel.find.mock.calls[0][0] as {
      $and?: Array<Record<string, any>>
    }
    expect(filter.$and).toBeUndefined()
  })

  // VD-114: "Pendiente" leía `status` directo, pero ahí se guarda el resultado
  // de la validación SUNAT al cargar el comprobante ('VALIDO_ACEPTADO',
  // 'sunat_error'…), así que los que estaban en 0/2 aprobaciones no salían.
  describe('filtro por estado (VD-114)', () => {
    const filtroDe = () =>
      mockExpenseModel.find.mock.calls[0][0] as {
        status?: unknown
        $and?: Array<Record<string, any>>
      }

    it('pendiente = ni aprobado ni rechazado, sin leer el estado SUNAT', async () => {
      await service.findExpensesPaginated(reportId, { page: 1, limit: 10, status: 'pending' })

      const filter = filtroDe()
      expect(filter.status).toBeUndefined()
      expect(filter.$and).toEqual([
        { status: { $nin: ['approved', 'rejected'] } },
        { contabilidadStatus: { $ne: 'rejected' } },
      ])
    })

    it('rechazado incluye el rechazo de Contabilidad', async () => {
      await service.findExpensesPaginated(reportId, { page: 1, limit: 10, status: 'rejected' })

      expect(filtroDe().$and).toEqual([
        { $or: [{ status: 'rejected' }, { contabilidadStatus: 'rejected' }] },
      ])
    })

    it('aprobado sigue leyendo el estado combinado', async () => {
      await service.findExpensesPaginated(reportId, { page: 1, limit: 10, status: 'approved' })

      expect(filtroDe().status).toBe('approved')
    })

    it('"me falta aprobar" trae los pasos sin resolver donde el actor es aprobador', async () => {
      const actorUserId = new Types.ObjectId().toString()

      await service.findExpensesPaginated(reportId, {
        page: 1,
        limit: 10,
        status: 'mine_pending',
        actorUserId,
      })

      const [chainClause, notRejected] = filtroDe().$and!
      const elem = (chainClause['approverChain'] as any).$elemMatch
      expect(elem.approved).toEqual({ $ne: true })
      // VD-124: la consulta pasó de `= actor` a `$in [identidades]` para incluir
      // a los titulares que el actor cubre por vacaciones. Sin suplencias
      // vigentes la lista es solo él, que es este caso.
      expect((elem.approverIds.$in as any[]).map(String)).toEqual([actorUserId])
      expect(notRejected).toEqual({ status: { $ne: 'rejected' } })
    })

    it('"me falta aprobar" sin usuario identificado no devuelve nada', async () => {
      await service.findExpensesPaginated(reportId, { page: 1, limit: 10, status: 'mine_pending' })

      expect(filtroDe().$and).toEqual([{ _id: null }])
    })
  })
})

// La planilla de movilidad hereda la OT de su rendición y la OT es opcional
// tanto al solicitar un viático como al crear una rendición directa. Este
// método marca los casos en los que no hay ninguna que exigirle a la planilla.
describe('ExpenseReportService — isReportSinOrdenTrabajo', () => {
  let service: ExpenseReportService
  let mockExpenseReportModel: Record<string, jest.Mock>

  const reportId = new Types.ObjectId().toString()
  const otId = new Types.ObjectId()

  const conReporte = (report: Record<string, unknown> | null) => {
    mockExpenseReportModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(report),
        }),
      }),
    })
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    mockExpenseReportModel = { findById: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseReportService,
        { provide: getModelToken(ExpenseReport.name), useValue: mockExpenseReportModel },
        { provide: getModelToken(Expense.name), useValue: {} },
        { provide: getModelToken(CajaChicaReport.name), useValue: { countDocuments: jest.fn() } },
        { provide: EmailService, useValue: {} },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        // Sin suplencias vigentes: estas pruebas son del motor de cadena puro
        // (VD-124 no cambia nada cuando nadie está de vacaciones).
        {
          provide: UserService,
          useValue: {
            idsTitularesCubiertosPara: jest.fn().mockResolvedValue([]),
            idsTitularesCubiertosPor: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: AdvanceService, useValue: {} },
        { provide: UploadService, useValue: {} },
        {
          // Solo lo usa la solicitud de caja chica: para el resto de pruebas
          // basta con que no haya ningún fondo vivo.
          provide: FondoCajaChicaService,
          useValue: {
            findVivoByResponsible: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            fondear: jest.fn(),
            registrarCargo: jest.fn(),
            reversarCargo: jest.fn(),
            reponer: jest.fn(),
          },
        },
        { provide: ProjectService, useValue: {} },
        { provide: CategoryService, useValue: {} },
        { provide: CurrencyService, useValue: {} },
      ],
    }).compile()

    service = module.get<ExpenseReportService>(ExpenseReportService)
  })

  it('viático sin OT en la solicitud: no hay OT que exigir', async () => {
    conReporte({ type: 'viatico' })
    await expect(service.isReportSinOrdenTrabajo(reportId)).resolves.toBe(true)
  })

  it('viático con OT: la planilla debe llevarla', async () => {
    conReporte({ type: 'viatico', viaticoOrdenTrabajoId: otId })
    await expect(service.isReportSinOrdenTrabajo(reportId)).resolves.toBe(false)
  })

  it('directa sin OT propia: no hay OT que exigir', async () => {
    conReporte({ isDirecta: true })
    await expect(service.isReportSinOrdenTrabajo(reportId)).resolves.toBe(true)
  })

  it('directa con OT propia: la planilla debe llevarla', async () => {
    conReporte({ isDirecta: true, directaOrdenTrabajoId: otId })
    await expect(service.isReportSinOrdenTrabajo(reportId)).resolves.toBe(false)
  })

  it('caja chica: no tiene OT propia, asi que no hay nada que heredar', async () => {
    conReporte({ isCajaChica: true })
    await expect(service.isReportSinOrdenTrabajo(reportId)).resolves.toBe(true)
  })

  it('rendición común (ni viático ni directa): la OT se sigue exigiendo', async () => {
    conReporte({})
    await expect(service.isReportSinOrdenTrabajo(reportId)).resolves.toBe(false)
  })

  it('id inválido o rendición inexistente: no se exime a nadie', async () => {
    await expect(service.isReportSinOrdenTrabajo('no-es-un-id')).resolves.toBe(false)
    await expect(service.isReportSinOrdenTrabajo()).resolves.toBe(false)
    conReporte(null)
    await expect(service.isReportSinOrdenTrabajo(reportId)).resolves.toBe(false)
  })
})
