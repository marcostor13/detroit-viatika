/**
 * Detecta y repara rendiciones ATASCADAS: quedaron en `submitted` con TODOS sus
 * comprobantes con la cadena de aprobadores completa y ninguno rechazado, pero
 * nunca avanzaron a `pending_accounting`.
 *
 * Por qué se atascan: el único auto-avance del sistema
 * (`advanceToAccountingIfAllExpensesApproved`) se dispara desde
 * `ExpenseService.approveByCoord`, es decir, al aprobar un comprobante. Si los
 * comprobantes se aprobaron mientras la rendición todavía estaba en `open`
 * (la cadena de cada comprobante se construye al SUBIRLO, no al enviar la
 * rendición), ese avance nunca corre: cuando la rendición por fin se envía, ya
 * no queda ningún comprobante por aprobar que lo dispare. Desde VD-87 los
 * aprobadores tampoco tienen botón a nivel de reporte, así que no hay salida
 * manual y reabrir/reenviar vuelve al mismo punto.
 *
 * La reparación replica exactamente el efecto de
 * `advanceToAccountingIfAllExpensesApproved`: status -> 'pending_accounting'
 * y `coordinatorApprovedAt`. NO manda correos: avisar a Contabilidad queda
 * fuera del script.
 *
 *   node scripts/reparar-rendiciones-atascadas.mjs              # dry-run (default)
 *   node scripts/reparar-rendiciones-atascadas.mjs --apply      # escribe
 *   node scripts/reparar-rendiciones-atascadas.mjs --id <id>    # acota a una
 */
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const APPLY = process.argv.includes('--apply')
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

  const query = ONLY_ID
    ? { _id: new ObjectId(ONLY_ID) }
    : { status: 'submitted' }
  const candidates = await reports.find(query).toArray()

  const stuck = []
  for (const r of candidates) {
    if (r.status !== 'submitted') continue
    const ids = (r.expenseIds ?? []).map(x =>
      new ObjectId(String(x && x._id ? x._id : x))
    )
    if (!ids.length) continue
    const exps = await expenses.find({ _id: { $in: ids } }).toArray()
    if (!exps.length) continue
    if (exps.some(e => String(e.status ?? '').toLowerCase() === 'rejected')) continue
    const active = exps.filter(e => e.status !== 'rejected')
    if (!active.length) continue
    if (!active.every(chainComplete)) continue
    // Una rendición de viático con cadena a nivel de reporte tiene su propio
    // gate (`approveRendicion`): si esa cadena sigue incompleta, NO está
    // atascada, está legítimamente esperando a sus aprobadores.
    const reportChain = r.rendicionApproverChain
    if (Array.isArray(reportChain) && reportChain.length > 0) {
      if (!reportChain.every(s => s.approved)) continue
    }
    stuck.push({
      report: r,
      expenses: active,
      contAprobados: active.filter(e => e.contabilidadStatus === 'approved').length,
    })
  }

  console.log(
    `Rendiciones en 'submitted' revisadas: ${candidates.filter(r => r.status === 'submitted').length}`
  )
  console.log(`ATASCADAS (cadena completa, sin avanzar): ${stuck.length}\n`)

  for (const s of stuck) {
    const r = s.report
    console.log(`--- ${r._id} | ${r.codigo ?? '(sin codigo)'} | "${r.title}"`)
    console.log(`    tipo=${r.type} directa=${!!r.isDirecta} cajaChica=${!!r.isCajaChica}`)
    console.log(`    comprobantes=${s.expenses.length} | aprobados por contabilidad=${s.contAprobados}`)
    console.log(`    creada=${r.createdAt?.toISOString?.() ?? r.createdAt} | updatedAt=${r.updatedAt?.toISOString?.() ?? r.updatedAt}`)
    console.log(`    -> submitted => pending_accounting`)
  }

  if (!stuck.length) {
    console.log('Nada que reparar.')
    process.exit(0)
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] No se escribió nada. Repetir con --apply para aplicar.')
    process.exit(0)
  }

  // Respaldo antes de tocar producción.
  const here = dirname(fileURLToPath(import.meta.url))
  const dir = join(here, 'respaldos')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `rendiciones-atascadas-${stamp}.json`)
  writeFileSync(file, JSON.stringify(stuck.map(s => s.report), null, 2))
  console.log(`\nRespaldo escrito en: ${file}`)

  const now = new Date()
  let n = 0
  for (const s of stuck) {
    const res = await reports.updateOne(
      { _id: s.report._id, status: 'submitted' },
      { $set: { status: 'pending_accounting', coordinatorApprovedAt: now } }
    )
    if (res.modifiedCount === 1) {
      n++
      console.log(`OK  ${s.report._id} -> pending_accounting`)
    } else {
      console.log(`SKIP ${s.report._id} (cambió de estado entre la lectura y la escritura)`)
    }
  }
  console.log(`\nReparadas: ${n}/${stuck.length}`)
  console.log('Contabilidad NO fue notificada por correo: avisar manualmente.')
} finally {
  await client.close()
}
