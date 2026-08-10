import { BadRequestException } from '@nestjs/common'
import { Types } from 'mongoose'
import { ROLES } from '../auth/enums/roles.enum'
import {
  ApproverLevel,
  hasConfiguredLevels,
} from '../../common/types/approver-level'

/**
 * Motor de aprobación por cadena, compartido entre el módulo Advance
 * (anticipo genérico, sin centro de costo), el flujo de SOLICITUD de viáticos
 * y la RENDICIÓN por documento (comprobantes). Los niveles (N1/N2/N3…) son
 * ranuras explícitas por identidad — un nivel puede no existir para un centro
 * de costo y el paso correspondiente se omite sin renumerar (regla 1.6).
 *
 * Aprobación EN PARALELO entre niveles (N1/N2/N3…): cualquier aprobador de
 * cualquier paso aún pendiente de un `ChainStep[]` puede actuar, sin importar
 * el orden — N2 puede aprobar antes que N1. Contabilidad (fuera de esta
 * cadena, gate separado en el servicio) es la única etapa secuencial: exige
 * que TODOS los pasos estén aprobados. Ver `findActionableChainStep` /
 * `isChainFullyApproved`. El formato plano (`Types.ObjectId[]`, anticipo
 * genérico) sigue siendo estrictamente secuencial vía `canActOnChain`/
 * `advanceChain` — es un mecanismo legado distinto, no se toca.
 */

export interface ChainStep {
  level: number
  projectId: Types.ObjectId
  projectRole: 'principal' | 'seleccionado'
  /**
   * De dónde salieron los aprobadores de este paso (regla 1.10): `'user'` =
   * niveles propios del colaborador, `'project'` = niveles del centro de
   * costo. Ausente en documentos anteriores a la regla 1.10 — se interpreta
   * como `'project'`. `projectId`/`projectRole` se conservan en ambos casos
   * (en `'user'` apuntan al centro principal, como contexto).
   */
  source?: ChainStepSource
  /** Cualquiera de estos aprobadores puede completar el paso. */
  approverIds: Types.ObjectId[]
  /** Presente si este paso es resultado de un escalamiento (regla 1.5). */
  escalatedFrom?: number
  /** Aprobación en paralelo: este paso específico ya fue resuelto, sin importar el orden de los demás. */
  approved?: boolean
  approvedBy?: Types.ObjectId
  approvedAt?: Date
}

/**
 * Copia PLANA de un paso de cadena. Imprescindible antes de hacer spread de un
 * paso que viene de la base: los subdocumentos de Mongoose NO exponen sus
 * campos por spread — `{ ...subdoc }` copia solo props internas (`_doc`, `$__`…)
 * y PIERDE level/projectId/projectRole, rompiendo la validación `required` al
 * guardar. Sobre un objeto plano el spread ya es seguro (no-op).
 */
export function plainChainStep(step: ChainStep): ChainStep {
  const s = step as unknown as { toObject?: () => ChainStep }
  return typeof s.toObject === 'function' ? s.toObject() : step
}

export interface ChainProject {
  _id: Types.ObjectId | string
  approverLevels?: ApproverLevel[]
}

/** Origen de los aprobadores de un paso (regla 1.10). */
export type ChainStepSource = 'user' | 'project'

/**
 * Fuente de niveles con la que se resuelve un paso. Desacopla el algoritmo de
 * resolución (identidad de nivel + omisión + escalamiento) del origen de los
 * aprobadores: un centro de costo o el propio colaborador (regla 1.10).
 * `projectId`/`projectRole` siempre se rellenan porque el subdocumento
 * persistido los declara obligatorios; en una fuente `'user'` apuntan al
 * centro de costo cuyos niveles quedaron sustituidos.
 */
export interface ChainApproverSource {
  kind: ChainStepSource
  projectId: Types.ObjectId
  projectRole: 'principal' | 'seleccionado'
  approverLevels?: ApproverLevel[]
}

/** Fuente de niveles a partir de un centro de costo. */
export function projectSource(
  project: ChainProject,
  projectRole: 'principal' | 'seleccionado'
): ChainApproverSource {
  return {
    kind: 'project',
    projectId: new Types.ObjectId(project._id),
    projectRole,
    approverLevels: project.approverLevels,
  }
}

/**
 * Regla 1.10: si el colaborador tiene niveles propios configurados, ellos
 * sustituyen a los del centro de costo que le corresponde por su propio perfil
 * (el principal en la rendición; el seleccionado-asignado en la solicitud). Si
 * no tiene ninguno, la fuente sigue siendo el centro de costo, exactamente
 * como antes de la regla 1.10.
 */
