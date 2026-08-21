export interface IUser {
  _id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  password?: string;
  /** @deprecated usar approverIds. */
  coordinatorId?: string | null;
  approverIds?: string[];
  roleId?: string;
  role?: string;
  roleName?: string;
  roleKey?: string;
  clientId?: string | { _id: string };
  isActive?: boolean;
  userId?: string;
  companyId?: string;
  status?: string;
  phone?: string;
  signature?: string;
  createdAt?: Date;
  updatedAt?: Date;
  isSelf?: boolean; // Bandera para indicar si es el usuario actual logueado
}

export type IRole = IRoleResponse;
export type IClient = IClientResponse;

export interface IUserUpdate {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  roleId?: string;
  isActive?: boolean;
  companyId?: string;
  clientId?: string;
  password?: string;
}

export interface IClientResponse {
  _id: string;
  codigo?: string;
  comercialName: string;
  businessName: string;
  businessId: string; //ruc
  address: string;
  phone: string;
  email: string;
  logo: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoleResponse {
  _id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserPermissions {
  modules: string[];
  canApproveL1: boolean;
  canApproveL2: boolean;
  /** Categorías sueltas asignadas directamente al usuario. */
  categoryIds?: string[];
  /**
   * Centros de costo (Project) asignados, ORDENADOS: el primero es el centro
   * de costo principal del colaborador (primer aprobador cuando solicita
   * hacia un centro de costo que no tiene asignado).
   */
  projectIds?: string[];
  /**
   * Centro de costo principal explícito. Debe estar contenido en projectIds.
   * Si no se envía, el backend usa projectIds[0] como fallback.
   */
  primaryProjectId?: string;
  /**
   * Sub-tipos opcionales de "Otros Gastos" habilitados para el colaborador
   * (VD-91). Ausente/undefined = ambos habilitados.
   */
  otrosGastosOpcionales?: {
    recibosDiversos: boolean;
    djExtranjero: boolean;
  };
  /**
   * Habilita al colaborador a elegir fechas de inicio/fin anteriores a hoy en
   * la solicitud de viáticos. Ausente/false = solo desde hoy en adelante.
   */
  permitirFechasAnteriores?: boolean;
  /**
   * Aprobadores propios del colaborador por nivel (N1, N2, N3…), regla 1.10.
   * Cuando hay al menos un nivel con aprobadores, estos sustituyen a los del
   * centro de costo principal al armar la cadena de solicitudes y rendiciones.
   * Vacío/ausente = se usan los del centro de costo, como antes.
   */
  approverLevels?: IApproverLevel[];
}

/** Nivel de aprobación con sus aprobadores. Cualquiera de ellos completa el paso. */
export interface IApproverLevel {
  level: number;
  userIds: string[];
}

export interface IUserResponse {
  _id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  access_token?: string;
  client?: IClientResponse;
  clientId?: string | { _id: string };
  role: IRoleResponse;
  roleId?: string;
  roleName?: string;
  roleKey?: string;
  email: string;
  isActive: boolean;
  companyId?: string;
  createdAt: Date;
  updatedAt: Date;
  permissions?: IUserPermissions;
  dni?: string;
  /** Tipo de documento para pagos BBVA (R/L/P/E/M). */
  documentType?: 'R' | 'L' | 'P' | 'E' | 'M';
  employeeCode?: string;
  /** Fase 3 — notificaciones viáticos. */
  area?: string;
  cargo?: string;
  address?: string;
  phone?: string;
  signature?: string;
  /** @deprecated usar approverIds. */
  coordinatorId?:
    | string
    | { _id: string; name?: string; email?: string };
  /** Cadena ordenada de aprobadores (rol Coordinador) para anticipos/viáticos. */
  approverIds?: (string | { _id: string; name?: string; email?: string })[];
  mustChangePassword?: boolean;
  profilePic?: string;
  bankAccount?: {
    bankName?: string;
    accountNumber?: string;
    cci?: string;
    accountType?: 'ahorros' | 'corriente';
  };
  /** Cuenta en dólares, para los depósitos de solicitudes en USD. */
  bankAccountUsd?: {
    bankName?: string;
    accountNumber?: string;
    cci?: string;
    accountType?: 'ahorros' | 'corriente';
  };
  emailNotificationsEnabled?: boolean;
  /** Vacaciones programadas y quién firma en su lugar (VD-124). */
  vacaciones?: {
    desde: string;
    hasta: string;
    suplenteId: string;
  };
}


