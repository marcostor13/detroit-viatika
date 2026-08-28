import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildDetailLine,
  buildHeaderLine,
  buildBbvaTxt,
  toLatin1Buffer,
  padRight,
  padLeftZeros,
  solesToCents,
  normalizeName,
  namesMatch,
  parseBbvaPdfText,
  readBbvaPdfText,
  mergeBbvaReadings,
  clasificarSituacion,
  splitDocAndAmount,
  isSuccessfulSituacion,
  toBbvaAccount20,
  resolveBbvaAccount,
  describeBbvaAccountProblem,
  sanitizeBeneficiaryName,
  sanitizeBankText,
  sanitizeEmail,
  sanitizeDocNumber,
  sanitizeLatin1,
  BbvaDetailRecord,
} from './bbva-format'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse')

/**
 * El archivo real entregado por el cliente (BBVA – Pagos Masivos). Se lee en
 * Latin-1 para comparar carácter a carácter (Ñ/tildes = 1 byte).
 */
const FIXTURE = readFileSync(
  join(__dirname, '__fixtures__', 'BBVAREND.txt'),
  'latin1'
)
const FIXTURE_LINES = FIXTURE.split(/\r?\n/).filter((l) => l.length > 0)
const HEADER = FIXTURE_LINES[0]
const DETAILS = FIXTURE_LINES.slice(1)

describe('bbva-format · helpers', () => {
  it('padRight recorta y rellena con espacios a la derecha', () => {
    expect(padRight('ABC', 5)).toBe('ABC  ')
    expect(padRight('ABCDEF', 3)).toBe('ABC')
  })

  it('padLeftZeros rellena con ceros a la izquierda y solo deja dígitos', () => {
    expect(padLeftZeros('304', 6)).toBe('000304')
    expect(padLeftZeros('L75162447', 12)).toBe('000075162447')
  })

  it('solesToCents evita errores de coma flotante', () => {
    expect(solesToCents(304)).toBe(30400)
    expect(solesToCents(103.26)).toBe(10326)
    expect(solesToCents(0.1 + 0.2)).toBe(30)
  })
})

describe('bbva-format · líneas de detalle (byte-exactas vs archivo real)', () => {
  it('todas las líneas del fixture miden 277 y la cabecera 151', () => {
    expect(HEADER.length).toBe(151)
    for (const d of DETAILS) expect(d.length).toBe(277)
    expect(DETAILS.length).toBe(18)
  })

  it('reconstruye byte a byte la 1ª línea (RENDICIÓN DE VIÁTICOS, cuenta I)', () => {
    const rec: BbvaDetailRecord = {
      documentType: 'L',
      documentNumber: '75162447',
      accountType: 'I',
      accountNumber: '00257011449545903106',
      beneficiaryName: 'RAUL CUBA CRUZ',
      amountCents: 30400,
      concepto: 'RENDICIÓN DE VIÁTICOS',
      email: 'NOTIFICACIONESDEPAGO@DETROIT.PE',
    }
    expect(buildDetailLine(rec)).toBe(DETAILS[0])
  })

  it('reconstruye byte a byte una línea con Ñ y cuenta P (REEMBOLSO)', () => {
    // Línea 4 del fixture: ASTRID SELENE ESTACIO PEÑA, cuenta P, REPOSICIÓN...
    const rec: BbvaDetailRecord = {
      documentType: 'L',
      documentNumber: '09831083',
      accountType: 'P',
      accountNumber: '00110057000267030775',
      beneficiaryName: 'ASTRID SELENE ESTACIO PEÑA',
      amountCents: 24980,
      concepto: 'REPOSICIÓN DE CAJA CHICA',
      email: 'YCQPE@DETROIT.PE',
    }
    expect(buildDetailLine(rec)).toBe(DETAILS[3])
  })

  it('reconstruye byte a byte una línea SOLICITUD DE FONDOS', () => {
    // Línea 12 del fixture: ANIBAL ROSALES COLCHADO — SOLICITUD DE FONDOS.
    const rec: BbvaDetailRecord = {
      documentType: 'L',
      documentNumber: '46353590',
      accountType: 'I',
      accountNumber: '00352301317749541182',
      beneficiaryName: 'ANIBAL  ROSALES COLCHADO',
      amountCents: 100000,
      concepto: 'SOLICITUD DE FONDOS',
      email: 'ARCPE@DETROIT.PE',
    }
    // El nombre trae doble espacio en el archivo real; sanitizeLatin1 lo colapsa,
    // así que comparamos el prefijo estable (doc + cuenta + importe + glosa).
    const built = buildDetailLine(rec)
    expect(built.length).toBe(277)
    expect(built.slice(0, 37)).toBe(DETAILS[11].slice(0, 37)) // doc + cuenta
    expect(built.slice(77, 146)).toBe(DETAILS[11].slice(77, 146)) // importe + glosas
  })
})

