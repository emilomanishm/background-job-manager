export async function userSyncHandler(payload, ctx) {
  // TODO: sync user to external system
  console.log(`[user:sync] jobId=${ctx.jobId} userId=${payload.userId} attempt=${ctx.attempt}`)
}

export async function userUpdateHandler(payload, ctx) {
  // TODO: apply field updates
  console.log(`[user:update] jobId=${ctx.jobId} userId=${payload.userId}`)
}

export async function userDeleteHandler(payload, ctx) {
  // TODO: soft-delete, revoke tokens
  console.log(`[user:delete] jobId=${ctx.jobId} userId=${payload.userId}`)
}
