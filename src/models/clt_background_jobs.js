import mongoose from 'mongoose'

const log = new mongoose.Schema({
    attempt: Number,
    log: String,
    status: { type: String, enum: ['queued', 'processing', 'completed', 'failed', 'retrying'], default: 'queued', index: true },
    timestamp: Date,
}, { _id: false })

const schema = new mongoose.Schema(
    {
        jobId: { type: String, required: true, unique: true, index: true },
        subject: { type: String, required: true, index: true },
        platform: { type: String, index: true },
        payload: { type: mongoose.Schema.Types.Mixed, default: {} },
        status: { type: String, enum: ['queued', 'processing', 'completed', 'failed', 'retrying'], default: 'queued', index: true },
        priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
        attempts: { type: Number, default: 0 },
        maxAttempts: { type: Number, default: 4 },
        lastError: { type: String, default: null },
        meta: { type: mongoose.Schema.Types.Mixed, default: {} },
        completedAt: { type: Date },
        startedAt: { type: Date },
        failedAt: { type: Date },
        logs: [log],
    },
    { timestamps: true, collection: 'clt_background_jobs' }
)

schema.index({ status: 1, createdAt: -1 })
schema.index({ subject: 1, status: 1 });

export default mongoose.models.BackgroundJob ?? mongoose.model('BackgroundJob', schema)