describe('bbva-format · cabecera y archivo completo', () => {
  it('reconstruye byte a byte la cabecera del archivo real', () => {
    const header = buildHeaderLine({
      chargeAccount: '000110380350100056833',
      currency: 'PEN',
      description: 'PROVEEDORES SOL 02 JUNIO',
      recordCount: 18,
      totalCents: 906036,
    })
    expect(header).toBe(HEADER)
  })

  it('el total de la cabecera coincide con la suma de los abonos (S/ 9,060.36)', () => {
    const sum = DETAILS.reduce((s, d) => s + Number(d.slice(77, 92)), 0)
    expect(sum).toBe(906036)
  })

  it('buildBbvaTxt calcula total/conteo y usa CRLF', () => {
    const recs: BbvaDetailRecord[] = [
      {
        documentType: 'L',
        documentNumber: '75162447',
        accountType: 'I',
        accountNumber: '00257011449545903106',
        beneficiaryName: 'RAUL CUBA CRUZ',
        amountCents: 30400,
        concepto: 'RENDICIÓN DE VIÁTICOS',
        email: 'NOTIFICACIONESDEPAGO@DETROIT.PE',
      },
    ]
    const txt = buildBbvaTxt(recs, {
      chargeAccount: '000110380350100056833',
      description: 'PROVEEDORES SOL 02 JUNIO',
    })
    expect(txt.includes('\r\n')).toBe(true)
    const lines = txt.split('\r\n').filter((l) => l.length)
    expect(lines[0].slice(26, 41)).toBe(padLeftZeros('30400', 15))
    expect(lines[0].slice(76, 82)).toBe('000001')
  })

  it('no agrega salto de línea final (el archivo real termina en el último detalle)', () => {
    // El fixture aceptado por el banco no trae CRLF de cierre; un salto final
    // deja una línea vacía que el validador puede leer como registro malformado.
    expect(FIXTURE.endsWith('\r\n')).toBe(false)

    const txt = buildBbvaTxt(
      [
        {
          documentType: 'L',
          documentNumber: '75162447',
          accountType: 'I',
          accountNumber: '00257011449545903106',
          beneficiaryName: 'RAUL CUBA CRUZ',
          amountCents: 30400,
          concepto: 'RENDICIÓN DE VIÁTICOS',
          email: 'NOTIFICACIONESDEPAGO@DETROIT.PE',
        },
      ],
      { chargeAccount: '000110380350100056833', description: 'PROVEEDORES SOL 02 JUNIO' }
    )
    expect(txt.endsWith('\r\n')).toBe(false)
    expect(txt.split('\r\n')).toHaveLength(2) // cabecera + 1 detalle, sin línea vacía
  })

  it('el flag E de correo (pos 147) está presente en las 18 líneas del archivo aceptado', () => {
    // El archivo rechazado por el banco el 13-ago traía 3 registros con este
    // flag en blanco por usuarios sin correo registrado.
    for (const d of DETAILS) expect(d.slice(146, 147)).toBe('E')
  })

  it('el Buffer Latin-1 codifica Ñ como 0xD1 (no UTF-8)', () => {
    const line = buildDetailLine({
      documentType: 'L',
      documentNumber: '06973600',
      accountType: 'I',
      accountNumber: '00219110035563002151',
      beneficiaryName: 'FIDEL TUESTA SALDAÑA',
      amountCents: 17100,
      concepto: 'REEMBOLSO',
      email: 'FTSPE@DETROIT.PE',
    })
    const buf = toLatin1Buffer(line)
    expect(buf.length).toBe(277) // 1 byte por char (no UTF-8 multibyte)
    expect(buf.includes(0xd1)).toBe(true) // Ñ
  })
})

describe('bbva-format · conciliación', () => {
  it('normalizeName corrige la Ñ corrupta del PDF', () => {
    expect(normalizeName('SALDAµA')).toBe('SALDANA')
    expect(normalizeName('PE#A')).toBe('PENA')
    expect(normalizeName('Saldaña')).toBe('SALDANA')
  })

  it('namesMatch tolera orden y tildes', () => {
    expect(namesMatch('CUBA CRUZ RAUL', 'RAUL CUBA CRUZ')).toBe(true)
    expect(namesMatch('FIDEL TUESTA SALDAÑA', 'FIDEL TUESTA SALDAµA')).toBe(true)
    expect(namesMatch('RAUL CUBA', 'PEDRO GOMEZ')).toBe(false)
  })

  it('isSuccessfulSituacion reconoce estados de abono OK', () => {
    expect(isSuccessfulSituacion('ABONO ENVIADO')).toBe(true)
    expect(isSuccessfulSituacion('ABONO CORRECTO')).toBe(true)
    expect(isSuccessfulSituacion('ABONO RECHAZADO')).toBe(false)
  })

  it('parseBbvaPdfText extrae filas de un texto tipo PDF (espaciado)', () => {
    const text = [
      'Consulta de Pagos Masivos',
      'No. Movimiento de Cargo 000025041   Fecha y Hora de Ejecución 02/06/2026 10:15',
      'Titular (Archivo) Doc. Identidad Importe Situación',
      'RAUL CUBA CRUZ L - 75162447 304.00 ABONO ENVIADO',
      'FIDEL TUESTA SALDAµA L - 06973600 171.00 ABONO CORRECTO',
    ].join('\n')
    const parsed = parseBbvaPdfText(text)
    expect(parsed.operationNumber).toBe('000025041')
    expect(parsed.rows.length).toBe(2)
    expect(parsed.rows[0].documentNumber).toBe('75162447')
    expect(parsed.rows[0].amount).toBe(304)
    expect(parsed.rows[0].success).toBe(true)
    expect(parsed.rows[1].documentNumber).toBe('06973600')
    expect(parsed.rows[1].amount).toBe(171)
  })

  it('acota la situación al abono actual (no roba la de la fila siguiente)', () => {
    const text = [
      'IVAN VASQUEZ    L - 73736667    80.00    ABONO ENVIADO',
      'IVAN VASQUEZ    L - 73736667    40.00    ABONO RECHAZADO',
      'PEDRO GOMEZ    L - 99999999    500.00    ABONO ENVIADO',
    ].join('\n')
    const { rows } = parseBbvaPdfText(text)
    expect(rows.length).toBe(3)
    expect(rows[0]).toMatchObject({ documentNumber: '73736667', amount: 80, success: true })
    expect(rows[1]).toMatchObject({ documentNumber: '73736667', amount: 40, success: false })
    expect(rows[2]).toMatchObject({ documentNumber: '99999999', amount: 500, success: true })
  })
})

