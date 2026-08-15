import { Test } from '@nestjs/testing'
import { PaymentBatchService } from './payment-batch.service'
import { AdvanceService } from '../advance.service'
import { ExpenseReportService } from '../../expense-report/expense-report.service'
import { ClientService } from '../../client/client.service'
import { toLatin1Buffer } from './bbva-format'
import { AccountingConfigService } from '../../accounting-config/accounting-config.service'

const CCI_BBVA = '00110057000267030775' // empieza 0011 → cuenta P
const CCI_OTRO = '00219110035563002151' // interbancaria → I

describe('PaymentBatchService', () => {
  let service: PaymentBatchService
  let advanceService: any
  let expenseReportService: any
  let clientService: any
  let accountingConfigService: any

  beforeEach(async () => {
    advanceService = {
      findBatchPayableAdvances: jest.fn().mockResolvedValue([]),
      registerPayment: jest.fn().mockResolvedValue({}),
    }
    expenseReportService = {
      findBatchPayableViaticos: jest.fn().mockResolvedValue([]),
      findPendingReimbursementsByClient: jest.fn().mockResolvedValue([]),
      registerViaticoPayment: jest.fn().mockResolvedValue({}),
      registerReimbursementPayment: jest.fn().mockResolvedValue({}),
    }
    clientService = {
      findOne: jest
        .fn()
        .mockResolvedValue({ comercialName: 'DETROIT', paymentAccount: '000110380350100056833' }),
    }

    accountingConfigService = {
      getEffective: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentBatchService,
        { provide: AdvanceService, useValue: advanceService },
        { provide: ExpenseReportService, useValue: expenseReportService },
        {
          provide: AccountingConfigService,
          useValue: accountingConfigService,
        },
        { provide: ClientService, useValue: clientService },
      ],
    }).compile()
    service = moduleRef.get(PaymentBatchService)
  })

  describe('collectPendingPayments', () => {
    it('mezcla las 3 superficies y deriva tipo de cuenta I/P', async () => {
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        {
          advanceId: 'a1',
          user: { name: 'RAUL CUBA', dni: '75162447', documentType: 'L', email: 'r@x.pe' },
          remaining: 304,
          cci: CCI_OTRO,
          bankName: 'BCP',
        },
      ])
      expenseReportService.findBatchPayableViaticos.mockResolvedValue([
        {
          reportId: 'v1',
          user: { name: 'ASTRID PENA', dni: '09831083', documentType: 'L', email: 'a@x.pe' },
          remaining: 249.8,
          cci: CCI_BBVA,
          bankName: 'BBVA',
        },
      ])
      expenseReportService.findPendingReimbursementsByClient.mockResolvedValue([
        {
          _id: 'r1',
          settlement: { difference: -171 },
          userId: {
            name: 'FIDEL TUESTA',
            dni: '06973600',
            documentType: 'L',
            email: 'f@x.pe',
            bankAccount: { cci: CCI_OTRO, bankName: 'BCP' },
          },
        },
      ])

      const { payable, excluded } = await service.collectPendingPayments('c1')
      expect(excluded).toHaveLength(0)
      expect(payable).toHaveLength(3)
      const advance = payable.find(p => p.kind === 'advance')!
      const viatico = payable.find(p => p.kind === 'viatico')!
      const reembolso = payable.find(p => p.kind === 'reembolso')!
      expect(advance.accountType).toBe('I')
      expect(viatico.accountType).toBe('P') // CCI empieza 0011
      expect(reembolso.amount).toBe(171)
      expect(reembolso.concepto).toBe('REEMBOLSO')
    })

    it('excluye beneficiarios sin DNI o con CCI inválido', async () => {
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        { advanceId: 'a1', user: { name: 'SIN DNI', email: 'x@x.pe' }, remaining: 100, cci: CCI_OTRO },
        { advanceId: 'a2', user: { name: 'MAL CCI', dni: '123', email: 'y@x.pe' }, remaining: 50, cci: '123' },
      ])
      const { payable, excluded } = await service.collectPendingPayments('c1')
      expect(payable).toHaveLength(0)
      expect(excluded).toHaveLength(2)
      expect(excluded[0].reason).toMatch(/DNI/)
      expect(excluded[1].reason).toMatch(/CCI/)
    })

    it('excluye al beneficiario sin correo en vez de mandarlo con el campo en blanco', async () => {
      // El archivo rechazado por BBVA el 13-ago traía 3 registros sin el flag E
      // ni correo, por usuarios sin correo registrado.
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        { advanceId: 'a1', user: { name: 'SIN CORREO', dni: '75005529', documentType: 'L' }, remaining: 238.5, cci: CCI_OTRO },
        { advanceId: 'a2', user: { name: 'CORREO VACIO', dni: '75650854', documentType: 'L', email: '   ' }, remaining: 206.25, cci: CCI_OTRO },
      ])
      const { payable, excluded } = await service.collectPendingPayments('c1')
      expect(payable).toHaveLength(0)
      expect(excluded).toHaveLength(2)
      expect(excluded[0].reason).toMatch(/correo/i)
      expect(excluded[1].reason).toMatch(/correo/i)
    })
  })

  describe('generateTxt', () => {
    it('genera el archivo Latin-1 base64 con cabecera y detalle', async () => {
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        {
          advanceId: 'a1',
          user: { name: 'RAUL CUBA CRUZ', dni: '75162447', documentType: 'L', email: 'NOTIFICACIONESDEPAGO@DETROIT.PE' },
          remaining: 304,
          cci: '00257011449545903106',
          bankName: 'IBK',
        },
      ])
      const res = await service.generateTxt('c1')
      expect(res.count).toBe(1)
      expect(res.totalSoles).toBe(304)
      const decoded = toLatin1Buffer(
        Buffer.from(res.fileBase64, 'base64').toString('latin1')
      ).toString('latin1')
      const lines = decoded.split('\r\n').filter(Boolean)
      expect(lines[0].startsWith('75')).toBe(true) // cabecera
      expect(lines[0].length).toBe(151)
      expect(lines[1].startsWith('002')).toBe(true) // detalle
      expect(lines[1].length).toBe(277)
    })

    it('falla si la empresa no tiene cuenta de cargo', async () => {
      clientService.findOne.mockResolvedValue({ comercialName: 'X', paymentAccount: '' })
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        { advanceId: 'a1', user: { name: 'X', dni: '75162447', documentType: 'L', email: 'x@x.pe' }, remaining: 10, cci: CCI_OTRO },
      ])
      await expect(service.generateTxt('c1')).rejects.toThrow(/cuenta de cargo/)
    })

    it('falla si la cuenta de cargo no tiene 20 dígitos (evita el rechazo del banco)', async () => {
      // Una cuenta corta la rellenaría padLeftZeros en silencio y el banco
      // responde "Cuenta de cargo no existe para este servicio" (fila 1, col 4).
      clientService.findOne.mockResolvedValue({ comercialName: 'X', paymentAccount: '0100056833' })
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        { advanceId: 'a1', user: { name: 'X', dni: '75162447', documentType: 'L', email: 'x@x.pe' }, remaining: 10, cci: CCI_OTRO },
      ])
      await expect(service.generateTxt('c1')).rejects.toThrow(/20 dígitos/)
    })

    it('acepta la cuenta de cargo con 20 dígitos y con 21 (ya rellenada)', async () => {
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        { advanceId: 'a1', user: { name: 'X', dni: '75162447', documentType: 'L', email: 'x@x.pe' }, remaining: 10, cci: CCI_OTRO },
      ])
      for (const cuenta of ['00110380350100056833', '000110380350100056833', '0011-0380-35-0100056833']) {
        clientService.findOne.mockResolvedValue({ comercialName: 'X', paymentAccount: cuenta })
        const res = await service.generateTxt('c1')
        const cabecera = Buffer.from(res.fileBase64, 'base64').toString('latin1').split('\r\n')[0]
        expect(cabecera.slice(3, 23)).toBe('00110380350100056833') // pos 4-23
        expect(cabecera.slice(23, 26)).toBe('PEN') // pos 24-26
      }
    })

    it('falla si no hay pagos pagables', async () => {
      await expect(service.generateTxt('c1')).rejects.toThrow(/No hay pagos/)
    })
  })

  describe('generateTxt · planilla por moneda', () => {
    // Antes, `generateTxt` fijaba la moneda base: un pago en dólares salía
    // excluido con "genera una planilla aparte para USD" y no existía forma de
    // pedirla, así que nunca se podía pagar.
    const PAGO_PEN = {
      advanceId: 'pen1',
      user: { name: 'RAUL CUBA CRUZ', dni: '75162447', documentType: 'L', email: 'r@x.pe' },
      remaining: 304,
      cci: CCI_OTRO,
      moneda: 'PEN',
    }
    const PAGO_USD = {
      advanceId: 'usd1',
      user: { name: 'ASTRID PENA', dni: '09831083', documentType: 'L', email: 'a@x.pe' },
      remaining: 150,
      cci: CCI_OTRO,
      moneda: 'USD',
    }

    beforeEach(() => {
      accountingConfigService.getEffective.mockResolvedValue({
        monedaBase: 'PEN',
        bankAccounts: [
          { nroCuenta: '00110380350100056833', moneda: 'PEN', activo: true },
          { nroCuenta: '00110380350100099999', moneda: 'USD', activo: true },
        ],
      })
      advanceService.findBatchPayableAdvances.mockResolvedValue([PAGO_PEN, PAGO_USD])
    })

    it('sin moneda emite la base y deja el resto como pendiente de su planilla', async () => {
      const res = await service.generateTxt('c1')
      expect(res.moneda).toBe('PEN')
      expect(res.fileName).toBe('BBVAREND.txt')
      expect(res.count).toBe(1)
      expect(res.totalSoles).toBe(304)
      expect(res.excluded.some(e => /USD/.test(e.reason))).toBe(true)
      // Ahora informa que quedan pagos en otra moneda, para poder pedirla.
      expect(res.monedasPendientes).toEqual([
        { moneda: 'PEN', count: 1, total: 304 },
        { moneda: 'USD', count: 1, total: 150 },
      ])
    })

    it('con moneda USD emite la planilla en dólares contra la cuenta en dólares', async () => {
      const res = await service.generateTxt('c1', 'USD')
      expect(res.moneda).toBe('USD')
      expect(res.fileName).toBe('BBVAREND-USD.txt') // no pisa la de soles al descargar
      expect(res.count).toBe(1)
      expect(res.totalSoles).toBe(150)

      const cabecera = Buffer.from(res.fileBase64, 'base64').toString('latin1').split('\r\n')[0]
      expect(cabecera.slice(23, 26)).toBe('USD') // divisa, pos 24-26
      expect(cabecera.slice(3, 23)).toBe('00110380350100099999') // cuenta en USD, pos 4-23
      // El pago en soles queda fuera de la planilla en dólares.
      expect(res.excluded.some(e => /PEN/.test(e.reason))).toBe(true)
    })

    it('falla si no hay cuenta de cargo en esa moneda', async () => {
      accountingConfigService.getEffective.mockResolvedValue({
        monedaBase: 'PEN',
        bankAccounts: [{ nroCuenta: '00110380350100056833', moneda: 'PEN', activo: true }],
      })
      await expect(service.generateTxt('c1', 'USD')).rejects.toThrow(/cuenta de cargo en USD/)
    })
  })

  describe('reconcileFromPdf', () => {
    it('concilia por DNI+monto+nombre y marca pagado en la superficie correcta', async () => {
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        {
          advanceId: 'a1',
          user: { name: 'RAUL CUBA CRUZ', dni: '75162447', documentType: 'L', email: 'r@x.pe' },
          remaining: 304,
          cci: CCI_OTRO,
        },
      ])
      const pdfText = [
        'No. Movimiento de Cargo 000025041 Fecha y Hora de Ejecución 02/06/2026 10:15',
        'RAUL CUBA CRUZ L - 75162447 304.00 ABONO ENVIADO',
      ].join('\n')
      jest.spyOn(service as any, 'extractPdfText').mockResolvedValue(pdfText)

      const res = await service.reconcileFromPdf('c1', Buffer.from('x'), {
        role: 'TESORERIA',
      })
      expect(res.operationNumber).toBe('000025041')
      expect(res.conciliados).toHaveLength(1)
      expect(res.conciliados[0].kind).toBe('advance')
      expect(advanceService.registerPayment).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ operationNumber: '000025041', method: 'transferencia_bancaria' }),
        'TESORERIA',
        undefined,
        { bypassReceipt: true }
      )
    })

    it('no marca pagado un abono rechazado y lista los no conciliados', async () => {
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        {
          advanceId: 'a1',
          user: { name: 'RAUL CUBA CRUZ', dni: '75162447', documentType: 'L', email: 'r@x.pe' },
          remaining: 304,
          cci: CCI_OTRO,
        },
      ])
      const pdfText = [
        'RAUL CUBA CRUZ L - 75162447 304.00 ABONO RECHAZADO',
        'OTRO NOMBRE L - 99999999 500.00 ABONO ENVIADO',
      ].join('\n')
      jest.spyOn(service as any, 'extractPdfText').mockResolvedValue(pdfText)

      const res = await service.reconcileFromPdf('c1', Buffer.from('x'), { role: 'TESORERIA' })
      expect(res.conciliados).toHaveLength(0)
      expect(res.noAbonados).toHaveLength(1)
      expect(res.sinConciliar).toHaveLength(1) // el de 500 no tiene pendiente
      expect(advanceService.registerPayment).not.toHaveBeenCalled()
    })
  })

  describe('reconcileFromPdf · empates de documento + monto', () => {
    // Caso real: en el archivo del 13-ago el mismo colaborador aparecía dos
    // veces por el mismo importe (Carlos Zamudio S/ 785.69 x2). El PDF trae
    // solo documento e importe, así que hay que decidir con cuidado.
    const dosPendientesIguales = () => {
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        {
          advanceId: 'a1',
          user: { name: 'CARLOS ZAMUDIO', dni: '46563417', documentType: 'L', email: 'c@x.pe' },
          remaining: 785.69,
          cci: CCI_OTRO,
        },
      ])
      expenseReportService.findBatchPayableViaticos.mockResolvedValue([
        {
          reportId: 'r1',
          user: { name: 'CARLOS ZAMUDIO', dni: '46563417', documentType: 'L', email: 'c@x.pe' },
          remaining: 785.69,
          cci: CCI_OTRO,
        },
      ])
    }

    it('concilia los dos cuando el banco abonó las dos veces', async () => {
      dosPendientesIguales()
      const pdfText = [
        'No. Movimiento de Cargo 000025041 Fecha y Hora de Ejecución 02/06/2026 10:15',
        'CARLOS ZAMUDIO L - 46563417 785.69 ABONO ENVIADO',
        'CARLOS ZAMUDIO L - 46563417 785.69 ABONO ENVIADO',
      ].join('\n')
      jest.spyOn(service as any, 'extractPdfText').mockResolvedValue(pdfText)

      const res = await service.reconcileFromPdf('c1', Buffer.from('x'), { role: 'TESORERIA' })
      expect(res.conciliados).toHaveLength(2)
      expect(res.sinConciliar).toHaveLength(0)
    })

    it('NO adivina cuando el banco abonó solo una de las dos', async () => {
      dosPendientesIguales()
      const pdfText = [
        'No. Movimiento de Cargo 000025041 Fecha y Hora de Ejecución 02/06/2026 10:15',
        'CARLOS ZAMUDIO L - 46563417 785.69 ABONO ENVIADO',
      ].join('\n')
      jest.spyOn(service as any, 'extractPdfText').mockResolvedValue(pdfText)

      const res = await service.reconcileFromPdf('c1', Buffer.from('x'), { role: 'TESORERIA' })
      // Antes marcaba pagado el primero de la lista, que podía ser el equivocado.
      expect(res.conciliados).toHaveLength(0)
      expect(res.sinConciliar).toHaveLength(1)
      expect(res.sinConciliar[0].reason).toMatch(/no permite saber cuál se abonó/i)
      expect(advanceService.registerPayment).not.toHaveBeenCalled()
      expect(expenseReportService.registerViaticoPayment).not.toHaveBeenCalled()
    })
  })

  describe('reconcileFromPdf · fecha y avisos', () => {
    const unPendiente = () =>
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        {
          advanceId: 'a1',
          user: { name: 'RAUL CUBA CRUZ', dni: '75162447', documentType: 'L', email: 'r@x.pe' },
          remaining: 304,
          cci: CCI_OTRO,
        },
      ])
    const hoy = () => new Date().toISOString().slice(0, 10)
    const fechaUsada = () =>
      advanceService.registerPayment.mock.calls[0][1].transferDate

    it('usa la fecha de ejecución del PDF', async () => {
      unPendiente()
      jest.spyOn(service as any, 'extractPdfText').mockResolvedValue(
        [
          'No. Movimiento de Cargo 000025041 Fecha y Hora de Ejecución 02/06/2026 10:15',
          'RAUL CUBA CRUZ L - 75162447 304.00 ABONO ENVIADO',
        ].join('\n')
      )
      await service.reconcileFromPdf('c1', Buffer.from('x'), { role: 'TESORERIA' })
      expect(fechaUsada()).toBe('2026-06-02')
    })

    it('descarta una fecha que no existe en el calendario y usa la de hoy', async () => {
      unPendiente()
      jest.spyOn(service as any, 'extractPdfText').mockResolvedValue(
        [
          'No. Movimiento de Cargo 000025041 Fecha y Hora de Ejecución 31/02/2026 10:15',
          'RAUL CUBA CRUZ L - 75162447 304.00 ABONO ENVIADO',
        ].join('\n')
      )
      await service.reconcileFromPdf('c1', Buffer.from('x'), { role: 'TESORERIA' })
      expect(fechaUsada()).toBe(hoy())
    })

    it('avisa cuando el PDF no trae N° de movimiento de cargo', async () => {
      unPendiente()
      jest.spyOn(service as any, 'extractPdfText').mockResolvedValue(
        'RAUL CUBA CRUZ L - 75162447 304.00 ABONO ENVIADO'
      )
      const res = await service.reconcileFromPdf('c1', Buffer.from('x'), { role: 'TESORERIA' })
      expect(res.conciliados).toHaveLength(1) // concilia igual
      expect(res.advertencias.join(' ')).toMatch(/N° de movimiento de cargo/i)
      expect(res.advertencias.join(' ')).toMatch(/fecha de ejecución/i)
    })
  })

  describe('simulateReconcile', () => {
    it('marca como pagados todos los pendientes (simula el PDF de BBVA)', async () => {
      advanceService.findBatchPayableAdvances.mockResolvedValue([
        {
          advanceId: 'a1',
          user: { name: 'RAUL CUBA CRUZ', dni: '75162447', documentType: 'L', email: 'r@x.pe' },
          remaining: 304,
          cci: CCI_OTRO,
        },
      ])
      expenseReportService.findBatchPayableViaticos.mockResolvedValue([
        {
          reportId: 'v1',
          user: { name: 'ASTRID PENA', dni: '09831083', documentType: 'L', email: 'a@x.pe' },
          remaining: 249.8,
          cci: CCI_BBVA,
        },
      ])

      const res = await service.simulateReconcile('c1', { role: 'TESORERIA' })

      expect(res.conciliados).toHaveLength(2)
      expect(res.sinConciliar).toHaveLength(0)
      expect(res.noAbonados).toHaveLength(0)
      expect(res.operationNumber).toMatch(/^SIM\d+/)
      expect(advanceService.registerPayment).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ method: 'transferencia_bancaria', amount: 304 }),
        'TESORERIA',
        undefined,
        { bypassReceipt: true }
      )
      expect(expenseReportService.registerViaticoPayment).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ amount: 249.8 }),
        'TESORERIA',
        undefined,
        { bypassReceipt: true }
      )
    })

    it('falla si no hay pagos pendientes con datos completos', async () => {
      await expect(
        service.simulateReconcile('c1', { role: 'TESORERIA' })
      ).rejects.toThrow(/No hay pagos pendientes/)
    })
  })

  describe('confirmManual', () => {
    it('marca pagados los items indicados en su superficie', async () => {
      expenseReportService.findBatchPayableViaticos.mockResolvedValue([
        {
          reportId: 'v1',
          user: { name: 'ASTRID', dni: '09831083', documentType: 'L', email: 'a@x.pe' },
          remaining: 249.8,
          cci: CCI_BBVA,
        },
      ])
      const res = await service.confirmManual(
        'c1',
        [{ kind: 'viatico', id: 'v1' }],
        { operationNumber: 'OP1', paymentDate: '2026-06-02' },
        { role: 'TESORERIA' }
      )
      expect(res.pagados).toBe(1)
      expect(expenseReportService.registerViaticoPayment).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ operationNumber: 'OP1' }),
        'TESORERIA',
        undefined,
        { bypassReceipt: true }
      )
    })
  })
})

