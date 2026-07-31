/** Departamentos válidos para la OT y su código de 3 letras (LIM-{código}-{correlativo}). */
export const OT_DEPARTAMENTOS: { code: string; label: string }[] = [
  { code: 'TAL', label: 'Taller' },
  { code: 'SCA', label: 'Servicios de Campo' },
  { code: 'SMI', label: 'Servicios de Minería' },
  { code: 'ICO', label: 'Ingeniería y Confiabilidad' },
  { code: 'ABA', label: 'Abastecimientos' },
  { code: 'COM', label: 'Departamento Comercial' },
];

export function otDepartamentoLabel(code: string): string {
  return OT_DEPARTAMENTOS.find((d) => d.code === code)?.label ?? code;
}

export interface IOrdenTrabajo {
  _id?: string;
  departamento: string;
  correlativo: number;
  codigo: string;
  descripcion?: string;
  isActive?: boolean;
  clientId?: string;
  createdAt?: string;
  updatedAt?: string;
}
