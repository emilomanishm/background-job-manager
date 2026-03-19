
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge'


/**
  * @param {Object} [config]
  * @param {string} config.region
  * @param {string} config.accessKeyId
  * @param {string} config.secretAccessKey
  * @param {string} config.busName
  * @param {string} config.source
  */
export default class EventBridgeDispatcher {
  constructor({ region, accessKeyId, secretAccessKey, busName, source } = {}) {
    this.client = new EventBridgeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })
    this.busName = busName
    this.source = source
  }

  async trigger({ jobId, subject, payload }) {
    const result = await this.client.send(new PutEventsCommand({
      Entries: [{
        EventBusName: this.busName,
        Source: this.source,
        DetailType: subject,
        Detail: JSON.stringify({ jobId, subject, payload }),
      }],
    }))

    const entry = result.Entries?.[0]
    if (entry?.ErrorCode) throw new Error(`EventBridge error: ${entry.ErrorMessage}`)
    return { messageId: entry.EventId }
  }
}
