import {
  isBankAccountUsable,
  resolveUserBankAccount,
} from './bank-account.util'

/**
 * El colaborador guarda dos cuentas: la de soles de siempre y la de dólares.
 * Elegir mal la cuenta hace que el banco rechace el abono, porque la moneda de
 * la cuenta tiene que coincidir con la de la planilla.
 */
describe('resolveUserBankAccount', () => {
  const soles = { bankName: 'BCP', accountNumber: '1911234567', cci: '' }
  const dolares = { bankName: 'BBVA', accountNumber: '0011987654', cci: '' }
  const usuario = { bankAccount: soles, bankAccountUsd: dolares }

  it('usa la cuenta en dólares cuando la solicitud es en dólares', () => {
    expect(resolveUserBankAccount(usuario, 'USD')).toBe(dolares)
  })

  it('usa la cuenta en soles cuando la solicitud es en soles', () => {
    expect(resolveUserBankAccount(usuario, 'PEN')).toBe(soles)
  })

  it('sin moneda declarada se comporta como antes: cuenta en soles', () => {
    expect(resolveUserBankAccount(usuario, undefined)).toBe(soles)
  })

  it('acepta el símbolo además del código ISO', () => {
    // La DJ al exterior manda 'US$' en vez de 'USD'.
    expect(resolveUserBankAccount(usuario, 'US$')).toBe(dolares)
  })

  it('cae a la cuenta en soles si el colaborador no registró la de dólares', () => {
    // Tesorería ve el caso en la planilla en vez de quedarse sin datos.
    expect(resolveUserBankAccount({ bankAccount: soles }, 'USD')).toBe(soles)
  })

  it('cae a la cuenta en soles si la de dólares está vacía', () => {
    const sinDatos = { bankAccount: soles, bankAccountUsd: { bankName: 'BBVA' } }
    expect(resolveUserBankAccount(sinDatos, 'USD')).toBe(soles)
  })

  it('toma la cuenta en dólares que solo tiene CCI', () => {
    // Casi la mitad de la base cobra por CCI y no tiene número de cuenta.
    const soloCci = { bankName: 'Interbank', cci: '00399900112233445566' }
    const u = { bankAccount: soles, bankAccountUsd: soloCci }
    expect(resolveUserBankAccount(u, 'USD')).toBe(soloCci)
  })

  it('no revienta con un usuario sin cuentas', () => {
    expect(resolveUserBankAccount(null, 'USD')).toBeUndefined()
    expect(resolveUserBankAccount(undefined, 'PEN')).toBeUndefined()
  })
})

describe('isBankAccountUsable', () => {
  it('sirve con número de cuenta o con CCI', () => {
    expect(isBankAccountUsable({ accountNumber: '123' })).toBe(true)
    expect(isBankAccountUsable({ cci: '456' })).toBe(true)
  })

  it('no sirve solo con el nombre del banco', () => {
    expect(isBankAccountUsable({ bankName: 'BCP' })).toBe(false)
    expect(isBankAccountUsable({ accountNumber: '   ' })).toBe(false)
    expect(isBankAccountUsable(undefined)).toBe(false)
  })
})
