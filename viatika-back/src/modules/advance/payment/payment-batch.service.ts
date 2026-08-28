import {
  Injectable,
  Inject,
  forwardRef,
  Logger,
  BadRequestException,
} from '@nestjs/common'
import { readdir } from 'fs/promises'
import * as path from 'path'
import { AdvanceService } from '../advance.service'
import { ExpenseReportService } from '../../expense-report/expense-report.service'
// Rasterizado de PDF por binarios de sistema. Se reusa el envoltorio del OCR de
// facturas en vez de duplicarlo: es un util puro, sin estado ni dependencias de
// Nest, y el Dockerfile ya instala poppler-utils para ese flujo.
import {
  parsePdfInfo,
  pdfInfoArgs,
  runPoppler,
  withTempPdf,
} from '../../expense/utils/poppler.util'
import { ClientService } from '../../client/client.service'
import { AccountingConfigService } from '../../accounting-config/accounting-config.service'
import { DEFAULT_MONEDA, normalizeMoneda } from '../../../common/moneda.constants'
import {
  hasBankAccountForCurrency,
  resolveUserBankAccount,
} from '../../../common/bank-account.util'
import {
  BbvaDetailRecord,
  BbvaDocType,
  BbvaAccountType,
  BbvaPdfSummary,
  buildBbvaTxt,
  toLatin1Buffer,
  solesToCents,
  normalizeName,
  namesMatch,
  readBbvaPdfText,
  mergeBbvaReadings,
  resolveBbvaAccount,
  describeBbvaAccountProblem,
  BBVA_BANK_PREFIX,
} from './bbva-format'

/** Glosa por tipo de pago (VD-7). Ajustable si el cliente pide otra convención. */
const CONCEPTO = {
  advance: 'SOLICITUD DE FONDOS',
  viatico: 'SOLICITUD DE FONDOS',
  reembolso: 'REEMBOLSO',
} as const

export type PaymentKind = 'advance' | 'viatico' | 'reembolso'

/** Un PDF del reporte del banco, con su nombre para poder señalarlo en los avisos. */
export interface PdfConciliacion {
  buffer: Buffer
  nombre: string
}

/** Lo que se obtuvo de leer UN archivo del reporte. */
interface LecturaPdf {
  nombre: string
  lectura: BbvaPdfSummary
  /** Se leyó por OCR porque el PDF no traía capa de texto. */
  viaOcr: boolean
  /** Páginas que quedaron fuera por el tope de OCR. */
  paginasOmitidas: number
}

/** Un pago pendiente ya resuelto a datos de beneficiario + importe. */
export interface PendingPayment {
  kind: PaymentKind
  /** advanceId o reportId según el tipo. */
  id: string
  beneficiaryName: string
  documentType: BbvaDocType
  documentNumber: string
  accountType: BbvaAccountType
  /**
   * Cuenta de 20 dígitos que va al archivo (pos 18-37). Sale del CCI o, cuando
   * este falta y la cuenta es BBVA, del N° de cuenta — ver `resolveBbvaAccount`.
   */
  account20: string
  /** De qué campo del usuario salió `account20`; se muestra en el resumen. */
  accountSource: 'cci' | 'accountNumber'
  bankName: string
  email: string
  /** Importe por pagar, en la moneda del documento (`moneda`). */
  amount: number
  /** Moneda ISO del pago. El archivo BBVA admite UNA sola moneda por planilla. */
  moneda: string
  concepto: string
}

export interface ExcludedPayment {
  kind: PaymentKind
  id: string
  beneficiaryName: string
  amount: number
  /**
   * Moneda de ESTE pago, que no siempre es la del archivo: justamente el motivo
   * de exclusión más común es que sea otra. Sin este dato la pantalla rotulaba
   * los importes con la moneda de la planilla y mostraba "PEN 212.41" sobre un
   * texto que decía "Pago en USD".
   */
  moneda?: string
  reason: string
}

export interface CollectResult {
  payable: PendingPayment[]
  excluded: ExcludedPayment[]
}

export interface GenerateTxtResult {
  fileName: string
  /** Contenido del archivo en Latin-1, codificado base64. */
  fileBase64: string
  count: number
  totalSoles: number
  excluded: ExcludedPayment[]
  /** Moneda de ESTA planilla. El archivo BBVA admite una sola. */
  moneda: string
  /**
   * Pendientes agrupados por moneda, para que Tesorería sepa que quedan pagos
   * en otra moneda y pueda pedir su planilla. Sin esto, un pago en dólares
   * quedaba excluido para siempre y no había forma de emitirlo.
   */
  monedasPendientes: Array<{ moneda: string; count: number; total: number }>
}

/** Resultado de emitir todas las planillas pendientes de una vez. */
export interface GenerateAllTxtResult {
  /** Una planilla por moneda con pagos emitibles. */
  archivos: GenerateTxtResult[]
  /** Monedas que no se pudieron emitir, con el motivo (p. ej. sin cuenta de cargo). */
  fallidos: Array<{ moneda: string; count: number; total: number; motivo: string }>
}

export interface BatchActor {
  role: string
  permissions?: { canApproveL2?: boolean }
}

export interface ReconcileResult {
  operationNumber?: string
  executedAt?: string
  /** Moneda de la planilla contra la que se concilió. */
  moneda: string
  /**
   * Avisos que no impiden conciliar pero que Tesorería debe ver (falta el N° de
   * operación, falta la fecha de ejecución y se usó la de hoy…).
   */
  advertencias: string[]
  conciliados: Array<{
    kind: PaymentKind
    id: string
    beneficiaryName: string
    documentNumber: string
    amount: number
  }>
  sinConciliar: Array<{
    titular: string
    documentNumber: string
    amount: number
    reason: string
  }>
  noAbonados: Array<{ titular: string; documentNumber: string; situacion: string }>
}

@Injectable()
export class PaymentBatchService {
  private readonly logger = new Logger(PaymentBatchService.name)

  /**
   * 216 DPI: a 150 los importes chicos de la tabla empiezan a confundirse y a
   * 300 el reconocimiento tarda el doble sin leer mejor este reporte.
   */
  private readonly OCR_DPI = 216
  /**
   * Tope de páginas a reconocer (~2 s por página). Se dimensiona para que una
   * planilla de toda la empresa entre completa: si se recortan filas, la
   * validación contra la cabecera falla cerrado y NO se paga a nadie, así que
   * quedarse corto no es un riesgo de pago errado pero sí deja el trámite
   * bloqueado sin motivo.
   */
  private readonly OCR_MAX_PAGINAS = 30

