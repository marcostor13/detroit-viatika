/** Perfil de categoría: agrupa categorías para seleccionarlas juntas en permisos (VD-38). */
export interface ICategoryProfile {
  _id?: string;
  name: string;
  categoryIds: string[];
  clientId?: string;
  createdAt?: string;
  updatedAt?: string;
}
