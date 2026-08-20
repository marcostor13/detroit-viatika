import { ExpenseService } from './expense.service'

/**
 * EXD = "Documentos" de la pestaña Viaje en el extranjero. Es un comprobante
 * emitido fuera del Perú: no tiene RUC, no pasa por SUNAT y viene en dólares.
 * La moneda no se puede dejar a criterio del formulario — si llegara como
 * soles, el gasto se congelaría con tipo de cambio 1 y la rendición sumaría
 * dólares como si fueran soles.
 */
describe('ExpenseService.createOtherExpense — Documentos del extranjero (EXD)', () => {
  const nuevoServicio = () => {
    const guardado: any = {}
    const svc = Object.create(ExpenseService.prototype) as any

    svc.expenseReportService = {
      assertReportNotLockedByCajaChica: jest.fn().mockResolvedValue(undefined),
      assertPuedeCargarEnCajaChica: jest.fn().mockResolvedValue(undefined),
      buildChainForNewExpense: jest.fn().mockResolvedValue(undefined),
      addExpenseToReport: jest.fn().mockResolvedValue(undefined),
    }
    svc.expenseRepository = {
      create: jest.fn(async (doc: any) => {
        Object.assign(guardado, doc)
        return { ...doc, _id: { toString: () => 'exp1' } }
      }),
    }
    svc.resolveComprobanteCajaChica = jest.fn().mockResolvedValue(undefined)
    svc.evaluateCategoryLimit = jest.fn().mockResolvedValue({})
    svc.evaluateTopeComprobante = jest.fn().mockResolvedValue({})
    svc.freezeExpenseCurrency = jest.fn().mockResolvedValue({
      moneda: 'USD',
      montoBase: 405,
      tipoCambio: 3.375,
      tcFecha: '2026-08-19',
    })
    svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }

    return { svc, guardado }
  }

  const dtoBase = {
    clientId: '6a5aacddc7ff0a6f1093adc4',
    proyectId: '6a5aace0c7ff0a6f1093add3',
    categoryId: '6a5aacdec7ff0a6f1093adc9',
    expenseReportId: '6a7296a5bcfbd7af3a7d46ac',
    userId: '6a5aacf1c7ff0a6f1093ae01',
    subTipo: 'EXD',
    total: 120,
    data: 'Taxi aeropuerto Bogotá',
    imageUrl: 'https://s3/recibo.pdf',
    fechaEmision: '19/08/2026',
  }

  it('registra el gasto en dólares aunque el formulario no mande moneda', async () => {
    const { svc, guardado } = nuevoServicio()

    await svc.createOtherExpense({ ...dtoBase })

    expect(svc.freezeExpenseCurrency).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'USD' })
    )
    expect(guardado.moneda).toBe('USD')
    expect(guardado.montoBase).toBe(405)
    expect(guardado.subTipo).toBe('EXD')
  })

  it('ignora una moneda distinta que llegue en el payload', async () => {
    const { svc } = nuevoServicio()

    await svc.createOtherExpense({ ...dtoBase, moneda: 'PEN' })

    expect(svc.freezeExpenseCurrency).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'USD' })
    )
  })

  it('no exige RUC ni declaración jurada: el emisor es del exterior', async () => {
    const { svc, guardado } = nuevoServicio()

    await expect(
      svc.createOtherExpense({ ...dtoBase, rucEmisor: undefined })
    ).resolves.toBeDefined()
    expect(guardado.declaracionJurada).toBe(false)
  })

  it('sigue exigiendo el recibo adjunto', async () => {
    const { svc } = nuevoServicio()

    await expect(
      svc.createOtherExpense({ ...dtoBase, imageUrl: undefined })
    ).rejects.toThrow('Se requiere adjuntar el comprobante')
  })

  it('no toca la moneda del resto de sub-tipos de Otros Gastos', async () => {
    const { svc } = nuevoServicio()

    await svc.createOtherExpense({ ...dtoBase, subTipo: 'OT', moneda: 'PEN' })

    expect(svc.freezeExpenseCurrency).toHaveBeenCalledWith(
      expect.objectContaining({ moneda: 'PEN' })
    )
  })
})
