# Background Job Worker

A dispatcher-based background job system built on Node.js, AWS EventBridge Scheduler, and MongoDB.

Trigger a job from anywhere in your app. It saves to MongoDB, schedules via AWS, runs when Scheduler fires, and rescheduled automatically on failure — all tracked in a single document per job.

```
Your app  →  trigger()  →  MongoDB (queued)  →  AWS Scheduler
                                                      ↓
                                              Lambda fires at scheduled time
                                                      ↓
                                         POST /api/lambda/jobs
                                                      ↓
                                    verifyHttp() → _process() → your handler()
                                                      ↓
                                           success → completed
                                           failure → reschedule (same document)
                                                      ↓
                                           attempts >= maxAttempts → permanent failure
```

---

## Quick start

```bash
git clone https://github.com/emilomanishm/background-job-manager
cd background-job-worker
cp  .env   
npm install
npm run dev
```

---

## Project structure

```
src/
├── lib/background-job-worker/
│   ├── background-job-manager.js    ← heart of the system — read this first
│   ├── event-bridge-dispatcher.js   ← immediate jobs via EventBridge PutEvents
│   ├── scheduler-dispatcher.js      ← delayed jobs via EventBridge Scheduler
│   └── index.js                     ← re-exports all lib classes
│
├── services/background-jobs/
│   ├── index.js                     ← wires everything: dispatcher + manager + handlers
│   ├── subjects.js                  ← all job type strings in one place
│   ├── handlers/
│   │   ├── index.js                 ← registers all handlers on the manager
│   │   ├── notification.handler.js
│   │   ├── user.handler.js
│   │   ├── post.handler.js
│   │   └── report.handler.js
│   └── failure-handlers/
│       ├── index.js                 ← registers all failure handlers
│       ├── notification.failure.js
│       └── user.failure.js
│
├── controllers/
│   └── background-jobs.controller.js
├── routes/
│   ├── background-jobs.route.js     ← REST API: trigger, list, get, retry
│   └── lambda.routes.js             ← /api/lambda/jobs — Lambda webhook entry point
├── models/
│   └── clt_background_jobs.js       ← Mongoose schema, one document per job
├── config/
│   └── database.js
├── app.js
└── server.js
```

---

## Environment variables

Copy `.env.example` to `.env`:

```env
# Server
PORT=3000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/background_jobs

# AWS — local dev only
# On Lambda, remove these entirely. SDK auto-uses the execution role.
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# EventBridge (immediate jobs)
EVENTBRIDGE_BUS_NAME=default
EVENTBRIDGE_SOURCE=app.background-jobs

# EventBridge Scheduler (delayed jobs)
AWS_LAMBDA_ARN=arn:aws:lambda:ap-south-1:ACCOUNT_ID:function:your-lambda
AWS_SCHEDULER_ROLE_ARN=arn:aws:iam::ACCOUNT_ID:role/your-scheduler-role
SCHEDULER_GROUP_NAME=default

# Webhook security
# Lambda signs the request body with this secret. Server verifies it.
LAMBDA_WEBHOOK_SECRET=your_hmac_secret_here

# Email (notification handlers)
RESEND_API_KEY=re_your_key_here
MAIL_FROM=onboarding@resend.dev

# Ops alerts (optional — logs to console if not set)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

> **On Lambda:** Do not set `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`. The Lambda execution role provides credentials automatically. Only set these locally.

---

## API endpoints

### Trigger a job

```
POST /api/v1/background-jobs/trigger
Content-Type: application/json
```

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `subject` | string | Yes | Job type — must match a registered handler |
| `payload` | object | No | Data your handler receives |
| `priority` | string | No | `low`, `normal`, `high` (default: `normal`) |
| `retries` | number | No | Max reschedule cycles. `maxAttempts = retries + 1` (default: 3) |
| `meta` | object | No | Extra info available as `ctx.meta` in your handler |
| `delayMinutes` | number | No | Fire N minutes from now via Scheduler |
| `delayMs` | number | No | Fire N milliseconds from now (ignored if `delayMinutes` is set) |

**Examples:**

```json
// Fire immediately
{
  "subject": "user:sync",
  "payload": { "userId": "usr_123" }
}
```

```json
// Fire in 30 minutes with 5 reschedule cycles
{
  "subject": "notification:send",
  "payload": {
    "email": "user@example.com",
    "template": "welcome",
    "data": { "name": "Raj" }
  },
  "delayMinutes": 30,
  "retries": 5,
  "meta": { "triggeredBy": "signup" }
}
```

**Response:**

```json
{
  "ok": true,
  "data": {
    "jobId": "a3f8c1d2-7ccd-49e2-b9f4-2c58731c96be",
    "status": "queued",
    "delayMs": 0,
    "messageId": "arn:aws:scheduler::..."
  }
}
```

### Other endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/background-jobs` | List jobs — `?status=failed&subject=user:sync&page=1&limit=20` |
| `GET` | `/api/v1/background-jobs/:jobId` | Get a single job |
| `POST` | `/api/v1/background-jobs/:jobId/retry` | Re-enqueue a failed job |
| `POST` | `/api/lambda/jobs` | Lambda webhook — called by AWS, not by your app |
| `GET` | `/health` | `{ ok: true, ts: "..." }` |

