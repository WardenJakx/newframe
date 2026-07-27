import { defineConfig } from '@pandacss/dev'

import { newframePreset } from '../../packages/ui/panda.preset.js'

export default defineConfig({
  include: ['./renderer/**/*.tsx', './renderer/shared/ui/**/*.tsx'],
  exclude: [
    './renderer/**/*.{test,spec}.tsx',
    './renderer/**/*.test-support.tsx',
    './renderer/**/*.test-fixture.tsx',
    './renderer/shared/ui/**/*.{test,spec}.tsx',
    './renderer/shared/ui/**/*.test-support.tsx',
    './renderer/shared/ui/**/*.test-fixture.tsx'
  ],
  globalCss: {
    'body.suspend *': { animationPlayState: 'paused !important' }
  },
  jsxFramework: 'react',
  jsxStyleProps: 'none',
  outdir: 'generated/styled-system',
  outExtension: 'js',
  presets: ['@pandacss/preset-base', newframePreset],
  preflight: false,
  strictTokens: false,
  theme: {}
})
