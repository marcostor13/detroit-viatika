import { ExpenseService } from './expense.service'

/**
 * Un comprobante que no declara moneda toma la de su rendición, no la base de
 * la empresa. Quien tipea 120 en una rendición directa en dólares está
 * diciendo $120; asumir soles metía un importe falso en el total del reporte.
 *
 * Aplica a TODOS los tipos, planilla de movilidad incluida. Se probó dejarla
 * fuera —por ser un documento en soles con tope diario en soles— y el
 * resultado era peor: quien cargaba 30 en una rendición en dólares veía
 * "S/ 30.00" en el detalle y "$ 8.89" en el total, sin forma de relacionarlos.
 * El tope se resuelve comparando contra el equivalente en soles.
 */
describe('ExpenseService.freezeExpenseCurrency — moneda heredada de la rendición', () => {
  const nuevoServicio = (monedaDelReporte?: string) => {
    const svc = Object.create(ExpenseService.prototype) as any
    svc.currencyService = {
      getConfig: jest.fn().mockResolvedValue({ monedaBase: 'PEN' }),
      toBase: jest.fn(async (monto: number, moneda: string) => ({
        montoBase: moneda === 'USD' ? monto * 3.375 : monto,
        tipoCambio: moneda === 'USD' ? 3.375 : 1,
        tcFecha: '2026-08-19',
      })),
    }
    svc.expenseReportService = {
      findCurrencyMeta: jest.fn().mockResolvedValue(
        monedaDelReporte ? { moneda: monedaDelReporte, tipoCambio: 3.375 } : null
      ),
    }
    svc.logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() }
    return svc
  }

  const congelar = (svc: any, extra: Record<string, unknown> = {}) =>
    svc.freezeExpenseCurrency({
      clientId: 'c1',
      total: 120,
      expenseReportId: 'r1',
      ...extra,
    })

  it('hereda los dólares de la rendición cuando el gasto no declara moneda', async () => {
    const svc = nuevoServicio('USD')
    const fx = await congelar(svc)
    expect(fx.moneda).toBe('USD')
    expect(fx.montoBase).toBe(405)
    expect(fx.montoReporte).toBe(120)
  })

  it('respeta la moneda propia del comprobante por encima de la del reporte', async () => {
    // Una boleta en soles dentro de una rendición en dólares es correcta:
    // se guarda en soles y se convierte para mostrarse.
    const svc = nuevoServicio('USD')
    const fx = await congelar(svc, { moneda: 'PEN' })
    expect(fx.moneda).toBe('PEN')
    expect(fx.montoBase).toBe(120)
    expect(fx.monedaReporte).toBe('USD')
  })

  it('una boleta en soles dentro de una rendición en dólares se respeta', async () => {
    // Se guarda en soles y se expresa en dólares para que el reporte totalice.
    const svc = nuevoServicio('USD')
    const fx = await congelar(svc, { moneda: 'PEN' })
    expect(fx.moneda).toBe('PEN')
    expect(fx.montoBase).toBe(120)
    expect(fx.monedaReporte).toBe('USD')
    expect(fx.montoReporte).toBeCloseTo(35.56, 2)
  })

  it('cae en la moneda base cuando el gasto no está en ninguna rendición', async () => {
    const svc = nuevoServicio('USD')
    const fx = await svc.freezeExpenseCurrency({ clientId: 'c1', total: 120 })
    expect(fx.moneda).toBe('PEN')
  })

  it('cae en la moneda base si la rendición no declara ninguna', async () => {
    // Retrocompatibilidad: las rendiciones anteriores al multimoneda.
    const svc = nuevoServicio(undefined)
    const fx = await congelar(svc)
    expect(fx.moneda).toBe('PEN')
  })
})

/**
 * Los topes de comida (VD-109) están configurados en soles. Un gasto de
 * alimentación cargado en dólares tiene que medirse con la misma vara: contra
 * su equivalente en moneda base, no contra la cifra cruda. Antes se comparaba
 * el número tal cual, así que un almuerzo de $8 pasaba el tope de S/ 25 aunque
 * fueran S/ 27.
 */
