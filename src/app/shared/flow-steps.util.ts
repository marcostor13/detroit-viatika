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

export function buildReportFlowSteps(r: any): FlowStep[] {
  if (!r) return [];

  const fmt = (d?: string | Date) =>
    d ? new Date(d as any).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }) : undefined;

  const isViatico = r.type === 'viatico';
  const isDirecta = !!r.isDirecta;
  const status: string = r.status;

  const chain: any[] = (isViatico ? r.viaticoApproverChain : isDirecta ? r.directaApproverChain : []) ?? [];
  const history: any[] = (isViatico ? r.viaticoApprovalHistory : isDirecta ? r.directaApprovalHistory : []) ?? [];
  const approvalLevel: number = (isViatico ? r.viaticoApprovalLevel : r.directaApprovalLevel) ?? 0;
  const requiredLevels: number = (isViatico ? r.viaticoRequiredLevels : r.directaRequiredLevels) ?? chain.length;

  const rejected = status === 'rejected';
  const rejectionReason: string | undefined = r.rejectionReason || r.viaticoRejectionReason;
  const terminal = TERMINAL_STATUSES.includes(status) || !!r.returnVoucher;

  const chainCount = chain.length > 0 ? Math.max(requiredLevels, chain.length) : 1;
  const contaIdx = chainCount + 1;
  const finalIdx = chainCount + 2;

  const approverName = (i: number): string => {
    const c = chain[i];
    return c && typeof c === 'object' && c.name ? c.name : 'Aprobador';
  };
  const chainLevelApproved = (level: number): boolean =>
    !!history.find(h => h.level === level && h.action === 'approved') || level <= approvalLevel;

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

  // Índice donde se rechazó (si aplica).
  let rejIdx = -1;
  if (rejected) {
    if (r.rejectedByRole === 'contabilidad' || r.viaticoRejectedByRole === 'contabilidad') {
      rejIdx = contaIdx;
    } else if (chain.length > 0) {
      const rejEntry = [...history].reverse().find(h => h.action === 'rejected');
      rejIdx = rejEntry?.level ?? Math.min(approvalLevel + 1, chainCount);
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

  const steps: FlowStep[] = [];

  // 0 — Solicitud enviada
  steps.push({
    label: 'Solicitud enviada',
    state: rejected && rejIdx === 0 ? 'rejected' : 'completed',
    date: fmt(r.createdAt),
  });

  // 1..chainCount — Cadena de aprobadores (viático/directa) o coordinador (rendición normal)
  if (chain.length > 0) {
    for (let level = 1; level <= chainCount; level++) {
      const entry = history.find(h => h.level === level && h.action === 'approved');
      const state = stateFor(level);
      const name = approverName(level - 1);
      const label =
        state === 'completed' ? `Aprobado por ${name}` :
        state === 'rejected' ? `Rechazado por ${name}` :
        `Aprobación de ${name}`;
      steps.push({
        label,
        state,
        date: fmt(entry?.date),
        description: state === 'active' ? `Pendiente de aprobación (nivel ${level} de ${chainCount})` : undefined,
        notes: entry?.notes || (state === 'rejected' ? rejectionReason : undefined),
      });
    }
  } else {
    const state = stateFor(1);
    steps.push({
      label:
        state === 'completed' ? 'Aprobado por el coordinador' :
        state === 'rejected' ? 'Rechazado por el coordinador' :
        'Aprobación del coordinador',
      state,
      date: fmt(r.coordinatorApprovedAt),
      description: state === 'active' ? 'Pendiente de aprobación del coordinador' : undefined,
      notes: state === 'rejected' ? rejectionReason : undefined,
    });
  }

  // contaIdx — Aprobación de Contabilidad
  const contaState = stateFor(contaIdx);
  steps.push({
    label: contaState === 'completed' ? 'Aprobado por Contabilidad' : 'Aprobación de Contabilidad',
    state: contaState,
    date: fmt(r.contabilidadApprovedAt || contaEntry?.date),
    description: contaState === 'active' ? 'Pendiente de aprobación final de Contabilidad' : undefined,
    notes: contaState === 'rejected' ? rejectionReason : undefined,
  });

  // finalIdx — Estado final (solo si no fue rechazada)
  if (!rejected) {
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

  return steps;
}
