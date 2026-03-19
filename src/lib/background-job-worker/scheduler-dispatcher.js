
import { SchedulerClient, CreateScheduleCommand } from '@aws-sdk/client-scheduler'

  /**
   * @param {Object} [config]
   * @param {string} config.region
   * @param {string} config.accessKeyId
   * @param {string} config.secretAccessKey
   * @param {string} config.lambdaArn
   * @param {string} config.roleArn
   * @param {string} [config.group='default']
   * @param {number} [config.delayMs=60000]
   */
export default class SchedulerDispatcher {
  constructor({ region, accessKeyId, secretAccessKey, lambdaArn, roleArn, group = 'default', delayMs = 60_000 } = {}) {
    this.client = new SchedulerClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })
    this.lambdaArn = lambdaArn
    this.roleArn = roleArn
    this.group = group
    this.delayMs = delayMs
  }

  /**
 * Schedule a job
 * @param {Object} job
 * @param {string} job.jobId
 * @param {string} job.platform
 * @param {string} job.subject
 * @param {Object} job.payload
 * @param {number} [job.delayMs]
 * @returns {Promise<{ messageId: string, runAt: Date }>}
 */
  async trigger({ jobId, subject, payload, delayMs, platform }) {
    const runAt = new Date(Date.now() + (delayMs || this.delayMs))
    const expression = `at(${runAt.toISOString().replace(/\.\d{3}Z$/, '')})`

    const result = await this.client.send(new CreateScheduleCommand({
      Name: jobId,
      GroupName: this.group,
      ScheduleExpression: expression,
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: {
        Arn: this.lambdaArn,
        RoleArn: this.roleArn,
        Input: JSON.stringify({ jobId, subject, payload, platform }),
      },
      ActionAfterCompletion: 'DELETE',
    }))

    return { messageId: result.ScheduleArn, runAt }
  }
}
