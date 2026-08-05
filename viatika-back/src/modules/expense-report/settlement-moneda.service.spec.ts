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

  /**
   * Los helpers de arriba ya convertían bien, pero `liquidateViaticoReport` no
   * los usaba para el anticipo: restaba `viaticoPaidAmount` (dólares) contra
   * gastos en soles. Se prueba el método completo, no las piezas.
   */
  describe('liquidateViaticoReport', () => {
    const liquidar = async (report: any, expenses: any[]) => {
      const svc = Object.create(ExpenseReportService.prototype) as any
      const doc = { ...report, expenseIds: expenses }
      svc.expenseReportModel = {
        findById: () => ({
          populate: () => ({ exec: async () => doc }),
        }),
      }
      svc.currencyService = { getConfig: async () => ({ monedaBase: 'PEN' }) }
      svc.updateSettlement = jest.fn()
      svc.close = jest.fn()
      await svc.liquidateViaticoReport('r1')
      return {
        settlement: svc.updateSettlement.mock.calls[0]?.[1],
        close: svc.close,
      }
    }

    const viatico = {
      type: 'viatico',
      status: 'approved',
      clientId: 'c1',
      viaticoMoneda: 'USD',
      viaticoPaidAmount: 800,
      tipoCambio: 3.383,
    }

    it('valora el viático en dólares con su TC antes de restar los gastos', async () => {
      // US$ 800 = S/ 2 706.40 contra S/ 1 066.68 gastados.
      const { settlement } = await liquidar(viatico, [
        { status: 'approved', total: 338.3, moneda: 'PEN', montoBase: 338.3, montoReporte: 100 },
        { status: 'approved', total: 75.5, moneda: 'USD', montoBase: 255.42, montoReporte: 75.5 },
        { status: 'approved', total: 50, moneda: 'PEN', montoBase: 50, montoReporte: 14.78 },
        { status: 'approved', total: 100, moneda: 'USD', montoBase: 338.38, montoReporte: 100 },
        { status: 'approved', total: 25, moneda: 'USD', montoBase: 84.58, montoReporte: 25 },
      ])

      expect(settlement.advanceTotal).toBe(2706.4)
      expect(settlement.expenseTotal).toBeCloseTo(1066.68, 2)
      // Antes salía 800 - 1066.68 = reembolso de 266.68, que no existía.
      expect(settlement.type).toBe('devolucion')
      expect(settlement.difference).toBeCloseTo(1639.72, 2)
    })

    it('expresa el equivalente en la moneda del viático sumando los montoReporte', async () => {
      const { settlement } = await liquidar(viatico, [
        { status: 'approved', total: 338.3, moneda: 'PEN', montoBase: 338.3, montoReporte: 100 },
        { status: 'approved', total: 75.5, moneda: 'USD', montoBase: 255.42, montoReporte: 75.5 },
        { status: 'approved', total: 50, moneda: 'PEN', montoBase: 50, montoReporte: 14.78 },
        { status: 'approved', total: 100, moneda: 'USD', montoBase: 338.38, montoReporte: 100 },
        { status: 'approved', total: 25, moneda: 'USD', montoBase: 84.58, montoReporte: 25 },
      ])

      // Debe coincidir al céntimo con el saldo que ve el colaborador en pantalla:
      // dividir el total base entre el TC del viático daría 484.69, no 484.72,
      // porque cada gasto se congeló con el TC de su propia fecha.
      expect(settlement.monedaReporte).toBe('USD')
      expect(settlement.moneda).toBe('PEN')
      expect(settlement.advanceTotalReporte).toBe(800)
      expect(settlement.expenseTotalReporte).toBe(315.28)
      expect(settlement.differenceReporte).toBe(484.72)
    })

    it('ignora los comprobantes no aprobados en ambas monedas', async () => {
      const { settlement } = await liquidar(viatico, [
        { status: 'approved', total: 100, moneda: 'USD', montoBase: 338.3, montoReporte: 100 },
        { status: 'rejected', total: 500, moneda: 'USD', montoBase: 1691.5, montoReporte: 500 },
        { status: 'pending', total: 200, moneda: 'USD', montoBase: 676.6, montoReporte: 200 },
      ])

      expect(settlement.expenseTotal).toBe(338.3)
      expect(settlement.expenseTotalReporte).toBe(100)
    })

    it('cierra solo el viático que queda equilibrado', async () => {
      const { settlement, close } = await liquidar(
        { ...viatico, viaticoPaidAmount: 100 },
        [{ status: 'approved', total: 100, moneda: 'USD', montoBase: 338.3, montoReporte: 100 }]
      )

      expect(settlement.type).toBe('equilibrado')
      expect(close).toHaveBeenCalledWith('r1', 'sistema')
    })

    it('una rendición en soles se liquida igual que antes', async () => {
      const { settlement } = await liquidar(
        { type: 'viatico', status: 'approved', clientId: 'c1', viaticoMoneda: 'PEN', viaticoPaidAmount: 500, tipoCambio: 1 },
        [{ status: 'approved', total: 120, moneda: 'PEN', montoBase: 120, montoReporte: 120 }]
      )

      expect(settlement.advanceTotal).toBe(500)
      expect(settlement.difference).toBe(380)
      expect(settlement.differenceReporte).toBe(380)
      expect(settlement.type).toBe('devolucion')
    })
  })
})
