import { defineConfig } from '@pandacss/dev'

import { newframePreset } from '../../packages/ui/panda.preset.js'

export default defineConfig({
  include: ['./src/**/*.tsx'],
  exclude: ['./src/**/*.test.ts', './src/**/*.test.tsx'],
  jsxFramework: 'react',
  jsxStyleProps: 'none',
  outdir: 'src/styled-system',
  outExtension: 'js',
  presets: ['@pandacss/preset-base', newframePreset],
  preflight: false,
  strictTokens: false,
  theme: {}
})
