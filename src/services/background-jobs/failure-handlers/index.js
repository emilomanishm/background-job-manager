import { SUBJECTS } from '../subjects.js'
import { userFailureHandler } from './user.failure.js'
import { notificationFailureHandler } from './notification.failure.js'

/**
 * ctx available in every failure handler:
 *   ctx.jobId       — failed job ID
 *   ctx.subject     — job type
 *   ctx.lastError   — Error from the failed run
 *   ctx.meta        — original job meta
 *   ctx.attempts    — how many runs done so far (including this failed one)
 *   ctx.maxAttempts — stop rescheduling when attempts >= maxAttempts
 *   ctx.reschedule  — async (delayMinutes?) => { jobId, runAt, ... }
 */
export function registerFailureHandlers(manager) {
  manager
    .onFailure(SUBJECTS.USER_SYNC, userFailureHandler)
    .onFailure(SUBJECTS.USER_UPDATE, userFailureHandler)
    .onFailure(SUBJECTS.USER_DELETE, userFailureHandler)
    .onFailure(SUBJECTS.NOTIFICATION_SEND, notificationFailureHandler)
    .onFailure(SUBJECTS.NOTIFICATION_BULK, notificationFailureHandler)

   
    // Global fallback — fires for any subject not listed above
    .onFailure(async (payload, ctx) => {
      console.error(
        `[failure:global] jobId=${ctx.jobId} subject=${ctx.subject}` +
        ` run=${ctx.attempts}/${ctx.maxAttempts}` +
        ` error=${ctx.lastError?.message}`
      )

      if (ctx.attempts >= ctx.maxAttempts) {
        console.error(`[failure:global] jobId=${ctx.jobId} permanently failed`)
        return
      }

      try {
        const result = await ctx.reschedule(60)
        console.log(`[failure:global] rescheduled run ${ctx.attempts}/${ctx.maxAttempts} → ${result.jobId}`)
      } catch (err) {
        console.error(`[failure:global] reschedule failed: ${err.message}`)
      }
    })
}