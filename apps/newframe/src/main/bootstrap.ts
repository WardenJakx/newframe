import { app } from 'electron'
import path from 'node:path'

import { prepareDevelopmentProfile } from '../platform/runtime/developmentProfile.js'

process.env.BUNDLE_LOCATION =
  process.env.BUNDLE_LOCATION || path.resolve(import.meta.dirname, '../../..', 'bundle')

const appName = 'Newframe'
const devAppName = 'Newframe dev'
const isDevApp =
  process.env.FRAME_PROFILE === 'dev' ||
  Boolean((process as NodeJS.Process & { defaultApp?: boolean }).defaultApp)
const profileAppName = isDevApp ? devAppName : appName

app.setName(profileAppName)

if (isDevApp) {
  const repositoryCheckoutDirectory = path.resolve(import.meta.dirname, '../../../../..')
  const profileDirectory = await prepareDevelopmentProfile(
    app.getPath('appData'),
    repositoryCheckoutDirectory
  )
  app.setPath('userData', profileDirectory)
} else {
  app.setPath('userData', path.join(app.getPath('appData'), profileAppName))
}

await import('../app/main/index.js')
