// build config for linux arm64

import type { Configuration } from 'electron-builder'

import baseConfig from './electron-builder-base.ts'

const config = {
  ...baseConfig,
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['arm64']
      },
      {
        target: 'tar.gz',
        arch: ['arm64']
      }
    ]
  }
} satisfies Configuration

export default config
