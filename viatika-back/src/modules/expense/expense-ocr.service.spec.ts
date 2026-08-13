import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { ConfigService } from '@nestjs/config'
import { HttpException } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { ExpenseService } from './expense.service'
import { Expense } from './entities/expense.entity'
import { Client } from '../client/entities/client.entity'
import { EmailService } from '../email/email.service'
import { ProjectService } from '../project/project.service'
import { UserService } from '../user/user.service'
import { SunatConfigService } from '../sunat-config/sunat-config.service'
import { UploadService } from '../upload/upload.service'
import { ExpenseReportService } from '../expense-report/expense-report.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CategoryService } from '../category/category.service'
import { CurrencyService } from '../exchange-rate/currency.service'
import { CreateExpenseDto } from './dto/create-expense.dto'
import { PdfSinContenidoLegibleError } from './utils/pdf-vision-input.util'

const createCompletion = jest.fn()

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: createCompletion } },
  })),
}))

jest.mock('./utils/pdf-vision-input.util', () => {
  const actual = jest.requireActual('./utils/pdf-vision-input.util')
  return { ...actual, preparePdfVisionInput: jest.fn() }
})

const { preparePdfVisionInput } = require('./utils/pdf-vision-input.util') as {
  preparePdfVisionInput: jest.Mock
}

/** Respuesta de chat.completions con el contenido dado. */
function completion(content: string, finishReason = 'stop') {
  return {
    model: 'gpt-test',
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  }
}

function visionInput(overrides: Record<string, unknown> = {}) {
  return {
    texto: 'IMPORTE TOTAL S/ 80.00',
    textoSource: 'pdftotext-bbox',
    ordenConfiable: true,
    imagenes: ['data:image/png;base64,AAAA'],
    paginasAnalizadas: [1],
    pageCount: 1,
    tieneEscaneos: false,
    warnings: [],
    resumen: 'resumen de prueba',
    ...overrides,
  }
}

/** Extracción como la devuelve el modelo cuando SÓLO llena el objeto anidado. */
const SOLO_ANIDADO = JSON.stringify({
  comentario: 'Servicio de hospedaje',
  comprobanteDetallado: {
    emisor: {
      ruc: '20601212537',
      razonSocial: 'INVERSIONES TESILLO E.I.R.L.',
      direccion: 'Av. Bolognesi Nro. 356 - 360',
    },
    comprobante: {
      tipo: 'Factura',
      serie: 'F001',
      correlativo: '00004468',
      fechaEmision: '28-06-2026',
      moneda: 'PEN',
    },
    totales: {
      operacionGravada: 72.4,
      operacionExonerada: 0,
      operacionInafecta: 0,
      igv: 7.6,
      tasaIgv: 10.5,
      importeTotal: 80,
    },
    leyendas: 'SON: OCHENTA CON 00/100 SOLES',
  },
})

const LECTURA_CORRECTA = JSON.stringify({
  rucEmisor: '20601212537',
  serie: 'F001',
  correlativo: '00004468',
  fechaEmision: '28-06-2026',
  montoTotal: 80,
  tipoComprobante: 'Factura',
  comentario: 'Servicio de hospedaje',
  baseAfecta: 72.4,
  igv: 7.6,
  tasaIgv: 10.5,
})

/** Un dígito del RUC mal leído: lo que produce la imagen a baja resolución. */
const LECTURA_CON_RUC_MALO = JSON.stringify({
  ...JSON.parse(LECTURA_CORRECTA),
  rucEmisor: '20601212538',
})

