import { Types } from 'mongoose'
import { BadRequestException } from '@nestjs/common'
import { ROLES } from '../auth/enums/roles.enum'
import {
  buildApproverChain,
  canActOnChain,
  advanceChain,
  findActionableChainStep,
  isChainFullyApproved,
  resolveApprovalStep,
  buildSolicitudChain,
  buildRendicionChain,
  buildCajaChicaChain,
  identidadesDelActor,
  titularCubiertoEnPaso,
  ChainStep,
  ChainProject,
} from './approval-chain.util'

describe('approval-chain.util', () => {
  const a1 = new Types.ObjectId()
  const a2 = new Types.ObjectId()
  const a3 = new Types.ObjectId()
  const u1 = new Types.ObjectId() // creador de ejemplo, distinto de a1/a2/a3

  const projectId = new Types.ObjectId()

  function project(levels: { level: number; userIds: Types.ObjectId[] }[]): ChainProject {
    return { _id: projectId, approverLevels: levels }
  }

  describe('buildApproverChain', () => {
    it('returns the chain unchanged when non-empty', () => {
      expect(buildApproverChain([a1, a2])).toEqual([a1, a2])
    })

    it('throws BadRequestException when the chain is empty', () => {
      expect(() => buildApproverChain([])).toThrow(BadRequestException)
    })

    it('throws BadRequestException when approverIds is undefined', () => {
      expect(() => buildApproverChain(undefined)).toThrow(BadRequestException)
    })
  })

  describe('canActOnChain / advanceChain (formato plano, anticipo genérico)', () => {
    it('allows the approver whose turn it is', () => {
      expect(
        canActOnChain({ chain: [a1, a2], approvalLevel: 0, actorId: a1.toString(), actorRole: ROLES.COORDINADOR })
      ).toBe(true)
    })

    it('rejects a user who is in the chain but not at the current turn', () => {
      expect(
        canActOnChain({ chain: [a1, a2], approvalLevel: 0, actorId: a2.toString(), actorRole: ROLES.COORDINADOR })
      ).toBe(false)
    })

    it('allows Superadministrador as break-glass regardless of chain position', () => {
      expect(
        canActOnChain({ chain: [a1, a2], approvalLevel: 0, actorId: a3.toString(), actorRole: ROLES.SUPER_ADMIN })
      ).toBe(true)
    })

    it('marks complete when the last approver in the chain acts', () => {
      expect(advanceChain({ approvalLevel: 1, requiredLevels: 2 })).toEqual({ approvalLevel: 2, isComplete: true })
    })
  })

  describe('canActOnChain (formato ChainStep — cualquiera de N aprobadores)', () => {
    const step: ChainStep = {
      level: 2,
      projectId,
      projectRole: 'seleccionado',
      approverIds: [a1, a2],
    }

    it('allows any approver among approverIds', () => {
      expect(canActOnChain({ chain: [step], approvalLevel: 0, actorId: a2.toString(), actorRole: ROLES.COORDINADOR })).toBe(true)
    })

    it('rejects someone not in approverIds', () => {
      expect(canActOnChain({ chain: [step], approvalLevel: 0, actorId: a3.toString(), actorRole: ROLES.COORDINADOR })).toBe(false)
    })
  })

  describe('findActionableChainStep / isChainFullyApproved (cadena CONSECUTIVA, VD-133)', () => {
    function makeChain(): ChainStep[] {
      return [
        { level: 1, projectId, projectRole: 'principal', approverIds: [a1] },
        { level: 2, projectId, projectRole: 'principal', approverIds: [a2] },
      ]
    }

    // VD-133. Antes esto devolvia 1: el N2 podia firmar sin que el N1 hubiera
    // actuado, con lo que la aprobacion del jefe directo dejaba de ser una
    // condicion para la del siguiente nivel.
    it('el N2 NO puede aprobar mientras el N1 no haya actuado', () => {
      const chain = makeChain()
      expect(findActionableChainStep({ chain, actorId: a2.toString(), actorRole: ROLES.COORDINADOR })).toBe(-1)
    })

    it('el N1 es el unico accionable al inicio', () => {
      const chain = makeChain()
      expect(findActionableChainStep({ chain, actorId: a1.toString(), actorRole: ROLES.COORDINADOR })).toBe(0)
    })

    it('el N2 se habilita en cuanto el N1 firma', () => {
      const chain = makeChain()
      chain[0].approved = true
      expect(findActionableChainStep({ chain, actorId: a2.toString(), actorRole: ROLES.COORDINADOR })).toBe(1)
    })

    it('SuperAdmin tampoco se salta el orden: actua sobre el paso en curso', () => {
      const chain = makeChain()
      // Devuelve 0 (el paso del N1), no 1, aunque sea llave maestra.
      expect(findActionableChainStep({ chain, actorId: a3.toString(), actorRole: ROLES.SUPER_ADMIN })).toBe(0)
      chain[0].approved = true
      expect(findActionableChainStep({ chain, actorId: a3.toString(), actorRole: ROLES.SUPER_ADMIN })).toBe(1)
    })

    it('returns -1 for someone who is not an approver of any pending step', () => {
      const chain = makeChain()
      expect(findActionableChainStep({ chain, actorId: a3.toString(), actorRole: ROLES.COORDINADOR })).toBe(-1)
    })

    it('skips steps already approved and finds the next pending one for the same approver', () => {
      const chain = makeChain()
      chain[0].approved = true
      expect(findActionableChainStep({ chain, actorId: a1.toString(), actorRole: ROLES.COORDINADOR })).toBe(-1)
      expect(findActionableChainStep({ chain, actorId: a2.toString(), actorRole: ROLES.COORDINADOR })).toBe(1)
    })

    it('SuperAdmin can act on the first pending step regardless of who the approvers are', () => {
      const chain = makeChain()
      expect(findActionableChainStep({ chain, actorId: a3.toString(), actorRole: ROLES.SUPER_ADMIN })).toBe(0)
    })

    it('returns -1 when every step is already approved', () => {
      const chain = makeChain()
      chain[0].approved = true
      chain[1].approved = true
      expect(findActionableChainStep({ chain, actorId: a1.toString(), actorRole: ROLES.COORDINADOR })).toBe(-1)
    })

    it('isChainFullyApproved is false while any step is pending, regardless of order', () => {
      const chain = makeChain()
      chain[1].approved = true // N2 approved first, N1 still pending
      expect(isChainFullyApproved(chain)).toBe(false)
      chain[0].approved = true
      expect(isChainFullyApproved(chain)).toBe(true)
    })

    it('isChainFullyApproved is true for an empty chain (regla 1.6, all levels omitted)', () => {
      expect(isChainFullyApproved([])).toBe(true)
    })
  })

  describe('resolveApprovalStep', () => {
    it('returns null (omite) when the exact requested level does not exist — regla 1.6', () => {
      const p = project([{ level: 2, userIds: [a1] }])
      expect(resolveApprovalStep({ project: p, requestedLevel: 1, creatorId: u1.toString(), projectRole: 'principal' })).toBeNull()
    })

    it('returns null (omite) when the level exists but has no approvers', () => {
      const p = project([{ level: 1, userIds: [] }])
      expect(resolveApprovalStep({ project: p, requestedLevel: 1, creatorId: u1.toString(), projectRole: 'principal' })).toBeNull()
    })

    it('uses the level as-is when the creator is not among its approvers', () => {
      const p = project([{ level: 2, userIds: [a1, a2] }])
      const step = resolveApprovalStep({ project: p, requestedLevel: 2, creatorId: u1.toString(), projectRole: 'seleccionado' })
      expect(step).toEqual({ level: 2, projectId, projectRole: 'seleccionado', source: 'project', approverIds: [a1, a2], escalatedFrom: undefined })
    })

    it('escalates to the next existing level when the creator is the sole approver — regla 1.5', () => {
      const p = project([
        { level: 2, userIds: [a1] },
        { level: 3, userIds: [a2] },
      ])
      const step = resolveApprovalStep({ project: p, requestedLevel: 2, creatorId: a1.toString(), projectRole: 'principal' })
      expect(step).toEqual({ level: 3, projectId, projectRole: 'principal', source: 'project', approverIds: [a2], escalatedFrom: 2 })
    })

    it('uses the other approvers of the same level when the creator is one of several and there is no higher level', () => {
      const p = project([{ level: 2, userIds: [a1, a2] }])
      const step = resolveApprovalStep({ project: p, requestedLevel: 2, creatorId: a1.toString(), projectRole: 'principal' })
      expect(step).toEqual({ level: 2, projectId, projectRole: 'principal', source: 'project', approverIds: [a2], escalatedFrom: undefined })
    })

    it('omits the step when the creator is the sole approver and there is no higher level', () => {
      const p = project([{ level: 2, userIds: [a1] }])
      expect(resolveApprovalStep({ project: p, requestedLevel: 2, creatorId: a1.toString(), projectRole: 'principal' })).toBeNull()
    })

    it('keeps escalating across multiple levels until it finds one without the creator', () => {
      const p = project([
        { level: 1, userIds: [a1] },
        { level: 2, userIds: [a1] },
        { level: 3, userIds: [a2] },
      ])
      const step = resolveApprovalStep({ project: p, requestedLevel: 1, creatorId: a1.toString(), projectRole: 'principal' })
      expect(step).toEqual({ level: 3, projectId, projectRole: 'principal', source: 'project', approverIds: [a2], escalatedFrom: 1 })
    })
  })

  describe('buildSolicitudChain (regla 1.3)', () => {
    const projA = new Types.ObjectId().toString()
    const projB = new Types.ObjectId().toString()

    function projectById(map: Record<string, { level: number; userIds: Types.ObjectId[] }[]>) {
      return new Map(
        Object.entries(map).map(([id, levels]) => [id, { _id: id, approverLevels: levels }])
      )
    }

    it('1 step (N2 selected) when the selected project is assigned', () => {
      const chain = buildSolicitudChain({
        assignedProjectIds: [projA, projB],
        selectedProjectId: projB,
        creatorId: u1.toString(),
        projectById: projectById({ [projB]: [{ level: 2, userIds: [a2] }] }),
      })
      expect(chain).toEqual([{ level: 2, projectId: new Types.ObjectId(projB), projectRole: 'seleccionado', source: 'project', approverIds: [a2], escalatedFrom: undefined }])
    })

    it('2 steps (N2 principal -> N2 selected) when not assigned', () => {
      const projC = new Types.ObjectId().toString()
      const chain = buildSolicitudChain({
        assignedProjectIds: [projA, projB],
        selectedProjectId: projC,
        creatorId: u1.toString(),
        projectById: projectById({
          [projA]: [{ level: 2, userIds: [a1] }],
          [projC]: [{ level: 2, userIds: [a3] }],
        }),
      })
      expect(chain.map(s => s.approverIds)).toEqual([[a1], [a3]])
    })

    it('collapses to 1 step when principal and selected resolve to the same approver set', () => {
      const projC = new Types.ObjectId().toString()
      const chain = buildSolicitudChain({
        assignedProjectIds: [projA, projB],
        selectedProjectId: projC,
        creatorId: u1.toString(),
        projectById: projectById({
          [projA]: [{ level: 2, userIds: [a1] }],
          [projC]: [{ level: 2, userIds: [a1] }],
        }),
      })
      expect(chain.length).toBe(1)
    })

    it('throws when the collaborator has no assigned cost centers', () => {
      expect(() =>
        buildSolicitudChain({
          assignedProjectIds: [],
          selectedProjectId: projA,
          creatorId: u1.toString(),
          projectById: projectById({}),
        })
      ).toThrow(BadRequestException)
    })
  })

  describe('buildRendicionChain (regla 1.4)', () => {
    const projA = new Types.ObjectId().toString()
    const projB = new Types.ObjectId().toString()

    function projectById(map: Record<string, { level: number; userIds: Types.ObjectId[] }[]>) {
      return new Map(
        Object.entries(map).map(([id, levels]) => [id, { _id: id, approverLevels: levels }])
      )
    }

    it('N1 principal -> N2 principal when the expense project is assigned', () => {
      const chain = buildRendicionChain({
        assignedProjectIds: [projA],
        selectedProjectId: projA,
        creatorId: u1.toString(),
        projectById: projectById({
          [projA]: [
            { level: 1, userIds: [a1] },
            { level: 2, userIds: [a2] },
          ],
        }),
      })
      expect(chain.map(s => s.level)).toEqual([1, 2])
    })

    it('skips N1 without renumbering when the principal has no N1 configured — regla 1.6', () => {
      const chain = buildRendicionChain({
        assignedProjectIds: [projA],
        selectedProjectId: projA,
        creatorId: u1.toString(),
        projectById: projectById({ [projA]: [{ level: 2, userIds: [a2] }] }),
      })
      expect(chain).toEqual([{ level: 2, projectId: new Types.ObjectId(projA), projectRole: 'principal', source: 'project', approverIds: [a2], escalatedFrom: undefined }])
    })

    it('adds N2(selected) as a third step when the expense project is not assigned', () => {
      const chain = buildRendicionChain({
        assignedProjectIds: [projA],
        selectedProjectId: projB,
        creatorId: u1.toString(),
        projectById: projectById({
          [projA]: [
            { level: 1, userIds: [a1] },
            { level: 2, userIds: [a2] },
          ],
          [projB]: [{ level: 2, userIds: [a3] }],
        }),
      })
      expect(chain.map(s => s.approverIds)).toEqual([[a1], [a2], [a3]])
    })

    it('returns an empty chain (goes straight to Contabilidad) when no level is configured', () => {
      const chain = buildRendicionChain({
        assignedProjectIds: [projA],
        selectedProjectId: projA,
        creatorId: u1.toString(),
        projectById: projectById({ [projA]: [] }),
      })
      expect(chain).toEqual([])
    })
  })

  describe('buildCajaChicaChain', () => {
    const projA = new Types.ObjectId().toString()
    const o1 = new Types.ObjectId() // N1 del responsable
    const o2 = new Types.ObjectId() // N2 del responsable
    const o3 = new Types.ObjectId() // N3 del responsable

    const principal = (
      levels: { level: number; userIds: Types.ObjectId[] }[] = []
    ): ChainProject => ({ _id: projA, approverLevels: levels })

    it('arma la cadena con los niveles del responsable, ignorando el centro de costo', () => {
      const chain = buildCajaChicaChain({
        ownerApproverLevels: [
          { level: 1, userIds: [o1] },
          { level: 2, userIds: [o2] },
        ],
        // El centro trae otros aprobadores: no deben aparecer.
        fallbackProject: principal([{ level: 1, userIds: [a1] }]),
        creatorId: u1.toString(),
      })
      expect(chain.map(s => s.approverIds)).toEqual([[o1], [o2]])
      expect(chain.map(s => s.source)).toEqual(['user', 'user'])
      expect(chain.every(s => s.projectId.toString() === projA)).toBe(true)
    })

    it('recorre TODOS los niveles configurados, no solo N1 y N2', () => {
      const chain = buildCajaChicaChain({
        ownerApproverLevels: [
          { level: 1, userIds: [o1] },
          { level: 2, userIds: [o2] },
          { level: 3, userIds: [o3] },
        ],
        fallbackProject: principal(),
        creatorId: u1.toString(),
      })
      expect(chain.map(s => s.level)).toEqual([1, 2, 3])
    })

    it('un solo nivel configurado da una cadena de un paso', () => {
      const chain = buildCajaChicaChain({
        ownerApproverLevels: [{ level: 1, userIds: [o1, o2] }],
        fallbackProject: principal(),
        creatorId: u1.toString(),
      })
      expect(chain.map(s => s.approverIds)).toEqual([[o1, o2]])
    })

    it('omite el nivel vacío sin renumerar (regla 1.6)', () => {
      const chain = buildCajaChicaChain({
        ownerApproverLevels: [
          { level: 1, userIds: [] },
          { level: 3, userIds: [o3] },
        ],
        fallbackProject: principal(),
        creatorId: u1.toString(),
      })
      expect(chain.map(s => s.level)).toEqual([3])
    })

    it('escala al nivel siguiente si el responsable es su propio aprobador y no duplica el paso', () => {
      const chain = buildCajaChicaChain({
        ownerApproverLevels: [
          { level: 1, userIds: [u1] },
          { level: 2, userIds: [o2] },
        ],
        fallbackProject: principal(),
        creatorId: u1.toString(),
      })
      // N1 escala a N2, y el paso de N2 se colapsa contra el escalado.
      expect(chain.map(s => s.approverIds)).toEqual([[o2]])
      expect(chain[0].escalatedFrom).toBe(1)
    })

    it('cae a los niveles del centro principal cuando el responsable no tiene ninguno propio', () => {
      const chain = buildCajaChicaChain({
        ownerApproverLevels: [],
        fallbackProject: principal([
          { level: 1, userIds: [a1] },
          { level: 2, userIds: [a2] },
        ]),
        creatorId: u1.toString(),
      })
      expect(chain.map(s => s.approverIds)).toEqual([[a1], [a2]])
      expect(chain.map(s => s.source)).toEqual(['project', 'project'])
    })

    it('falla si no queda ningún aprobador: el fondo no puede aprobarse solo', () => {
      expect(() =>
        buildCajaChicaChain({
          ownerApproverLevels: [],
          fallbackProject: principal(),
          creatorId: u1.toString(),
        })
      ).toThrow(BadRequestException)
    })

    it('falla si el responsable es el único aprobador de todos sus niveles', () => {
      expect(() =>
        buildCajaChicaChain({
          ownerApproverLevels: [{ level: 1, userIds: [u1] }],
          fallbackProject: principal(),
          creatorId: u1.toString(),
        })
      ).toThrow(BadRequestException)
    })

    it('con throwOnEmpty:false devuelve la cadena vacía en vez de lanzar', () => {
      // Es lo que usa la cadena de comprobantes ya guardados: lanzar ahí
      // dejaría el gasto a medio registrar.
      const chain = buildCajaChicaChain({
        ownerApproverLevels: [],
        fallbackProject: principal(),
        creatorId: u1.toString(),
        throwOnEmpty: false,
      })
      expect(chain).toEqual([])
    })
  })

  describe('aprobadores propios del colaborador (regla 1.10)', () => {
    const projA = new Types.ObjectId().toString() // principal / asignado
    const projB = new Types.ObjectId().toString() // seleccionado NO asignado
    const o1 = new Types.ObjectId() // N1 del colaborador
    const o2 = new Types.ObjectId() // N2 del colaborador
    const o3 = new Types.ObjectId() // N3 del colaborador

    function projectById(map: Record<string, { level: number; userIds: Types.ObjectId[] }[]>) {
      return new Map(
        Object.entries(map).map(([id, levels]) => [id, { _id: id, approverLevels: levels }])
      )
    }

    const projectLevels = projectById({
      [projA]: [
        { level: 1, userIds: [a1] },
        { level: 2, userIds: [a2] },
      ],
      [projB]: [{ level: 2, userIds: [a3] }],
    })

    describe('RENDICIÓN', () => {
      it('usa N1/N2 del colaborador en vez de los del centro principal cuando el centro está asignado', () => {
        const chain = buildRendicionChain({
          assignedProjectIds: [projA],
          selectedProjectId: projA,
          creatorId: u1.toString(),
          projectById: projectLevels,
          ownerApproverLevels: [
            { level: 1, userIds: [o1] },
            { level: 2, userIds: [o2] },
          ],
        })
        expect(chain.map(s => s.approverIds)).toEqual([[o1], [o2]])
        expect(chain.map(s => s.source)).toEqual(['user', 'user'])
        // El paso sigue anclado al centro principal como contexto.
        expect(chain.every(s => s.projectId.toString() === projA)).toBe(true)
      })

      it('añade N2 del centro seleccionado al final cuando el centro NO está asignado', () => {
        const chain = buildRendicionChain({
          assignedProjectIds: [projA],
          selectedProjectId: projB,
          creatorId: u1.toString(),
          projectById: projectLevels,
          ownerApproverLevels: [
            { level: 1, userIds: [o1] },
            { level: 2, userIds: [o2] },
          ],
        })
        expect(chain.map(s => s.approverIds)).toEqual([[o1], [o2], [a3]])
        expect(chain.map(s => s.source)).toEqual(['user', 'user', 'project'])
      })

      it('notifica a TODOS los aprobadores de un nivel con varios configurados', () => {
        const chain = buildRendicionChain({
          assignedProjectIds: [projA],
          selectedProjectId: projA,
          creatorId: u1.toString(),
          projectById: projectLevels,
          ownerApproverLevels: [{ level: 2, userIds: [o1, o2, o3] }],
        })
        expect(chain.map(s => s.approverIds)).toEqual([[o1, o2, o3]])
      })

      it('cae a los niveles del centro principal cuando el colaborador no tiene ninguno', () => {
        const chain = buildRendicionChain({
          assignedProjectIds: [projA],
          selectedProjectId: projA,
          creatorId: u1.toString(),
          projectById: projectLevels,
          ownerApproverLevels: [],
        })
        expect(chain.map(s => s.approverIds)).toEqual([[a1], [a2]])
        expect(chain.map(s => s.source)).toEqual(['project', 'project'])
      })

      it('cae al centro principal si los niveles del colaborador existen pero están vacíos', () => {
        const chain = buildRendicionChain({
          assignedProjectIds: [projA],
          selectedProjectId: projA,
          creatorId: u1.toString(),
          projectById: projectLevels,
          ownerApproverLevels: [{ level: 1, userIds: [] }],
        })
        expect(chain.map(s => s.approverIds)).toEqual([[a1], [a2]])
      })

      it('omite N1 sin renumerar cuando el colaborador solo tiene N2 — regla 1.6', () => {
        const chain = buildRendicionChain({
          assignedProjectIds: [projA],
          selectedProjectId: projA,
          creatorId: u1.toString(),
          projectById: projectLevels,
          ownerApproverLevels: [{ level: 2, userIds: [o2] }],
        })
        expect(chain.map(s => s.level)).toEqual([2])
        expect(chain[0].source).toBe('user')
      })

      it('escala al siguiente nivel propio cuando el creador es su propio N1 — regla 1.5', () => {
        const chain = buildRendicionChain({
          assignedProjectIds: [projA],
          selectedProjectId: projA,
          creatorId: o1.toString(),
          projectById: projectLevels,
          ownerApproverLevels: [
            { level: 1, userIds: [o1] },
            { level: 2, userIds: [o2] },
          ],
        })
        // N1 escala a N2 y colapsa con el N2 propio: un solo paso.
        expect(chain.map(s => s.level)).toEqual([2])
        expect(chain[0].approverIds).toEqual([o2])
      })

      it('colapsa el N2 propio con el N2 del centro seleccionado cuando son el mismo conjunto', () => {
        const chain = buildRendicionChain({
          assignedProjectIds: [projA],
          selectedProjectId: projB,
          creatorId: u1.toString(),
          projectById: projectById({
            [projA]: [{ level: 1, userIds: [a1] }],
            [projB]: [{ level: 2, userIds: [o2] }],
          }),
          ownerApproverLevels: [{ level: 2, userIds: [o2] }],
        })
        expect(chain.map(s => s.approverIds)).toEqual([[o2]])
      })
    })

    describe('SOLICITUD', () => {
      it('usa el N2 del colaborador cuando el centro seleccionado está asignado', () => {
        const chain = buildSolicitudChain({
          assignedProjectIds: [projA],
          selectedProjectId: projA,
          creatorId: u1.toString(),
          projectById: projectLevels,
          ownerApproverLevels: [{ level: 2, userIds: [o2, o3] }],
        })
        expect(chain.map(s => s.approverIds)).toEqual([[o2, o3]])
        expect(chain[0].source).toBe('user')
      })

      it('N2 del colaborador -> N2 del centro seleccionado cuando NO está asignado', () => {
        const chain = buildSolicitudChain({
          assignedProjectIds: [projA],
          selectedProjectId: projB,
          creatorId: u1.toString(),
          projectById: projectLevels,
          ownerApproverLevels: [{ level: 2, userIds: [o2] }],
        })
        expect(chain.map(s => s.approverIds)).toEqual([[o2], [a3]])
        expect(chain.map(s => s.source)).toEqual(['user', 'project'])
      })

      it('cae al N2 del centro seleccionado cuando el colaborador no tiene niveles', () => {
        const chain = buildSolicitudChain({
          assignedProjectIds: [projA],
          selectedProjectId: projA,
          creatorId: u1.toString(),
          projectById: projectLevels,
        })
        expect(chain.map(s => s.approverIds)).toEqual([[a2]])
        expect(chain[0].source).toBe('project')
      })

      it('sigue exigiendo que el centro seleccionado exista aunque el colaborador tenga niveles propios', () => {
        expect(() =>
          buildSolicitudChain({
            assignedProjectIds: [projA],
            selectedProjectId: new Types.ObjectId().toString(),
            creatorId: u1.toString(),
            projectById: projectLevels,
            ownerApproverLevels: [{ level: 2, userIds: [o2] }],
          })
        ).toThrow(BadRequestException)
      })
    })
  })

  // Suplencia por vacaciones (VD-124). El motor no se entera de vacaciones ni
  // de fechas: solo recibe la lista de titulares que el actor cubre. Por eso
  // alcanza a TODAS las etapas — todas preguntan lo mismo.
  describe('suplencia por vacaciones', () => {
    const titular = a1
    const suplente = new Types.ObjectId()

    const paso = (approverIds: Types.ObjectId[], approved = false): ChainStep => ({
      level: 1,
      projectId,
      projectRole: 'principal',
      approverIds,
      approved,
    })

    describe('identidadesDelActor', () => {
      it('sin suplencia devuelve solo al actor', () => {
        expect(identidadesDelActor(suplente.toString())).toEqual([
          suplente.toString(),
        ])
        expect(identidadesDelActor(suplente.toString(), [])).toEqual([
          suplente.toString(),
        ])
      })

      it('la identidad propia va primero y no se pierde', () => {
        const ids = identidadesDelActor(suplente.toString(), [titular.toString()])
        expect(ids[0]).toBe(suplente.toString())
        expect(ids).toContain(titular.toString())
      })

      it('no repite si el actor también figura como titular cubierto', () => {
        const ids = identidadesDelActor(suplente.toString(), [
          suplente.toString(),
          titular.toString(),
        ])
        expect(ids).toHaveLength(2)
      })
    })

    describe('findActionableChainStep', () => {
      it('el suplente puede actuar sobre el paso del titular', () => {
        const chain = [paso([titular])]
        expect(
          findActionableChainStep({
            chain,
            actorId: suplente.toString(),
            actorRole: ROLES.COLABORADOR,
          })
        ).toBe(-1)
        expect(
          findActionableChainStep({
            chain,
            actorId: suplente.toString(),
            actorRole: ROLES.COLABORADOR,
            cubreA: [titular.toString()],
          })
        ).toBe(0)
      })

      // Es lo que hace que la suplencia sirva para lo ya enviado: la cadena
      // sellada sigue nombrando al titular y no se toca.
      it('no necesita que la cadena mencione al suplente', () => {
        // El primer paso va firmado a proposito: con la cadena consecutiva
        // (VD-133) el paso del titular solo es accionable cuando le toca.
        const chain = [paso([a2]), paso([titular])]
        chain[0].approved = true
        expect(
          findActionableChainStep({
            chain,
            actorId: suplente.toString(),
            actorRole: ROLES.COLABORADOR,
            cubreA: [titular.toString()],
          })
        ).toBe(1)
        expect(chain[1].approverIds.map(String)).toEqual([titular.toString()])
      })

      it('el titular sigue pudiendo firmar durante su propia vacación', () => {
        expect(
          findActionableChainStep({
            chain: [paso([titular])],
            actorId: titular.toString(),
            actorRole: ROLES.COLABORADOR,
          })
        ).toBe(0)
      })

      it('ignora los pasos ya aprobados', () => {
        expect(
          findActionableChainStep({
            chain: [paso([titular], true)],
            actorId: suplente.toString(),
            actorRole: ROLES.COLABORADOR,
            cubreA: [titular.toString()],
          })
        ).toBe(-1)
      })
    })

    describe('canActOnChain', () => {
      it('acepta al suplente en el nivel del titular', () => {
        const chain = [paso([titular])]
        expect(
          canActOnChain({
            chain,
            approvalLevel: 0,
            actorId: suplente.toString(),
            actorRole: ROLES.COLABORADOR,
          })
        ).toBe(false)
        expect(
          canActOnChain({
            chain,
            approvalLevel: 0,
            actorId: suplente.toString(),
            actorRole: ROLES.COLABORADOR,
            cubreA: [titular.toString()],
          })
        ).toBe(true)
      })
    })

    describe('titularCubiertoEnPaso', () => {
      it('registra en nombre de quién firmó el suplente', () => {
        const t = titularCubiertoEnPaso(paso([titular]), suplente.toString(), [
          titular.toString(),
        ])
        expect(t?.toString()).toBe(titular.toString())
      })

      // La suplencia es aditiva: si el actor ya era aprobador por derecho
      // propio, firmó como él mismo y no "en nombre de" nadie.
      it('no marca reemplazo cuando el actor es aprobador por derecho propio', () => {
        expect(
          titularCubiertoEnPaso(paso([suplente, titular]), suplente.toString(), [
            titular.toString(),
          ])
        ).toBeUndefined()
      })

      it('es indefinido sin suplencia', () => {
        expect(titularCubiertoEnPaso(paso([titular]), titular.toString())).toBeUndefined()
      })
    })
  })
})
