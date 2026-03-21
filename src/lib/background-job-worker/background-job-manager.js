import { v4 as uuid } from 'uuid'

/** @import { TriggerOptions, TriggerResult, BackgroundJobModel, BackgroundJobManagerOptions, BackgroundJobHandlerContext, BackgroundJobHandlerOpts, BackgroundJobFailureCallbackContext, DispatchPayload, BackgroundJobHttpVerifierFn } from './types.d.ts' */

const INCREMENTAL_DELAYS = [1, 2, 3, 4, 5]

function getDelay(attempts) {
  const index = Math.min(attempts - 1, INCREMENTAL_DELAYS.length - 1)
  return INCREMENTAL_DELAYS[index]
}

/**
 * @param {Object}                             params
 * @param {import('./types.d.ts').BackgroundJobDispatcher} params.dispatcher
 * @param {BackgroundJobModel}                 params.model
 * @param {string}                             [params.platform]
 * @param {BackgroundJobManagerOptions}        [params.options]
 */
export default class BackgroundJobManager {

  /** @type {Map<string, { callback: (payload: unknown, ctx: BackgroundJobHandlerContext) => void | Promise<void>, opts: BackgroundJobHandlerOpts }>} */
  #handlers = new Map()

  /** @type {Map<string, (payload: unknown, ctx: BackgroundJobFailureCallbackContext) => void | Promise<void>>} */
  #failureHandlers = new Map()

  constructor({ dispatcher, model, platform, options = {} }) {
    if (!dispatcher) throw new Error('BackgroundJobManager: dispatcher is required')
    if (!model) throw new Error('BackgroundJobManager: model is required')

    this.dispatcher = dispatcher
    this.model = model
    this.platform = platform ?? 'local'

    /** @type {Required<BackgroundJobManagerOptions> & { verifyHttp: BackgroundJobHttpVerifierFn | null }} */
    this.options = {
      defaultRetries: options.defaultRetries ?? 3,
      timeout: options.timeout ?? 30_000,
      verifyHttp: options.verifyHttp ?? null,
    }
  }

  /**
   * Create a job document in MongoDB and dispatch it.
   *
   * @param {string}         subject
   * @param {unknown}        [payload={}]
   * @param {TriggerOptions} [opts={}]
   * @returns {Promise<TriggerResult>}
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
      lastError: null,
    })

    /** @type {DispatchPayload} */
    const dispatchPayload = { jobId, subject, payload, platform: this.platform, delayMs }
    const result = await this.dispatcher.trigger(dispatchPayload)