/**
 * Cuenta de cargo por moneda: una planilla en dólares no puede cargarse contra
 * la cuenta en soles de la empresa.
 */
describe('PaymentBatchService · cuenta de cargo por moneda', () => {
  const svc = Object.create(PaymentBatchService.prototype) as any
  const resolver = (client: any, config: any, moneda: string) =>
    svc.resolveChargeAccount(client, config, moneda)

  const config = {
    monedaBase: 'PEN',
    bankAccounts: [
      { nroCuenta: '0011-SOLES', moneda: 'PEN', activo: true },
      { nroCuenta: '0011-DOLARES', moneda: 'USD', activo: true },
    ],
  }

  it('elige la cuenta de la moneda de la planilla', () => {
    expect(resolver({}, config, 'PEN')).toBe('0011-SOLES')
    expect(resolver({}, config, 'USD')).toBe('0011-DOLARES')
  })

  it('ignora las cuentas desactivadas', () => {
    const soloInactiva = {
      monedaBase: 'PEN',
      bankAccounts: [{ nroCuenta: '0011-DOLARES', moneda: 'USD', activo: false }],
    }
    expect(resolver({}, soloInactiva, 'USD')).toBe('')
  })

  it('cae a la cuenta de la empresa solo para la moneda base', () => {
    const sinBancos = { monedaBase: 'PEN', bankAccounts: [] }
    expect(resolver({ paymentAccount: '00011231245' }, sinBancos, 'PEN')).toBe(
      '00011231245'
    )
    // En dólares NO se cae a la cuenta en soles: se prefiere fallar.
    expect(resolver({ paymentAccount: '00011231245' }, sinBancos, 'USD')).toBe('')
  })

  it('con varias cuentas en la misma moneda manda la marcada', () => {
    const varias = {
      monedaBase: 'PEN',
      bankAccounts: [
        { nroCuenta: '0011-A', moneda: 'PEN', activo: true },
        { nroCuenta: '0011-B', moneda: 'PEN', activo: true, esCuentaPagos: true },
      ],
    }
    expect(resolver({}, varias, 'PEN')).toBe('0011-B')
  })

  it('con varias sin marcar no adivina por orden de registro', () => {
    const ambiguas = {
      monedaBase: 'PEN',
      bankAccounts: [
        { nroCuenta: '0011-A', moneda: 'PEN', activo: true },
        { nroCuenta: '0011-B', moneda: 'PEN', activo: true },
      ],
    }
    // Devuelve vacío: el generador falla pidiendo que marquen cuál usar.
    expect(resolver({ paymentAccount: '999' }, ambiguas, 'PEN')).toBe('')
  })

  it('una cuenta sin moneda declarada se asume en la moneda base', () => {
    const sinMoneda = {
      monedaBase: 'PEN',
      bankAccounts: [{ nroCuenta: '0011-X', activo: true }],
    }
    expect(resolver({}, sinMoneda, 'PEN')).toBe('0011-X')
    expect(resolver({}, sinMoneda, 'USD')).toBe('')
  })
})
