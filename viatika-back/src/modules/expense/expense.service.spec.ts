import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import { ConfigService } from '@nestjs/config'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ExpenseService } from './expense.service'
import { Expense } from './entities/expense.entity'
import { EmailService } from '../email/email.service'
import { ProjectService } from '../project/project.service'
import { UserService } from '../user/user.service'
import { SunatConfigService } from '../sunat-config/sunat-config.service'
import { HttpService } from '@nestjs/axios'
import { UploadService } from '../upload/upload.service'
import { ExpenseReportService } from '../expense-report/expense-report.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CategoryService } from '../category/category.service'
import { CurrencyService } from '../exchange-rate/currency.service'
import { CreateExpenseDto } from './dto/create-expense.dto'
import { Client } from '../client/entities/client.entity'
import { ROLES } from '../auth/enums/roles.enum'
import { ChainStep } from '../advance/approval-chain.util'

describe('ExpenseService — email gating (isEmailEnabled)', () => {
  let service: ExpenseService

  const mockEmailServiceGating = {
    buildAppUrl: jest.fn().mockReturnValue('http://app'),
    sendInvoiceApprovedToColaborador: jest.fn().mockResolvedValue(undefined),
  }

  const mockUserServiceGating = {
    findOne: jest.fn(),
    findAll: jest.fn(),
    isEmailEnabled: jest.fn(),
    idsTitularesCubiertosPara: jest.fn().mockResolvedValue([]),
    idsTitularesCubiertosPor: jest.fn().mockResolvedValue([]),
    resolverSuplenteVigente: jest.fn().mockResolvedValue(null),
  }

  const mockCategoryServiceGating = {
    findOne: jest.fn().mockResolvedValue(null),
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test') },
        },
        {
          provide: getModelToken(Expense.name),
          useValue: { aggregate: jest.fn() },
        },
        // Empresa sin topes configurados: `findById` resuelve a null.
        {
          provide: getModelToken(Client.name),
          useValue: { findById: () => ({ lean: () => ({ exec: async () => null }) }) },
        },
        { provide: EmailService, useValue: mockEmailServiceGating },
        { provide: ProjectService, useValue: {} },
        { provide: UserService, useValue: mockUserServiceGating },
        { provide: SunatConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ExpenseReportService, useValue: {} },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: CategoryService, useValue: mockCategoryServiceGating },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            resolveRate: jest.fn().mockResolvedValue(3.75),
          },
        },
      ],
    }).compile()

    service = module.get<ExpenseService>(ExpenseService)
  })

  const clientId = new Types.ObjectId().toHexString()

  describe('sendApprovalEmails — collaborator email gating', () => {
    const createdBy = new Types.ObjectId().toHexString()
    const collab1Id = new Types.ObjectId()

    const expense = { data: null, createdBy, clientId }

    it('skips collaborator approval email when isEmailEnabled returns false', async () => {
      mockUserServiceGating.findOne.mockResolvedValue({
        email: 'creator@test.com',
        name: 'Creator',
      })
      mockUserServiceGating.findAll.mockResolvedValue([
        { _id: collab1Id, email: 'collab@test.com', name: 'Collab' },
      ])
      mockUserServiceGating.isEmailEnabled.mockResolvedValue(false)

      await (service as any).sendApprovalEmails(expense, null, 'Admin', 'User')

      expect(
        mockEmailServiceGating.sendInvoiceApprovedToColaborador
      ).not.toHaveBeenCalled()
    })

    it('sends collaborator approval email when isEmailEnabled returns true', async () => {
      mockUserServiceGating.findOne.mockResolvedValue({
        email: 'creator@test.com',
        name: 'Creator',
      })
      mockUserServiceGating.findAll.mockResolvedValue([
        { _id: collab1Id, email: 'collab@test.com', name: 'Collab' },
      ])
      mockUserServiceGating.isEmailEnabled.mockResolvedValue(true)

      await (service as any).sendApprovalEmails(expense, null, 'Admin', 'User')

      expect(
        mockEmailServiceGating.sendInvoiceApprovedToColaborador
      ).toHaveBeenCalledWith('collab@test.com', expect.any(Object))
    })
  })
})

describe('ExpenseService — Fase 5 (plazos y límites de categoría)', () => {
  let service: ExpenseService

  const mockExpenseRepository = {
    aggregate: jest.fn(),
  }

  const mockCategoryService = {
    findOne: jest.fn(),
  }

  const noopDeps = {
    emailService: {},
    projectService: {},
    userService: {},
    sunatConfigService: {},
    httpService: {},
    uploadService: {},
    expenseReportService: {},
    notificationsService: {},
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-05-15T15:00:00.000Z'))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test-openai-key') },
        },
        {
          provide: getModelToken(Expense.name),
          useValue: mockExpenseRepository,
        },
        // Empresa sin topes configurados: `findById` resuelve a null.
        {
          provide: getModelToken(Client.name),
          useValue: { findById: () => ({ lean: () => ({ exec: async () => null }) }) },
        },
        { provide: EmailService, useValue: noopDeps.emailService },
        { provide: ProjectService, useValue: noopDeps.projectService },
        { provide: UserService, useValue: noopDeps.userService },
        { provide: SunatConfigService, useValue: noopDeps.sunatConfigService },
        { provide: HttpService, useValue: noopDeps.httpService },
        { provide: UploadService, useValue: noopDeps.uploadService },
        {
          provide: ExpenseReportService,
          useValue: noopDeps.expenseReportService,
        },
        {
          provide: NotificationsService,
          useValue: noopDeps.notificationsService,
        },
        { provide: CategoryService, useValue: mockCategoryService },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            resolveRate: jest.fn().mockResolvedValue(3.75),
          },
        },
      ],
    }).compile()

    service = module.get<ExpenseService>(ExpenseService)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('evaluateDeadline', () => {
    it('sin fecha no marca observación', () => {
      const out = (
        service as unknown as {
          evaluateDeadline: (d?: string | null) => unknown
        }
      ).evaluateDeadline(null)
      expect(out).toEqual({ observado: false })
    })

    it('emisión reciente no observa', () => {
      const out = (
        service as unknown as { evaluateDeadline: (d: string) => unknown }
      ).evaluateDeadline('2026-05-14')
      expect(out).toEqual({ observado: false })
    })

    it('emisión con varios días de antigüedad no observa', () => {
      const out = (
        service as unknown as { evaluateDeadline: (d: string) => unknown }
      ).evaluateDeadline('2026-05-10')
      expect(out).toEqual({ observado: false })
    })

    it('emisión de mes anterior tampoco rechaza', () => {
      const out = (
        service as unknown as { evaluateDeadline: (d: string) => unknown }
      ).evaluateDeadline('2026-04-20')
      expect(out).toEqual({ observado: false })
    })
  })

  describe('evaluateCategoryLimit', () => {
    const bodyBase = (): CreateExpenseDto =>
      ({
        expenseReportId: new Types.ObjectId().toString(),
        categoryId: new Types.ObjectId().toString(),
        clientId: new Types.ObjectId().toString(),
      }) as CreateExpenseDto

    it('sin datos de categoría no evalúa', async () => {
      const b = bodyBase()
      delete (b as { expenseReportId?: string }).expenseReportId
      const out = await (
        service as unknown as {
          evaluateCategoryLimit: (
            dto: CreateExpenseDto,
            n: number
          ) => Promise<unknown>
        }
      ).evaluateCategoryLimit(b, 100)
      expect(out).toEqual({})
      expect(mockCategoryService.findOne).not.toHaveBeenCalled()
    })

    it('bloquea al llegar o superar el 100% del límite', async () => {
      mockCategoryService.findOne.mockResolvedValue({ limit: 100 })
      mockExpenseRepository.aggregate.mockResolvedValue([{ total: 92 }])
      await expect(
        (
          service as unknown as {
            evaluateCategoryLimit: (
              dto: CreateExpenseDto,
              n: number
            ) => Promise<unknown>
          }
        ).evaluateCategoryLimit(bodyBase(), 10)
      ).rejects.toThrow(/Límite de categoría/)
    })

    it('alerta al alcanzar al menos el 90%', async () => {
      mockCategoryService.findOne.mockResolvedValue({ limit: 100 })
      mockExpenseRepository.aggregate.mockResolvedValue([{ total: 85 }])
      const out = await (
        service as unknown as {
          evaluateCategoryLimit: (
            dto: CreateExpenseDto,
            n: number
          ) => Promise<unknown>
        }
      ).evaluateCategoryLimit(bodyBase(), 10)
      expect(out).toMatchObject({
        warning: expect.stringContaining('90%'),
      })
    })

    it('por debajo del 90% devuelve solo porcentaje', async () => {
      mockCategoryService.findOne.mockResolvedValue({ limit: 100 })
      mockExpenseRepository.aggregate.mockResolvedValue([{ total: 10 }])
      const out = await (
        service as unknown as {
          evaluateCategoryLimit: (
            dto: CreateExpenseDto,
            n: number
          ) => Promise<unknown>
        }
      ).evaluateCategoryLimit(bodyBase(), 50)
      expect(out).toEqual({ percent: 60 })
      expect((out as { warning?: string }).warning).toBeUndefined()
    })
  })
})

