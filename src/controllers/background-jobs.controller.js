import manager from '../services/background-jobs/index.js'
import BackgroundJob from '../models/clt_background_jobs.js'

export async function triggerJob(req, res) {
  const {
    subject,
    payload = {},
    priority = 'normal',
    meta = {},
    retries,
    delayMinutes,     // comes from request body
    delayMs,         //  raw ms if you prefer
  } = req.body

  if (!subject) {
    return res.status(400).json({ ok: false, error: 'subject is required' })
  }
  // Convert delayMinutes → ms if provided, else use raw delayMs, else 0 (immediate)
  const resolvedDelayMs = delayMinutes
    ? delayMinutes * 60 * 1000
    : (delayMs ?? 0)

  const result = await manager.trigger(subject, payload, {
    priority,
    meta,
    retries,
    delayMs: resolvedDelayMs,
  })

  return res.status(202).json({ ok: true, data: result })
}


export async function getJob(req, res) {
  const job = await BackgroundJob.findOne({ jobId: req.params.jobId }).lean()
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' })
  return res.status(200).json({ ok: true, data: job })
}


export async function retryJob(req, res) {
  const job = await BackgroundJob.findOne({ jobId: req.params.jobId })

  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' })
  if (job.status !== 'failed') {
    return res.status(400).json({ ok: false, error: `Only failed jobs can be retried. Current: ${job.status}` })
  }
  const result = await manager.trigger(job.subject, job.payload, {
    meta: { ...job.meta, retriedFrom: job.jobId },
  })
  return res.status(201).json({ ok: true, data: result })
}


export async function listJobs(req, res) {
  const { status, subject, page = 1, limit = 20 } = req.query
  const filter = {}
  if (status) filter.status = status
  if (subject) filter.subject = subject

  const [jobs, total] = await Promise.all([
    BackgroundJob.find(filter).sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(Number(limit)).lean(),
    BackgroundJob.countDocuments(filter),
  ])
  return res.status(200).json({ ok: true, data: { jobs, total, page: Number(page), limit: Number(limit) } })
}
