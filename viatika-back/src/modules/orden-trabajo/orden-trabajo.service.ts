import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import {
  OrdenTrabajo,
  OrdenTrabajoDocument,
} from './entities/orden-trabajo.entity'
import { Project } from '../project/entities/project.entity'
import { CreateOrdenTrabajoDto } from './dto/create-orden-trabajo.dto'
import { UpdateOrdenTrabajoDto } from './dto/update-orden-trabajo.dto'

/** Escapa una cadena para usarla literalmente dentro de una RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Qué le pasa a una fila del Excel: es lo que se previsualiza y lo que se aplica. */
export interface IBulkRowPlan {
  row: number
  nombre: string
  accion: 'crear' | 'actualizar' | 'sin-cambios' | 'error'
  /** Con qué queda la OT (al crear) o qué le cambia (al actualizar). */
  detalle?: string
  reason?: string
}

export interface IBulkCreateResult {
  created: number
  /** OT que ya existían (mismo nombre) y se actualizaron con lo del archivo. */
  updated: number
  /** OT que ya existían y a las que el archivo no les cambia nada. */
  unchanged: number
  errors: { row: number; reason: string }[]
  /** Fila por fila: con `dryRun` es lo que PASARÍA; sin él, lo que pasó. */
  rows: IBulkRowPlan[]
  /** true = solo previsualización, no se escribió nada en la base. */
  dryRun: boolean
}

@Injectable()
export class OrdenTrabajoService {
  constructor(
    @InjectModel(OrdenTrabajo.name)
    private ordenTrabajoModel: Model<OrdenTrabajoDocument>,
    @InjectModel(Project.name)
    private projectModel: Model<any>
  ) {}

