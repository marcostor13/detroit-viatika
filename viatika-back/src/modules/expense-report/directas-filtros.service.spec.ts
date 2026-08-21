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
          exec: async () => filas,
        }
        return cadena
      },
    }
  })

  let filas: any[] = []

  const consultaCon = async (filtros: any) => {
    filas = []
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

  /**
   * VD-122. Este endpoint no devuelve el documento: arma un objeto campo a
   * campo. Poblar en la consulta no basta — hay que listarlos en la respuesta, y
   * eso es justo lo que se olvido la primera vez: el populate estaba puesto y la
   * columna igual salia vacia.
   */
  describe('respuesta: centro de costo y OT (VD-122)', () => {
    it('devuelve el centro de costo y la OT poblados', async () => {
      filas = [
        {
          _id: new Types.ObjectId(),
          status: 'submitted',
          projectId: { _id: projectId, code: '9101', name: 'Administracion' },
          directaOrdenTrabajoId: { _id: ordenTrabajoId, nombre: 'SMI-001' },
          expenseIds: [],
        },
      ]
      const [fila]: any = await service.findDirectRendicionReports(clientId, {})
      expect(fila.projectId?.code).toBe('9101')
      expect(fila.directaOrdenTrabajoId?.nombre).toBe('SMI-001')
    })

    it('sin OT devuelve null, no undefined: la columna muestra el guion', async () => {
      filas = [{ _id: new Types.ObjectId(), status: 'open', expenseIds: [] }]
      const [fila]: any = await service.findDirectRendicionReports(clientId, {})
      expect(fila.directaOrdenTrabajoId).toBeNull()
      expect(fila.projectId).toBeNull()
    })
  })
})
