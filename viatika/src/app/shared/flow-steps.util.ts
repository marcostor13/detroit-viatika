/**
 * Trazabilidad del flujo de aprobación paso a paso (VD-31).
 *
 * Construye la línea de tiempo de una rendición/viático:
 *   Solicitud enviada → cadena de aprobadores (o coordinador) → Contabilidad → estado final.
 * Cubre viático, rendición directa y rendición normal. Compartido entre el
 * detalle de la rendición y el modal de detalle de /rendiciones.
 *
 * El estado de cada paso se deriva de los HITOS REALES (historial de
 * aprobaciones + fechas de aprobación), con cascada: si un paso posterior ya
 * ocurrió, todos los anteriores quedan completados. El "activo" (azul) es el
 * paso pendiente en este momento.
 */
export interface FlowStep {
  label: string;
  state: 'completed' | 'active' | 'upcoming' | 'rejected';
  date?: string;
  description?: string;
  notes?: string;
  /**
   * A qué fase del flujo pertenece el paso. Un viático tiene dos fases
   * independientes con cadenas/estados propios: primero la SOLICITUD (regla
   * 1.3, N2 del centro de costo, antes del pago) y luego, una vez pagado, la
   * RENDICIÓN de los comprobantes (regla 1.4, Coordinador → Contabilidad,
   * igual que una rendición normal). Sin diferenciarlas, la línea de tiempo
   * mezclaba ambas aprobaciones como si fueran una sola. `undefined` para
   * rendiciones/directas, que solo tienen una fase.
   */
  group?: 'solicitud' | 'rendicion';
}

const FINAL_LABELS: Record<string, string> = {
  approved: 'Aprobada',
  viatico_approved: 'Aprobada',
  partially_paid: 'Pago parcial',
  paid: 'Pagada',
  settled: 'Liquidada',
  reimbursed: 'Reembolsada',
  closed: 'Cerrada',
};

const TERMINAL_STATUSES = Object.keys(FINAL_LABELS);

/** Nombre del coordinador snapshot de la rendición (`assignedCoordinatorId`), si viene poblado. */
function coordinatorDisplayName(r: any): string | undefined {
  const c = r?.assignedCoordinatorId;
  return c && typeof c === 'object' && c.name ? c.name : undefined;
}

/**
 * Nombre(s) del/los aprobador(es) de un paso de cadena (`ChainStep`). El
 * nombre vive en `step.approverIds[].name` (populado) — un `ChainStep` no
 * tiene un campo `.name` propio, así que leerlo directo del step siempre
 * caía al genérico "Aprobador", incluso con el usuario ya poblado.
 */
function chainStepApproverNames(step: any): string {
  if (!step || !Array.isArray(step.approverIds) || step.approverIds.length === 0) return 'Aprobador';
  const names = step.approverIds
    .map((a: any) => (a && typeof a === 'object' && a.name ? a.name : null))
    .filter((n: string | null): n is string => !!n);
  return names.length > 0 ? names.join(' / ') : 'Aprobador';
}

/**
 * Nombres de quienes están pendientes de aprobar como Coordinador (N1/N2, regla
 * 1.4) entre los comprobantes de la RENDICIÓN — mismo dato que la columna
 * "Estado" por comprobante, agregado a nivel de reporte y sin duplicar.
 */
function pendingRendicionCoordNames(expenses: any[]): string | undefined {
  const names = new Set<string>();
  for (const e of expenses ?? []) {
    if (e?.status === 'rejected') continue;
    const chain = e?.approverChain;
    if (!Array.isArray(chain)) continue; // aún no se construyó
    // Aprobación en paralelo entre niveles: cualquier paso no aprobado de
    // este comprobante está pendiente, sin importar su posición.
    for (const step of chain) {
      if (step.approved) continue;
      for (const a of step.approverIds ?? []) {
        if (a && typeof a === 'object' && a.name) names.add(a.name);
      }
    }
  }
  return names.size > 0 ? Array.from(names).join(' / ') : undefined;
}

/**
 * Lo que la línea de tiempo necesita saber sobre suplencias por vacaciones
 * (VD-124). `vigentes` es de TODA la empresa a propósito: quien mira el
 * documento —el colaborador que rindió, Contabilidad— tiene que saber quién va
 * a firmar de verdad, no solo el suplente.
 */
export interface SuplenciaContexto {
  /** Titulares que el usuario ACTUAL cubre. */
  cubroA?: { _id: string; name: string }[];
  /** Suplencias vigentes de la empresa: titular -> quien lo reemplaza. */
  vigentes?: { titularId: string; suplenteName: string }[];
}

interface RendicionLevelApprovals {
  /** Nivel de la cadena (N1, N2, …). */
  level: number;
  /** Quiénes ya aprobaron en ese nivel. */
  approvedNames: string[];
  /** Quiénes faltan: los aprobadores de los pasos de ese nivel aún sin resolver. */
  pendingNames: string[];
  /** Fecha de la última aprobación del nivel. */
  lastApprovedAt?: string;
  /**
   * El usuario actual cubre a alguno de los que faltan, por suplencia de
   * vacaciones (VD-124). La cadena nombra al titular; esto es lo que le dice al
   * suplente que la acción es suya.
   */
  cubiertoPorMi?: boolean;
  /** Nombre del titular que cubre, para decirlo explícitamente. */
  titularCubierto?: string;
  /** Titular de vacaciones en este nivel y quién lo reemplaza — visible para todos. */
  titularDeVacaciones?: string;
  reemplazadoPor?: string;
}

/** Nombre de quien resolvió un paso, si el populate lo trajo. */
function stepApprovedByName(step: any): string | undefined {
  const by = step?.approvedBy;
  return by && typeof by === 'object' && by.name ? (by.name as string) : undefined;
}

