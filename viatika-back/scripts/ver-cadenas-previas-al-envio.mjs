/**
 * SOLO LECTURA. Mide el residuo que deja el cambio "la cadena se construye al
 * ENVIAR": comprobantes que ya tienen `approverChain` aunque su rendición nunca
 * se envió, y cuántos de ellos ya fueron aprobados por alguien.
 *
 *   node scripts/ver-cadenas-previas-al-envio.mjs
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const uri = process.env.MONGO_URI
if (!uri) {
  console.error('No hay MONGO_URI definido.')
  process.exit(1)
}

// Estados en los que la rendición todavía está en manos del colaborador: nadie
// debería haber aprobado nada de ella.
const SIN_ENVIAR = ['open', 'rejected', 'solicited', 'paid', 'partially_paid']

const client = new MongoClient(uri)
try {
  await client.connect()
  const db = client.db()
  const reports = await db
    .collection('expensereports')
    .find({ status: { $in: SIN_ENVIAR } })
    .project({ _id: 1, codigo: 1, title: 1, status: 1, type: 1, expenseIds: 1 })
    .toArray()

  const porReporte = new Map(reports.map(r => [String(r._id), r]))
  const exps = await db
    .collection('expenses')
    .find({
      expenseReportId: { $in: reports.map(r => r._id) },
      approverChain: { $exists: true },
    })
    .project({
      _id: 1,
      expenseReportId: 1,
      approverChain: 1,
      approvalLevel: 1,
      contabilidadStatus: 1,
    })
    .toArray()

  const conAprobacion = exps.filter(e =>
    (e.approverChain ?? []).some(s => s.approved)
  )
  const conContabilidad = exps.filter(e => e.contabilidadStatus === 'approved')

  console.log(`Rendiciones sin enviar (${SIN_ENVIAR.join('/')}): ${reports.length}`)
  console.log(`Comprobantes suyos CON cadena ya construida: ${exps.length}`)
  console.log(`  · con al menos un paso aprobado: ${conAprobacion.length}`)
  console.log(`  · ya aprobados por Contabilidad: ${conContabilidad.length}\n`)

  const agrupado = new Map()
  for (const e of conAprobacion) {
    const key = String(e.expenseReportId)
    if (!agrupado.has(key)) agrupado.set(key, [])
    agrupado.get(key).push(e)
  }
  for (const [reportId, lista] of agrupado) {
    const r = porReporte.get(reportId)
    console.log(
      `--- ${reportId} | ${r?.codigo ?? '(sin codigo)'} | "${r?.title}" | estado=${r?.status} | tipo=${r?.type}`
    )
    for (const e of lista) {
      const pasos = (e.approverChain ?? [])
        .map(s => `N${s.level}:${s.approved ? 'aprobado' : 'pendiente'}`)
        .join(' ')
      console.log(
        `      · ${e._id} | ${pasos} | contabilidad=${e.contabilidadStatus ?? '-'}`
      )
    }
  }
  if (!agrupado.size) console.log('Ninguna aprobación previa al envío. Nada que limpiar.')
} finally {
  await client.close()
}
