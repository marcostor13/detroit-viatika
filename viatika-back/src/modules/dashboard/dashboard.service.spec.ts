import { Types } from 'mongoose'
import { DashboardService } from './dashboard.service'
import { ROLES } from '../auth/enums/roles.enum'

/**
 * El alcance de la vista es lo único del dashboard que decide qué datos ve
 * cada quien: un error aquí le enseña a un coordinador los centros de costo de
 * otro. El resto son sumas, que se validan contra la base.
 */
describe('DashboardService — alcance de la vista', () => {
  const clientId = new Types.ObjectId()
  const userId = new Types.ObjectId()
  const cc1 = new Types.ObjectId()
  const cc2 = new Types.ObjectId()

  const montar = (projectIds: string[] = []) => {
    const svc = Object.create(DashboardService.prototype) as any
    svc.userModel = {
      findById: () => ({
        select: () => ({
          lean: () => ({
            exec: async () => ({ permissions: { projectIds } }),
          }),
        }),
      }),
    }
    svc.reportModel = {
      find: () => ({
        select: () => ({ lean: () => ({ exec: async () => [] }) }),
      }),
    }
    svc.expenseModel = {
      find: () => ({
        select: () => ({ lean: () => ({ exec: async () => [] }) }),
      }),
    }
    return svc
  }

  it('Contabilidad ve la empresa completa', async () => {
    const svc = montar([cc1.toString()])
    const scope = await svc.resolveScope(clientId, {}, {
      userId: userId.toString(),
      role: ROLES.CONTABILIDAD,
    })
    expect(scope.restricted).toBe(false)
    expect(scope.projectIds).toBeUndefined()
    expect(scope.ownerId).toBeUndefined()
  })

  it('Administrador ve la empresa completa', async () => {
    const svc = montar([])
    const scope = await svc.resolveScope(clientId, {}, {
      userId: userId.toString(),
      role: ROLES.ADMIN,
    })
    expect(scope.restricted).toBe(false)
  })

  it('el Coordinador queda limitado a sus centros de costo', async () => {
    const svc = montar([cc1.toString(), cc2.toString()])
    const scope = await svc.resolveScope(clientId, {}, {
      userId: userId.toString(),
      role: ROLES.COORDINADOR,
    })
    expect(scope.restricted).toBe(true)
    expect(scope.projectIds.map((id: Types.ObjectId) => id.toString())).toEqual([
      cc1.toString(),
      cc2.toString(),
    ])
  })

  // Sin centros de costo asignados no hay gestión que supervisar: se le muestra
  // lo suyo en vez de abrirle la empresa entera.
  it('sin centros de costo asignados solo ve sus propios registros', async () => {
    const svc = montar([])
    const scope = await svc.resolveScope(clientId, {}, {
      userId: userId.toString(),
      role: ROLES.COLABORADOR,
    })
    expect(scope.restricted).toBe(true)
    expect(scope.projectIds).toBeUndefined()
    expect(scope.ownerId.toString()).toBe(userId.toString())
  })

  it('filtrar por un centro de costo permitido lo deja como único alcance', async () => {
    const svc = montar([cc1.toString(), cc2.toString()])
    const scope = await svc.resolveScope(
      clientId,
      { projectId: cc2.toString() },
      { userId: userId.toString(), role: ROLES.COORDINADOR }
    )
    expect(scope.projectIds.map((id: Types.ObjectId) => id.toString())).toEqual([
      cc2.toString(),
    ])
  })

  // Sin esto, escribir a mano el id de otro centro de costo en la URL saltaba
  // el recorte del rol.
  it('filtrar por un centro de costo ajeno no devuelve nada', async () => {
    const ajeno = new Types.ObjectId()
    const svc = montar([cc1.toString()])
    const scope = await svc.resolveScope(
      clientId,
      { projectId: ajeno.toString() },
      { userId: userId.toString(), role: ROLES.COORDINADOR }
    )
    expect(scope.projectIds).toEqual([])
  })

  it('Contabilidad sí puede filtrar por cualquier centro de costo', async () => {
    const svc = montar([])
    const scope = await svc.resolveScope(
      clientId,
      { projectId: cc1.toString() },
      { userId: userId.toString(), role: ROLES.CONTABILIDAD }
    )
    expect(scope.projectIds.map((id: Types.ObjectId) => id.toString())).toEqual([
      cc1.toString(),
    ])
  })
})