/**
 * Paso de la línea de tiempo para un nivel de la cadena (VD-112). Nombra a
 * quien falta mientras está pendiente y a quien aprobó una vez resuelto; si el
 * nivel está a medias, la descripción dice quién ya firmó.
 */
function levelApprovalStep(
  nivel: RendicionLevelApprovals,
  forcedDone: boolean,
  fmt: (d?: string | Date) => string | undefined,
  fallbackDate?: string | Date,
): FlowStep {
  const { level, approvedNames, pendingNames, lastApprovedAt } = nivel;
  const done = forcedDone || pendingNames.length === 0;
  const quienes = done
    ? (approvedNames.length > 0 ? approvedNames : pendingNames)
    : pendingNames;
  const nombres = quienes.join(' / ') || 'aprobadores';
  // Suplencia por vacaciones (VD-124): si el aprobador de este nivel está de
  // vacaciones, el nombre que manda es el de quien lo reemplaza. La cadena
  // sigue nombrando al titular, pero un documento que dice "falta aprobación de
  // Fulano" cuando Fulano no está deja a todos esperando a nadie.
  const pendienteConSuplente =
    !done && nivel.reemplazadoPor
      ? `${nivel.reemplazadoPor} (en reemplazo de ${nivel.titularDeVacaciones})`
      : nombres;
  return {
    label: done
      ? `N${level} · Aprobado por ${nombres}`
      : `N${level} · Falta aprobación de ${pendienteConSuplente}`,
    state: done ? 'completed' : 'active',
    date: done ? fmt(lastApprovedAt ?? fallbackDate) : undefined,
    description: done
      ? undefined
      // Suplencia por vacaciones (VD-124): el label sigue nombrando al titular
      // — es quien figura en la cadena y lo que Contabilidad tiene que poder
      // auditar — pero al suplente hay que decirle que la acción le toca a él,
      // o lee "falta aprobación de Fulano" y no entiende por qué ve el botón.
      : nivel.cubiertoPorMi
        ? `Te toca a ti: reemplazas a ${nivel.titularCubierto ?? 'este aprobador'} mientras está de vacaciones`
        : nivel.reemplazadoPor
          ? `${nivel.titularDeVacaciones} está de vacaciones: los avisos y la aprobación van a su reemplazo.`
          : approvedNames.length > 0
            ? `Ya aprobó: ${approvedNames.join(' / ')}`
            : `Pendiente de aprobación (nivel ${level})`,
    group: 'rendicion',
  };
}

/**
 * Agrega las cadenas de aprobación por comprobante (regla 1.4) POR NIVEL, para
 * separar N1 de N2 en la línea de tiempo de la RENDICIÓN en lugar de nombrar a
 * todos juntos (VD-112), distinguiendo además quién ya aprobó y quién falta.
 *
 * - Ya aprobó: quien resolvió el paso (`approvedBy`); si el populate no lo
 *   trajo, se nombran los aprobadores del paso resuelto.
 * - Falta: los aprobadores de los pasos de ese nivel todavía sin resolver.
 *   Manda sobre "ya aprobó": quien aprobó un comprobante pero le queda otro
 *   pendiente cuenta como pendiente.
 *
 * Aprobación en paralelo entre niveles (igual que `pendingRendicionCoordNames`):
 * un paso no aprobado se considera pendiente sin importar su posición. Devuelve
 * [] si los comprobantes no traen la cadena poblada (p. ej. vistas con populate
 * ligero), para caer al paso agregado.
 */
function aggregateRendicionApprovalsByLevel(
  expenses: any[],
  suplencia: SuplenciaContexto = {}
): RendicionLevelApprovals[] {
  const cubroA = suplencia.cubroA ?? [];
  const vigentes = suplencia.vigentes ?? [];
  const byLevel = new Map<
    number,
    {
      approved: Set<string>;
      pending: Set<string>;
      lastApprovedAt?: string;
      titularCubierto?: string;
      titularDeVacaciones?: string;
      reemplazadoPor?: string;
    }
  >();
  for (const e of expenses ?? []) {
    if (e?.status === 'rejected') continue;
    const chain = e?.approverChain;
    if (!Array.isArray(chain)) continue; // aún no se construyó
    for (const step of chain) {
      const level = Number(step?.level ?? 99);
      const cur = byLevel.get(level) ?? { approved: new Set<string>(), pending: new Set<string>() };
      const candidatos: string[] = (step?.approverIds ?? [])
        .map((a: any) => (a && typeof a === 'object' && a.name ? (a.name as string) : null))
        .filter((n: string | null): n is string => !!n);

      if (step?.approved) {
        const quien = stepApprovedByName(step);
        for (const n of quien ? [quien] : candidatos) cur.approved.add(n);
        if (step.approvedAt && (!cur.lastApprovedAt || new Date(step.approvedAt) > new Date(cur.lastApprovedAt))) {
          cur.lastApprovedAt = step.approvedAt;
        }
      } else {
        for (const n of candidatos) cur.pending.add(n);
        // ¿Alguno de los que faltan es un titular que estoy cubriendo? (VD-124)
        const idsDelPaso = (step?.approverIds ?? []).map((a: any) =>
          String(a && typeof a === 'object' ? a._id : a)
        );
        const titular = cubroA.find((t) => idsDelPaso.includes(t._id));
        if (titular) cur.titularCubierto = titular.name;
        // Para TODOS: si alguno de los que faltan esta de vacaciones, el que va
        // a firmar es su reemplazo.
        const deVacaciones = vigentes.find((v) => idsDelPaso.includes(v.titularId));
        if (deVacaciones) {
          cur.titularDeVacaciones =
            candidatos.find((n: string) => n === (deVacaciones as any).titularName) ??
            (deVacaciones as any).titularName ??
            'el aprobador';
          cur.reemplazadoPor = deVacaciones.suplenteName;
        }
      }
      byLevel.set(level, cur);
    }
  }

  return [...byLevel.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([level, { approved, pending, lastApprovedAt, titularCubierto, titularDeVacaciones, reemplazadoPor }]) => ({
      level,
      // Quien tiene un paso pendiente figura como pendiente, aunque haya
      // aprobado otro comprobante del mismo nivel.
      approvedNames: [...approved].filter(n => !pending.has(n)).sort((a, b) => a.localeCompare(b)),
      pendingNames: [...pending].sort((a, b) => a.localeCompare(b)),
      lastApprovedAt,
      cubiertoPorMi: !!titularCubierto,
      titularCubierto,
      titularDeVacaciones,
      reemplazadoPor,
    }));
}

