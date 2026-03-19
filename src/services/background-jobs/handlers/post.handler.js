export async function postProcessHandler(payload, ctx) {
  console.log(`[post:process] jobId=${ctx.jobId} postId=${payload.postId}`)
}

export async function postAnalyzeHandler(payload, ctx) {
  console.log(`[post:analyze] jobId=${ctx.jobId} postId=${payload.postId}`)
}
