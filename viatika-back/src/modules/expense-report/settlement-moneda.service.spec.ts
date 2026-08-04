import { ExpenseReportService } from './expense-report.service'

/**
 * Liquidación multimoneda. Se prueban los tres helpers de conversión sin montar
 * el módulo entero: son funciones puras y son el punto donde un error mete
 * dinero equivocado en una devolución o un reembolso.
 */
describe('ExpenseReportService — importes de liquidación en moneda base', () => {
  const svc = Object.create(ExpenseReportService.prototype) as any

  describe('gastos', () => {
    it('usa el montoBase congelado cuando el comprobante es extranjero', () => {
      // Factura de US$ 100 registrada con TC 3.70.
      const gasto = { total: 100, moneda: 'USD', montoBase: 370 }
      expect(svc.expenseSettlementAmountBase(gasto)).toBe(370)
    })

    it('cae a total en documentos previos al multimoneda', () => {
      expect(svc.expenseSettlementAmountBase({ total: 250 })).toBe(250)
    })

    it('un gasto en moneda base vale lo mismo por las dos vías', () => {
      const gasto = { total: 250, moneda: 'PEN', montoBase: 250 }
      expect(svc.expenseSettlementAmountBase(gasto)).toBe(250)
    })

    it('no explota con un gasto vacío', () => {
      expect(svc.expenseSettlementAmountBase(null)).toBe(0)
      expect(svc.expenseSettlementAmountBase({})).toBe(0)
    })
  })

  describe('anticipos', () => {
    it('convierte lo realmente pagado con el TC congelado del anticipo', () => {
      // Se solicitaron 200 USD pero se pagaron 150: manda el pago real.
      const anticipo = { status: 'paid', amount: 200, paidAmount: 150, tipoCambio: 3.7 }
      expect(svc.advanceSettlementAmountBase(anticipo)).toBe(555)
    })

    it('un anticipo aprobado pero no pagado aporta cero', () => {
      const anticipo = { status: 'approved', amount: 200, tipoCambio: 3.7 }
      expect(svc.advanceSettlementAmountBase(anticipo)).toBe(0)
    })

    it('sin TC congelado asume moneda base', () => {
      expect(svc.advanceSettlementAmountBase({ status: 'paid', amount: 300 })).toBe(300)
    })

    it('avisa cuando un anticipo extranjero no tiene TC congelado', () => {
      // `advances` es legado y ya no se crea: este caso es dato corrupto, y
      // valorarlo 1 a 1 en silencio dejaría la liquidación mal sin rastro.
      const error = jest.fn()
      svc.logger = { error }

      const valor = svc.advanceSettlementAmountBase({
        _id: 'adv1',
        status: 'paid',
        amount: 200,
        moneda: 'USD',
      })

      expect(valor).toBe(200)
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('sin tipo de cambio congelado')
      )
    })

    it('no avisa por un anticipo en moneda base sin TC', () => {
      const error = jest.fn()
      svc.logger = { error }
      svc.advanceSettlementAmountBase({ status: 'paid', amount: 200, moneda: 'PEN' })
      expect(error).not.toHaveBeenCalled()
    })
  })

  describe('importes del reporte', () => {
    it('convierte el depósito de una directa en dólares', () => {
      const report = { tipoCambio: 3.7 }
      expect(svc.reportSettlementAmountBase(report, 100)).toBe(370)
    })

    it('una rendición en moneda base no altera el importe', () => {
      expect(svc.reportSettlementAmountBase({ tipoCambio: 1 }, 100)).toBe(100)
      expect(svc.reportSettlementAmountBase({}, 100)).toBe(100)
    })
  })

  it('la diferencia de una liquidación mixta ya no mezcla monedas', () => {
    // Viático de US$ 200 pagado (TC 3.70) contra una boleta de S/ 370.
    const anticipo = { status: 'paid', amount: 200, tipoCambio: 3.7 }
    const gasto = { total: 370, moneda: 'PEN', montoBase: 370 }

    const advanceTotal = svc.advanceSettlementAmountBase(anticipo)
    const expenseTotal = svc.expenseSettlementAmountBase(gasto)

    // 740 soles anticipados menos 370 gastados = 370 a devolver.
    expect(advanceTotal - expenseTotal).toBe(370)
    // Antes se restaba 200 - 370 y salía un reembolso inexistente de 170.
    expect(advanceTotal - expenseTotal).toBeGreaterThan(0)
  })
})
