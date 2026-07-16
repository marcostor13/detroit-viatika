export interface IOrdenTrabajo {
  _id?: string;
  /** Nombre/código de la OT que escribe el usuario (ej. "Lim-Com-1"). Único por empresa. */
  nombre: string;
  /** Centro de costo (Project) al que pertenece la OT. Puede llegar poblado. */
  costCenterId: { _id: string; code?: string; name: string; isActive?: boolean } | string;
  isActive?: boolean;
  clientId?: string;
  createdAt?: string;
  updatedAt?: string;
}
