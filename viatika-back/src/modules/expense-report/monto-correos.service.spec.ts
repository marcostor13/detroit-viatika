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
 * El reembolso se PAGA en la moneda de la rendición: así se arma la planilla
 * del banco y así lo muestra Tesorería. Pero `settlement.difference` se guarda
 * en moneda base, porque la liquidación suma los `montoBase` de los gastos
 * para no mezclar monedas. Si el correo anuncia esa cifra sin deshacer la
 * conversión, le dice al colaborador "S/ 716.46" por un depósito de $ 212.41.
 */
describe('ExpenseReportService.reembolsoEnMonedaDelReporte', () => {
  const svc = Object.create(ExpenseReportService.prototype) as any
  const reembolso = (extra: Record<string, unknown>) => ({
    settlement: { type: 'reembolso', difference: -716.46 },
    ...extra,
  })

  it('convierte a dólares el reembolso de una rendición en dólares', () => {
    expect(
      svc.reembolsoEnMonedaDelReporte(reembolso({ viaticoMoneda: 'USD', tipoCambio: 3.373 }))
    ).toBe(212.41)
  })

  it('deja intacto el reembolso de una rendición en soles', () => {
    expect(
      svc.reembolsoEnMonedaDelReporte(reembolso({ viaticoMoneda: 'PEN', tipoCambio: 1 }))
    ).toBe(716.46)
  })

  it('trata como soles la rendición vieja que no declara moneda', () => {
    expect(svc.reembolsoEnMonedaDelReporte(reembolso({}))).toBe(716.46)
  })

  it('sin TC congelado no inventa: deja la cifra base', () => {
    expect(
      svc.reembolsoEnMonedaDelReporte(reembolso({ viaticoMoneda: 'USD', tipoCambio: 0 }))
    ).toBe(716.46)
  })

  it('coincide con lo que paga la planilla del banco', () => {
    // Mismo cálculo que `PaymentBatchService.reembolsoEnMonedaDelReporte`:
    // si se separan, el correo y el depósito dejan de cuadrar.
    const r = reembolso({ viaticoMoneda: 'USD', tipoCambio: 3.373 })
    const comoPagaElBanco = Math.round((716.46 / 3.373) * 100) / 100
    expect(svc.reembolsoEnMonedaDelReporte(r)).toBe(comoPagaElBanco)
  })
})
