import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { ConfigService } from '@nestjs/config'
import { HttpService } from '@nestjs/axios'
import { HttpException } from '@nestjs/common'
import { ExpenseService } from './expense.service'
import { Expense } from './entities/expense.entity'
import { Client } from '../client/entities/client.entity'
import { EmailService } from '../email/email.service'
import { ProjectService } from '../project/project.service'
import { UserService } from '../user/user.service'
import { SunatConfigService } from '../sunat-config/sunat-config.service'
import { UploadService } from '../upload/upload.service'
import { ExpenseReportService } from '../expense-report/expense-report.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CategoryService } from '../category/category.service'
import { CurrencyService } from '../exchange-rate/currency.service'
import { CreateDeclaracionJuradaDto } from './dto/create-declaracion-jurada.dto'

/**
 * DJ al exterior: los importes se declaran en moneda extranjera y se guardan
 * en esa moneda (`total`), con la conversión a moneda base congelada aparte
 * (`montoBase` + `tipoCambio`). De esa conversión dependen liquidación,
 * tesorería, dashboard y asientos.
 */
describe('ExpenseService.createDeclaracionJurada', () => {
  let service: ExpenseService
  let created: any[]
  let resolveRate: jest.Mock

  const CLIENT_ID = '6a5a9ef217875703af86a045'
  const PROYECT_ID = '6a5a9ef217875703af86a046'
  const CAT_ALIMENTACION = '6a5a9ef217875703af86a047'
  const CAT_MOVILIDAD = '6a5a9ef217875703af86a048'
  const USER_ID = '6a5aace0c7ff0a6f1093adcf'

  function payload(
    overrides: Partial<CreateDeclaracionJuradaDto> = {}
  ): CreateDeclaracionJuradaDto {
    return {
      proyectId: PROYECT_ID,
      clientId: CLIENT_ID,
      userId: USER_ID,
      moneda: 'US$',
      destino: 'Santiago',
      pais: 'Chile',
      alimentacion: {
        categoryId: CAT_ALIMENTACION,
        rows: [
          { fecha: '2026-07-01', monto: 100 },
          { fecha: '2026-07-02', monto: 50 },
        ],
      },
      ...overrides,
    }
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    created = []
    // El servicio real devuelve 1 cuando la moneda es la base.
    resolveRate = jest
      .fn()
      .mockImplementation(async (moneda: string) => (moneda === 'PEN' ? 1 : 3.7))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test') },
        },
        {
          provide: getModelToken(Expense.name),
          useValue: {
            create: jest.fn().mockImplementation(async (doc: any) => {
              const saved = { ...doc, _id: `exp-${created.length + 1}` }
              created.push(saved)
              return saved
            }),
          },
        },
        // Empresa sin topes configurados: `findById` resuelve a null.
        {
          provide: getModelToken(Client.name),
          useValue: { findById: () => ({ lean: () => ({ exec: async () => null }) }) },
        },
        { provide: EmailService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        {
          provide: UserService,
          useValue: {
            findTransactionalProfile: jest
              .fn()
              .mockResolvedValue({ signature: 'https://s3/firma.png' }),
            findEmailNameClient: jest
              .fn()
              .mockResolvedValue({ name: 'Iván Torres', email: 'i@t.com' }),
          },
        },
        { provide: SunatConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        {
          provide: ExpenseReportService,
          useValue: {
            assertReportNotLockedByCajaChica: jest.fn().mockResolvedValue(undefined),
            assertPuedeCargarEnCajaChica: jest.fn().mockResolvedValue(undefined),
            resolveCentroCostoCajaChica: jest.fn().mockResolvedValue(undefined),
            buildChainForNewExpense: jest.fn().mockResolvedValue(undefined),
            addExpenseToReport: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: CategoryService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            resolveRate,
          },
        },
      ],
    }).compile()

    service = module.get<ExpenseService>(ExpenseService)
  })

  it('guarda el total en la moneda declarada y la conversión aparte', async () => {
    resolveRate.mockImplementation(async (_moneda: string, fecha: string) =>
      fecha === '2026-07-01' ? 3.7 : 3.8
    )

    const res = await service.createDeclaracionJurada(payload())

    // 100 USD * 3.70 + 50 USD * 3.80 = 370 + 190 = 560 soles
    expect(created).toHaveLength(1)
    expect(created[0].moneda).toBe('USD')
    expect(created[0].total).toBe(150)
    expect(created[0].montoBase).toBe(560)
    expect(created[0].tcFecha).toBe('2026-07-02')
    expect(res.expenses).toHaveLength(1)
  })

  it('pide la tasa de cada fila, no una sola para toda la declaración', async () => {
    await service.createDeclaracionJurada(payload())

    expect(resolveRate).toHaveBeenCalledTimes(2)
    expect(resolveRate).toHaveBeenCalledWith('USD', '2026-07-01', expect.anything())
    expect(resolveRate).toHaveBeenCalledWith('USD', '2026-07-02', expect.anything())
  })

  it('deja una tasa efectiva coherente entre el total y su conversión', async () => {
    resolveRate.mockImplementation(async (_moneda: string, fecha: string) =>
      fecha === '2026-07-01' ? 3.7 : 3.8
    )

    await service.createDeclaracionJurada(payload())

    const { total, montoBase, tipoCambio } = created[0]
    // Es el fxFactor que aplica el motor de asientos: original * tasa = base.
    expect(Number((total * tipoCambio).toFixed(2))).toBe(montoBase)
  })

  it('normaliza el símbolo del formulario (US$) al código ISO USD', async () => {
    await service.createDeclaracionJurada(payload({ moneda: 'US$' }))
    expect(created[0].moneda).toBe('USD')
  })

  it('deja la conversión en 1 a 1 cuando se declara en la moneda base', async () => {
    await service.createDeclaracionJurada(payload({ moneda: 'PEN' }))

    expect(created[0].moneda).toBe('PEN')
    expect(created[0].total).toBe(150)
    expect(created[0].montoBase).toBe(150)
    expect(created[0].tipoCambio).toBe(1)
  })

  it('crea un gasto por rubro y los une con el mismo grupo', async () => {
    const res = await service.createDeclaracionJurada(
      payload({
        movilidad: {
          categoryId: CAT_MOVILIDAD,
          rows: [{ fecha: '2026-07-01', monto: 20 }],
        },
      })
    )

    expect(created).toHaveLength(2)
    expect(created[0].declaracionJuradaGroupId).toBe(res.groupId)
    expect(created[1].declaracionJuradaGroupId).toBe(res.groupId)
    expect(created[0].categoryId.toString()).toBe(CAT_ALIMENTACION)
    expect(created[1].categoryId.toString()).toBe(CAT_MOVILIDAD)
    expect(created[1].total).toBe(20) // declarados
    expect(created[1].montoBase).toBe(74) // 20 USD * 3.70
  })

  it('aborta sin guardar nada si no se puede obtener el tipo de cambio', async () => {
    resolveRate.mockResolvedValue(null)

    await expect(service.createDeclaracionJurada(payload())).rejects.toThrow(
      HttpException
    )
    expect(created).toHaveLength(0)
  })

  it('exige firma digital antes de aceptar la declaración', async () => {
    const module = service as any
    module.userService.findTransactionalProfile = jest
      .fn()
      .mockResolvedValue({ signature: undefined })

    await expect(service.createDeclaracionJurada(payload())).rejects.toThrow(
      /firma digital/i
    )
    expect(created).toHaveLength(0)
  })

  it('rechaza una declaración sin ninguna fila', async () => {
    await expect(
      service.createDeclaracionJurada(
        payload({ alimentacion: undefined, movilidad: undefined })
      )
    ).rejects.toThrow(/al menos un gasto/i)
  })

  it('rechaza montos en cero o negativos', async () => {
    await expect(
      service.createDeclaracionJurada(
        payload({
          alimentacion: {
            categoryId: CAT_ALIMENTACION,
            rows: [{ fecha: '2026-07-01', monto: 0 }],
          },
        })
      )
    ).rejects.toThrow(/mayor a 0/i)
  })

  it('marca el gasto como declaración jurada firmada por el colaborador', async () => {
    await service.createDeclaracionJurada(payload())

    expect(created[0].declaracionJurada).toBe(true)
    expect(created[0].declaracionJuradaFirmante).toBe('Iván Torres')
    expect(created[0].subTipo).toBe('DJE')
    expect(created[0].expenseType).toBe('otros_gastos')
  })

  it('conserva el detalle por fila para poder auditar la conversión', async () => {
    resolveRate.mockImplementation(async (_moneda: string, fecha: string) =>
      fecha === '2026-07-01' ? 3.7 : 3.8
    )

    await service.createDeclaracionJurada(payload())

    const data = JSON.parse(created[0].data)
    expect(data.rows).toEqual([
      { fecha: '2026-07-01', monto: 100, tipoCambio: 3.7, montoBase: 370 },
      { fecha: '2026-07-02', monto: 50, tipoCambio: 3.8, montoBase: 190 },
    ])
    expect(data.destino).toBe('Santiago')
    expect(data.pais).toBe('Chile')
  })
})

