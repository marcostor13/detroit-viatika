/**
 * Vuelca una rendición completa + sus comprobantes + audit-log. SOLO LEE.
 *   node ver-rendicion.mjs 6a7e3adc06d04f6648aa57bc
 */
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb'

const id = process.argv[2]
const uri = process.env.MONGO_URI
if (!uri) { console.error('No hay MONGO_URI'); process.exit(1) }

const client = new MongoClient(uri)
try {
  await client.connect()
  const db = client.db()
  const rep = await db.collection('expensereports').findOne({ _id: new ObjectId(id) })
  if (!rep) { console.log('NO EXISTE la rendición', id); process.exit(0) }

  console.log('=== RENDICIÓN ===')
  const { expenseIds, ...rest } = rep
  console.log(JSON.stringify(rest, null, 2))
  console.log('\nexpenseIds:', (expenseIds || []).map(String).join(', '))

  console.log('\n=== COMPROBANTES ===')
  const exps = await db.collection('expenses').find({
    _id: { $in: (expenseIds || []).map((e) => new ObjectId(String(e))) },
  }).toArray()
  for (const e of exps) {
    console.log(`\n--- ${e._id} | ${e.expenseType} | status=${e.status} | total=${e.total} ${e.currency || ''}`)
    console.log('   approvedByCoord:', e.approvedByCoord, '| approvedByAccounting:', e.approvedByAccounting)
    console.log('   approverChain:', JSON.stringify(e.approverChain))
    console.log('   updatedAt:', e.updatedAt)
  }

  console.log('\n=== AUDIT LOG (por entityId) ===')
  const logs = await db.collection('auditlogs').find({
    $or: [
      { entityId: id },
      { entityId: new ObjectId(id) },
      { 'metadata.reportId': id },
    ],
  }).sort({ createdAt: 1 }).toArray()
  for (const l of logs) {
    console.log(`${l.createdAt?.toISOString?.() || l.createdAt} | ${l.action} | user=${l.userEmail || l.userId} | ${JSON.stringify(l.metadata || l.details || {})}`)
  }
  if (!logs.length) console.log('(sin registros)')
} finally {
  await client.close()
}
