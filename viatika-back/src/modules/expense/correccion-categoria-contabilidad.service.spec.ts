import { Types } from 'mongoose'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ExpenseService } from './expense.service'

/**
 * Contabilidad corrige la categoría contable de un comprobante durante SU
 * etapa de revisión.
 *
 * Antes, una categoría mal elegida solo se podía arreglar rechazando la
 * rendición: el colaborador la corregía y el documento volvía a recorrer toda
 * la cadena de aprobadores. Como quien rinde no siempre tiene criterio
 * contable, ese reproceso era frecuente.
 *
 * Lo que estas pruebas fijan es el ALCANCE: solo la categoría, solo en
 * `pending_accounting` y solo dentro de la misma empresa. El resto del
 * comprobante sigue siendo del colaborador (VD-69).
 */
describe('ExpenseService.updateCategoryByContabilidad', () => {
  const clientId = new Types.ObjectId()
  const reportId = new Types.ObjectId()
  const expenseId = new Types.ObjectId()
  const categoriaVieja = new Types.ObjectId()
  const categoriaNueva = new Types.ObjectId()

  const actor = {
    userId: String(new Types.ObjectId()),
    roleName: 'Contabilidad',
    clientId: String(clientId),
  }

  type Opciones = {
    reportStatus?: string
    total?: number
    limit?: number
    acumuladoOtros?: number
    categoriaDelCliente?: boolean
  }

  const montar = (opts: Opciones = {}) => {
    const {
      reportStatus = 'pending_accounting',
      total = 100,
      limit = 0,
      acumuladoOtros = 0,
      categoriaDelCliente = true,
    } = opts

    const svc = Object.create(ExpenseService.prototype) as any
    const expense = {
      _id: expenseId,
      clientId,
      total,
      createdBy: new Types.ObjectId(), // otro usuario: el comprobante es ajeno
      expenseReportId: reportId,
      categoryId: { _id: categoriaVieja, name: 'Alimentación' },
      status: 'pending',
    }

    const actualizaciones: any[] = []
    svc.findOne = async () => expense
    svc.expenseReportService = {
      findOne: async () => ({ status: reportStatus }),
    }
    svc.categoryService = {
      findOne: async (id: string, cid: string) => {
        if (!categoriaDelCliente || cid !== String(clientId)) {
          throw new Error(`Categoría con ID ${id} no encontrada`)
        }
        return { _id: categoriaNueva, name: 'Servicios de terceros', limit }
      },
    }
    svc.expenseRepository = {
      aggregate: async () => [{ total: acumuladoOtros }],
      findOneAndUpdate: (_f: unknown, update: any) => {
        actualizaciones.push(update)
        return {
          populate: () => ({
            populate: () => ({
              exec: async () => ({ ...expense, ...update }),
            }),
          }),
        }
      },
    }

    return { svc, expense, actualizaciones }
  }

  it('cambia la categoría cuando la rendición está en revisión de Contabilidad', async () => {
    const { svc, actualizaciones } = montar()

    const { expense, categoriaAnterior } =
      await svc.updateCategoryByContabilidad(
        String(expenseId),
        String(categoriaNueva),
        actor
      )

    expect(String((expense as any).categoryId)).toBe(String(categoriaNueva))
    expect(categoriaAnterior).toBe('Alimentación')
    expect(actualizaciones).toHaveLength(1)
  })

  // El alcance es la categoría: monto, fecha y documento siguen siendo del
  // colaborador. Si esta lista crece, VD-69 quedó sin efecto.
  it('no toca ningún campo del comprobante salvo la categoría y su aviso de tope', async () => {
    const { svc, actualizaciones } = montar()

    await svc.updateCategoryByContabilidad(
      String(expenseId),
      String(categoriaNueva),
      actor
    )

    expect(Object.keys(actualizaciones[0]).sort()).toEqual([
      'categoryId',
      'categoryLimitPercent',
      'categoryLimitWarning',
    ])
  })

  describe('etapa del flujo', () => {
    const fueraDeContabilidad = [
      'open',
      'submitted',
      'approved',
      'rejected',
      'closed',
    ]

    for (const status of fueraDeContabilidad) {
      it(`la rechaza con la rendición en ${status}`, async () => {
        const { svc, actualizaciones } = montar({ reportStatus: status })

        await expect(
          svc.updateCategoryByContabilidad(
            String(expenseId),
            String(categoriaNueva),
            actor
          )
        ).rejects.toThrow(BadRequestException)
        expect(actualizaciones).toHaveLength(0)
      })
    }
  })

  it('no acepta una categoría de otra empresa', async () => {
    const { svc, actualizaciones } = montar({ categoriaDelCliente: false })

    await expect(
      svc.updateCategoryByContabilidad(
        String(expenseId),
        String(categoriaNueva),
        actor
      )
    ).rejects.toThrow('no encontrada')
    expect(actualizaciones).toHaveLength(0)
  })

  it('rechaza un id de comprobante mal formado', async () => {
    const { svc } = montar()

    await expect(
      svc.updateCategoryByContabilidad(
        'no-es-un-id',
        String(categoriaNueva),
        actor
      )
    ).rejects.toThrow(BadRequestException)
  })

  // El colaborador no entra por aquí: este endpoint es de la revisión contable.
  it('no deja a un colaborador tocar el comprobante de otro', async () => {
    const { svc, actualizaciones } = montar()

    await expect(
      svc.updateCategoryByContabilidad(
        String(expenseId),
        String(categoriaNueva),
        { ...actor, roleName: 'Colaborador' }
      )
    ).rejects.toThrow(ForbiddenException)
    expect(actualizaciones).toHaveLength(0)
  })

  it('elegir la misma categoría no escribe nada', async () => {
    const { svc, actualizaciones } = montar()
    svc.categoryService.findOne = async () => ({
      _id: categoriaVieja,
      name: 'Alimentación',
    })

    const { categoriaAnterior } = await svc.updateCategoryByContabilidad(
      String(expenseId),
      String(categoriaVieja),
      actor
    )

    expect(categoriaAnterior).toBe('Alimentación')
    expect(actualizaciones).toHaveLength(0)
  })

  describe('aviso de presupuesto de la categoría', () => {
    it('lo recalcula contra la categoría nueva', async () => {
      // Tope 1000, ya gastados 850 en la categoría destino, este gasto 100 → 95%.
      const { svc, actualizaciones } = montar({
        limit: 1000,
        acumuladoOtros: 850,
        total: 100,
      })

      await svc.updateCategoryByContabilidad(
        String(expenseId),
        String(categoriaNueva),
        actor
      )

      expect(actualizaciones[0].categoryLimitPercent).toBe(95)
      expect(actualizaciones[0].categoryLimitWarning).toContain('90%')
    })

    it('limpia el aviso heredado de la categoría anterior', async () => {
      const { svc, actualizaciones } = montar({ limit: 1000, acumuladoOtros: 0 })

      await svc.updateCategoryByContabilidad(
        String(expenseId),
        String(categoriaNueva),
        actor
      )

      expect(actualizaciones[0].categoryLimitWarning).toBeNull()
    })

    /**
     * El alta SÍ bloquea al 100%, pero aquí no: negarle a Contabilidad mover el
     * gasto a la categoría que corresponde porque esa categoría llegó a su tope
     * la dejaría sin la corrección y forzaría el reproceso que este cambio vino
     * a evitar. El tope es del presupuesto del colaborador, no de la
     * clasificación contable.
     */
    it('no bloquea aunque la categoría destino haya superado su tope', async () => {
      const { svc, actualizaciones } = montar({
        limit: 100,
        acumuladoOtros: 500,
        total: 100,
      })

      await svc.updateCategoryByContabilidad(
        String(expenseId),
        String(categoriaNueva),
        actor
      )

      expect(actualizaciones).toHaveLength(1)
      expect(actualizaciones[0].categoryLimitPercent).toBe(600)
    })
  })
})
