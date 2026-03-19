import 'dotenv/config'
import app from './app.js'
import { connectDatabase } from './config/database.js'

const PORT = process.env.PORT ?? 3000

connectDatabase()
  .then(() => app.listen(PORT, () => console.log(`server:http://localhost:${PORT}`)))
  .catch((err) => { console.error('[fatal]', err); process.exit(1) })
