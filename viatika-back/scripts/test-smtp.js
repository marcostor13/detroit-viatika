/**
 * Prueba de transporte SMTP contra GMAIL — evidencia del error de envio.
 *
 * Reproduce el escenario que fallaba: EMAIL_PROVIDER=gmail con la cuenta
 * corporativa ti_dpsp@detroit.pe (Microsoft 365). Ignora el EMAIL_PROVIDER del
 * .env a proposito y fuerza el transporte "gmail" de
 * src/modules/email/email.module.ts, mostrando el dialogo SMTP completo.
 * Sirve como evidencia del ticket; el envio real ya usa outlook.
 *
 * La autenticacion falla en el AUTH, asi que NO se envia ningun correo.
 *
 * Uso (desde viatika-back/):
 *   node scripts/test-smtp.js
 */
const path = require('path')

require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const nodemailer = require('nodemailer')

const user = process.env.USER_EMAIL
const pass = process.env.PASSWORD_EMAIL

// Mismo transporte "gmail" de src/modules/email/email.module.ts
const gmailTransport = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user, pass },
}

async function probarGmail() {
  console.log('\n' + '='.repeat(78))
  console.log('ESCENARIO: EMAIL_PROVIDER=gmail')
  console.log(`  host : ${gmailTransport.host}:${gmailTransport.port}`)
  console.log(`  user : ${user}`)
  console.log(`  pass : ${'*'.repeat(String(pass || '').length)} (${String(pass || '').length} chars)`)
  console.log(`  to   : ${user} (auto-envio)`)
  console.log('='.repeat(78))

  const transporter = nodemailer.createTransport({
    ...gmailTransport,
    logger: true,
    debug: true,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
  })

  try {
    console.log('\n--- [gmail] verify() : handshake + AUTH ---')
    await transporter.verify()
    console.log('[gmail] verify() OK')

    console.log(`\n--- [gmail] sendMail() a ${user} ---`)
    const info = await transporter.sendMail({
      from: user,
      to: user,
      subject: '[PRUEBA SMTP] provider=gmail',
      text: 'Prueba de transporte SMTP con EMAIL_PROVIDER=gmail.',
    })
    console.log(`[gmail] ENVIO OK  messageId=${info.messageId}`)
    console.log(`[gmail] response  ${info.response}`)
    return { ok: true }
  } catch (err) {
    console.error('\n>>> ERROR DE ENVIO CON EMAIL_PROVIDER=gmail <<<')
    console.error(`  name        : ${err.name}`)
    console.error(`  code        : ${err.code}`)
    console.error(`  responseCode: ${err.responseCode}`)
    console.error(`  command     : ${err.command}`)
    console.error(`  message     : ${err.message}`)
    if (err.response) console.error(`  response    :\n${err.response}`)
    console.error('\n--- stack ---')
    console.error(err.stack)
    return {
      ok: false,
      code: err.code,
      responseCode: err.responseCode,
      message: err.message,
    }
  } finally {
    transporter.close()
  }
}

;(async () => {
  if (!user || !pass) {
    console.error('Falta USER_EMAIL o PASSWORD_EMAIL en .env')
    process.exit(1)
  }

  const r = await probarGmail()

  console.log('\n' + '='.repeat(78))
  console.log('RESUMEN')
  console.log('='.repeat(78))
  console.log(
    `  EMAIL_PROVIDER=gmail -> ${r.ok ? 'ENVIO OK' : `FALLO (${r.code}${r.responseCode ? ' / ' + r.responseCode : ''})`}`
  )
  if (!r.ok) console.log(`      ${r.message}`)
  console.log('')
  process.exit(r.ok ? 0 : 1)
})()