describe('DashboardService — armado de filtros', () => {
  const clientId = new Types.ObjectId()
  const svc = Object.create(DashboardService.prototype) as any
  const from = new Date('2026-01-01')
  const to = new Date('2026-12-31')

  it('el alcance por centros de costo entra en el match de gastos', () => {
    const cc = new Types.ObjectId()
    const match = svc.expenseMatch(
      clientId,
      {},
      { projectIds: [cc], restricted: true },
      from,
      to
    )
    expect(match.proyectId).toEqual({ $in: [cc] })
  })

  it('el alcance de "solo lo mío" filtra por el creador del comprobante', () => {
    const uid = new Types.ObjectId()
    const match = svc.expenseMatch(
      clientId,
      {},
      { ownerId: uid, restricted: true },
      from,
      to
    )
    expect(match.createdBy).toBe(uid.toString())
  })

  it('la OT se filtra en el propio comprobante', () => {
    const ot = new Types.ObjectId()
    const match = svc.expenseMatch(
      clientId,
      { ordenTrabajoId: ot.toString() },
      { restricted: false },
      from,
      to
    )
    expect(match.ordenTrabajoId).toEqual(ot)
  })

  // El departamento no existe como campo: se resuelve a una lista de reportes.
  it('el departamento se filtra por los reportes que resolvieron a él', () => {
    const rep = new Types.ObjectId()
    const match = svc.expenseMatch(
      clientId,
      { department: 'Loreto' },
      { reportIds: [rep], restricted: false },
      from,
      to
    )
    expect(match.expenseReportId).toEqual({ $in: [rep] })
  })

  it('un departamento sin reportes no arrastra gastos', () => {
    const match = svc.expenseMatch(
      clientId,
      { department: 'Tumbes' },
      { restricted: false },
      from,
      to
    )
    expect(match.expenseReportId).toEqual({ $in: [] })
  })

  it('las solicitudes se acotan a type=viatico', () => {
    const match = svc.solicitudMatch(clientId, {}, { restricted: false })
    expect(match.type).toBe('viatico')
    expect(match.$expr).toBeUndefined()
  })

  // Antes el filtro de colaborador se escribía después del recorte y lo pisaba:
  // con `?collaboratorId=<otro>` en la URL se veían los gastos de cualquiera.
  it('el filtro de colaborador no rompe el recorte a lo propio', () => {
    const propio = new Types.ObjectId()
    const otro = new Types.ObjectId()
    const scope = { ownerId: propio, restricted: true }

    const gastos = svc.expenseMatch(
      clientId,
      { collaboratorId: otro.toString() },
      scope,
      from,
      to
    )
    expect(gastos.createdBy).toEqual({ $in: [] })

    const solicitudes = svc.solicitudMatch(
      clientId,
      { collaboratorId: otro.toString() },
      scope
    )
    expect(solicitudes.userId).toEqual({ $in: [] })
  })

  it('acotado a lo propio, filtrarse a uno mismo sí devuelve datos', () => {
    const propio = new Types.ObjectId()
    const match = svc.expenseMatch(
      clientId,
      { collaboratorId: propio.toString() },
      { ownerId: propio, restricted: true },
      from,
      to
    )
    expect(match.createdBy).toBe(propio.toString())
  })

  it('sin recorte, el filtro de colaborador se aplica tal cual', () => {
    const otro = new Types.ObjectId()
    const match = svc.solicitudMatch(
      clientId,
      { collaboratorId: otro.toString() },
      { restricted: false }
    )
    expect(match.userId).toEqual(otro)
  })
})

describe('DashboardService — cálculos de salida', () => {
  const svc = Object.create(DashboardService.prototype) as any

  // El denominador es el gasto total del periodo, no la suma del top: los
  // porcentajes del gráfico no deben sumar 100 si hay categorías fuera del top.
  it('el porcentaje se calcula sobre el gasto total', () => {
    const rows = svc.withPct([{ amount: 25 }, { amount: 25 }], 100)
    expect(rows[0].pct).toBe(25)
    expect(rows[1].pct).toBe(25)
  })

  it('sin gasto total el porcentaje es 0 y no NaN', () => {
    expect(svc.withPct([{ amount: 0 }], 0)[0].pct).toBe(0)
  })

  it('los días se cuentan desde la fecha dada', () => {
    const hace5 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    expect(svc.diasDesde(hace5)).toBe(5)
    expect(svc.diasDesde(null)).toBe(0)
    expect(svc.diasDesde('no es fecha')).toBe(0)
  })

  it('la intersección de ids respeta el "sin filtro"', () => {
    const a = new Types.ObjectId()
    const b = new Types.ObjectId()
    expect(svc.intersectIds(undefined, undefined)).toBeUndefined()
    expect(svc.intersectIds([a], undefined)).toEqual([a])
    expect(svc.intersectIds(undefined, [b])).toEqual([b])
    expect(svc.intersectIds([a, b], [b])).toEqual([b])
    expect(svc.intersectIds([a], [b])).toEqual([])
  })
})

