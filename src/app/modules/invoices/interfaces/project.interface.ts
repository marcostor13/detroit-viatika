export interface IProject {
  _id?: string;
  name: string;
  code?: string;
  isActive?: boolean;
  description?: string;
  /** Centro / empresa cliente cuando el API devuelve populate */
  client?: { _id?: string; comercialName?: string; businessName?: string };
  /** Línea de negocio asignada (id) */
  lineaNegocioId?: string;
  /** Línea de negocio poblada (nombre/código) cuando el API la devuelve */
  lineaNegocio?: { _id?: string; name?: string; code?: string };
  // --- Mapeo contable (asientos Contanet) ---
  /** Cuenta analítica clase 9 del centro de costo (ej. 91.3.1.410). */
  cuentaAnalitica9x?: string;
  /** Cuenta destino clase 6 que recibe la analítica (ej. 63.1.4.100). */
  cuentaDestino6x?: string;
  /** Centro de costo Contanet (col T). */
  centroCosto?: string;
  /** Sub-centro de costo Contanet (col U/V). */
  subCentroCosto?: string;
  /** Área Contanet (col Y). */
  area?: string;
  /** Marca si el centro de costo es administrativo. */
  esAdministrativo?: boolean;
  /** @deprecated usar approverLevels. Se mantiene solo por compatibilidad de lectura, ya no se edita desde el form. */
  approverId?: string;
  /** Aprobador poblado (nombre/email) cuando el API lo devuelve */
  approver?: { _id?: string; name?: string; email?: string };
  /** Aprobadores por nivel explícito (N1, N2, N3…) de este centro de costo. */
  approverLevels?: IApproverLevel[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IApproverLevel {
  level: number;
  userIds: (string | { _id: string; name?: string; email?: string })[];
}
