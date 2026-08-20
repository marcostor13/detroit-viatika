import { ExpenseReportService } from './expense-report.service'

/**
 * El importe que los correos llaman "presupuesto"/"monto aprobado" sale de
 * `computeReportBudgetDisplay`, y los llamadores lo rotulan con
 * `reportCurrencySymbol` — el símbolo de la RENDICIÓN. Así que la cifra tiene
 * que venir en esa misma moneda.
 *
 * Sumarla en soles mandaba al colaborador un "Monto aprobado: $ 30.00" por una
 * rendición de $ 8.89 que contenía una boleta de S/ 30: la cifra de una moneda
 * con el símbolo de la otra. Un error de este tipo no falla en ningún log, y
 * quien lo lee no tiene contra qué contrastarlo.
 */
describe('ExpenseReportService.computeReportBudgetDisplay — moneda de la rendición', () => {
  const nuevoServicio = (expenses: any[]) => {
    const svc = Object.create(ExpenseReportService.prototype) as any
    svc.expenseReportModel = {
      findById: () => ({
        populate: () => ({ exec: async () => ({ expenseIds: expenses }) }),
      }),
    }
    return svc
  }

  const directa = { _id: 'r1', isDirecta: true, viaticoMoneda: 'USD', budget: 0 }

  it('devuelve el total en la moneda de la rendición, no en soles', async () => {
    // Boleta local de S/ 30 dentro de una directa en dólares.
    const svc = nuevoServicio([
      { status: 'approved', total: 30, moneda: 'PEN', montoBase: 30, montoReporte: 8.89, monedaReporte: 'USD' },
    ])
    await expect(svc.computeReportBudgetDisplay(directa)).resolves.toBe(8.89)
  })

  it('suma varios comprobantes en la moneda del reporte', async () => {
    const svc = nuevoServicio([
      { status: 'approved', total: 30, moneda: 'PEN', montoBase: 30, montoReporte: 8.89 },
      { status: 'approved', total: 120, moneda: 'USD', montoBase: 404.76, montoReporte: 120 },
    ])
    await expect(svc.computeReportBudgetDisplay(directa)).resolves.toBeCloseTo(128.89, 2)
  })

  it('descarta los comprobantes rechazados', async () => {
    const svc = nuevoServicio([
      { status: 'approved', total: 120, moneda: 'USD', montoReporte: 120 },
      { status: 'rejected', total: 999, moneda: 'USD', montoReporte: 999 },
    ])
    await expect(svc.computeReportBudgetDisplay(directa)).resolves.toBe(120)
  })

  it('una directa en soles sigue dando lo mismo que antes', async () => {
    const svc = nuevoServicio([
      { status: 'approved', total: 56.7, moneda: 'PEN', montoBase: 56.7, montoReporte: 56.7 },
    ])
    const enSoles = { _id: 'r2', isDirecta: true, viaticoMoneda: 'PEN', budget: 0 }
    await expect(svc.computeReportBudgetDisplay(enSoles)).resolves.toBe(56.7)
  })

  it('cae al presupuesto del reporte cuando todavía no hay gastos', async () => {
    // Sin esto los correos anunciaban "S/ 0.00" (VD-52).
    const svc = nuevoServicio([])
    await expect(
      svc.computeReportBudgetDisplay({ ...directa, budget: 500 })
    ).resolves.toBe(500)
  })

  it('un comprobante viejo sin conversión congelada usa su total', async () => {
    // Retrocompatibilidad: los anteriores al multimoneda ya estaban en soles.
    const svc = nuevoServicio([{ status: 'approved', total: 48 }])
    await expect(svc.computeReportBudgetDisplay(directa)).resolves.toBe(48)
  })
})

/**
 * El saldo de la liquidación se mueve en la moneda del documento, en las dos
 * direcciones: el reembolso que Tesorería paga y la devolución que el
 * colaborador transfiere. Pero `settlement.difference` se guarda en moneda
 * base, porque la liquidación suma los `montoBase` de los gastos para no
 * mezclar monedas. Sin deshacer esa conversión, al colaborador se le anuncia
 * "S/ 716.46" por un depósito de $ 212.41, o se le pide devolver soles por un
 * anticipo que recibió en dólares.
 */
