export async function reportGenerateHandler(payload, ctx) {
  console.log(`[report:generate] jobId=${ctx.jobId} type=${payload.reportType}`)
}

export async function reportExportHandler(payload, ctx) {
  console.log(`[report:export] jobId=${ctx.jobId} reportId=${payload.reportId} format=${payload.format}`)
}
