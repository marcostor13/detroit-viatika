import { Test } from '@nestjs/testing'
import { Types } from 'mongoose'
import { ExpenseReportService } from './expense-report.service'

/**
 * VD-135: filtros de estado, centro de costo y orden de trabajo en el listado de
 * rendiciones directas. Se comprueba la CONSULTA que se arma, no el resultado:
 * lo que importa es que un valor invalido no entre a Mongo y que uno valido
 * acote de verdad.
 */
describe('ExpenseReportService.findDirectRendicionReports — filtros (VD-135)', () => {
  let service: ExpenseReportService
  let consultas: any[]

  const clientId = new Types.ObjectId().toString()
  const projectId = new Types.ObjectId().toString()
  const ordenTrabajoId = new Types.ObjectId().toString()

  beforeEach(async () => {
    consultas = []
    const moduleRef = await Test.createTestingModule({
      providers: [ExpenseReportService],
    })
      .useMocker(() => ({}))
      .compile()
    service = moduleRef.get(ExpenseReportService)
    ;(service as any).expenseReportModel = {
      find: (q: any) => {
        consultas.push(q)
        const cadena: any = {
          select: () => cadena,
          populate: () => cadena,
          sort: () => cadena,
          lean: () => cadena,
          exec: async () => [],
        }
        return cadena
      },
    }
  })

  const consultaCon = async (filtros: any) => {
    await service.findDirectRendicionReports(clientId, filtros)
    return consultas[0]
  }

  it('sin filtros solo acota a las directas de la empresa', async () => {
    const q = await consultaCon({})
    expect(q.isDirecta).toBe(true)
    expect(q.status).toBeUndefined()
    expect(q.projectId).toBeUndefined()
    expect(q.directaOrdenTrabajoId).toBeUndefined()
  })

  it('filtra por estado', async () => {
    const q = await consultaCon({ status: 'submitted' })
    expect(q.status).toBe('submitted')
  })

  it('filtra por centro de costo y por orden de trabajo', async () => {
    const q = await consultaCon({ projectId, ordenTrabajoId })
    expect(String(q.projectId)).toBe(projectId)
    expect(String(q.directaOrdenTrabajoId)).toBe(ordenTrabajoId)
  })

  // Un id basura llegado por la query no debe reventar el listado con un
  // CastError: simplemente no filtra.
  it('ignora un id invalido en vez de romper la consulta', async () => {
    const q = await consultaCon({ projectId: 'no-es-un-id', ordenTrabajoId: '123' })
    expect(q.projectId).toBeUndefined()
    expect(q.directaOrdenTrabajoId).toBeUndefined()
  })
})