export function ownerOrProjectSource(opts: {
  ownerApproverLevels?: ApproverLevel[]
  fallbackProject: ChainProject
  projectRole: 'principal' | 'seleccionado'
}): ChainApproverSource {
  const { ownerApproverLevels, fallbackProject, projectRole } = opts
  if (hasConfiguredLevels(ownerApproverLevels)) {
    return {
      kind: 'user',
      projectId: new Types.ObjectId(fallbackProject._id),
      projectRole,
      approverLevels: ownerApproverLevels,
    }
  }
  return projectSource(fallbackProject, projectRole)
}

/**
 * Cadena plana usada por el anticipo genérico (Advance sin centro de costo):
 * `User.approverIds`, sin niveles ni centro de costo.
 */
export function buildApproverChain(
  approverIds: Types.ObjectId[] | undefined
): Types.ObjectId[] {
  const chain = approverIds ?? []
  if (chain.length === 0) {
    throw new BadRequestException(
      'El colaborador no tiene aprobadores (coordinadores) asignados. Un administrador debe asignarle al menos uno antes de poder solicitar.'
    )
  }
  return chain
}

function expectedApproverIds(
  chain: ChainStep[] | Types.ObjectId[],
  approvalLevel: number
): Types.ObjectId[] {
  const step = chain[approvalLevel] as ChainStep | Types.ObjectId | undefined
  if (!step) return []
  return (step as ChainStep).approverIds ?? [step as Types.ObjectId]
}

export function canActOnChain(opts: {
  chain: ChainStep[] | Types.ObjectId[]
  approvalLevel: number
  actorId: string
  actorRole: string
}): boolean {
  if (opts.actorRole === ROLES.SUPER_ADMIN) return true
  const approverIds = expectedApproverIds(opts.chain, opts.approvalLevel)
  return approverIds.some(id => id.toString() === opts.actorId)
}

export function advanceChain(opts: {
  approvalLevel: number
  requiredLevels: number
}): { approvalLevel: number; isComplete: boolean } {
  const approvalLevel = opts.approvalLevel + 1
  return { approvalLevel, isComplete: approvalLevel >= opts.requiredLevels }
}

/**
 * Índice del primer paso PENDIENTE de `chain` donde `actorId` es aprobador —
 * cualquier paso no aprobado todavía, sin importar su posición (aprobación en
 * paralelo entre niveles). Devuelve -1 si no le corresponde ningún paso
 * pendiente. SuperAdmin: llave maestra sobre el primer paso pendiente.
 */
export function findActionableChainStep(opts: {
  chain: ChainStep[]
  actorId: string
  actorRole: string
}): number {
  const { chain, actorId, actorRole } = opts
  if (actorRole === ROLES.SUPER_ADMIN) {
    return chain.findIndex(step => !step.approved)
  }
  return chain.findIndex(
    step => !step.approved && step.approverIds.some(id => id.toString() === actorId)
  )
}

/**
 * Etiqueta legible de un paso para los mensajes al colaborador: distingue un
 * paso resuelto con sus propios aprobadores (regla 1.10) de uno resuelto con
 * los aprobadores del centro de costo. Los pasos anteriores a la regla 1.10 no
 * traen `source` y se describen como del centro de costo.
 */
export function describeChainStep(step: ChainStep): string {
  return step.source === 'user'
    ? `uno de tus aprobadores de nivel ${step.level}`
    : `uno de los aprobadores de nivel ${step.level} del centro de costo`
}

/** `true` si TODOS los pasos de la cadena ya están aprobados, sin importar el orden en que se aprobaron. Cadena vacía (regla 1.6, todos los niveles omitidos) cuenta como completada. */
export function isChainFullyApproved(chain: ChainStep[]): boolean {
  return chain.every(step => !!step.approved)
}

function sameApproverSet(a: Types.ObjectId[], b: Types.ObjectId[]): boolean {
  if (a.length !== b.length) return false
  const as = a.map(x => x.toString()).sort()
  const bs = b.map(x => x.toString()).sort()
  return as.every((v, i) => v === bs[i])
}

/** Colapsa pasos consecutivos con exactamente el mismo conjunto de aprobadores. */
function collapseConsecutiveSameApprovers(steps: ChainStep[]): ChainStep[] {
  const result: ChainStep[] = []
  for (const step of steps) {
    const prev = result[result.length - 1]
    if (prev && sameApproverSet(prev.approverIds, step.approverIds)) continue
    result.push(step)
  }
  return result
}