  constructor(
    @Inject(forwardRef(() => AdvanceService))
    private readonly advanceService: AdvanceService,
    @Inject(forwardRef(() => ExpenseReportService))
    private readonly expenseReportService: ExpenseReportService,
    private readonly clientService: ClientService,
    private readonly accountingConfigService: AccountingConfigService
  ) {}

  // ── Reglas de derivación ───────────────────────────────────────────────────

  /**
   * Tipo de cuenta para el archivo BBVA: `P` (propia BBVA) cuando la cuenta
   * empieza por el código de banco de BBVA (`0011`), `I` (interbancaria) en otro
   * caso. Regla verificada contra el archivo real; ajustable si BBVA lo precisa.
   */
  private resolveAccountType(account20: string): BbvaAccountType {
    return (account20 ?? '').replace(/\D/g, '').startsWith(BBVA_BANK_PREFIX)
      ? 'P'
      : 'I'
  }

  /**
   * Motivo de exclusión cuando no se pudo armar la cuenta de 20 dígitos.
   * Se distingue el caso "no hay nada registrado" del caso "hay una cuenta de
   * otro banco sin CCI", porque la acción que debe tomar Tesorería es distinta:
   * la primera se completa en el perfil, la segunda hay que pedírsela al
   * colaborador. Las cuentas BBVA ya no llegan aquí: se derivan del N° de cuenta.
   */
  private motivoCuentaInvalida(bankName: string, cci: string, accountNumber: string): string {
    const banco = (bankName ?? '').trim() || 'Cuenta'
    const digitosCci = (cci ?? '').replace(/\D/g, '')
    const digitosCuenta = (accountNumber ?? '').replace(/\D/g, '')

    if (!digitosCci && !digitosCuenta) {
      return 'Sin cuenta bancaria registrada. Complétala en el perfil del usuario (Banco, N° de cuenta y CCI).'
    }
    // Se describen los DOS campos cuando ambos traen algo: es justo el caso de
    // los usuarios cargados con el mismo número en N° de cuenta y CCI, donde
    // saber cuál está mal es la mitad del arreglo.
    const partes: string[] = []
    if (digitosCci) partes.push(`el CCI ${describeBbvaAccountProblem(cci)}`)
    if (digitosCuenta) {
      partes.push(`el N° de cuenta ${describeBbvaAccountProblem(accountNumber)}`)
    }
    return `${banco}: ${partes.join(' y ')}. Corrígelo en el perfil del usuario.`
  }

  private buildCandidate(
    kind: PaymentKind,
    id: string,
    user: any,
    amount: number,
    cci: string,
    accountNumber: string,
    bankName: string,
    moneda?: string
  ): PendingPayment | ExcludedPayment {
    const beneficiaryName = user?.name ?? '—'
    const documentNumber = (user?.dni ?? '').trim()

    if (!documentNumber) {
      return { kind, id, beneficiaryName, amount, moneda: normalizeMoneda(moneda), reason: 'Sin DNI/documento registrado' }
    }
    // Un abono en dólares a una cuenta en soles lo rechaza el banco, y
    // enterarse por el rechazo cuesta días. `resolveUserBankAccount` cae a la
    // cuenta en soles cuando falta la de dólares —para que las pantallas y los
    // correos tengan algo que mostrar—, y sin este corte esa cuenta prestada
    // entraba al archivo como si fuera válida.
    //
    // Solo se corta ese caso exacto: pago en dólares usando la cuenta en soles
    // DEL PERFIL. Una cuenta escrita en la propia solicitud (`requestCci`) no
    // se cuestiona: la eligió quien pidió el dinero.
    const monedaPago = normalizeMoneda(moneda)
    if (monedaPago === 'USD' && !hasBankAccountForCurrency(user, 'USD')) {
      const soles = user?.bankAccount
      const usandoLaDeSoles =
        (!!cci && cci === soles?.cci) ||
        (!!accountNumber && accountNumber === soles?.accountNumber)
      if (usandoLaDeSoles) {
        return {
          kind,
          id,
          beneficiaryName,
          amount,
          moneda: monedaPago,
          reason:
            'El pago va en dólares y el colaborador no tiene cuenta en dólares registrada: se estaría usando la de soles y el banco rechazaría el abono. Cárgala en su perfil y vuelve a generar la planilla.',
        }
      }
    }
    // Una cuenta BBVA de 18 dígitos alcanza: el campo del archivo es la misma
    // cuenta con el bloque alineado a 12 (ver `toBbvaAccount20`). Exigir el CCI
    // aquí dejaba fuera del archivo, en silencio, a todo el personal de BBVA.
    const cuenta = resolveBbvaAccount({ cci, accountNumber })
    if (!cuenta) {
      return {
        kind,
        id,
        beneficiaryName,
        amount,
        moneda: normalizeMoneda(moneda),
        reason: this.motivoCuentaInvalida(bankName, cci, accountNumber),
      }
    }
    // El campo de aviso (flag `E` + correo, pos 147-227) es obligatorio en el
    // archivo real. Sin correo el registro sale en blanco y el banco rechaza el
    // archivo por estructura, así que se excluye para que Tesorería lo corrija.
    const email = String(user?.email ?? '').trim()
    if (!email) {
      return {
        kind,
        id,
        beneficiaryName,
        amount,
        moneda: normalizeMoneda(moneda),
        reason:
          'Sin correo registrado (el archivo BBVA exige el correo de aviso)',
      }
    }
    return {
      kind,
      id,
      beneficiaryName,
      documentType: (user?.documentType as BbvaDocType) || 'L',
      documentNumber,
      accountType: this.resolveAccountType(cuenta.account20),
      account20: cuenta.account20,
      accountSource: cuenta.source,
      bankName: bankName ?? '',
      email,
      amount,
      moneda: normalizeMoneda(moneda),
      concepto: CONCEPTO[kind],
    }
  }

  private isExcluded(x: PendingPayment | ExcludedPayment): x is ExcludedPayment {
    return 'reason' in x
  }

