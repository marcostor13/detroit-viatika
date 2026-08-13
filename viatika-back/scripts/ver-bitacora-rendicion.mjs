/**
 * SOLO LECTURA. Reconstruye la línea de tiempo de una rendición: todo el audit
 * log del reporte y el de cada uno de sus comprobantes, ordenado por fecha.
 *
 *   node scripts/ver-bitacora-rendicion.mjs <reportId>
 */
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb'

const id = process.argv[2]
const uri = process.env.MONGO_URI
if (!uri || !id) {
  console.error('Uso: node scripts/ver-bitacora-rendicion.mjs <reportId>')
  process.exit(1)
}

const client = new MongoClient(uri)
try {
  await client.connect()
  const db = client.db()
  const rep = await db.collection('expensereports').findOne({ _id: new ObjectId(id) })
  if (!rep) {
    console.log('NO EXISTE la rendición', id)
    process.exit(0)
  }
  const expIds = (rep.expenseIds ?? []).map(e => new ObjectId(String(e)))
  const exps = await db
    .collection('expenses')
    .find({ _id: { $in: expIds } })
    .toArray()

  const ids = [String(rep._id), ...exps.map(e => String(e._id))]
  const logs = await db
    .collection('auditlogs')
    .find({
      $or: [
        { entityId: { $in: ids } },
        { entityId: { $in: ids.map(x => new ObjectId(x)) } },
      ],
    })
    .sort({ createdAt: 1 })
    .toArray()

  const etiqueta = new Map(ids.map((x, i) => [x, i === 0 ? 'RENDICION' : `comprobante${i}`]))

  console.log(`Rendición ${rep.codigo ?? rep._id} "${rep.title}" | estado actual: ${rep.status}`)
  console.log(`creada: ${rep.createdAt?.toISOString?.() ?? rep.createdAt}\n`)
  console.log('=== BITÁCORA (reporte + comprobantes) ===')
  for (const l of logs) {
    const quien = l.userEmail || l.userName || l.userId
    const meta = JSON.stringify(l.metadata ?? l.details ?? l.changes ?? {})
    console.log(
      `${l.createdAt?.toISOString?.() ?? l.createdAt} | ${etiqueta.get(String(l.entityId)) ?? l.entityId} | ${l.action} | ${quien} | ${meta.slice(0, 220)}`
    )
  }
  if (!logs.length) console.log('(sin registros)')

  console.log('\n=== APROBACIONES REGISTRADAS EN CADA COMPROBANTE ===')
  for (const [i, e] of exps.entries()) {
    console.log(`\ncomprobante${i + 1} ${e._id} | creado=${e.createdAt?.toISOString?.() ?? e.createdAt}`)
    for (const h of e.approvalHistory ?? []) {
      console.log(
        `   historial: nivel=${h.level} ${h.action} por ${h.approvedBy} el ${h.date?.toISOString?.() ?? h.date}`
      )
    }
    for (const s of e.approverChain ?? []) {
      console.log(
        `   cadena: nivel=${s.level} approved=${s.approved} el ${s.approvedAt?.toISOString?.() ?? '-'}`
      )
    }
    console.log(
      `   contabilidad: ${e.contabilidadStatus ?? '-'} el ${e.contabilidadApprovedAt?.toISOString?.() ?? '-'}`
    )
  }
} finally {
  await client.close()
}
