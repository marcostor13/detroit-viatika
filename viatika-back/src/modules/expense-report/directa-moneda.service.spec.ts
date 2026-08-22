import { ExpenseReportService } from './expense-report.service'

/**
 * La rendición directa puede abrirse en dólares. Al crearla se congela su
 * moneda y el TC del día: es el que después usan sus comprobantes para
 * expresarse en la moneda del reporte (`expressInReportCurrency`). Sin él,
 * una directa en dólares dejaría todos sus gastos sin equivalencia y el total
 * de la rendición saldría vacío.
 */
describe('ExpenseReportService.create — moneda de la rendición directa', () => {
  const nuevoServicio = () => {
    const guardado: any = {}
    const svc = Object.create(ExpenseReportService.prototype) as any

    svc.expenseReportModel = function (doc: any) {
      Object.assign(guardado, doc)
      return { save: async () => ({ ...doc, _id: 'r1' }) }
    } as any
    svc.currencyService = {
      getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
      toBase: jest.fn(async (_monto: number, moneda: string) => ({
        montoBase: 0,
        tipoCambio: moneda === 'USD' ? 3.375 : 1,
        tcFecha: '2026-08-19',
      })),
    }
    // VD-123: `create` emite el codigo con iniciales del colaborador, asi que
    // ahora necesita el nombre.
    svc.generateCodigoRendicion = jest.fn().mockResolvedValue('RD-IT-0001')
    svc.resolveAssignedCoordinatorId = jest.fn().mockResolvedValue(undefined)

    return { svc, guardado }
  }

  const dtoBase = {
    gestion: 'Visita a obra',
    isDirecta: true,
    userId: '6a5aacf1c7ff0a6f1093ae01',
    clientId: '6a5aacddc7ff0a6f1093adc4',
    projectId: '6a5aace0c7ff0a6f1093add3',
  }

  it('congela la moneda y el tipo de cambio de una directa en dólares', async () => {
    const { svc, guardado } = nuevoServicio()

    await svc.create({ ...dtoBase, moneda: 'USD' }, dtoBase.userId, true)

    expect(guardado.viaticoMoneda).toBe('USD')
    expect(guardado.tipoCambio).toBe(3.375)
    expect(guardado.tcFecha).toBe('2026-08-19')
  })

  it('sin moneda elegida la directa queda en la moneda base', async () => {
    const { svc, guardado } = nuevoServicio()

    await svc.create({ ...dtoBase }, dtoBase.userId, true)

    expect(guardado.viaticoMoneda).toBe('PEN')
    expect(guardado.tipoCambio).toBe(1)
  })

  it('normaliza el símbolo si llega en vez del código ISO', async () => {
    const { svc, guardado } = nuevoServicio()

    await svc.create({ ...dtoBase, moneda: 'US$' }, dtoBase.userId, true)

    expect(guardado.viaticoMoneda).toBe('USD')
  })

  it('no toca las rendiciones que no son directas ni declaran moneda', async () => {
    // El alta de una rendición normal sigue exactamente como estaba.
    const { svc, guardado } = nuevoServicio()

    await svc.create({ ...dtoBase, isDirecta: false }, dtoBase.userId, false)

    expect(guardado.viaticoMoneda).toBeUndefined()
    expect(svc.currencyService.toBase).not.toHaveBeenCalled()
  })
})
