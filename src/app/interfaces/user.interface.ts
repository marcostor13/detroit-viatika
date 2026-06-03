export interface IUser {
  _id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  password?: string;
  coordinatorId?: string | null;
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
  categoryIds?: string[];
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
  employeeCode?: string;
  /** Fase 3 — notificaciones viáticos. */
  area?: string;
  cargo?: string;
  address?: string;
  phone?: string;
  signature?: string;
  /** Coordinador para notificaciones de solicitud de viáticos (Fase 2). */
  coordinatorId?:
    | string
    | { _id: string; name?: string; email?: string };
  mustChangePassword?: boolean;
  profilePic?: string;
  bankAccount?: {
    bankName?: string;
    accountNumber?: string;
    cci?: string;
    accountType?: 'ahorros' | 'corriente';
  };
  emailNotificationsEnabled?: boolean;
}


