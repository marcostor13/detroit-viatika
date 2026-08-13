import {
  normalizeExtraccionOcr,
  splitSerieCorrelativo,
  toNumber,
} from './ocr-normalize.util'

describe('toNumber', () => {
  it('lee números y cadenas simples', () => {
    expect(toNumber(80)).toBe(80)
    expect(toNumber('80.00')).toBe(80)
    expect(toNumber('S/ 80.00')).toBe(80)
  })

  it('lee separador de miles anglosajón y europeo', () => {
    expect(toNumber('1,234.56')).toBe(1234.56)
    expect(toNumber('1.234,56')).toBe(1234.56)
    expect(toNumber('1,234')).toBe(1234)
    expect(toNumber('80,00')).toBe(80)
  })

  it('devuelve NaN para lo que no es número', () => {
    expect(Number.isNaN(toNumber(''))).toBe(true)
    expect(Number.isNaN(toNumber(null))).toBe(true)
    expect(Number.isNaN(toNumber('sin monto'))).toBe(true)
  })
})

describe('splitSerieCorrelativo', () => {
  it('separa la serie del correlativo cuando vienen pegados', () => {
    expect(splitSerieCorrelativo('F001-00004468')).toEqual({
      serie: 'F001',
      correlativo: '00004468',
    })
  })

  it('quita el prefijo de serie repetido en el correlativo', () => {
    expect(splitSerieCorrelativo('F001', 'F001-00004468')).toEqual({
      serie: 'F001',
      correlativo: '00004468',
    })
  })

  it('respeta los valores ya separados', () => {
    expect(splitSerieCorrelativo('E001', '123')).toEqual({
      serie: 'E001',
      correlativo: '123',
    })
  })

  it('no inventa nada si viene vacío', () => {
    expect(splitSerieCorrelativo(undefined, undefined)).toEqual({
      serie: undefined,
      correlativo: undefined,
    })
  })
})

describe('normalizeExtraccionOcr', () => {
  /**
   * Caso que dejaba el formulario en blanco: el modelo llena sólo
   * `comprobanteDetallado` y los campos planos vuelven vacíos, así que el total
   * quedaba en 0 y SUNAT se validaba sin serie ni correlativo.
   */
  it('recupera los campos planos desde comprobanteDetallado', () => {
    const { extraccion, camposRecuperados } = normalizeExtraccionOcr({
      comentario: 'Servicio de hospedaje',
      comprobanteDetallado: {
        emisor: {
          ruc: '20601212537',
          razonSocial: 'INVERSIONES TESILLO E.I.R.L.',
          direccion: 'Av. Bolognesi Nro. 356 - 360',
        },
        comprobante: {
          tipo: 'Factura',
          serie: 'F001',
          correlativo: '00004468',
          fechaEmision: '28-06-2026',
          moneda: 'PEN',
        },
        totales: {
          operacionGravada: 72.4,
          igv: 7.6,
          tasaIgv: 10.5,
          importeTotal: 80,
        },
      },
    })

    expect(extraccion.rucEmisor).toBe('20601212537')
    expect(extraccion.razonSocial).toBe('INVERSIONES TESILLO E.I.R.L.')
    expect(extraccion.serie).toBe('F001')
    expect(extraccion.correlativo).toBe('00004468')
    expect(extraccion.fechaEmision).toBe('28-06-2026')
    expect(extraccion.moneda).toBe('PEN')
    expect(extraccion.montoTotal).toBe(80)
    expect(extraccion.baseAfecta).toBe(72.4)
    expect(extraccion.igv).toBe(7.6)
    expect(extraccion.tasaIgv).toBe(10.5)
    expect(camposRecuperados).toContain('montoTotal')
    expect(camposRecuperados).toContain('rucEmisor')
  })

  it('no sobreescribe lo que el modelo ya devolvió en la raíz', () => {
    const { extraccion, camposRecuperados } = normalizeExtraccionOcr({
      rucEmisor: '20601212537',
      montoTotal: 80,
      comprobanteDetallado: {
        emisor: { ruc: '99999999999' },
        totales: { importeTotal: 999 },
      },
    })
    expect(extraccion.rucEmisor).toBe('20601212537')
    expect(extraccion.montoTotal).toBe(80)
    expect(camposRecuperados).toEqual([])
  })

  it('conserva el 0 como valor válido de IGV', () => {
    const { extraccion } = normalizeExtraccionOcr({
      igv: 0,
      baseAfecta: 0,
      comprobanteDetallado: {
        totales: { igv: 13.73, operacionGravada: 76.27 },
      },
    })
    expect(extraccion.igv).toBe(0)
    expect(extraccion.baseAfecta).toBe(0)
  })

  it('limpia el RUC leído con espacios', () => {
    const { extraccion } = normalizeExtraccionOcr({
      rucEmisor: '20601 21 2537',
    })
    expect(extraccion.rucEmisor).toBe('20601212537')
  })

  it('toma inafecto sólo del recargo al consumo', () => {
    // `operacionInafecta` no se copia: ya entra como porción propia en los
    // asientos contables y duplicaría el monto.
    const { extraccion } = normalizeExtraccionOcr({
      comprobanteDetallado: {
        recargoConsumo: 10,
        totales: { operacionInafecta: 25 },
      },
    })
    expect(extraccion.inafecto).toBe(10)

    const sinRecargo = normalizeExtraccionOcr({
      comprobanteDetallado: { totales: { operacionInafecta: 25 } },
    })
    expect(sinRecargo.extraccion.inafecto).toBeUndefined()
  })

  it('no escribe dentro de comprobanteDetallado', () => {
    const detallado = { emisor: { ruc: '20601212537' } }
    const { extraccion } = normalizeExtraccionOcr({
      montoTotal: 80,
      comprobanteDetallado: detallado,
    })
    expect(extraccion.comprobanteDetallado).toEqual(detallado)
  })

  it('tolera una extracción sin objeto detallado', () => {
    const { extraccion, camposRecuperados } = normalizeExtraccionOcr({
      rucEmisor: '20601212537',
    })
    expect(extraccion.rucEmisor).toBe('20601212537')
    expect(camposRecuperados).toEqual([])
  })
})
