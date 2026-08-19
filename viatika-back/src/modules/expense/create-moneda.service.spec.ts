import { ExpenseService } from './expense.service'

/**
 * `create()` es el alta genérica de comprobantes (POST /expense). Es la única de
 * las cinco vías de creación que no congelaba la conversión, y el agujero no se
 * ve hasta que se liquida: sin `montoBase` la rendición suma el `total` crudo y
 * mezcla dólares con soles.
 */
describe('ExpenseService.create — congelado de moneda', () => {
  const nuevoServicio = () => {
    const guardado: any = {}
    const svc = Object.create(ExpenseService.prototype) as any

    svc.expenseReportService = {
      assertReportNotLockedByCajaChica: jest.fn(),
      assertPuedeCargarEnCajaChica: jest.fn().mockResolvedValue(undefined),
    resolveCentroCostoCajaChica: jest.fn().mockResolvedValue(undefined),
      buildChainForNewExpense: jest.fn(),
      addExpenseToReport: jest.fn(),
    }
    svc.expenseRepository = function (doc: any) {
      Object.assign(guardado, doc)
      return {
        save: async () => ({ ...doc, _id: { toString: () => 'exp1' } }),
      }
    } as any
    svc.notificationsService = { create: jest.fn().mockResolvedValue(null) }
    svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }

    return { svc, guardado }
  }

  const dtoBase = {
    clientId: '6a5aacddc7ff0a6f1093adc4',
    proyectId: '6a5aace0c7ff0a6f1093add3',
    categoryId: '6a5aacdec7ff0a6f1093adc9',
    expenseReportId: '6a7296a5bcfbd7af3a7d46ac',
    total: 250,
  }

  it('guarda el equivalente en base de una factura en dólares', async () => {
    const { svc, guardado } = nuevoServicio()
    svc.freezeExpenseCurrency = jest.fn().mockResolvedValue({
      moneda: 'USD',
      montoBase: 846.25,
      tipoCambio: 3.385,
      tcFecha: '2026-08-04',
      monedaReporte: 'USD',
      tcReporte: 1,
      montoReporte: 250,
    })

    await svc.create({ ...dtoBase, moneda: 'USD', fechaEmision: '04/08/2026' })

    expect(guardado.moneda).toBe('USD')
    expect(guardado.montoBase).toBe(846.25)
    expect(guardado.tipoCambio).toBe(3.385)
    expect(guardado.montoReporte).toBe(250)
  })

  it('congela también la boleta en soles dentro de un viático en dólares', async () => {
    const { svc, guardado } = nuevoServicio()
    svc.freezeExpenseCurrency = jest.fn().mockResolvedValue({
      moneda: 'PEN',
      montoBase: 600,
      tipoCambio: 1,
      tcFecha: '2026-08-04',
      monedaReporte: 'USD',
      tcReporte: 3.385,
      montoReporte: 177.25,
    })

    await svc.create({ ...dtoBase, total: 600, moneda: 'PEN' })

    // Sin esto la liquidación tomaba 600 como si fueran dólares.
    expect(guardado.montoBase).toBe(600)
    expect(guardado.montoReporte).toBe(177.25)
    expect(guardado.monedaReporte).toBe('USD')
  })

  it('le pasa al congelado la fecha de emisión y la rendición', async () => {
    const { svc } = nuevoServicio()
    svc.freezeExpenseCurrency = jest.fn().mockResolvedValue({
      moneda: 'PEN', montoBase: 250, tipoCambio: 1, tcFecha: '2026-08-04',
    })

    await svc.create({ ...dtoBase, moneda: 'PEN', fechaEmision: '02/08/2026' })

    // El TC tiene que ser el de la fecha del documento, no el de hoy, y la
    // moneda del reporte sale de la rendición a la que se adjunta.
    expect(svc.freezeExpenseCurrency).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: dtoBase.clientId,
        total: 250,
        moneda: 'PEN',
        fecha: '02/08/2026',
        expenseReportId: dtoBase.expenseReportId,
      })
    )
  })
})
