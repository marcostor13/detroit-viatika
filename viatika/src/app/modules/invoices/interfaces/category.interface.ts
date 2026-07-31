export interface ICategory {
  _id?: string;
  key?: string;
  name: string;
  description?: string;
  cuenta?: string;
  /** Cuenta destino 6X (gasto por naturaleza) para asientos contables. */
  cuentaDestino6x?: string;
  observaciones?: string;
  isActive?: boolean;
  limit?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  companyId?: string;
  clientId?: string;
}