  /**
   * Cuenta de cargo para la cabecera del archivo, según la moneda de la planilla.
   *
   * Una planilla en dólares tiene que cargarse contra una cuenta en dólares.
   * Se busca entre las cuentas bancarias de la empresa (Plan de Cuentas y
   * Bancos, que ya llevan moneda) y solo se cae a `Client.paymentAccount` para
   * la moneda base, que es el caso de una empresa que opera en una sola moneda
   * y nunca registró sus bancos.
   */
  private resolveChargeAccount(
    client: any,
    config: {
      bankAccounts?: Array<{
        nroCuenta?: string
        moneda?: string
        activo?: boolean
        esCuentaPagos?: boolean
      }>
      monedaBase?: string
    },
    moneda: string
  ): string {
    const candidatas = (config.bankAccounts ?? []).filter(
      b =>
        b.activo !== false &&
        (b.moneda || config.monedaBase || DEFAULT_MONEDA) === moneda &&
        !!b.nroCuenta?.trim()
    )

    // La marcada manda. Sin marca se usa la única disponible; si hay varias sin
    // marcar no se adivina por orden de registro: se exige elegirla.
    const marcada = candidatas.find(b => b.esCuentaPagos)
    if (marcada?.nroCuenta) return marcada.nroCuenta.trim()
    if (candidatas.length === 1) return candidatas[0].nroCuenta!.trim()
    if (candidatas.length > 1) return ''

    const esMonedaBase = moneda === (config.monedaBase || DEFAULT_MONEDA)
    return esMonedaBase ? ((client?.paymentAccount ?? '') as string).trim() : ''
  }

  // ── Recolección de pendientes ──────────────────────────────────────────────

  async collectPendingPayments(clientId: string): Promise<CollectResult> {
    const [advances, viaticos, reembolsos] = await Promise.all([
      this.advanceService.findBatchPayableAdvances(clientId),
      this.expenseReportService.findBatchPayableViaticos(clientId),
      this.expenseReportService.findPendingReimbursementsByClient(clientId),
    ])

    const candidates: Array<PendingPayment | ExcludedPayment> = []

    for (const a of advances) {
      candidates.push(
        this.buildCandidate('advance', a.advanceId, a.user, a.remaining, a.cci, (a as any).accountNumber, a.bankName, (a as any).moneda)
      )
    }
    for (const v of viaticos) {
      candidates.push(
        this.buildCandidate('viatico', v.reportId, v.user, v.remaining, v.cci, (v as any).accountNumber, v.bankName, (v as any).moneda)
      )
    }
    for (const r of reembolsos as any[]) {
      const amount = this.reembolsoEnMonedaDelReporte(r)
      if (amount <= 0.009) continue
      // La cuenta del colaborador debe estar en la misma moneda que la
      // planilla; si no, el banco rechaza el abono.
      const cuenta = resolveUserBankAccount(r?.userId, r?.viaticoMoneda)
      const cci = cuenta?.cci ?? ''
      const accountNumber = cuenta?.accountNumber ?? ''
      const bankName = cuenta?.bankName ?? ''
      candidates.push(
        this.buildCandidate('reembolso', String(r._id), r.userId, amount, cci, accountNumber, bankName, r?.viaticoMoneda)
      )
    }

    return {
      payable: candidates.filter(c => !this.isExcluded(c)) as PendingPayment[],
      excluded: candidates.filter(c => this.isExcluded(c)) as ExcludedPayment[],
    }
  }

  /**
   * Importe a pagar de un reembolso, en la MONEDA DE SU RENDICIÓN.
   *
   * `settlement.difference` se calcula siempre en moneda base: la liquidación
   * suma el `montoBase` de cada gasto para no mezclar monedas. Pero la planilla
   * del banco se emite por moneda, y este pago entra en la de su rendición
   * (`viaticoMoneda`). Sin deshacer la conversión, una rendición directa en
   * dólares saldría a pagar la cifra en soles dentro del archivo en dólares.
   *
   * Se usa el TC que la rendición congeló al crearse, el mismo con el que sus
   * gastos calcularon su `montoReporte`, para que el pago cuadre con el total
   * que el colaborador y el aprobador vieron en pantalla.
   */
  private reembolsoEnMonedaDelReporte(report: {
    settlement?: { difference?: number }
    viaticoMoneda?: string
    tipoCambio?: number
  }): number {
    const base = Math.abs(Number(report?.settlement?.difference ?? 0))
    const moneda = normalizeMoneda(report?.viaticoMoneda)
    if (moneda === DEFAULT_MONEDA) return base

    const tc = Number(report?.tipoCambio)
    if (!tc || tc <= 0) {
      // Sin TC congelado no se inventa una cifra: el pago queda en 0 y cae en
      // los excluidos, donde Tesorería lo ve en vez de pagar de más o de menos.
      this.logger.warn(
        `Reembolso ${(report as any)?._id} en ${moneda} sin tipo de cambio congelado: se excluye de la planilla.`
      )
      return 0
    }
    return Math.round((base / tc) * 100) / 100
  }

  // ── Generación del TXT ─────────────────────────────────────────────────────

  /**
   * Genera la planilla de UNA moneda. El formato BBVA declara la moneda una
   * sola vez, en la cabecera, así que no admite mezclar soles y dólares en el
   * mismo archivo: los pagos de otra moneda salen como excluidos y se emiten en
   * su propia planilla llamando otra vez con esa moneda.
   *
   * Sin `moneda` se emite la base, que es el comportamiento de siempre.
   */
  /**
   * Emite TODAS las planillas que hagan falta, una por moneda con pagos
   * pendientes, en una sola acción.
   *
   * El formato BBVA declara una moneda y una cuenta de cargo por archivo, así
   * que separarlos no es opcional. Lo que sí lo era es obligar a Tesorería a
   * descubrirlo: se emitía la planilla de soles y recién en el resumen aparecía
   * un aviso de que quedaban pagos en dólares, con un segundo botón. Quien no
   * leía ese aviso dejaba a esa gente sin cobrar, y el archivo generado no
   * tenía nada de malo a la vista.
   *
   * Una moneda que falle (por ejemplo, sin cuenta de cargo registrada) no tumba
   * al resto: se emite lo que se puede y se informa qué quedó fuera y por qué.
   */
  async generateAllTxt(clientId: string): Promise<GenerateAllTxtResult> {
    const { payable } = await this.collectPendingPayments(clientId)
    const config = await this.accountingConfigService.getEffective(clientId)
    const monedaBase = normalizeMoneda(config.monedaBase)

    const resumen = this.resumirMonedas(payable)
    if (resumen.length === 0) {
      // Sin pagos emitibles: se delega en `generateTxt` para reusar su mensaje
      // y su detalle de excluidos por datos incompletos.
      return { archivos: [await this.generateTxt(clientId)], fallidos: [] }
    }

    // La moneda base primero: es la planilla habitual y la que Tesorería espera
    // ver arriba en el resumen.
    const monedas = resumen
      .map(r => r.moneda)
      .sort((a, b) => (a === monedaBase ? -1 : b === monedaBase ? 1 : a.localeCompare(b)))

    const archivos: GenerateTxtResult[] = []
    const fallidos: GenerateAllTxtResult['fallidos'] = []
    for (const m of monedas) {
      try {
        archivos.push(await this.generateTxt(clientId, m))
      } catch (error) {
        const datos = resumen.find(r => r.moneda === m)
        fallidos.push({
          moneda: m,
          count: datos?.count ?? 0,
          total: datos?.total ?? 0,
          motivo: error instanceof Error ? error.message : String(error),
        })
      }
    }
    // Cada planilla marca como "excluidos" los pagos de otra moneda, porque su
    // archivo no los admite. Emitiéndolas todas juntas eso deja de ser una
    // exclusión: ese pago SÍ sale, en el otro archivo. Dejarlo en la lista
    // pintaba de rojo a gente que sí va a cobrar. Solo se quitan las monedas
    // que se emitieron de verdad; las que fallaron siguen a la vista.
    const emitidas = new Set(archivos.filter(a => a.count > 0).map(a => a.moneda))
    for (const archivo of archivos) {
      archivo.excluded = archivo.excluded.filter(
        e => !(e.moneda && e.moneda !== archivo.moneda && emitidas.has(e.moneda))
      )
    }

    return { archivos, fallidos }
  }