/**
 * Un viático que ya recibió pago (parcial o total) dejó atrás la fase de
 * SOLICITUD y entró en la fase de RENDICIÓN al subir sus comprobantes — dos
 * flujos de aprobación independientes sobre el mismo documento. A partir de
 * acá `status`/`rejectedByRole`/`rejectionReason` pertenecen a la RENDICIÓN,
 * no a la solicitud (que usa sus propios `viatico*`).
 */
function viaticoEnteredRendicion(r: any): boolean {
  if (r?.type !== 'viatico') return false;
  // La solicitud de caja chica viaja como viático para reutilizar la cadena, el
  // gate de Contabilidad y el pago, pero NUNCA se rinde sobre este documento: el
  // dinero pasa al fondo del responsable y los comprobantes van en una rendición
  // de caja chica aparte. Sin esto, apenas Tesorería depositaba, el documento se
  // leía como "viático en fase de rendición" — línea de tiempo de dos fases y el
  // ojo de /rendiciones navegando a una rendición vacía que nadie va a llenar.
  if (r?.isSolicitudCajaChica) return false;
  return (
    Number(r.viaticoPaidAmount ?? 0) > 0 ||
    ['open', 'submitted', 'pending_accounting', 'reimbursed', 'closed', 'settled', 'returned'].includes(r.status) ||
    (r.status === 'rejected' && !!r.rejectedByRole)
  );
}

/**
 * ¿El reporte sigue siendo una SOLICITUD, sin gastos que rendir todavía?
 *
 * - Viático: hasta que Tesorería paga el anticipo (mismo corte que usa la línea
 *   de tiempo para pasar a la vista de dos fases).
 * - Rendición normal del colaborador: mientras está `solicited`.
 * - Directa: nunca — nace en fase de rendición (`open`).
 *
 * Se usa para decidir si el ojo de /rendiciones abre el detalle en un modal o
 * navega a la rendición completa: antes de que el colaborador empiece a rendir,
 * esa vista está vacía (S/ 0.00, sin comprobantes) y no aporta nada a nadie.
 */
export function isSolicitudPhase(r: any): boolean {
  if (!r) return false;
  if (r.type === 'viatico') return !viaticoEnteredRendicion(r);
  if (r.isDirecta) return false;
  return r.status === 'solicited';
}

