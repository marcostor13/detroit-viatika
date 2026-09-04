import { Types } from 'mongoose'

import { ExpenseService } from './expense.service'

/**
 * Cancelación: el colaborador deja constancia de que la rendición no se va a
 * ejecutar. Solo declara fecha y motivo — sin centro de costo, categoría ni
 * comprobante — y el gasto se guarda en 0 para que la rendición se pueda
 * enviar igual (el envío exige al menos un gasto, no un importe).
 */
describe('ExpenseService.createCancelacionExpense', () => {
  const centroCostoRendicion = new Types.ObjectId('6a5aace0c7ff0a6f1093add3')

  const nuevoServicio = () => {
    const guardado: any = {}
    const svc = Object.create(ExpenseService.prototype) as any

    svc.expenseReportService = {
      assertReportNotLockedByCajaChica: jest.fn().mockResolvedValue(undefined),
      assertPuedeCargarEnCajaChica: jest.fn().mockResolvedValue(undefined),
      buildChainForNewExpense: jest.fn().mockResolvedValue(undefined),
      addExpenseToReport: jest.fn().mockResolvedValue(undefined),
      findCentroCosto: jest.fn().mockResolvedValue(centroCostoRendicion),
      resolveCentroCostoCajaChica: jest.fn().mockResolvedValue(undefined),
    }
    svc.expenseRepository = {
      create: jest.fn(async (doc: any) => {
        Object.assign(guardado, doc)
        return { ...doc, _id: { toString: () => 'exp1' } }
      }),
    }
    svc.freezeExpenseCurrency = jest.fn().mockResolvedValue({
      moneda: 'PEN',
      montoBase: 0,
      tipoCambio: 1,
      tcFecha: '2026-09-01',
    })
    svc.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }

    return { svc, guardado }
  }

  const dtoBase = {
    clientId: '6a5aacddc7ff0a6f1093adc4',
    expenseReportId: '6a7296a5bcfbd7af3a7d46ac',
    userId: '6a5aacf1c7ff0a6f1093ae01',
    fechaEmision: '01/09/2026',
    motivo: '  Viaje suspendido por el cliente  ',
  }

  it('guarda el gasto en 0 con el motivo como descripción', async () => {
    const { svc, guardado } = nuevoServicio()

    await svc.createCancelacionExpense({ ...dtoBase })

    expect(guardado.total).toBe(0)
    expect(guardado.expenseType).toBe('cancelacion')
    expect(guardado.description).toBe('Viaje suspendido por el cliente')
    expect(JSON.parse(guardado.data)).toEqual(
      expect.objectContaining({
        type: 'cancelacion',
        motivo: 'Viaje suspendido por el cliente',
      })
    )
  })

  it('no lleva categoría ni adjunto: no hay nada que cargar', async () => {
    const { svc, guardado } = nuevoServicio()

    await svc.createCancelacionExpense({ ...dtoBase })

    expect(guardado.categoryId).toBeUndefined()
    expect(guardado.file).toBeUndefined()
  })

  // Sin centro de costo, `buildExpenseChains` se salta el comprobante y el
  // gasto queda sin aprobadores: la cancelación no seguía el flujo normal.
  it('hereda el centro de costo de la rendición para tener aprobadores', async () => {
    const { svc, guardado } = nuevoServicio()

    await svc.createCancelacionExpense({ ...dtoBase })

    expect(svc.expenseReportService.findCentroCosto).toHaveBeenCalledWith(
      dtoBase.expenseReportId
    )
    expect(String(guardado.proyectId)).toBe(String(centroCostoRendicion))
  })

  it('en caja chica cae al centro de costo del responsable', async () => {
    const { svc, guardado } = nuevoServicio()
    const cajaChica = new Types.ObjectId()
    svc.expenseReportService.findCentroCosto.mockResolvedValue(undefined)
    svc.expenseReportService.resolveCentroCostoCajaChica.mockResolvedValue(cajaChica)

    await svc.createCancelacionExpense({ ...dtoBase })

    expect(String(guardado.proyectId)).toBe(String(cajaChica))
  })

  it('ignora cualquier monto que llegue en el payload', async () => {
    const { svc, guardado } = nuevoServicio()

    await svc.createCancelacionExpense({ ...dtoBase, total: 500 })

    expect(guardado.total).toBe(0)
    expect(svc.freezeExpenseCurrency).toHaveBeenCalledWith(
      expect.objectContaining({ total: 0 })
    )
  })

  it('exige el motivo', async () => {
    const { svc } = nuevoServicio()

    await expect(
      svc.createCancelacionExpense({ ...dtoBase, motivo: '   ' })
    ).rejects.toThrow(/motivo de la cancelación es obligatorio/)
    expect(svc.expenseRepository.create).not.toHaveBeenCalled()
  })

  it('exige la fecha y no la acepta futura', async () => {
    const { svc } = nuevoServicio()

    await expect(
      svc.createCancelacionExpense({ ...dtoBase, fechaEmision: undefined })
    ).rejects.toThrow(/fecha de cancelación es obligatoria/)

    const manana = new Date(Date.now() + 48 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]
    await expect(
      svc.createCancelacionExpense({ ...dtoBase, fechaEmision: manana })
    ).rejects.toThrow(/no puede ser futura/)
    expect(svc.expenseRepository.create).not.toHaveBeenCalled()
  })

  it('lo suma a la rendición y le arma su cadena de aprobación', async () => {
    const { svc } = nuevoServicio()

    await svc.createCancelacionExpense({ ...dtoBase })

    expect(svc.expenseReportService.buildChainForNewExpense).toHaveBeenCalledWith(
      'exp1',
      dtoBase.userId,
      dtoBase.clientId
    )
    expect(svc.expenseReportService.addExpenseToReport).toHaveBeenCalledWith(
      dtoBase.expenseReportId,
      'exp1'
    )
  })
})
