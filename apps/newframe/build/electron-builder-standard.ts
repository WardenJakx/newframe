// build config for every platform and architecture EXCEPT linux arm64

import type { Configuration } from 'electron-builder'

import baseConfig from './electron-builder-base.ts'
import notarizeApp from './notarize.ts'

const config = {
  ...baseConfig,
  afterSign: notarizeApp,
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      },
      {
        target: 'deb',
        arch: ['x64']
      },
      {
        target: 'snap',
        arch: ['x64']
      },
      {
        target: 'tar.gz',
        arch: ['x64']
      }
    ]
  },
  mac: {
    target: {
      target: 'default',
      arch: ['x64', 'arm64']
    },
    notarize: false,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    requirements: 'build/electron-builder-requirements.txt'
  },
  win: {
    signtoolOptions: {
      publisherName: 'NewFrame Labs, Inc.'
    },
    signAndEditExecutable: true,
    icon: 'build/icons/icon.png'
  }
} satisfies Configuration

export default config