export function buildReportFlowSteps(
  r: any,
  /**
   * Contexto de suplencias por vacaciones (VD-124). Se pasa desde el componente
   * porque la línea de tiempo es una función pura y no puede consultar el
   * estado de suplencia por su cuenta.
   */
  suplencia: SuplenciaContexto = {}
): FlowStep[] {
  if (!r) return [];

  const fmt = (d?: string | Date) =>
    d ? new Date(d as any).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;

  const isViatico = r.type === 'viatico';
  const isDirecta = !!r.isDirecta;
  const isCajaChica = !!r.isCajaChica;
  const status: string = r.status;

  if (viaticoEnteredRendicion(r)) {
    return buildViaticoTwoPhaseSteps(r, fmt, suplencia);
  }

  const chain: any[] = (isViatico ? r.viaticoApproverChain : isDirecta ? r.directaApproverChain : []) ?? [];
  const approvalLevel: number = (isViatico ? r.viaticoApprovalLevel : r.directaApprovalLevel) ?? 0;
  const requiredLevels: number = (isViatico ? r.viaticoRequiredLevels : r.directaRequiredLevels) ?? chain.length;

  const rejected = status === 'rejected';
  const rejectionReason: string | undefined = r.rejectionReason || r.viaticoRejectionReason;
  const terminal = TERMINAL_STATUSES.includes(status) || !!r.returnVoucher;

  // Reembolso a favor del colaborador: Tesorería le devuelve lo que gastó de su
  // bolsillo. Aplica a rendiciones con saldo a reembolsar y a toda directa del
  // colaborador (sin depósito de Contabilidad), que siempre termina en reembolso.
  const reembolsoDone =
    !!r.reimbursementPaymentInfo || !!r.reimbursedAt || status === 'reimbursed';
  const collaboratorDirecta =
    isDirecta && !(Number(r.directaDeposit?.amount ?? 0) > 0);
  // Caja chica: cuando Contabilidad aprueba, el siguiente hito es el depósito
  // con que Tesorería REPONE el presupuesto del responsable, y después el
  // cierre. Aritméticamente es el mismo reembolso de una directa sin depósito
  // (así lo trata el backend en `findPendingReimbursements`), pero su
  // `settlement` no se persiste hasta que Tesorería paga: sin este caso la
  // línea de tiempo se detenía en "Aprobada" y no mostraba que aún faltaba
  // Tesorería. Si la rendición terminó en devolución, manda ese otro camino.
  const enDevolucion =
    r.settlement?.type === 'devolucion' ||
    !!r.returnVoucher ||
    status === 'returned';
  // Sin `terminal`: en caja chica el desenlace se conoce desde que se abre la
  // rendición. Lo rendido sale del fondo del responsable, no hay depósito
  // previo contra el cual compensarlo, así que el saldo siempre queda a su
  // favor y lo repone Tesorería. Anunciarlo recién al aprobarse dejaba la línea
  // de tiempo terminando en "Finalizada", sin decir que después venían el
  // reembolso y el cierre.
  const cajaChicaReposicion = isCajaChica && !enDevolucion;
  // Misma razón que la caja chica, y sin `terminal` por lo mismo: en una
  // directa del colaborador todo lo rendido salió de su bolsillo, no hay
  // depósito previo contra el cual compensarlo, así que el saldo siempre queda
  // a su favor y lo paga Tesorería. Exigir que la rendición ya estuviera
  // terminal escondía ese paso justo cuando sirve —mientras está en trámite— y
  // la línea de tiempo terminaba en "Finalizada" como si después no faltara
  // nada. Una directa CON depósito sí queda fuera: ahí el desenlace puede ser
  // reembolso, devolución o quedar equilibrada, y no se sabe hasta liquidar.
  const directaSinDeposito = collaboratorDirecta && !enDevolucion;
  const expectsReembolso =
    reembolsoDone ||
    r.settlement?.type === 'reembolso' ||
    directaSinDeposito ||
    cajaChicaReposicion;

  // Devolución: el colaborador debe devolver el saldo a favor de la empresa
  // (settlement 'devolucion'). Se completa al cargarse/validarse el comprobante
  // de devolución. Mutuamente excluyente con el reembolso.
  const devolucionDone =
    !!r.returnVoucher || r.returnRecord?.status === 'validated' || status === 'returned' || status === 'closed';
  const expectsDevolucion =
    !expectsReembolso && (r.settlement?.type === 'devolucion' || !!r.returnVoucher || status === 'returned');

  // Cierre formal por Contabilidad: último paso del flujo (status 'closed').
  const closed = status === 'closed';
  const closedDate: string | Date | undefined =
    r.closureRecord?.closedAt ?? r.closedAt ?? undefined;

  const chainCount = chain.length > 0 ? Math.max(requiredLevels, chain.length) : 1;
  const contaIdx = chainCount + 1;
  const finalIdx = chainCount + 2;
  const reembolsoIdx = chainCount + 3;
  const closeIdx = chainCount + 4;

  const approverName = (i: number): string => chainStepApproverNames(chain[i]);
  // Aprobación en paralelo entre niveles: cada paso tiene su propio flag
  // `approved` — no se puede inferir "completado" comparando la posición
  // contra `approvalLevel` (un contador que ya no refleja el orden).
  const chainLevelApproved = (level: number): boolean => !!(chain[level - 1] as any)?.approved;

  // Contabilidad aprobó si dejó su hito propio o si el estado ya avanzó más
  // allá de su gate. Cada fase tiene su campo: la SOLICITUD del viático usa
  // `viaticoSolicitudContabilidad*` y la rendición/directa `contabilidad*`
  // (ver §fix de colisión en la entidad).
  //
  // NO se infiere del historial buscando una entrada con `level > chainCount`:
  // el historial guarda el `level` del PASO DE CADENA (N1 = 1, N2 = 2), no su
  // posición, así que un centro de costo con un solo aprobador que es el N2
  // deja una entrada de nivel 2 contra un `chainCount` de 1 y se leía como si
  // Contabilidad ya hubiera aprobado — el viático mostraba "Aprobado por
  // Contabilidad" estando en `pending_contabilidad`, esperándola.
  const contaActive = status === 'pending_accounting' || status === 'pending_contabilidad';
  const contaApprovedAtSource = isViatico
    ? r.viaticoSolicitudContabilidadApprovedAt
    : r.contabilidadApprovedAt;
  const contaApprovedBySource = isViatico
    ? r.viaticoSolicitudContabilidadApprovedBy
    : r.contabilidadApprovedBy;
  const contaDone = !!contaApprovedAtSource || !!contaApprovedBySource || terminal;

  // progress = índice del último paso COMPLETADO (con cascada).
  let progress = 0; // Solicitud enviada
  if (chain.length > 0) {
    for (let level = 1; level <= chainCount; level++) {
      if (chainLevelApproved(level)) progress = Math.max(progress, level);
    }
  } else if (!!r.coordinatorApprovedBy || contaDone || contaActive) {
    progress = Math.max(progress, 1);
  }
  if (contaDone) progress = Math.max(progress, contaIdx);
  if (terminal) progress = finalIdx;
  if (expectsReembolso && reembolsoDone) progress = reembolsoIdx;
  if (expectsDevolucion && devolucionDone) progress = reembolsoIdx;
  if (closed) progress = closeIdx;

  // Índice donde se rechazó (si aplica). Aprobación en paralelo: no hay "el
  // paso actual" único — se aproxima al primer paso aún pendiente al momento
  // del rechazo (varios podían estar pendientes a la vez).
  let rejIdx = -1;
  if (rejected) {
    if (r.rejectedByRole === 'contabilidad' || r.viaticoRejectedByRole === 'contabilidad') {
      rejIdx = contaIdx;
    } else if (chain.length > 0) {
      const firstPendingPos = chain.findIndex((s: any) => !s.approved) + 1;
      rejIdx = firstPendingPos > 0 ? firstPendingPos : chainCount;
    } else {
      rejIdx = 1;
    }
  }

  // activeIndex = paso pendiente en este momento (azul).
  const chainActive = status === 'pending_l1' || status === 'submitted';
  let activeIndex = -1;
  if (rejected) {
    activeIndex = -1;
  } else if (chainActive && chain.length > 0) {
    activeIndex = 1 + Math.min(approvalLevel, chainCount - 1);
  } else if (chainActive) {
    activeIndex = 1; // coordinador (rendición normal)
  } else if (contaActive) {
    activeIndex = contaIdx;
  } else if (!terminal && progress >= contaIdx) {
    activeIndex = finalIdx; // aprobaciones listas, rendición en curso
  }
  // Tras la aprobación, el paso pendiente es el reembolso (si aplica) y luego el
  // cierre por Contabilidad, hasta que la rendición quede efectivamente cerrada.
  //
  // El gate de Contabilidad (`contaDone`) es lo que separa "pendiente" de "aún
  // por venir": la caja chica declara su reembolso desde que nace, y sin este
  // corte el paso de Tesorería se pintaba activo mientras la rendición todavía
  // esperaba a sus aprobadores.
  if (!rejected && !closed && contaDone) {
    if (expectsReembolso && !reembolsoDone) {
      activeIndex = reembolsoIdx;
    } else if (expectsReembolso && reembolsoDone) {
      activeIndex = closeIdx;
    } else if (expectsDevolucion && !devolucionDone) {
      activeIndex = reembolsoIdx;
    } else if (expectsDevolucion && devolucionDone) {
      activeIndex = closeIdx;
    }
  }

  const stateFor = (idx: number): FlowStep['state'] => {
    if (rejected) {
      if (idx < rejIdx) return 'completed';
      if (idx === rejIdx) return 'rejected';
      return 'upcoming';
    }
    if (idx <= progress) return 'completed';
    if (idx === activeIndex) return 'active';
    return 'upcoming';
  };

  /**
   * Estado de una posición de la cadena de aprobadores (1..chainCount).
   * Mientras la cadena sigue activa (aún se puede aprobar), cada paso usa su
   * PROPIO `approved` — aprobación en paralelo entre niveles, así que más de
   * un paso puede estar "activo" (pendiente) a la vez, no solo uno. Fuera de
   * esa ventana (rechazada, o la cadena ya se completó) se usa el cascade
   * genérico de `stateFor`, que sigue siendo válido.
   */
  const stepStateFor = (idx: number): FlowStep['state'] => {
    if (chain.length > 0 && idx >= 1 && idx <= chainCount && chainActive && !rejected) {
      return (chain[idx - 1] as any)?.approved ? 'completed' : 'active';
    }
    return stateFor(idx);
  };

  const steps: FlowStep[] = [];

  // 0 — Solicitud enviada
  steps.push({
    label: 'Solicitud enviada',
    state: rejected && rejIdx === 0 ? 'rejected' : 'completed',
    date: fmt(r.createdAt),
  });

  // 1..chainCount — Cadena de aprobadores (viático/directa) o coordinador (rendición normal).
  // Aprobación en paralelo entre niveles: la fecha/estado de cada paso viene
  // de su propio `approved`/`approvedAt`, no de un historial posicional.
  if (chain.length > 0) {
    for (let level = 1; level <= chainCount; level++) {
      const step = chain[level - 1] as any;
      const state = stepStateFor(level);
      const name = approverName(level - 1);
      // VD-112: el nivel va en la etiqueta para distinguir N1 de N2.
      const nivel = `N${Number(step?.level ?? level)}`;
      const label =
        state === 'completed' ? `${nivel} · Aprobado por ${name}` :
        state === 'rejected' ? `${nivel} · Rechazado por ${name}` :
        `${nivel} · Aprobación de ${name}`;
      steps.push({
        label,
        state,
        date: fmt(step?.approvedAt),
        description: state === 'active' ? `Pendiente de aprobación (nivel ${level} de ${chainCount})` : undefined,
        notes: state === 'rejected' ? rejectionReason : undefined,
      });
    }
  } else {
    const state = stateFor(1);
    const coordApprovedByName = r.coordinatorApprovedBy && typeof r.coordinatorApprovedBy === 'object'
      ? r.coordinatorApprovedBy.name : undefined;
    // VD-112: un paso por nivel de la cadena por comprobante, para distinguir
    // quién aprueba en N1 y quién en N2. Antes salían todos en una sola línea.
    const nivelesAprobacion = aggregateRendicionApprovalsByLevel(r.expenseIds, suplencia);
    if (state !== 'rejected' && nivelesAprobacion.length > 0) {
      for (const nivel of nivelesAprobacion) {
        steps.push(levelApprovalStep(nivel, state === 'completed', fmt, r.coordinatorApprovedAt));
      }
    } else {
      // Sin cadena poblada (populate ligero) o rechazada: paso único agregado.
      const coordName =
        state === 'completed' ? (coordApprovedByName ?? coordinatorDisplayName(r)) :
        state === 'active' || state === 'upcoming' ? (pendingRendicionCoordNames(r.expenseIds) ?? coordinatorDisplayName(r)) :
        coordinatorDisplayName(r);
      steps.push({
        label:
          state === 'completed' ? `Aprobado por ${coordName ?? 'el aprobador'}` :
          state === 'rejected' ? `Rechazado por ${coordName ?? 'el aprobador'}` :
          `Aprobación de ${coordName ?? 'aprobadores'}`,
        state,
        date: fmt(r.coordinatorApprovedAt),
        description: state === 'active' ? 'Pendiente de aprobación de los aprobadores' : undefined,
        notes: state === 'rejected' ? rejectionReason : undefined,
      });
    }
  }

  // contaIdx — Aprobación de Contabilidad, con el hito de la fase que
  // corresponde (`contaApprovedAt/BySource`, resueltos más arriba).
  const contaState = stateFor(contaIdx);
  const contaApprovedByName = contaApprovedBySource && typeof contaApprovedBySource === 'object'
    ? contaApprovedBySource.name : undefined;
  steps.push({
    label: contaState === 'completed' ? `Aprobado por ${contaApprovedByName ?? 'Contabilidad'}` : 'Aprobación de Contabilidad',
    state: contaState,
    date: fmt(contaApprovedAtSource),
    description: contaState === 'active' ? 'Pendiente de aprobación final de Contabilidad' : undefined,
    notes: contaState === 'rejected' ? rejectionReason : undefined,
  });

  // Viático cuya SOLICITUD ya fue aprobada (regla 1.3, status `viatico_approved`):
  // el siguiente hito NO es un estado terminal, sino el PAGO del anticipo por
  // Tesorería (el viático aparece en Tesorería → "Pagar" hasta que se deposita).
  // `viatico_approved` está en TERMINAL_STATUSES para que los pasos de aprobación
  // queden en verde, pero sin este paso propio la línea de tiempo mostraba
  // "Aprobada" y ocultaba que el viático sigue pendiente de que Tesorería pague.
  // Tras el pago pasa a `open`/`partially_paid` y entra en la vista de dos fases.
  const isViaticoAwaitingPayment =
    isViatico && status === 'viatico_approved' && Number(r.viaticoPaidAmount ?? 0) <= 0;

  // finalIdx — Estado final genérico (solo si no fue rechazada, no hay reembolso y
  // no está cerrada). Cuando corresponde reembolso o cierre, esos pasos propios
  // reflejan el desenlace y se omite este "Aprobada/Finalizada" redundante.
  if (!rejected && isViaticoAwaitingPayment) {
    steps.push({
      label: 'Pago de Tesorería',
      state: 'active',
      description: 'Pendiente de depósito por Tesorería',
    });
  } else if (!rejected && !expectsReembolso && !expectsDevolucion && !closed) {
    const finalState = stateFor(finalIdx);
    const label =
      finalState === 'completed' ? (FINAL_LABELS[status] ?? 'Finalizada') :
      finalState === 'active' ? 'Rendición en curso' :
      'Finalizada';
    steps.push({
      label,
      state: finalState,
      date: finalState === 'completed' ? fmt(r.reimbursedAt || r.contabilidadApprovedAt) : undefined,
      description: finalState === 'active' ? 'Registrando gastos, pendiente de cierre' : undefined,
    });
  }

  // reembolsoIdx — Reembolso de Tesorería (solo cuando corresponde reembolso al colaborador)
  if (!rejected && expectsReembolso) {
    const reembolsoState = stateFor(reembolsoIdx);
    steps.push({
      label: reembolsoState === 'completed' ? 'Reembolsado por Tesorería' : 'Reembolso de Tesorería',
      state: reembolsoState,
      date: reembolsoState === 'completed' ? fmt(r.reimbursedAt) : undefined,
      // En caja chica ese depósito no cubre un gasto del bolsillo del
      // responsable: repone su presupuesto, que vuelve al tope.
      description: reembolsoState === 'active'
        ? (isCajaChica
          ? 'Pendiente del depósito de Tesorería, que repone el presupuesto'
          : 'Pendiente de pago de Tesorería')
        : undefined,
    });
  }

  // reembolsoIdx (mismo slot) — Devolución del colaborador (saldo a favor de la empresa)
  if (!rejected && expectsDevolucion) {
    const devolucionState = stateFor(reembolsoIdx);
    steps.push({
      label: devolucionState === 'completed' ? 'Devolución recibida' : 'Devolución del colaborador',
      state: devolucionState,
      date: devolucionState === 'completed'
        ? fmt(r.returnVoucher?.uploadedAt ?? r.returnRecord?.validatedAt ?? r.returnedAt)
        : undefined,
      description: devolucionState === 'active' ? 'Esperando comprobante de devolución del colaborador' : undefined,
    });
  }

  // closeIdx — Cierre por Tesorería (paso final del flujo). Se muestra cuando la
  // rendición ya está cerrada o cuando el flujo avanza hacia el cierre (reembolso/devolución).
  if (!rejected && (closed || expectsReembolso || expectsDevolucion)) {
    const closeState = stateFor(closeIdx);
    steps.push({
      label: closeState === 'completed' ? 'Cerrado por Tesorería' : 'Cierre de Tesorería',
      state: closeState,
      date: closeState === 'completed' ? fmt(closedDate) : undefined,
      description: closeState === 'active' ? 'Pendiente de cierre por Tesorería' : undefined,
    });
  }

  return steps;
}