describe('ExpenseService — aprobación por comprobante (regla 1.4, cadena CONSECUTIVA VD-133)', () => {
  let service: ExpenseService
  let mockExpenseModel: { findOne: jest.Mock; findByIdAndUpdate: jest.Mock }
  let mockNotificationsService: { create: jest.Mock }

  const clientId = new Types.ObjectId().toHexString()
  const expenseId = new Types.ObjectId().toHexString()
  const n1Id = new Types.ObjectId()
  const n2Id = new Types.ObjectId()
  const projectId = new Types.ObjectId()

  const actorN1 = { userId: n1Id.toString(), roleName: ROLES.COLABORADOR, clientId }
  const actorN2 = { userId: n2Id.toString(), roleName: ROLES.COLABORADOR, clientId }

  function makeChain(): ChainStep[] {
    return [
      { level: 1, projectId, projectRole: 'principal', approverIds: [n1Id] },
      { level: 2, projectId, projectRole: 'principal', approverIds: [n2Id] },
    ]
  }

  function baseExpense(overrides: Record<string, unknown> = {}) {
    return {
      _id: expenseId,
      clientId,
      createdBy: new Types.ObjectId().toHexString(),
      approverChain: makeChain(),
      approvalLevel: 0,
      requiredLevels: 2,
      approvalHistory: [],
      contabilidadStatus: 'pending',
      status: 'pending',
      ...overrides,
    }
  }

  function mockLoadExpense(expense: unknown) {
    const query = {
      populate: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(expense),
    }
    mockExpenseModel.findOne.mockReturnValue(query)
  }

  function mockUpdate(result: unknown) {
    mockExpenseModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(result),
    })
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    mockNotificationsService = { create: jest.fn().mockResolvedValue(undefined) }
    mockExpenseModel = { findOne: jest.fn(), findByIdAndUpdate: jest.fn() }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('sk-test') } },
        { provide: getModelToken(Expense.name), useValue: mockExpenseModel },
        // Empresa sin topes configurados: `findById` resuelve a null.
        {
          provide: getModelToken(Client.name),
          useValue: { findById: () => ({ lean: () => ({ exec: async () => null }) }) },
        },
        { provide: EmailService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        // Sin suplencias vigentes: estas pruebas son del motor de cadena puro
        // (VD-124 no cambia nada cuando nadie está de vacaciones).
        {
          provide: UserService,
          useValue: { idsTitularesCubiertosPara: jest.fn().mockResolvedValue([]) },
        },
        { provide: SunatConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ExpenseReportService, useValue: {} },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: CategoryService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            resolveRate: jest.fn().mockResolvedValue(3.75),
          },
        },
      ],
    }).compile()

    service = module.get<ExpenseService>(ExpenseService)
  })

  describe('determineCodComp (VD-70: tipo de comprobante → codComp SUNAT)', () => {
    const codComp = (tipo?: string): string => (service as any).determineCodComp(tipo)

    it('Factura → 01, Boleta → 03', () => {
      expect(codComp('Factura')).toBe('01')
      expect(codComp('Boleta')).toBe('03')
    })

    it('es case-insensitive y tolera variantes como "Boleta Electrónica"', () => {
      expect(codComp('BOLETA')).toBe('03')
      expect(codComp('boleta electrónica')).toBe('03')
      expect(codComp('  factura  ')).toBe('01')
    })

    it('cae a Factura (01) cuando el tipo es desconocido o vacío', () => {
      expect(codComp(undefined)).toBe('01')
      expect(codComp('')).toBe('01')
      expect(codComp('Ticket')).toBe('01')
    })

    it('mapea nota de crédito (07) y débito (08) — catálogo listo aunque el form no las exponga aún', () => {
      expect(codComp('Nota de Crédito')).toBe('07')
      expect(codComp('NOTA DE CREDITO ELECTRONICA')).toBe('07')
      expect(codComp('Nota de Débito')).toBe('08')
      expect(codComp('nota de debito')).toBe('08')
    })
  })

  describe('sanitizeComentario (VD-103: comentario breve, sin monto ni empresa)', () => {
    const clean = (comentario?: string, razonSocial?: string): string | undefined =>
      (service as any).sanitizeComentario(comentario, razonSocial)

    it('quita el nombre del emisor y el importe', () => {
      expect(
        clean(
          'Servicio de transporte de carga por Empresa de Transporte S.A. por S/ 1,000.00.',
          'Empresa de Transporte S.A.'
        )
      ).toBe('Servicio de transporte de carga')
    })

    it('quita el importe aunque el emisor no venga en la extracción', () => {
      expect(clean('Servicio de movilidad por S/ 90.00')).toBe('Servicio de movilidad')
      expect(clean('Almuerzo de trabajo por $ 45')).toBe('Almuerzo de trabajo')
    })

    it('deja intacta una descripción que ya es breve y limpia', () => {
      expect(clean('Compra de útiles de oficina')).toBe('Compra de útiles de oficina')
    })

    it('se queda con la primera oración y recorta a 60 caracteres', () => {
      expect(
        clean('Servicio de hospedaje. Incluye desayuno y traslado al aeropuerto.')
      ).toBe('Servicio de hospedaje')
      expect((clean('a'.repeat(80)) ?? '').length).toBeLessThanOrEqual(60)
    })

    it('tolera valores vacíos o ausentes', () => {
      expect(clean(undefined)).toBeUndefined()
      expect(clean('   ')).toBeUndefined()
    })
  })

  describe('approveByCoord', () => {
    // VD-133: antes el N2 podia firmar sin que el N1 hubiera actuado.
    it('no deja que N2 apruebe antes que N1', async () => {
      const expense = baseExpense()
      mockLoadExpense(expense)
      mockUpdate({ ...expense })

      await expect(service.approveByCoord(expenseId, actorN2)).rejects.toThrow()
      expect(mockExpenseModel.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('el N2 aprueba una vez que el N1 ya firmo', async () => {
      const expense = baseExpense()
      expense.approverChain[0].approved = true
      mockLoadExpense(expense)
      mockUpdate({ ...expense })

      await service.approveByCoord(expenseId, actorN2)

      const [, updatePayload] = mockExpenseModel.findByIdAndUpdate.mock.calls[0]
      expect(updatePayload.$set.approverChain[1].approved).toBe(true)
    })

    it('rechaza a quien no es aprobador de ningún paso pendiente', async () => {
      const expense = baseExpense()
      mockLoadExpense(expense)
      const stranger = { userId: new Types.ObjectId().toString(), roleName: ROLES.COLABORADOR, clientId }

      await expect(service.approveByCoord(expenseId, stranger)).rejects.toThrow(ForbiddenException)
    })

    it('marca la cadena completa cuando N1 y N2 ya aprobaron, sin importar el orden', async () => {
      const chain = makeChain()
      chain[1].approved = true // N2 aprobó primero
      const expense = baseExpense({ approverChain: chain, approvalLevel: 1 })
      mockLoadExpense(expense)
      mockUpdate({ ...expense })

      await service.approveByCoord(expenseId, actorN1)

      const [, updatePayload] = mockExpenseModel.findByIdAndUpdate.mock.calls[0]
      expect(updatePayload.$set.approverChain.every((s: ChainStep) => s.approved)).toBe(true)
      // Cadena de Coordinador completa, pero Contabilidad sigue pendiente.
      expect(updatePayload.$set.status).toBe('pending')
    })

    it('rechaza aprobar cuando la rendición aún no fue enviada (approverChain vacío)', async () => {
      const expense = baseExpense({ approverChain: [] })
      mockLoadExpense(expense)

      await expect(service.approveByCoord(expenseId, actorN1)).rejects.toThrow(BadRequestException)
    })
  })

  describe('rejectByCoord', () => {
    // VD-133: el rechazo sigue el mismo orden que la aprobacion. Si el N2 no
    // puede firmar todavia, tampoco puede devolver el comprobante por delante
    // del N1, que es quien aun no lo ha visto.
    it('el N2 tampoco rechaza antes de que el N1 actue', async () => {
      const expense = baseExpense()
      mockLoadExpense(expense)
      mockUpdate({ ...expense, status: 'rejected' })

      await expect(
        service.rejectByCoord(expenseId, actorN2, 'Falta sustento suficiente')
      ).rejects.toThrow()
      expect(mockExpenseModel.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('el N2 rechaza cuando ya le toca', async () => {
      const expense = baseExpense()
      expense.approverChain[0].approved = true
      mockLoadExpense(expense)
      mockUpdate({ ...expense, status: 'rejected' })

      await service.rejectByCoord(expenseId, actorN2, 'Falta sustento suficiente')

      const [, updatePayload] = mockExpenseModel.findByIdAndUpdate.mock.calls[0]
      expect(updatePayload.$set.status).toBe('rejected')
    })

    it('rechaza a quien no es aprobador de ningún paso pendiente', async () => {
      const expense = baseExpense()
      mockLoadExpense(expense)
      const stranger = { userId: new Types.ObjectId().toString(), roleName: ROLES.COLABORADOR, clientId }

      await expect(service.rejectByCoord(expenseId, stranger, 'motivo cualquiera')).rejects.toThrow(ForbiddenException)
    })

    /**
     * Regresión: observar un comprobante con la rendición ya en Contabilidad lo
     * dejaba en tierra de nadie. Al corregirlo se reinicia su cadena y entonces
     * no puede aprobarlo ni un aprobador (la rendición salió de `submitted`) ni
     * Contabilidad (exige la cadena completa).
     */
    it('no deja observar cuando la rendición ya pasó a Contabilidad', async () => {
      const expense = baseExpense({ expenseReportId: new Types.ObjectId().toHexString() })
      mockLoadExpense(expense)
      ;(service as unknown as { expenseReportService: { findOne: jest.Mock } }).expenseReportService = {
        findOne: jest.fn().mockResolvedValue({ status: 'pending_accounting' }),
      }

      await expect(
        service.rejectByCoord(expenseId, actorN2, 'Falta sustento suficiente')
      ).rejects.toThrow(BadRequestException)
      expect(mockExpenseModel.findByIdAndUpdate).not.toHaveBeenCalled()
    })
  })
})

describe('ExpenseService — assertCanMutateExpense (VD-69: N1/N2 no editan ni eliminan)', () => {
  let service: ExpenseService
  let mockExpenseModel: {
    findOne: jest.Mock
    findByIdAndUpdate: jest.Mock
    findOneAndDelete: jest.Mock
  }

  const clientId = new Types.ObjectId().toHexString()
  const expenseId = new Types.ObjectId().toHexString()
  const ownerId = new Types.ObjectId().toHexString()
  const approverId = new Types.ObjectId().toHexString()

  /** Comprobante sin rendición asociada: aísla la validación de propiedad. */
  function loneExpense(overrides: Record<string, unknown> = {}) {
    const expense = {
      _id: expenseId,
      clientId,
      createdBy: ownerId,
      status: 'pending',
      ...overrides,
    }
    mockExpenseModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(expense),
    })
    return expense
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    mockExpenseModel = {
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOneAndDelete: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('sk-test') } },
        { provide: getModelToken(Expense.name), useValue: mockExpenseModel },
        // Empresa sin topes configurados: `findById` resuelve a null.
        {
          provide: getModelToken(Client.name),
          useValue: { findById: () => ({ lean: () => ({ exec: async () => null }) }) },
        },
        { provide: EmailService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        // Sin suplencias vigentes: estas pruebas son del motor de cadena puro
        // (VD-124 no cambia nada cuando nadie está de vacaciones).
        {
          provide: UserService,
          useValue: { idsTitularesCubiertosPara: jest.fn().mockResolvedValue([]) },
        },
        { provide: SunatConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ExpenseReportService, useValue: {} },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
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

    service = module.get<ExpenseService>(ExpenseService)
  })

  it('un Coordinador (perfil del aprobador N1/N2) NO puede eliminar un comprobante ajeno', async () => {
    loneExpense()
    const approver = { userId: approverId, roleName: ROLES.COORDINADOR, clientId }

    await expect(service.remove(expenseId, approver)).rejects.toThrow(ForbiddenException)
    expect(mockExpenseModel.findOneAndDelete).not.toHaveBeenCalled()
  })

  it('un Coordinador NO puede editar un comprobante ajeno', async () => {
    loneExpense()
    const approver = { userId: approverId, roleName: ROLES.COORDINADOR, clientId }

    await expect(
      service.update(expenseId, {} as never, approver)
    ).rejects.toThrow(ForbiddenException)
  })

  it('el creador sí puede eliminar su propio comprobante', async () => {
    loneExpense()
    const owner = { userId: ownerId, roleName: ROLES.COORDINADOR, clientId }

    await service.remove(expenseId, owner)
    expect(mockExpenseModel.findOneAndDelete).toHaveBeenCalled()
  })

  it('Contabilidad ya NO puede eliminar un comprobante ajeno (VD-69)', async () => {
    loneExpense()
    const conta = { userId: approverId, roleName: ROLES.CONTABILIDAD, clientId }

    await expect(service.remove(expenseId, conta)).rejects.toThrow(
      ForbiddenException
    )
    expect(mockExpenseModel.findOneAndDelete).not.toHaveBeenCalled()
  })

  it('Contabilidad ya NO puede editar un comprobante ajeno (VD-69)', async () => {
    loneExpense()
    const conta = { userId: approverId, roleName: ROLES.CONTABILIDAD, clientId }

    await expect(
      service.update(expenseId, {} as never, conta)
    ).rejects.toThrow(ForbiddenException)
  })

  it('un rol de sistema (Admin) conserva la escotilla sobre comprobantes ajenos', async () => {
    loneExpense()
    const admin = { userId: approverId, roleName: ROLES.ADMIN, clientId }

    await service.remove(expenseId, admin)
    expect(mockExpenseModel.findOneAndDelete).toHaveBeenCalled()
  })
})

describe('ExpenseService — resolveMovilidadCategoryId (VD-89: planilla en directa)', () => {
  let service: ExpenseService
  const clientId = new Types.ObjectId().toHexString()
  const userId = new Types.ObjectId().toHexString()

  const movA = { _id: new Types.ObjectId(), name: 'Planilla de movilidad' }
  const movB = { _id: new Types.ObjectId(), name: 'Planilla de movilidad COM' }
  const otra = { _id: new Types.ObjectId(), name: 'Capacitación' }

  const categoryService = { findAllFlat: jest.fn() }
  const userService = { findOne: jest.fn() }

  async function build(): Promise<ExpenseService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test') },
        },
        { provide: getModelToken(Expense.name), useValue: {} },
        // Empresa sin topes configurados: `findById` resuelve a null.
        {
          provide: getModelToken(Client.name),
          useValue: { findById: () => ({ lean: () => ({ exec: async () => null }) }) },
        },
        { provide: EmailService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        { provide: UserService, useValue: userService },
        { provide: SunatConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ExpenseReportService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: CategoryService, useValue: categoryService },
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
    return module.get<ExpenseService>(ExpenseService)
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    service = await build()
  })

  const resolve = (uid?: string) =>
    (service as any).resolveMovilidadCategoryId(uid, clientId) as Promise<string>

  it('devuelve la única categoría de movilidad asignada al colaborador', async () => {
    categoryService.findAllFlat.mockResolvedValue([movA, movB, otra])
    userService.findOne.mockResolvedValue({
      permissions: { categoryIds: [String(movB._id)] },
    })
    await expect(resolve(userId)).resolves.toBe(String(movB._id))
  })

  it('cae a la única del cliente cuando el colaborador no tiene categorías asignadas', async () => {
    categoryService.findAllFlat.mockResolvedValue([movA, otra])
    userService.findOne.mockResolvedValue({ permissions: { categoryIds: [] } })
    await expect(resolve(userId)).resolves.toBe(String(movA._id))
  })

  it('devuelve vacío si hay varias de movilidad y el colaborador no las restringe (ambiguo)', async () => {
    categoryService.findAllFlat.mockResolvedValue([movA, movB, otra])
    userService.findOne.mockResolvedValue({ permissions: { categoryIds: [] } })
    await expect(resolve(userId)).resolves.toBe('')
  })

  it('devuelve vacío si el cliente no tiene categorías de movilidad', async () => {
    categoryService.findAllFlat.mockResolvedValue([otra])
    userService.findOne.mockResolvedValue({ permissions: { categoryIds: [] } })
    await expect(resolve(userId)).resolves.toBe('')
  })
})