describe('bbva-format · splitDocAndAmount (documento+importe pegados)', () => {
  it('separa el DNI (8) del importe cuando vienen pegados', () => {
    expect(splitDocAndAmount('L', '75162447304.00')).toEqual({
      documentNumber: '75162447',
      amount: 304,
    })
  })

  it('maneja importes con separador de miles pegados', () => {
    expect(splitDocAndAmount('L', '100170561,154.00')).toEqual({
      documentNumber: '10017056',
      amount: 1154,
    })
    expect(splitDocAndAmount('L', '412066122,008.60')).toEqual({
      documentNumber: '41206612',
      amount: 2008.6,
    })
  })

  it('desambigua importes pequeños con DNI de 8 (no toma dígitos de más)', () => {
    // Bloque real del PDF: DNI 70279911 (8) + importe 18.40.
    expect(splitDocAndAmount('L', '7027991118.40')).toEqual({
      documentNumber: '70279911',
      amount: 18.4,
    })
  })

  it('maneja el caso espaciado', () => {
    expect(splitDocAndAmount('L', '75162447 304.00')).toEqual({
      documentNumber: '75162447',
      amount: 304,
    })
  })

  it('separa el RUC (11) del importe', () => {
    expect(splitDocAndAmount('R', '20123456789150.00')).toEqual({
      documentNumber: '20123456789',
      amount: 150,
    })
  })
})

describe('bbva-format · conciliación del PDF REAL de BBVA (fixture)', () => {
  it('lee los 18 abonos del PDF real y suman S/ 9,060.36', async () => {
    const bytes = readFileSync(
      join(__dirname, '__fixtures__', 'consulta-pagos-masivos.pdf')
    )
    const parsed = pdfParse ? await pdfParse(bytes) : { text: '' }
    const result = parseBbvaPdfText(parsed.text)

    expect(result.operationNumber).toBe('000025041')
    expect(result.rows.length).toBe(18)
    const sum = result.rows.reduce((s, r) => s + r.amount, 0)
    expect(Math.round(sum * 100)).toBe(906036) // S/ 9,060.36
    expect(result.rows.every((r) => r.success)).toBe(true)

    // Spot-checks: DNI + importe de abonos concretos (incluye repetidos).
    const raul = result.rows.find((r) => r.documentNumber === '75162447')
    expect(raul?.amount).toBe(304)
    const repetidos = result.rows.filter((r) => r.documentNumber === '74973421')
    expect(repetidos.map((r) => r.amount).sort((a, b) => a - b)).toEqual([98.6, 1000])
  })
})

describe('bbva-format - moneda de la planilla', () => {
  const record = {
    documentType: 'L' as const,
    documentNumber: '45678912',
    accountType: 'I' as const,
    accountNumber: '00212345678901234567',
    beneficiaryName: 'IVAN TORRES',
    amountCents: 15000,
    concepto: 'SOLICITUD DE FONDOS',
    email: 'colaborador@detroit.pe',
  }
  const meta = {
    chargeAccount: '00011231245784512369',
    description: 'PROVEEDORES',
  }

  const lineas = (txt: string) => txt.split(/\r\n/).filter(Boolean)
  /** La moneda ocupa las posiciones 24-26 de la cabecera (3 chars). */
  const monedaDeCabecera = (txt: string) => lineas(txt)[0].slice(23, 26)

  it('escribe la moneda declarada en la cabecera', () => {
    expect(
      monedaDeCabecera(buildBbvaTxt([record], { ...meta, currency: 'USD' }))
    ).toBe('USD')
    expect(
      monedaDeCabecera(buildBbvaTxt([record], { ...meta, currency: 'PEN' }))
    ).toBe('PEN')
  })

  it('asume soles cuando no se declara moneda', () => {
    expect(monedaDeCabecera(buildBbvaTxt([record], meta))).toBe('PEN')
  })

  it('el importe no cambia con la moneda: son centimos de la moneda declarada', () => {
    const pen = lineas(buildBbvaTxt([record], { ...meta, currency: 'PEN' }))
    const usd = lineas(buildBbvaTxt([record], { ...meta, currency: 'USD' }))
    // Mismo total (pos 27-41) y misma linea de detalle: solo cambia la moneda.
    expect(pen[0].slice(26, 41)).toBe(usd[0].slice(26, 41))
    expect(pen[1]).toBe(usd[1])
  })

  it('mantiene los anchos fijos con cualquier moneda', () => {
    const l = lineas(buildBbvaTxt([record], { ...meta, currency: 'USD' }))
    expect(l[0]).toHaveLength(151)
    expect(l[1]).toHaveLength(277)
  })
})

