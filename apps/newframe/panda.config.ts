import { defineConfig } from '@pandacss/dev'

import { newframePreset } from '../../packages/ui/panda.preset.js'

export default defineConfig({
  include: ['./src/**/*.tsx'],
  exclude: ['./src/**/*.{test,spec}.tsx', './src/**/*.test-support.tsx', './src/**/*.test-fixture.tsx'],
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
