/* export async function notificationFailureHandler(payload, ctx) {
  console.error(`[failure:notification] jobId=${ctx.jobId} — ${ctx.lastError?.message}`)

  // TODO: schedule fallback in-app notification
}
 */



// notification.failure.js
export async function notificationFailureHandler(payload, ctx) {
  console.error(
    `[failure:notification] jobId=${ctx.jobId} subject=${ctx.subject}` +
    ` run=${ctx.attempts}/${ctx.maxAttempts}` +
    ` error=${ctx.lastError?.message}`
  )

  if (ctx.attempts >= ctx.maxAttempts) {
    console.error(`[failure:notification] permanently failed`)
    return
  }

  try {
    const result = await ctx.reschedule(1)  
    console.log(`[failure:notification] rescheduled run ${ctx.attempts}/${ctx.maxAttempts} → ${result.jobId}`)
  } catch (err) {
    console.error(`[failure:notification] reschedule failed: ${err.message}`)
  }
}