describe('ExpenseService.createOtherExpense — tope de comida en moneda base', () => {
  const nuevoServicio = (montoBase: number) => {
    const svc = Object.create(ExpenseService.prototype) as any
    svc.expenseReportService = {
      assertReportNotLockedByCajaChica: jest.fn().mockResolvedValue(undefined),
      assertPuedeCargarEnCajaChica: jest.fn().mockResolvedValue(undefined),
      buildChainForNewExpense: jest.fn().mockResolvedValue(undefined),
      addExpenseToReport: jest.fn().mockResolvedValue(undefined),
    }
    svc.expenseRepository = {
      create: jest.fn(async (doc: any) => ({ ...doc, _id: { toString: () => 'e1' } })),
    }
    svc.clientModel = {
      findById: () => ({
        lean: () => ({
          exec: async () => ({ limits: { alimentacionAlmuerzo: 25 } }),
        }),
      }),
    }
    svc.userService = {
      findTransactionalProfile: jest.fn().mockResolvedValue({ signature: 'firma.png' }),
    }
    // Campo de instancia, no del prototipo: hay que reponerlo en el doble.
    svc.ETIQUETA_COMIDA = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', cena: 'Cena' }
    svc.resolveComprobanteCajaChica = jest.fn().mockResolvedValue(undefined)
    svc.evaluateCategoryLimit = jest.fn().mockResolvedValue({})
    svc.evaluateTopeComprobante = jest.fn().mockResolvedValue({})
    svc.freezeExpenseCurrency = jest.fn().mockResolvedValue({
      moneda: 'USD',
      montoBase,
      tipoCambio: 3.375,
      tcFecha: '2026-08-19',
    })
    svc.logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() }
    return svc
  }

  const dtoAlmuerzo = (total: number) => ({
    clientId: '6a5aacddc7ff0a6f1093adc4',
    proyectId: '6a5aace0c7ff0a6f1093add3',
    categoryId: '6a5aacdec7ff0a6f1093adc9',
    expenseReportId: '6a7296a5bcfbd7af3a7d46ac',
    userId: '6a5aacf1c7ff0a6f1093ae01',
    subTipo: 'AL',
    tipoComida: 'almuerzo',
    declaracionJurada: true,
    total,
  })

  it('rechaza el almuerzo en dólares que pasa el tope una vez convertido', async () => {
    // $8 x 3.375 = S/ 27, por encima del tope de S/ 25.
    const svc = nuevoServicio(27)
    await expect(svc.createOtherExpense(dtoAlmuerzo(8))).rejects.toThrow(
      'supera el tope de S/ 25.00'
    )
  })

  it('acepta el almuerzo en dólares que se mantiene bajo el tope', async () => {
    // $5 x 3.375 = S/ 16.88.
    const svc = nuevoServicio(16.88)
    await expect(svc.createOtherExpense(dtoAlmuerzo(5))).resolves.toBeDefined()
  })

  it('sigue midiendo igual el almuerzo en soles', async () => {
    const svc = nuevoServicio(30)
    await expect(svc.createOtherExpense(dtoAlmuerzo(30))).rejects.toThrow(
      'supera el tope de S/ 25.00'
    )
  })
})

/**
 * El límite diario de la planilla de movilidad está configurado en soles. En
 * una rendición en dólares las filas van en dólares, así que compararlas
 * crudas dejaba pasar un día de $30 —S/ 101— contra un tope de S/ 30.
 */
describe('ExpenseService — límite diario de movilidad en moneda base', () => {
  const nuevoServicio = (limiteDiario: number | null) => {
    const svc = Object.create(ExpenseService.prototype) as any
    svc.clientModel = {
      findById: () => ({ lean: () => ({ exec: async () => ({ limits: limiteDiario === null ? {} : { movilidadDiario: limiteDiario } }) }) }),
    }
    return svc
  }

  const filas = (montos: Record<string, number>) =>
    Object.entries(montos).map(([fecha, total]) => ({ fecha, total }))

  it('rechaza el día en dólares que pasa el tope una vez convertido', async () => {
    const svc = nuevoServicio(30)
    // $30 x 3.373 = S/ 101.19, muy por encima del tope de S/ 30.
    await expect(
      svc.assertLimiteDiarioMovilidad('c1', filas({ '2026-08-19': 30 }), 3.373)
    ).rejects.toThrow('supera el límite diario de S/ 30.00')
  })

  it('acepta el día en dólares que se mantiene bajo el tope', async () => {
    const svc = nuevoServicio(30)
    // $8 x 3.373 = S/ 26.98.
    await expect(
      svc.assertLimiteDiarioMovilidad('c1', filas({ '2026-08-19': 8 }), 3.373)
    ).resolves.toBeUndefined()
  })

  it('suma las filas del mismo día antes de comparar', async () => {
    const svc = nuevoServicio(30)
    const dosFilas = [
      { fecha: '2026-08-19', total: 5 },
      { fecha: '2026-08-19', total: 5 },
    ]
    // 10 x 3.373 = S/ 33.73: por separado pasaban, juntas no.
    await expect(
      svc.assertLimiteDiarioMovilidad('c1', dosFilas, 3.373)
    ).rejects.toThrow('supera el límite diario')
  })

  it('mide cada día por su cuenta', async () => {
    const svc = nuevoServicio(30)
    await expect(
      svc.assertLimiteDiarioMovilidad('c1', filas({ '2026-08-19': 8, '2026-08-20': 8 }), 3.373)
    ).resolves.toBeUndefined()
  })

  it('sigue midiendo igual la planilla en soles', async () => {
    const svc = nuevoServicio(30)
    await expect(
      svc.assertLimiteDiarioMovilidad('c1', filas({ '2026-08-19': 31 }), 1)
    ).rejects.toThrow('S/ 31.00')
  })

  it('no valida nada si la empresa no configuró tope', async () => {
    const svc = nuevoServicio(null)
    await expect(
      svc.assertLimiteDiarioMovilidad('c1', filas({ '2026-08-19': 9999 }), 3.373)
    ).resolves.toBeUndefined()
  })
})