  async generateTxt(
    clientId: string,
    moneda?: string
  ): Promise<GenerateTxtResult> {
    const { payable, excluded } = await this.collectPendingPayments(clientId)
    const config = await this.accountingConfigService.getEffective(clientId)
    const monedaArchivo = normalizeMoneda(moneda || config.monedaBase)
    const nombreArchivo = this.buildFileName(monedaArchivo, config.monedaBase)

    if (payable.length === 0) {
      // Si hay pendientes pero todos con datos incompletos, no lanzamos error:
      // devolvemos el detalle de los excluidos para que Tesorería sepa qué corregir.
      if (excluded.length > 0) {
        return {
          fileName: nombreArchivo,
          fileBase64: '',
          count: 0,
          totalSoles: 0,
          excluded,
          moneda: monedaArchivo,
          monedasPendientes: this.resumirMonedas(payable),
        }
      }
      throw new BadRequestException(
        'No hay pagos pendientes para generar el archivo.'
      )
    }

    const client = await this.clientService.findOne(clientId)

    const chargeAccount = this.resolveChargeAccount(
      client,
      config,
      monedaArchivo
    )
    if (!chargeAccount) {
      const variasSinMarcar =
        (config.bankAccounts ?? []).filter(
          b =>
            b.activo !== false &&
            (b.moneda || monedaArchivo) === monedaArchivo &&
            !!b.nroCuenta?.trim()
        ).length > 1
      throw new BadRequestException(
        variasSinMarcar
          ? `Hay varias cuentas en ${monedaArchivo} y ninguna marcada como cuenta de pagos. Marca cuál usar en Configuración → Plan de Cuentas y Bancos.`
          : `La empresa no tiene una cuenta de cargo en ${monedaArchivo}. Regístrala en Configuración → Plan de Cuentas y Bancos, o en Configuración → Empresa si opera en una sola moneda.`
      )
    }

    // La cuenta de cargo ocupa las posiciones 4-23 de la cabecera y BBVA la
    // busca tal cual entre las cuentas afiliadas al servicio. `padLeftZeros`
    // rellenaría en silencio una cuenta corta (ej. el número sin el CCI) con
    // ceros a la izquierda, produciendo una cuenta inexistente y el rechazo
    // "Cuenta de cargo no existe para este servicio" (fila 1, columna 4).
    // Se admiten 20 dígitos (la cuenta) o 21 (ya con el relleno de la pos. 3).
    const digitosCargo = chargeAccount.replace(/\D/g, '')
    const cargoValido =
      digitosCargo.length === 20 ||
      (digitosCargo.length === 21 && digitosCargo.startsWith('0'))
    if (!cargoValido) {
      throw new BadRequestException(
        `La cuenta de cargo en ${monedaArchivo} debe tener 20 dígitos y tiene ${digitosCargo.length} ("${chargeAccount}"). El banco rechaza el archivo con "Cuenta de cargo no existe para este servicio". Corrígela en Configuración → Plan de Cuentas y Bancos, o en Configuración → Empresa.`
      )
    }
    const otraMoneda = payable.filter(p => p.moneda !== monedaArchivo)
    const enMoneda = payable.filter(p => p.moneda === monedaArchivo)

    for (const p of otraMoneda) {
      excluded.push({
        kind: p.kind,
        id: p.id,
        beneficiaryName: p.beneficiaryName,
        amount: p.amount,
        moneda: p.moneda,
        reason: `Pago en ${p.moneda}: el archivo BBVA admite una sola moneda por planilla. Genera una planilla aparte para ${p.moneda}.`,
      })
    }

    if (enMoneda.length === 0) {
      return {
        fileName: nombreArchivo,
        fileBase64: '',
        count: 0,
        totalSoles: 0,
        excluded,
        moneda: monedaArchivo,
        monedasPendientes: this.resumirMonedas(payable),
      }
    }

    const records: BbvaDetailRecord[] = enMoneda.map(p => ({
      documentType: p.documentType,
      documentNumber: p.documentNumber,
      accountType: p.accountType,
      accountNumber: p.account20,
      beneficiaryName: p.beneficiaryName,
      amountCents: solesToCents(p.amount),
      concepto: p.concepto,
      email: p.email,
    }))

    const totalCents = records.reduce((s, r) => s + r.amountCents, 0)
    const txt = buildBbvaTxt(records, {
      chargeAccount,
      currency: monedaArchivo,
      description: this.buildPlanillaDescription(client, monedaArchivo),
    })

    return {
      fileName: nombreArchivo,
      fileBase64: toLatin1Buffer(txt).toString('base64'),
      count: records.length,
      totalSoles: Math.round(totalCents) / 100,
      excluded,
      moneda: monedaArchivo,
      monedasPendientes: this.resumirMonedas(payable),
    }
  }

  /**
   * Nombre del archivo. La moneda base conserva `BBVAREND.txt` (el nombre que
   * Tesorería ya usa con el banco); las demás llevan sufijo para no pisarlo al
   * descargar dos planillas seguidas.
   */
  private buildFileName(moneda: string, monedaBase?: string): string {
    const base = normalizeMoneda(monedaBase)
    return moneda === base ? 'BBVAREND.txt' : `BBVAREND-${moneda}.txt`
  }

