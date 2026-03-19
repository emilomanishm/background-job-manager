const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
  * @param {Object} [opts]
  * @param {number} [opts.retries=3]
  * @param {number|function(number):number} [opts.retryDelay=2000]
  * @param {number} [opts.timeout=30000]
  */
export default class RetryManager {
  constructor({ retries = 3, retryDelay = 2_000, timeout = 30_000 } = {}) {
    this.maxAttempts = retries + 1
    this.retryDelay = retryDelay   // number or fn(attempt) => ms
    this.timeout = timeout
  }

  async run(fn, { onAttempt, onRetry } = {}) {
    let lastError

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      onAttempt?.(attempt)
      try {
        return await this.withTimeout(fn(attempt), attempt)
      } catch (err) {
        lastError = err
        if (attempt < this.maxAttempts) {
          const delay = typeof this.retryDelay === 'function'
            ? this.retryDelay(attempt)
            : this.retryDelay * attempt
          onRetry?.(attempt, err, delay)
          await sleep(delay)
        }
      }
    }

    throw lastError
  }

  withTimeout(promise, attempt) {
    if (!this.timeout) return promise
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`Attempt ${attempt} timed out after ${this.timeout}ms`)),
        this.timeout
      )
      promise.then((v) => { clearTimeout(t); resolve(v) })
        .catch((e) => { clearTimeout(t); reject(e) })
    })
  }
}
