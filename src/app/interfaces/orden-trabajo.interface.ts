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
  /** Centro de costo padre: id plano al crear/editar, u objeto poblado al leer. */
  costCenterId: string | IOrdenTrabajoCentroCosto;
  isActive?: boolean;
  clientId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Texto legible del centro de costo de una OT (soporta id plano o poblado). */
export function otCentroCostoLabel(ot: IOrdenTrabajo): string {
  const cc = ot?.costCenterId;
  if (cc && typeof cc === 'object') {
    return cc.code ? `${cc.code} — ${cc.name ?? ''}`.trim() : (cc.name ?? '');
  }
  return '';
}