describe('ExpenseService — escaneo OCR de comprobantes', () => {
  let service: ExpenseService

  const body = {
    clientId: '507f1f77bcf86cd799439011',
    expenseReportId: '507f1f77bcf86cd799439012',
  } as CreateExpenseDto

  const file = {
    buffer: Buffer.from('%PDF-1.4'),
    mimetype: 'application/pdf',
    originalname: 'factura.pdf',
  } as Express.Multer.File

  beforeEach(async () => {
    jest.clearAllMocks()
    preparePdfVisionInput.mockResolvedValue(visionInput())

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test') },
        },
        {
          provide: getModelToken(Expense.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
            aggregate: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: getModelToken(Client.name), useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        { provide: UserService, useValue: {} },
        {
          // Sin config SUNAT la validación queda en PENDING y no hay red.
          provide: SunatConfigService,
          useValue: {
            findOne: jest.fn().mockRejectedValue(new Error('sin config')),
          },
        },
        { provide: HttpService, useValue: {} },
        { provide: UploadService, useValue: {} },
        {
          provide: ExpenseReportService,
          useValue: {
            assertReportNotLockedByCajaChica: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        { provide: NotificationsService, useValue: {} },
        { provide: CategoryService, useValue: {} },
        { provide: CurrencyService, useValue: {} },
      ],
    }).compile()

    service = module.get<ExpenseService>(ExpenseService)
  })

  describe('scanInvoicePdf', () => {
    it('recupera los campos planos cuando el modelo sólo llenó comprobanteDetallado', async () => {
      // Este era el caso que dejaba el formulario en blanco y el total en 0.
      createCompletion.mockResolvedValue(completion(SOLO_ANIDADO))

      const result = await service.scanInvoicePdf(body, file)
      const data = JSON.parse(result.data)

      expect(result.total).toBe(80)
      expect(data.rucEmisor).toBe('20601212537')
      expect(data.serie).toBe('F001')
      expect(data.correlativo).toBe('00004468')
      expect(data.fechaEmision).toBe('28/06/2026')
      expect(data.baseAfecta).toBe(72.4)
      expect(data.igv).toBe(7.6)
      expect(data.ocrRequiereRevision).toBe(false)
      expect(data.ocrIssues).toEqual([])
    })

    it('manda la capa de texto junto con las imágenes', async () => {
      createCompletion.mockResolvedValue(completion(LECTURA_CORRECTA))
      await service.scanInvoicePdf(body, file)

      const content = createCompletion.mock.calls[0][0].messages[0].content
      const textos = content.filter((c: any) => c.type === 'text')
      const imagenes = content.filter((c: any) => c.type === 'image_url')
      expect(textos).toHaveLength(2)
      expect(textos[1].text).toContain('IMPORTE TOTAL S/ 80.00')
      expect(textos[1].text).toContain('exactos')
      expect(imagenes).toHaveLength(1)
    })

    it('acepta una respuesta con preámbulo antes del JSON', async () => {
      createCompletion.mockResolvedValue(
        completion(
          `Aquí está el resultado:\n\`\`\`json\n${LECTURA_CORRECTA}\n\`\`\``
        )
      )
      const result = await service.scanInvoicePdf(body, file)
      expect(JSON.parse(result.data).rucEmisor).toBe('20601212537')
    })

    it('avisa distinto cuando el modelo no devuelve contenido', async () => {
      createCompletion.mockResolvedValue(completion('', 'length'))
      await expect(service.scanInvoicePdf(body, file)).rejects.toThrow(
        /no devolvió contenido/
      )
    })

    it('reintenta en bandas cuando las guardas rechazan la primera lectura', async () => {
      createCompletion
        .mockResolvedValueOnce(completion(LECTURA_CON_RUC_MALO))
        .mockResolvedValueOnce(completion(LECTURA_CORRECTA))

      const result = await service.scanInvoicePdf(body, file)

      expect(preparePdfVisionInput).toHaveBeenCalledTimes(2)
      expect(preparePdfVisionInput.mock.calls[1][1]).toEqual(
        expect.objectContaining({ forzarBandas: true })
      )
      expect(JSON.parse(result.data).rucEmisor).toBe('20601212537')
    })

    it('no reintenta si la primera lectura pasa las guardas', async () => {
      createCompletion.mockResolvedValue(completion(LECTURA_CORRECTA))
      await service.scanInvoicePdf(body, file)
      expect(preparePdfVisionInput).toHaveBeenCalledTimes(1)
      expect(createCompletion).toHaveBeenCalledTimes(1)
    })

    it('no reintenta si ya se habían mandado bandas', async () => {
      preparePdfVisionInput.mockResolvedValue(
        visionInput({ tieneEscaneos: true, texto: '', textoSource: 'ninguna' })
      )
      createCompletion.mockResolvedValue(completion(LECTURA_CON_RUC_MALO))

      const result = await service.scanInvoicePdf(body, file)

      expect(preparePdfVisionInput).toHaveBeenCalledTimes(1)
      // La lectura dudosa se devuelve, pero marcada para revisión.
      const data = JSON.parse(result.data)
      expect(data.ocrRequiereRevision).toBe(true)
      expect(data.ocrIssues.map((i: any) => i.code)).toContain(
        'ruc_digito_verificador'
      )
    })

    it('devuelve 400 si el PDF no tiene contenido legible', async () => {
      preparePdfVisionInput.mockRejectedValue(
        new PdfSinContenidoLegibleError(
          'El PDF está protegido con contraseña y no se puede leer.'
        )
      )
      await expect(service.scanInvoicePdf(body, file)).rejects.toMatchObject({
        status: 400,
      })
    })

    it('rechaza un PDF sin archivo', async () => {
      await expect(
        service.scanInvoicePdf(
          body,
          undefined as unknown as Express.Multer.File
        )
      ).rejects.toThrow(HttpException)
    })
  })

  describe('scanInvoiceImage', () => {
    const imagen = {
      buffer: Buffer.from('fake-jpeg'),
      mimetype: 'image/jpeg',
      originalname: 'factura.jpg',
    } as Express.Multer.File

    it('normaliza y aplica guardas igual que el PDF', async () => {
      createCompletion.mockResolvedValue(completion(SOLO_ANIDADO))
      const result = await service.scanInvoiceImage(body, imagen)
      const data = JSON.parse(result.data)

      expect(result.total).toBe(80)
      expect(data.rucEmisor).toBe('20601212537')
      expect(data.ocrRequiereRevision).toBe(false)
    })

    it('marca para revisión una lectura con RUC inválido', async () => {
      createCompletion.mockResolvedValue(completion(LECTURA_CON_RUC_MALO))
      const result = await service.scanInvoiceImage(body, imagen)
      expect(JSON.parse(result.data).ocrRequiereRevision).toBe(true)
    })
  })
})
