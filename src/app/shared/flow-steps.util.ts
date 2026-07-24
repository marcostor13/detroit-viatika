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

interface RendicionApprover {
  name: string;
  /** Menor nivel de cadena en el que aparece (para ordenar N1 antes que N2). */
  level: number;
  /** Aprobó todos sus pasos en todos los comprobantes no rechazados. */
  approved: boolean;
  /** Fecha de su última aprobación (para el paso completado). */
  approvedAt?: string;
}

/**
 * Agrega las cadenas de aprobación por comprobante (regla 1.4) en una lista de
 * pasos POR APROBADOR, para separarlos en la línea de tiempo de la RENDICIÓN en
 * lugar de un genérico "Aprobación de aprobadores". Un aprobador queda aprobado
 * si completó todos sus pasos en todos los comprobantes no rechazados; queda
 * pendiente si le falta alguno. Aprobación en paralelo entre niveles (igual que
 * `pendingRendicionCoordNames`): un paso no aprobado se considera pendiente sin
 * importar su posición. Devuelve [] si los comprobantes no traen la cadena
 * poblada (p. ej. vistas con populate ligero), para caer al paso agregado.
 */
function aggregateRendicionApprovers(expenses: any[]): RendicionApprover[] {
  const byName = new Map<string, RendicionApprover>();
  for (const e of expenses ?? []) {
    if (e?.status === 'rejected') continue;
    const chain = e?.approverChain;
    if (!Array.isArray(chain)) continue; // aún no se construyó
    for (const step of chain) {
      const stepApproved = !!step.approved;
      const stepLevel = Number(step.level ?? 99);
      for (const a of step.approverIds ?? []) {
        if (!a || typeof a !== 'object' || !a.name) continue;
        const cur = byName.get(a.name) ?? { name: a.name, level: stepLevel, approved: true, approvedAt: undefined };
        cur.level = Math.min(cur.level, stepLevel);
        if (!stepApproved) cur.approved = false;
        if (stepApproved && step.approvedAt && (!cur.approvedAt || new Date(step.approvedAt) > new Date(cur.approvedAt))) {
          cur.approvedAt = step.approvedAt;
        }
        byName.set(a.name, cur);
      }
    }
  }
  return [...byName.values()].sort((x, y) => x.level - y.level || x.name.localeCompare(y.name));
}