  /** Pendientes agrupados por moneda (para ofrecer la planilla que falta). */
  private resumirMonedas(
    payable: PendingPayment[]
  ): Array<{ moneda: string; count: number; total: number }> {
    const porMoneda = new Map<string, { count: number; total: number }>()
    for (const p of payable) {
      const actual = porMoneda.get(p.moneda) ?? { count: 0, total: 0 }
      actual.count += 1
      actual.total += p.amount
      porMoneda.set(p.moneda, actual)
    }
    return [...porMoneda.entries()]
      .map(([moneda, v]) => ({
        moneda,
        count: v.count,
        total: Math.round(v.total * 100) / 100,
      }))
      .sort((a, b) => a.moneda.localeCompare(b.moneda))
  }

  private readonly MESES = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
  ]

  /**
   * Abreviatura de la moneda en la descripción de la planilla. `SOL`/`DOL` son
   * las que usa BBVA Net Cash: el campo (pos 52-75) pasa por `sanitizeBankText`,
   * que solo deja letras, dígitos y espacio, así que el símbolo `$` no puede ir
   * —saldría convertido en un espacio y la referencia quedaría coja—.
   */
  private readonly MONEDA_PLANILLA: Record<string, string> = {
    PEN: 'SOL',
    USD: 'DOL',
  }

  /**
   * Descripción de la planilla (cabecera, 24 chars). Sigue la convención del
   * archivo real de BBVA: `PROVEEDORES SOL <día> <MES>` (ej. PROVEEDORES SOL 02 JUNIO).
   *
   * VD-125 / VD-131: la abreviatura sale de la moneda del archivo, no fija en
   * `SOL`. Una planilla en dólares se descargaba rotulada como si fuera de
   * soles, y esa referencia es lo que Tesorería ve en el banco.
   */
  private buildPlanillaDescription(_client: any, moneda?: string): string {
    const now = new Date()
    const dd = String(now.getDate()).padStart(2, '0')
    const mes = this.MESES[now.getMonth()]
    const abrev =
      this.MONEDA_PLANILLA[normalizeMoneda(moneda)] ??
      this.MONEDA_PLANILLA[DEFAULT_MONEDA]
    return `PROVEEDORES ${abrev} ${dd} ${mes}`.slice(0, 24)
  }

  // ── Conciliación por PDF ───────────────────────────────────────────────────

  /** Normaliza la entrada a la forma `{ buffer, nombre }`. */
  private normalizarEntradas(
    pdfs: Buffer | Buffer[] | PdfConciliacion[]
  ): PdfConciliacion[] {
    const lista = Array.isArray(pdfs) ? pdfs : [pdfs]
    return lista.map((p, i) =>
      Buffer.isBuffer(p) ? { buffer: p, nombre: `PDF ${i + 1}` } : p
    )
  }

  /** Lee UN PDF por capa de texto y, si no da filas, por OCR. */
  private async leerPdf(pdf: PdfConciliacion): Promise<LecturaPdf> {
    // Cascada de lectura. No se le puede pedir a Tesorería que consiga un
    // formato concreto: el PDF llega como lo dé el banco o como lo reimprima
    // quien lo baja.
    //   1) capa de texto  — exacta e instantánea cuando el PDF es digital;
    //   2) OCR            — para el PDF reimpreso ("Microsoft: Print To PDF"),
    //                       que no trae texto sino el dibujo de las letras.
    const porTexto = readBbvaPdfText(await this.extractPdfText(pdf.buffer))
    if (porTexto.rows.length) {
      return { nombre: pdf.nombre, lectura: porTexto, viaOcr: false, paginasOmitidas: 0 }
    }

    const ocr = await this.extractPdfTextByOcr(pdf.buffer)
    if (ocr.texto) {
      const porOcr = readBbvaPdfText(ocr.texto)
      if (porOcr.rows.length) {
        this.logger.log(
          `Conciliación por OCR (${pdf.nombre}): ${porOcr.rows.length} abonos leídos de ${ocr.paginasLeidas}/${ocr.paginasTotales} páginas.`
        )
        return {
          nombre: pdf.nombre,
          lectura: porOcr,
          viaOcr: true,
          paginasOmitidas: Math.max(ocr.paginasTotales - ocr.paginasLeidas, 0),
        }
      }
    }
    return { nombre: pdf.nombre, lectura: porTexto, viaOcr: false, paginasOmitidas: 0 }
  }

  /**
   * Concilia el/los PDF de retorno. `moneda` debe ser la de la planilla que se
   * subió al banco: el PDF no la declara, así que sin este dato se asume la
   * base y un PDF de la planilla en dólares no cruzaría con nada.
   *
   * Se aceptan VARIOS archivos porque el banco pagina la "Relación de las
   * cuentas de abono" ("Siguiente"/"Anterior"): un lote de más de ~25 abonos no
   * cabe en una sola página y, con un archivo suelto, las filas leídas nunca
   * cuadran contra los totales de la cabecera y no se concilia nada. Cada
   * archivo se lee por separado (cada uno decide si necesita OCR) y las filas se
   * fusionan antes de verificar.
   */
  async reconcileFromPdf(
    clientId: string,
    pdfs: Buffer | Buffer[] | PdfConciliacion[],
    actor: BatchActor,
    moneda?: string
  ): Promise<ReconcileResult> {
    const entradas = this.normalizarEntradas(pdfs)
    const lecturas: LecturaPdf[] = []
    for (const entrada of entradas) {
      lecturas.push(await this.leerPdf(entrada))
    }

    const vacios = lecturas.filter(l => !l.lectura.rows.length)
    if (vacios.length === lecturas.length) {
      throw new BadRequestException(
        'No se pudieron leer abonos del PDF, ni siquiera por OCR. Verifica que sea la ' +
          '"Consulta de Pagos Masivos" de BBVA y que se vea la tabla "Relación de las ' +
          'cuentas de abono". Si el archivo es correcto, registra los pagos con la ' +
          'confirmación manual indicando el N° de operación.'
      )
    }

    const { summary: parsed, conflicto } = mergeBbvaReadings(
      lecturas.map(l => l.lectura)
    )
    if (conflicto) throw new BadRequestException(conflicto)

    const result = await this.reconcileParsedRows(
      clientId,
      parsed,
      actor,
      moneda
    )
    // Que quede rastro en pantalla de CÓMO se leyó y de si la situación por fila
    // hubo que deducirla: son los dos datos que Tesorería necesita para decidir
    // si revisa el resultado contra el reporte del banco antes de darlo por bueno.
    if (lecturas.length > 1) {
      result.advertencias.push(
        `Se leyeron ${lecturas.length} archivos como un solo lote: ${parsed.rows.length} abonos en total.`
      )
    }
    if (vacios.length) {
      result.advertencias.push(
        `Sin abonos legibles en ${vacios.map(v => v.nombre).join(', ')}: ese archivo no aportó ninguna fila.`
      )
    }
    if (lecturas.some(l => l.viaOcr)) {
      result.advertencias.push(
        'El PDF no tenía texto seleccionable y se leyó por OCR. Contrasta los importes con el reporte del banco antes de darlos por buenos.'
      )
    }
    if (parsed.situacionResueltaPorCabecera) {
      result.advertencias.push(
        `La columna "Situación" no era legible. Se dieron por abonados los ${parsed.rows.length} pagos porque la cabecera declara ` +
          `${parsed.declared?.procesados} procesados, 0 no procesados y un importe de ${parsed.declared?.importeAbonado?.toFixed(2)} que coincide con la suma de las filas.`
      )
    }
    // Sin este aviso, una planilla más larga que el tope se veía como un simple
    // "no cuadra con sus totales" y Tesorería no tenía cómo saber que el motivo
    // era que faltaron páginas por leer.
    const paginasOmitidas = lecturas.reduce((s, l) => s + l.paginasOmitidas, 0)
    if (paginasOmitidas > 0) {
      result.advertencias.push(
        `El PDF tiene ${paginasOmitidas} página(s) más de las que se alcanzaron a leer (tope: ${this.OCR_MAX_PAGINAS}). ` +
          'Si faltan abonos, divide la consulta del banco en varios PDF o usa la confirmación manual.'
      )
    }
    if (parsed.inconsistenteConCabecera) {
      result.advertencias.push(this.explicarInconsistencia(parsed))
    }
    return result
  }

  /**
   * Explica POR QUÉ lo leído no cuadra con la cabecera. El caso más común con
   * diferencia es que falten páginas —el banco pagina la relación de abonos y
   * quien la imprime se queda con la primera—, y decirlo con esas palabras es
   * la diferencia entre que Tesorería adjunte la página que falta o crea que el
   * banco rechazó todos los abonos.
   */
  private explicarInconsistencia(parsed: BbvaPdfSummary): string {
    const leidas = parsed.rows.length
    const procesados = parsed.declared?.procesados ?? 0
    const noProcesados = parsed.declared?.noProcesados ?? 0
    const total = procesados + noProcesados
    const cola =
      ' No se marcó ningún pago: revisa el archivo o regístralos con la confirmación manual.'

    if (leidas < total) {
      return (
        `Faltan abonos por leer: se leyeron ${leidas} de los ${total} que declara el reporte ` +
        `(${procesados} procesados y ${noProcesados} no procesados). El banco reparte la relación ` +
        'de abonos en varias páginas ("Siguiente"), y hay que subirlas TODAS DE UNA VEZ: vuelve a ' +
        'pulsar "Cargar pagos" y selecciona los PDF de todas las páginas juntos en el explorador ' +
        '(clic en el primero y Ctrl+clic en los demás). Subirlos de uno en uno no sirve, porque ' +
        'cada archivo suelto se compara contra el total del lote completo.' +
        cola
      )
    }
    if (leidas > total) {
      return (
        `Se leyeron ${leidas} abonos y el lote solo tiene ${total}: probablemente subiste una página repetida ` +
        'o un PDF de otro reporte.' +
        cola
      )
    }
    return (
      `Lo leído del PDF no cuadra con sus propios totales: se leyeron ${leidas} abonos, ` +
      `pero la cabecera declara ${procesados} procesados y ${noProcesados} no procesados ` +
      `por ${parsed.declared?.importeAbonado?.toFixed(2)}.` +
      cola
    )
  }

  /**
   * Lee el PDF por OCR cuando no trae capa de texto. Ocurre con el reporte
   * reimpreso desde el navegador ("Microsoft: Print To PDF"), donde las letras
   * quedan como trazos vectoriales y ningún extractor de texto encuentra nada.
   *
   * Rasteriza con `pdftoppm` y reconoce con tesseract.js. Ambos ya estaban en el
   * proyecto por el OCR de facturas: poppler lo instala el Dockerfile y
   * tesseract.js es dependencia directa. Se evita a propósito un rasterizador
   * nativo de Node — @napi-rs/canvas ya se probó y crasheaba con SIGILL en este
   * servidor por requerir AVX2 (ver el comentario del Dockerfile).
   *
   * Nunca lanza: si el entorno no tiene poppler (Windows en desarrollo) o el OCR
   * falla, devuelve '' y el llamador da el mensaje de confirmación manual.
   */
  private async extractPdfTextByOcr(
    buffer: Buffer
  ): Promise<{ texto: string; paginasTotales: number; paginasLeidas: number }> {
    try {
      return await withTempPdf(buffer, async (pdfPath, tmpDir) => {
        const info = parsePdfInfo(
          await runPoppler('pdfinfo', pdfInfoArgs(pdfPath, this.OCR_MAX_PAGINAS))
        )
        const paginasTotales = info.pageCount || 1
        const paginas = Math.min(paginasTotales, this.OCR_MAX_PAGINAS)

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createWorker } = require('tesseract.js')
        const worker = await createWorker('spa')
        try {
          const partes: string[] = []
          for (let page = 1; page <= paginas; page++) {
            const prefijo = path.join(tmpDir, `ocr-p${page}`)
            await runPoppler('pdftoppm', [
              '-png',
              '-r',
              String(this.OCR_DPI),
              '-f',
              String(page),
              '-l',
              String(page),
              pdfPath,
              prefijo,
            ])
            const png = (await readdir(tmpDir))
              .filter(f => f.startsWith(`ocr-p${page}`) && f.endsWith('.png'))
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0]
            if (!png) continue
            const { data } = await worker.recognize(path.join(tmpDir, png))
            partes.push(String(data?.text ?? ''))
          }
          return {
            texto: partes.join('\n'),
            paginasTotales,
            paginasLeidas: paginas,
          }
        } finally {
          await worker.terminate().catch(() => undefined)
        }
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.warn(`No se pudo leer el PDF por OCR: ${msg}`)
      return { texto: '', paginasTotales: 0, paginasLeidas: 0 }
    }
  }

  /**
   * PRUEBAS: simula el PDF de retorno de BBVA marcando como abonados TODOS los
   * pagos pendientes con datos bancarios completos, y los concilia por el mismo
   * motor que el PDF real (matching por DNI+monto + aplicación del pago). Permite
   * continuar el flujo de Tesorería sin depender del banco. El PDF real de BBVA
   * es la vía de producción; esto es solo una ayuda de prueba.
   */
  async simulateReconcile(
    clientId: string,
    actor: BatchActor,
    moneda?: string
  ): Promise<ReconcileResult> {
    const { payable: todos } = await this.collectPendingPayments(clientId)
    // Una planilla del banco es de UNA sola moneda, y el motor de conciliación
    // descarta los pendientes de otra. Sin acotar aquí, simular con pagos en
    // dólares emitía un lote en soles contra el que no cruzaba ninguno: cinco
    // "sin conciliar" sin explicar por qué.
    const config = await this.accountingConfigService.getEffective(clientId)
    const monedaLote = normalizeMoneda(moneda || config.monedaBase)
    const payable = todos.filter(p => normalizeMoneda(p.moneda) === monedaLote)
    if (!payable.length) {
      const otras = [...new Set(todos.map(p => normalizeMoneda(p.moneda)))]
        .filter(m => m !== monedaLote)
      throw new BadRequestException(
        otras.length
          ? `No hay pagos pendientes en ${monedaLote} para simular. Sí los hay en ${otras.join(', ')}: genera primero la planilla de esa moneda.`
          : 'No hay pagos pendientes con datos bancarios completos para simular.'
      )
    }
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const parsed: BbvaPdfSummary = {
      rows: payable.map(p => ({
        titular: normalizeName(p.beneficiaryName),
        documentNumber: (p.documentNumber ?? '').replace(/\D/g, ''),
        amount: p.amount,
        situacion: 'ABONO ENVIADO',
        success: true,
      })),
      // N° de operación pseudo-único (9 dígitos) y fecha/hora actuales.
      operationNumber: `SIM${String(now.getTime()).slice(-9)}`,
      executedAt: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    }
    return this.reconcileParsedRows(clientId, parsed, actor, monedaLote)
  }

  /** Núcleo de conciliación: cruza los abonos parseados con los pendientes y aplica el pago. */
  private async reconcileParsedRows(
    clientId: string,
    parsed: BbvaPdfSummary,
    actor: BatchActor,
    moneda?: string
  ): Promise<ReconcileResult> {
    const { payable } = await this.collectPendingPayments(clientId)
    // El PDF no declara la moneda. Se usa la de la planilla que se subió al
    // banco; sin ese dato se asume la base, que es el caso de siempre.
    const config = await this.accountingConfigService.getEffective(clientId)
    const monedaLote = normalizeMoneda(moneda || config.monedaBase)
    const used = new Set<number>() // índices de payable ya conciliados
    const advertencias: string[] = []
    const result: ReconcileResult = {
      operationNumber: parsed.operationNumber,
      executedAt: parsed.executedAt,
      moneda: monedaLote,
      advertencias,
      conciliados: [],
      sinConciliar: [],
      noAbonados: [],
    }

    if (!parsed.operationNumber) {
      advertencias.push(
        'El PDF no trae el N° de movimiento de cargo: los pagos quedarán registrados sin número de operación.'
      )
    }
    const transferDate = this.toIsoDate(parsed.executedAt)
    if (!parsed.executedAt) {
      advertencias.push(
        `El PDF no trae la fecha de ejecución: se registra con la fecha de hoy (${transferDate}).`
      )
    }

    // Cuántos abonos exitosos trae el PDF por cada combinación DNI+monto. Sirve
    // para distinguir un empate resoluble (el banco abonó los dos pendientes
    // iguales) de uno ambiguo (abonó uno solo y no se sabe cuál).
    const abonosPorClave = new Map<string, number>()
    for (const row of parsed.rows) {
      if (!row.success) continue
      const clave = this.claveAbono(row.documentNumber, row.amount)
      abonosPorClave.set(clave, (abonosPorClave.get(clave) ?? 0) + 1)
    }

    for (const row of parsed.rows) {
      if (!row.success) {
        result.noAbonados.push({
          titular: row.titular,
          documentNumber: row.documentNumber,
          situacion: row.situacion,
        })
        continue
      }
      const { index: idx, ambiguo } = this.findMatchingCandidate(
        payable,
        used,
        row,
        monedaLote,
        abonosPorClave
      )
      if (idx < 0) {
        result.sinConciliar.push({
          titular: row.titular,
          documentNumber: row.documentNumber,
          amount: row.amount,
          reason: ambiguo
            ? 'Hay varios pagos pendientes con el mismo documento y monto y el PDF no permite saber cuál se abonó. Confírmalo a mano.'
            : 'No hay ningún pago PENDIENTE con ese documento y ese importe. Suele ser porque ya está pagado (por esta misma conciliación o a mano); si no, revisa que el pendiente sea de esta empresa y de esta moneda.',
        })
        continue
      }
      used.add(idx)
      const cand = payable[idx]
      try {
        await this.applyPayment(cand, {
          operationNumber: parsed.operationNumber,
          transferDate,
          actor,
        })
        result.conciliados.push({
          kind: cand.kind,
          id: cand.id,
          beneficiaryName: cand.beneficiaryName,
          documentNumber: cand.documentNumber,
          amount: cand.amount,
        })
      } catch (err: unknown) {
        used.delete(idx)
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.error(`Conciliación ${cand.kind} ${cand.id}: ${msg}`)
        result.sinConciliar.push({
          titular: row.titular,
          documentNumber: row.documentNumber,
          amount: row.amount,
          reason: `Error al registrar el pago: ${msg}`,
        })
      }
    }

    // Que NINGUNO cruce casi siempre significa que el lote ya se concilió antes:
    // al conciliar, los pagos quedan marcados y salen de los pendientes, así que
    // volver a subir el mismo PDF da una pantalla llena de "sin conciliar" que
    // parece un fallo grave y no lo es. Sin este aviso, lo natural es insistir.
    if (!result.conciliados.length && result.sinConciliar.length) {
      advertencias.push(
        `Ninguno de los ${result.sinConciliar.length} abonos cruzó con un pago pendiente. ` +
          'Si ya conciliaste este lote antes, es lo esperado: los pagos quedaron marcados y ' +
          'ya no están pendientes. Compruébalo en la pestaña "Fondos" antes de volver a subir el PDF.'
      )
    }

    return result
  }

  /**
   * Cruce por DNI + monto (clave fuerte: el DNI es único por persona). El nombre
   * del PDF real es poco fiable (se parte en líneas, Ñ corrupta), así que NO se
   * usa como filtro duro: solo desempata cuando hay varios candidatos con el
   * mismo DNI + monto. Sin desempate → FIFO (más antiguo primero).
   */
  /** Clave de agrupación de un abono: documento + importe al céntimo. */
  private claveAbono(documentNumber: string, amount: number): string {
    return `${(documentNumber ?? '').replace(/\D/g, '')}|${Math.round(amount * 100)}`
  }

  /**
   * Busca el pendiente que corresponde a un abono del PDF.
   *
   * El cruce es por documento + importe (el PDF no trae más). Cuando eso empata
   * con varios pendientes se intenta desempatar por nombre; si tampoco alcanza,
   * NO se elige uno al azar: solo se acepta si el PDF trae tantos abonos de esa
   * misma clave como pendientes hay, porque entonces todos se van a conciliar y
   * el orden da igual. Si el banco abonó menos de los que están pendientes, no
   * hay forma de saber cuál se pagó y se devuelve `ambiguo` para que Tesorería
   * lo confirme a mano en vez de marcar el documento equivocado.
   */
  private findMatchingCandidate(
    payable: PendingPayment[],
    used: Set<number>,
    row: { titular: string; documentNumber: string; amount: number },
    moneda: string,
    abonosPorClave?: Map<string, number>
  ): { index: number; ambiguo: boolean } {
    const rowDni = (row.documentNumber ?? '').replace(/\D/g, '')
    const matches: number[] = []
    let totalMismaClave = 0
    for (let i = 0; i < payable.length; i++) {
      const c = payable[i]
      // Una planilla es de una sola moneda: acotar por ella evita que un abono
      // de 150 USD marque como pagado un pendiente de 150 PEN del mismo
      // colaborador.
      if (c.moneda !== moneda) continue
      const dniMatch = (c.documentNumber ?? '').replace(/\D/g, '') === rowDni
      const amountMatch = Math.abs(c.amount - row.amount) < 0.01
      if (!dniMatch || !amountMatch) continue
      totalMismaClave++ // incluye los ya usados: es el total de pendientes iguales
      if (!used.has(i)) matches.push(i)
    }
    if (matches.length === 0) return { index: -1, ambiguo: false }
    if (matches.length === 1) return { index: matches[0], ambiguo: false }

    // El nombre solo desempata si señala a UN candidato. Si varios se llaman
    // igual (el caso normal: es la misma persona con dos pendientes iguales) no
    // resuelve nada, y quedarse con el primero sería volver a elegir al azar.
    if (row.titular) {
      const porNombre = matches.filter(i =>
        namesMatch(row.titular, payable[i].beneficiaryName)
      )
      if (porNombre.length === 1) return { index: porNombre[0], ambiguo: false }
    }

    // Empate no resuelto por nombre: solo es seguro si el banco abonó tantas
    // veces esa clave como pendientes hay (todos terminan conciliados).
    const abonos =
      abonosPorClave?.get(this.claveAbono(row.documentNumber, row.amount)) ?? 0
    if (abonos >= totalMismaClave) return { index: matches[0], ambiguo: false }
    return { index: -1, ambiguo: true }
  }

  // ── Confirmación manual (fallback) ─────────────────────────────────────────

  async confirmManual(
    clientId: string,
    items: Array<{ kind: PaymentKind; id: string }>,
    meta: { operationNumber?: string; paymentDate?: string },
    actor: BatchActor
  ): Promise<{ pagados: number; errores: Array<{ id: string; reason: string }> }> {
    const { payable } = await this.collectPendingPayments(clientId)
    const byId = new Map(payable.map(p => [`${p.kind}:${p.id}`, p]))
    const transferDate = this.toIsoDate(meta.paymentDate)
    let pagados = 0
    const errores: Array<{ id: string; reason: string }> = []

    for (const it of items) {
      const cand = byId.get(`${it.kind}:${it.id}`)
      if (!cand) {
        errores.push({ id: it.id, reason: 'El pago ya no está pendiente o no existe' })
        continue
      }
      try {
        await this.applyPayment(cand, {
          operationNumber: meta.operationNumber,
          transferDate,
          actor,
        })
        pagados++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        errores.push({ id: it.id, reason: msg })
      }
    }
    return { pagados, errores }
  }

  // ── Aplicación del pago por superficie (reutiliza la lógica existente) ──────

  private async applyPayment(
    cand: PendingPayment,
    ctx: { operationNumber?: string; transferDate: string; actor: BatchActor }
  ): Promise<void> {
    const dto: any = {
      method: 'transferencia_bancaria',
      amount: cand.amount,
      transferDate: ctx.transferDate,
      reference: ctx.operationNumber,
      operationNumber: ctx.operationNumber,
    }
    const { role, permissions } = ctx.actor
    if (cand.kind === 'advance') {
      await this.advanceService.registerPayment(cand.id, dto, role, permissions, {
        bypassReceipt: true,
      })
    } else if (cand.kind === 'viatico') {
      await this.expenseReportService.registerViaticoPayment(
        cand.id,
        dto,
        role,
        permissions,
        { bypassReceipt: true }
      )
    } else {
      await this.expenseReportService.registerReimbursementPayment(
        cand.id,
        dto,
        role,
        permissions,
        undefined,
        { bypassReceipt: true }
      )
    }
  }

  // ── Utilidades ─────────────────────────────────────────────────────────────

  /** Convierte una fecha (dd/mm/yyyy | ISO | undefined) a `YYYY-MM-DD`. */
  /**
   * Fecha del abono a ISO. BBVA la emite en dd/mm/aaaa. Se validan día, mes y
   * que el calendario exista de verdad (un 31/02 se descarta) y que no sea una
   * fecha futura: antes, un `13/45/2026` o una fecha mal capturada del PDF se
   * escribía tal cual en el pago sin que nadie lo notara. Ante cualquier duda
   * se usa la fecha de hoy, que es el valor que ya se usaba cuando el PDF no
   * traía fecha.
   */
  private toIsoDate(input?: string): string {
    const hoy = new Date().toISOString().slice(0, 10)
    if (!input) return hoy

    let year: number, month: number, day: number
    const dmy = input.match(/^(\d{2})[/-](\d{2})[/-](\d{2,4})/)
    const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (dmy) {
      day = Number(dmy[1])
      month = Number(dmy[2])
      year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])
    } else if (iso) {
      year = Number(iso[1])
      month = Number(iso[2])
      day = Number(iso[3])
    } else {
      return hoy
    }

    // `Date.UTC` normaliza los desbordes (32/01 pasa a 01/02), así que se
    // compara contra lo pedido para detectar una fecha que no existe.
    const fecha = new Date(Date.UTC(year, month - 1, day))
    const real =
      fecha.getUTCFullYear() === year &&
      fecha.getUTCMonth() === month - 1 &&
      fecha.getUTCDate() === day
    if (!real) return hoy

    const iso10 = fecha.toISOString().slice(0, 10)
    return iso10 > hoy ? hoy : iso10
  }

  /** Extrae el texto del PDF con pdf-parse (carga perezosa para no afectar el arranque). */
  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse')
      const data = await pdfParse(buffer)
      return data?.text ?? ''
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new BadRequestException(`No se pudo leer el PDF: ${msg}`)
    }
  }
}
