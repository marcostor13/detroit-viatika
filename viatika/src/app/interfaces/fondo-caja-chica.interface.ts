export type FondoCajaChicaStatus = 'pending_funding' | 'active' | 'closed';

export type FondoMovementType =
  | 'fondeo'
  | 'cargo'
  | 'reverso'
  | 'reposicion'
  | 'ajuste'
  | 'devolucion';

export interface IFondoMovement {
  type: FondoMovementType;
  amount: number;
  expenseId?: string;
  expenseReportId?: string;
  registeredBy: string;
  registeredAt: string;
  note?: string;
  receiptUrl?: string;
  operationNumber?: string;
  /** Solo en `devolucion`: datos del depósito, para conciliar en Tesorería. */
  depositDate?: string;
  bankOrigin?: string;
  previousAmount?: number;
}

/** Bolsa de caja chica de un responsable. El disponible se calcula, no viaja. */
export interface IFondoCajaChica {
  _id: string;
  code: string;
  clientId: string;
  responsibleId:
    | {
        _id: string;
        name: string;
        email: string;
        /** Del perfil del colaborador; prellena el banco origen de la devolución. */
        bankAccount?: {
          bankName?: string;
          accountNumber?: string;
          cci?: string;
        };
      }
    | string;
  /** Monto que pidió en la primera solicitud. */
  requestedAmount: number;
  /** Presupuesto vigente. Es el tope al que vuelve la caja en cada reposición. */
  fundAmount: number;
  /** Gastado y aún no repuesto. */
  spentAmount: number;
  /** Sobrante por devolver tras bajar el presupuesto. */
  pendingReturnAmount: number;
  status: FondoCajaChicaStatus;
  /** Poblada en las consultas del responsable, para saber en qué paso va. */
  solicitudReportId?:
    | { _id: string; status: string; viaticoAmount?: number; createdAt?: string }
    | string;
  movements: IFondoMovement[];
  createdAt: string;
  updatedAt: string;
}

export const FONDO_STATUS_LABELS: Record<FondoCajaChicaStatus, string> = {
  pending_funding: 'Pendiente de depósito',
  active: 'Activa',
  closed: 'Cerrada',
};

export const FONDO_STATUS_VARIANTS: Record<FondoCajaChicaStatus, string> = {
  pending_funding: 'warning',
  active: 'success',
  closed: 'neutral',
};

/**
 * Solicitud de caja chica: la asignación inicial o un cambio de presupuesto.
 * `cajaChicaNuevoPresupuesto` es el presupuesto pedido; `viaticoAmount` es solo
 * la diferencia que Tesorería debe depositar (0 cuando el presupuesto baja).
 */
export interface ISolicitudCajaChica {
  _id: string;
  status: string;
  createdAt: string;
  title?: string;
  viaticoAmount?: number;
  cajaChicaNuevoPresupuesto?: number;
  cajaChicaPresupuestoAnterior?: number;
  rejectionReason?: string;
  /**
   * El backend devuelve además la cadena de aprobadores y los hitos del
   * trámite (`viaticoApproverChain`, fechas de Contabilidad y pago) para poder
   * armar la línea de tiempo con `buildReportFlowSteps`, la misma que ve el
   * aprobador. Se dejan sin tipar campo por campo porque ese constructor lee el
   * documento crudo de la rendición.
   */
  [extra: string]: unknown;
}

/**
 * Etiquetas propias de la solicitud de caja chica. No se reusan las de
 * Solicitud de Fondos porque ahí faltan estados que sí alcanza esta (`paid`,
 * cuando el presupuesto ya quedó aplicado) y otros significan algo distinto:
 * `open` en un viático es "registrando gastos", acá el trámite ya terminó.
 */
export const SOLICITUD_CAJA_CHICA_STATUS_LABELS: Record<string, string> = {
  pending_l1: 'Pendiente de aprobación',
  pending_l2: 'Pendiente de aprobación',
  pending_contabilidad: 'En Contabilidad',
  viatico_approved: 'Aprobada, pendiente de depósito',
  partially_paid: 'Depósito parcial',
  paid: 'Aplicada',
  open: 'Aplicada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
};

