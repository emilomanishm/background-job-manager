import { SUBJECTS } from '../subjects.js'
import { userSyncHandler, userUpdateHandler, userDeleteHandler } from './user.handler.js'
import { notificationSendHandler, notificationBulkHandler }     from './notification.handler.js'
import { postProcessHandler, postAnalyzeHandler }               from './post.handler.js'
import { reportGenerateHandler, reportExportHandler }           from './report.handler.js'
/**
 * Register all job handlers with the manager
 */
export function registerHandlers(manager) {
  manager
    .handler(SUBJECTS.USER_SYNC,          userSyncHandler,          { retries: 5 })
    .handler(SUBJECTS.USER_UPDATE,        userUpdateHandler,        { retries: 3 })
    .handler(SUBJECTS.USER_DELETE,        userDeleteHandler,        { retries: 2 })
    .handler(SUBJECTS.NOTIFICATION_SEND,  notificationSendHandler,  { retries: 7, timeout: 10_000 })
    .handler(SUBJECTS.NOTIFICATION_BULK,  notificationBulkHandler,  { retries: 3, timeout: 60_000 })
    .handler(SUBJECTS.POST_PROCESS,       postProcessHandler,       { retries: 4, timeout: 45_000 })
    .handler(SUBJECTS.POST_ANALYZE,       postAnalyzeHandler,       { retries: 3 })
    .handler(SUBJECTS.REPORT_GENERATE,    reportGenerateHandler,    { retries: 3, timeout: 120_000 })
    .handler(SUBJECTS.REPORT_EXPORT,      reportExportHandler,      { retries: 2, timeout:  60_000 })
}
