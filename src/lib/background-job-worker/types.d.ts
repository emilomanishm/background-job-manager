import type { Model } from "mongoose"
import type { Request, Response } from "express"

export type DateString = string

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'retrying'
export type JobPriority = 'low' | 'normal' | 'high'

export interface TriggerOptions {
    delayMinutes?: number
    delayMs?: number
    retries: number
    meta?: any
}

export interface TriggerResult {
    jobId: string
    status: string
    delayMs: number
    messageId: string
    runAt: DateString
}

export interface BackgroundJobLogSchema {
    attempt: number
    log: string
    status: JobStatus
    timestamp: Date
}

export interface BackgroundJobSchema {
    jobId: string
    subject: string
    platform?: string
    payload: any
    status: JobStatus
    priority: JobPriority
    attempts: number
    maxAttempts: number
    lastError?: string | null
    meta: TMeta
    completedAt?: Date
    startedAt?: Date
    failedAt?: Date
    logs: BackgroundJobLogModel[]
}

export type BackgroundJobModel = Model<BackgroundJob>


export abstract class BackgroundJobDispatcher {
    abstract trigger(subject: string, payload: any, opts: TriggerOptions): Promise<TriggerResult>

}

type BackgroundJobHttpVerifierFn = (req: Request, res: Response) => Promise<boolean>

export interface BackgroundJobOpts {
    defaultRetires?: number
    timeout?: number
    verifyHttp: BackgroundJobHttpVerifierFn
}

export interface BackgroundJobManagerConfig {
    dispatcher: BackgroundJobDispatcher
    model: BackgroundJobModel
    platform: string
    options: BackgroundJobOpts
}

export interface BackgroundJobHandlerContext {
    jobId: string
    subject: string
    meta: object
    attempts: number
}

export interface BackgroundJobHandlerOpts {
    timeout: number
    retryDelayMs: number
    maxRetries: number
}

export interface BackgroundJobFailureCallbackContext {
    jobId: string
    subject: string
    lastError: string
    meta?: object
    attempts: number
    maxAttempts: number
}

