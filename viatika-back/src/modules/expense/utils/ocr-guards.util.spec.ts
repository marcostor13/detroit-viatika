import {
  findImporteEnLetras,
  isValidRucModulo11,
  parseImporteEnLetras,
  parseNumeroEnLetras,
  runOcrGuards,
} from './ocr-guards.util'

describe('isValidRucModulo11', () => {
  it('acepta los RUC reales de la factura del Hotel Bolognesi', () => {
    expect(isValidRucModulo11('20601212537')).toBe(true) // emisor
    expect(isValidRucModulo11('20606142499')).toBe(true) // receptor (Detroit)
    expect(isValidRucModulo11('10483678296')).toBe(true) // RUC de persona natural
  })

  it('rechaza un dígito mal leído', () => {
    expect(isValidRucModulo11('20601212538')).toBe(false)
    expect(isValidRucModulo11('20601212437')).toBe(false)
  })

  it('rechaza longitudes distintas de 11', () => {
    expect(isValidRucModulo11('2060121253')).toBe(false)
    expect(isValidRucModulo11('')).toBe(false)
    expect(isValidRucModulo11(null)).toBe(false)
  })

  it('ignora separadores', () => {
    expect(isValidRucModulo11('20601 21 2537')).toBe(true)
  })
})

describe('parseNumeroEnLetras', () => {
  it('lee unidades, decenas y centenas', () => {
    expect(parseNumeroEnLetras('ochenta')).toBe(80)
    expect(parseNumeroEnLetras('ciento veinte')).toBe(120)
    expect(parseNumeroEnLetras('treinta y cuatro')).toBe(34)
    expect(parseNumeroEnLetras('quinientos')).toBe(500)
  })

  it('lee miles y millones', () => {
    expect(parseNumeroEnLetras('mil')).toBe(1000)
    expect(parseNumeroEnLetras('mil doscientos treinta y cuatro')).toBe(1234)
    expect(parseNumeroEnLetras('un millon quinientos mil')).toBe(1_500_000)
    expect(parseNumeroEnLetras('dos mil veinticinco')).toBe(2025)
  })

  it('tolera tildes y mayúsculas', () => {
    expect(parseNumeroEnLetras('DIECISÉIS')).toBe(16)
    expect(parseNumeroEnLetras('UN MILLÓN')).toBe(1_000_000)
  })

  it('devuelve null si no reconoce nada', () => {
    expect(parseNumeroEnLetras('soles americanos')).toBeNull()
    expect(parseNumeroEnLetras('')).toBeNull()
  })
})

describe('parseImporteEnLetras', () => {
  it('lee la leyenda de la factura real', () => {
    expect(parseImporteEnLetras('SON: OCHENTA CON 00/100 SOLES')).toBe(80)
  })

  it('lee céntimos de la fracción', () => {
    expect(
      parseImporteEnLetras(
        'SON MIL DOSCIENTOS TREINTA Y CUATRO CON 50/100 SOLES'
      )
    ).toBe(1234.5)
    expect(parseImporteEnLetras('SON: CIEN Y 05/100 SOLES')).toBe(100.05)
  })

  it('lee céntimos escritos en palabras', () => {
    expect(
      parseImporteEnLetras('SON: CIENTO VEINTE CON CINCUENTA CENTIMOS')
    ).toBe(120.5)
  })

  it('devuelve null sin leyenda utilizable', () => {
    expect(parseImporteEnLetras('')).toBeNull()
    expect(parseImporteEnLetras(null)).toBeNull()
    expect(parseImporteEnLetras('VENTA INTERNA')).toBeNull()
  })
})

describe('findImporteEnLetras', () => {
  it('encuentra la leyenda dentro del comprobante detallado', () => {
    expect(
      findImporteEnLetras({
        comprobanteDetallado: {
          leyendas: 'SON: OCHENTA CON 00/100 SOLES',
        },
      })
    ).toBe('SON: OCHENTA CON 00/100 SOLES')
  })

  it('la encuentra aunque el modelo la deje en observaciones', () => {
    expect(
      findImporteEnLetras({
        comprobanteDetallado: {
          observaciones: 'VENTA INTERNA - SON CIEN CON 00/100 SOLES',
        },
      })
    ).toContain('CIEN')
  })

  it('devuelve null si no hay leyenda', () => {
    expect(findImporteEnLetras({ rucEmisor: '20601212537' })).toBeNull()
  })
})

