export interface IProject {
  _id?: string;
  name: string;
  code?: string;
  isActive?: boolean;
  description?: string;
  /** Centro / empresa cliente cuando el API devuelve populate */
  client?: { _id?: string; comercialName?: string; businessName?: string };
  createdAt?: Date;
  updatedAt?: Date;
}
