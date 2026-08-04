import { readFileSync } from 'node:fs'
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