describe('ExpenseReportService.saldoLiquidadoEnMonedaDelReporte', () => {
  const svc = Object.create(ExpenseReportService.prototype) as any
  const reembolso = (extra: Record<string, unknown>) => ({
    settlement: { type: 'reembolso', difference: -716.46 },
    ...extra,
  })

  it('convierte a dólares el reembolso de una rendición en dólares', () => {
    expect(
      svc.saldoLiquidadoEnMonedaDelReporte(reembolso({ viaticoMoneda: 'USD', tipoCambio: 3.373 }))
    ).toBe(212.41)
  })

  it('deja intacto el reembolso de una rendición en soles', () => {
    expect(
      svc.saldoLiquidadoEnMonedaDelReporte(reembolso({ viaticoMoneda: 'PEN', tipoCambio: 1 }))
    ).toBe(716.46)
  })

  it('trata como soles la rendición vieja que no declara moneda', () => {
    expect(svc.saldoLiquidadoEnMonedaDelReporte(reembolso({}))).toBe(716.46)
  })

  it('sin TC congelado no inventa: deja la cifra base', () => {
    expect(
      svc.saldoLiquidadoEnMonedaDelReporte(reembolso({ viaticoMoneda: 'USD', tipoCambio: 0 }))
    ).toBe(716.46)
  })

  it('coincide con lo que paga la planilla del banco', () => {
    // Mismo cálculo que `PaymentBatchService.reembolsoEnMonedaDelReporte`:
    // si se separan, el correo y el depósito dejan de cuadrar.
    const r = reembolso({ viaticoMoneda: 'USD', tipoCambio: 3.373 })
    const comoPagaElBanco = Math.round((716.46 / 3.373) * 100) / 100
    expect(svc.saldoLiquidadoEnMonedaDelReporte(r)).toBe(comoPagaElBanco)
  })
})

/**
 * La devolución la transfiere el colaborador con el dinero que tiene en la
 * mano: si el anticipo fue en dólares, debe dólares. Se guardaba y se le pedía
 * en soles, y su comprobante en dólares no pasaba la validación de
 * `uploadViaticoReturnProof`, que compara contra el monto adeudado. O sea que
 * una devolución en dólares quedaba trabada, no solo mal rotulada.
 */
describe('ExpenseReportService — devolución en la moneda de la solicitud', () => {
  const svc = Object.create(ExpenseReportService.prototype) as any

  const solicitud = (extra: Record<string, unknown>) => ({
    _id: 'r1',
    type: 'viatico',
    status: 'settled',
    // Recibió US$ 500, gastó US$ 100: debe US$ 400 (S/ 1349.20 al TC 3.373).
    settlement: { type: 'devolucion', difference: 1349.2 },
    ...extra,
  })

  it('convierte el saldo a la moneda del anticipo', () => {
    const r = solicitud({ viaticoMoneda: 'USD', tipoCambio: 3.373 })
    expect(svc.saldoLiquidadoEnMonedaDelReporte(r)).toBe(400)
  })

  it('un anticipo en soles se mantiene igual', () => {
    const r = solicitud({ viaticoMoneda: 'PEN', tipoCambio: 1 })
    expect(svc.saldoLiquidadoEnMonedaDelReporte(r)).toBe(1349.2)
  })

  it('usa el mismo cálculo que el reembolso: es el mismo saldo', () => {
    // Si se separan, una dirección paga distinto de lo que la otra cobra.
    const r = solicitud({ viaticoMoneda: 'USD', tipoCambio: 3.373 })
    expect(svc.saldoLiquidadoEnMonedaDelReporte(r)).toBe(
      Math.round((1349.2 / 3.373) * 100) / 100
    )
  })
})

