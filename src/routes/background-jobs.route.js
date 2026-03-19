import { Router }    from 'express'
import * as ctrl     from '../controllers/background-jobs.controller.js'

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next)

const router = Router()

router.get('/',              wrap(ctrl.listJobs))
router.post('/trigger',      wrap(ctrl.triggerJob))
router.get('/:jobId',        wrap(ctrl.getJob))
router.post('/:jobId/retry', wrap(ctrl.retryJob))

export default router
