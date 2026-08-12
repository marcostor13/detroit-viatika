import { Test, TestingModule } from '@nestjs/testing'
import * as XLSX from 'xlsx'
import { OrdenTrabajoController } from './orden-trabajo.controller'
import { OrdenTrabajoService } from './orden-trabajo.service'
import { AuditLogService } from '../audit-log/audit-log.service'

const clientId = '6a5a9ef217875703af86a045'
const req = { user: { clientId, _id: 'u1', name: 'Ivan' } }

/** Arma un .xlsx en memoria con esas filas como objetos {columna: valor}. */
function excelDe(rows: Record<string, any>[]): Express.Multer.File {
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Ordenes de Trabajo')
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
  return { buffer, originalname: 'ot.xlsx' } as Express.Multer.File
}

describe('OrdenTrabajoController › carga masiva', () => {
  let controller: OrdenTrabajoController
  let service: { bulkCreate: jest.Mock }

  beforeEach(async () => {
    service = { bulkCreate: jest.fn().mockResolvedValue({ created: 0, updated: 0, errors: [] }) }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdenTrabajoController],
      providers: [
        { provide: OrdenTrabajoService, useValue: service },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile()

    controller = module.get<OrdenTrabajoController>(OrdenTrabajoController)
  })

  const filasMapeadas = () => service.bulkCreate.mock.calls[0][0]

  // Respaldo para filas pegadas del informe del ERP, que trae el nombre partido.
  // El archivo que descarga la app lleva el nombre completo en una sola columna.
  it('arma el nombre con Suc, Dep y Nº O/T, sin los ceros de la izquierda', async () => {
    await controller.importFromExcel(
      excelDe([{ Suc: 'LIM', Dep: 'SMI', 'Nº O/T': '00001463-G', 'Centros de Costo*': '123' }]),
      clientId,
      req
    )

    expect(filasMapeadas()).toEqual([
      { nombre: 'LIM-SMI-1463-G', costCenterKey: '123', isActive: undefined },
    ])
  })

  it('la columna Nombre manda sobre Suc/Dep/Nº O/T', async () => {
    await controller.importFromExcel(
      excelDe([
        {
          Suc: 'LIM',
          Dep: 'SMI',
          'Nº O/T': '1463',
          Nombre: 'NOMBRE-A-MANO',
          'Centros de Costo*': '123',
        },
      ]),
      clientId,
      req
    )

    expect(filasMapeadas()[0].nombre).toBe('NOMBRE-A-MANO')
  })

  it('sigue aceptando la plantilla anterior (Nombre* y Código Centro de Costo*)', async () => {
    await controller.importFromExcel(
      excelDe([{ 'Nombre*': 'Lim-Com-1', 'Código Centro de Costo*': 'CC-001', Activo: 'No' }]),
      clientId,
      req
    )

    expect(filasMapeadas()).toEqual([
      { nombre: 'Lim-Com-1', costCenterKey: 'CC-001', isActive: false },
    ])
  })

  it('pasa varios centros de costo tal cual para que el servicio los resuelva', async () => {
    await controller.importFromExcel(
      excelDe([{ Nombre: 'LIM-SMI-1', 'Centros de Costo': '123, 223, 423' }]),
      clientId,
      req
    )

    expect(filasMapeadas()[0].costCenterKey).toBe('123, 223, 423')
  })

  // El informe del ERP no trae columna Activo: no debe reactivar OT dadas de baja.
  it('deja isActive sin definir cuando la columna Activo viene vacía', async () => {
    await controller.importFromExcel(
      excelDe([{ Nombre: 'LIM-SMI-1', 'Centros de Costo': '123', Activo: '' }]),
      clientId,
      req
    )

    expect(filasMapeadas()[0].isActive).toBeUndefined()
  })

  it('una fila sin Suc/Dep/Nº ni Nombre queda con nombre vacío (el servicio la reporta)', async () => {
    await controller.importFromExcel(
      excelDe([{ Suc: 'LIM', 'Centros de Costo': '123' }]),
      clientId,
      req
    )

    expect(filasMapeadas()[0].nombre).toBe('')
  })
})
