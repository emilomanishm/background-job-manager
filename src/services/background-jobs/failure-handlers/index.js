import { SUBJECTS } from '../subjects.js'
import { userFailureHandler } from './user.failure.js'
import { notificationFailureHandler } from './notification.failure.js'

/**
 * Register failure handlers with the manager
 */
export function registerFailureHandlers(manager) {
  manager
    .onFailure(SUBJECTS.USER_SYNC, userFailureHandler)
    .onFailure(SUBJECTS.USER_UPDATE, userFailureHandler)
    .onFailure(SUBJECTS.USER_DELETE, userFailureHandler)
    .onFailure(SUBJECTS.NOTIFICATION_SEND, notificationFailureHandler)
    .onFailure(SUBJECTS.NOTIFICATION_BULK, notificationFailureHandler)

    // global fallback for any subject without a specific failure handler
    .onFailure(async (payload, ctx) => {
      console.error(`[failure:global] jobId=${ctx.jobId} subject=${ctx.subject}`)
    })
}