describe('ExpenseService — createDeclaracionJurada (DJE: un gasto por rubro)', () => {
  let service: ExpenseService
  const clientId = new Types.ObjectId().toHexString()
  const userId = new Types.ObjectId().toHexString()
  const proyectId = new Types.ObjectId().toHexString()
  const catAlimentacion = new Types.ObjectId().toHexString()
  const catMovilidad = new Types.ObjectId().toHexString()

  const expenseModel = {
    create: jest.fn(),
  }
  const userService = {
    findTransactionalProfile: jest.fn(),
    findEmailNameClient: jest.fn(),
  }
  const expenseReportService = {
    assertReportNotLockedByCajaChica: jest.fn(),
    assertPuedeCargarEnCajaChica: jest.fn().mockResolvedValue(undefined),
    resolveCentroCostoCajaChica: jest.fn().mockResolvedValue(undefined),
    // Estas pruebas son de rendiciones normales: el centro de costo sigue
    // siendo obligatorio y no se pide firma.
    isReportCajaChica: jest.fn().mockResolvedValue(false),
    buildChainForNewExpense: jest.fn(),
    addExpenseToReport: jest.fn(),
    // Bimoneda: la DJE consulta la moneda de la rendición para calcular el
    // equivalente en ella. Sin rendición asociada devuelve null.
    findCurrencyMeta: jest.fn().mockResolvedValue(null),
  }
  const categoryService = { findOne: jest.fn() }

  async function build(): Promise<ExpenseService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test') },
        },
        { provide: getModelToken(Expense.name), useValue: expenseModel },
        // Empresa sin topes configurados: `findById` resuelve a null.
        {
          provide: getModelToken(Client.name),
          useValue: { findById: () => ({ lean: () => ({ exec: async () => null }) }) },
        },
        { provide: EmailService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        { provide: UserService, useValue: userService },
        { provide: SunatConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ExpenseReportService, useValue: expenseReportService },
        { provide: NotificationsService, useValue: {} },
        { provide: CategoryService, useValue: categoryService },
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
    return module.get<ExpenseService>(ExpenseService)
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    service = await build()
    userService.findTransactionalProfile.mockResolvedValue({
      signature: 'data:image/png;base64,firma',
    })
    userService.findEmailNameClient.mockResolvedValue({
      name: 'John Doe',
      email: 'john@acme.com',
      clientId,
    })
    expenseModel.create.mockImplementation((doc: any) =>
      Promise.resolve({ ...doc, _id: new Types.ObjectId() })
    )
  })

  const baseBody = () => ({
    clientId,
    userId,
    proyectId,
    moneda: 'US$',
    destino: 'Quito',
    pais: 'Ecuador',
    lugarFirma: 'Lima',
    alimentacion: {
      categoryId: catAlimentacion,
      rows: [
        { fecha: '2026-07-10', monto: 40 },
        { fecha: '2026-07-11', monto: 35.5 },
      ],
    },
    movilidad: {
      categoryId: catMovilidad,
      rows: [{ fecha: '2026-07-11', monto: 20 }],
    },
  })

  it('crea un gasto por rubro con el total del rubro y el mismo groupId', async () => {
    const res = await service.createDeclaracionJurada(baseBody() as any)

    expect(res.expenses).toHaveLength(2)
    expect(expenseModel.create).toHaveBeenCalledTimes(2)
    const [alimentacion, movilidad] = expenseModel.create.mock.calls.map(c => c[0])
    expect(alimentacion.total).toBeCloseTo(75.5)
    expect(movilidad.total).toBeCloseTo(20)
    expect(String(alimentacion.categoryId)).toBe(catAlimentacion)
    expect(String(movilidad.categoryId)).toBe(catMovilidad)
    expect(alimentacion.declaracionJuradaGroupId).toBe(res.groupId)
    expect(movilidad.declaracionJuradaGroupId).toBe(res.groupId)
    expect(alimentacion.subTipo).toBe('DJE')
    expect(alimentacion.declaracionJurada).toBe(true)
    expect(alimentacion.declaracionJuradaFirmante).toBe('John Doe')
    // Se guarda normalizada a ISO ('US$' → 'USD') para que coincida con el
    // campo `moneda` del gasto y con el resto del modelo bimoneda.
    expect(alimentacion.declaracionJuradaMoneda).toBe('USD')
    expect(alimentacion.declaracionJuradaDestino).toBe('Quito')
    expect(alimentacion.declaracionJuradaRows).toHaveLength(2)
  })

  // La DJ se fecha con el ÚLTIMO día declarado del rubro: `fechaEmision` es lo
  // que alimenta el cálculo de plazo (`observado` / `diasRetraso`), y fecharla
  // en el primer día del viaje marcaría como atrasada una DJ presentada a
  // tiempo al cierre del viaje.
  it('fecha del gasto = último día declarado del rubro', async () => {
    const body = baseBody()
    body.alimentacion.rows = [
      { fecha: '2026-07-15', monto: 10 },
      { fecha: '2026-07-09', monto: 10 },
    ]
    await service.createDeclaracionJurada(body as any)
    const alimentacion = expenseModel.create.mock.calls[0][0]
    expect(alimentacion.fechaEmision).toBe('15/07/2026')
  })

  it('omite el rubro sin filas', async () => {
    const body: any = baseBody()
    delete body.movilidad
    const res = await service.createDeclaracionJurada(body)
    expect(res.expenses).toHaveLength(1)
    expect(expenseModel.create).toHaveBeenCalledTimes(1)
  })

  it('rechaza la declaración sin ningún rubro con filas', async () => {
    const body: any = baseBody()
    delete body.alimentacion
    delete body.movilidad
    await expect(service.createDeclaracionJurada(body)).rejects.toThrow(
      'Debes ingresar al menos un gasto de Alimentación o Movilidad'
    )
    expect(expenseModel.create).not.toHaveBeenCalled()
  })

  it('rechaza filas con monto 0 o sin fecha (no hay ValidationPipe global)', async () => {
    const sinMonto: any = baseBody()
    sinMonto.alimentacion.rows = [{ fecha: '2026-07-10', monto: 0 }]
    await expect(service.createDeclaracionJurada(sinMonto)).rejects.toThrow(
      /monto mayor a 0/
    )

    const sinFecha: any = baseBody()
    sinFecha.alimentacion.rows = [{ fecha: '  ', monto: 20 }]
    await expect(service.createDeclaracionJurada(sinFecha)).rejects.toThrow(
      /requiere una fecha/
    )

    expect(expenseModel.create).not.toHaveBeenCalled()
  })

  it('rechaza un rubro con filas pero sin categoría válida', async () => {
    const body: any = baseBody()
    body.movilidad.categoryId = ''
    await expect(service.createDeclaracionJurada(body)).rejects.toThrow(
      /Falta la categoría de Movilidad/
    )
    expect(expenseModel.create).not.toHaveBeenCalled()
  })

  it('exige firma digital registrada', async () => {
    userService.findTransactionalProfile.mockResolvedValue({ signature: '' })
    await expect(
      service.createDeclaracionJurada(baseBody() as any)
    ).rejects.toThrow(/firma digital/i)
    expect(expenseModel.create).not.toHaveBeenCalled()
  })

  it('arma la cadena de aprobación y suma el gasto a la rendición', async () => {
    const expenseReportId = new Types.ObjectId().toHexString()
    await service.createDeclaracionJurada({
      ...baseBody(),
      expenseReportId,
    } as any)
    expect(expenseReportService.buildChainForNewExpense).toHaveBeenCalledTimes(2)
    expect(expenseReportService.addExpenseToReport).toHaveBeenCalledTimes(2)
    expect(expenseReportService.addExpenseToReport).toHaveBeenCalledWith(
      expenseReportId,
      expect.any(String)
    )
  })

  it('el sub-tipo DJE ya no pasa por createOtherExpense', async () => {
    await expect(
      service.createOtherExpense({
        clientId,
        userId,
        proyectId,
        categoryId: catAlimentacion,
        total: 100,
        subTipo: 'DJE',
        declaracionJurada: true,
        imageUrl: 'https://s3/doc.pdf',
      } as CreateExpenseDto)
    ).rejects.toThrow(/declaracion-jurada/)
  })
})

