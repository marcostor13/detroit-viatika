import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { BadRequestException } from '@nestjs/common'
import { Types } from 'mongoose'
import * as bcrypt from 'bcryptjs'
import { UserService } from './user.service'
import { User } from './schemas/user.schema'
import { Project } from '../project/entities/project.entity'
import { RoleService } from '../role/role.service'

jest.mock('bcryptjs')

const userId = new Types.ObjectId().toString()
const clientId = new Types.ObjectId().toString()
const roleId = new Types.ObjectId().toString()

const mockRoleAdmin = { _id: new Types.ObjectId(), name: 'Administrador' }
const mockRoleSuper = { _id: new Types.ObjectId(), name: 'Superadministrador' }

const mockUserDoc = {
  _id: new Types.ObjectId(userId),
  email: 'user@example.com',
  name: 'Test User',
  password: 'hashed',
  roleId: mockRoleAdmin,
  clientId: new Types.ObjectId(clientId),
  isActive: true,
  permissions: { modules: [], canApproveL1: false, canApproveL2: false },
}

const makeChain = (resolvedValue: any) => ({
  populate: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(resolvedValue),
  then: (res: any, rej: any) => Promise.resolve(resolvedValue).then(res, rej),
  catch: (rej: any) => Promise.resolve(resolvedValue).catch(rej),
})

/** `findById(id).select(...).exec()` — la lectura del estado previo en `update`. */
const makeSelectChain = (resolvedValue: any) => ({
  select: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(resolvedValue),
})

const mockUserModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}

/** Solo lectura: la carga masiva resuelve centros de costo por código/nombre. */
const mockProjectModel = {
  findOne: jest.fn(),
}

const mockRoleService = {
  getAdminRoles: jest.fn(),
}