describe('toBbvaAccount20 / resolveBbvaAccount', () => {
  /**
   * Pares (N° de cuenta de 18 del Excel del cliente → valor de 20 que BBVA
   * aceptó en BBVAPROVREND.txt / BBVAREND (4).txt, posiciones 18-37 de las filas
   * de tipo `P`). Es la evidencia de que los dos dígitos extra son relleno del
   * bloque de cuenta y no dígitos de control.
   */
  const PARES_REALES: Array<[string, string]> = [
    ['001103320200289116', '00110332000200289116'],
    ['001105790248649754', '00110579000248649754'],
    ['001100570267030775', '00110057000267030775'],
    ['001108140286352494', '00110814000286352494'],
    ['001106090200035160', '00110609000200035160'],
    ['001105790233457859', '00110579000233457859'],
    ['001103830200354064', '00110383000200354064'],
    ['001105790236981516', '00110579000236981516'],
    ['001105790219133986', '00110579000219133986'],
    ['001105790219629663', '00110579000219629663'],
  ]

  it.each(PARES_REALES)(
    'deriva la cuenta de 20 que el banco aceptó desde el N° de cuenta BBVA (%s)',
    (cuenta18, esperado20) => {
      expect(toBbvaAccount20(cuenta18)).toBe(esperado20)
    }
  )

  it('devuelve tal cual una cuenta que ya tiene 20 dígitos', () => {
    expect(toBbvaAccount20('00219110035563002151')).toBe('00219110035563002151')
  })

  it('ignora guiones y espacios del formato que muestra el banco', () => {
    expect(toBbvaAccount20('0011-0332-0200289116')).toBe('00110332000200289116')
  })

  it('NO completa una cuenta de 18 dígitos de otro banco', () => {
    // Rellenar con ceros aquí produciría una cuenta ajena existente: abono a la
    // persona equivocada. Sin CCI no hay forma de armarla.
    expect(toBbvaAccount20('002193113408062095')).toBeNull()
  })

  it('rechaza longitudes que no son ni 18 (BBVA) ni 20', () => {
    expect(toBbvaAccount20('123')).toBeNull()
    expect(toBbvaAccount20('0011033202002891')).toBeNull() // 16
    expect(toBbvaAccount20('')).toBeNull()
    expect(toBbvaAccount20(undefined)).toBeNull()
  })

  it('prefiere el CCI y cae al N° de cuenta solo si el CCI no sirve', () => {
    expect(
      resolveBbvaAccount({ cci: '00219110035563002151', accountNumber: '001103320200289116' })
    ).toEqual({ account20: '00219110035563002151', source: 'cci' })

    expect(resolveBbvaAccount({ cci: '', accountNumber: '001103320200289116' })).toEqual({
      account20: '00110332000200289116',
      source: 'accountNumber',
    })

    expect(resolveBbvaAccount({ cci: '123', accountNumber: '456' })).toBeNull()
  })
})

describe('toBbvaAccount20 · carga duplicada del N° de cuenta en el campo CCI', () => {
  // Escenario real: usuarios a los que se les cargó el mismo número en ambos
  // campos. Copiado tal cual funciona; "ajustado" a 20 con ceros, no.
  it('acepta el número copiado tal cual en ambos campos (BBVA de 18)', () => {
    expect(resolveBbvaAccount({
      cci: '001103320200289116',
      accountNumber: '001103320200289116',
    })).toEqual({ account20: '00110332000200289116', source: 'cci' })
  })

  it('RECHAZA una cuenta de 18 rellenada con ceros a la izquierda hasta 20', () => {
    // 00 + 001103320200289116. Empieza en 000: no existe banco 000, y el tipo de
    // cuenta se resolvería como interbancaria hacia una cuenta inexistente.
    expect(toBbvaAccount20('00001103320200289116')).toBeNull()
    expect(describeBbvaAccountProblem('00001103320200289116')).toMatch(/izquierda/)
  })

  it('RECHAZA una cuenta de 18 rellenada con ceros a la derecha hasta 20', () => {
    // 001103320200289116 + 00. Empieza en 0011 pero los dígitos quedan corridos:
    // sería un abono a otra cuenta BBVA existente.
    expect(toBbvaAccount20('00110332020028911600')).toBeNull()
    expect(describeBbvaAccountProblem('00110332020028911600')).toMatch(/corridos/)
  })

  it('sigue aceptando la cuenta BBVA legítima de 20 dígitos', () => {
    // Único caso del Excel del cliente con BBVA y 20 dígitos.
    expect(toBbvaAccount20('00110312000200486451')).toBe('00110312000200486451')
  })

  it('el relleno inválido no se rescata por el otro campo si ambos están mal', () => {
    expect(resolveBbvaAccount({
      cci: '00001103320200289116',
      accountNumber: '00110332020028911600',
    })).toBeNull()
  })
})

/**
 * Regresión del rechazo real del 18-ago-2026: BBVA Net Cash devolvió
 * `Valor no permitido para campo nombre; localizado en la fila N, columna 38`
 * para las 3 filas del archivo, que eran justo las 3 con coma en el nombre
 * (`APELLIDOS, NOMBRES`, tal como se cargaron desde el Excel de personal).
 * El cliente quitó las comas a mano y el mismo archivo pasó sin errores.
 */