describe('ExpenseService — createMobilitySheet (OT del formato ADF-FOR-005)', () => {
  let service: ExpenseService
  const clientId = new Types.ObjectId().toHexString()
  const userId = new Types.ObjectId().toHexString()
  const proyectId = new Types.ObjectId().toHexString()
  const categoryId = new Types.ObjectId().toHexString()
  const expenseReportId = new Types.ObjectId().toHexString()

  const expenseModel = {
    create: jest.fn(),
    countDocuments: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
  }
  const userService = { findOne: jest.fn().mockResolvedValue({ name: 'John Doe' }) }
  const expenseReportService = {
    assertReportNotLockedByCajaChica: jest.fn(),
    assertPuedeCargarEnCajaChica: jest.fn().mockResolvedValue(undefined),
    resolveCentroCostoCajaChica: jest.fn().mockResolvedValue(undefined),
    // Estas pruebas son de rendiciones normales: el centro de costo sigue
    // siendo obligatorio y no se pide firma.
    isReportCajaChica: jest.fn().mockResolvedValue(false),
    isReportSinOrdenTrabajo: jest.fn().mockResolvedValue(false),
    findCurrencyMeta: jest.fn().mockResolvedValue(null),
    findOne: jest.fn().mockResolvedValue({ userId }),
    buildChainForNewExpense: jest.fn(),
    addExpenseToReport: jest.fn(),
  }
  const categoryService = {
    findOne: jest.fn().mockResolvedValue({
      _id: new Types.ObjectId(categoryId),
      name: 'Planilla de movilidad',
    }),
  }
  const clientModel = {
    findById: jest.fn().mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    }),
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    expenseModel.countDocuments.mockResolvedValue(0)
    expenseModel.aggregate.mockResolvedValue([])
    expenseModel.create.mockImplementation((doc: any) =>
      Promise.resolve({ ...doc, _id: new Types.ObjectId() })
    )
    expenseReportService.isReportSinOrdenTrabajo.mockResolvedValue(false)
    clientModel.findById.mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    })
    categoryService.findOne.mockResolvedValue({
      _id: new Types.ObjectId(categoryId),
      name: 'Planilla de movilidad',
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test') },
        },
        { provide: getModelToken(Expense.name), useValue: expenseModel },
        { provide: getModelToken(Client.name), useValue: clientModel },
        { provide: EmailService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        { provide: UserService, useValue: userService },
        { provide: SunatConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ExpenseReportService, useValue: expenseReportService },
        { provide: NotificationsService, useValue: {} },
        { provide: CategoryService, useValue: categoryService },
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
    service = module.get<ExpenseService>(ExpenseService)
  })

  const baseBody = () =>
    ({
      clientId,
      userId,
      proyectId,
      categoryId,
      expenseReportId,
      mobilityRows: [
        { fecha: '2026-07-10', total: 20, origen: 'A', destino: 'B', gestion: 'g' },
      ],
    }) as unknown as CreateExpenseDto

  it('exige la OT cuando la rendición sí puede aportarla', async () => {
    await expect(service.createMobilitySheet(baseBody())).rejects.toThrow(
      'Se requiere seleccionar la Orden de Trabajo (OT)'
    )
    expect(expenseModel.create).not.toHaveBeenCalled()
  })

  // La OT es opcional al solicitar el viático y al crear la rendición directa, y
  // la planilla la hereda de la rendición: si la rendición no la lleva, no hay
  // ninguna que exigir ni que el colaborador pueda elegir.
  it('acepta la planilla sin OT cuando la rendición no la tiene', async () => {
    expenseReportService.isReportSinOrdenTrabajo.mockResolvedValue(true)

    await service.createMobilitySheet(baseBody())

    expect(expenseModel.create).toHaveBeenCalledTimes(1)
    // Sin castear a ObjectId: `new Types.ObjectId(undefined)` inventaría un id.
    expect(expenseModel.create.mock.calls[0][0].ordenTrabajoId).toBeUndefined()
  })

  it('guarda la OT cuando llega en el cuerpo', async () => {
    const ordenTrabajoId = new Types.ObjectId().toHexString()

    await service.createMobilitySheet({
      ...baseBody(),
      ordenTrabajoId,
    } as CreateExpenseDto)

    expect(String(expenseModel.create.mock.calls[0][0].ordenTrabajoId)).toBe(
      ordenTrabajoId
    )
    // No se consulta la rendición: con OT en el cuerpo no hace falta la excepción.
    expect(expenseReportService.isReportSinOrdenTrabajo).not.toHaveBeenCalled()
  })
})

