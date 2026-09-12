import { installExtension, REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer'
import log from 'electron-log'

export default async function installElectronDevToolExtensions() {
  try {
    await installExtension([REACT_DEVELOPER_TOOLS], {
      forceDownload: false,
      loadExtensionOptions: { allowFileAccess: true }
    })

    log.info('Successfully installed devtools extensions')
  } catch (err) {
    log.warn('Could not install devtools extensions', err)
  }
}
