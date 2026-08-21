import { Test } from '@nestjs/testing'
import { PaymentBatchService } from './payment-batch.service'
import { AdvanceService } from '../advance.service'
import { ExpenseReportService } from '../../expense-report/expense-report.service'
import { ClientService } from '../../client/client.service'
import { AccountingConfigService } from '../../accounting-config/accounting-config.service'

/**
 * El archivo BBVA declara UNA moneda y UNA cuenta de cargo, así que con pagos
 * en soles y en dólares hacen falta dos planillas. Antes se emitía la de la
 * moneda base y el resto quedaba anunciado en un aviso del resumen, con un
 * segundo botón: quien no leía ese aviso dejaba a esa gente sin cobrar, y el
 * archivo generado no tenía nada de malo a la vista.
 */
describe('PaymentBatchService.generateAllTxt', () => {
  let service: PaymentBatchService
  let expenseReportService: any
  let accountingConfigService: any

  const CCI = '00219110035563002151'
  const CCI_USD = '00110057000267030775'
  /** Con las DOS cuentas: sin la de dólares el pago en USD queda excluido. */
  const usuario = (dni: string) => ({
    _id: 'u' + dni, name: 'IVAN TORRES', dni, documentType: 'L', email: 'a@x.pe',
    bankAccount: { bankName: 'BCP', cci: CCI },
    bankAccountUsd: { bankName: 'BBVA', cci: CCI_USD },
  })
  const enSoles = { _id: 'r1', userId: usuario('06973600'), settlement: { type: 'reembolso', difference: -45 }, viaticoMoneda: 'PEN' }
  const enDolares = { _id: 'r2', userId: usuario('06973601'), settlement: { type: 'reembolso', difference: -716.46 }, viaticoMoneda: 'USD', tipoCambio: 3.373 }

  const CUENTAS = [
    { banco: 'BBVA', nroCuenta: '00110332020028910011', cuentaContable: '10.4.1.100', moneda: 'PEN', activo: true, esCuentaPagos: true },
    { banco: 'BBVA', nroCuenta: '00110332020028920022', cuentaContable: '10.4.1.200', moneda: 'USD', activo: true, esCuentaPagos: true },
  ]

  const montar = async (pendientes: any[], bankAccounts = CUENTAS) => {
    expenseReportService = {
      findBatchPayableViaticos: jest.fn().mockResolvedValue([]),
      findPendingReimbursementsByClient: jest.fn().mockResolvedValue(pendientes),
    }
    accountingConfigService = {
      getEffective: jest.fn().mockResolvedValue({ monedaBase: 'PEN', bankAccounts }),
    }
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentBatchService,
        { provide: AdvanceService, useValue: { findBatchPayableAdvances: jest.fn().mockResolvedValue([]) } },
        { provide: ExpenseReportService, useValue: expenseReportService },
        { provide: AccountingConfigService, useValue: accountingConfigService },
        { provide: ClientService, useValue: { findOne: jest.fn().mockResolvedValue({ comercialName: 'DETROIT' }) } },
      ],
    }).compile()
    service = moduleRef.get(PaymentBatchService)
  }

  it('emite una planilla por moneda en una sola acción', async () => {
    await montar([enSoles, enDolares])
    const r = await service.generateAllTxt('c1')
    expect(r.archivos.map(a => a.moneda)).toEqual(['PEN', 'USD'])
    expect(r.archivos.every(a => a.count === 1)).toBe(true)
    expect(r.fallidos).toHaveLength(0)
  })

  it('cada archivo carga contra la cuenta de la empresa en SU moneda', async () => {
    await montar([enSoles, enDolares])
    const r = await service.generateAllTxt('c1')
    const cargoDe = (a: any) =>
      Buffer.from(a.fileBase64, 'base64').toString('latin1').slice(2, 23).replace(/^0+(?=\d{20})/, '')
    expect(cargoDe(r.archivos[0])).toBe('00110332020028910011')
    expect(cargoDe(r.archivos[1])).toBe('00110332020028920022')
  })

  it('paga cada uno en su moneda, sin convertir', async () => {
    await montar([enSoles, enDolares])
    const r = await service.generateAllTxt('c1')
    expect(r.archivos[0].totalSoles).toBe(45)
    // 716.46 soles / 3.373 = 212.41 dólares.
    expect(r.archivos[1].totalSoles).toBe(212.41)
  })

  /**
   * VD-125 / VD-131. La descripción de la cabecera (pos 52-75) es la referencia
   * que Tesorería ve en BBVA Net Cash, y estaba fija en `PROVEEDORES SOL`: la
   * planilla de dólares salía rotulada como si fuera de soles.
   */
  it('rotula cada planilla con la abreviatura de SU moneda', async () => {
    await montar([enSoles, enDolares])
    const r = await service.generateAllTxt('c1')
    const referenciaDe = (a: any) =>
      Buffer.from(a.fileBase64, 'base64').toString('latin1').slice(51, 75).trim()
    expect(referenciaDe(r.archivos[0])).toMatch(/^PROVEEDORES SOL /)
    expect(referenciaDe(r.archivos[1])).toMatch(/^PROVEEDORES DOL /)
  })

  it('deja la moneda base primero', async () => {
    await montar([enDolares, enSoles])
    const r = await service.generateAllTxt('c1')
    expect(r.archivos[0].moneda).toBe('PEN')
  })

  it('no marca como excluido lo que sí sale en el otro archivo', async () => {
    // Cada planilla excluye la otra moneda porque su formato no la admite;
    // emitiéndolas juntas, ese pago sí se paga y no debe salir en rojo.
    await montar([enSoles, enDolares])
    const r = await service.generateAllTxt('c1')
    expect(r.archivos.flatMap(a => a.excluded)).toHaveLength(0)
  })

  it('una moneda sin cuenta de cargo no tumba a las demás', async () => {
    await montar([enSoles, enDolares], [CUENTAS[0]])
    const r = await service.generateAllTxt('c1')
    expect(r.archivos.map(a => a.moneda)).toEqual(['PEN'])
    expect(r.fallidos).toHaveLength(1)
    expect(r.fallidos[0].moneda).toBe('USD')
    expect(r.fallidos[0].count).toBe(1)
    expect(r.fallidos[0].motivo).toContain('cuenta de cargo en USD')
  })

  it('avisa antes de generar si al colaborador le falta la cuenta en dólares', async () => {
    // Sin esto, `resolveUserBankAccount` caía a la cuenta en soles y ese abono
    // entraba al archivo como válido: el banco lo rechazaba días después, que
    // es el peor momento para enterarse. Se corta acá, con el motivo escrito.
    const sinCuentaUsd = {
      ...enDolares,
      userId: {
        _id: 'u2', name: 'IVAN TORRES', dni: '06973601', documentType: 'L', email: 'a@x.pe',
        bankAccount: { bankName: 'BCP', cci: CCI },
      },
    }
    await montar([enSoles, sinCuentaUsd])
    const r = await service.generateAllTxt('c1')

    // La planilla de soles sale igual; la de dólares no tiene a quién pagar.
    expect(r.archivos.find(a => a.moneda === 'PEN')?.count).toBe(1)
    const excluidos = r.archivos.flatMap(a => a.excluded)
    expect(excluidos).toHaveLength(1)
    expect(excluidos[0].moneda).toBe('USD')
    expect(excluidos[0].reason).toContain('no tiene cuenta en dólares registrada')
    expect(excluidos[0].reason).toContain('el banco rechazaría el abono')
  })

  it('no cuestiona la cuenta que se escribió en la propia solicitud', async () => {
    // En un viático la cuenta puede venir de la solicitud (`viaticoCci`), no
    // del perfil: la eligió quien pidió el dinero, así que no se compara
    // contra un perfil que puede no tener nada cargado.
    await montar([])
    expenseReportService.findBatchPayableViaticos.mockResolvedValue([
      {
        reportId: 'v1',
        user: { _id: 'u3', name: 'IVAN TORRES', dni: '06973602', documentType: 'L', email: 'a@x.pe' },
        remaining: 100,
        moneda: 'USD',
        bankName: 'BBVA',
        cci: '00110057000267030775',
        accountNumber: '',
      },
    ])
    const r = await service.generateAllTxt('c1')
    expect(r.archivos.flatMap(a => a.excluded)).toHaveLength(0)
    expect(r.archivos.find(a => a.moneda === 'USD')?.count).toBe(1)
  })

  it('con una sola moneda se comporta como siempre', async () => {
    await montar([enSoles])
    const r = await service.generateAllTxt('c1')
    expect(r.archivos).toHaveLength(1)
    expect(r.archivos[0].moneda).toBe('PEN')
  })
})
