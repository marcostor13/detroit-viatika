import { IsOptional, IsString } from 'class-validator'

export class DashboardQueryDto {
  @IsOptional()
  @IsString()
  dateFrom?: string

  @IsOptional()
  @IsString()
  dateTo?: string

  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsString()
  categoryId?: string

  @IsOptional()
  @IsString()
  collaboratorId?: string

  /** Orden de trabajo. Filtra tanto por la OT del reporte como la del comprobante. */
  @IsOptional()
  @IsString()
  ordenTrabajoId?: string

  /**
   * Departamento del destino, tal como lo devuelve `departments` en la
   * respuesta (incluye la etiqueta "Sin departamento").
   */
  @IsOptional()
  @IsString()
  department?: string
}