export function buildReportFlowSteps(r: any): FlowStep[] {
  if (!r) return [];

  const fmt = (d?: string | Date) =>
    d ? new Date(d as any).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;

  const isViatico = r.type === 'viatico';
  const isDirecta = !!r.isDirecta;
  const status: string = r.status;

  // Un viático que ya recibió pago (parcial o total) dejó atrás la fase de
  // SOLICITUD y entró en la fase de RENDICIÓN al subir sus comprobantes — dos
  // flujos de aprobación independientes sobre el mismo documento. A partir de
  // acá `status`/`rejectedByRole`/`rejectionReason` pertenecen a la RENDICIÓN,
  // no a la solicitud (que usa sus propios `viatico*`).
  const viaticoEnteredRendicion =
    isViatico &&
    (Number(r.viaticoPaidAmount ?? 0) > 0 ||
      ['open', 'submitted', 'pending_accounting', 'reimbursed', 'closed', 'settled', 'returned'].includes(status) ||
      (status === 'rejected' && !!r.rejectedByRole));

  if (viaticoEnteredRendicion) {
    return buildViaticoTwoPhaseSteps(r, fmt);
  }

  const chain: any[] = (isViatico ? r.viaticoApproverChain : isDirecta ? r.directaApproverChain : []) ?? [];
  const history: any[] = (isViatico ? r.viaticoApprovalHistory : isDirecta ? r.directaApprovalHistory : []) ?? [];
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
  const expectsReembolso =
    reembolsoDone ||
    r.settlement?.type === 'reembolso' ||
    (collaboratorDirecta && terminal);

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

  // Contabilidad aprobó si hay hito directo, si el estado ya avanzó, o si el
  // historial tiene la entrada final (nivel por encima de la cadena, caso viático).
  const contaActive = status === 'pending_accounting' || status === 'pending_contabilidad';
  const contaEntry = history.find(h => h.action === 'approved' && h.level > chainCount);
  const contaDone =
    !!r.contabilidadApprovedBy || !!r.contabilidadApprovedAt || terminal || !!contaEntry;

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
  if (!rejected && !closed) {
    if (expectsReembolso && !reembolsoDone) {
      activeIndex = reembolsoIdx;
    } else if (expectsReembolso && reembolsoDone) {
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
      const label =
        state === 'completed' ? `Aprobado por ${name}` :
        state === 'rejected' ? `Rechazado por ${name}` :
        `Aprobación de ${name}`;
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

  // contaIdx — Aprobación de Contabilidad. Para un viático en fase SOLICITUD el
  // aprobador vive en `viaticoSolicitudContabilidadApprovedBy` (campo propio, ver
  // §fix de colisión); para rendición/directa, en `contabilidadApprovedBy`.
  const contaState = stateFor(contaIdx);
  const contaApprovedBySource = isViatico ? r.viaticoSolicitudContabilidadApprovedBy : r.contabilidadApprovedBy;
  const contaApprovedByName = contaApprovedBySource && typeof contaApprovedBySource === 'object'
    ? contaApprovedBySource.name : undefined;
  steps.push({
    label: contaState === 'completed' ? `Aprobado por ${contaApprovedByName ?? 'Contabilidad'}` : 'Aprobación de Contabilidad',
    state: contaState,
    date: fmt(r.contabilidadApprovedAt || contaEntry?.date),
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
  } else if (!rejected && !expectsReembolso && !closed) {
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
      description: reembolsoState === 'active' ? 'Pendiente de pago de Tesorería' : undefined,
    });
  }

  // closeIdx — Cierre por Tesorería (paso final del flujo). Se muestra cuando la
  // rendición ya está cerrada o cuando el flujo avanza hacia el cierre (reembolso).
  if (!rejected && (closed || expectsReembolso)) {
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
function buildViaticoTwoPhaseSteps(r: any, fmt: (d?: string | Date) => string | undefined): FlowStep[] {
  const steps: FlowStep[] = [];

  // ── Fase 1: SOLICITUD — congelada, siempre completada.
  const chain: any[] = r.viaticoApproverChain ?? [];
  steps.push({ label: 'Solicitud enviada', state: 'completed', date: fmt(r.createdAt), group: 'solicitud' });
  chain.forEach((c: any) => {
    const name = chainStepApproverNames(c);
    steps.push({ label: `Aprobado por ${name}`, state: 'completed', date: fmt(c.approvedAt), group: 'solicitud' });
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
  const terminal = ['approved', 'reimbursed', 'closed', 'settled'].includes(status) || !!r.returnVoucher;
  const closed = status === 'closed';
  const reembolsoDone = !!r.reimbursementPaymentInfo || !!r.reimbursedAt || status === 'reimbursed';
  const expectsReembolso = reembolsoDone || r.settlement?.type === 'reembolso';

  const COORD_IDX = 1;
  const CONTA_IDX = 2;
  const FINAL_IDX = 3;
  const REEMBOLSO_IDX = 4;
  const CLOSE_IDX = 5;

  let progress = -1;
  if (status !== 'open') progress = 0;
  if (status === 'pending_accounting' || terminal) progress = COORD_IDX;
  if (terminal) progress = CONTA_IDX;
  if (expectsReembolso && reembolsoDone) progress = REEMBOLSO_IDX;
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
      if (expectsReembolso && !reembolsoDone) activeIndex = REEMBOLSO_IDX;
      else if (expectsReembolso && reembolsoDone) activeIndex = CLOSE_IDX;
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
  const rendicionApprovers = aggregateRendicionApprovers(r.expenseIds);

  if (!rejected && rendicionApprovers.length > 0) {
    // Un solo paso con los aprobadores reales de la cadena por comprobante (N1/N2,
    // regla 1.4) nombrados juntos, en vez del genérico "aprobadores" (sin abrir un
    // paso por cada uno, para no alargar la línea de tiempo). Se marca aprobado
    // cuando todos completaron su aprobación, aunque el reporte siga en `submitted`
    // hasta la confirmación de la rendición (o ya haya avanzado a Contabilidad).
    const names = rendicionApprovers.map(a => a.name).join(' / ');
    const done = coordState === 'completed' || rendicionApprovers.every(a => a.approved);
    const lastApprovedAt = rendicionApprovers
      .map(a => a.approvedAt)
      .filter((d): d is string => !!d)
      .sort((x, y) => new Date(x).getTime() - new Date(y).getTime())
      .pop();
    steps.push({
      label: done ? `Aprobado por ${names}` : `Aprobación de ${names}`,
      state: done ? 'completed' : 'active',
      date: done ? fmt(r.coordinatorApprovedAt ?? lastApprovedAt) : undefined,
      description: done ? undefined : 'Pendiente de aprobación',
      group: 'rendicion',
    });
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

  if (!rejected && !expectsReembolso && !closed) {
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
    const reembolsoState = stateFor(REEMBOLSO_IDX);
    steps.push({
      label: reembolsoState === 'completed' ? 'Reembolsado por Tesorería' : 'Reembolso de Tesorería',
      state: reembolsoState,
      date: reembolsoState === 'completed' ? fmt(r.reimbursedAt) : undefined,
      description: reembolsoState === 'active' ? 'Pendiente de pago de Tesorería' : undefined,
      group: 'rendicion',
    });
  }

  if (!rejected && (closed || expectsReembolso)) {
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