describe('bbva-format · nombre del beneficiario (pos 38-77)', () => {
  const base: BbvaDetailRecord = {
    documentType: 'L',
    documentNumber: '44932276',
    accountType: 'I',
    accountNumber: '00336501324130900249',
    beneficiaryName: 'QUISPE GUTIERREZ,DIEGO ZOSIMO',
    amountCents: 567,
    concepto: 'REEMBOLSO',
    email: 'EDQGPE@DETROIT.PE',
  }
  const nombreDe = (linea: string) => linea.slice(37, 77)

  it('cambia la coma por espacio en vez de borrarla (sin pegar apellido y nombre)', () => {
    expect(sanitizeBeneficiaryName('QUISPE GUTIERREZ,DIEGO ZOSIMO')).toBe(
      'QUISPE GUTIERREZ DIEGO ZOSIMO'
    )
    expect(sanitizeBeneficiaryName('MORRIS FLORES,GUILLERMO JOSE')).toBe(
      'MORRIS FLORES GUILLERMO JOSE'
    )
  })

  it('no deja doble espacio cuando la coma ya venía seguida de espacio', () => {
    expect(sanitizeBeneficiaryName('PILLACA AZA, SERGIO MAURICIO')).toBe(
      'PILLACA AZA SERGIO MAURICIO'
    )
    // El Excel de personal trae dos espacios entre apellidos.
    expect(sanitizeBeneficiaryName('AGREDA  FLORES, ANDRE LEANDRO')).toBe(
      'AGREDA FLORES ANDRE LEANDRO'
    )
  })

  it('conserva Ñ y tildes (el archivo que el banco aceptó las trae)', () => {
    expect(sanitizeBeneficiaryName('Fidel Tuesta Saldaña')).toBe(
      'FIDEL TUESTA SALDAÑA'
    )
    expect(sanitizeBeneficiaryName('Astrid Selene Estacio Peña')).toBe(
      'ASTRID SELENE ESTACIO PEÑA'
    )
  })

  it('quita también el resto de puntuación que el campo no admite', () => {
    expect(sanitizeBeneficiaryName('DE LA CRUZ-OLIVOS, RUBEN (JR.)')).toBe(
      'DE LA CRUZ OLIVOS RUBEN JR'
    )
  })

  it('la línea de detalle sale sin coma y con los 40 caracteres del campo', () => {
    const nombre = nombreDe(buildDetailLine(base))
    expect(nombre).toBe('QUISPE GUTIERREZ DIEGO ZOSIMO           ')
    expect(nombre).toHaveLength(40)
    expect(nombre).not.toContain(',')
  })

  it('ningún carácter no permitido en el campo nombre de las 3 filas rechazadas', () => {
    const rechazadas = [
      'MORRIS FLORES,GUILLERMO JOSE',
      'QUISPE GUTIERREZ,DIEGO ZOSIMO',
      'PILLACA AZA, SERGIO MAURICIO',
    ]
    for (const beneficiaryName of rechazadas) {
      const nombre = nombreDe(buildDetailLine({ ...base, beneficiaryName }))
      expect(nombre).toMatch(/^[A-Z0-9\xC0-\xD6\xD8-\xF6\xF8-\xFF ]{40}$/)
    }
  })

  it('el archivo aceptado se sigue reconstruyendo byte a byte', () => {
    // Ningún nombre del archivo aceptado tiene puntuación, así que la regla
    // nueva tiene que ser un no-op sobre todos ellos: lo que el banco ya dio
    // por bueno no puede cambiar de bytes.
    for (const linea of DETAILS) {
      const nombre = linea.slice(37, 77)
      expect(sanitizeBeneficiaryName(nombre)).toBe(sanitizeLatin1(nombre))
    }
  })
})

/**
 * El rechazo del 18-ago llegó por el nombre, pero la coma podía entrar por
 * cualquier campo de texto. Estos tests fijan la regla de cada uno.
 */
describe('bbva-format · saneo del resto de campos', () => {
  const base: BbvaDetailRecord = {
    documentType: 'L',
    documentNumber: '44932276',
    accountType: 'I',
    accountNumber: '00336501324130900249',
    beneficiaryName: 'QUISPE GUTIERREZ DIEGO ZOSIMO',
    amountCents: 5670,
    concepto: 'REEMBOLSO',
    email: 'EDQGPE@DETROIT.PE',
  }

  it('la glosa pierde la puntuación y la corta se deriva de la ya saneada', () => {
    const linea = buildDetailLine({
      ...base,
      concepto: 'RENDICIÓN DE VIÁTICOS, AGOSTO',
    })
    expect(linea.slice(93, 105)).toBe('RENDICIÓN DE') // pos 94-105, glosa corta
    expect(linea.slice(106, 146)).toBe(
      'RENDICIÓN DE VIÁTICOS AGOSTO            ' // pos 107-146, glosa larga
    )
    expect(linea).toHaveLength(277)
  })

  it('el correo conserva @ y punto, que es lo que el archivo aceptado trae', () => {
    expect(sanitizeEmail('edqgpe@detroit.pe')).toBe('EDQGPE@DETROIT.PE')
    expect(sanitizeEmail('nombre.apellido+aviso@detroit.pe')).toBe(
      'NOMBRE.APELLIDO+AVISO@DETROIT.PE'
    )
  })

  it('el correo se limpia BORRANDO, no sustituyendo por espacio', () => {
    // Un espacio dentro del correo lo parte en dos y el aviso no llega.
    expect(sanitizeEmail(' edqgpe@detroit.pe , ')).toBe('EDQGPE@DETROIT.PE')
  })

  it('el N° de documento se queda solo con letras y dígitos', () => {
    expect(sanitizeDocNumber('44.932.276')).toBe('44932276')
    expect(sanitizeDocNumber('44932276 ')).toBe('44932276')
    // Pasaporte / carné de extranjería: las letras se conservan.
    expect(sanitizeDocNumber('pa-123456')).toBe('PA123456')
  })

  it('la descripción de la planilla también se sanea (cabecera pos 52-75)', () => {
    const header = buildHeaderLine({
      chargeAccount: '000110380350100056833',
      description: 'PROVEEDORES SOL, 18 AGOST',
      recordCount: 3,
      totalCents: 180470,
    })
    expect(header.slice(51, 75)).toBe('PROVEEDORES SOL 18 AGOST')
    expect(header).toHaveLength(151)
  })

  it('la moneda se normaliza a 3 letras mayúsculas', () => {
    const header = buildHeaderLine({
      chargeAccount: '000110380350100056833',
      currency: 'usd',
      description: 'PROVEEDORES USD',
      recordCount: 1,
      totalCents: 100,
    })
    expect(header.slice(23, 26)).toBe('USD')
  })

  it('una moneda que queda vacía revienta en vez de colarse como espacios', () => {
    expect(() =>
      buildHeaderLine({
        chargeAccount: '000110380350100056833',
        currency: '...',
        description: 'PROVEEDORES',
        recordCount: 1,
        totalCents: 100,
      })
    ).toThrow(/longitud inválida/)
  })

  it('un registro sucio de punta a punta sigue midiendo 277', () => {
    const linea = buildDetailLine({
      ...base,
      documentNumber: '44.932.276',
      beneficiaryName: 'QUISPE  GUTIERREZ, DIEGO (ZOSIMO)',
      concepto: 'REEMBOLSO, VARIOS',
      email: ' edqgpe@detroit.pe ',
    })
    expect(linea).toHaveLength(277)
    expect(linea.slice(4, 16)).toBe('44932276    ')
    expect(linea.slice(37, 77)).toBe('QUISPE GUTIERREZ DIEGO ZOSIMO           ')
    expect(linea.slice(106, 146)).toBe('REEMBOLSO VARIOS                        ')
    expect(linea.slice(147, 227)).toBe(padRight('EDQGPE@DETROIT.PE', 80))
  })
})

