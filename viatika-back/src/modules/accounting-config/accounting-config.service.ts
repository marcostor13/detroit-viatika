import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import {
  AccountingConfig,
  AccountingConfigDocument,
} from './entities/accounting-config.entity'
import { CreateAccountingConfigDto } from './dto/create-accounting-config.dto'
import { UpdateAccountingConfigDto } from './dto/update-accounting-config.dto'
import { DEFAULT_MONEDA } from '../../common/moneda.constants'

@Injectable()
export class AccountingConfigService {
  private readonly logger = new Logger(AccountingConfigService.name)

  constructor(
    @InjectModel(AccountingConfig.name)
    private accountingConfigModel: Model<AccountingConfigDocument>
  ) {}

  /** Devuelve la config del cliente o null si aún no existe. */
  async findByClient(clientId: string) {
    return this.accountingConfigModel.findOne({ clientId }).lean().exec()
  }

  /**
   * Crea o actualiza (upsert) la configuración contable de una empresa.
   * Hay una sola config por clientId; el upsert evita duplicados.
   */
  async upsert(
    clientId: string,
    dto: CreateAccountingConfigDto | UpdateAccountingConfigDto
  ) {
    const { clientId: _omit, ...rest } = dto as CreateAccountingConfigDto
    this.assertOneCuentaPagosPorMoneda(rest.bankAccounts)
    return this.accountingConfigModel
      .findOneAndUpdate(
        { clientId },
        { $set: { ...rest, clientId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
      .lean()
      .exec()
  }

  /**
   * Solo una cuenta de pagos por moneda. Con dos marcadas el generador del
   * archivo BBVA tendría que elegir por orden de registro, que es justo lo que
   * la marca viene a evitar.
   */
  private assertOneCuentaPagosPorMoneda(
    bankAccounts?: Array<{ moneda?: string; esCuentaPagos?: boolean }>
  ): void {
    const porMoneda = new Map<string, number>()
    for (const b of bankAccounts ?? []) {
      if (!b?.esCuentaPagos) continue
      const moneda = b.moneda || DEFAULT_MONEDA
      porMoneda.set(moneda, (porMoneda.get(moneda) ?? 0) + 1)
    }
    const duplicada = [...porMoneda.entries()].find(([, n]) => n > 1)
    if (duplicada) {
      throw new BadRequestException(
        `Hay más de una cuenta de pagos marcada en ${duplicada[0]}. Marca solo una por moneda.`
      )
    }
  }

  /**
   * Config efectiva: la del cliente fusionada con un documento por defecto.
   * Garantiza que el motor de asientos siempre tenga las constantes Contanet.
   */
  async getEffective(clientId: string): Promise<AccountingConfigDocument> {
    // Documento en memoria con los defaults del schema (sin persistir).
    const defaults = new this.accountingConfigModel({ clientId }).toObject()
    const existing = await this.accountingConfigModel
      .findOne({ clientId })
      .lean()
      .exec()
    if (!existing) return defaults as unknown as AccountingConfigDocument

    // Fusión real con los defaults: una config guardada antes de que existiera
    // un campo (p. ej. `supportedCurrencies`) no debe quedarse sin él, o la
    // empresa perdería silenciosamente monedas o constantes del plan. Solo
    // rellena lo AUSENTE: un array vaciado a propósito se respeta.
    const merged: Record<string, unknown> = { ...defaults }
    for (const [key, value] of Object.entries(existing)) {
      if (value !== undefined && value !== null) merged[key] = value
    }
    return merged as unknown as AccountingConfigDocument
  }

  /** Resuelve la cuenta contable 104 a partir del número de cuenta bancaria. */
  async resolveBankAccount(clientId: string, nroCuenta: string) {
    const config = await this.findByClient(clientId)
    return config?.bankAccounts?.find(b => b.nroCuenta === nroCuenta) ?? null
  }

  /**
   * Códigos de moneda SUNAT disponibles para la empresa (derivados de
   * `monedaOrigen` y `bankAccounts[].moneda`). Sin config guardada, solo soles.
   * Endpoint liviano apto para cualquier rol autenticado (a diferencia del
   * resto del plan de cuentas, que expone datos bancarios sensibles).
   */
  async getAvailableCurrencies(clientId: string): Promise<string[]> {
    // `getEffective` devuelve los defaults del schema cuando la empresa aún no
    // guardó su configuración contable, así que las monedas soportadas no
    // dependen de que alguien haya registrado un banco.
    const config = await this.getEffective(clientId)
    const codes = (config.supportedCurrencies ?? [])
      .map(c => c.code)
      .filter(Boolean)
    if (!codes.length) return [config.monedaBase || DEFAULT_MONEDA]
    // La moneda base siempre primero: es la que el formulario preselecciona.
    const base = config.monedaBase || DEFAULT_MONEDA
    return [base, ...codes.filter(c => c !== base)]
  }
}
