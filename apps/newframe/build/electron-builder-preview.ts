// Local preview build: an installable Newframe app built without signing/notarization, for the host platform.

import type { Configuration } from 'electron-builder'

import standardConfig from './electron-builder-standard.ts'

const nativeArch = process.arch === 'arm64' ? 'arm64' : 'x64'

const config = {
  ...standardConfig,
  appId: 'sh.newframe.app.preview',
  productName: 'Newframe',
  afterSign: null,
  directories: {
    output: 'dist-preview'
  },
  // A deb installs an AppArmor profile, so Chromium's sandbox works on Ubuntu 24.04+.
  linux: {
    target: {
      target: 'deb',
      arch: [nativeArch]
    }
  },
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
} satisfies Configuration

export default config
