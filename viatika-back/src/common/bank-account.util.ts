import { normalizeMoneda } from './moneda.constants'

/** Cuenta bancaria del colaborador, tal como vive en su perfil. */
export interface UserBankAccount {
  bankName?: string
  accountNumber?: string
  cci?: string
  accountType?: string
}

/** Perfil del colaborador con sus cuentas: la de soles y la de dólares. */
export interface UserWithBankAccounts {
  bankAccount?: UserBankAccount | null
  bankAccountUsd?: UserBankAccount | null
}

/** Una cuenta sirve para pagar si tiene número de cuenta o CCI. */
export function isBankAccountUsable(account?: UserBankAccount | null): boolean {
  return !!(account?.accountNumber?.trim() || account?.cci?.trim())
}

/**
 * ¿El colaborador tiene registrada una cuenta para ESA moneda?
 *
 * Se comprueba ANTES de armar la planilla: un abono en dólares a una cuenta en
 * soles lo rechaza el banco, y enterarse por el rechazo cuesta días. Es mejor
 * dejar ese pago fuera del archivo con un motivo claro y que Tesorería complete
 * la cuenta, que mandarlo y esperar el rebote.
 */
export function hasBankAccountForCurrency(
  user?: UserWithBankAccounts | null,
  moneda?: string | null
): boolean {
  if (normalizeMoneda(moneda) !== 'USD') return isBankAccountUsable(user?.bankAccount)
  return isBankAccountUsable(user?.bankAccountUsd)
}

/**
 * Cuenta del colaborador que corresponde a la moneda del pago.
 *
 * El perfil guarda dos: `bankAccount` (soles, la de siempre) y
 * `bankAccountUsd` (dólares). Un abono en dólares tiene que ir a una cuenta en
 * dólares — el banco rechaza el pago si la moneda de la cuenta no coincide con
 * la de la planilla.
 *
 * Cuando falta la de la moneda pedida se devuelve la otra, para que las
 * pantallas y los correos tengan algo que mostrar. Quien va a PAGAR no debe
 * conformarse con eso: antes de armar la planilla tiene que preguntar por
 * `hasBankAccountForCurrency` y excluir el pago si no la hay.
 */
export function resolveUserBankAccount(
  user?: UserWithBankAccounts | null,
  moneda?: string | null
): UserBankAccount | undefined {
  const base = user?.bankAccount ?? undefined
  if (normalizeMoneda(moneda) !== 'USD') return base
  const usd = user?.bankAccountUsd ?? undefined
  return isBankAccountUsable(usd) ? usd : base
}