/**
 * La serie mensual es el gráfico que el cliente usa para ver cuánto de lo que
 * entregó ya está sustentado, así que importa contra qué mes se cuenta cada
 * cosa. En producción, agosto salía con S/ 20 mil solicitados y S/ 0 rendidos
 * porque los comprobantes de la única solicitud de agosto se subieron el 1 de
 * septiembre.
 */
describe('DashboardService — serie mensual', () => {
  const clientId = new Types.ObjectId()
  const solicitudAgosto = new Types.ObjectId()
  const range = {
    from: new Date('2026-08-01'),
    to: new Date('2026-09-30'),
    prevFrom: new Date('2026-06-01'),
    prevTo: new Date('2026-07-31'),
  }

  const montar = (opts: {
    solicitudes?: any[]
    gastoPorSolicitud?: any[]
    porTipo?: any[]
  }) => {
    const svc = Object.create(DashboardService.prototype) as any
    svc.reportModel = { aggregate: jest.fn(async () => opts.solicitudes ?? []) }
    svc.expenseModel = {
      aggregate: jest.fn(async (pipeline: any[]) => {
        const group = pipeline.find(s => s.$group)
        // El de gasto por solicitud agrupa por reporte; el de tipo, por mes.
        return group?.$group?._id === '$expenseReportId'
          ? (opts.gastoPorSolicitud ?? [])
          : (opts.porTipo ?? [])
      }),
    }
    return svc
  }

  it('cuenta la rendición en el mes de su solicitud, no en el del comprobante', async () => {
    const svc = montar({
      solicitudes: [{ _id: solicitudAgosto, month: '2026-08', amount: 700 }],
      gastoPorSolicitud: [{ _id: solicitudAgosto, amount: 1013.5 }],
      porTipo: [{ month: '2026-09', bucket: 'directas', amount: 500 }],
    })
    const series = await svc.aggregateMonthlySeries(clientId, {}, {}, range)

    expect(series).toEqual([
      {
        month: '2026-08',
        solicitudes: 700,
        rendicionSolicitud: 1013.5,
        directas: 0,
        cajaChica: 0,
      },
      {
        month: '2026-09',
        solicitudes: 0,
        rendicionSolicitud: 0,
        directas: 500,
        cajaChica: 0,
      },
    ])
  })

  // Si se acotara por la fecha del comprobante, el gasto del 1 de septiembre
  // quedaría fuera al mirar agosto y la barra volvería a cero.
  it('no acota el gasto de una solicitud por la fecha del comprobante', async () => {
    const svc = montar({
      solicitudes: [{ _id: solicitudAgosto, month: '2026-08', amount: 700 }],
      gastoPorSolicitud: [{ _id: solicitudAgosto, amount: 1013.5 }],
    })
    await svc.aggregateMonthlySeries(clientId, {}, {}, range)

    const pipeline = svc.expenseModel.aggregate.mock.calls
      .map((c: any[]) => c[0])
      .find((p: any[]) => p.find((s: any) => s.$group)?.$group?._id === '$expenseReportId')
    expect(pipeline[0].$match.createdAt).toBeUndefined()
    expect(pipeline[0].$match.expenseReportId).toEqual({
      $in: [solicitudAgosto],
    })
  })

  // La reposición de caja chica es un ExpenseReport type='viatico' pero no se
  // rinde: contarla inflaba "Solicitud de fondos" con plata que ninguna
  // "Rendición de solicitud" podía responder.
  it('deja la reposición de caja chica fuera de la barra de solicitudes', async () => {
    const svc = montar({ solicitudes: [] })
    await svc.aggregateMonthlySeries(clientId, {}, {}, range)

    const match = svc.reportModel.aggregate.mock.calls[0][0][0].$match
    expect(match.isSolicitudCajaChica).toEqual({ $ne: true })
    expect(match.type).toBe('viatico')
  })

  it('sin solicitudes no consulta el gasto de solicitudes', async () => {
    const svc = montar({ solicitudes: [] })
    await svc.aggregateMonthlySeries(clientId, {}, {}, range)

    const porReporte = svc.expenseModel.aggregate.mock.calls
      .map((c: any[]) => c[0])
      .filter((p: any[]) => p.find((s: any) => s.$group)?.$group?._id === '$expenseReportId')
    expect(porReporte).toEqual([])
  })
})
