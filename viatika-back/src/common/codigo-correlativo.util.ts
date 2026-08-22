import { ConflictException } from '@nestjs/common'

/** Colección `counters` de Mongo, con lo mínimo que usa el correlativo. */
interface ContadoresCollection {
  findOneAndUpdate(filtro: any, update: any, opciones: any): Promise<any>
  updateOne(filtro: any, update: any, opciones?: any): Promise<any>
}

/** Mayor número ya emitido en una lista de códigos con el prefijo dado. */
export function maxSecuencia(codigos: string[], prefijo: string): number {
  const inicio = prefijo.length + 1 // el prefijo más el guion
  return codigos.reduce((max, codigo) => {
    const n = Number.parseInt(String(codigo ?? '').slice(inicio), 10)
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
}

/**
 * Iniciales del nombre de un colaborador, para el código de rendición (VD-123).
 * "Nathaly Margiory Cabezas Bravo" → "NMCB".
 *
 * Los nombres de Detroit vienen del Excel de personal como
 * `APELLIDOS, NOMBRES` ("MORRIS FLORES,GUILLERMO JOSE"), así que la coma y los
 * espacios de más se tratan como separadores y las iniciales salen en el orden
 * en que el nombre está guardado (ahí, MFGJ).
 *
 * El resultado es ASCII puro: `Á`→A y `Ñ`→N. Dos razones. Una, que el mismo
 * colaborador tendría dos códigos distintos según cómo se escribiera su nombre
 * ese día. Y dos, que el código viaja a exportaciones y nombres de archivo,
 * donde un carácter no ASCII es una fuente conocida de problemas de
 * codificación en esta plataforma.
 */
export function inicialesDeNombre(nombre: string): string {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Tras el NFD la Ñ ya quedó como N: la clase solo necesita ASCII.
    .replace(/[^A-Za-z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(palabra => palabra[0].toUpperCase())
    .join('')
}

/**
 * Código de rendición con la nomenclatura de VD-123:
 * `[Prefijo]-[Iniciales del colaborador]-[Correlativo]`, ej. `RE-NMCB-0001`.
 *
 * El correlativo es POR COLABORADOR Y POR TIPO: cada persona empieza en 0001 en
 * cada prefijo. Es lo que da sentido a llevar las iniciales dentro del código;
 * con un correlativo global bastaría con el numero.
 *
 * Dos colaboradores pueden compartir iniciales (en los 163 usuarios de Detroit
 * pasa una vez, entre nombres de dos palabras). No se inventa un desempate: se
 * reusa `generarCodigoCorrelativo`, que ya comprueba contra los códigos emitidos
 * de la empresa y, si el código está tomado, avanza. El segundo "CT" arranca en
 * el numero libre en vez de chocar contra el índice único.
 */
export async function generarCodigoRendicion(opts: {
  counters: ContadoresCollection
  clientId: string
  userId: string
  nombreColaborador: string
  /** 'RE' (con solicitud previa), 'RD' (directa) o 'CCH' (caja chica). */
  prefijo: 'RE' | 'RD' | 'CCH'
  estaTomado: (codigo: string) => Promise<boolean>
  ultimoEmitido: (prefijoConIniciales: string) => Promise<number>
}): Promise<string> {
  const iniciales = inicialesDeNombre(opts.nombreColaborador)
  // Sin nombre utilizable el código quedaría como `RE--0001`, que no identifica
  // a nadie. Se usa el prefijo solo, que al menos sigue siendo único y legible.
  const prefijoConIniciales = iniciales
    ? `${opts.prefijo}-${iniciales}`
    : opts.prefijo

  return generarCodigoCorrelativo({
    counters: opts.counters,
    key: `rendicion:${opts.prefijo}:${opts.clientId}:${opts.userId}`,
    prefijo: prefijoConIniciales,
    estaTomado: opts.estaTomado,
    ultimoEmitido: () => opts.ultimoEmitido(prefijoConIniciales),
  })
}

/**
 * Correlativo por empresa (RD-0001, CC-0001…) resistente a un contador
 * desfasado.
 *
 * El `$inc` sobre `counters` es atómico y resuelve la concurrencia, pero no
 * el caso de que el contador quede POR DETRÁS de los códigos ya emitidos: pasa
 * cuando alguien escribe códigos sin pasar por él —una carga de datos, una
 * migración, la restauración de un respaldo—. Ahí el código generado choca
 * contra el índice único `{clientId, codigo}` y la creación moría con un
 * "Internal server error" sin ninguna pista de qué había pasado.
 *
 * Cuando detecta el choque, el contador salta de una vez al último emitido en
 * vez de avanzar de uno en uno: con cien códigos de diferencia, incrementar
 * uno por vuelta serían cien viajes a la base.
 */
export async function generarCodigoCorrelativo(opts: {
  counters: ContadoresCollection
  /** Clave del contador, ej. `rendicion-directa:<clientId>`. */
  key: string
  /** Prefijo del código, ej. 'RD'. */
  prefijo: string
  /** Dígitos del número, 4 por defecto (RD-0001). */
  ancho?: number
  /** ¿Ese código ya está usado por esta empresa? */
  estaTomado: (codigo: string) => Promise<boolean>
  /** Mayor número ya emitido por esta empresa, para reencauzar el contador. */
  ultimoEmitido: () => Promise<number>
  intentos?: number
}): Promise<string> {
  const ancho = opts.ancho ?? 4
  const intentos = opts.intentos ?? 5

  for (let intento = 0; intento < intentos; intento++) {
    const res: any = await opts.counters.findOneAndUpdate(
      { _id: opts.key as any },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    )
    const seq = (res && (res.seq ?? res.value?.seq)) ?? 1
    const codigo = `${opts.prefijo}-${String(seq).padStart(ancho, '0')}`

    if (!(await opts.estaTomado(codigo))) return codigo

    // Contador atrasado: se lo lleva al último emitido y se vuelve a intentar.
    // `$max` no lo hace retroceder si otro proceso ya lo adelantó más.
    const ultimo = await opts.ultimoEmitido()
    await opts.counters.updateOne(
      { _id: opts.key as any },
      { $max: { seq: ultimo } },
      { upsert: true }
    )
  }

  throw new ConflictException(
    `No se pudo generar un código ${opts.prefijo} libre tras ${intentos} intentos. Revisa el contador de la empresa.`
  )
}