describe('UserService', () => {
  let service: UserService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Project.name), useValue: mockProjectModel },
        { provide: RoleService, useValue: mockRoleService },
      ],
    }).compile()
    service = module.get<UserService>(UserService)
  })

  describe('findAllWithClient', () => {
    it('returns mapped users with role and client', async () => {
      mockUserModel.find.mockReturnValue(makeChain([mockUserDoc]))
      const result = await service.findAllWithClient()
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        email: 'user@example.com',
        isActive: true,
      })
    })
  })

  describe('findByEmail', () => {
    it('returns user when found', async () => {
      mockUserModel.findOne.mockReturnValue(makeChain(mockUserDoc))
      const result = await service.findByEmail('user@example.com')
      expect(result).not.toBeNull()
      expect(result!.email).toBe('user@example.com')
      expect(result!.password).toBe('hashed')
    })

    it('returns null when not found', async () => {
      mockUserModel.findOne.mockReturnValue(makeChain(null))
      const result = await service.findByEmail('missing@example.com')
      expect(result).toBeNull()
    })
  })

  describe('findOne', () => {
    it('returns user by ID', async () => {
      mockUserModel.findById.mockReturnValue(makeChain(mockUserDoc))
      const result = await service.findOne(userId)
      expect(result).toMatchObject({ email: 'user@example.com' })
    })

    it('returns empty object when user not found', async () => {
      mockUserModel.findById.mockReturnValue(makeChain(null))
      const result = await service.findOne(userId)
      expect(result).toEqual({})
    })
  })

  describe('create', () => {
    const dto = {
      email: 'new@example.com',
      password: 'plain123',
      name: 'New User',
      roleId,
      clientId,
    }

    it('auto-genera contraseña temporal y crea usuario', async () => {
      ;(bcrypt.hash as jest.Mock).mockResolvedValue('hashed_pw')
      mockUserModel.findOne.mockReturnValue(makeChain(null))
      mockUserModel.create.mockResolvedValue({ _id: new Types.ObjectId() })
      mockUserModel.findById.mockReturnValue(makeChain(mockUserDoc))
      const result = await service.create(dto)
      // La contraseña que se hashea es la temporal generada automáticamente, no la del DTO
      expect(bcrypt.hash).toHaveBeenCalledWith(expect.any(String), 10)
      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'hashed_pw',
          mustChangePassword: true,
        })
      )
      expect(result).toMatchObject({ email: 'user@example.com' })
      expect((result as any).temporaryPassword).toBeDefined()
    })

    it('throws BadRequestException when email already registered', async () => {
      mockUserModel.findOne.mockReturnValue(makeChain(mockUserDoc))
      await expect(service.create(dto)).rejects.toThrow(BadRequestException)
      await expect(service.create(dto)).rejects.toThrow(
        'El correo ya se encuentra registrado'
      )
    })
  })

  describe('findAll', () => {
    it('returns list of users for a clientId', async () => {
      mockUserModel.find.mockReturnValue(makeChain([mockUserDoc]))
      const result = await service.findAll(new Types.ObjectId(clientId))
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ email: 'user@example.com' })
    })
  })

  describe('update', () => {
    it('updates user and returns updated document', async () => {
      const updated = { ...mockUserDoc, name: 'Updated' }
      mockUserModel.findByIdAndUpdate.mockReturnValue(makeChain(updated))
      const result = await service.update(userId, { name: 'Updated' })
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ name: 'Updated' }),
        { new: true }
      )
      expect(result).toEqual(updated)
    })

    it('converts roleId to ObjectId when provided', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue(makeChain(mockUserDoc))
      await service.update(userId, { roleId } as any)
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ roleId: expect.any(Types.ObjectId) }),
        { new: true }
      )
    })

    // Escritura PARCIAL de `permissions`: un PATCH que manda unas claves no
    // puede borrar las demás. Antes `{ permissions }` reemplazaba el
    // subdocumento entero y cada carga masiva se llevaba por delante
    // `otrosGastosOpcionales`, `permitirFechasAnteriores` y hasta los
    // centros de costo.
    describe('permissions', () => {
      const proyectoA = new Types.ObjectId().toString()
      const proyectoB = new Types.ObjectId().toString()

      it('escribe cada clave por separado, no el objeto completo', async () => {
        mockUserModel.findByIdAndUpdate.mockReturnValue(makeChain(mockUserDoc))
        await service.update(userId, {
          permissions: { modules: ['rendiciones'], canApproveL1: true },
        } as any)
        const escrito = mockUserModel.findByIdAndUpdate.mock.calls[0][1]
        expect(escrito).toMatchObject({
          'permissions.modules': ['rendiciones'],
          'permissions.canApproveL1': true,
        })
        expect(escrito).not.toHaveProperty('permissions')
      })

      it('no toca las claves ausentes del payload', async () => {
        mockUserModel.findByIdAndUpdate.mockReturnValue(makeChain(mockUserDoc))
        await service.update(userId, {
          permissions: { modules: ['rendiciones'] },
        } as any)
        const escrito = mockUserModel.findByIdAndUpdate.mock.calls[0][1]
        expect(
          Object.keys(escrito).filter(k => k.startsWith('permissions.'))
        ).toEqual(['permissions.modules'])
      })

      it('quita el principal que quedó fuera de los centros de costo', async () => {
        mockUserModel.findById.mockReturnValue(
          makeSelectChain({
            clientId: new Types.ObjectId(clientId),
            permissions: { projectIds: [proyectoA], primaryProjectId: proyectoA },
          })
        )
        mockUserModel.findByIdAndUpdate.mockReturnValue(makeChain(mockUserDoc))
        await service.update(userId, {
          permissions: { projectIds: [proyectoB] },
        } as any)
        expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
          userId,
          expect.objectContaining({
            $set: expect.objectContaining({ 'permissions.projectIds': [proyectoB] }),
            $unset: { 'permissions.primaryProjectId': '' },
          }),
          { new: true }
        )
      })

      it('conserva el principal si sigue entre los centros de costo', async () => {
        mockUserModel.findById.mockReturnValue(
          makeSelectChain({
            clientId: new Types.ObjectId(clientId),
            permissions: { projectIds: [proyectoA], primaryProjectId: proyectoA },
          })
        )
        mockUserModel.findByIdAndUpdate.mockReturnValue(makeChain(mockUserDoc))
        await service.update(userId, {
          permissions: { projectIds: [proyectoA, proyectoB] },
        } as any)
        const escrito = mockUserModel.findByIdAndUpdate.mock.calls[0][1]
        expect(escrito).not.toHaveProperty('$unset')
      })

      it('valida el principal contra los centros de costo ya guardados', async () => {
        mockUserModel.findById.mockReturnValue(
          makeSelectChain({
            clientId: new Types.ObjectId(clientId),
            permissions: { projectIds: [proyectoA] },
          })
        )
        await expect(
          service.update(userId, {
            permissions: { primaryProjectId: proyectoB },
          } as any)
        ).rejects.toBeInstanceOf(BadRequestException)
      })

      it('acepta el principal cuando el payload trae su centro de costo', async () => {
        mockUserModel.findByIdAndUpdate.mockReturnValue(makeChain(mockUserDoc))
        await service.update(userId, {
          permissions: { projectIds: [proyectoA], primaryProjectId: proyectoA },
        } as any)
        expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalled()
      })
    })
  })

  // Suplencia por vacaciones (VD-124).
  describe('vacaciones', () => {
    const suplenteId = new Types.ObjectId().toString()
    const otroClientId = new Types.ObjectId()

    const titularDoc = {
      _id: new Types.ObjectId(userId),
      clientId: new Types.ObjectId(clientId),
      name: 'Titular',
    }
    const suplenteDoc = {
      _id: new Types.ObjectId(suplenteId),
      clientId: new Types.ObjectId(clientId),
      isActive: true,
      name: 'Suplente',
    }

    /** `find(...).select(...).lean().exec()` */
    const makeLeanChain = (value: any) => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    })

    describe('setVacaciones', () => {
      it('guarda el rango normalizado a días completos', async () => {
        mockUserModel.findById
          .mockReturnValueOnce(makeSelectChain(titularDoc))
          .mockReturnValueOnce(makeSelectChain(suplenteDoc))
        mockUserModel.findByIdAndUpdate.mockReturnValue(makeChain(mockUserDoc))

        await service.setVacaciones(userId, {
          desde: '2026-09-01',
          hasta: '2026-09-10',
          suplenteId,
        })

        const [, update] = mockUserModel.findByIdAndUpdate.mock.calls[0]
        expect(update.$set.vacaciones.suplenteId.toString()).toBe(suplenteId)
        expect(update.$set.vacaciones.desde.getHours()).toBe(0)
        expect(update.$set.vacaciones.hasta.getHours()).toBe(23)
      })

      // `new Date('2026-09-01')` es medianoche UTC: en Lima (UTC-5) cae el 31 de
      // agosto y la vacacion arrancaria un dia antes del elegido. El dia tiene
      // que sobrevivir intacto, no solo la hora.
      it('guarda el mismo dia que se pidio, sin correrlo por UTC', async () => {
        mockUserModel.findById
          .mockReturnValueOnce(makeSelectChain(titularDoc))
          .mockReturnValueOnce(makeSelectChain(suplenteDoc))
        mockUserModel.findByIdAndUpdate.mockReturnValue(makeChain(mockUserDoc))

        await service.setVacaciones(userId, {
          desde: '2026-09-01',
          hasta: '2026-09-10',
          suplenteId,
        })

        const [, update] = mockUserModel.findByIdAndUpdate.mock.calls[0]
        const { desde, hasta } = update.$set.vacaciones
        expect([desde.getFullYear(), desde.getMonth() + 1, desde.getDate()]).toEqual([2026, 9, 1])
        expect([hasta.getFullYear(), hasta.getMonth() + 1, hasta.getDate()]).toEqual([2026, 9, 10])
      })

      it('rechaza que alguien sea su propio suplente', async () => {
        mockUserModel.findById.mockReturnValue(makeSelectChain(titularDoc))
        await expect(
          service.setVacaciones(userId, {
            desde: '2026-09-01',
            hasta: '2026-09-10',
            suplenteId: userId,
          })
        ).rejects.toBeInstanceOf(BadRequestException)
      })

      it('rechaza un fin anterior al inicio', async () => {
        mockUserModel.findById.mockReturnValue(makeSelectChain(titularDoc))
        await expect(
          service.setVacaciones(userId, {
            desde: '2026-09-10',
            hasta: '2026-09-01',
            suplenteId,
          })
        ).rejects.toBeInstanceOf(BadRequestException)
      })

      // La cadena de aprobación vive dentro de un cliente: un suplente de otra
      // empresa abriría documentos ajenos.
      it('rechaza un suplente de otra empresa', async () => {
        mockUserModel.findById
          .mockReturnValueOnce(makeSelectChain(titularDoc))
          .mockReturnValueOnce(
            makeSelectChain({ ...suplenteDoc, clientId: otroClientId })
          )
        await expect(
          service.setVacaciones(userId, {
            desde: '2026-09-01',
            hasta: '2026-09-10',
            suplenteId,
          })
        ).rejects.toBeInstanceOf(BadRequestException)
      })

      it('rechaza un suplente inactivo', async () => {
        mockUserModel.findById
          .mockReturnValueOnce(makeSelectChain(titularDoc))
          .mockReturnValueOnce(makeSelectChain({ ...suplenteDoc, isActive: false }))
        await expect(
          service.setVacaciones(userId, {
            desde: '2026-09-01',
            hasta: '2026-09-10',
            suplenteId,
          })
        ).rejects.toBeInstanceOf(BadRequestException)
      })

      it('con null borra la suplencia (vuelta anticipada)', async () => {
        mockUserModel.findById.mockReturnValue(makeSelectChain(titularDoc))
        mockUserModel.findByIdAndUpdate.mockReturnValue(makeChain(mockUserDoc))
        await service.setVacaciones(userId, null)
        expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
          userId,
          { $unset: { vacaciones: '' } },
          { new: true }
        )
      })
    })

    describe('findTitularesCubiertosPor', () => {
      it('filtra por suplente, rango vigente y empresa', async () => {
        mockUserModel.find.mockReturnValue(makeLeanChain([titularDoc]))
        const result = await service.findTitularesCubiertosPor(suplenteId, clientId)
        const filtro = mockUserModel.find.mock.calls[0][0]
        expect(filtro['vacaciones.suplenteId'].toString()).toBe(suplenteId)
        expect(filtro['vacaciones.desde']).toHaveProperty('$lte')
        expect(filtro['vacaciones.hasta']).toHaveProperty('$gte')
        expect(filtro.isActive).toBe(true)
        expect(filtro.clientId.toString()).toBe(clientId)
        expect(result).toEqual([{ _id: userId, name: 'Titular' }])
      })

      it('devuelve vacío con un id inválido, sin consultar', async () => {
        expect(await service.findTitularesCubiertosPor('no-es-un-id')).toEqual([])
        expect(mockUserModel.find).not.toHaveBeenCalled()
      })
    })

    describe('idsTitularesCubiertosPara', () => {
      it('no habilita al suplente a aprobar lo que él mismo creó', async () => {
        const result = await service.idsTitularesCubiertosPara(suplenteId, {
          clientId,
          userId: suplenteId,
        })
        expect(result).toEqual([])
        expect(mockUserModel.find).not.toHaveBeenCalled()
      })

      // Los comprobantes guardan al dueño en `createdBy`, no en `userId`.
      it('reconoce al dueño también por createdBy', async () => {
        const result = await service.idsTitularesCubiertosPara(suplenteId, {
          clientId,
          createdBy: suplenteId,
        })
        expect(result).toEqual([])
        expect(mockUserModel.find).not.toHaveBeenCalled()
      })

      it('sí cubre al titular cuando el documento es de otro', async () => {
        mockUserModel.find.mockReturnValue(makeLeanChain([titularDoc]))
        const result = await service.idsTitularesCubiertosPara(suplenteId, {
          clientId,
          userId: new Types.ObjectId().toString(),
        })
        expect(result).toEqual([userId])
      })
    })

    describe('resolverSuplenteVigente', () => {
      const hoy = new Date()
      const ayer = new Date(hoy.getTime() - 86400000)
      const manana = new Date(hoy.getTime() + 86400000)

      it('devuelve null si el titular no está de vacaciones', async () => {
        mockUserModel.findById.mockReturnValue(makeLeanChain({ vacaciones: undefined }))
        expect(await service.resolverSuplenteVigente(userId)).toBeNull()
      })

      it('devuelve el suplente cuando el rango está vigente', async () => {
        mockUserModel.findById
          .mockReturnValueOnce(
            makeLeanChain({
              vacaciones: {
                desde: ayer,
                hasta: manana,
                suplenteId: new Types.ObjectId(suplenteId),
              },
            })
          )
          .mockReturnValueOnce(
            makeLeanChain({
              _id: new Types.ObjectId(suplenteId),
              name: 'Suplente',
              email: 'suplente@example.com',
              isActive: true,
            })
          )
        expect(await service.resolverSuplenteVigente(userId)).toEqual({
          _id: suplenteId,
          name: 'Suplente',
          email: 'suplente@example.com',
        })
      })

      it('devuelve null si el suplente quedó inactivo', async () => {
        mockUserModel.findById
          .mockReturnValueOnce(
            makeLeanChain({
              vacaciones: {
                desde: ayer,
                hasta: manana,
                suplenteId: new Types.ObjectId(suplenteId),
              },
            })
          )
          .mockReturnValueOnce(
            makeLeanChain({
              _id: new Types.ObjectId(suplenteId),
              name: 'Suplente',
              email: 'suplente@example.com',
              isActive: false,
            })
          )
        expect(await service.resolverSuplenteVigente(userId)).toBeNull()
      })
    })
  })

  describe('delete', () => {
    it('calls findByIdAndDelete with the user ID', async () => {
      mockUserModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUserDoc),
      })
      await service.delete(userId)
      expect(mockUserModel.findByIdAndDelete).toHaveBeenCalledWith(userId)
    })
  })

  describe('findAdminsByClient', () => {
    it('returns admin users for a client', async () => {
      mockRoleService.getAdminRoles.mockResolvedValue([
        mockRoleAdmin,
        mockRoleSuper,
      ])
      mockUserModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockUserDoc]),
      })
      const result = await service.findAdminsByClient(clientId)
      expect(result).toHaveLength(1)
    })
  })

  // Columnas de permisos del Excel de carga masiva: centros de costo y
  // aprobadores propios. Es lo único de `permissions` que se carga por Excel.
  describe('bulkImportUsers (columnas de permisos)', () => {
    const projectId = new Types.ObjectId()
    const approverId = new Types.ObjectId()

    /** findOne del modelo User: distingue el colaborador del aprobador. */
    const stubUserLookups = (existing: any) => {
      mockUserModel.findOne.mockImplementation((query: any) => {
        if (query.email === 'jefe@empresa.com') {
          return makeSelectChain({ _id: approverId })
        }
        if (query.email === 'ya.existe@empresa.com') {
          return { exec: jest.fn().mockResolvedValue(existing) }
        }
        return makeSelectChain(null)
      })
    }

    it('actualiza los permisos de un colaborador que ya existe en vez de omitirlo', async () => {
      const existing = {
        toObject: () => ({
          permissions: { modules: ['mis-rendiciones'], projectIds: [] },
        }),
        set: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
      }
      stubUserLookups(existing)
      mockProjectModel.findOne.mockReturnValue(
        makeSelectChain({ _id: projectId })
      )

      const result = await service.bulkImportUsers(
        [
          {
            nombre: 'Ya Existe',
            email: 'ya.existe@empresa.com',
            permisos_centrosDeCosto: 'CC-001',
            permisos_centroDeCostoPrincipal: 'CC-001',
            permisos_aprobadorN1: 'jefe@empresa.com',
          },
        ],
        clientId
      )

      expect(result.created).toBe(0)
      expect(result.updated).toBe(1)
      expect(result.unchanged).toBe(0)
      expect(result.errors).toEqual([])
      expect(result.rows[0].accion).toBe('actualizar')
      expect(mockUserModel.create).not.toHaveBeenCalled()
      expect(existing.set).toHaveBeenCalledWith('permissions', {
        modules: ['mis-rendiciones'],
        projectIds: [projectId.toString()],
        primaryProjectId: projectId.toString(),
        approverLevels: [{ level: 1, userIds: [approverId] }],
      })
      expect(existing.save).toHaveBeenCalled()
    })

    it('marca sin cambios la fila que ya coincide con lo que el colaborador tiene', async () => {
      const existing = {
        toObject: () => ({ name: 'Ya Existe', permissions: {} }),
        set: jest.fn(),
        save: jest.fn(),
      }
      stubUserLookups(existing)

      const result = await service.bulkImportUsers(
        [{ nombre: 'Ya Existe', email: 'ya.existe@empresa.com' }],
        clientId
      )

      expect(result.unchanged).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.rows[0].accion).toBe('sin-cambios')
      expect(existing.set).not.toHaveBeenCalled()
    })

    it('actualiza los datos del colaborador y deja intacto lo que la fila no trae', async () => {
      const existing = {
        toObject: () => ({
          name: 'Nombre Viejo',
          dni: '11111111',
          bankAccount: { bankName: 'BCP', accountNumber: '123' },
          permissions: {},
        }),
        set: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
      }
      stubUserLookups(existing)

      const result = await service.bulkImportUsers(
        [
          {
            nombre: 'Nombre Nuevo',
            email: 'ya.existe@empresa.com',
            cci: '00212345678901234567',
          },
        ],
        clientId
      )

      expect(result.updated).toBe(1)
      expect(result.rows[0].detalle).toContain('Nombre Viejo → Nombre Nuevo')
      expect(existing.set).toHaveBeenCalledWith('name', 'Nombre Nuevo')
      // El CCI se mezcla en la cuenta: no borra banco ni número.
      expect(existing.set).toHaveBeenCalledWith('bankAccount', {
        bankName: 'BCP',
        accountNumber: '123',
        cci: '00212345678901234567',
      })
      // El DNI no venía en la fila: no se toca.
      expect(existing.set).not.toHaveBeenCalledWith(
        'dni',
        expect.anything()
      )
    })

    it('rechaza la fila cuyo rol no existe en vez de dejarlo en Colaborador', async () => {
      stubUserLookups(null)

      const result = await service.bulkImportUsers(
        [{ nombre: 'Nuevo', email: 'nuevo@empresa.com', rol: 'Jefazo' }],
        clientId
      )

      expect(result.created).toBe(0)
      expect(result.errors[0].reason).toContain('Jefazo')
      expect(mockUserModel.create).not.toHaveBeenCalled()
    })

    it('con dryRun devuelve el plan sin escribir nada', async () => {
      const existing = {
        toObject: () => ({ permissions: { projectIds: [] } }),
        set: jest.fn(),
        save: jest.fn(),
      }
      stubUserLookups(existing)
      mockProjectModel.findOne.mockReturnValue(
        makeSelectChain({ _id: projectId, code: 'CC-001' })
      )

      const result = await service.bulkImportUsers(
        [
          {
            nombre: 'Ya Existe',
            email: 'ya.existe@empresa.com',
            permisos_centrosDeCosto: 'CC-001',
          },
        ],
        clientId,
        { dryRun: true }
      )

      expect(result.dryRun).toBe(true)
      expect(result.updated).toBe(1)
      expect(result.rows[0].detalle).toContain('CC-001')
      expect(existing.set).not.toHaveBeenCalled()
      expect(existing.save).not.toHaveBeenCalled()
      expect(mockUserModel.create).not.toHaveBeenCalled()
    })

    it('conserva los niveles de aprobador que el Excel no sabe expresar', async () => {
      const nivel3 = new Types.ObjectId()
      const existing = {
        toObject: () => ({
          permissions: {
            projectIds: [],
            approverLevels: [{ level: 3, userIds: [nivel3] }],
          },
        }),
        set: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
      }
      stubUserLookups(existing)

      await service.bulkImportUsers(
        [
          {
            email: 'ya.existe@empresa.com',
            permisos_aprobadorN1: 'jefe@empresa.com',
          },
        ],
        clientId
      )

      // El archivo solo trae N1 y N2: el N3 que ya tenía sigue ahí.
      expect(existing.set).toHaveBeenCalledWith('permissions', {
        projectIds: [],
        approverLevels: [
          { level: 1, userIds: [approverId] },
          { level: 3, userIds: [nivel3] },
        ],
      })
    })

    it('reporta un error de fila si el centro de costo no existe', async () => {
      stubUserLookups(null)
      mockProjectModel.findOne.mockReturnValue(makeSelectChain(null))

      const result = await service.bulkImportUsers(
        [
          {
            nombre: 'Nuevo',
            email: 'nuevo@empresa.com',
            permisos_centrosDeCosto: 'NO-EXISTE',
          },
        ],
        clientId
      )

      expect(result.created).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].reason).toContain('NO-EXISTE')
      expect(result.rows[0].accion).toBe('error')
      expect(mockUserModel.create).not.toHaveBeenCalled()
    })
  })
})
