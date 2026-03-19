import express from 'express'
import jobsRouter from './routes/background-jobs.route.js'
import lambdaRouter from './routes/lambda.routes.js'

const app = express()
app.use(express.json())

app.use('/api/v1/background-jobs', jobsRouter)
app.use('/api/lambda', lambdaRouter)
app.get('/health', (_req, res) => res.json({ ok: true }))

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ ok: false, error: err.message })
})

export default app
