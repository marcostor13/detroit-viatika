/**
 * Solo LEE. Analiza las OT cuyo nombre contiene "SMI": prefijos, centro de costo
 * actual y uso en gastos/rendiciones. Sirve para decidir si el pedido de que esas
 * OT pertenezcan a los CC 123/223/423/523/823 es viable con el modelo actual
 * (hoy la relación es 1 OT -> 1 centro de costo).
 *
 *   node scripts/inspeccionar-ot-smi.mjs
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

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

const CODIGOS = ['123', '223', '423', '523', '823']
const client = new MongoClient(uri)

try {
  await client.connect()
  const db = client.db()
  console.log(`Conectado a ${hostDe(uri)} · base "${db.databaseName}"\n`)

  const projects = await db.collection('projects').find({}).toArray()
  const porId = new Map(projects.map((p) => [String(p._id), p]))
  const etiqueta = (id) => {
    const p = porId.get(String(id))
    return p ? `${p.code ?? '(sin code)'} · ${p.name}` : '(centro de costo no encontrado)'
  }

  const ots = await db
    .collection('ordentrabajos')
    .find({ nombre: { $regex: 'SMI', $options: 'i' } })
    .toArray()
  console.log(`OT con "SMI" en el nombre: ${ots.length}\n`)

  // Prefijo = lo que va antes de "-SMI" (LIM, ANT, CUA…).
  const porPrefijo = new Map()
  for (const ot of ots) {
    const m = /^(.*?)-?SMI/i.exec(ot.nombre)
    const prefijo = (m?.[1] || '(sin prefijo)').toUpperCase()
    if (!porPrefijo.has(prefijo)) porPrefijo.set(prefijo, [])
    porPrefijo.get(prefijo).push(ot)
  }

  console.log('POR PREFIJO DEL NOMBRE:')
  for (const [prefijo, lista] of [...porPrefijo].sort((a, b) => b[1].length - a[1].length)) {
    const ccs = new Map()
    for (const ot of lista) {
      const key = etiqueta(ot.costCenterId)
      ccs.set(key, (ccs.get(key) ?? 0) + 1)
    }
    console.log(`  ${prefijo}-SMI: ${lista.length} OT`)
    for (const [cc, n] of ccs) console.log(`      ${n} en  ${cc}`)
    if (lista.length <= 6) {
      console.log(`      nombres: ${lista.map((o) => o.nombre).join(', ')}`)
    }
  }
  console.log()

  console.log('CENTROS DE COSTO 123/223/423/523/823 y qué OT tienen hoy:')
  for (const codigo of CODIGOS) {
    const p = projects.find((x) => String(x.code ?? '').trim() === codigo)
    if (!p) {
      console.log(`  ${codigo}: SIN COINCIDENCIAS`)
      continue
    }
    // Se cuenta por `costCenterIds` (la lista), que es por donde filtra la app.
    const suyas = await db
      .collection('ordentrabajos')
      .find({ $or: [{ costCenterIds: p._id }, { costCenterId: p._id }] })
      .project({ nombre: 1 })
      .toArray()
    const conSmi = suyas.filter((o) => /SMI/i.test(o.nombre)).length
    console.log(
      `  ${codigo} · ${p.name}  (${p._id})  OTs=${suyas.length}  con "SMI"=${conSmi}`
    )
    if (suyas.length <= 5) {
      console.log(`      ${suyas.map((o) => o.nombre).join(', ')}`)
    }
  }
  console.log()

  // Uso de las OT SMI en datos ya registrados: si se reasignan, esto es lo que
  // queda apuntando a una OT que cambió de centro de costo.
  const idsSmi = ots.map((o) => o._id)
  const enReportes = await db
    .collection('expensereports')
    .countDocuments({ ordenTrabajoId: { $in: idsSmi } })
  const enGastos = await db
    .collection('expenses')
    .countDocuments({ ordenTrabajoId: { $in: idsSmi } })
  console.log(`Rendiciones que apuntan a una OT SMI: ${enReportes}`)
  console.log(`Gastos que apuntan a una OT SMI: ${enGastos}`)

  const colecciones = (await db.listCollections().toArray()).map((c) => c.name)
  console.log(`\nColecciones: ${colecciones.join(', ')}`)
} finally {
  await client.close()
}