describe('ExpenseService — AL: comida y tope por gasto (VD-109)', () => {
  let service: ExpenseService
  const clientId = new Types.ObjectId().toHexString()
  const userId = new Types.ObjectId().toHexString()
  const proyectId = new Types.ObjectId().toHexString()
  const categoryId = new Types.ObjectId().toHexString()

  const expenseModel = { create: jest.fn(), aggregate: jest.fn().mockResolvedValue([]) }
  const userService = {
    findTransactionalProfile: jest.fn(),
    findEmailNameClient: jest.fn(),
  }
  const expenseReportService = {
    assertReportNotLockedByCajaChica: jest.fn(),
    assertPuedeCargarEnCajaChica: jest.fn().mockResolvedValue(undefined),
    resolveCentroCostoCajaChica: jest.fn().mockResolvedValue(undefined),
    // Estas pruebas son de rendiciones normales: el centro de costo sigue
    // siendo obligatorio y no se pide firma.
    isReportCajaChica: jest.fn().mockResolvedValue(false),
    buildChainForNewExpense: jest.fn(),
    addExpenseToReport: jest.fn(),
    findCurrencyMeta: jest.fn().mockResolvedValue(null),
  }
  const clientModel = { findById: jest.fn() }

  /** Topes que devuelve la empresa consultada. */
  function conLimites(limits: Record<string, number> | null) {
    clientModel.findById.mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(limits ? { limits } : null) }),
    })
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    conLimites({ alimentacionAlmuerzo: 30, alimentacionDesayuno: 15 })
    expenseModel.create.mockImplementation((doc: any) =>
      Promise.resolve({ ...doc, _id: new Types.ObjectId() })
    )
    userService.findTransactionalProfile.mockResolvedValue({
      signature: 'data:image/png;base64,firma',
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test') },
        },
        { provide: getModelToken(Expense.name), useValue: expenseModel },
        { provide: getModelToken(Client.name), useValue: clientModel },
        { provide: EmailService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        { provide: UserService, useValue: userService },
        { provide: SunatConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ExpenseReportService, useValue: expenseReportService },
        { provide: NotificationsService, useValue: {} },
        { provide: CategoryService, useValue: { findOne: jest.fn() } },
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
    service = module.get<ExpenseService>(ExpenseService)
  })

  const alBody = (extra: Record<string, unknown> = {}) =>
    ({
      clientId,
      userId,
      proyectId,
      categoryId,
      total: 25,
      subTipo: 'AL',
      declaracionJurada: true,
      declaracionJuradaFirmante: 'John Doe',
      tipoComida: 'almuerzo',
      ...extra,
    }) as unknown as CreateExpenseDto

  it('exige declarar la comida', async () => {
    await expect(
      service.createOtherExpense(alBody({ tipoComida: undefined }))
    ).rejects.toThrow(/desayuno, almuerzo o cena/)
    expect(expenseModel.create).not.toHaveBeenCalled()
  })

  it('rechaza el gasto que supera el tope de esa comida', async () => {
    await expect(
      service.createOtherExpense(alBody({ total: 45 }))
    ).rejects.toThrow(/supera el tope de S\/ 30\.00/)
    expect(expenseModel.create).not.toHaveBeenCalled()
  })

  it('acepta el gasto que llega justo al tope y guarda la comida como descripción', async () => {
    await service.createOtherExpense(alBody({ total: 30 }))

    const doc = expenseModel.create.mock.calls[0][0]
    expect(doc.tipoComida).toBe('almuerzo')
    expect(doc.description).toBe('Almuerzo')
    expect(JSON.parse(doc.data).tipoComida).toBe('almuerzo')
  })

  it('sin tope configurado para esa comida no valida el monto', async () => {
    await service.createOtherExpense(alBody({ tipoComida: 'cena', total: 500 }))

    expect(expenseModel.create).toHaveBeenCalledTimes(1)
    expect(expenseModel.create.mock.calls[0][0].description).toBe('Cena')
  })

  it('la empresa sin límites configurados no bloquea', async () => {
    conLimites(null)

    await service.createOtherExpense(alBody({ total: 999 }))

    expect(expenseModel.create).toHaveBeenCalledTimes(1)
  })

  it('los demás sub-tipos no piden comida ni tocan la descripción', async () => {
    await service.createOtherExpense(
      alBody({
        subTipo: 'TK',
        tipoComida: undefined,
        declaracionJurada: false,
        rucEmisor: '20123456789',
        imageUrl: 'https://s3/doc.pdf',
        data: 'Peaje de ida',
      })
    )

    const doc = expenseModel.create.mock.calls[0][0]
    expect(doc.tipoComida).toBeUndefined()
    expect(doc.description).toBe('Peaje de ida')
  })

  // Tope de ALERTA por comprobante: único para la empresa, sin distinguir
  // categoría, y a diferencia de los topes de comida NUNCA bloquea.
  describe('tope de alerta por comprobante', () => {
    const tkBody = (total: number) =>
      ({
        clientId,
        userId,
        proyectId,
        categoryId,
        total,
        subTipo: 'TK',
        declaracionJurada: false,
        rucEmisor: '20123456789',
        imageUrl: 'https://s3/doc.pdf',
        data: 'Peaje',
      }) as unknown as CreateExpenseDto

    it('marca el gasto que supera el tope pero lo registra igual', async () => {
      conLimites({ topeComprobante: 400 })

      await service.createOtherExpense(tkBody(520))

      const doc = expenseModel.create.mock.calls[0][0]
      expect(doc.superaTopeComprobante).toBe(true)
      expect(doc.topeComprobante).toBe(400)
    })

    it('no marca el gasto que llega justo al tope', async () => {
      conLimites({ topeComprobante: 400 })

      await service.createOtherExpense(tkBody(400))

      const doc = expenseModel.create.mock.calls[0][0]
      expect(doc.superaTopeComprobante).toBe(false)
      expect(doc.topeComprobante).toBe(400)
    })

    it('sin tope configurado no marca nada', async () => {
      conLimites({ alimentacionAlmuerzo: 30 })

      await service.createOtherExpense(tkBody(9999))

      const doc = expenseModel.create.mock.calls[0][0]
      expect(doc.superaTopeComprobante).toBeUndefined()
      expect(doc.topeComprobante).toBeUndefined()
    })
  })

  // En caja chica el centro de costo es opcional y la firma obligatoria; en el
  // resto de rendiciones sigue siendo al revés.
  describe('comprobante de caja chica', () => {
    const cajaChicaBody = (extra: Record<string, unknown> = {}) =>
      ({
        clientId,
        userId,
        categoryId,
        total: 100,
        subTipo: 'TK',
        declaracionJurada: false,
        rucEmisor: '20123456789',
        imageUrl: 'https://s3/doc.pdf',
        data: 'Peaje',
        expenseReportId: new Types.ObjectId().toHexString(),
        ...extra,
      }) as unknown as CreateExpenseDto

    it('sin centro de costo lo imputa al del responsable (el de su solicitud)', async () => {
      expenseReportService.isReportCajaChica.mockResolvedValue(true)
      const ccDelResponsable = new Types.ObjectId()
      expenseReportService.resolveCentroCostoCajaChica.mockResolvedValue(ccDelResponsable)

      await service.createOtherExpense(
        cajaChicaBody({ firmaUrl: 'https://s3/firma.png' })
      )

      const doc = expenseModel.create.mock.calls[0][0]
      expect(String(doc.proyectId)).toBe(String(ccDelResponsable))
      expect(doc.firmaUrl).toBe('https://s3/firma.png')
    })

    it('si no hay de donde sacar el centro de costo, el alta no se rompe', async () => {
      expenseReportService.isReportCajaChica.mockResolvedValue(true)
      expenseReportService.resolveCentroCostoCajaChica.mockResolvedValue(undefined)

      await service.createOtherExpense(
        cajaChicaBody({ firmaUrl: 'https://s3/firma.png' })
      )

      expect(expenseModel.create.mock.calls[0][0].proyectId).toBeUndefined()
    })

    it('guarda el centro de costo cuando el responsable sí lo indica', async () => {
      expenseReportService.isReportCajaChica.mockResolvedValue(true)

      await service.createOtherExpense(
        cajaChicaBody({ proyectId, firmaUrl: 'https://s3/firma.png' })
      )

      expect(expenseModel.create.mock.calls[0][0].proyectId.toString()).toBe(
        proyectId
      )
    })

    it('rechaza el comprobante sin firma', async () => {
      expenseReportService.isReportCajaChica.mockResolvedValue(true)

      await expect(service.createOtherExpense(cajaChicaBody())).rejects.toThrow(
        /firma del comprobante/i
      )
      expect(expenseModel.create).not.toHaveBeenCalled()
    })

    it('fuera de caja chica el centro de costo sigue siendo obligatorio', async () => {
      expenseReportService.isReportCajaChica.mockResolvedValue(false)

      await expect(service.createOtherExpense(cajaChicaBody())).rejects.toThrow(
        /centro de costo es requerido/i
      )
      expect(expenseModel.create).not.toHaveBeenCalled()
    })
  })
})

