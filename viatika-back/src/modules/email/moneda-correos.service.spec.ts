import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EmailService } from './email.service'

/**
 * Los correos son el punto donde la moneda se vuelve visible para alguien que
 * no puede contrastarla contra la pantalla. Un viático en dólares rotulado
 * "S/" no falla en ningún log: simplemente le dice a Tesorería que pague otra
 * cifra. Se prueba que cada plantilla reciba un símbolo y cuál.
 */
describe('EmailService — símbolo de moneda en las plantillas', () => {
  const nuevoServicio = () => {
    const svc = Object.create(EmailService.prototype) as any
    const enviados: any[] = []
    svc.send = jest.fn(async (args: any) => {
      enviados.push(args)
    })
    svc.logger = { debug: jest.fn(), error: jest.fn() }
    svc.resolveLogoUrl = jest.fn(async () => 'logo.png')
    svc.extractClientId = jest.fn(() => 'c1')
    svc.normalizeIsoDatesInText = jest.fn((t: string) => t)
    svc.resolvePlatformHref = jest.fn((u: string) => u)
    svc.formatDateDDMMYYYY = jest.fn(() => '04/08/2026')
    svc.withSubjectRef = jest.fn((asunto: string) => asunto)
    return { svc, enviados }
  }

  const base = {
    clientId: 'c1',
    recipientName: 'Ana',
    collaboratorName: 'Iván',
    coordinatorName: 'Ana',
    reportTitle: 'Viático Miami',
    budgetFormatted: '800.00',
    expenseCount: 5,
    hasBankAccount: false,
  }

  const casos: Array<[string, string]> = [
    ['sendRendicionSubmitted', './rendicion-submitted'],
    ['sendRendicionSubmittedToColaborador', './rendicion-submitted-colaborador'],
    ['sendRendicionPendienteContabilidad', './rendicion-pendiente-contabilidad'],
    ['sendRendicionAprobadaCoordinador', './rendicion-aprobada-coordinador'],
    ['sendRendicionAprobadaTesoreria', './rendicion-aprobada-tesoreria'],
  ]

  it.each(casos)('%s propaga el símbolo recibido', async (metodo, template) => {
    const { svc, enviados } = nuevoServicio()
    await svc[metodo]('a@b.com', { ...base, currencySymbol: '$' })

    expect(enviados).toHaveLength(1)
    expect(enviados[0].template).toBe(template)
    expect(enviados[0].context.currencySymbol).toBe('$')
  })

  it.each(casos)('%s cae en soles si no le pasan símbolo', async metodo => {
    const { svc, enviados } = nuevoServicio()
    await svc[metodo]('a@b.com', base)

    expect(enviados[0].context.currencySymbol).toBe('S/')
  })

  it('la devolución pendiente rotula el monto adeudado con su símbolo', async () => {
    const { svc, enviados } = nuevoServicio()
    await svc.sendDevolucionPendiente('a@b.com', {
      clientId: 'c1',
      recipientName: 'Iván',
      amountDue: '1639.72',
      dueDate: '2026-08-18',
      advanceId: 'r1',
      currencySymbol: 'S/',
    })

    // El saldo a devolver va en moneda base aunque el viático fuera en dólares.
    expect(enviados[0].context.currencySymbol).toBe('S/')
    expect(enviados[0].subject).toContain('S/ 1639.72')
  })

  it('ninguna plantilla de rendición vuelve a cablear el símbolo', () => {
    // Guarda contra la regresión más fácil de cometer: agregar un importe nuevo
    // a la plantilla copiando la línea de al lado, con el "S/" pegado.
    const dir = join(__dirname, 'templates')
    for (const [, template] of casos) {
      const archivo = join(dir, `${template.replace('./', '')}.hbs`)
      const html = readFileSync(archivo, 'utf8')
      expect(html).toContain('{{currencySymbol}}')
      expect(html).not.toMatch(/S\/\s*\{\{/)
    }
  })

  /**
   * Correos de liquidación y cierre. Antes ninguno aceptaba `currencySymbol`:
   * caían en el default 'S/' del servicio, que acertaba solo porque la moneda
   * base de los clientes actuales es el sol.
   */
  const casosLiquidacion: Array<[string, string, Record<string, unknown>]> = [
    ['sendViaticoCancelacion', './viatico-cancelacion-coordinator', {
      coordinatorName: 'Ana', collaboratorName: 'Iván', place: 'Miami',
      startDate: '2026-08-11', endDate: '2026-08-13', totalFormatted: '500.00',
      projectLabel: '[823 - HUDBAY]', plainSummary: 'Iván canceló su solicitud.',
    }],
    ['sendRendicionReembolsoContabilidad', './rendicion-reembolso-contabilidad', {
      recipientName: 'Ana', reportLabel: 'Viático Miami', reportTitle: 'Viático Miami',
      collaboratorName: 'Iván', amountFormatted: '120.00', detailUrl: '/x',
    }],
    ['sendRendicionReembolsoPagado', './rendicion-reembolso-pagado', {
      recipientName: 'Iván', collaboratorName: 'Iván', reportTitle: 'Viático Miami',
      amountFormatted: '120.00', transferDate: '2026-08-11',
      paymentMethod: 'transferencia_bancaria', paymentReceiptUrl: '',
    }],
    ['sendRendicionDevolucionColaborador', './rendicion-devolucion-colaborador', {
      recipientName: 'Iván', reportTitle: 'Viático Miami',
      amountFormatted: '300.00', closedAt: '2026-08-11',
    }],
    ['sendRendicionDevolucionCargada', './rendicion-devolucion-cargada', {
      recipientName: 'Ana', collaboratorName: 'Iván', reportTitle: 'Viático Miami',
      amountFormatted: '300.00', depositDate: '2026-08-11',
    }],
  ]

  it.each(casosLiquidacion)('%s propaga el símbolo recibido', async (metodo, template, datos) => {
    const { svc, enviados } = nuevoServicio()
    await svc[metodo]('a@b.com', { clientId: 'c1', ...datos, currencySymbol: '$' })

    expect(enviados).toHaveLength(1)
    expect(enviados[0].template).toBe(template)
    expect(enviados[0].context.currencySymbol).toBe('$')
  })

  it('los asuntos de reembolso y devolución llevan el símbolo, no un "S/" fijo', async () => {
    const { svc, enviados } = nuevoServicio()
    await svc.sendRendicionReembolsoContabilidad('a@b.com', {
      clientId: 'c1', recipientName: 'Ana', reportLabel: 'Viático Miami',
      reportTitle: 'Viático Miami', collaboratorName: 'Iván',
      amountFormatted: '120.00', detailUrl: '/x', currencySymbol: '$',
    })
    await svc.sendRendicionDevolucionColaborador('a@b.com', {
      clientId: 'c1', recipientName: 'Iván', reportTitle: 'Viático Miami',
      amountFormatted: '300.00', closedAt: '2026-08-11', currencySymbol: '$',
    })

    expect(enviados[0].subject).toContain('$ 120.00')
    expect(enviados[1].subject).toContain('$ 300.00')
  })

  it('la rendición aprobada arma el presupuesto con la moneda de la rendición', async () => {
    const { svc, enviados } = nuevoServicio()
    await svc.sendRendicionFullyApprovedEmail('a@b.com', {
      clientId: 'c1', userName: 'Iván', title: 'Viático Miami',
      budget: 500, currencySymbol: '$',
    })

    // `budget` llega a la plantilla ya formateado: el simbolo va dentro.
    expect(enviados[0].context.budget).toBe('$ 500.00')
  })

  it('ninguna plantilla de correo cablea el símbolo junto a un importe', () => {
    const dir = join(__dirname, 'templates')
    for (const archivo of readdirSync(dir).filter(f => f.endsWith('.hbs'))) {
      const html = readFileSync(join(dir, archivo), 'utf8')
      expect({ archivo, cableado: /S\/\s*\{\{/.test(html) }).toEqual({
        archivo,
        cableado: false,
      })
    }
  })

  it('la devolución validada no queda sin símbolo', async () => {
    const { svc, enviados } = nuevoServicio()
    await svc.sendDevolucionValidada('a@b.com', {
      clientId: 'c1',
      recipientName: 'Iván',
      amountDue: '1639.72',
      advanceId: 'r1',
    })

    expect(enviados[0].context.currencySymbol).toBe('S/')
  })
})
