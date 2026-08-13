/**
 * SOLO LECTURA. Lista las rendiciones que quedaron en `submitted` con TODOS sus
 * comprobantes con la cadena de aprobadores completa y ninguno rechazado: el
 * síntoma de que el auto-avance a Contabilidad nunca se disparó.
 *
 *   node scripts/ver-rendiciones-atascadas.mjs
 *   node scripts/ver-rendiciones-atascadas.mjs --id <id>   # detalle de una
 */
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb'

const idFlag = process.argv.indexOf('--id')
const ONLY_ID = idFlag !== -1 ? process.argv[idFlag + 1] : null

const uri = process.env.MONGO_URI
if (!uri) {
  console.error('No hay MONGO_URI definido.')
  process.exit(1)
}

const chainComplete = e => {
  if (e.approverChain === undefined) return false
  const required = e.requiredLevels ?? e.approverChain.length ?? 0
  return (e.approvalLevel ?? 0) >= required
}

const client = new MongoClient(uri)
try {
  await client.connect()
  const db = client.db()
  const reports = db.collection('expensereports')
  const expenses = db.collection('expenses')

  const query = ONLY_ID ? { _id: new ObjectId(ONLY_ID) } : { status: 'submitted' }
  const candidates = await reports.find(query).toArray()

  const revisadas = candidates.filter(r => r.status === 'submitted')
  const stuck = []
  for (const r of revisadas) {
    const ids = (r.expenseIds ?? []).map(
      x => new ObjectId(String(x && x._id ? x._id : x))
    )
    if (!ids.length) continue
    const exps = await expenses.find({ _id: { $in: ids } }).toArray()
    if (!exps.length) continue
    if (exps.some(e => String(e.status ?? '').toLowerCase() === 'rejected')) continue
    const active = exps.filter(e => e.status !== 'rejected')
    if (!active.length) continue
    if (!active.every(chainComplete)) continue
    // Una rendición de viático tiene además su propia cadena a nivel de reporte
    // (`approveRendicion`): si sigue incompleta no está atascada, está esperando.
    const reportChain = r.rendicionApproverChain
    if (Array.isArray(reportChain) && reportChain.length > 0) {
      if (!reportChain.every(s => s.approved)) continue
    }
    stuck.push({ report: r, expenses: active })
  }

  console.log(`Rendiciones en 'submitted' revisadas: ${revisadas.length}`)
  console.log(`ATASCADAS (cadena completa, sin avanzar): ${stuck.length}\n`)

  for (const s of stuck) {
    const r = s.report
    const cont = s.expenses.filter(e => e.contabilidadStatus === 'approved').length
    console.log(`--- ${r._id} | ${r.codigo ?? '(sin codigo)'} | "${r.title}"`)
    console.log(`    tipo=${r.type} directa=${!!r.isDirecta} cajaChica=${!!r.isCajaChica}`)
    console.log(`    comprobantes=${s.expenses.length} | aprobados por contabilidad=${cont}`)
    console.log(
      `    creada=${r.createdAt?.toISOString?.() ?? r.createdAt} | updatedAt=${r.updatedAt?.toISOString?.() ?? r.updatedAt}`
    )
    for (const e of s.expenses) {
      console.log(
        `      · ${e._id} | ${e.expenseType} | status=${e.status} | contabilidad=${e.contabilidadStatus ?? '-'} | nivel=${e.approvalLevel ?? 0}/${e.requiredLevels ?? (e.approverChain?.length ?? 0)}`
      )
    }
  }
} finally {
  await client.close()
}
