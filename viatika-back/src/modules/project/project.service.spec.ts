import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'
import { Types } from 'mongoose'
import { ProjectService } from './project.service'
import { Project } from './entities/project.entity'

const clientId = new Types.ObjectId().toString()
const projectId = new Types.ObjectId().toString()

const mockProject = {
  _id: new Types.ObjectId(projectId),
  name: 'Test Project',
  code: 'CC-001',
  isActive: true,
  clientName: undefined,
  committedAdvanceTotal: 0,
  clientId: { _id: new Types.ObjectId(clientId), name: 'Test Client' },
}

const expectedResponse = {
  _id: mockProject._id,
  name: mockProject.name,
  code: mockProject.code,
  isActive: mockProject.isActive,
  clientName: mockProject.clientName,
  committedAdvanceTotal: mockProject.committedAdvanceTotal,
  client: mockProject.clientId,
  approverLevels: [],
}

const makeQuery = (resolvedValue: any) => ({
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(resolvedValue),
})

const makeCountQuery = (count: number) => ({
  exec: jest.fn().mockResolvedValue(count),
})

const mockExpenseModel = {
  countDocuments: jest.fn().mockReturnValue(Promise.resolve(0)),
}

const mockProjectModel = {
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  countDocuments: jest.fn(),
  exists: jest.fn(),
  db: {
    model: jest.fn().mockReturnValue(mockExpenseModel),
  },
}

const mockLineaNegocioModel = { findOne: jest.fn() }
const mockUserModel = { findOne: jest.fn(), find: jest.fn(), exists: jest.fn() }

