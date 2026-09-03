import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import * as bcrypt from 'bcryptjs'
import * as request from 'supertest'
import * as xlsx from 'xlsx'
import { App } from 'supertest/types'
import { AppModule } from '../src/app.module'
import { User, UserDocument } from '../src/modules/user/schemas/user.schema'

const SUPERADMIN_EMAIL = 'admin@viatika.com'
const SUPERADMIN_PASSWORD = '@Libido2010'

type Fila = Record<string, string>

/**
 * Carga masiva de colaboradores, end-to-end contra MongoDB en memoria y la API
 * real. Recorre el ciclo completo tal como lo usa el cliente:
 *  - descarga del Excel, que baja con los colaboradores que ya existen
 *  - edición de las columnas de permisos y alta de filas nuevas
 *  - previsualización (dryRun): el plan sale bien y NO escribe nada
 *  - carga real: crea, actualiza permisos y reporta la fila con error
 *  - reimportación del mismo archivo: todo "sin cambios" (idempotente)
 */
describe('Carga masiva de colaboradores (e2e)', () => {
  let app: INestApplication<App>
  let userModel: Model<UserDocument>
  let superadminToken: string
  let adminToken: string
  let clientId: string
  let colaboradorRoleId: string
  let projectAId: string
  let projectBId: string

  const EXISTENTE = 'existente.bulk@viatika.com'
  const APROBADOR_1 = 'ap1.bulk@viatika.com'
  const APROBADOR_2 = 'ap2.bulk@viatika.com'
  const NUEVO = 'nuevo.bulk@viatika.com'
  const CC_A = 'CC-BULK-A'
  const CC_B = 'CC-BULK-B'

  const http = () => request(app.getHttpServer())

  async function seedUser(email: string, roleId: string): Promise<string> {
    const created = await userModel.create({
      email,
      name: email.split('@')[0],
      password: await bcrypt.hash('Password123', 10),
      clientId: new Types.ObjectId(clientId),
      roleId: new Types.ObjectId(roleId),
      isActive: true,
    })
    return String(created._id)
  }

  /** Descarga la plantilla y la devuelve ya leída como filas + encabezados. */
  async function descargarExcel(): Promise<{
    headers: string[]
    filas: Fila[]
    hojas: string[]
    filename: string
  }> {
    const res = await http()
      .get('/api/user/bulk-import/template')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    const wb = xlsx.read(Buffer.from(res.body.file, 'base64'), {
      type: 'buffer',
    })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const matriz = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    return {
      headers: matriz[0] ?? [],
      filas: xlsx.utils.sheet_to_json<Fila>(sheet, { defval: '' }),
      hojas: wb.SheetNames,
      filename: res.body.filename,
    }
  }

  /** Vuelve a armar el .xlsx que se sube, con las mismas columnas. */
  function construirExcel(headers: string[], filas: Fila[]): Buffer {
    const sheet = xlsx.utils.json_to_sheet(filas, { header: headers })
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, sheet, 'Colaboradores')
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }

  async function importar(buffer: Buffer, dryRun: boolean) {
    const req = http()
      .post('/api/user/bulk-import')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('clientId', clientId)
    if (dryRun) req.field('dryRun', 'true')
    const res = await req
      .attach('file', buffer, 'colaboradores.xlsx')
      .expect(201)
    return res.body
  }

  const filaDe = (plan: any, email: string) =>
    plan.rows.find((r: { email: string }) => r.email === email)

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api')
    await app.init()

    userModel = moduleFixture.get<Model<UserDocument>>(getModelToken(User.name))

    superadminToken = (
      await http()
        .post('/api/auth/login')
        .send({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD })
        .expect(200)
    ).body.access_token

    const clientRes = await http()
      .post('/api/client')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        codigo: 'E2EBK',
        comercialName: 'Cliente Bulk E2E',
        businessName: 'Cliente Bulk E2E SAC',
        businessId: '20999999888',
      })
      .expect(201)
    clientId = clientRes.body._id

    const rolesRes = await http()
      .get('/api/role')
      .set('Authorization', `Bearer ${superadminToken}`)
      .expect(200)
    const roleByName = (name: string) =>
      rolesRes.body.find((r: { name: string }) => r.name === name)
    colaboradorRoleId = roleByName('Colaborador')._id
    const adminRoleId = roleByName('Administrador')._id

    // El Administrador de la empresa es quien descarga e importa: los endpoints
    // resuelven la empresa destino desde su token. Su login es en dos pasos
    // (hub + elegir empresa); el token útil es el segundo.
    await seedUser('admin.bulk@viatika.com', adminRoleId)
    const hub = await http()
      .post('/api/auth/login')
      .send({ email: 'admin.bulk@viatika.com', password: 'Password123' })
      .expect(200)
    expect(hub.body.requiresClientSelection).toBe(true)
    adminToken = (
      await http()
        .post('/api/auth/select-client')
        .send({ hubToken: hub.body.access_token, clientId })
        .expect(200)
    ).body.access_token

    await seedUser(EXISTENTE, colaboradorRoleId)
    await seedUser(APROBADOR_1, colaboradorRoleId)
    await seedUser(APROBADOR_2, colaboradorRoleId)

    projectAId = (
      await http()
        .post('/api/project')
        .set('Authorization', `Bearer ${superadminToken}`)
        .send({ name: 'Centro Bulk A', code: CC_A, clientId, isActive: true })
        .expect(201)
    ).body._id
    projectBId = (
      await http()
        .post('/api/project')
        .set('Authorization', `Bearer ${superadminToken}`)
        .send({ name: 'Centro Bulk B', code: CC_B, clientId, isActive: true })
        .expect(201)
    ).body._id
  })

  afterAll(async () => {
    await app.close()
  })

  it('el Excel baja con los colaboradores que ya existen y las columnas de permisos', async () => {
    const { headers, filas, hojas, filename } = await descargarExcel()

    expect(filename).toBe('colaboradores.xlsx')
    expect(hojas).toEqual([
      'Colaboradores',
      'Instrucciones',
      'Centros de Costo Disponibles',
    ])
    expect(headers).toContain('permisos_centrosDeCosto')
    expect(headers).toContain('permisos_centroDeCostoPrincipal')
    expect(headers).toContain('permisos_aprobadorN1')
    expect(headers).toContain('permisos_aprobadorN2')
    // El coordinador personal está obsoleto: la columna ya no existe.
    expect(headers).not.toContain('emailCoordinador')

    const emails = filas.map(f => f.email)
    expect(emails).toContain(EXISTENTE)
    expect(emails).toContain(APROBADOR_1)
    const existente = filas.find(f => f.email === EXISTENTE)!
    expect(existente.rol).toBe('Colaborador')
    expect(existente.permisos_centrosDeCosto).toBe('')
  })

  it('la previsualización devuelve el plan y no escribe nada', async () => {
    const { headers, filas } = await descargarExcel()

    // 1) Al colaborador que ya existe se le asignan centros de costo y N1/N2.
    const existente = filas.find(f => f.email === EXISTENTE)!
    existente.permisos_centrosDeCosto = `${CC_A}, ${CC_B}`
    existente.permisos_centroDeCostoPrincipal = CC_B
    existente.permisos_aprobadorN1 = APROBADOR_1
    existente.permisos_aprobadorN2 = APROBADOR_2
    // 2) Un colaborador nuevo, con dos aprobadores en el mismo nivel.
    filas.push({
      nombre: 'Nuevo Colaborador',
      email: NUEVO,
      rol: 'Colaborador',
      permisos_centrosDeCosto: CC_A,
      permisos_aprobadorN1: `${APROBADOR_1}, ${APROBADOR_2}`,
    } as Fila)
    // 3) Una fila con un centro de costo que no existe.
    filas.push({
      nombre: 'Fila Mala',
      email: 'mala.bulk@viatika.com',
      permisos_centrosDeCosto: 'CC-NO-EXISTE',
    } as Fila)

    const plan = await importar(construirExcel(headers, filas), true)

    expect(plan.dryRun).toBe(true)
    expect(plan.created).toBe(1)
    expect(plan.updated).toBe(1)
    expect(plan.errors).toHaveLength(1)
    expect(plan.errors[0].reason).toContain('CC-NO-EXISTE')
    expect(plan.credentials).toEqual([])

    expect(filaDe(plan, NUEVO).accion).toBe('crear')
    const filaExistente = filaDe(plan, EXISTENTE)
    expect(filaExistente.accion).toBe('actualizar')
    // El detalle sale legible: códigos de centro de costo y emails, no ids.
    expect(filaExistente.detalle).toContain(CC_A)
    expect(filaExistente.detalle).toContain(APROBADOR_1)
    expect(filaDe(plan, APROBADOR_1).accion).toBe('sin-cambios')

    // Nada de esto se escribió: era solo la revisión.
    expect(await userModel.findOne({ email: NUEVO }).lean()).toBeNull()
    const sinTocar = await userModel.findOne({ email: EXISTENTE }).lean()
    expect(sinTocar?.permissions?.projectIds ?? []).toEqual([])
  })

  it('la carga real crea, actualiza permisos y es idempotente al repetirla', async () => {
    const { headers, filas } = await descargarExcel()
    const existente = filas.find(f => f.email === EXISTENTE)!
    existente.permisos_centrosDeCosto = `${CC_A}, ${CC_B}`
    existente.permisos_centroDeCostoPrincipal = CC_B
    existente.permisos_aprobadorN1 = APROBADOR_1
    existente.permisos_aprobadorN2 = APROBADOR_2
    filas.push({
      nombre: 'Nuevo Colaborador',
      email: NUEVO,
      rol: 'Colaborador',
      permisos_centrosDeCosto: CC_A,
      permisos_aprobadorN1: `${APROBADOR_1}, ${APROBADOR_2}`,
    } as Fila)
    const buffer = construirExcel(headers, filas)

    const res = await importar(buffer, false)
    expect(res.dryRun).toBe(false)
    expect(res.created).toBe(1)
    expect(res.updated).toBe(1)
    expect(res.errors).toEqual([])
    expect(res.credentials).toHaveLength(1)
    expect(res.credentials[0].email).toBe(NUEVO)

    // El colaborador nuevo queda creado, con su centro de costo y sus dos
    // aprobadores de Nivel 1 (un nivel admite varios).
    const creado = await userModel.findOne({ email: NUEVO }).lean()
    expect(creado).not.toBeNull()
    expect(creado!.mustChangePassword).toBe(true)
    expect(creado!.permissions!.projectIds).toEqual([projectAId])
    const ap1 = await userModel.findOne({ email: APROBADOR_1 }).lean()
    const ap2 = await userModel.findOne({ email: APROBADOR_2 }).lean()
    expect(creado!.permissions!.approverLevels).toHaveLength(1)
    expect(
      creado!.permissions!.approverLevels![0].userIds.map(String)
    ).toEqual([String(ap1!._id), String(ap2!._id)])

    // Al que ya existía se le aplicaron los permisos, con el principal marcado.
    const actualizado = await userModel.findOne({ email: EXISTENTE }).lean()
    expect(actualizado!.permissions!.projectIds.sort()).toEqual(
      [projectAId, projectBId].sort()
    )
    expect(actualizado!.permissions!.primaryProjectId).toBe(projectBId)
    expect(
      actualizado!.permissions!.approverLevels!.map(l => ({
        level: l.level,
        userIds: l.userIds.map(String),
      }))
    ).toEqual([
      { level: 1, userIds: [String(ap1!._id)] },
      { level: 2, userIds: [String(ap2!._id)] },
    ])

    // Subir el MISMO archivo otra vez no cambia nada ni duplica usuarios.
    const repetida = await importar(buffer, false)
    expect(repetida.created).toBe(0)
    expect(repetida.updated).toBe(0)
    expect(repetida.unchanged).toBeGreaterThanOrEqual(2)
    expect(repetida.errors).toEqual([])
    expect(await userModel.countDocuments({ email: NUEVO })).toBe(1)
  })

  it('el Excel que se vuelve a descargar ya trae los permisos aplicados', async () => {
    const { filas } = await descargarExcel()
    const fila = filas.find(f => f.email === EXISTENTE)!
    // Los centros de costo salen por código y los aprobadores por email, que es
    // lo que el importador sabe resolver de vuelta.
    expect(fila.permisos_centrosDeCosto.split(', ').sort()).toEqual(
      [CC_A, CC_B].sort()
    )
    expect(fila.permisos_centroDeCostoPrincipal).toBe(CC_B)
    expect(fila.permisos_aprobadorN1).toBe(APROBADOR_1)
    expect(fila.permisos_aprobadorN2).toBe(APROBADOR_2)
  })

  it('cambiar el nombre o el cargo en el Excel actualiza al colaborador', async () => {
    const { headers, filas } = await descargarExcel()
    const fila = filas.find(f => f.email === EXISTENTE)!
    const dniPrevio = (await userModel.findOne({ email: EXISTENTE }).lean())
      ?.dni
    fila.nombre = 'Nombre Cambiado Desde Excel'
    fila.cargo = 'Jefe de Prueba'
    const buffer = construirExcel(headers, filas)

    const plan = await importar(buffer, true)
    expect(filaDe(plan, EXISTENTE).accion).toBe('actualizar')
    expect(filaDe(plan, EXISTENTE).detalle).toContain(
      'Nombre Cambiado Desde Excel'
    )

    const res = await importar(buffer, false)
    expect(res.updated).toBe(1)
    const actualizado = await userModel.findOne({ email: EXISTENTE }).lean()
    expect(actualizado!.name).toBe('Nombre Cambiado Desde Excel')
    expect(actualizado!.cargo).toBe('Jefe de Prueba')
    // La celda de DNI viene vacía: no se toca lo que ya tenía.
    expect(actualizado!.dni).toBe(dniPrevio)
  })

  it('rechaza la fila cuyo aprobador no existe en la empresa', async () => {
    const { headers, filas } = await descargarExcel()
    filas.push({
      nombre: 'Aprobador Fantasma',
      email: 'fantasma.bulk@viatika.com',
      permisos_aprobadorN1: 'no.existe@viatika.com',
    } as Fila)

    const plan = await importar(construirExcel(headers, filas), true)

    expect(plan.created).toBe(0)
    expect(plan.errors).toHaveLength(1)
    expect(plan.errors[0].reason).toContain('no.existe@viatika.com')
    expect(filaDe(plan, 'fantasma.bulk@viatika.com').accion).toBe('error')
  })
})
