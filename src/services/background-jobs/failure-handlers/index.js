/* const INCREMENTAL_DELAYS = [1, 2, 3, 4, 5];

function getDelay(attempts) {
  const index = Math.min(attempts - 1, INCREMENTAL_DELAYS.length - 1);
  return INCREMENTAL_DELAYS[index];
}

export function registerFailureHandlers(manager) {
  manager.onFailure(async (payload, ctx) => {
    // Stop if permanently failed
    if (ctx.attempts >= ctx.maxAttempts) {
      return;
    }

    // Reschedule
    const delayMinutes = getDelay(ctx.attempts);

    try {
      await ctx.reschedule(delayMinutes);
    }
  });
} */