---

## Job types

All subjects are defined in `services/background-jobs/subjects.js`. Always import from there.

```js
// ✓ correct
import { SUBJECTS } from '../subjects.js'
await manager.trigger(SUBJECTS.NOTIFICATION_SEND, payload)

// ✗ fragile — string typos fail silently
await manager.trigger('notification:send', payload)
```

| Constant | Subject string | Description |
|---|---|---|
| `USER_SYNC` | `user:sync` | Sync user to external system |
| `USER_UPDATE` | `user:update` | Update user record |
| `USER_DELETE` | `user:delete` | Delete user |
| `NOTIFICATION_SEND` | `notification:send` | Send single email via Resend |
| `NOTIFICATION_BULK` | `notification:bulk` | Send batch emails in groups of 10 |
| `POST_PROCESS` | `post:process` | Process post media/content |
| `POST_ANALYZE` | `post:analyze` | Analyze post content |
| `REPORT_GENERATE` | `report:generate` | Generate a report |
| `REPORT_EXPORT` | `report:export` | Export to CSV/PDF |

---

## Writing a handler

A handler is a plain async function. Throw to fail the job. Return normally to complete it.

```js
// services/background-jobs/handlers/notification.handler.js
export async function notificationSendHandler(payload, ctx) {
  const { email, template, data = {} } = payload

  // Validate — throwing here triggers the failure handler
  if (!email)    throw new Error('email is required')
  if (!template) throw new Error('template is required')

  console.log(`[notification:send] jobId=${ctx.jobId} run=${ctx.attempts + 1}`)

  await sendEmail({ to: email, template, data })

  // Returning normally marks the job completed
}
```

### payload vs ctx

**`payload`** is your data — whatever you pass as the second argument to `trigger()`.

**`ctx`** is system data provided automatically on every run:

| Field | Description |
|---|---|
| `ctx.jobId` | Unique job ID |
| `ctx.subject` | e.g. `notification:send` |
| `ctx.meta` | Whatever you passed in `opts.meta` |
| `ctx.attempts` | Runs completed **before** this one. `0` on first run, `1` on second, etc. |

```js
// ctx.attempts lets you change behaviour on retries
async function handler(payload, ctx) {
  if (ctx.attempts === 0) {
    await fullAttempt(payload)     // first run — try everything
  } else {
    await simpleFallback(payload)  // retrying — simpler fallback
  }
}
```

### Registering handlers

```js
// services/background-jobs/handlers/index.js
export function registerHandlers(manager) {
  manager
    .handler(SUBJECTS.NOTIFICATION_SEND, notificationSendHandler, { timeout: 10_000 })
    .handler(SUBJECTS.USER_SYNC,         userSyncHandler)
    .handler(SUBJECTS.REPORT_GENERATE,   reportGenerateHandler,   { timeout: 120_000 })
    // ...
}
```

The only option that still applies is `timeout` (in ms). The `retries` option is unused since RetryManager was removed — reschedule cycles are controlled by `opts.retries` in `trigger()`.

---

## Failure handling and rescheduling

A failure handler fires when a job's handler throws. It decides whether to reschedule or give up permanently.

```js
// services/background-jobs/failure-handlers/notification.failure.js
export async function notificationFailureHandler(payload, ctx) {
  console.error(
    `[failure:notification] jobId=${ctx.jobId}` +
    ` run=${ctx.attempts}/${ctx.maxAttempts}` +
    ` error=${ctx.lastError?.message}`
  )

  // Stop when all runs are exhausted
  if (ctx.attempts >= ctx.maxAttempts) {
    console.error(`permanently failed — alerting ops`)
    // await SlackService.alert(...)
    return
  }

  // Re-dispatch the same job in 30 minutes
  const result = await ctx.reschedule(30)
  console.log(`rescheduled → run ${ctx.attempts + 1} at ${result.runAt}`)
}
```

### ctx fields in failure handlers

| Field | Type | Description |
|---|---|---|
| `ctx.jobId` | string | The failed job ID |
| `ctx.subject` | string | Job type |
| `ctx.lastError` | Error | The error thrown by the handler |
| `ctx.meta` | object | Original `opts.meta` from `trigger()` |
| `ctx.attempts` | number | Runs completed including this failed one |
| `ctx.maxAttempts` | number | Total runs allowed — stop when `attempts >= maxAttempts` |
| `ctx.reschedule(minutes?)` | function | Re-dispatches the **same job document**. Default: 60 min. |

### One document across all runs

