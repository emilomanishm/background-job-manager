import { Router } from 'express'
import manager    from '../services/background-jobs/index.js'

const router = Router()
// Lambda POSTs here after EventBridge fires

router.post('/jobs', manager.middleware())


export default router
