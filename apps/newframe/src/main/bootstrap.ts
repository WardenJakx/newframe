import { app } from 'electron'
import path from 'node:path'

process.env.BUNDLE_LOCATION =
  process.env.BUNDLE_LOCATION || path.resolve(import.meta.dirname, '../../..', 'bundle')

const appName = 'Newframe'
const devAppName = 'Newframe dev'
const isDevApp =
  process.env.FRAME_PROFILE === 'dev' ||
  Boolean((process as NodeJS.Process & { defaultApp?: boolean }).defaultApp)
const profileAppName = isDevApp ? devAppName : appName

app.setName(profileAppName)
app.setPath('userData', path.join(app.getPath('appData'), profileAppName))

await import('../app/main/index.js')
