export interface ICategory {
  _id?: string;
  key?: string;
  name: string;
  description?: string;
  cuenta?: string;
  observaciones?: string;
  isActive?: boolean;
  limit?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  companyId?: string;
  clientId?: string;
}
