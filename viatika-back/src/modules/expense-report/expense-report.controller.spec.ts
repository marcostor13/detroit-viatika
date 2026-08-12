import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Types } from 'mongoose'
import { ExpenseReportController } from './expense-report.controller'
import { ExpenseReportService } from './expense-report.service'
import { AuditLogService } from '../audit-log/audit-log.service'
import { ProjectService } from '../project/project.service'
import { ROLES } from '../auth/enums/roles.enum'

const reportId = new Types.ObjectId().toHexString()

describe('ExpenseReportController — Fase 6 (reembolsos / documentos)', () => {
  let controller: ExpenseReportController

  const mockExpenseReportService = {
    findPendingReimbursementsByClient: jest
      .fn()
      .mockResolvedValue({ items: [] }),
    findMyDocuments: jest.fn().mockResolvedValue({ items: [] }),
    registerReimbursementPayment: jest
      .fn()
      .mockResolvedValue({ _id: 'r1', status: 'reimbursed' }),
    create: jest.fn().mockResolvedValue({ _id: 'r1', title: 'Rendición' }),
  }

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  }

  const mockProjectService = {
    isApproverForClient: jest.fn().mockResolvedValue(false),
  }

  const clientA = new Types.ObjectId().toHexString()
  const clientB = new Types.ObjectId().toHexString()
  const userSub = new Types.ObjectId().toHexString()

  beforeEach(async () => {
    jest.clearAllMocks()
    mockProjectService.isApproverForClient.mockResolvedValue(false)

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpenseReportController],
      providers: [
        { provide: ExpenseReportService, useValue: mockExpenseReportService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: ProjectService, useValue: mockProjectService },
      ],
    }).compile()

    controller = module.get<ExpenseReportController>(ExpenseReportController)
  })

  describe('findPendingReimbursements', () => {
    it('rechaza si no tiene permiso de pago (ni superadmin ni canApproveL2)', () => {
      const req = {
        user: {
          roles: [ROLES.ADMIN],
          permissions: {},
          clientId: clientA,
        },
      }

      expect(() =>
        controller.findPendingReimbursements(clientA, req as never)
      ).toThrow(ForbiddenException)
      expect(
        mockExpenseReportService.findPendingReimbursementsByClient
      ).not.toHaveBeenCalled()
    })

    it('rechaza si clientId de URL no coincide con el del JWT (no superadmin)', () => {
      const req = {
        user: {
          roles: [ROLES.ADMIN],
          permissions: { canApproveL2: true },
          clientId: clientA,
        },
      }

      expect(() =>
        controller.findPendingReimbursements(clientB, req as never)
      ).toThrow(ForbiddenException)
      expect(
        mockExpenseReportService.findPendingReimbursementsByClient
      ).not.toHaveBeenCalled()
    })

    it('delega al servicio cuando clientId coincide y tiene canApproveL2', async () => {
      const req = {
        user: {
          roles: [ROLES.ADMIN],
          permissions: { canApproveL2: true },
          clientId: clientA,
        },
      }

      await controller.findPendingReimbursements(clientA, req as never)

      expect(
        mockExpenseReportService.findPendingReimbursementsByClient
      ).toHaveBeenCalledWith(clientA)
    })

    it('superadmin puede consultar cualquier clientId', async () => {
      const req = {
        user: {
          roles: [ROLES.SUPER_ADMIN],
          permissions: {},
          clientId: undefined,
        },
      }

      await controller.findPendingReimbursements(clientB, req as never)

      expect(
        mockExpenseReportService.findPendingReimbursementsByClient
      ).toHaveBeenCalledWith(clientB)
    })
  })

  describe('findMyDocuments', () => {
    it('BadRequest si clientId de sesión no es un ObjectId válido', () => {
      const req = {
        user: {
          _id: userSub,
          sub: userSub,
          clientId: '',
        },
      }

      expect(() => controller.findMyDocuments(req as never)).toThrow(
        BadRequestException
      )
      expect(mockExpenseReportService.findMyDocuments).not.toHaveBeenCalled()
    })

    it('delega al servicio con userId y clientId resueltos', async () => {
      const req = {
        user: {
          _id: userSub,
          clientId: clientA,
        },
      }

      await controller.findMyDocuments(req as never)

      expect(mockExpenseReportService.findMyDocuments).toHaveBeenCalledWith(
        userSub,
        clientA
      )
    })
  })

  describe('registerReimbursementPayment', () => {
    it('pasa tenantCtx derivado del JWT al servicio y registra auditoría', async () => {
      const dto = {
        method: 'transferencia_bancaria' as const,
        transferDate: '2025-02-01T00:00:00.000Z',
        paymentReceiptUrl: 'https://example.com/r.pdf',
      }
      const req = {
        user: {
          _id: userSub,
          sub: userSub,
          roles: [ROLES.ADMIN],
          role: ROLES.ADMIN,
          permissions: { canApproveL2: true },
          clientId: clientA,
          name: 'Tester',
          email: 't@test.com',
        },
      }

      await controller.registerReimbursementPayment(
        reportId,
        dto as never,
        req as never
      )

      expect(
        mockExpenseReportService.registerReimbursementPayment
      ).toHaveBeenCalledWith(
        reportId,
        dto,
        ROLES.ADMIN,
        { canApproveL2: true },
        {
          requestClientId: clientA,
          isSuperAdmin: false,
        }
      )
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'register_reimbursement_payment',
          entityId: reportId,
        })
      )
    })
  })

  // El módulo asignado gobierna la creación para todos los roles menos el
  // Superadministrador: antes solo se exigía al Colaborador, así que marcar
  // "Rendición directa" o "Caja chica" a Contabilidad o Admin no hacía nada.
  describe('create — permisos por módulo', () => {
    const reqFor = (roles: string[], modules: string[]) => ({
      user: {
        _id: userSub,
        sub: userSub,
        roles,
        permissions: { modules },
        clientId: clientA,
        name: 'Tester',
        email: 't@test.com',
      },
    })

    const dtoDirecta = { isDirecta: true, userId: userSub, clientId: clientA }
    const dtoCajaChica = { isCajaChica: true, userId: userSub, clientId: clientA }

    it('Contabilidad con el módulo nueva-rendicion crea la directa', async () => {
      await controller.create(
        dtoDirecta as never,
        reqFor([ROLES.CONTABILIDAD], ['nueva-rendicion']) as never
      )
      expect(mockExpenseReportService.create).toHaveBeenCalled()
    })

    it('Contabilidad sin el módulo nueva-rendicion recibe Forbidden', async () => {
      await expect(
        controller.create(
          dtoDirecta as never,
          reqFor([ROLES.CONTABILIDAD], ['tesoreria']) as never
        )
      ).rejects.toThrow(ForbiddenException)
      expect(mockExpenseReportService.create).not.toHaveBeenCalled()
    })

    it('Contabilidad con el módulo caja-chica crea la rendición de caja chica', async () => {
      await controller.create(
        dtoCajaChica as never,
        reqFor([ROLES.CONTABILIDAD], ['caja-chica']) as never
      )
      expect(mockExpenseReportService.create).toHaveBeenCalled()
    })

    it('Administrador sin el módulo caja-chica recibe Forbidden', async () => {
      await expect(
        controller.create(
          dtoCajaChica as never,
          reqFor([ROLES.ADMIN], []) as never
        )
      ).rejects.toThrow(ForbiddenException)
    })

    it('Superadministrador crea sin necesitar módulos', async () => {
      await controller.create(
        dtoDirecta as never,
        reqFor([ROLES.SUPER_ADMIN], []) as never
      )
      expect(mockExpenseReportService.create).toHaveBeenCalled()
    })

    it('una rendición normal (ni directa ni caja chica) no exige módulos', async () => {
      await controller.create(
        { userId: userSub, clientId: clientA } as never,
        reqFor([ROLES.COLABORADOR], []) as never
      )
      expect(mockExpenseReportService.create).toHaveBeenCalled()
    })
  })
})
