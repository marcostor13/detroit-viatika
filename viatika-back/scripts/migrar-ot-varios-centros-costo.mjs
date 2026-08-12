/**
 * Migra las OT al modelo de varios centros de costo y deja las OT "SMI" en los
 * cinco centros de SERVICIO MINERIA.
 *
 * Dos pasos:
 *   1. Toda OT sin `costCenterIds` recibe `[costCenterId]` (el que ya tenía).
 *   2. Las OT cuyo nombre contiene "SMI" quedan con los centros de costo
 *      123, 223, 423, 523 y 823; el 123 (LIMA) queda como principal.
 *
 * Va en SECO por defecto: imprime lo que haría y no toca nada. Para escribir:
 *
 *   node scripts/migrar-ot-varios-centros-costo.mjs --aplicar
 *
 * Antes de escribir guarda el estado previo de las OT afectadas en
 * scripts/respaldos/ot-centros-costo-<fecha>.json, que sirve para revertir.
 */
import 'dotenv/config'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'

const APLICAR = process.argv.includes('--aplicar')
const CODIGOS_SMI = ['123', '223', '423', '523', '823']
const CODIGO_PRINCIPAL = '123'

const uri = process.env.MONGO_URI
if (!uri) {
  console.error('No hay MONGO_URI definido (ni en .env ni en el entorno).')
  process.exit(1)
}

function hostDe(uri) {
  try {
    return new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'https://')).host
  } catch {
    return '(desconocido)'
  }
}

const client = new MongoClient(uri)

try {
  await client.connect()
  const db = client.db()
  const ots = db.collection('ordentrabajos')
  console.log(`Conectado a ${hostDe(uri)} · base "${db.databaseName}"`)
  console.log(APLICAR ? 'MODO: aplicar cambios\n' : 'MODO: simulación (sin escribir). Usa --aplicar para ejecutar.\n')

  // ── Paso 1: sembrar costCenterIds con el centro de costo actual ───────────
  const sinLista = await ots
    .find({ $or: [{ costCenterIds: { $exists: false } }, { costCenterIds: { $size: 0 } }] })
    .toArray()
  console.log(`Paso 1 — OT sin lista de centros de costo: ${sinLista.length}`)

  // ── Paso 2: OT "SMI" a los cinco centros de SERVICIO MINERIA ─────────────
  const smi = await ots.find({ nombre: { $regex: 'SMI', $options: 'i' } }).toArray()
  if (!smi.length) {
    console.log('No hay OT con "SMI" en el nombre. Nada que hacer en el paso 2.')
  }

  // Los centros se resuelven POR EMPRESA: el código es único dentro de cada
  // cliente, no en toda la base.
  const clientesConSmi = [...new Set(smi.map((ot) => String(ot.clientId)))]
  const centrosPorCliente = new Map()
  for (const clientId of clientesConSmi) {
    const proyectos = await db
      .collection('projects')
      .find({ clientId: smi.find((o) => String(o.clientId) === clientId).clientId })
      .toArray()
    const porCodigo = new Map(
      proyectos.map((p) => [String(p.code ?? '').trim(), p])
    )
    const encontrados = CODIGOS_SMI.map((c) => porCodigo.get(c)).filter(Boolean)
    if (encontrados.length !== CODIGOS_SMI.length) {
      const faltan = CODIGOS_SMI.filter((c) => !porCodigo.has(c))
      console.error(
        `\nEmpresa ${clientId}: faltan centros de costo ${faltan.join(', ')}. ` +
          'Se aborta para no dejar las OT a medias.'
      )
      process.exit(1)
    }
    // El principal va primero.
    const principal = porCodigo.get(CODIGO_PRINCIPAL)
    const resto = encontrados.filter((p) => String(p._id) !== String(principal._id))
    centrosPorCliente.set(clientId, [principal, ...resto])
    console.log(
      `\nEmpresa ${clientId} · centros de costo SMI:\n` +
        [principal, ...resto]
          .map((p, i) => `   ${i === 0 ? 'principal' : '         '} ${p.code} · ${p.name}`)
          .join('\n')
    )
  }

  console.log(`\nPaso 2 — OT con "SMI": ${smi.length}`)
  const pierdenCentro = []
  for (const ot of smi) {
    const nuevos = centrosPorCliente.get(String(ot.clientId)).map((p) => String(p._id))
    if (!nuevos.includes(String(ot.costCenterId))) {
      pierdenCentro.push(ot)
    }
  }
  if (pierdenCentro.length) {
    console.log(
      `\n  Ojo: ${pierdenCentro.length} OT estaban en un centro de costo fuera de los cinco ` +
        'y lo pierden (queda 123 como principal):'
    )
    const proyectos = await db.collection('projects').find({}).toArray()
    const porId = new Map(proyectos.map((p) => [String(p._id), p]))
    for (const ot of pierdenCentro) {
      const cc = porId.get(String(ot.costCenterId))
      console.log(`    ${ot.nombre}  (estaba en ${cc ? `${cc.code} · ${cc.name}` : '?'})`)
    }
  }

  if (!APLICAR) {
    console.log('\nSimulación terminada. Nada se escribió.')
    process.exit(0)
  }

  // ── Respaldo del estado previo ────────────────────────────────────────────
  const carpeta = join(dirname(fileURLToPath(import.meta.url)), 'respaldos')
  mkdirSync(carpeta, { recursive: true })
  const marca = new Date().toISOString().replace(/[:.]/g, '-')
  const archivo = join(carpeta, `ot-centros-costo-${marca}.json`)
  const afectadas = [...new Map([...sinLista, ...smi].map((o) => [String(o._id), o])).values()]
  writeFileSync(
    archivo,
    JSON.stringify(
      afectadas.map((o) => ({
        _id: String(o._id),
        nombre: o.nombre,
        costCenterId: String(o.costCenterId),
        costCenterIds: (o.costCenterIds ?? []).map(String),
      })),
      null,
      2
    )
  )
  console.log(`\nRespaldo del estado previo: ${archivo}`)

  let paso1 = 0
  for (const ot of sinLista) {
    if (!ot.costCenterId) continue
    await ots.updateOne({ _id: ot._id }, { $set: { costCenterIds: [ot.costCenterId] } })
    paso1++
  }
  console.log(`Paso 1 aplicado: ${paso1} OT con su lista sembrada.`)

  let paso2 = 0
  for (const ot of smi) {
    const centros = centrosPorCliente.get(String(ot.clientId)).map((p) => p._id)
    await ots.updateOne(
      { _id: ot._id },
      { $set: { costCenterIds: centros, costCenterId: centros[0] } }
    )
    paso2++
  }
  console.log(`Paso 2 aplicado: ${paso2} OT "SMI" en los cinco centros de costo.`)

  const verifica = await ots.countDocuments({
    nombre: { $regex: 'SMI', $options: 'i' },
    [`costCenterIds.4`]: { $exists: true },
  })
  console.log(`Verificación: ${verifica} OT "SMI" tienen 5 centros de costo.`)
} finally {
  await client.close()
}
