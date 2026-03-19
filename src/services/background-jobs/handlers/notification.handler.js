

/* export async function notificationSendHandler(payload, ctx) {
  console.log(`[notification:send] jobId=${ctx.jobId} userId=${payload.userId} template=${payload.template}`)
}

export async function notificationBulkHandler(payload, ctx) {
  console.log(`[notification:bulk] jobId=${ctx.jobId} count=${payload.userIds?.length}`)
}
 */


//test 
import https from 'https'

//  Resend email sender 
function sendEmail({ to, subject, body }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const MAIL_FROM      = process.env.MAIL_FROM ?? 'onboarding@resend.dev'

  if (!RESEND_API_KEY) {
    console.log(`[email:dev] no RESEND_API_KEY — would send to ${to}: ${subject}`)
    return Promise.resolve({ id: `dev-${Date.now()}` })
  }

  const payload = JSON.stringify({
    from:    MAIL_FROM,
    to:      [to],
    subject,
    text:    body,
  })

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path:     '/emails',
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization':  `Bearer ${RESEND_API_KEY}`,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          const parsed = JSON.parse(data || '{}')
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed)
          } else {
            reject(new Error(`Resend ${res.statusCode}: ${parsed.message ?? data}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// ── Template builder 
function buildEmail(template, data = {}) {
  const templates = {
    order_confirmed: {
      subject: `Your order #${data.orderId} is confirmed`,
      body:
        `Hi there,\n\n` +
        `Your order #${data.orderId} has been confirmed.\n` +
        `Amount: ${data.amount ?? 'N/A'}\n\n` +
        `Thank you for your purchase!\n`,
    },
    welcome: {
      subject: `Welcome to ${data.appName ?? 'our platform'}!`,
      body:
        `Hi ${data.name ?? 'there'},\n\n` +
        `Your account has been created successfully.\n` +
        `Login here: ${data.loginUrl ?? 'https://emilo.com'}\n\n` +
        `Welcome aboard!\n`,
    },
    password_reset: {
      subject: `Reset your password`,
      body:
        `Hi,\n\n` +
        `Click the link below to reset your password:\n` +
        `${data.resetUrl}\n\n` +
        `This link expires in 1 hour.\n` +
        `If you did not request this, ignore this email.\n`,
    },
  }

  const tpl = templates[template]
  if (!tpl) throw new Error(`Unknown email template: "${template}"`)
  return tpl
}

// ── Handlers 
export async function notificationSendHandler(payload, ctx) {
  const { userId, email, template, data = {} } = payload

  if (!email)    throw new Error(`email is required (jobId=${ctx.jobId})`)
  if (!template) throw new Error(`template is required (jobId=${ctx.jobId})`)

  console.log(`[notification:send] jobId=${ctx.jobId} to=${email} template=${template} attempt=${ctx.attempt}`)

  const { subject, body } = buildEmail(template, data)
  const result = await sendEmail({ to: email, subject, body })

  console.log(`[notification:send] delivered jobId=${ctx.jobId} resendId=${result.id}`)
}

export async function notificationBulkHandler(payload, ctx) {
  const { users = [], template, data = {} } = payload

  if (!users.length) { console.warn(`[notification:bulk] empty users — skipping`); return }
  if (!template) throw new Error(`template is required (jobId=${ctx.jobId})`)

  console.log(`[notification:bulk] jobId=${ctx.jobId} total=${users.length} template=${template}`)

  const { subject, body } = buildEmail(template, data)
  const BATCH_SIZE = 10
  let sent = 0

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((user) =>
        sendEmail({ to: user.email, subject, body })
          .then(() => { sent++ })
          .catch((err) => console.error(`[notification:bulk] failed ${user.email}: ${err.message}`))
      )
    )
    console.log(`[notification:bulk] progress ${sent}/${users.length}`)
  }

  console.log(`[notification:bulk] done sent=${sent}/${users.length}`)
}