/**
 * Línea de tiempo de un viático que ya entró en fase de RENDICIÓN (recibió
 * pago y el colaborador subió/envió sus comprobantes). Muestra ambas fases
 * como bloques independientes (`group: 'solicitud' | 'rendicion'`):
 *
 * 1. SOLICITUD (regla 1.3) — ya resuelta (se pagó para llegar hasta acá), se
 *    muestra siempre completada, usando los campos `viatico*`.
 * 2. RENDICIÓN (regla 1.4) — Coordinador → Contabilidad, igual que una
 *    rendición normal (mismo mecanismo que usa `confirmApproveReport()` en el
 *    componente), derivada de `status`/`rejectedByRole`/`rejectionReason`.
 *
 * `contabilidadApprovedAt`/`contabilidadApprovedBy` pertenecen exclusivamente
 * a la aprobación de la RENDICIÓN (regla 1.4); la de la SOLICITUD (regla 1.3)
 * usa sus propios `viaticoSolicitudContabilidadApprovedAt/By` — antes ambos
 * gates compartían el mismo campo y el de la rendición pisaba el de la
 * solicitud (backend arreglado; ver `approveViaticoContabilidad`).
 */
function buildViaticoTwoPhaseSteps(
  r: any,
  fmt: (d?: string | Date) => string | undefined,
  suplencia: SuplenciaContexto = {}
): FlowStep[] {
  const steps: FlowStep[] = [];

  // ── Fase 1: SOLICITUD — congelada, siempre completada.
  const chain: any[] = r.viaticoApproverChain ?? [];
  steps.push({ label: 'Solicitud enviada', state: 'completed', date: fmt(r.createdAt), group: 'solicitud' });
  chain.forEach((c: any, i: number) => {
    const name = chainStepApproverNames(c);
    // VD-112: el nivel al que corresponde cada aprobador, igual que en la fase
    // de rendición. `level` viene del paso; si faltara se usa la posición.
    const level = Number(c?.level ?? i + 1);
    steps.push({
      label: `N${level} · Aprobado por ${name}`,
      state: 'completed',
      date: fmt(c.approvedAt),
      group: 'solicitud',
    });
  });
  const solicitudContaName = r.viaticoSolicitudContabilidadApprovedBy && typeof r.viaticoSolicitudContabilidadApprovedBy === 'object'
    ? r.viaticoSolicitudContabilidadApprovedBy.name : undefined;
  steps.push({
    label: `Solicitud aprobada por ${solicitudContaName ?? 'Contabilidad'}`,
    state: 'completed',
    date: fmt(r.viaticoSolicitudContabilidadApprovedAt),
    group: 'solicitud',
  });
  // Pago del anticipo por Tesorería (cierra la fase de SOLICITUD). Se muestra la
  // fecha del último pago registrado, igual que los demás pasos. Si el viático se
  // abrió cubierto 100% con saldo (sin pago de Tesorería), se mantiene la etiqueta
  // simple, sin atribuir un depósito que no ocurrió.
  const viaticoPayments: any[] = Array.isArray(r.viaticoPayments) ? r.viaticoPayments : [];
  const lastPayment = viaticoPayments[viaticoPayments.length - 1];
  const paidByTesoreria = viaticoPayments.length > 0 || !!r.viaticoPaymentInfo;
  const paidDate = lastPayment?.transferDate ?? lastPayment?.createdAt ?? r.viaticoPaymentInfo?.transferDate;
  steps.push({
    label: paidByTesoreria ? 'Pagado por Tesorería' : 'Anticipo disponible',
    state: 'completed',
    date: paidByTesoreria ? fmt(paidDate) : undefined,
    group: 'solicitud',
  });

  // ── Fase 2: RENDICIÓN — Coordinador → Contabilidad (regla 1.4).
  const status: string = r.status;
  const rejected = status === 'rejected';
  const rejectedByRole: string | undefined = r.rejectedByRole;
  const rejectionReason: string | undefined = r.rejectionReason;
  const terminal = ['approved', 'reimbursed', 'closed', 'settled', 'returned'].includes(status) || !!r.returnVoucher;
  const closed = status === 'closed';
  const reembolsoDone = !!r.reimbursementPaymentInfo || !!r.reimbursedAt || status === 'reimbursed';
  const expectsReembolso = reembolsoDone || r.settlement?.type === 'reembolso';
  // Devolución: el colaborador debe devolver el saldo a favor de la empresa
  // (settlement 'devolucion'). Se completa al cargarse/validarse el comprobante
  // de devolución. Mutuamente excluyente con el reembolso.
  const devolucionDone =
    !!r.returnVoucher || r.returnRecord?.status === 'validated' || status === 'returned' || status === 'closed';
  const expectsDevolucion =
    !expectsReembolso && (r.settlement?.type === 'devolucion' || !!r.returnVoucher || status === 'returned');

  const COORD_IDX = 1;
  const CONTA_IDX = 2;
  const FINAL_IDX = 3;
  const SETTLE_IDX = 4; // reembolso (Tesorería) o devolución (colaborador)
  const CLOSE_IDX = 5;

  let progress = -1;
  if (status !== 'open') progress = 0;
  if (status === 'pending_accounting' || terminal) progress = COORD_IDX;
  if (terminal) progress = CONTA_IDX;
  if (expectsReembolso && reembolsoDone) progress = SETTLE_IDX;
  if (expectsDevolucion && devolucionDone) progress = SETTLE_IDX;
  if (closed) progress = CLOSE_IDX;

  let rejIdx = -1;
  if (rejected) {
    rejIdx = rejectedByRole === 'contabilidad' ? CONTA_IDX : rejectedByRole === 'coordinador' ? COORD_IDX : 0;
  }

  let activeIndex = -1;
  if (!rejected) {
    if (status === 'open') activeIndex = 0;
    else if (status === 'submitted') activeIndex = COORD_IDX;
    else if (status === 'pending_accounting') activeIndex = CONTA_IDX;
    else if (!terminal && progress >= CONTA_IDX) activeIndex = FINAL_IDX;
    if (!closed) {
      if (expectsReembolso && !reembolsoDone) activeIndex = SETTLE_IDX;
      else if (expectsReembolso && reembolsoDone) activeIndex = CLOSE_IDX;
      else if (expectsDevolucion && !devolucionDone) activeIndex = SETTLE_IDX;
      else if (expectsDevolucion && devolucionDone) activeIndex = CLOSE_IDX;
    }
  }

  const stateFor = (idx: number): FlowStep['state'] => {
    if (rejected) {
      if (idx < rejIdx) return 'completed';
      if (idx === rejIdx) return 'rejected';
      return 'upcoming';
    }
    if (idx <= progress) return 'completed';
    if (idx === activeIndex) return 'active';
    return 'upcoming';
  };

  const enviadaState = stateFor(0);
  steps.push({
    label:
      enviadaState === 'completed' ? 'Rendición enviada' :
      enviadaState === 'rejected' ? 'Rendición rechazada' :
      'Registrando comprobantes',
    state: enviadaState,
    description: enviadaState === 'active'
      ? 'Aún no se envió — los comprobantes no tienen aprobador asignado hasta enviarla.'
      : undefined,
    group: 'rendicion',
  });

  // Mientras la rendición no se envía (`status === 'open'`), el motor de cadenas
  // (regla 1.4) todavía no corrió sobre ningún comprobante: no hay un aprobador
  // determinado que nombrar todavía. Mostrar "Aprobación de Coordinador" genérico
  // acá se leería como un paso trabado con un nombre roto — mejor un solo aviso
  // claro de qué falta, sin fingir pasos con estado propio que aún no existen.
  if (status === 'open') {
    steps.push({
      label: 'Aprobación de aprobadores y Contabilidad',
      state: 'upcoming',
      description: 'Se determina al subir cada comprobante (aprobadores N1/N2 → Contabilidad).',
      group: 'rendicion',
    });
    return steps;
  }

  // Nombres reales (no roles genéricos), según el flujo: mientras está pendiente, los
  // aprobadores N1/N2 esperados por comprobante (regla 1.4); una vez resuelto, quien
  // efectivamente hizo el clic de aprobación de la rendición (`coordinatorApprovedBy`).
  const coordState = stateFor(COORD_IDX);
  const nivelesAprobacion = aggregateRendicionApprovalsByLevel(r.expenseIds, suplencia);

  if (!rejected && nivelesAprobacion.length > 0) {
    // Un paso por NIVEL de la cadena por comprobante (VD-112): antes salían
    // todos los aprobadores juntos en una sola línea y no se distinguía quién
    // era N1 y quién N2, ni quién ya había firmado. Un nivel se marca aprobado
    // cuando no le queda ningún paso pendiente, aunque el reporte siga en
    // `submitted` hasta la confirmación de la rendición (o ya haya avanzado a
    // Contabilidad).
    for (const nivel of nivelesAprobacion) {
      steps.push(levelApprovalStep(nivel, coordState === 'completed', fmt, r.coordinatorApprovedAt));
    }
  } else {
    // Fallback: comprobantes sin cadena poblada (populate ligero) o rechazada —
    // se mantiene el paso agregado con nombres reales cuando los hay.
    const coordApprovedByName = r.coordinatorApprovedBy && typeof r.coordinatorApprovedBy === 'object'
      ? r.coordinatorApprovedBy.name : undefined;
    const coordPendingNames = pendingRendicionCoordNames(r.expenseIds);
    const rendicionCoordName =
      coordState === 'completed' ? (coordApprovedByName ?? coordinatorDisplayName(r)) :
      coordState === 'active' || coordState === 'upcoming' ? (coordPendingNames ?? coordinatorDisplayName(r)) :
      coordinatorDisplayName(r);
    steps.push({
      label:
        coordState === 'completed' ? `Aprobada por ${rendicionCoordName ?? 'aprobadores'}` :
        coordState === 'rejected' ? `Rechazada por ${rendicionCoordName ?? 'un aprobador'}` :
        `Aprobación de ${rendicionCoordName ?? 'aprobadores'}`,
      state: coordState,
      date: coordState === 'completed' ? fmt(r.coordinatorApprovedAt) : undefined,
      description: coordState === 'active' ? 'Pendiente de aprobación de los aprobadores' : undefined,
      notes: coordState === 'rejected' ? rejectionReason : undefined,
      group: 'rendicion',
    });
  }

  // Contabilidad es un rol (cualquier usuario con permiso puede actuar) — no hay un
  // aprobador esperado nombrado mientras está pendiente, pero una vez aprobado sí
  // se conoce a la persona concreta (`contabilidadApprovedBy`).
  const contaState = stateFor(CONTA_IDX);
  const contaApprovedByName = r.contabilidadApprovedBy && typeof r.contabilidadApprovedBy === 'object'
    ? r.contabilidadApprovedBy.name : undefined;
  steps.push({
    label:
      contaState === 'completed' ? `Aprobada por ${contaApprovedByName ?? 'Contabilidad'}` :
      contaState === 'rejected' ? 'Rechazada por Contabilidad' :
      'Aprobación de Contabilidad',
    state: contaState,
    date: contaState === 'completed' ? fmt(r.contabilidadApprovedAt) : undefined,
    description: contaState === 'active' ? 'Pendiente de aprobación final de Contabilidad' : undefined,
    notes: contaState === 'rejected' ? rejectionReason : undefined,
    group: 'rendicion',
  });

  if (!rejected && !expectsReembolso && !expectsDevolucion && !closed) {
    const finalState = stateFor(FINAL_IDX);
    steps.push({
      label:
        finalState === 'completed' ? (FINAL_LABELS[status] ?? 'Finalizada') :
        finalState === 'active' ? 'Rendición en curso' :
        'Finalizada',
      state: finalState,
      description: finalState === 'active' ? 'Registrando gastos, pendiente de cierre' : undefined,
      group: 'rendicion',
    });
  }

  if (!rejected && expectsReembolso) {
    const reembolsoState = stateFor(SETTLE_IDX);
    steps.push({
      label: reembolsoState === 'completed' ? 'Reembolsado por Tesorería' : 'Reembolso de Tesorería',
      state: reembolsoState,
      date: reembolsoState === 'completed' ? fmt(r.reimbursedAt) : undefined,
      description: reembolsoState === 'active' ? 'Pendiente de pago de Tesorería' : undefined,
      group: 'rendicion',
    });
  }

  if (!rejected && expectsDevolucion) {
    const devolucionState = stateFor(SETTLE_IDX);
    steps.push({
      label: devolucionState === 'completed' ? 'Devolución recibida' : 'Devolución del colaborador',
      state: devolucionState,
      date: devolucionState === 'completed'
        ? fmt(r.returnVoucher?.uploadedAt ?? r.returnRecord?.validatedAt ?? r.returnedAt)
        : undefined,
      description: devolucionState === 'active' ? 'Esperando comprobante de devolución del colaborador' : undefined,
      group: 'rendicion',
    });
  }

  if (!rejected && (closed || expectsReembolso || expectsDevolucion)) {
    const closeState = stateFor(CLOSE_IDX);
    steps.push({
      label: closeState === 'completed' ? 'Cerrado por Tesorería' : 'Cierre de Tesorería',
      state: closeState,
      date: closeState === 'completed' ? fmt(r.closureRecord?.closedAt ?? r.closedAt) : undefined,
      description: closeState === 'active' ? 'Pendiente de cierre por Tesorería' : undefined,
      group: 'rendicion',
    });
  }

  return steps;
}