describe('bbva-format · PDF sin capa de texto, leído por OCR', () => {
  // Texto tal cual lo devuelve tesseract.js sobre el reporte reimprimido con
  // "Microsoft: Print To PDF" (incidente del 19/08/2026, orden 0818002). Ese PDF
  // dibuja las letras como trazos: pdf-parse devuelve 4 caracteres y el flujo
  // moría con "No se pudieron leer abonos del PDF".
  const ocr = readFileSync(
    join(__dirname, '__fixtures__', 'consulta-pagos-masivos-ocr.txt'),
    'utf8'
  )

  it('extrae los 3 abonos, el N° de operación y la fecha real del banco', () => {
    const parsed = parseBbvaPdfText(ocr)

    expect(parsed.operationNumber).toBe('000025714')
    expect(parsed.executedAt).toBe('18/08/2026 - 19:53:28')
    expect(parsed.rows.length).toBe(3)
    expect(parsed.rows.map(r => [r.documentNumber, r.amount])).toEqual([
      ['00506814', 1700],
      ['44932276', 56.7],
      ['71939725', 48],
    ])
    const suma = parsed.rows.reduce((s, r) => s + r.amount, 0)
    expect(Math.round(suma * 100)).toBe(180470) // S/ 1,804.70
  })

  it('da por abonadas las 3 filas pese a la columna "Situación" cortada', () => {
    const parsed = parseBbvaPdfText(ocr)

    // El PDF recorta la columna en el borde de la página: el OCR lee "ABONC" /
    // "ENVIAL" / "CORREC" en vez de "ABONO ENVIADO" / "ABONO CORRECTO". Con los
    // patrones completos las tres quedaban en success=false y no se conciliaba
    // ninguna; con los recortados se leen, y la cabecera lo confirma.
    expect(parsed.rows.every(r => r.success)).toBe(true)
    expect(parsed.declared).toEqual({
      procesados: 3,
      noProcesados: 0,
      importeAbonado: 1804.7,
    })
    expect(parsed.inconsistenteConCabecera).toBe(false)
  })

  it('rescata por cabecera cuando la situación es del todo ilegible', () => {
    // Peor caso: el OCR no deja ni un fragmento reconocible de la columna. La
    // cabecera sigue alcanzando para saber que las 3 se abonaron.
    const sinSituacion = ocr
      .replace(/ABONC/g, '')
      .replace(/ENVIA[LR]/g, '')
      .replace(/CORREC/g, '')
    const parsed = parseBbvaPdfText(sinSituacion)

    expect(parsed.rows.length).toBe(3)
    expect(parsed.rows.every(r => r.success)).toBe(true)
    expect(parsed.situacionResueltaPorCabecera).toBe(true)
  })

  it('NO deduce nada si la cabecera no cuadra con las filas leídas', () => {
    // Un importe cargado que no coincide con la suma significa que se leyó mal
    // alguna fila (o que faltan filas): el flujo debe caer a confirmación manual
    // en vez de dar por pagado a quien quizá no cobró.
    const adulterado = ocr.replace('1,804.70 - SOLES', '1,900.00 - SOLES')
    const parsed = parseBbvaPdfText(adulterado)

    expect(parsed.rows.length).toBe(3)
    expect(parsed.rows.every(r => !r.success)).toBe(true)
    expect(parsed.situacionResueltaPorCabecera).toBe(false)
    expect(parsed.inconsistenteConCabecera).toBe(true)
  })

  it('NO deduce nada si el banco declara abonos no procesados', () => {
    // Con al menos un abono fallido no hay forma de saber CUÁL falló leyendo una
    // columna ilegible, así que ninguna fila puede darse por buena.
    const conFallos = ocr.replace(
      'Abonos NO procesados 0',
      'Abonos NO procesados 1'
    )
    const parsed = parseBbvaPdfText(conFallos)

    expect(parsed.situacionResueltaPorCabecera).toBe(false)
    expect(parsed.rows.some(r => r.success)).toBe(false)
  })

  it('un fallo declarado en una fila nunca se reinterpreta por la cabecera', () => {
    // Situación legible y negativa en la primera fila: aunque los totales
    // cuadraran, esa fila manda y el resto no se auto-aprueba.
    const conRechazo = ocr.replace('1,700.00', '1,700.00 ABONO RECHAZADO')
    const parsed = parseBbvaPdfText(conRechazo)

    expect(parsed.rows[0].success).toBe(false)
    expect(parsed.situacionResueltaPorCabecera).toBe(false)
  })
})