/**
 * Conversión congelada de un gasto cualquiera (no solo la DJ). Es lo que
 * permite que un viático en dólares totalice boletas emitidas en soles.
 */
describe('ExpenseService.freezeExpenseCurrency', () => {
  let service: ExpenseService
  let findCurrencyMeta: jest.Mock

  const CLIENT_ID = '6a5a9ef217875703af86a045'

  async function build() {
    findCurrencyMeta = jest.fn().mockResolvedValue(null)
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('sk-test') } },
        { provide: getModelToken(Expense.name), useValue: {} },
        // Empresa sin topes configurados: `findById` resuelve a null.
        {
          provide: getModelToken(Client.name),
          useValue: { findById: () => ({ lean: () => ({ exec: async () => null }) }) },
        },
        { provide: EmailService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        { provide: UserService, useValue: {} },
        { provide: SunatConfigService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: ExpenseReportService, useValue: { findCurrencyMeta } },
        { provide: NotificationsService, useValue: {} },
        { provide: CategoryService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
            toBase: jest.fn().mockImplementation(async (monto: number, moneda: string) => {
              const tipoCambio = moneda === 'USD' ? 3.7 : 1
              return {
                montoBase: Math.round(monto * tipoCambio * 100) / 100,
                tipoCambio,
                tcFecha: '2026-07-02',
              }
            }),
          },
        },
      ],
    }).compile()
    return module.get<ExpenseService>(ExpenseService)
  }

  const freeze = (svc: ExpenseService, opts: any) =>
    (svc as any).freezeExpenseCurrency(opts)

  beforeEach(async () => {
    jest.clearAllMocks()
    service = await build()
  })

  it('asume la moneda base cuando el comprobante no declara una', async () => {
    const fx = await freeze(service, { clientId: CLIENT_ID, total: 100 })

    expect(fx.moneda).toBe('PEN')
    expect(fx.montoBase).toBe(100)
    expect(fx.tipoCambio).toBe(1)
  })

  it('congela la conversión de un comprobante en dólares', async () => {
    const fx = await freeze(service, {
      clientId: CLIENT_ID,
      total: 100,
      moneda: 'USD',
      fecha: '2026-07-02',
    })

    expect(fx.moneda).toBe('USD')
    expect(fx.montoBase).toBe(370)
    expect(fx.tcFecha).toBe('2026-07-02')
  })

  it('sin rendición no calcula equivalencia de reporte', async () => {
    const fx = await freeze(service, { clientId: CLIENT_ID, total: 100, moneda: 'USD' })

    expect(findCurrencyMeta).not.toHaveBeenCalled()
    expect(fx.montoReporte).toBeUndefined()
  })

  it('una boleta en soles dentro de un viático en dólares se expresa en dólares', async () => {
    findCurrencyMeta.mockResolvedValue({ moneda: 'USD', tipoCambio: 3.7 })

    const fx = await freeze(service, {
      clientId: CLIENT_ID,
      total: 370,
      moneda: 'PEN',
      expenseReportId: 'rep1',
    })

    // Se guarda en su moneda de emisión y se convierte solo para el reporte.
    expect(fx.moneda).toBe('PEN')
    expect(fx.total).toBeUndefined()
    expect(fx.montoBase).toBe(370)
    expect(fx.monedaReporte).toBe('USD')
    expect(fx.montoReporte).toBe(100)
  })

  it('un gasto en la misma moneda del viático no se convierte', async () => {
    findCurrencyMeta.mockResolvedValue({ moneda: 'USD', tipoCambio: 3.7 })

    const fx = await freeze(service, {
      clientId: CLIENT_ID,
      total: 50,
      moneda: 'USD',
      expenseReportId: 'rep1',
    })

    expect(fx.tcReporte).toBe(1)
    expect(fx.montoReporte).toBe(50)
  })

  it('no inventa una equivalencia 1 a 1 si el viático no tiene TC congelado', async () => {
    findCurrencyMeta.mockResolvedValue({ moneda: 'USD', tipoCambio: undefined })

    const fx = await freeze(service, {
      clientId: CLIENT_ID,
      total: 370,
      moneda: 'PEN',
      expenseReportId: 'rep1',
    })

    // Caer a 1 trataría 370 soles como 370 dólares dentro del total.
    expect(fx.monedaReporte).toBe('USD')
    expect(fx.montoReporte).toBeUndefined()
    expect(fx.tcReporte).toBeUndefined()
  })

  it('usa el TC congelado del viático, no el del día del gasto', async () => {
    // El viático se creó con 3.50; hoy la tasa es 3.70.
    findCurrencyMeta.mockResolvedValue({ moneda: 'USD', tipoCambio: 3.5 })

    const fx = await freeze(service, {
      clientId: CLIENT_ID,
      total: 350,
      moneda: 'PEN',
      expenseReportId: 'rep1',
    })

    expect(fx.tcReporte).toBe(3.5)
    expect(fx.montoReporte).toBe(100)
  })
})
