import path from 'node:path'

import { app } from 'electron'

import { prepareDevelopmentProfile } from '../platform/runtime/developmentProfile.ts'
import { isVisualHarness } from '../platform/runtime/visualHarness.ts'

process.env.BUNDLE_LOCATION =
  process.env.BUNDLE_LOCATION || path.resolve(import.meta.dirname, '../../..', 'bundle')

const appName = 'Newframe'
const devAppName = 'Newframe dev'
const isDevApp =
  process.env.FRAME_PROFILE === 'dev' ||
  Boolean((process as NodeJS.Process & { defaultApp?: boolean }).defaultApp)
const profileAppName = isDevApp ? devAppName : appName

app.setName(profileAppName)

if (isVisualHarness) {
  // The harness owns a throwaway profile copy and must stay out of the Dock, app switcher, and Keychain.
  const profileDirectory = process.env.NEWFRAME_HARNESS_PROFILE_DIR
  if (!profileDirectory || !path.isAbsolute(profileDirectory)) {
    throw new Error('Visual harness requires an absolute NEWFRAME_HARNESS_PROFILE_DIR')
  }
  app.setPath('userData', profileDirectory)
  app.setActivationPolicy('prohibited')
  app.commandLine.appendSwitch('use-mock-keychain')
} else if (isDevApp) {
  const repositoryCheckoutDirectory = path.resolve(import.meta.dirname, '../../../../..')
  const profileDirectory = await prepareDevelopmentProfile(
    app.getPath('appData'),
    repositoryCheckoutDirectory
  )
  app.setPath('userData', profileDirectory)
} else {
  app.setPath('userData', path.join(app.getPath('appData'), profileAppName))
}

await import('../app/main/index.ts')
