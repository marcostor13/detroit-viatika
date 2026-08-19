import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Types } from 'mongoose'
import { FondoCajaChicaService } from './fondo-caja-chica.service'
import {
  FondoCajaChica,
  FondoMovement,
  saldoDisponible,
} from './entities/fondo-caja-chica.entity'
import { EmailService } from '../email/email.service'
import { UserService } from '../user/user.service'
import { NotificationsService } from '../notifications/notifications.service'

/**
 * El modelo se simula con un documento en memoria: lo que importa es el
 * invariante del fondo revolvente (disponible = tope - gastado, nunca por
 * encima del tope) y la idempotencia de cargo/reverso, no Mongoose.
 */
describe('FondoCajaChicaService', () => {
  let service: FondoCajaChicaService
  const clientId = new Types.ObjectId().toHexString()
  const responsibleId = new Types.ObjectId().toHexString()
  const actor = 'user-1'

  let doc: any

  const model: any = {
    findById: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  }

  function nuevoDoc(overrides: Record<string, unknown> = {}) {
    return {
      _id: new Types.ObjectId(),
      code: 'CCH-0001',
      clientId: new Types.ObjectId(clientId),
      responsibleId: new Types.ObjectId(responsibleId),
      requestedAmount: 3000,
      fundAmount: 0,
      spentAmount: 0,
      pendingReturnAmount: 0,
      status: 'pending_funding',
      movements: [] as FondoMovement[],
      ...overrides,
    }
  }

  /** Aplica el update de Mongoose sobre el documento en memoria. */
  function aplicarUpdate(update: any) {
    if (update.$push?.movements) doc.movements.push(update.$push.movements)
    if (update.$inc?.spentAmount)
      doc.spentAmount = Math.round((doc.spentAmount + update.$inc.spentAmount) * 100) / 100
    if (update.$set) Object.assign(doc, update.$set)
    return doc
  }

  const emailService = {
    sendCajaChicaDevolucionRegistrada: jest.fn().mockResolvedValue(undefined),
    buildAppUrl: jest.fn().mockReturnValue('http://localhost/tesoreria'),
  }
  const userService = {
    findEmailNameClient: jest.fn().mockResolvedValue({ name: 'Responsable', email: 'r@x.com' }),
    findTesoreriaRecipientsWithIds: jest.fn().mockResolvedValue([]),
    findContabilidadRecipients: jest.fn().mockResolvedValue([]),
  }
  const notificationsService = { create: jest.fn().mockResolvedValue(undefined) }

  beforeEach(async () => {
    jest.clearAllMocks()
    doc = nuevoDoc()

    model.findById.mockImplementation(() => ({
      exec: async () => doc,
      populate: () => ({ exec: async () => doc }),
    }))
    model.findOne.mockReturnValue({
      sort: () => ({ lean: () => ({ exec: async () => null }) }),
      exec: async () => null,
    })
    model.create.mockImplementation(async (d: any) => ({ ...d, _id: new Types.ObjectId() }))
    model.findByIdAndUpdate.mockImplementation((_id: string, update: any) => ({
      exec: async () => aplicarUpdate(update),
    }))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FondoCajaChicaService,
        { provide: getModelToken(FondoCajaChica.name), useValue: model },
        // Avisos de la devolución del sobrante: aquí solo interesa que no
        // estorben, el contenido del correo se prueba aparte.
        { provide: EmailService, useValue: emailService },
        { provide: UserService, useValue: userService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile()
    service = module.get(FondoCajaChicaService)
  })

  const cargo = (expenseId: string, amount: number) =>
    service.registrarCargo(String(doc._id), {
      expenseId,
      amount,
      registeredBy: actor,
    })

  describe('create', () => {
    it('nace pendiente de fondeo, sin monto disponible', async () => {
      const creado: any = await service.create(
        { responsibleId, clientId, requestedAmount: 3000 },
        actor
      )
      expect(creado.status).toBe('pending_funding')
      expect(creado.fundAmount).toBe(0)
      expect(creado.requestedAmount).toBe(3000)
    })

    it('rechaza un segundo fondo si el responsable ya tiene uno vivo', async () => {
      model.findOne.mockReturnValue({ exec: async () => nuevoDoc({ status: 'active' }) })
      await expect(
        service.create({ responsibleId, clientId, requestedAmount: 3000 }, actor)
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('fondear', () => {
    it('activa el fondo y fija el tope con lo realmente depositado', async () => {
      const out = await service.fondear(String(doc._id), 3000, actor)
      expect(out.status).toBe('active')
      expect(out.fundAmount).toBe(3000)
      expect(saldoDisponible(out)).toBe(3000)
      expect(out.movements[0].type).toBe('fondeo')
    })

    it('si Tesorería deposita menos, el tope es lo depositado', async () => {
      const out = await service.fondear(String(doc._id), 2500, actor)
      expect(out.fundAmount).toBe(2500)
      expect(out.requestedAmount).toBe(3000)
    })

    it('no se puede fondear dos veces', async () => {
      await service.fondear(String(doc._id), 3000, actor)
      await expect(service.fondear(String(doc._id), 3000, actor)).rejects.toThrow(
        BadRequestException
      )
    })

    it('falla si el fondo no existe', async () => {
      model.findById.mockReturnValue({ exec: async () => null })
      await expect(service.fondear('x', 100, actor)).rejects.toThrow(NotFoundException)
    })
  })

  describe('cargos contra el fondo', () => {
    beforeEach(async () => {
      await service.fondear(String(doc._id), 3000, actor)
    })

    it('descuenta del disponible', async () => {
      const e1 = new Types.ObjectId().toHexString()
      const out = await cargo(e1, 1800)
      expect(out.spentAmount).toBe(1800)
      expect(saldoDisponible(out)).toBe(1200)
    })

    it('acumula varios gastos', async () => {
      await cargo(new Types.ObjectId().toHexString(), 200)
      await cargo(new Types.ObjectId().toHexString(), 120)
      const out = await cargo(new Types.ObjectId().toHexString(), 30)
      expect(out.spentAmount).toBe(350)
      expect(saldoDisponible(out)).toBe(2650)
    })

    it('no descuenta dos veces el mismo comprobante', async () => {
      const e1 = new Types.ObjectId().toHexString()
      await cargo(e1, 500)
      const out = await cargo(e1, 500)
      expect(out.spentAmount).toBe(500)
      expect(out.movements.filter(m => m.type === 'cargo')).toHaveLength(1)
    })

    it('bloquea el gasto que supera el disponible', async () => {
      await cargo(new Types.ObjectId().toHexString(), 2900)
      await expect(cargo(new Types.ObjectId().toHexString(), 200)).rejects.toThrow(
        /Saldo insuficiente/
      )
    })

    it('no acepta cargos si el fondo aún no fue fondeado', async () => {
      doc = nuevoDoc()
      await expect(cargo(new Types.ObjectId().toHexString(), 10)).rejects.toThrow(
        /todavía no fue fondeada/
      )
    })

    it('no acepta cargos si el fondo está cerrado', async () => {
      doc = nuevoDoc({ status: 'closed', fundAmount: 3000 })
      await expect(cargo(new Types.ObjectId().toHexString(), 10)).rejects.toThrow(
        /cerrada/
      )
    })
  })

  describe('reverso (solo al eliminar el comprobante)', () => {
    beforeEach(async () => {
      await service.fondear(String(doc._id), 3000, actor)
    })

    it('devuelve el saldo del cargo eliminado', async () => {
      const e1 = new Types.ObjectId().toHexString()
      await cargo(e1, 800)
      const out = await service.reversarCargo(String(doc._id), e1, actor)
      expect(out.spentAmount).toBe(0)
      expect(saldoDisponible(out)).toBe(3000)
    })

    it('es idempotente: reversar dos veces no infla el saldo', async () => {
      const e1 = new Types.ObjectId().toHexString()
      await cargo(e1, 800)
      await service.reversarCargo(String(doc._id), e1, actor)
      const out = await service.reversarCargo(String(doc._id), e1, actor)
      expect(out.spentAmount).toBe(0)
      expect(out.movements.filter(m => m.type === 'reverso')).toHaveLength(1)
    })

    it('no hace nada si el gasto nunca se cargó', async () => {
      const out = await service.reversarCargo(
        String(doc._id),
        new Types.ObjectId().toHexString(),
        actor
      )
      expect(out.movements.filter(m => m.type === 'reverso')).toHaveLength(0)
    })

    it('permite volver a cargar el mismo gasto después de reversarlo', async () => {
      const e1 = new Types.ObjectId().toHexString()
      await cargo(e1, 800)
      await service.reversarCargo(String(doc._id), e1, actor)
      const out = await cargo(e1, 900)
      expect(out.spentAmount).toBe(900)
    })
  })

  describe('reposición', () => {
    beforeEach(async () => {
      await service.fondear(String(doc._id), 3000, actor)
      await cargo(new Types.ObjectId().toHexString(), 1800)
    })

    it('devuelve el fondo a su tope', async () => {
      const out = await service.reponer(String(doc._id), {
        amount: 1800,
        registeredBy: actor,
      })
      expect(out.spentAmount).toBe(0)
      expect(saldoDisponible(out)).toBe(3000)
    })

    it('una reposición parcial deja el resto pendiente', async () => {
      const out = await service.reponer(String(doc._id), {
        amount: 1500,
        registeredBy: actor,
      })
      expect(out.spentAmount).toBe(300)
      expect(saldoDisponible(out)).toBe(2700)
    })

    it('nunca deja el fondo por encima de su tope', async () => {
      await expect(
        service.reponer(String(doc._id), { amount: 2000, registeredBy: actor })
      ).rejects.toThrow(/supera lo gastado/)
    })
  })

  // Una solicitud posterior reemplaza el presupuesto, para arriba o para abajo.
  describe('ajuste de presupuesto', () => {
    beforeEach(async () => {
      await service.fondear(String(doc._id), 3000, actor)
    })

    it('subir el presupuesto sube el disponible', async () => {
      const out = await service.ajustarPresupuesto(String(doc._id), 5000, actor)
      expect(out.fundAmount).toBe(5000)
      expect(saldoDisponible(out)).toBe(5000)
      expect(out.pendingReturnAmount).toBe(0)
    })

    it('bajar el presupuesto deja el sobrante por devolver', async () => {
      const out = await service.ajustarPresupuesto(String(doc._id), 2000, actor)
      expect(out.fundAmount).toBe(2000)
      expect(out.pendingReturnAmount).toBe(1000)
      expect(saldoDisponible(out)).toBe(2000)
    })

    it('bajar el presupuesto con gastos ya cargados recalcula el disponible', async () => {
      await cargo(new Types.ObjectId().toHexString(), 1800)
      const out = await service.ajustarPresupuesto(String(doc._id), 2000, actor)
      // 2000 de presupuesto menos 1800 gastados: quedan 200 para gastar y 1000
      // en efectivo que sobran y hay que devolver.
      expect(saldoDisponible(out)).toBe(200)
      expect(out.pendingReturnAmount).toBe(1000)
    })

    it('deja el movimiento con el presupuesto anterior para poder leer el historial', async () => {
      const out = await service.ajustarPresupuesto(String(doc._id), 2000, actor)
      const ajuste = out.movements.find(m => m.type === 'ajuste')!
      expect(ajuste.amount).toBe(2000)
      expect(ajuste.previousAmount).toBe(3000)
    })

    it('no deja bajar el presupuesto por debajo de lo ya gastado', async () => {
      await service.registrarCargo(String(doc._id), {
        expenseId: new Types.ObjectId().toString(),
        amount: 2200,
        registeredBy: actor,
      })

      await expect(
        service.ajustarPresupuesto(String(doc._id), 1000, actor)
      ).rejects.toThrow(/no puede ser menor a lo ya gastado/i)

      const out = await service.ajustarPresupuesto(String(doc._id), 3000, actor)
      expect(out.fundAmount).toBe(3000)
      expect(out.fundAmount - out.spentAmount).toBeGreaterThanOrEqual(0)
    })

    it('pedir el mismo monto no genera movimiento', async () => {
      const out = await service.ajustarPresupuesto(String(doc._id), 3000, actor)
      expect(out.movements.filter(m => m.type === 'ajuste')).toHaveLength(0)
    })
  })

  describe('devolución del sobrante', () => {
    beforeEach(async () => {
      await service.fondear(String(doc._id), 3000, actor)
      await service.ajustarPresupuesto(String(doc._id), 2000, actor)
    })

    const devolver = (amount: number, receiptUrl = 'https://s3/dep.pdf') =>
      service.registrarDevolucion(String(doc._id), {
        amount,
        receiptUrl,
        registeredBy: actor,
      })

    it('salda el sobrante pendiente', async () => {
      const out = await devolver(1000)
      expect(out.pendingReturnAmount).toBe(0)
      expect(out.movements.find(m => m.type === 'devolucion')?.receiptUrl).toBe(
        'https://s3/dep.pdf'
      )
    })

    it('guarda fecha y banco del depósito, igual que el comprobante de devolución de saldo', async () => {
      const out = await service.registrarDevolucion(String(doc._id), {
        amount: 1000,
        receiptUrl: 'https://s3/dep.pdf',
        depositDate: '2026-08-17',
        bankOrigin: '  BCP  ',
        registeredBy: actor,
      })
      const mov = out.movements.find(m => m.type === 'devolucion')!
      expect(mov.depositDate).toEqual(new Date('2026-08-17'))
      expect(mov.bankOrigin).toBe('BCP')
    })

    it('acepta devoluciones parciales', async () => {
      await devolver(400)
      const out = await devolver(200)
      expect(out.pendingReturnAmount).toBe(400)
    })

    it('exige el comprobante del depósito', async () => {
      await expect(devolver(1000, '')).rejects.toThrow(/comprobante/i)
    })

    it('no deja devolver más de lo que sobra', async () => {
      await expect(devolver(1500)).rejects.toThrow(/supera el sobrante/)
    })

    it('no deja devolver si no hay sobrante', async () => {
      await devolver(1000)
      await expect(devolver(10)).rejects.toThrow(/no tiene sobrante/)
    })

    it('el presupuesto y el disponible no cambian al devolver', async () => {
      const out = await devolver(1000)
      expect(out.fundAmount).toBe(2000)
      expect(saldoDisponible(out)).toBe(2000)
    })
  })

  describe('close', () => {
    it('cierra el fondo y no se puede cerrar dos veces', async () => {
      await service.fondear(String(doc._id), 3000, actor)
      const out = await service.close(String(doc._id), actor)
      expect(out.status).toBe('closed')
      await expect(service.close(String(doc._id), actor)).rejects.toThrow(
        BadRequestException
      )
    })
  })
})