/**
 * Ruta completa de la devolución: qué se guarda, qué dice el correo y qué
 * acepta la validación del comprobante. Con un anticipo en dólares las tres
 * cosas tienen que hablar de dólares.
 */
describe('ExpenseReportService.initiateViaticoReturnTracking', () => {
  const armar = (report: any, bankAccounts: any[] = []) => {
    const guardado: any = {}
    const correos: any[] = []
    const svc = Object.create(ExpenseReportService.prototype) as any
    svc.expenseReportModel = {
      findById: async () => report,
      findByIdAndUpdate: async (_id: string, update: any) => {
        Object.assign(guardado, update.$set)
        return report
      },
    }
    svc.userService = {
      findEmailNameClient: async () => ({ email: 'colab@x.pe', name: 'Ivan Torres' }),
    }
    svc.currencyService = {
      getConfig: async () => ({ monedaBase: 'PEN', bankAccounts }),
    }
    svc.emailService = {
      formatDateDDMMYYYY: (d: any) => String(d),
      sendDevolucionPendiente: jest.fn(async (email: string, data: any) => {
        correos.push({ email, ...data })
      }),
    }
    svc.findOne = async () => report
    svc.addViaticoBusinessDays = () => new Date('2026-09-02T00:00:00.000Z')
    return { svc, guardado, correos }
  }

  const enDolares = () => ({
    _id: 'r1', type: 'viatico', status: 'settled',
    userId: 'u1', clientId: 'c1',
    viaticoMoneda: 'USD', tipoCambio: 3.373,
    settlement: { type: 'devolucion', difference: 1349.2 },
  })

  const CUENTAS = [
    { banco: 'BBVA', nroCuenta: '00110332020028910011', cci: '00110332020028910011', moneda: 'PEN', activo: true, esCuentaPagos: true },
    { banco: 'BBVA', nroCuenta: '00110332020028920022', cci: '00110332020028920022', moneda: 'USD', activo: true, esCuentaPagos: true },
  ]

  it('guarda las dos cifras: la base para los agregados y la de la solicitud', async () => {
    const { svc, guardado } = armar(enDolares())
    await svc.initiateViaticoReturnTracking('r1')
    expect(guardado.viaticoReturnRecord.amountDue).toBe(1349.2)
    expect(guardado.viaticoReturnRecord.amountDueMoneda).toBe(400)
    expect(guardado.viaticoReturnRecord.moneda).toBe('USD')
  })

  it('le pide al colaborador el monto en la moneda que recibió', async () => {
    const { svc, correos } = armar(enDolares())
    await svc.initiateViaticoReturnTracking('r1')
    expect(correos[0].currencySymbol).toBe('$')
    expect(correos[0].amountDue).toContain('400')
  })

  it('le dice a qué cuenta transferir, la de ESA moneda', async () => {
    const { svc, correos } = armar(enDolares(), CUENTAS)
    await svc.initiateViaticoReturnTracking('r1')
    expect(correos[0].accountNumber).toBe('00110332020028920022')
    expect(correos[0].cci).toBe('00110332020028920022')
    expect(correos[0].bankName).toBe('BBVA')
  })

  it('una solicitud en soles usa la cuenta en soles', async () => {
    const enSoles = { ...enDolares(), viaticoMoneda: 'PEN', tipoCambio: 1 }
    const { svc, correos } = armar(enSoles, CUENTAS)
    await svc.initiateViaticoReturnTracking('r1')
    expect(correos[0].accountNumber).toBe('00110332020028910011')
    expect(correos[0].currencySymbol).toBe('S/')
  })

  it('sin cuentas registradas el correo sale igual, sin los datos bancarios', async () => {
    // Es peor no avisar de la devolución que avisar sin la cuenta.
    const { svc, correos } = armar(enDolares(), [])
    await svc.initiateViaticoReturnTracking('r1')
    expect(correos).toHaveLength(1)
    expect(correos[0].accountNumber).toBeUndefined()
  })
})
