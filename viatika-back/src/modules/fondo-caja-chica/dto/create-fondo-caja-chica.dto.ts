import {
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'

export class CreateFondoCajaChicaDto {
  @IsMongoId()
  responsibleId: string

  @IsOptional()
  @IsMongoId()
  clientId?: string

  /** Monto pedido en la solicitud. */
  @IsNumber()
  @Min(0.01)
  requestedAmount: number

  /** Solicitud (ExpenseReport) que originó el fondo. */
  @IsOptional()
  @IsMongoId()
  solicitudReportId?: string
}

export class FondearFondoDto {
  @IsNumber()
  @Min(0.01)
  amount: number

  @IsOptional()
  @IsString()
  note?: string
}

/** Devolución del sobrante que dejó una bajada de presupuesto. */
export class DevolverSobranteDto {
  @IsNumber()
  @Min(0.01)
  amount: number

  /** Comprobante del depósito. Obligatorio: es el respaldo de la devolución. */
  @IsString()
  receiptUrl: string

  @IsOptional()
  @IsString()
  operationNumber?: string

  /** Fecha del depósito (YYYY-MM-DD), como en el comprobante de devolución. */
  @IsOptional()
  @IsDateString()
  depositDate?: string

  @IsOptional()
  @IsString()
  bankOrigin?: string

  @IsOptional()
  @IsString()
  note?: string
}

export class ReponerFondoDto {
  @IsNumber()
  @Min(0.01)
  amount: number

  @IsOptional()
  @IsMongoId()
  expenseReportId?: string

  @IsOptional()
  @IsString()
  note?: string
}
