
import BackgroundJobManager from '../../lib/background-job-worker/background-job-manager.js'
//import EventBridgeDispatcher from '../../lib/background-job-worker/event-bridge-dispatcher.js'
import SchedulerDispatcher from '../../lib/background-job-worker/scheduler-dispatcher.js'

import BackgroundJob from '../../models/clt_background_jobs.js'
import { registerHandlers } from './handlers/index.js'
import { registerFailureHandlers } from './failure-handlers/index.js'

/**
 * Initialized BackgroundJobManager with dispatcher, model, and handlers
 */
const manager = new BackgroundJobManager({
  dispatcher: new SchedulerDispatcher({
    region: 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    lambdaArn: process.env.AWS_LAMBDA_ARN,
    roleArn: process.env.AWS_SCHEDULER_ROLE_ARN,
    group: 'default',
    delayMs: 60_000,
  }),

  platform: 'emilo',
  model: BackgroundJob,
  options: {
    secret: process.env.LAMBDA_WEBHOOK_SECRET, // e.g. 'secret'
    verifyHttp: async (req) => {
      const token = req.headers['x-event-secret']
      if (!token || !process.env.LAMBDA_WEBHOOK_SECRET) return false // Prevent undefined === undefined bug
      return token === process.env.LAMBDA_WEBHOOK_SECRET
    }
  }
})

registerHandlers(manager)
registerFailureHandlers(manager)

export default manager
