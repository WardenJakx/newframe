// Local preview build: an installable Newframe app built without signing/notarization.

const standardConfig = require('./electron-builder-standard.js')

const nativeArch = process.arch === 'arm64' ? 'arm64' : 'x64'

const config = {
  ...standardConfig,
  appId: 'sh.newframe.app.preview',
  productName: 'Newframe',
  afterSign: undefined,
  directories: {
    output: 'dist-preview'
  },
  linux: null,
  win: null,
  extraMetadata: {
    name: 'newframe',
    productName: 'Newframe'
  },
  mac: {
    ...standardConfig.mac,
    target: {
      target: 'default',
      arch: [nativeArch]
    },
    identity: null,
    hardenedRuntime: false,
    entitlements: undefined,
    notarize: false
  }
}

delete config.afterSign

module.exports = config
