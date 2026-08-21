import { inicialesDeNombre, generarCodigoRendicion } from './codigo-correlativo.util'

/**
 * VD-123: `[Prefijo]-[Iniciales]-[Correlativo]`, ej. `RE-NMCB-0001`.
 */
describe('inicialesDeNombre', () => {
  it('toma la inicial de cada palabra, como en el ejemplo del ticket', () => {
    expect(inicialesDeNombre('Nathaly Margiory Cabezas Bravo')).toBe('NMCB')
  })

  // Los nombres de Detroit vienen del Excel como "APELLIDOS, NOMBRES".
  it('trata la coma y los espacios de mas como separadores', () => {
    expect(inicialesDeNombre('MORRIS FLORES,GUILLERMO JOSE')).toBe('MFGJ')
    expect(inicialesDeNombre('PILLACA AZA,  SERGIO   MAURICIO')).toBe('PASM')
  })

  /**
   * El codigo sale en ASCII puro. Si la tilde cambiara la inicial, el mismo
   * colaborador tendria dos codigos distintos segun como se escribiera su
   * nombre; y el codigo viaja a exportaciones y nombres de archivo, donde un
   * caracter no ASCII ya ha dado problemas de codificacion en esta plataforma.
   */
  it('normaliza tildes y la Ñ a ASCII', () => {
    expect(inicialesDeNombre('Ángel Ñañez')).toBe('AN')
    expect(inicialesDeNombre('Angel Nanez')).toBe('AN')
  })

  it('sin nombre utilizable devuelve vacio, no basura', () => {
    expect(inicialesDeNombre('')).toBe('')
    expect(inicialesDeNombre('  ,,  ')).toBe('')
    expect(inicialesDeNombre(undefined as any)).toBe('')
  })
})

describe('generarCodigoRendicion', () => {
  /** Contador en memoria, como el `counters` de Mongo. */
  const contadores = () => {
    const seq = new Map<string, number>()
    return {
      seq,
      counters: {
        findOneAndUpdate: async (f: any) => {
          const k = String(f._id)
          const n = (seq.get(k) ?? 0) + 1
          seq.set(k, n)
          return { seq: n }
        },
        updateOne: async (f: any, u: any) => {
          const k = String(f._id)
          seq.set(k, Math.max(seq.get(k) ?? 0, u.$max?.seq ?? 0))
        },
      },
    }
  }

  const generar = (c: any, nombre: string, userId: string, tomados: Set<string>) =>
    generarCodigoRendicion({
      counters: c.counters,
      clientId: 'cli',
      userId,
      nombreColaborador: nombre,
      prefijo: 'RE',
      estaTomado: async codigo => tomados.has(codigo),
      ultimoEmitido: async () => 0,
    })

  it('arma el codigo del ticket', async () => {
    const c = contadores()
    expect(await generar(c, 'Nathaly Margiory Cabezas Bravo', 'u1', new Set())).toBe(
      'RE-NMCB-0001'
    )
  })

  it('el correlativo es POR COLABORADOR: cada uno empieza en 0001', async () => {
    const c = contadores()
    const tomados = new Set<string>()
    expect(await generar(c, 'Ana Bravo', 'u1', tomados)).toBe('RE-AB-0001')
    expect(await generar(c, 'Ana Bravo', 'u1', tomados)).toBe('RE-AB-0002')
    // Otro colaborador arranca de cero, no continua la numeracion del anterior.
    expect(await generar(c, 'Carlos Diaz', 'u2', tomados)).toBe('RE-CD-0001')
  })

  it('el mismo colaborador lleva correlativos separados por prefijo', async () => {
    const c = contadores()
    const comun = {
      counters: c.counters,
      clientId: 'cli',
      userId: 'u1',
      nombreColaborador: 'Ana Bravo',
      estaTomado: async () => false,
      ultimoEmitido: async () => 0,
    }
    expect(await generarCodigoRendicion({ ...comun, prefijo: 'RE' })).toBe('RE-AB-0001')
    expect(await generarCodigoRendicion({ ...comun, prefijo: 'RD' })).toBe('RD-AB-0001')
    expect(await generarCodigoRendicion({ ...comun, prefijo: 'CCH' })).toBe('CCH-AB-0001')
  })

  /**
   * Dos personas pueden compartir iniciales. No se inventa un desempate: el
   * codigo tomado se salta, que es lo que ya hacia `generarCodigoCorrelativo`.
   */
  it('con iniciales repetidas no choca: avanza al numero libre', async () => {
    const c = contadores()
    const tomados = new Set(['RE-CT-0001'])
    expect(await generar(c, 'Carlos Tanaka', 'u9', tomados)).toBe('RE-CT-0002')
  })

  it('sin nombre usa el prefijo solo, en vez de dejar un hueco', async () => {
    const c = contadores()
    expect(await generar(c, '', 'u1', new Set())).toBe('RE-0001')
  })
})
