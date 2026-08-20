import { Test } from '@nestjs/testing'
import { PaymentBatchService } from './payment-batch.service'
import { AdvanceService } from '../advance.service'
import { ExpenseReportService } from '../../expense-report/expense-report.service'
import { ClientService } from '../../client/client.service'
import { AccountingConfigService } from '../../accounting-config/accounting-config.service'

/**
 * Una planilla del banco es de UNA sola moneda, y el motor de conciliación
 * descarta los pendientes de otra. La simulación no declaraba ninguna, así que
 * emitía siempre un lote en soles: con pagos en dólares no cruzaba ninguno y
 * Tesorería veía cinco "sin conciliar" sin ninguna pista del motivo.
 */
describe('PaymentBatchService.simulateReconcile — moneda del lote', () => {
  let service: PaymentBatchService
  let expenseReportService: any

  const CCI = '00219110035563002151'
  const CCI_USD = '00110057000267030775'
  /** Con las DOS cuentas: sin la de dólares el pago en USD queda excluido. */
  const usuario = (dni: string) => ({
    _id: 'u' + dni, name: 'IVAN TORRES', dni, documentType: 'L', email: 'a@x.pe',
    bankAccount: { bankName: 'BCP', cci: CCI },
    bankAccountUsd: { bankName: 'BBVA', cci: CCI_USD },
  })

  /** Reembolsos pendientes: uno en soles y dos en dólares. */
  const pendientes = [
    { _id: 'r1', userId: usuario('06973600'), settlement: { type: 'reembolso', difference: -50 }, viaticoMoneda: 'PEN' },
    { _id: 'r2', userId: usuario('06973601'), settlement: { type: 'reembolso', difference: -337.30 }, viaticoMoneda: 'USD', tipoCambio: 3.373 },
    { _id: 'r3', userId: usuario('06973602'), settlement: { type: 'reembolso', difference: -674.60 }, viaticoMoneda: 'USD', tipoCambio: 3.373 },
  ]

  beforeEach(async () => {
    expenseReportService = {
      findBatchPayableViaticos: jest.fn().mockResolvedValue([]),
      findPendingReimbursementsByClient: jest.fn().mockResolvedValue(pendientes),
      registerReimbursementPayment: jest.fn().mockResolvedValue({}),
    }
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentBatchService,
        { provide: AdvanceService, useValue: { findBatchPayableAdvances: jest.fn().mockResolvedValue([]), registerPayment: jest.fn() } },
        { provide: ExpenseReportService, useValue: expenseReportService },
        { provide: AccountingConfigService, useValue: { getEffective: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }) } },
        { provide: ClientService, useValue: { findOne: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile()
    service = moduleRef.get(PaymentBatchService)
  })

  const actor = { role: 'Tesoreria' } as any

  it('simula solo los pagos de la moneda pedida', async () => {
    const r = await service.simulateReconcile('c1', actor, 'USD')
    expect(r.moneda).toBe('USD')
    expect(r.conciliados).toHaveLength(2)
    expect(r.sinConciliar).toHaveLength(0)
    // 337.30 soles / 3.373 = 100 dólares.
    expect(r.conciliados.map(c => c.amount).sort((a, b) => a - b)).toEqual([100, 200])
  })

  it('sin moneda usa la base, no la de los pendientes', async () => {
    const r = await service.simulateReconcile('c1', actor)
    expect(r.moneda).toBe('PEN')
    expect(r.conciliados).toHaveLength(1)
    expect(r.conciliados[0].amount).toBe(50)
  })

  it('no arrastra pagos de otra moneda al lote', async () => {
    // Antes cruzaba los tres contra un lote en soles y no conciliaba ninguno.
    const r = await service.simulateReconcile('c1', actor, 'USD')
    expect(r.conciliados.some(c => c.amount === 50)).toBe(false)
    expect(r.conciliados).toHaveLength(2)
  })

  it('explica qué hacer cuando no hay pendientes en esa moneda', async () => {
    expenseReportService.findPendingReimbursementsByClient.mockResolvedValue([pendientes[1]])
    await expect(service.simulateReconcile('c1', actor, 'PEN')).rejects.toThrow(
      /No hay pagos pendientes en PEN.*Sí los hay en USD/
    )
  })

  it('mantiene el mensaje de siempre cuando no hay ningún pendiente', async () => {
    expenseReportService.findPendingReimbursementsByClient.mockResolvedValue([])
    await expect(service.simulateReconcile('c1', actor)).rejects.toThrow(
      'No hay pagos pendientes con datos bancarios completos para simular.'
    )
  })
})