export const SOLICITUD_CAJA_CHICA_STATUS_COLORS: Record<string, string> = {
  pending_l1: 'bg-yellow-100 text-yellow-700',
  pending_l2: 'bg-yellow-100 text-yellow-700',
  pending_contabilidad: 'bg-orange-100 text-orange-700',
  viatico_approved: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  open: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

/**
 * ¿El saldo de esta rendición de caja chica lo devuelve el COLABORADOR (gastó
 * menos de lo que tenía) en vez de reembolsarlo Tesorería?
 *
 * Mismo criterio que `isDevolucionExpected` en el detalle: manda el tipo de
 * liquidación si ya está calculado y, mientras no exista, el signo de la
 * diferencia. En caja chica lo normal es que no haya `settlement` hasta que
 * Tesorería paga, y ahí el saldo es a favor del responsable: se reembolsa.
 */
export function cajaChicaEsperaDevolucion(report: {
  settlement?: { type?: string; difference?: number } | null
  returnVoucher?: unknown
} | null | undefined): boolean {
  if (!report) return false
  if (report.returnVoucher) return true
  const tipo = report.settlement?.type
  if (tipo) return tipo === 'devolucion'
  return Number(report.settlement?.difference ?? 0) > 0.01
}

/**
 * Estado de la RENDICIÓN de caja chica (los comprobantes que el responsable
 * rinde contra su fondo). No alcanza un diccionario plano por estado: después
 * de Contabilidad el flujo tiene DOS pasos más que el `status` solo no
 * distingue, y sin ellos la rendición parecía terminada al aprobarse.
 *
 *   Contabilidad aprueba
 *     └─ reembolsa Tesorería (`approved` → `reimbursed`)
 *        o devuelve el colaborador (`approved` + `returnVoucher`)
 *          └─ Tesorería cierra definitivamente (`closed`)
 *
 * La devolución no cambia el `status` —solo escribe `returnVoucher`—, así que
 * ese campo se mira aparte para no dejar la rendición en "Aprobada" cuando el
 * colaborador ya depositó y lo único que falta es el cierre.
 */
export function rendicionCajaChicaStatusLabel(report: {
  status?: string
  settlement?: { type?: string; difference?: number } | null
  returnVoucher?: unknown
}): string {
  const status = String(report?.status ?? '')
  switch (status) {
    case 'open':
      return 'Registrando gastos'
    case 'submitted':
      return 'Pendiente de aprobación'
    case 'pending_accounting':
      return 'En Contabilidad'
    case 'rejected':
      return 'Observada'
    case 'cancelled':
      return 'Cancelada'
    case 'closed':
      return 'Cerrada por Tesorería'
    case 'returned':
      return 'Devuelta, por cerrar Tesorería'
    case 'reimbursed':
    case 'settled':
      return 'Reembolsada, por cerrar Tesorería'
    case 'approved':
      return report?.returnVoucher
        ? 'Devuelta, por cerrar Tesorería'
        : cajaChicaEsperaDevolucion(report)
          ? 'Aprobada, por devolver el colaborador'
          : 'Aprobada, por reembolsar Tesorería'
    default:
      return status
  }
}

/** Color del chip de estado. Mismo reparto de casos que la etiqueta. */
export function rendicionCajaChicaStatusColor(report: {
  status?: string
  settlement?: { type?: string; difference?: number } | null
  returnVoucher?: unknown
}): string {
  const status = String(report?.status ?? '')
  switch (status) {
    case 'open':
      return 'bg-emerald-100 text-emerald-700'
    case 'submitted':
      return 'bg-yellow-100 text-yellow-700'
    case 'pending_accounting':
      return 'bg-violet-100 text-violet-700'
    case 'rejected':
      return 'bg-red-100 text-red-700'
    case 'cancelled':
      return 'bg-gray-100 text-gray-500'
    case 'closed':
      return 'bg-gray-100 text-gray-500'
    // Falta el cierre: ámbar, la rendición sigue viva aunque el dinero ya se movió.
    case 'returned':
    case 'reimbursed':
    case 'settled':
      return 'bg-amber-100 text-amber-700'
    case 'approved':
      return report?.returnVoucher
        ? 'bg-amber-100 text-amber-700'
        : 'bg-green-100 text-green-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

/**
 * Presupuesto que pidió una solicitud. Las creadas antes de que existiera
 * `cajaChicaNuevoPresupuesto` solo tienen `viaticoAmount`, que en la primera
 * solicitud es el mismo número.
 */
export function presupuestoSolicitado(s: ISolicitudCajaChica): number {
  return Number(s.cajaChicaNuevoPresupuesto ?? s.viaticoAmount ?? 0);
}

/** Estados en los que una solicitud todavía está en trámite. */
export const SOLICITUD_EN_CURSO_STATUSES = [
  'pending_l1',
  'pending_l2',
  'pending_contabilidad',
  'viatico_approved',
  'partially_paid',
];

/** Saldo que le queda al responsable para seguir gastando. */
export function saldoDisponible(fondo: IFondoCajaChica | null): number {
  if (!fondo) return 0;
  return Math.round((fondo.fundAmount - fondo.spentAmount) * 100) / 100;
}
