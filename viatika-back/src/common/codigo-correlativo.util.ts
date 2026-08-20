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