`ctx.reschedule()` does **not** create a new MongoDB document. It resets the existing document to `queued` and re-dispatches the same `jobId`. All run history accumulates in `logs[]`.

```
Job created — maxAttempts: 4

Run 1: attempts 0→1 — fails — reschedule in 30 min
Run 2: attempts 1→2 — fails — reschedule in 30 min
Run 3: attempts 2→3 — fails — reschedule in 30 min
Run 4: attempts 3→4 — fails — ctx.attempts(4) >= ctx.maxAttempts(4) → stop

Final MongoDB document:
  status:   'failed'
  attempts: 4
  logs:     8 entries (2 per run × 4 runs)
```

---

## MongoDB schema

Collection: `clt_background_jobs`

| Field | Type | Notes |
|---|---|---|
| `jobId` | String | UUID, unique index |
| `subject` | String | Job type, indexed |
| `payload` | Mixed | Data from `trigger()` |
| `status` | String | `queued` / `processing` / `completed` / `failed` |
| `attempts` | Number | Runs done. Starts 0, increments each run. |
| `maxAttempts` | Number | `retries + 1`. Controls reschedule limit. |
| `lastError` | String | Message from last thrown Error |
| `meta` | Mixed | `opts.meta` from `trigger()` |
| `priority` | String | `low` / `normal` / `high` |
| `logs` | Array | `{ attempt, status, log, timestamp }[]` — full run history |
| `startedAt` | Date | When `_process()` last started |
| `completedAt` | Date | Set on success |
| `failedAt` | Date | Set on each failure |
| `createdAt` | Date | When `trigger()` was called |
| `updatedAt` | Date | Last update — used by idempotency guard |

---

## Webhook security

Lambda signs the raw request body with HMAC-SHA256 using `LAMBDA_WEBHOOK_SECRET` and sends it as `x-job-signature`. The server verifies it in `services/background-jobs/index.js`.

**Critical:** `app.js` captures the raw body before `express.json()` parses it:

```js
app.use(express.json())
```

If this order is changed or this middleware removed, every Lambda webhook returns 401. The HMAC is computed from raw bytes — re-serialising `req.body` via `JSON.stringify` can produce different byte sequences.

---

## Adding a new job type

Four files. Nothing else changes.

**1. Add to `subjects.js`**

```js
export const SUBJECTS = Object.freeze({
  // ... existing subjects
  EMAIL_SEND: 'email:send',
})
```

**2. Write the handler**

```js
// services/background-jobs/handlers/email.handler.js
export async function emailSendHandler(payload, ctx) {
  if (!payload.to) throw new Error('to is required')
  await EmailService.send(payload)
}
```

**3. Register in `handlers/index.js`**

```js
import { emailSendHandler } from './email.handler.js'

manager.handler(SUBJECTS.EMAIL_SEND, emailSendHandler, { timeout: 10_000 })
```

**4. Trigger it**

```js
await manager.trigger(SUBJECTS.EMAIL_SEND, {
  to:      'user@example.com',
  subject: 'Hello',
  body:    'Your message.',
})
```

---

## AWS setup

### IAM permissions

The IAM user (local) or Lambda execution role (production) needs:

```json
{
  "Effect": "Allow",
  "Action": [
    "events:PutEvents",
    "scheduler:CreateSchedule",
    "scheduler:DeleteSchedule"
  ],
  "Resource": "*"
}
```

### EventBridge rule

Create a rule on your bus targeting your Lambda function:

```json
{ "source": ["app.background-jobs"] }
```

### Lambda forwarder

Your Lambda receives the event, signs the body, and POSTs to your server:

```js
// lambda/index.js
import crypto from 'crypto'

export async function handler(event) {
  const body = JSON.stringify(event.detail ?? event)
  const sig  = crypto
    .createHmac('sha256', process.env.LAMBDA_WEBHOOK_SECRET)
    .update(body)
    .digest('hex')

  const res = await fetch(`${process.env.SERVER_URL}/api/lambda/jobs`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-job-signature': sig },
    body,
  })

  if (!res.ok) throw new Error(`Server responded ${res.status}`)
}
```

---

## Quick reference: what to change and where

| You want to... | Change this file |
|---|---|
| Add a new job type | `subjects.js` + new handler + register in `handlers/index.js` |
| Change failure behaviour | `failure-handlers/notification.failure.js` or `user.failure.js` |
| Change reschedule count | `opts.retries` in `trigger()`, or `defaultRetries` in `services/index.js` |
| Change reschedule delay | `ctx.reschedule(minutes)` argument in your failure handler |
| Change handler timeout | `{ timeout: ms }` in `manager.handler()` call |
| Swap AWS transport | Replace dispatcher in `services/background-jobs/index.js` |
| Change signature verification | `verifyHttp` function in `services/background-jobs/index.js` |
| Add a DB field | `models/clt_background_jobs.js` |

> For a complete explanation of how `background-job-manager.js` works internally,

---

