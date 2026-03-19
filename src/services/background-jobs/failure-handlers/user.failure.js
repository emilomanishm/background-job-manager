export async function userFailureHandler(payload, ctx) {
  console.error(`[failure:user] jobId=${ctx.jobId} — ${ctx.lastError?.message}`)
  
  // TODO: flag user for manual review, alert ops
}
