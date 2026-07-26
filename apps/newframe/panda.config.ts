import { defineConfig } from '@pandacss/dev'

import { newframePreset } from '../../packages/ui/panda.preset.js'

export default defineConfig({
  include: ['./app/**/*.tsx', './resources/Components/**/*.tsx'],
  exclude: [
    './app/**/*.{test,spec}.tsx',
    './app/**/*.test-support.tsx',
    './app/**/*.test-fixture.tsx',
    './resources/Components/**/*.{test,spec}.tsx',
    './resources/Components/**/*.test-support.tsx',
    './resources/Components/**/*.test-fixture.tsx'
  ],
  globalCss: {
    'body.suspend *': { animationPlayState: 'paused !important' }
  },
  jsxFramework: 'react',
  jsxStyleProps: 'none',
  outdir: 'resources/styled-system',
  outExtension: 'js',
  presets: ['@pandacss/preset-base', newframePreset],
  preflight: false,
  strictTokens: false,
  theme: {}
})
