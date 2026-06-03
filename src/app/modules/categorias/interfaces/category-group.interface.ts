export interface ICategoryGroup {
  _id?: string;
  name: string;
  description?: string;
  clientId?: string;
  categoryIds: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