describe('bbva-format · casos límite de la conciliación por OCR', () => {
  /** Cabecera del bloque "Después del proceso" con los totales declarados. */
  const cabecera = (procesados: number, noProcesados: number, importe: string) =>
    [
      'No. Movimiento de Cargo 000030001',
      'Fecha y Hora de Ejecución 20/08/2026 - 10:00:00',
      `Abonos procesados ${procesados}`,
      `Importe cargado por abonos ${importe} - SOLES`,
      `Abonos NO procesados ${noProcesados}`,
    ].join('\n')

  it('la página de condiciones de BBVA no inyecta filas falsas', () => {
    // El servicio hace OCR de TODAS las páginas y las concatena. La 2ª del
    // reporte real son las condiciones (tipos de documento "R : RUC / L : DNI",
    // horarios, "transferencias mayores a S/. 310,000"): texto con letras y
    // montos que podría colarse como abono.
    const dosPaginas = readFileSync(
      join(__dirname, '__fixtures__', 'consulta-pagos-masivos-ocr-2pag.txt'),
      'utf8'
    )
    const parsed = parseBbvaPdfText(dosPaginas)

    expect(parsed.rows.length).toBe(3)
    expect(parsed.rows.map(r => r.documentNumber)).toEqual([
      '00506814',
      '44932276',
      '71939725',
    ])
    expect(parsed.rows.every(r => r.success)).toBe(true)
  })

  it('con un abono rechazado y situación LEGIBLE, concilia solo los buenos', () => {
    const text = [
      cabecera(2, 1, '300.00'),
      'ANA TORRES     L - 11111111 100.00 ABONO ENVIADO',
      'LUIS PEREZ     L - 22222222  50.00 ABONO RECHAZADO',
      'ROSA DIAZ      L - 33333333 200.00 ABONO CORRECTO',
    ].join('\n')
    const p = parseBbvaPdfText(text)

    expect(p.rows.length).toBe(3)
    expect(p.rows.map(r => r.success)).toEqual([true, false, true])
    expect(p.inconsistenteConCabecera).toBe(false)
  })

  it('con un abono rechazado y situación ILEGIBLE, no paga a nadie', () => {
    // Peor combinación: el banco dejó uno sin procesar y la columna no se lee.
    // No hay forma de saber CUÁL falló, así que no puede pagarse ninguno.
    const text = [
      cabecera(2, 1, '300.00'),
      'ANA TORRES     L - 11111111 100.00',
      'LUIS PEREZ     L - 22222222  50.00',
      'ROSA DIAZ      L - 33333333 200.00',
    ].join('\n')
    const p = parseBbvaPdfText(text)

    expect(p.rows.length).toBe(3)
    expect(p.rows.some(r => r.success)).toBe(false)
    expect(p.inconsistenteConCabecera).toBe(true)
  })

  it('si se leyeron MENOS filas de las declaradas, falla cerrado', () => {
    // Planilla larga recortada por el tope de páginas del OCR.
    const text = [
      cabecera(3, 0, '600.00'),
      'ANA TORRES     L - 11111111 100.00 ABONO ENVIADO',
      'LUIS PEREZ     L - 22222222 200.00 ABONO ENVIADO',
    ].join('\n')
    const p = parseBbvaPdfText(text)

    expect(p.rows.length).toBe(2)
    expect(p.rows.some(r => r.success)).toBe(false)
    expect(p.inconsistenteConCabecera).toBe(true)
  })

  it('un "Enviados" suelto en el texto no basta para dar por pagado', () => {
    // Los patrones de situación van recortados por la columna cortada, así que
    // "ENVIA" casa con texto vecino. La cabecera es la que evita el falso pago.
    const text = [
      cabecera(1, 1, '100.00'),
      'ANA TORRES     L - 11111111 100.00 ABONO ENVIADO',
      'LUIS PEREZ     L - 22222222  50.00',
      'Total Abonos Enviados 1',
    ].join('\n')
    const p = parseBbvaPdfText(text)

    // La 2ª fila se leyó como exitosa por el "Enviados" del pie...
    // ...pero los totales no cuadran, así que no se paga ninguna.
    expect(p.rows.length).toBe(2)
    expect(p.rows.some(r => r.success)).toBe(false)
    expect(p.inconsistenteConCabecera).toBe(true)
  })

  it('sin cabecera legible se respeta lo leído fila por fila', () => {
    const text = [
      'ANA TORRES     L - 11111111 100.00 ABONO ENVIADO',
      'LUIS PEREZ     L - 22222222  50.00 ABONO RECHAZADO',
    ].join('\n')
    const p = parseBbvaPdfText(text)

    expect(p.declared).toBeUndefined()
    expect(p.rows.map(r => r.success)).toEqual([true, false])
    expect(p.inconsistenteConCabecera).toBe(false)
  })
})

describe('bbva-format · lectura de la columna "Situación"', () => {
  it('lee los recortes que deja la impresión del reporte', () => {
    // Lote 000025800: la impresión cortó la columna en el borde de la página y
    // "ABONO ENVIADO" quedó en "ABC" + "ENVI".
    expect(clasificarSituacion('\nGARCIA GARCIA ABC\nENVI\n')).toBe('ok')
    expect(clasificarSituacion('\nDEL PERU ENVI\n')).toBe('ok')
    expect(clasificarSituacion('\nCLAUDIA CLAUDIA CORR\n')).toBe('ok')
    // Lote 000025714: el mismo corte con otras letras mal leídas.
    expect(clasificarSituacion('\nABONC\nENVIAL\n')).toBe('ok')
    expect(clasificarSituacion('\nABONC\nCORREC\n')).toBe('ok')
    expect(clasificarSituacion(' ABONO ENVIADO\n')).toBe('ok')
  })

  it('lee el fallo, tanto entero como recortado', () => {
    expect(clasificarSituacion('\nMARIO\nERR/\n')).toBe('fallo')
    expect(clasificarSituacion(' ABONO RECHAZADO\n')).toBe('fallo')
    expect(clasificarSituacion(' ABONO NO PROCESADO\n')).toBe('fallo')
    expect(clasificarSituacion(' NO ABONADO\n')).toBe('fallo')
  })

  it('un fallo gana a un éxito dentro de la misma ventana', () => {
    expect(clasificarSituacion('\nABONO\nRECHAZADO\n')).toBe('fallo')
  })

  it('un apellido NO se confunde con una situación', () => {
    // Se compara por token completo justamente por esto: con substrings,
    // "CORREA" activaba "CORR" y daba por abonado a quien no cobró. Y "PEA"
    // (de PEÑA, que el PDF corrompe) casaba con PENDIENTE y lo daba por
    // rechazado, bloqueando además el rescate por cabecera de todo el reporte.
    expect(clasificarSituacion('\nESTACIO PEA\nASTRID SELENE\n')).toBe('ilegible')
    expect(clasificarSituacion('\nCORREA MENDOZA\n')).toBe('ilegible')
    expect(clasificarSituacion('\nARENAS LOZA\nCARLOS ALBERTO\n')).toBe('ilegible')
  })

  it('sin nada legible devuelve "ilegible", no "ok"', () => {
    expect(clasificarSituacion('\nDEL PERU\nJHORDY MAMANI\n')).toBe('ilegible')
    expect(clasificarSituacion('')).toBe('ilegible')
  })
})

