// Unsigned MVP release build: Apple Silicon DMG only.

import type { Configuration } from 'electron-builder'

import baseConfig from './electron-builder-base.ts'

const config = {
  ...baseConfig,
  artifactName: 'Newframe-Desktop-${version}-macOS-${arch}.${ext}',
  directories: {
    output: 'dist-release'
  },
  publish: null,
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['arm64']
      }
    ],
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
    notarize: false
  }
} satisfies Configuration

export default config
