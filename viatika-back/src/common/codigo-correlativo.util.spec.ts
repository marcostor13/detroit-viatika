import { generarCodigoCorrelativo, maxSecuencia } from './codigo-correlativo.util'

/**
 * El `$inc` sobre `counters` resuelve la concurrencia, pero no que el contador
 * quede POR DETRÁS de los códigos ya emitidos. Eso pasa cuando alguien escribe
 * códigos sin pasar por él (una carga de datos, una migración, un respaldo
 * restaurado), y el choque contra el índice único `{clientId, codigo}` mataba
 * la creación con un "Internal server error" sin ninguna pista.
 */
describe('generarCodigoCorrelativo', () => {
  /** Doble de la colección `counters` con el $inc y el $max de verdad. */
  const nuevoContador = (inicial?: number) => {
    const estado: { seq?: number } = { seq: inicial }
    return {
      estado,
      findOneAndUpdate: jest.fn(async () => {
        estado.seq = (estado.seq ?? 0) + 1
        return { seq: estado.seq }
      }),
      updateOne: jest.fn(async (_f: any, update: any) => {
        const pedido = update?.$max?.seq
        if (typeof pedido === 'number') estado.seq = Math.max(estado.seq ?? 0, pedido)
        return {}
      }),
    }
  }

  const armar = (counters: any, tomados: string[]) =>
    generarCodigoCorrelativo({
      counters,
      key: 'rendicion-directa:c1',
      prefijo: 'RD',
      estaTomado: async codigo => tomados.includes(codigo),
      ultimoEmitido: async () => maxSecuencia(tomados, 'RD'),
    })

  it('devuelve el siguiente código cuando el contador está al día', async () => {
    const counters = nuevoContador(4)
    expect(await armar(counters, ['RD-0001', 'RD-0004'])).toBe('RD-0005')
  })

  it('arranca en RD-0001 cuando la empresa no tiene contador', async () => {
    expect(await armar(nuevoContador(), [])).toBe('RD-0001')
  })

  it('salta por encima de los códigos ya emitidos si el contador venía atrasado', async () => {
    // Contador en 2, pero ya existen hasta RD-0007 (cargados por fuera).
    const counters = nuevoContador(2)
    const tomados = ['RD-0003', 'RD-0005', 'RD-0006', 'RD-0007']
    expect(await armar(counters, tomados)).toBe('RD-0008')
    // No avanzó de uno en uno: un solo reencauce y listo.
    expect(counters.findOneAndUpdate).toHaveBeenCalledTimes(2)
  })

  it('deja el contador alineado para la próxima vez', async () => {
    const counters = nuevoContador(2)
    await armar(counters, ['RD-0003', 'RD-0004', 'RD-0005', 'RD-0006', 'RD-0007'])
    expect(counters.estado.seq).toBe(8)
  })

  it('reusa un hueco libre en vez de saltarlo', async () => {
    // El contador da RD-0003 y ese código no existe: se usa, aunque despues
    // haya emitidos más altos. No hay razón para desperdiciar el número.
    const counters = nuevoContador(2)
    expect(await armar(counters, ['RD-0007'])).toBe('RD-0003')
  })

  it('nunca hace retroceder el contador', async () => {
    // Otro proceso ya lo dejó más adelante que el último código emitido.
    const counters = nuevoContador(20)
    expect(await armar(counters, ['RD-0007'])).toBe('RD-0021')
    expect(counters.updateOne).not.toHaveBeenCalled()
  })

  it('con el contador atrasado no gira de uno en uno: reencauza y sigue', async () => {
    // 40 códigos ya emitidos y el contador en 0. Sin el reencauce serían 41
    // vueltas; con él, dos.
    const counters = nuevoContador(0)
    const todos = Array.from({ length: 40 }, (_, i) => `RD-${String(i + 1).padStart(4, '0')}`)
    expect(await armar(counters, todos)).toBe('RD-0041')
    expect(counters.findOneAndUpdate).toHaveBeenCalledTimes(2)
  })

  it('se rinde con un mensaje entendible en vez de girar para siempre', async () => {
    // Caso patológico: el reencauce no sirve (devuelve siempre 0) y todo está
    // tomado. Se agotan los intentos con un error que dice qué revisar.
    const counters = nuevoContador(0)
    await expect(
      generarCodigoCorrelativo({
        counters: counters as any,
        key: 'k', prefijo: 'RD',
        estaTomado: async () => true,
        ultimoEmitido: async () => 0,
      })
    ).rejects.toThrow(/No se pudo generar un código RD libre/)
  })

  it('respeta el ancho pedido', async () => {
    const codigo = await generarCodigoCorrelativo({
      counters: nuevoContador(0) as any,
      key: 'k', prefijo: 'CCH', ancho: 6,
      estaTomado: async () => false,
      ultimoEmitido: async () => 0,
    })
    expect(codigo).toBe('CCH-000001')
  })
})

describe('maxSecuencia', () => {
  it('toma el mayor número emitido', () => {
    expect(maxSecuencia(['RD-0003', 'RD-0012', 'RD-0007'], 'RD')).toBe(12)
  })

  it('ignora lo que no calce con el formato', () => {
    expect(maxSecuencia(['RD-0003', 'RD-XXXX', '', null as any], 'RD')).toBe(3)
  })

  it('devuelve 0 sin códigos', () => {
    expect(maxSecuencia([], 'RD')).toBe(0)
  })

  it('funciona con prefijos de otro largo', () => {
    expect(maxSecuencia(['CCH-000042'], 'CCH')).toBe(42)
  })
})
