/** Centro de costo poblado que el API adjunta a la OT (populate 'code name isActive'). */
export interface IOrdenTrabajoCentroCosto {
  _id?: string;
  code?: string;
  name?: string;
  isActive?: boolean;
}

export interface IOrdenTrabajo {
  _id?: string;
  /** Nombre/código de la OT (ej. "Lim-Com-1"). Único por empresa. */
  nombre: string;
  /** Centro de costo principal: el que sale en los reportes oficiales. */
  costCenterId: string | IOrdenTrabajoCentroCosto;
  /**
   * Todos los centros de costo desde los que se puede usar la OT, empezando por
   * el principal. Las OT antiguas pueden no traerlo: los helpers de abajo caen
   * a `costCenterId` en ese caso.
   */
  costCenterIds?: (string | IOrdenTrabajoCentroCosto)[];
  isActive?: boolean;
  clientId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Id plano de un centro de costo que puede venir como string o poblado. */
function centroCostoId(cc: string | IOrdenTrabajoCentroCosto | undefined): string {
  if (!cc) return '';
  return typeof cc === 'object' ? String(cc._id ?? '') : String(cc);
}

/** Texto legible de un centro de costo poblado ("123 — LIMA"). */
function centroCostoLabel(cc: string | IOrdenTrabajoCentroCosto | undefined): string {
  if (!cc || typeof cc !== 'object') return '';
  return cc.code ? `${cc.code} — ${cc.name ?? ''}`.trim() : (cc.name ?? '');
}

/**
 * Ids de TODOS los centros de costo de la OT. Es lo que hay que mirar para
 * decidir si una OT se puede usar desde un centro de costo: una misma OT puede
 * servir a varios (p. ej. las OT "SMI" en los cinco centros de SERVICIO
 * MINERIA). Incluye siempre el principal, aunque la OT venga de antes del
 * cambio y no traiga la lista.
 */
export function otCentroCostoIds(ot: IOrdenTrabajo): string[] {
  const ids = (ot?.costCenterIds ?? []).map(centroCostoId).filter(Boolean);
  const principal = centroCostoId(ot?.costCenterId);
  if (principal && !ids.includes(principal)) ids.unshift(principal);
  return ids;
}

/** True si la OT se puede usar desde ese centro de costo. */
export function otPerteneceACentroCosto(ot: IOrdenTrabajo, costCenterId: string): boolean {
  if (!costCenterId) return false;
  return otCentroCostoIds(ot).includes(costCenterId);
}

/** Texto legible del centro de costo principal (soporta id plano o poblado). */
export function otCentroCostoLabel(ot: IOrdenTrabajo): string {
  return centroCostoLabel(ot?.costCenterId);
}

/** Etiquetas de todos los centros de costo de la OT, sin repetir. */
export function otCentroCostoLabels(ot: IOrdenTrabajo): string[] {
  const etiquetas = [otCentroCostoLabel(ot), ...(ot?.costCenterIds ?? []).map(centroCostoLabel)];
  return [...new Set(etiquetas.filter(Boolean))];
}
