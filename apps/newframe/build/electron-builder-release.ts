// Signed and notarized desktop release: Apple Silicon DMG only.

import type { Configuration } from 'electron-builder'

import baseConfig from './electron-builder-base.ts'

const config = {
  ...baseConfig,
  artifactName: 'Newframe-Desktop-${version}-macOS-${arch}.${ext}',
  forceCodeSigning: true,
  directories: {
    output: 'dist-release'
  },
  publish: null,
  dmg: {
    sign: true
  },
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['arm64']
      }
    ],
    type: 'distribution',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.release.mac.plist',
    entitlementsInherit: 'build/entitlements.release.mac.plist',
    extendInfo: {
      NSCameraUsageDescription:
        'Newframe scans public account and signed response QR codes from AirGap Vault.'
    },
    notarize: true
  }
} satisfies Configuration

export default config