describe('ProjectService', () => {
  let service: ProjectService

  beforeEach(async () => {
    jest.clearAllMocks()
    mockProjectModel.db.model.mockReturnValue(mockExpenseModel)
    mockExpenseModel.countDocuments.mockReturnValue(Promise.resolve(0))
    mockProjectModel.findOne.mockReturnValue(makeQuery(null))
    mockLineaNegocioModel.findOne.mockReturnValue(makeQuery(null))
    mockUserModel.findOne.mockReturnValue(makeQuery(null))
    mockUserModel.find.mockReturnValue(makeQuery([]))
    mockProjectModel.find.mockReturnValue(makeQuery([]))
    mockProjectModel.exists.mockResolvedValue(null)
    mockUserModel.exists.mockResolvedValue(null)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: getModelToken(Project.name), useValue: mockProjectModel },
        {
          provide: getModelToken('LineaNegocio'),
          useValue: mockLineaNegocioModel,
        },
        { provide: getModelToken('User'), useValue: mockUserModel },
      ],
    }).compile()
    service = module.get<ProjectService>(ProjectService)
  })

  describe('findCajaChicaResponsibleIds', () => {
    const approverId = new Types.ObjectId().toString()

    it('junta a quienes lo tienen en sus niveles propios y a los que dependen del centro de costo, sin repetir', async () => {
      const conNivelesPropios = new Types.ObjectId()
      const porCentroDeCosto = new Types.ObjectId()
      mockUserModel.find
        .mockReturnValueOnce(makeQuery([{ _id: conNivelesPropios }]))
        .mockReturnValueOnce(makeQuery([{ _id: porCentroDeCosto }, { _id: conNivelesPropios }]))
      mockProjectModel.find.mockReturnValue(makeQuery([{ _id: new Types.ObjectId(projectId) }]))

      const ids = await service.findCajaChicaResponsibleIds(approverId, clientId)

      expect(ids).toEqual([String(conNivelesPropios), String(porCentroDeCosto)])
    })

    it('no consulta por centro de costo si el usuario no es aprobador de ninguno', async () => {
      mockUserModel.find.mockReturnValue(makeQuery([]))
      mockProjectModel.find.mockReturnValue(makeQuery([]))

      await expect(
        service.findCajaChicaResponsibleIds(approverId, clientId)
      ).resolves.toEqual([])
      // Solo la consulta de niveles propios.
      expect(mockUserModel.find).toHaveBeenCalledTimes(1)
    })

    it('el centro de costo solo alcanza a responsables SIN niveles propios', async () => {
      mockProjectModel.find.mockReturnValue(makeQuery([{ _id: new Types.ObjectId(projectId) }]))

      await service.findCajaChicaResponsibleIds(approverId, clientId)

      const filtroPorCentro = mockUserModel.find.mock.calls[1][0]
      expect(filtroPorCentro['permissions.approverLevels.userIds.0']).toEqual({ $exists: false })
    })
  })

  describe('isApproverForClient', () => {
    const approverId = new Types.ObjectId().toString()

    it('es aprobador si figura en los niveles de un centro de costo', async () => {
      mockProjectModel.exists.mockResolvedValue({ _id: new Types.ObjectId() })

      await expect(service.isApproverForClient(approverId, clientId)).resolves.toBe(true)
      // Corta en la primera fuente: no hace falta consultar usuarios.
      expect(mockUserModel.exists).not.toHaveBeenCalled()
    })

    it('es aprobador si solo figura en los niveles propios de un colaborador (regla 1.10)', async () => {
      mockUserModel.exists.mockResolvedValue({ _id: new Types.ObjectId() })

      await expect(service.isApproverForClient(approverId, clientId)).resolves.toBe(true)
      expect(mockUserModel.exists).toHaveBeenCalledWith({
        clientId: new Types.ObjectId(clientId),
        'permissions.approverLevels.userIds': new Types.ObjectId(approverId),
      })
    })

    it('no es aprobador si no figura en ninguna de las dos fuentes', async () => {
      await expect(service.isApproverForClient(approverId, clientId)).resolves.toBe(false)
      expect(mockProjectModel.exists).toHaveBeenCalled()
      expect(mockUserModel.exists).toHaveBeenCalled()
    })

    it('devuelve false con ids inválidos sin consultar la base', async () => {
      await expect(service.isApproverForClient('no-es-un-id', clientId)).resolves.toBe(false)
      await expect(service.isApproverForClient(approverId, 'no-es-un-id')).resolves.toBe(false)
      expect(mockProjectModel.exists).not.toHaveBeenCalled()
      expect(mockUserModel.exists).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    it('creates a project with clientId as ObjectId', async () => {
      mockProjectModel.create.mockResolvedValue(mockProject)
      const result = await service.create({ name: 'Test Project', clientId })
      expect(mockProjectModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Project',
          clientId: expect.any(Types.ObjectId),
        })
      )
      expect(result).toEqual(expectedResponse)
    })

    it('generates code from name when code is not provided', async () => {
      mockProjectModel.create.mockResolvedValue({
        ...mockProject,
        code: 'MY-PROJECT',
      })
      await service.create({ name: 'My Project', clientId })
      expect(mockProjectModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'MY-PROJECT' })
      )
    })

    it('uses provided code when given', async () => {
      mockProjectModel.create.mockResolvedValue({
        ...mockProject,
        code: 'CUSTOM',
      })
      await service.create({ name: 'Any', code: 'CUSTOM', clientId })
      expect(mockProjectModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CUSTOM' })
      )
    })

    it('throws a friendly error when the code already exists', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(mockProject))

      await expect(
        service.create({ name: 'Duplicado', code: 'CC-001', clientId })
      ).rejects.toThrow(
        new BadRequestException(
          'Ya existe un centro de costo con el código "CC-001". Usa un código diferente.'
        )
      )
      expect(mockProjectModel.create).not.toHaveBeenCalled()
    })
  })

  describe('findAll', () => {
    it('returns mapped list of projects for a client', async () => {
      mockProjectModel.find.mockReturnValue(makeQuery([mockProject]))
      mockProjectModel.countDocuments.mockReturnValue(makeCountQuery(1))
      const result = await service.findAll(clientId)
      expect(mockProjectModel.find).toHaveBeenCalledWith({
        clientId: expect.any(Types.ObjectId),
      })
      expect(result).toEqual([expectedResponse])
    })

    it('returns empty array when no projects exist', async () => {
      mockProjectModel.find.mockReturnValue(makeQuery([]))
      mockProjectModel.countDocuments.mockReturnValue(makeCountQuery(0))
      const result = await service.findAll(clientId)
      expect(result).toEqual([])
    })

    it('returns paginated result when page/limit opts are provided', async () => {
      mockProjectModel.find.mockReturnValue(makeQuery([mockProject]))
      mockProjectModel.countDocuments.mockReturnValue(makeCountQuery(25))
      const result = (await service.findAll(clientId, {
        page: 2,
        limit: 10,
      })) as any
      expect(result.data).toEqual([expectedResponse])
      expect(result.total).toBe(25)
      expect(result.page).toBe(2)
      expect(result.limit).toBe(10)
      expect(result.pages).toBe(3)
    })

    it('filters by isActive when provided', async () => {
      mockProjectModel.find.mockReturnValue(makeQuery([]))
      mockProjectModel.countDocuments.mockReturnValue(makeCountQuery(0))
      await service.findAll(clientId, { isActive: false })
      expect(mockProjectModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false })
      )
    })

    it('filters by search text when provided', async () => {
      mockProjectModel.find.mockReturnValue(makeQuery([]))
      mockProjectModel.countDocuments.mockReturnValue(makeCountQuery(0))
      await service.findAll(clientId, { search: 'alpha' })
      expect(mockProjectModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ $or: expect.any(Array) })
      )
    })
  })

  describe('findOne', () => {
    it('returns the project when found', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(mockProject))
      const result = await service.findOne(projectId, clientId)
      expect(result).toEqual(expectedResponse)
    })

    it('throws NotFoundException when project does not exist', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(null))
      await expect(service.findOne(projectId, clientId)).rejects.toThrow(
        NotFoundException
      )
    })
  })

  describe('update', () => {
    it('returns updated project', async () => {
      const updated = { ...mockProject, name: 'Updated' }
      mockProjectModel.findOneAndUpdate.mockReturnValue(makeQuery(updated))
      const result = await service.update(
        projectId,
        { name: 'Updated' },
        clientId
      )
      expect(result).toEqual({ ...expectedResponse, name: 'Updated' })
    })

    it('throws NotFoundException when project not found for update', async () => {
      mockProjectModel.findOneAndUpdate.mockReturnValue(makeQuery(null))
      await expect(
        service.update(projectId, { name: 'X' }, clientId)
      ).rejects.toThrow(NotFoundException)
    })

    it('permite desactivar aunque el centro de costo tenga comprobantes', async () => {
      // Antes esto lanzaba BadRequestException. La guarda estaba en la operación
      // equivocada: desactivar conserva el historial y es el caso de uso; al
      // bloquearla, el admin terminaba eliminando el centro de costo, que sí es
      // destructivo e irreversible.
      mockExpenseModel.countDocuments.mockReturnValue(Promise.resolve(3))
      const updated = { ...mockProject, isActive: false }
      mockProjectModel.findOneAndUpdate.mockReturnValue(makeQuery(updated))

      const result = await service.update(
        projectId,
        { isActive: false },
        clientId
      )

      expect(result).toEqual({ ...expectedResponse, isActive: false })
    })

    it('proceeds with deactivation when no active expenses exist', async () => {
      mockExpenseModel.countDocuments.mockReturnValue(Promise.resolve(0))
      const updated = { ...mockProject, isActive: false }
      mockProjectModel.findOneAndUpdate.mockReturnValue(makeQuery(updated))
      const result = await service.update(
        projectId,
        { isActive: false },
        clientId
      )
      expect(result).toEqual({ ...expectedResponse, isActive: false })
    })

    it('throws a friendly error when updating with a duplicate code from another record', async () => {
      mockProjectModel.findOne.mockReturnValue(
        makeQuery({ ...mockProject, _id: new Types.ObjectId() })
      )

      await expect(
        service.update(projectId, { code: 'CC-001' }, clientId)
      ).rejects.toThrow(
        new BadRequestException(
          'Ya existe un centro de costo con el código "CC-001". Usa un código diferente.'
        )
      )
      expect(mockProjectModel.findOneAndUpdate).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    /** Cuenta distinta por modelo, para verificar el desglose del mensaje. */
    const conReferencias = (porModelo: Record<string, number>) => {
      mockProjectModel.db.model.mockImplementation((nombre: string) => ({
        countDocuments: jest
          .fn()
          .mockResolvedValue(porModelo[nombre] ?? 0),
      }))
    }

    it('elimina el centro de costo cuando nadie lo referencia', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(mockProject))
      conReferencias({})
      mockProjectModel.findOneAndDelete.mockReturnValue(makeQuery(mockProject))

      const result = await service.remove(projectId, clientId)

      expect(result).toEqual(mockProject)
      expect(mockProjectModel.findOneAndDelete).toHaveBeenCalled()
    })

    it('throws NotFoundException when project not found for delete', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(null))
      await expect(service.remove(projectId, clientId)).rejects.toThrow(
        NotFoundException
      )
    })

    it('rechaza el borrado si algún usuario lo tiene asignado', async () => {
      // Es el caso del incidente: borrar el centro de costo dejaba a esos
      // usuarios sin poder registrar gastos, y no se puede deshacer recreándolo
      // porque el `_id` sería otro.
      mockProjectModel.findOne.mockReturnValue(makeQuery(mockProject))
      conReferencias({ User: 3 })

      await expect(service.remove(projectId, clientId)).rejects.toThrow(
        ConflictException
      )
      expect(mockProjectModel.findOneAndDelete).not.toHaveBeenCalled()
    })

    it('rechaza el borrado si hay comprobantes, rendiciones u OTs', async () => {
      for (const modelo of [
        'Expense',
        'ExpenseReport',
        'Advance',
        'Invoice',
        'OrdenTrabajo',
      ]) {
        jest.clearAllMocks()
        mockProjectModel.findOne.mockReturnValue(makeQuery(mockProject))
        conReferencias({ [modelo]: 1 })

        await expect(service.remove(projectId, clientId)).rejects.toThrow(
          ConflictException
        )
        expect(mockProjectModel.findOneAndDelete).not.toHaveBeenCalled()
      }
    })

    it('el mensaje nombra el centro de costo, el desglose y sugiere desactivar', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(mockProject))
      conReferencias({ User: 3, Expense: 1, OrdenTrabajo: 1 })

      await expect(service.remove(projectId, clientId)).rejects.toThrow(
        /Test Project.*3 usuarios.*1 comprobante.*1 orden de trabajo.*Desactívalo/s
      )
    })
  })

  describe('countReferences', () => {
    it('cuenta cada documento una sola vez, aunque lo referencie por dos campos', async () => {
      const consultas: Record<string, unknown> = {}
      mockProjectModel.db.model.mockImplementation((nombre: string) => ({
        countDocuments: jest.fn().mockImplementation((filtro: unknown) => {
          consultas[nombre] = filtro
          return Promise.resolve(
            { User: 2, Expense: 1, OrdenTrabajo: 4 }[nombre] ?? 0
          )
        }),
      }))

      const refs = await service.countReferences(projectId, clientId)

      expect(refs.usuarios).toBe(2)
      expect(refs.comprobantes).toBe(1)
      expect(refs.ordenesTrabajo).toBe(4)
      expect(refs.rendiciones).toBe(0)
      expect(refs.total).toBe(7)

      // Los tres campos del comprobante viajan en un solo $or.
      expect((consultas['Expense'] as { $or: unknown[] }).$or).toHaveLength(3)
    })

    it('devuelve todo en cero si no hay referencias', async () => {
      mockProjectModel.db.model.mockImplementation(() => ({
        countDocuments: jest.fn().mockResolvedValue(0),
      }))
      const refs = await service.countReferences(projectId, clientId)
      expect(refs.total).toBe(0)
    })

    it('no explota si un modelo no está registrado', async () => {
      mockProjectModel.db.model.mockImplementation(() => {
        throw new Error('Schema hasn\'t been registered for model')
      })
      const refs = await service.countReferences(projectId, clientId)
      expect(refs.total).toBe(0)
    })
  })

  describe('adjustCommittedAdvanceTotal', () => {
    it('increments committed budget with positive delta', async () => {
      const updatedDoc = {
        ...mockProject,
        committedAdvanceTotal: 250,
        save: jest.fn().mockResolvedValue(undefined),
      }
      mockProjectModel.findOneAndUpdate.mockReturnValue(makeQuery(updatedDoc))

      await service.adjustCommittedAdvanceTotal(projectId, clientId, 250)

      expect(mockProjectModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: expect.any(Types.ObjectId),
          clientId: expect.any(Types.ObjectId),
        },
        { $inc: { committedAdvanceTotal: 250 } },
        { new: true }
      )
      expect(updatedDoc.save).not.toHaveBeenCalled()
    })

    it('clamps to zero when delta would make total negative', async () => {
      const updatedDoc = {
        ...mockProject,
        committedAdvanceTotal: -10,
        save: jest.fn().mockResolvedValue(undefined),
      }
      mockProjectModel.findOneAndUpdate.mockReturnValue(makeQuery(updatedDoc))

      await service.adjustCommittedAdvanceTotal(projectId, clientId, -50)

      expect(updatedDoc.committedAdvanceTotal).toBe(0)
      expect(updatedDoc.save).toHaveBeenCalled()
    })

    it('is a no-op when delta is 0', async () => {
      await service.adjustCommittedAdvanceTotal(projectId, clientId, 0)
      expect(mockProjectModel.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when project not found during adjustment', async () => {
      mockProjectModel.findOneAndUpdate.mockReturnValue(makeQuery(null))
      await expect(
        service.adjustCommittedAdvanceTotal(projectId, clientId, 100)
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('bulkImport', () => {
    it('creates projects from valid rows', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(null))
      mockProjectModel.create.mockResolvedValue(mockProject)

      const result = await service.bulkImport(
        [{ 'Nombre Proyecto': 'Alpha', Código: 'ALPHA-01' }],
        clientId
      )

      expect(result.created).toBe(1)
      expect(result.skipped).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    })

    it('skips rows with an existing code', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(mockProject))

      const result = await service.bulkImport(
        [{ 'Nombre Proyecto': 'Alpha', Código: 'CC-001' }],
        clientId
      )

      expect(result.skipped).toContain('CC-001')
      expect(result.created).toBe(0)
    })

    it('records errors for rows without a name', async () => {
      const result = await service.bulkImport([{ Código: 'X' }], clientId)
      expect(result.errors).toHaveLength(1)
    })

    it('records errors when create throws', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(null))
      mockProjectModel.create.mockRejectedValue(new Error('DB error'))

      const result = await service.bulkImport(
        [{ 'Nombre Proyecto': 'Fail Project' }],
        clientId
      )

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('DB error')
    })

    it('handles multiple rows mixing create, skip, and error', async () => {
      mockProjectModel.findOne
        .mockReturnValueOnce(makeQuery(null))
        .mockReturnValueOnce(makeQuery(mockProject))
      mockProjectModel.create.mockResolvedValueOnce(mockProject)

      const result = await service.bulkImport(
        [
          { 'Nombre Proyecto': 'New' },
          { 'Nombre Proyecto': 'Existing', Código: 'CC-001' },
          {},
        ],
        clientId
      )

      expect(result.created).toBe(1)
      expect(result.skipped).toHaveLength(1)
      expect(result.errors).toHaveLength(1)
    })

    it('resolves "Línea de Negocio" by name and passes its ObjectId through', async () => {
      const lineaId = new Types.ObjectId()
      mockProjectModel.findOne.mockReturnValue(makeQuery(null))
      mockLineaNegocioModel.findOne.mockReturnValue(
        makeQuery({ _id: lineaId })
      )
      mockProjectModel.create.mockResolvedValue(mockProject)

      const result = await service.bulkImport(
        [{ 'Nombre Proyecto': 'Alpha', 'Línea de Negocio': 'Construcción' }],
        clientId
      )

      expect(result.created).toBe(1)
      expect(mockProjectModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ lineaNegocioId: lineaId })
      )
    })

    it('errors the row when "Línea de Negocio" text does not match any record', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(null))
      mockLineaNegocioModel.findOne.mockReturnValue(makeQuery(null))

      const result = await service.bulkImport(
        [{ 'Nombre Proyecto': 'Alpha', 'Línea de Negocio': 'Inexistente' }],
        clientId
      )

      expect(result.created).toBe(0)
      expect(mockProjectModel.create).not.toHaveBeenCalled()
      expect(result.errors[0]).toContain('línea de negocio')
    })

    it('resolves "Aprobador N1"/"Aprobador N2" emails to approverLevels', async () => {
      const n1Id = new Types.ObjectId()
      const n2Id = new Types.ObjectId()
      mockProjectModel.findOne.mockReturnValue(makeQuery(null))
      mockUserModel.findOne
        .mockReturnValueOnce(makeQuery({ _id: n1Id }))
        .mockReturnValueOnce(makeQuery({ _id: n2Id }))
      mockProjectModel.create.mockResolvedValue(mockProject)

      const result = await service.bulkImport(
        [
          {
            'Nombre Proyecto': 'Alpha',
            'Aprobador N1': 'n1@empresa.com',
            'Aprobador N2': 'n2@empresa.com',
          },
        ],
        clientId
      )

      expect(result.created).toBe(1)
      expect(mockProjectModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          approverLevels: [
            { level: 1, userIds: [n1Id] },
            { level: 2, userIds: [n2Id] },
          ],
        })
      )
    })

    it('errors the row (does not silently drop) when an approver email is not found', async () => {
      mockProjectModel.findOne.mockReturnValue(makeQuery(null))
      mockUserModel.findOne.mockReturnValue(makeQuery(null))
    mockUserModel.find.mockReturnValue(makeQuery([]))
    mockProjectModel.find.mockReturnValue(makeQuery([]))

      const result = await service.bulkImport(
        [{ 'Nombre Proyecto': 'Alpha', 'Aprobador N1': 'ghost@empresa.com' }],
        clientId
      )

      expect(result.created).toBe(0)
      expect(mockProjectModel.create).not.toHaveBeenCalled()
      expect(result.errors[0]).toContain('ghost@empresa.com')
    })
  })
})