    return { jobId, status: 'queued', delayMs, ...result }
  }

  /**
   * @param {string} subject
   * @param {(payload: unknown, ctx: BackgroundJobHandlerContext) => void | Promise<void>} callback
   *   ctx.jobId     — job ID
   *   ctx.subject   — subject string
   *   ctx.meta      — job meta object
   *   ctx.attempts  — runs completed BEFORE this one (0 on first run)
   * @param {BackgroundJobHandlerOpts} [opts={}]
   * @returns {this}
   */
  handler(subject, callback, opts = {}) {
    if (typeof callback !== 'function') {
      throw new Error(`handler for "${subject}" must be a function`)
    }
    this.#handlers.set(subject, { callback, opts })
    return this
  }

  /**
   * @param {string | ((payload: unknown, ctx: BackgroundJobFailureCallbackContext) => void | Promise<void>)} subjectOrCallback
   * @param {(payload: unknown, ctx: BackgroundJobFailureCallbackContext) => void | Promise<void>} [callback]
   *   ctx.jobId       — job ID
   *   ctx.subject     — subject string
   *   ctx.lastError   — the Error thrown by the handler
   *   ctx.meta        — job meta object
   *   ctx.attempts    — runs done INCLUDING this failed one
   *   ctx.maxAttempts — total runs allowed (retries + 1)
   *   ctx.reschedule  — async (delayMinutes?) => re-dispatches SAME job document
   * @returns {this}
   */
  onFailure(subjectOrCallback, callback) {
    if (typeof subjectOrCallback === 'function') {
      this.#failureHandlers.set('*', subjectOrCallback)
    } else {
      this.#failureHandlers.set(subjectOrCallback, callback)
    }
    return this
  }

  /**
   * @returns {(req: import('express').Request, res: import('express').Response) => Promise<void>}
   */
  middleware() {
    return async (req, res) => {
      if (!this.options.verifyHttp) {
        return res.status(401).json({ ok: false, error: 'No verifyHttp function configured' })
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
      setImmediate(() => this.#process(jobId, subject, payload))
    }
  }

  /**
   * Core processing loop — runs on every Lambda invocation.
   *
   * @param {string}  jobId
   * @param {string}  subject
   * @param {unknown} payload
   */
  async #process(jobId, subject, payload) {
    const job = await this.model.findOne({ jobId })
    if (!job) return
    if (job.status === 'completed') return
    if (job.status === 'processing') {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
      if (job.updatedAt > tenMinutesAgo) return
    }

    const entry = this.#handlers.get(subject)
    if (!entry) {
      await this.#update(jobId, {
        status: 'failed',
        failedAt: new Date(),
        lastError: `No handler registered for subject: ${subject}`,
        $push: { logs: { attempt: 0, status: 'failed', log: `No handler for: ${subject}`, timestamp: new Date() } },
      })
      return
    }

    const { callback, opts } = entry
    const previousAttempts = job.attempts ?? 0
    const runNumber = previousAttempts + 1

    await this.#update(jobId, {
      status: 'processing',
      startedAt: new Date(),
      attempts: runNumber,
      $push: { logs: { attempt: runNumber, status: 'processing', log: `Run ${runNumber} started`, timestamp: new Date() } },
    })

    const timeout = opts.timeout ?? this.options.timeout
    try {
      await this.#withTimeout(
        callback(payload, { jobId, subject, meta: job.meta, attempts: previousAttempts }),
        timeout,
        jobId
      )
      await this.#update(jobId, {
        status: 'completed',
        completedAt: new Date(),
        lastError: null,
        $push: { logs: { attempt: runNumber, status: 'completed', log: `Run ${runNumber} completed`, timestamp: new Date() } },
      })

    } catch (err) {
      await this.#update(jobId, {
        status: 'failed',
        failedAt: new Date(),
        lastError: err.message,
        $push: { logs: { attempt: runNumber, status: 'failed', log: `Run ${runNumber} failed: ${err.message}`, timestamp: new Date() } },
      })

      /** @type {BackgroundJobFailureCallbackContext} */
      const ctx = {
        jobId,
        subject,
        lastError: err,
        meta: job.meta,
        attempts: runNumber,
        maxAttempts: job.maxAttempts,

        reschedule: async (delayMinutes = 60) => {
          const delayMs = Math.round(delayMinutes * 60 * 1000)
          await this.#update(jobId, { status: 'queued', lastError: null, failedAt: null })
          const result = await this.dispatcher.trigger({
            jobId, subject, payload, platform: this.platform, delayMs,
          })
          return { jobId, ...result, delayMs }
        },
      }

      await this.#runFailure(subject, payload, ctx)
    }
  }

  /**
   * Look up and call the failure handler for this subject.
   * Falls back to global '*' handler, then to built-in incremental reschedule.
   *
   * @param {string}                            subject
   * @param {unknown}                           payload
   * @param {BackgroundJobFailureCallbackContext} ctx
   */
  async #runFailure(subject, payload, ctx) {
    const fn = this.#failureHandlers.get(subject) ?? this.#failureHandlers.get('*')

    if (fn) {
      try { await fn(payload, ctx) } catch (_) { }
      return
    }
    // No handler registered — built-in incremental reschedule
    if (ctx.attempts >= ctx.maxAttempts) return
    try { await ctx.reschedule(getDelay(ctx.attempts)) } catch (_) { }
  }

  /**
   * Write fields to the job document.
   * Separates $push from $set — Mongoose requires them as sibling operators.
   *
   * @param {string} jobId
   * @param {Record<string, unknown> & { $push?: Record<string, unknown> }} fields
   */
  #update(jobId, fields) {
    const { $push, ...rest } = fields
    const update = {}
    if (Object.keys(rest).length > 0) update.$set = { ...rest, updatedAt: new Date() }
    if ($push) update.$push = $push
    return this.model.findOneAndUpdate({ jobId }, update, { new: true })
  }

  /**
   * Wrap a promise with a timeout.
   *
   * @param {Promise<unknown>} promise
   * @param {number}           ms
   * @param {string}           jobId
   * @returns {Promise<unknown>}
   */
  #withTimeout(promise, ms, jobId) {
    if (!ms) return promise
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`Job ${jobId} timed out after ${ms}ms`)),
        ms
      )
      promise
        .then((v) => { clearTimeout(t); resolve(v) })
        .catch((e) => { clearTimeout(t); reject(e) })
    })
  }
}