/**
 * Resuelve un paso de la cadena para un nivel solicitado (identidad fija) de
 * un centro de costo. Implementa el algoritmo de DiagramaCadenaAprobacion.md §6:
 * - Si el nivel exacto solicitado no existe o no tiene aprobadores → `null`
 *   (paso omitido, regla 1.6). No se buscan niveles vecinos en este caso.
 * - Si existe y el creador NO está entre sus aprobadores → se usa ese nivel.
 * - Si el creador SÍ está: se intenta escalar al siguiente nivel EXISTENTE
 *   (regla 1.5); si no hay nivel superior, se usan los demás aprobadores del
 *   mismo nivel (excluyendo al creador); si no queda nadie, se omite (`null`).
 */
export function resolveApprovalStep(opts: {
  project: ChainProject
  requestedLevel: number
  creatorId: string
  projectRole: 'principal' | 'seleccionado'
}): ChainStep | null {
  return resolveStepFromSource({
    source: projectSource(opts.project, opts.projectRole),
    requestedLevel: opts.requestedLevel,
    creatorId: opts.creatorId,
  })
}

/**
 * Igual que `resolveApprovalStep` pero sobre una fuente genérica de niveles
 * (centro de costo o colaborador, regla 1.10). El algoritmo es idéntico: la
 * regla 1.10 solo cambia de dónde salen los niveles, no cómo se resuelven.
 */
export function resolveStepFromSource(opts: {
  source: ChainApproverSource
  requestedLevel: number
  creatorId: string
}): ChainStep | null {
  const { source, requestedLevel, creatorId } = opts
  const levels = source.approverLevels ?? []
  const { projectId, projectRole } = source

  let currentLevel = requestedLevel
  const visited = new Set<number>()

  while (true) {
    if (visited.has(currentLevel)) return null
    visited.add(currentLevel)

    const slot = levels.find(l => l.level === currentLevel)
    const approvers = slot?.userIds ?? []
    if (approvers.length === 0) return null

    const creatorIsApprover = approvers.some(id => id.toString() === creatorId)
    if (!creatorIsApprover) {
      return {
        level: currentLevel,
        projectId,
        projectRole,
        source: source.kind,
        approverIds: approvers,
        escalatedFrom: currentLevel === requestedLevel ? undefined : requestedLevel,
      }
    }

    const higherLevels = levels
      .filter(l => l.level > currentLevel && (l.userIds?.length ?? 0) > 0)
      .sort((a, b) => a.level - b.level)
    if (higherLevels.length > 0) {
      currentLevel = higherLevels[0].level
      continue
    }

    const others = approvers.filter(id => id.toString() !== creatorId)
    if (others.length > 0) {
      return {
        level: currentLevel,
        projectId,
        projectRole,
        source: source.kind,
        approverIds: others,
        escalatedFrom: currentLevel === requestedLevel ? undefined : requestedLevel,
      }
    }

    return null
  }
}

/**
 * Cadena de SOLICITUD de viáticos (regla 1.3, con la sustitución de la regla
 * 1.10):
 * - Centro seleccionado asignado al colaborador → 1 paso: N2 del COLABORADOR
 *   (o N2 del centro seleccionado si el colaborador no tiene niveles propios).
 * - No asignado → 2 pasos: N2 del COLABORADOR (o N2 del centro principal como
 *   fallback) → N2(seleccionado). Colapsa a 1 si terminan siendo el mismo
 *   conjunto de aprobadores.
 * Contabilidad NO forma parte de este arreglo — se mantiene como gate final
 * separado en ambos casos (decisión 7.0.1, riesgo "Contabilidad Caso B").
 */
