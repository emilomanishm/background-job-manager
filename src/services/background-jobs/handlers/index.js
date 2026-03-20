import { SUBJECTS } from '../subjects.js'
import { userSyncHandler, userUpdateHandler, userDeleteHandler } from './user.handler.js'
import { notificationSendHandler, notificationBulkHandler }     from './notification.handler.js'
import { postProcessHandler, postAnalyzeHandler }               from './post.handler.js'
import { reportGenerateHandler, reportExportHandler }           from './report.handler.js'

export function registerHandlers(manager) {
manager
  .handler(SUBJECTS.USER_SYNC,         userSyncHandler)
  .handler(SUBJECTS.USER_UPDATE,       userUpdateHandler)
  .handler(SUBJECTS.USER_DELETE,       userDeleteHandler)
  .handler(SUBJECTS.NOTIFICATION_SEND, notificationSendHandler, { timeout: 10_000 })
  .handler(SUBJECTS.NOTIFICATION_BULK, notificationBulkHandler, { timeout: 60_000 })
  .handler(SUBJECTS.POST_PROCESS,      postProcessHandler,      { timeout: 45_000 })
  .handler(SUBJECTS.POST_ANALYZE,      postAnalyzeHandler)
  .handler(SUBJECTS.REPORT_GENERATE,   reportGenerateHandler,   { timeout: 120_000 })
  .handler(SUBJECTS.REPORT_EXPORT,     reportExportHandler,     { timeout:  60_000 })
}
