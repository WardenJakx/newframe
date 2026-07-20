import { defineConfig } from '@pandacss/dev'

import { newframePreset } from '../../packages/ui/panda.preset.js'

export default defineConfig({
  include: ['./app/**/*.tsx', './resources/Components/**/*.tsx'],
  exclude: ['./app/**/*.test.tsx', './resources/Components/**/*.test.tsx'],
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
