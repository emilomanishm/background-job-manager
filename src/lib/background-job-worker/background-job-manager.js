import crypto from 'crypto'
import { v4 as uuid } from 'uuid'
import RetryManager from './retry-manager.js'

/**
 * BackgroundJobManager
 * Core class.
 * Usage:
 * new BackgroundJobManager({ dispatcher: new SchedulerDispatcher({ delayMs: 60_000 }), model })
 * new BackgroundJobManager({ dispatcher: new EventBridgeDispatcher(), model })
 */

/**
 * @constructor
 * @param {Object} params
 * @param {Object} params.dispatcher - Transport layer ( Scheduler,EventBridge etc.)
 * @param {Object} params.model - Database model for job persistence
 * @param {string} params.platform - Database model for job persistence
 * @param {Object} [params.options]
 * @param {number} [params.options.defaultRetries=3]
 * @param {(req: import('express').Request) => Promise<boolean>} [params.options.verifyHttp]
 * @param {number} [params.options.retryDelay=2000]
 * @param {number} [params.options.timeout=30000]
 * @param {string|null} [params.options.secret]
 */
export default class BackgroundJobManager {
  constructor({ dispatcher, model, platform, options = {} }) {
    this.dispatcher = dispatcher
    this.model = model
    this.platform = platform ?? 'local'
    this.options = {
      defaultRetries: options.defaultRetries ?? 3,
      retryDelay: options.retryDelay ?? 2_000,
      timeout: options.timeout ?? 30_000,
      secret: options.secret ?? process.env.LAMBDA_WEBHOOK_SECRET ?? null,
      verifyHttp: options.verifyHttp ?? null,
    }
    //this.delayMs = options.delayMs ?? 60_000
    this.handlers = new Map()  // subject → { callback, options }
    this.failureHandlers = new Map()  // subject → callback | '*' → global
  }


  /**
 * @param {string} subject - Unique job subject (used to match a handler)
 * @param {Object} [payload={}] - Data passed to the job handler
 * @param {Object} [opts={}] 
 * @param {number} [opts.retries] - Number of retry attempts
 * @param {string} [opts.priority='normal'] - Job priority level
 * @param {Object} [opts.meta] - Additional metadata stored with the job
 * @param {number} [opts.delayMs]
 */

  async trigger(subject, payload = {}, opts = {}) {
    if (!subject) throw new Error('subject is required')

    const delayMs = opts.delayMinutes
      ? Math.round(opts.delayMinutes * 60 * 1000)
      : (opts.delayMs ?? 0)

    const jobId = uuid()

    await this.model.create({
      jobId,
      subject,
      payload,
      status: 'queued',
      attempts: 0,
      maxAttempts: (opts.retries ?? this.options.defaultRetries) + 1,
      priority: opts.priority ?? 'normal',
      meta: opts.meta ?? {},
    })

    const result = await this.dispatcher.trigger({
      jobId,
      subject,
      payload,
      platform: this.platform,
      delayMs,
    })

    return { jobId, status: 'queued', delayMs, ...result }
  }

  handler(subject, callback, opts = {}) {
    this.handlers.set(subject, { callback, opts })
    return this   // chainable
  }


  onFailure(subjectOrCallback, callback) {
    if (typeof subjectOrCallback === 'function') {
      this.failureHandlers.set('*', subjectOrCallback)
    } else {
      this.failureHandlers.set(subjectOrCallback, callback)
    }
    return this
  }

  middleware() {
    return async (req, res) => {
      if (!this.options.verifyHttp) {
        return res.status(401).json({ ok: false, error: 'no http verify function is there' })
      }

      const isVerified = await this.options.verifyHttp(req)

      if (!isVerified) {
        return res.status(401).json({ ok: false, error: 'Invalid signature' })
      }

      const { jobId, subject, payload } = req.body ?? {}
      if (!jobId || !subject) {
        return res.status(400).json({ ok: false, error: 'Missing jobId or subject' })
      }

      res.status(200).json({ ok: true, jobId })
      setImmediate(() => this._process(jobId, subject, payload))
    }
  }

  // Private 
  async _process(jobId, subject, payload) {
    const entry = this.handlers.get(subject)

    if (!entry) {
      await this._update(jobId, { status: 'failed', lastError: `No handler for: ${subject}` })
      return
    }

    const { callback, opts } = entry
    const job = await this.model.findOne({ jobId })
    if (!job) return


    await this._update(jobId, { status: 'processing' })

    const retry = new RetryManager({
      retries: opts.retries ?? this.options.defaultRetries,
      retryDelay: opts.retryDelay ?? this.options.retryDelay,
      timeout: opts.timeout ?? this.options.timeout,
    })

    try {
      await retry.run(
        (attempt) => callback(payload, { jobId, subject, attempt, meta: job.meta }),
        {
          onAttempt: (attempt) => {
            this.model.findOneAndUpdate({ jobId }, { attempts: attempt }).catch(() => { })
          },
          onRetry: (_attempt, err) => {
            this._update(jobId, { status: 'retrying', lastError: err.message }).catch(() => { })
          },
        }
      )

      await this._update(jobId, { status: 'completed', completedAt: new Date(), lastError: null })

    } catch (err) {
      await this._update(jobId, { status: 'failed', lastError: err.message })
      await this._runFailure(subject, payload, { jobId, subject, lastError: err, meta: job.meta })
    }
  }

  async _runFailure(subject, payload, ctx) {
    const fn = this.failureHandlers.get(subject) ?? this.failureHandlers.get('*')
    if (!fn) return
    try { await fn(payload, ctx) } catch (_) { }
  }

  _update(jobId, fields) {
    return this.model.findOneAndUpdate({ jobId }, { ...fields, updatedAt: new Date() })
  }

  _verify(rawBody, signature) {
    if (!signature) return false
    const expected = crypto.createHmac('sha256', this.options.secret).update(rawBody).digest('hex')
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
    } catch { return false }
  }
}