  /**
   * Verifica que cada centro de costo exista y pertenezca a la empresa, y
   * devuelve la lista sin repetidos y en el mismo orden recibido: el primero es
   * el principal. Evita relacionar la OT con un centro de costo de otra empresa
   * (aislamiento multitenant).
   */
  private async assertCostCenters(
    costCenterIds: string[],
    clientId: Types.ObjectId
  ): Promise<Types.ObjectId[]> {
    const unicos = [...new Set(costCenterIds.map((id) => String(id ?? '').trim()))]
    if (!unicos.length) {
      throw new BadRequestException('Indica al menos un centro de costo')
    }
    const resultado: Types.ObjectId[] = []
    for (const id of unicos) {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('El centro de costo no es válido')
      }
      const exists = await this.projectModel
        .exists({ _id: new Types.ObjectId(id), clientId })
        .exec()
      if (!exists) {
        throw new BadRequestException(
          'El centro de costo no existe o no pertenece a esta empresa'
        )
      }
      resultado.push(new Types.ObjectId(id))
    }
    return resultado
  }

  /**
   * Une las dos formas de mandar centros de costo: la lista `costCenterIds` y
   * el `costCenterId` suelto (compatibilidad). Devuelve la lista con el
   * principal al frente, o vacía si no vino ninguno.
   */
  private mergeCostCenterInput(dto: {
    costCenterId?: string
    costCenterIds?: string[]
  }): string[] {
    const lista = dto.costCenterIds?.length ? [...dto.costCenterIds] : []
    if (dto.costCenterId) lista.unshift(dto.costCenterId)
    return lista.filter(Boolean)
  }

  /**
   * La unicidad del nombre es POR EMPRESA (clientId) y sin distinguir
   * mayúsculas/minúsculas. Otra empresa puede tener el mismo nombre.
   */
  private async ensureUniqueNombre(
    nombre: string,
    clientId: Types.ObjectId,
    excludeId?: Types.ObjectId
  ): Promise<void> {
    const filter: Record<string, unknown> = {
      clientId,
      nombre: { $regex: `^${escapeRegExp(nombre)}$`, $options: 'i' },
    }
    if (excludeId) {
      filter._id = { $ne: excludeId }
    }
    const exists = await this.ordenTrabajoModel.exists(filter).exec()
    if (exists) {
      throw new BadRequestException(
        `Ya existe una orden de trabajo con el nombre "${nombre}" en esta empresa`
      )
    }
  }

  async create(dto: CreateOrdenTrabajoDto, clientId: string) {
    const nombre = dto.nombre?.trim()
    if (!nombre) {
      throw new BadRequestException('El nombre de la OT es obligatorio')
    }

    const clientIdObject = new Types.ObjectId(clientId)
    const costCenterIds = await this.assertCostCenters(
      this.mergeCostCenterInput(dto),
      clientIdObject
    )
    await this.ensureUniqueNombre(nombre, clientIdObject)

    try {
      return await this.ordenTrabajoModel.create({
        nombre,
        // El principal es el primero de la lista; se guarda además suelto
        // porque los reportes oficiales muestran un único centro de costo.
        costCenterId: costCenterIds[0],
        costCenterIds,
        isActive: dto.isActive ?? true,
        clientId: clientIdObject,
      })
    } catch (error: any) {
      // Red de seguridad ante una carrera: el índice único { nombre, clientId }
      // rechaza el duplicado aunque dos creaciones lleguen a la vez.
      if (error?.code === 11000) {
        throw new BadRequestException(
          `Ya existe una orden de trabajo con el nombre "${nombre}" en esta empresa`
        )
      }
      throw error
    }
  }

  /**
   * Resuelve un centro de costo por texto (código o nombre) para la carga
   * masiva, donde el archivo Excel no puede traer un ObjectId. Prueba primero
   * `code` (match exacto, case-insensitive) y si no hay resultado prueba
   * `name` (también case-insensitive) — ambos scoped a la empresa.
   */
  private async resolveCostCenterByKey(
    key: string,
    clientId: Types.ObjectId
  ): Promise<{ _id: Types.ObjectId; code?: string; name?: string } | null> {
    const trimmed = key.trim()
    if (!trimmed) return null
    const rx = { $regex: `^${escapeRegExp(trimmed)}$`, $options: 'i' }
    const byCode = await this.projectModel
      .findOne({ clientId, code: rx })
      .select('_id code name')
      .exec()
    if (byCode) return byCode
    const byName = await this.projectModel
      .findOne({ clientId, name: rx })
      .select('_id code name')
      .exec()
    return byName ?? null
  }

  /**
   * Dos listas de centros de costo son iguales si traen los mismos ids EN EL
   * MISMO ORDEN: el primero es el principal, así que reordenar sí es un cambio.
   */
  private mismosCentrosCosto(a: Types.ObjectId[], b: Types.ObjectId[]): boolean {
    return (
      a.length === b.length && a.every((id, i) => String(id) === String(b[i]))
    )
  }

  /**
   * Código (o nombre) de cada centro de costo, para mostrarlo en el detalle de
   * la fila. `cache` se comparte en toda la carga: los que ya se resolvieron
   * desde el archivo no se vuelven a consultar.
   */
  private async etiquetasCentrosCosto(
    ids: Types.ObjectId[],
    clientId: Types.ObjectId,
    cache: Map<string, string>
  ): Promise<string[]> {
    const faltantes = ids.map(String).filter((id) => !cache.has(id))
    if (faltantes.length) {
      const docs = await this.projectModel
        .find({
          clientId,
          _id: { $in: faltantes.map((id) => new Types.ObjectId(id)) },
        })
        .select('_id code name')
        .exec()
      for (const doc of docs ?? []) {
        cache.set(String(doc._id), doc.code || doc.name || String(doc._id))
      }
    }
    return ids.map((id) => cache.get(String(id)) || String(id))
  }

  /**
   * Carga masiva desde Excel (regla: mismo patrón que `CategoryService.bulkCreate`
   * — no aborta el lote completo por una fila mala, acumula errores por fila).
   * A diferencia de Category, cada fila tiene una referencia foránea
   * (`costCenterId`) que el archivo solo puede expresar como texto (código o
   * nombre del centro de costo), así que se resuelve por fila antes de guardar.
   *
   * Es ACTUALIZAR-O-CREAR: la plantilla se descarga con las OT que ya existen,
   * así que una fila cuyo nombre ya está en la empresa actualiza esa OT (sus
   * centros de costo y si está activa) en vez de fallar por duplicada; las filas
   * nuevas se crean. El nombre es la llave, y es único por empresa.
   *
   * La celda de centro de costo admite varios separados por coma, punto y coma
   * o barra ("123, 223, 423"); el primero queda como principal. Si la fila viene
   * sin centro de costo y la OT ya existe, conserva los que tenía.
   *
   * Con `opts.dryRun` no escribe nada: devuelve el mismo resultado (contadores
   * y el plan fila por fila) para que el usuario vea qué se va a crear, qué se
   * va a modificar y qué filas fallan ANTES de aceptar la carga.
   */
  async bulkCreate(
    rows: Array<{ nombre: string; costCenterKey: string; isActive?: boolean }>,
    clientId: string,
    opts: { dryRun?: boolean } = {}
  ): Promise<IBulkCreateResult> {
    const dryRun = opts.dryRun === true
    const result: IBulkCreateResult = {
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: [],
      rows: [],
      dryRun,
    }
    const clientIdObject = new Types.ObjectId(clientId)
    const seenNombres = new Set<string>()
    // Códigos de centro de costo ya resueltos, para no repetir consultas al
    // armar el detalle legible de cada fila.
    const etiquetas = new Map<string, string>()

    const fallo = (row: number, nombre: string, reason: string) => {
      result.errors.push({ row, reason })
      result.rows.push({ row, nombre, accion: 'error', reason })
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNumber = i + 2 // Excel: fila 1 = encabezado
      const nombre = row.nombre?.trim()

      if (!nombre) {
        fallo(rowNumber, '', 'El campo Nombre es obligatorio')
        continue
      }
      const nombreKey = nombre.toLowerCase()
      if (seenNombres.has(nombreKey)) {
        fallo(
          rowNumber,
          nombre,
          `Nombre "${nombre}" repetido en este mismo archivo`
        )
        continue
      }

      try {
        const existente = await this.ordenTrabajoModel
          .findOne({
            clientId: clientIdObject,
            nombre: { $regex: `^${escapeRegExp(nombre)}$`, $options: 'i' },
          })
          .exec()

        if (!row.costCenterKey?.trim() && !existente) {
          fallo(rowNumber, nombre, 'Indica el código del centro de costo')
          continue
        }

        let costCenterIds: Types.ObjectId[] = []
        if (row.costCenterKey?.trim()) {
          const claves = row.costCenterKey
            .split(/[,;|]/)
            .map((k) => k.trim())
            .filter(Boolean)
          let claveNoEncontrada = ''
          for (const clave of claves) {
            const encontrado = await this.resolveCostCenterByKey(
              clave,
              clientIdObject
            )
            if (!encontrado) {
              claveNoEncontrada = clave
              break
            }
            etiquetas.set(
              String(encontrado._id),
              encontrado.code || encontrado.name || clave
            )
            if (!costCenterIds.some((id) => id.equals(encontrado._id))) {
              costCenterIds.push(encontrado._id)
            }
          }
          if (claveNoEncontrada || !costCenterIds.length) {
            fallo(
              rowNumber,
              nombre,
              `Centro de costo "${claveNoEncontrada || row.costCenterKey}" no encontrado en esta empresa`
            )
            continue
          }
        }

        if (existente) {
          // Solo se toca lo que de verdad cambia: así la previsualización puede
          // distinguir "se actualiza" de "ya estaba igual".
          const cambios: Record<string, unknown> = {}
          const detalles: string[] = []
          const actuales: Types.ObjectId[] = existente.costCenterIds?.length
            ? existente.costCenterIds
            : existente.costCenterId
              ? [existente.costCenterId]
              : []

          if (
            costCenterIds.length &&
            !this.mismosCentrosCosto(actuales, costCenterIds)
          ) {
            cambios.costCenterIds = costCenterIds
            cambios.costCenterId = costCenterIds[0]
            const antes = await this.etiquetasCentrosCosto(
              actuales,
              clientIdObject,
              etiquetas
            )
            const despues = await this.etiquetasCentrosCosto(
              costCenterIds,
              clientIdObject,
              etiquetas
            )
            detalles.push(
              `Centros de costo: ${antes.join(', ') || '—'} → ${despues.join(', ')}`
            )
          }

          const activaAhora = existente.isActive !== false
          if (row.isActive !== undefined && row.isActive !== activaAhora) {
            cambios.isActive = row.isActive
            detalles.push(
              `Estado: ${activaAhora ? 'Activa' : 'Inactiva'} → ${row.isActive ? 'Activa' : 'Inactiva'}`
            )
          }

          seenNombres.add(nombreKey)

          if (!detalles.length) {
            result.unchanged++
            result.rows.push({
              row: rowNumber,
              nombre,
              accion: 'sin-cambios',
              detalle: 'Ya existe con estos mismos datos',
            })
            continue
          }

          if (!dryRun) {
            await this.ordenTrabajoModel
              .updateOne({ _id: existente._id }, { $set: cambios })
              .exec()
          }
          result.updated++
          result.rows.push({
            row: rowNumber,
            nombre,
            accion: 'actualizar',
            detalle: detalles.join(' · '),
          })
          continue
        }

        if (!dryRun) {
          await this.ordenTrabajoModel.create({
            nombre,
            costCenterId: costCenterIds[0],
            costCenterIds,
            isActive: row.isActive ?? true,
            clientId: clientIdObject,
          })
        }
        seenNombres.add(nombreKey)
        result.created++
        const codigos = await this.etiquetasCentrosCosto(
          costCenterIds,
          clientIdObject,
          etiquetas
        )
        result.rows.push({
          row: rowNumber,
          nombre,
          accion: 'crear',
          detalle: `Centros de costo: ${codigos.join(', ')} · ${row.isActive === false ? 'Inactiva' : 'Activa'}`,
        })
      } catch (error: any) {
        const reason =
          error?.code === 11000
            ? `Ya existe una orden de trabajo con el nombre "${nombre}" en esta empresa`
            : error?.message || 'Error desconocido'
        fallo(rowNumber, nombre, reason)
      }
    }

    return result
  }

  async findAll(
    clientId: string,
    opts?: { page?: number; limit?: number; search?: string; costCenterId?: string }
  ) {
    const clientIdObject = new Types.ObjectId(clientId)
    const filter: Record<string, unknown> = { clientId: clientIdObject }

    if (opts?.costCenterId && Types.ObjectId.isValid(opts.costCenterId)) {
      const centro = new Types.ObjectId(opts.costCenterId)
      // La OT puede servir a varios centros de costo. Se consulta también el
      // campo suelto por si algún documento todavía no tiene la lista.
      filter.$or = [{ costCenterIds: centro }, { costCenterId: centro }]
    }
    if (opts?.search) {
      filter.nombre = new RegExp(escapeRegExp(opts.search), 'i')
    }

    const usePagination = opts?.page !== undefined || opts?.limit !== undefined
    const page = opts?.page ?? 1
    const limit = opts?.limit ?? 20
    const skip = (page - 1) * limit

    const [data, total] = await Promise.all([
      this.ordenTrabajoModel
        .find(filter)
        .populate('costCenterId', 'code name isActive')
        .populate('costCenterIds', 'code name isActive')
        .sort({ createdAt: -1 })
        .skip(usePagination ? skip : 0)
        .limit(usePagination ? limit : 0)
        .exec(),
      this.ordenTrabajoModel.countDocuments(filter).exec(),
    ])

    if (usePagination) {
      return { data, total, page, pages: Math.ceil(total / limit), limit }
    }
    return data
  }

  async findOne(id: string, clientId: string) {
    const orden = await this.ordenTrabajoModel
      .findOne({
        _id: new Types.ObjectId(id),
        clientId: new Types.ObjectId(clientId),
      })
      .populate('costCenterId', 'code name isActive')
      .populate('costCenterIds', 'code name isActive')
      .exec()
    if (!orden) {
      throw new NotFoundException('Orden de trabajo no encontrada')
    }
    return orden
  }

  async update(id: string, dto: UpdateOrdenTrabajoDto, clientId: string) {
    const clientIdObject = new Types.ObjectId(clientId)
    const idObject = new Types.ObjectId(id)

    const payload: Record<string, unknown> = {}

    if (typeof dto.nombre === 'string') {
      const nombre = dto.nombre.trim()
      if (!nombre) {
        throw new BadRequestException('El nombre de la OT no puede quedar vacío')
      }
      await this.ensureUniqueNombre(nombre, clientIdObject, idObject)
      payload.nombre = nombre
    }
    const centrosPedidos = this.mergeCostCenterInput(dto)
    if (centrosPedidos.length) {
      const costCenterIds = await this.assertCostCenters(
        centrosPedidos,
        clientIdObject
      )
      payload.costCenterIds = costCenterIds
      payload.costCenterId = costCenterIds[0]
    }
    if (typeof dto.isActive === 'boolean') {
      payload.isActive = dto.isActive
    }

    let orden: OrdenTrabajoDocument | null
    try {
      orden = await this.ordenTrabajoModel
        .findOneAndUpdate(
          { _id: idObject, clientId: clientIdObject },
          payload,
          { new: true }
        )
        .populate('costCenterId', 'code name isActive')
        .populate('costCenterIds', 'code name isActive')
        .exec()
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new BadRequestException(
          `Ya existe una orden de trabajo con el nombre "${String(
            payload.nombre ?? ''
          )}" en esta empresa`
        )
      }
      throw error
    }

    if (!orden) {
      throw new NotFoundException('Orden de trabajo no encontrada')
    }
    return orden
  }

  async remove(id: string, clientId: string) {
    const result = await this.ordenTrabajoModel
      .findOneAndDelete({
        _id: new Types.ObjectId(id),
        clientId: new Types.ObjectId(clientId),
      })
      .exec()
    if (!result) {
      throw new NotFoundException('Orden de trabajo no encontrada')
    }
    return result
  }
}