describe('runOcrGuards', () => {
  const facturaOk = {
    rucEmisor: '20601212537',
    serie: 'F001',
    correlativo: '00004468',
    fechaEmision: '28-06-2026',
    montoTotal: 80,
    baseAfecta: 72.4,
    igv: 7.6,
    tasaIgv: 10.5,
    comprobanteDetallado: {
      leyendas: 'SON: OCHENTA CON 00/100 SOLES',
      totales: {
        operacionGravada: 72.4,
        operacionExonerada: 0,
        operacionInafecta: 0,
        igv: 7.6,
        tasaIgv: 10.5,
        importeTotal: 80,
      },
    },
  }
  const hoy = new Date('2026-08-13T00:00:00Z')

  it('no observa nada en la factura leída correctamente', () => {
    const result = runOcrGuards(facturaOk, { hoy })
    expect(result.issues).toEqual([])
    expect(result.hasErrors).toBe(false)
    expect(result.requiereRevision).toBe(false)
  })

  it('detecta los campos que el OCR dejó vacíos', () => {
    const result = runOcrGuards(
      { comentario: 'Servicio de hospedaje' },
      { hoy }
    )
    const codes = result.issues.map(i => i.code)
    expect(codes).toContain('campo_faltante')
    expect(codes).toContain('total_faltante')
    expect(result.requiereRevision).toBe(true)
  })

  it('detecta un dígito mal leído en el RUC', () => {
    const result = runOcrGuards(
      { ...facturaOk, rucEmisor: '20601212538' },
      { hoy }
    )
    expect(result.issues.map(i => i.code)).toContain('ruc_digito_verificador')
    expect(result.hasErrors).toBe(true)
  })

  it('detecta el emisor confundido con el receptor', () => {
    const result = runOcrGuards(
      { ...facturaOk, rucEmisor: '20606142499' },
      { hoy, rucEmpresa: '20606142499' }
    )
    expect(result.issues.map(i => i.code)).toContain('ruc_emisor_es_receptor')
  })

  it('detecta un comprobante emitido a otra empresa', () => {
    const result = runOcrGuards(
      {
        ...facturaOk,
        rucReceptor: '20608417061',
        razonSocialReceptor: 'TECNOLOGIA DIGITAL DATA S.A.C.',
      },
      { hoy, rucEmpresa: '20606142499' }
    )
    const aviso = result.issues.find(i => i.code === 'receptor_no_es_la_empresa')
    expect(aviso).toBeDefined()
    expect(aviso?.message).toContain('TECNOLOGIA DIGITAL DATA')
    expect(aviso?.severity).toBe('warn')
  })

  it('acepta el comprobante emitido a la propia empresa', () => {
    const result = runOcrGuards(
      { ...facturaOk, rucReceptor: '20606142499' },
      { hoy, rucEmpresa: '20606142499' }
    )
    expect(result.issues.map(i => i.code)).not.toContain(
      'receptor_no_es_la_empresa'
    )
  })

  it('no observa nada si el comprobante no identifica al cliente', () => {
    const result = runOcrGuards(facturaOk, { hoy, rucEmpresa: '20606142499' })
    expect(result.issues.map(i => i.code)).not.toContain(
      'receptor_no_es_la_empresa'
    )
  })

  it('detecta un total que no coincide con el importe en letras', () => {
    const result = runOcrGuards({ ...facturaOk, montoTotal: 8 }, { hoy })
    expect(result.issues.map(i => i.code)).toContain(
      'total_no_coincide_con_letras'
    )
  })

  /**
   * Es exactamente lo que devuelve `pdftotext -layout` sobre esta factura:
   * la columna de importes se desplaza y 72.40 termina en Op. Exonerada,
   * 80.00 en Op. Inafecta, y Gravada / IGV / Total quedan vacíos.
   */
  it('detecta la lectura desplazada de la columna de importes', () => {
    const result = runOcrGuards(
      {
        ...facturaOk,
        comprobanteDetallado: {
          ...facturaOk.comprobanteDetallado,
          totales: {
            operacionGravada: 0,
            operacionExonerada: 72.4,
            operacionInafecta: 80,
            igv: 0,
            importeTotal: 80,
          },
        },
      },
      { hoy }
    )
    expect(result.issues.map(i => i.code)).toContain('suma_incoherente')
  })

  it('detecta un IGV que no corresponde a la tasa', () => {
    // Error típico: el modelo asume la tasa general de 18% aunque el documento
    // diga 10.5%, y la deja junto al IGV real de 7.60 sobre una base de 72.40.
    const result = runOcrGuards({ ...facturaOk, tasaIgv: 18 }, { hoy })
    expect(result.issues.map(i => i.code)).toContain('igv_incoherente')
  })

  it('acepta el IGV de 10.5% del hospedaje sin observarlo', () => {
    const result = runOcrGuards(facturaOk, { hoy })
    expect(result.issues.map(i => i.code)).not.toContain('igv_incoherente')
  })

  it('acepta una factura exonerada con IGV en 0', () => {
    const result = runOcrGuards(
      {
        rucEmisor: '10483678296',
        serie: 'FF01',
        correlativo: '0000102',
        fechaEmision: '01-06-2026',
        montoTotal: 90,
        baseAfecta: 0,
        igv: 0,
        tasaIgv: 0,
        comprobanteDetallado: {
          totales: {
            operacionGravada: 0,
            operacionExonerada: 90,
            operacionInafecta: 0,
            igv: 0,
            importeTotal: 90,
          },
        },
      },
      { hoy }
    )
    expect(result.issues).toEqual([])
  })

  it('observa una fecha futura y una demasiado antigua', () => {
    expect(
      runOcrGuards(
        { ...facturaOk, fechaEmision: '01-01-2030' },
        { hoy }
      ).issues.map(i => i.code)
    ).toContain('fecha_futura')
    expect(
      runOcrGuards(
        { ...facturaOk, fechaEmision: '01-01-2015' },
        { hoy }
      ).issues.map(i => i.code)
    ).toContain('fecha_antigua')
  })

  it('observa una serie con formato inesperado', () => {
    const result = runOcrGuards({ ...facturaOk, serie: 'FACTURA' }, { hoy })
    expect(result.issues.map(i => i.code)).toContain('serie_formato')
  })
})
