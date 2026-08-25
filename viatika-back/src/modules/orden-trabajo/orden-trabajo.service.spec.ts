import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Types } from 'mongoose'
import { OrdenTrabajoService } from './orden-trabajo.service'
import { OrdenTrabajo } from './entities/orden-trabajo.entity'
import { Project } from '../project/entities/project.entity'

const clientId = new Types.ObjectId().toString()
const costCenterId = new Types.ObjectId().toString()
const ordenId = new Types.ObjectId().toString()

const mockOrden = {
  _id: new Types.ObjectId(ordenId),
  nombre: 'Lim-Com-1',
  costCenterId: new Types.ObjectId(costCenterId),
  isActive: true,
  clientId: new Types.ObjectId(clientId),
}

const makeQuery = (resolvedValue: any) => ({
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(resolvedValue),
})

const mockOrdenTrabajoModel = {
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  updateOne: jest.fn(),
  countDocuments: jest.fn(),
  exists: jest.fn(),
}

const mockProjectModel = {
  exists: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
}

describe('OrdenTrabajoService', () => {
  let service: OrdenTrabajoService

  beforeEach(async () => {
    jest.clearAllMocks()
    mockOrdenTrabajoModel.exists.mockReturnValue(makeQuery(null))
    // Por defecto la OT del archivo no existe todavía: la carga masiva la busca
    // por nombre para decidir si actualiza o crea.
    mockOrdenTrabajoModel.findOne.mockReturnValue(makeQuery(null))
    mockOrdenTrabajoModel.updateOne.mockReturnValue(makeQuery({ acknowledged: true }))
    mockProjectModel.exists.mockReturnValue(makeQuery({ _id: costCenterId }))
    mockProjectModel.findOne.mockReturnValue(makeQuery(null))
    // Los códigos que se muestran en el detalle de cada fila.
    mockProjectModel.find.mockReturnValue(makeQuery([]))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdenTrabajoService,
        {
          provide: getModelToken(OrdenTrabajo.name),
          useValue: mockOrdenTrabajoModel,
        },
        { provide: getModelToken(Project.name), useValue: mockProjectModel },
      ],
    }).compile()
    service = module.get<OrdenTrabajoService>(OrdenTrabajoService)
  })

  describe('create', () => {
    it('creates an OT when the cost center exists and the name is unique', async () => {
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)
      const result = await service.create(
        { nombre: 'Lim-Com-1', costCenterId },
        clientId
      )
      expect(mockOrdenTrabajoModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Lim-Com-1', isActive: true })
      )
      expect(result).toEqual(mockOrden)
    })

    it('rejects when the cost center does not belong to the company', async () => {
      mockProjectModel.exists.mockReturnValue(makeQuery(null))
      await expect(
        service.create({ nombre: 'X', costCenterId }, clientId)
      ).rejects.toThrow(BadRequestException)
    })

    it('rejects a duplicate name within the same company (case-insensitive)', async () => {
      mockOrdenTrabajoModel.exists.mockReturnValue(makeQuery(mockOrden))
      await expect(
        service.create({ nombre: 'lim-com-1', costCenterId }, clientId)
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('findOne', () => {
    it('throws NotFoundException when not found', async () => {
      mockOrdenTrabajoModel.findOne.mockReturnValue(makeQuery(null))
      await expect(service.findOne(ordenId, clientId)).rejects.toThrow(
        NotFoundException
      )
    })
  })

  describe('bulkCreate', () => {
    it('reports a row error when nombre is missing', async () => {
      const result = await service.bulkCreate(
        [{ nombre: '', costCenterKey: 'CC-001' }],
        clientId
      )
      expect(result.created).toBe(0)
      expect(result.errors).toEqual([
        { row: 2, reason: 'El campo Nombre es obligatorio' },
      ])
    })

    it('reports a row error when costCenterKey is missing on a new OT', async () => {
      const result = await service.bulkCreate(
        [{ nombre: 'Lim-Com-1', costCenterKey: '' }],
        clientId
      )
      expect(result.errors).toEqual([
        { row: 2, reason: 'Indica el código del centro de costo' },
      ])
    })

    it('resolves the cost center by code first', async () => {
      const ccId = new Types.ObjectId()
      mockProjectModel.findOne
        .mockReturnValueOnce(makeQuery({ _id: ccId })) // code lookup hits
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      const result = await service.bulkCreate(
        [{ nombre: 'Lim-Com-1', costCenterKey: 'CC-001' }],
        clientId
      )

      expect(result.created).toBe(1)
      expect(mockOrdenTrabajoModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ costCenterId: ccId })
      )
    })

    it('falls back to matching the cost center by name when the code does not match', async () => {
      const ccId = new Types.ObjectId()
      mockProjectModel.findOne
        .mockReturnValueOnce(makeQuery(null)) // code miss
        .mockReturnValueOnce(makeQuery({ _id: ccId })) // name hit
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      const result = await service.bulkCreate(
        [{ nombre: 'Lim-Com-1', costCenterKey: 'Centro Principal' }],
        clientId
      )

      expect(result.created).toBe(1)
      expect(mockOrdenTrabajoModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ costCenterId: ccId })
      )
    })

    it('errors the row (does not abort the batch) when the cost center is not found', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(null))
    // Los códigos que se muestran en el detalle de cada fila.
    mockProjectModel.find.mockReturnValue(makeQuery([]))
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      const result = await service.bulkCreate(
        [
          { nombre: 'Fila mala', costCenterKey: 'NO-EXISTE' },
          { nombre: 'Fila buena', costCenterKey: 'NO-EXISTE-2' },
        ],
        clientId
      )

      expect(result.created).toBe(0)
      expect(result.errors).toHaveLength(2)
      expect(result.errors[0].reason).toContain('no encontrado')
    })

    it('rejects a name repeated within the same file without querying the DB twice', async () => {
      const ccId = new Types.ObjectId()
      mockProjectModel.findOne.mockReturnValue(makeQuery({ _id: ccId }))
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      const result = await service.bulkCreate(
        [
          { nombre: 'Lim-Com-1', costCenterKey: 'CC-001' },
          { nombre: 'lim-com-1', costCenterKey: 'CC-001' },
        ],
        clientId
      )

      expect(result.created).toBe(1)
      expect(result.errors).toEqual([
        { row: 3, reason: 'Nombre "lim-com-1" repetido en este mismo archivo' },
      ])
    })

    // La plantilla se descarga con las OT existentes, así que una fila repetida
    // no es un error: es una edición (VD-101).
    it('actualiza la OT que ya existe en vez de fallar por duplicada', async () => {
      const ccId = new Types.ObjectId()
      mockProjectModel.findOne.mockReturnValue(makeQuery({ _id: ccId }))
      mockOrdenTrabajoModel.findOne.mockReturnValue(makeQuery(mockOrden))

      const result = await service.bulkCreate(
        [{ nombre: 'Lim-Com-1', costCenterKey: 'CC-001', isActive: false }],
        clientId
      )

      expect(result).toEqual(
        expect.objectContaining({ created: 0, updated: 1, unchanged: 0, errors: [] })
      )
      expect(mockOrdenTrabajoModel.create).not.toHaveBeenCalled()
      expect(mockOrdenTrabajoModel.updateOne).toHaveBeenCalledWith(
        { _id: mockOrden._id },
        { $set: { costCenterIds: [ccId], costCenterId: ccId, isActive: false } }
      )
    })

    it('sin centro de costo en la fila, la OT existente conserva los suyos', async () => {
      mockOrdenTrabajoModel.findOne.mockReturnValue(makeQuery(mockOrden))

      const result = await service.bulkCreate(
        [{ nombre: 'Lim-Com-1', costCenterKey: '', isActive: false }],
        clientId
      )

      expect(result.updated).toBe(1)
      expect(mockOrdenTrabajoModel.updateOne).toHaveBeenCalledWith(
        { _id: mockOrden._id },
        { $set: { isActive: false } }
      )
    })

    it('sin la columna Activo no toca el estado de la OT existente', async () => {
      const ccId = new Types.ObjectId()
      mockProjectModel.findOne.mockReturnValue(makeQuery({ _id: ccId }))
      mockOrdenTrabajoModel.findOne.mockReturnValue(makeQuery(mockOrden))

      await service.bulkCreate(
        [{ nombre: 'Lim-Com-1', costCenterKey: 'CC-001' }],
        clientId
      )

      const cambios = mockOrdenTrabajoModel.updateOne.mock.calls[0][1].$set
      expect(cambios.isActive).toBeUndefined()
    })

    it('defaults isActive to true when not provided', async () => {
      const ccId = new Types.ObjectId()
      mockProjectModel.findOne.mockReturnValue(makeQuery({ _id: ccId }))
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      await service.bulkCreate(
        [{ nombre: 'Lim-Com-1', costCenterKey: 'CC-001' }],
        clientId
      )

      expect(mockOrdenTrabajoModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true })
      )
    })

    it('admite varios centros de costo en la misma celda', async () => {
      const cc1 = new Types.ObjectId()
      const cc2 = new Types.ObjectId()
      mockProjectModel.findOne
        .mockReturnValueOnce(makeQuery({ _id: cc1 }))
        .mockReturnValueOnce(makeQuery({ _id: cc2 }))
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      const result = await service.bulkCreate(
        [{ nombre: 'LIM-SMI-1', costCenterKey: '123, 223' }],
        clientId
      )

      expect(result.created).toBe(1)
      expect(mockOrdenTrabajoModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          costCenterId: cc1,
          costCenterIds: [cc1, cc2],
        })
      )
    })

    it('marca error en la fila si uno de los centros de costo no existe', async () => {
      const cc1 = new Types.ObjectId()
      mockProjectModel.findOne
        .mockReturnValueOnce(makeQuery({ _id: cc1 }))
        .mockReturnValueOnce(makeQuery(null)) // el segundo no está por code
        .mockReturnValueOnce(makeQuery(null)) // ni por name
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      const result = await service.bulkCreate(
        [{ nombre: 'LIM-SMI-1', costCenterKey: '123; NO-EXISTE' }],
        clientId
      )

      expect(result.created).toBe(0)
      expect(result.errors[0].reason).toContain('NO-EXISTE')
      expect(mockOrdenTrabajoModel.create).not.toHaveBeenCalled()
    })

    // El usuario acepta la carga viendo qué pasa fila por fila (VD: carga masiva
    // con confirmación), así que el resultado tiene que decirlo.
    it('devuelve el plan fila por fila: crear, actualizar y error', async () => {
      const ccId = new Types.ObjectId()
      mockProjectModel.findOne.mockReturnValue(makeQuery({ _id: ccId, code: '123' }))
      mockOrdenTrabajoModel.findOne
        .mockReturnValueOnce(makeQuery(null)) // la primera no existe: se crea
        .mockReturnValueOnce(makeQuery(mockOrden)) // la segunda ya existe
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      const result = await service.bulkCreate(
        [
          { nombre: 'NUEVA-1', costCenterKey: '123' },
          { nombre: 'Lim-Com-1', costCenterKey: '123', isActive: false },
          { nombre: '', costCenterKey: '123' },
        ],
        clientId
      )

      expect(result.rows.map((r) => r.accion)).toEqual([
        'crear',
        'actualizar',
        'error',
      ])
      expect(result.rows[0]).toEqual(
        expect.objectContaining({ row: 2, nombre: 'NUEVA-1' })
      )
      expect(result.rows[1].detalle).toContain('Activa → Inactiva')
      expect(result.rows[2].reason).toBe('El campo Nombre es obligatorio')
    })

    it('una fila que no cambia nada cuenta como sin-cambios y no toca la base', async () => {
      mockOrdenTrabajoModel.findOne.mockReturnValue(makeQuery(mockOrden))

      const result = await service.bulkCreate(
        [{ nombre: 'Lim-Com-1', costCenterKey: '', isActive: true }],
        clientId
      )

      expect(result.unchanged).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.rows[0].accion).toBe('sin-cambios')
      expect(mockOrdenTrabajoModel.updateOne).not.toHaveBeenCalled()
    })

    it('con dryRun cuenta lo que pasaría pero no escribe nada', async () => {
      const ccId = new Types.ObjectId()
      mockProjectModel.findOne.mockReturnValue(makeQuery({ _id: ccId, code: '123' }))
      mockOrdenTrabajoModel.findOne
        .mockReturnValueOnce(makeQuery(null))
        .mockReturnValueOnce(makeQuery(mockOrden))

      const result = await service.bulkCreate(
        [
          { nombre: 'NUEVA-1', costCenterKey: '123' },
          { nombre: 'Lim-Com-1', costCenterKey: '123', isActive: false },
        ],
        clientId,
        { dryRun: true }
      )

      expect(result).toEqual(
        expect.objectContaining({ created: 1, updated: 1, dryRun: true })
      )
      expect(mockOrdenTrabajoModel.create).not.toHaveBeenCalled()
      expect(mockOrdenTrabajoModel.updateOne).not.toHaveBeenCalled()
    })
  })

  // Una OT puede servir a varios centros de costo (p. ej. las OT "SMI" se usan
  // desde los cinco centros de SERVICIO MINERIA). El primero es el principal:
  // es el que muestran los reportes oficiales.
  describe('varios centros de costo por OT', () => {
    const cc1 = new Types.ObjectId().toString()
    const cc2 = new Types.ObjectId().toString()

    it('guarda la lista completa y deja el primero como principal', async () => {
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      await service.create(
        { nombre: 'LIM-SMI-1', costCenterIds: [cc1, cc2] },
        clientId
      )

      const payload = mockOrdenTrabajoModel.create.mock.calls[0][0]
      expect(String(payload.costCenterId)).toBe(cc1)
      expect(payload.costCenterIds.map(String)).toEqual([cc1, cc2])
    })

    it('acepta el costCenterId suelto y lo convierte en lista', async () => {
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      await service.create({ nombre: 'Lim-Com-1', costCenterId }, clientId)

      const payload = mockOrdenTrabajoModel.create.mock.calls[0][0]
      expect(String(payload.costCenterId)).toBe(costCenterId)
      expect(payload.costCenterIds.map(String)).toEqual([costCenterId])
    })

    it('no repite un centro de costo que llega dos veces', async () => {
      mockOrdenTrabajoModel.create.mockResolvedValue(mockOrden)

      await service.create(
        { nombre: 'LIM-SMI-2', costCenterId: cc1, costCenterIds: [cc1, cc2] },
        clientId
      )

      const payload = mockOrdenTrabajoModel.create.mock.calls[0][0]
      expect(payload.costCenterIds.map(String)).toEqual([cc1, cc2])
    })

    it('rechaza la creación sin ningún centro de costo', async () => {
      await expect(
        service.create({ nombre: 'Sin centro' } as any, clientId)
      ).rejects.toThrow(BadRequestException)
    })

    it('al editar reemplaza la lista y recalcula el principal', async () => {
      mockOrdenTrabajoModel.findOneAndUpdate.mockReturnValue(makeQuery(mockOrden))

      await service.update(ordenId, { costCenterIds: [cc2, cc1] }, clientId)

      const payload = mockOrdenTrabajoModel.findOneAndUpdate.mock.calls[0][1]
      expect(String(payload.costCenterId)).toBe(cc2)
      expect(payload.costCenterIds.map(String)).toEqual([cc2, cc1])
    })

    it('filtra por centro de costo mirando la lista, no solo el principal', async () => {
      mockOrdenTrabajoModel.find.mockReturnValue(makeQuery([]))
      mockOrdenTrabajoModel.countDocuments.mockReturnValue(makeQuery(0))

      await service.findAll(clientId, { costCenterId: cc2 })

      const filtro = mockOrdenTrabajoModel.find.mock.calls[0][0]
      expect(filtro.$or).toEqual([
        { costCenterIds: new Types.ObjectId(cc2) },
        { costCenterId: new Types.ObjectId(cc2) },
      ])
    })
  })
})