/**
 * Al editar un gasto, `total` siempre se recalculó bien; lo que se quedaba con
 * el importe viejo eran `montoBase` y `montoReporte`, que es lo que de verdad
 * leen la ficha de la rendición, el PDF y la liquidación (`montoReporte ?? total`).
 * De ahí el síntoma: agregar tramos a una planilla ya guardada no movía el monto.
 *
 * El tipo de cambio NO se re-congela: se reusa el que el gasto ya tenía.
 */
describe('ExpenseService — update: las equivalencias siguen al nuevo importe', () => {
  let service: ExpenseService
  const clientId = new Types.ObjectId().toHexString()
  const expenseId = new Types.ObjectId().toHexString()
  const actor = {
    userId: new Types.ObjectId().toHexString(),
    roleName: ROLES.ADMIN,
    clientId,
  }

  const expenseModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    aggregate: jest.fn().mockResolvedValue([]),
  }
  const clientModel = {
    findById: jest.fn().mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve(null) }),
    }),
  }
  const expenseReportService = {
    findOne: jest.fn().mockResolvedValue(null),
    resubmitSilent: jest.fn(),
    advanceToAccountingIfAllExpensesApproved: jest.fn(),
  }

  /** El gasto tal como está guardado antes de la edición. */
  const guardado = (extra: Record<string, unknown>) => ({
    _id: new Types.ObjectId(expenseId),
    clientId,
    createdBy: actor.userId,
    status: 'pending',
    expenseType: 'planilla_movilidad',
    ...extra,
  })

  /** Ejecuta la edición y devuelve el documento que se mandó a Mongo. */
  const editar = async (
    existente: Record<string, unknown>,
    dto: Record<string, unknown>
  ) => {
    expenseModel.findOne.mockReturnValue({
      populate: () => ({
        populate: () => ({
          populate: () => ({ exec: () => Promise.resolve(existente) }),
        }),
      }),
    })
    await service.update(expenseId, dto as never, actor)
    return expenseModel.findOneAndUpdate.mock.calls[0][1]
  }

  const tramo = (fecha: string, total: number) => ({
    fecha,
    total,
    origen: 'A',
    destino: 'B',
    gestion: 'g',
  })

  beforeEach(async () => {
    jest.clearAllMocks()
    expenseModel.findOneAndUpdate.mockReturnValue({
      populate: () => ({
        populate: () => ({ exec: () => Promise.resolve({ _id: expenseId }) }),
      }),
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test') },
        },
        { provide: getModelToken(Expense.name), useValue: expenseModel },
        { provide: getModelToken(Client.name), useValue: clientModel },
        { provide: EmailService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        { provide: UserService, useValue: {} },
        { provide: SunatConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ExpenseReportService, useValue: expenseReportService },
        { provide: NotificationsService, useValue: {} },
        { provide: CategoryService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            resolveRate: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile()
    service = module.get<ExpenseService>(ExpenseService)
  })

  it('agregar tramos a una planilla ya guardada mueve el monto que se muestra', async () => {
    const doc = await editar(
      guardado({
        total: 55,
        moneda: 'PEN',
        montoBase: 55,
        tipoCambio: 1,
        monedaReporte: 'PEN',
        tcReporte: 1,
        montoReporte: 55,
        mobilityRows: [tramo('2026-08-10', 25), tramo('2026-08-11', 30)],
      }),
      {
        mobilityRows: [
          tramo('2026-08-10', 25),
          tramo('2026-08-11', 30),
          tramo('2026-08-12', 145),
        ],
      }
    )

    expect(doc.total).toBe(200)
    expect(doc.montoBase).toBe(200)
    expect(doc.montoReporte).toBe(200)
  })

  // Corregir un comprobante de una rendición devuelta NO la reenvía: antes
  // `update` llamaba a `resubmitSilent` y la rendición volvía sola con los
  // aprobadores, sin dejar al colaborador subir el resto de sus facturas ni
  // pulsar "Reenviar". El stub sigue en el mock a propósito: si alguien vuelve
  // a cablear el reenvío automático, esta prueba lo caza.
  it('corregir un gasto no reenvía la rendición por su cuenta', async () => {
    expenseReportService.findOne.mockResolvedValue({ status: 'rejected' })

    await editar(
      guardado({ total: 55, moneda: 'PEN', mobilityRows: [tramo('2026-08-10', 55)] }),
      { mobilityRows: [tramo('2026-08-10', 60)] }
    )

    expect(expenseReportService.resubmitSilent).not.toHaveBeenCalled()
  })

  it('un gasto en la moneda de la rendición no se convierte al reexpresarlo', async () => {
    // Dólares dentro de una rendición en dólares: `montoReporte` son los mismos
    // dólares. Dividir por `tcReporte` metería soles en la ficha del viático.
    const doc = await editar(
      guardado({
        total: 13,
        moneda: 'USD',
        montoBase: 43.55,
        tipoCambio: 3.35,
        monedaReporte: 'USD',
        tcReporte: 1,
        montoReporte: 13,
        expenseType: 'factura',
      }),
      { total: 52 }
    )

    expect(doc.montoBase).toBe(174.2)
    expect(doc.montoReporte).toBe(52)
  })

  it('un gasto en otra moneda que la rendición se reexpresa con el TC congelado', async () => {
    const doc = await editar(
      guardado({
        total: 55,
        moneda: 'PEN',
        montoBase: 55,
        tipoCambio: 1,
        monedaReporte: 'USD',
        tcReporte: 3.35,
        montoReporte: 16.42,
        expenseType: 'factura',
      }),
      { total: 200 }
    )

    expect(doc.montoBase).toBe(200)
    expect(doc.montoReporte).toBe(59.7)
    // La tasa congelada no se toca: es lo que hace auditable el importe.
    expect(doc.tipoCambio).toBeUndefined()
    expect(doc.tcReporte).toBeUndefined()
  })

  it('sin equivalencia previa no se inventa una', async () => {
    // Gasto suelto, fuera de una rendición: no tiene `montoReporte` que seguir.
    const doc = await editar(
      guardado({ total: 55, moneda: 'PEN', montoBase: 55, tipoCambio: 1, expenseType: 'factura' }),
      { total: 200 }
    )

    expect(doc.montoBase).toBe(200)
    expect(doc.montoReporte).toBeUndefined()
  })
})
