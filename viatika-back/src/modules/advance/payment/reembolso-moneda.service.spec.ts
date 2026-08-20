import { Test } from '@nestjs/testing'
import { PaymentBatchService } from './payment-batch.service'
import { AdvanceService } from '../advance.service'
import { ExpenseReportService } from '../../expense-report/expense-report.service'
import { ClientService } from '../../client/client.service'
import { AccountingConfigService } from '../../accounting-config/accounting-config.service'

/**
 * `settlement.difference` se guarda SIEMPRE en moneda base: la liquidación
 * suma el `montoBase` de cada gasto para no mezclar monedas. Pero la planilla
 * del banco se emite por moneda, y el reembolso entra en la de su rendición.
 * Sin deshacer la conversión, una rendición directa en dólares saldría a pagar
 * la cifra en soles dentro del archivo en dólares.
 */
describe('PaymentBatchService — moneda del reembolso', () => {
  let service: PaymentBatchService
  let expenseReportService: any

  const CCI_SOLES = '00219110035563002151' // interbancaria (BCP)
  const CCI_DOLARES = '00110057000267030775' // empieza 0011 -> cuenta BBVA

  const usuario = {
    _id: 'u1',
    name: 'AGREDA FLORES ANDRES',
    dni: '06973600',
    documentType: 'L',
    email: 'a@x.pe',
    bankAccount: { bankName: 'BCP', cci: CCI_SOLES },
    bankAccountUsd: { bankName: 'BBVA', cci: CCI_DOLARES },
  }

  beforeEach(async () => {
    expenseReportService = {
      findBatchPayableViaticos: jest.fn().mockResolvedValue([]),
      findPendingReimbursementsByClient: jest.fn().mockResolvedValue([]),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentBatchService,
        {
          provide: AdvanceService,
          useValue: { findBatchPayableAdvances: jest.fn().mockResolvedValue([]) },
        },
        { provide: ExpenseReportService, useValue: expenseReportService },
        {
          provide: AccountingConfigService,
          useValue: { getEffective: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }) },
        },
        { provide: ClientService, useValue: { findOne: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile()
    service = moduleRef.get(PaymentBatchService)
  })

  const reembolso = (extra: Record<string, unknown>) => ({
    _id: 'r1',
    userId: usuario,
    settlement: { type: 'reembolso', difference: -1350 },
    ...extra,
  })

  it('convierte el reembolso de una rendición en dólares a su moneda', async () => {
    expenseReportService.findPendingReimbursementsByClient.mockResolvedValue([
      reembolso({ viaticoMoneda: 'USD', tipoCambio: 3.375 }),
    ])

    const { payable } = await service.collectPendingPayments('c1')

    expect(payable).toHaveLength(1)
    // 1350 soles / 3.375 = 400 dólares. Sin la conversión se pagaban 1350 USD.
    expect(payable[0].amount).toBe(400)
    expect(payable[0].moneda).toBe('USD')
  })

  it('paga con la cuenta en dólares del colaborador', async () => {
    expenseReportService.findPendingReimbursementsByClient.mockResolvedValue([
      reembolso({ viaticoMoneda: 'USD', tipoCambio: 3.375 }),
    ])

    const { payable } = await service.collectPendingPayments('c1')

    expect(payable[0].account20).toBe(CCI_DOLARES)
    expect(payable[0].bankName).toBe('BBVA')
  })

  it('deja intacto el reembolso en soles', async () => {
    expenseReportService.findPendingReimbursementsByClient.mockResolvedValue([
      reembolso({ viaticoMoneda: 'PEN', tipoCambio: 1 }),
    ])

    const { payable } = await service.collectPendingPayments('c1')

    expect(payable[0].amount).toBe(1350)
    expect(payable[0].account20).toBe(CCI_SOLES)
  })

  it('trata como soles la rendición vieja que no declara moneda', async () => {
    // Retrocompatibilidad: todo lo anterior al multimoneda era en soles.
    expenseReportService.findPendingReimbursementsByClient.mockResolvedValue([
      reembolso({}),
    ])

    const { payable } = await service.collectPendingPayments('c1')

    expect(payable[0].amount).toBe(1350)
  })

  it('descarta el reembolso en dólares sin TC congelado en vez de inventar una cifra', async () => {
    expenseReportService.findPendingReimbursementsByClient.mockResolvedValue([
      reembolso({ viaticoMoneda: 'USD', tipoCambio: 0 }),
    ])

    const { payable, excluded } = await service.collectPendingPayments('c1')

    expect(payable).toHaveLength(0)
    expect(excluded).toHaveLength(0)
  })
})
