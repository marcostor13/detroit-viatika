import { CajaChicaReportService } from './caja-chica-report.service'

/**
 * El reporte de caja chica suma gastos de varias rendiciones. Si un gasto se
 * emitió en otra moneda, sumar `total` mezclaría soles y dólares en el total
 * del reporte, que es el que después se exporta y se firma.
 */
describe('CajaChicaReportService — importes en moneda base', () => {
  const svc = Object.create(CajaChicaReportService.prototype) as any

  it('usa la conversión congelada del comprobante extranjero', () => {
    expect(svc.expenseAmountBase({ total: 100, moneda: 'USD', montoBase: 370 })).toBe(370)
  })

  it('cae a total cuando el gasto es previo al multimoneda', () => {
    expect(svc.expenseAmountBase({ total: 80 })).toBe(80)
  })

  it('un gasto en moneda base vale igual por las dos vías', () => {
    expect(svc.expenseAmountBase({ total: 80, moneda: 'PEN', montoBase: 80 })).toBe(80)
  })

  it('tolera gastos vacíos', () => {
    expect(svc.expenseAmountBase(null)).toBe(0)
    expect(svc.expenseAmountBase({})).toBe(0)
  })

  it('el total del reporte ya no mezcla monedas', () => {
    const gastos = [
      { total: 100, moneda: 'USD', montoBase: 370 },
      { total: 50, moneda: 'PEN', montoBase: 50 },
    ]
    const total = gastos.reduce((s, e) => s + svc.expenseAmountBase(e), 0)
    // 370 + 50 = 420 soles. Antes salían 150, sumando dólares como soles.
    expect(total).toBe(420)
  })
})