describe('bbva-format · lote repartido en varias páginas (000025800)', () => {
  // OCR real de las dos páginas del reporte del lote 000025800: 26 abonos por
  // S/ 12,384.60, de los que el banco procesó 25 (S/ 12,082.60) y rechazó uno
  // (S/ 302.00, carné de extranjería E-0397043). La página 1 trae 25 filas y la
  // 2 la restante, porque el banco pagina la relación de abonos.
  const leer = (archivo: string) =>
    readBbvaPdfText(
      readFileSync(join(__dirname, '__fixtures__', archivo), 'utf8')
    )
  const pag1 = () => leer('lote-25800-ocr-pag1.txt')
  const pag2 = () => leer('lote-25800-ocr-pag2.txt')

  it('con la primera página sola NO se marca ningún pago', () => {
    // Faltan filas para cuadrar contra la cabecera: se falla cerrado. Es el
    // caso que llevó a que Tesorería viera "25 abonos no exitosos" cuando en
    // realidad el banco había pagado 25 de 26.
    const solo = parseBbvaPdfText(
      readFileSync(join(__dirname, '__fixtures__', 'lote-25800-ocr-pag1.txt'), 'utf8')
    )
    expect(solo.rows.length).toBe(25)
    expect(solo.rows.some(r => r.success)).toBe(false)
    expect(solo.inconsistenteConCabecera).toBe(true)
  })

  it('con las dos páginas concilia los 25 abonados y deja fuera el rechazado', () => {
    const { summary, conflicto } = mergeBbvaReadings([pag1(), pag2()])

    expect(conflicto).toBeUndefined()
    expect(summary.operationNumber).toBe('000025800')
    expect(summary.executedAt).toBe('27/08/2026 - 17:54:25')
    expect(summary.declared).toEqual({
      procesados: 25,
      noProcesados: 1,
      importeAbonado: 12082.6,
    })
    expect(summary.rows.length).toBe(26)
    expect(summary.inconsistenteConCabecera).toBe(false)

    const abonados = summary.rows.filter(r => r.success)
    expect(abonados.length).toBe(25)
    expect(
      Math.round(abonados.reduce((s, r) => s + r.amount, 0) * 100)
    ).toBe(1208260)

    const rechazados = summary.rows.filter(r => !r.success)
    expect(rechazados.map(r => [r.documentNumber, r.amount])).toEqual([
      ['0397043', 302],
    ])
  })

  it('no deduplica dos abonos iguales del mismo trabajador', () => {
    // El lote trae dos filas de S/266.00 al DNI 72233722 y son dos pagos
    // distintos: un dedupe por documento+importe se comería uno.
    const { summary } = mergeBbvaReadings([pag1(), pag2()])
    const repetidos = summary.rows.filter(
      r => r.documentNumber === '72233722' && r.amount === 266
    )
    expect(repetidos.length).toBe(2)
  })

  it('una página subida dos veces no marca nada', () => {
    // El guardián de la página repetida es el conteo contra la cabecera: 51
    // filas leídas contra 26 declaradas.
    const { summary } = mergeBbvaReadings([pag1(), pag1(), pag2()])
    expect(summary.rows.length).toBe(51)
    expect(summary.rows.some(r => r.success)).toBe(false)
    expect(summary.inconsistenteConCabecera).toBe(true)
  })

  it('rechaza fusionar PDF de órdenes distintas', () => {
    const otroLote = readBbvaPdfText(
      readFileSync(join(__dirname, '__fixtures__', 'lote-25800-ocr-pag2.txt'), 'utf8')
        .replace('000025800', '000025999')
    )
    const { conflicto, summary } = mergeBbvaReadings([pag1(), otroLote])
    expect(conflicto).toMatch(/órdenes distintas/i)
    expect(summary.rows).toEqual([])
  })

  it('rechaza fusionar PDF con totales de cabecera distintos', () => {
    const adulterado = readBbvaPdfText(
      readFileSync(join(__dirname, '__fixtures__', 'lote-25800-ocr-pag2.txt'), 'utf8')
        .replace('Abonos procesados 25', 'Abonos procesados 30')
    )
    const { conflicto } = mergeBbvaReadings([pag1(), adulterado])
    expect(conflicto).toMatch(/totales distintos/i)
  })

  it('un solo archivo sigue funcionando igual que antes', () => {
    // `mergeBbvaReadings` con una sola lectura debe dar lo mismo que
    // `parseBbvaPdfText`: el camino de un archivo no cambia.
    const texto = readFileSync(
      join(__dirname, '__fixtures__', 'consulta-pagos-masivos-ocr.txt'),
      'utf8'
    )
    const { summary } = mergeBbvaReadings([readBbvaPdfText(texto)])
    expect(summary.rows.map(r => r.success)).toEqual(
      parseBbvaPdfText(texto).rows.map(r => r.success)
    )
    expect(summary.rows.every(r => r.success)).toBe(true)
  })
})