export function buildSolicitudChain(opts: {
  assignedProjectIds: string[]
  primaryProjectId?: string
  selectedProjectId: string
  creatorId: string
  projectById: Map<string, ChainProject>
  /** Niveles propios del colaborador (regla 1.10). */
  ownerApproverLevels?: ApproverLevel[]
}): ChainStep[] {
  const {
    assignedProjectIds,
    primaryProjectId,
    selectedProjectId,
    creatorId,
    projectById,
    ownerApproverLevels,
  } = opts

  if (assignedProjectIds.length === 0) {
    throw new BadRequestException(
      'El colaborador no tiene centros de costo asignados. Un administrador debe asignarle al menos uno en sus permisos antes de solicitar fondos.'
    )
  }

  const isAssigned = assignedProjectIds.includes(selectedProjectId)
  const steps: ChainStep[] = []

  const selectedProject = projectById.get(selectedProjectId)
  if (!selectedProject) {
    throw new BadRequestException('El centro de costo seleccionado no fue encontrado.')
  }

  if (!isAssigned) {
    const principalId = primaryProjectId ?? assignedProjectIds[0]
    const principalProject = projectById.get(principalId)
    if (!principalProject) {
      throw new BadRequestException(
        'Su centro de costo principal no fue encontrado. Un administrador debe revisarlo antes de solicitar fondos hacia otro centro de costo.'
      )
    }
    const principalStep = resolveStepFromSource({
      source: ownerOrProjectSource({
        ownerApproverLevels,
        fallbackProject: principalProject,
        projectRole: 'principal',
      }),
      requestedLevel: 2,
      creatorId,
    })
    if (principalStep) steps.push(principalStep)

    const selectedStep = resolveApprovalStep({
      project: selectedProject,
      requestedLevel: 2,
      creatorId,
      projectRole: 'seleccionado',
    })
    if (selectedStep) steps.push(selectedStep)

    return collapseConsecutiveSameApprovers(steps)
  }

  // Centro asignado: el único paso sale del colaborador (regla 1.10); sin
  // niveles propios se cae al N2 del centro seleccionado, como antes.
  const assignedStep = resolveStepFromSource({
    source: ownerOrProjectSource({
      ownerApproverLevels,
      fallbackProject: selectedProject,
      projectRole: 'seleccionado',
    }),
    requestedLevel: 2,
    creatorId,
  })
  if (assignedStep) steps.push(assignedStep)

  return collapseConsecutiveSameApprovers(steps)
}

/**
 * Cadena de RENDICIÓN por documento (regla 1.4, con la sustitución de la regla
 * 1.10), usada por cada comprobante (`Expense`) — de rendición normal, directa
 * y caja chica por igual:
 * - Centro del comprobante asignado al colaborador → N1 → N2 del COLABORADOR.
 * - No asignado → N1 → N2 del COLABORADOR → N2(seleccionado).
 * Si el colaborador no tiene niveles propios, N1/N2 salen del centro de costo
 * principal, exactamente como antes de la regla 1.10.
 * Contabilidad NO forma parte de este arreglo — gate final separado (mismo
 * criterio que la solicitud).
 */
export function buildRendicionChain(opts: {
  assignedProjectIds: string[]
  primaryProjectId?: string
  selectedProjectId: string
  creatorId: string
  projectById: Map<string, ChainProject>
  /** Niveles propios del colaborador (regla 1.10). */
  ownerApproverLevels?: ApproverLevel[]
}): ChainStep[] {
  const {
    assignedProjectIds,
    primaryProjectId,
    selectedProjectId,
    creatorId,
    projectById,
    ownerApproverLevels,
  } = opts

  if (assignedProjectIds.length === 0) {
    throw new BadRequestException(
      'El colaborador no tiene centros de costo asignados. Un administrador debe asignarle al menos uno en sus permisos antes de registrar gastos.'
    )
  }

  const principalId = primaryProjectId ?? assignedProjectIds[0]
  const principalProject = projectById.get(principalId)
  if (!principalProject) {
    throw new BadRequestException(
      'Su centro de costo principal no fue encontrado. Un administrador debe revisarlo antes de enviar esta rendición.'
    )
  }

  const steps: ChainStep[] = []

  // Regla 1.10: N1/N2 salen del colaborador si tiene niveles propios; si no,
  // del centro de costo principal (comportamiento previo).
  const ownerSource = ownerOrProjectSource({
    ownerApproverLevels,
    fallbackProject: principalProject,
    projectRole: 'principal',
  })

  const n1 = resolveStepFromSource({ source: ownerSource, requestedLevel: 1, creatorId })
  if (n1) steps.push(n1)

  const n2 = resolveStepFromSource({ source: ownerSource, requestedLevel: 2, creatorId })
  if (n2) steps.push(n2)

  const isAssigned = assignedProjectIds.includes(selectedProjectId)
  if (!isAssigned) {
    const selectedProject = projectById.get(selectedProjectId)
    if (!selectedProject) {
      throw new BadRequestException('El centro de costo del comprobante no fue encontrado.')
    }
    const selectedStep = resolveApprovalStep({
      project: selectedProject,
      requestedLevel: 2,
      creatorId,
      projectRole: 'seleccionado',
    })
    if (selectedStep) steps.push(selectedStep)
  }

  return collapseConsecutiveSameApprovers(steps)
}
