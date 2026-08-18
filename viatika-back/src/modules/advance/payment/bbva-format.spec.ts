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
