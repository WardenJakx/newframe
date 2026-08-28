import { defineConfig } from '@pandacss/dev'

import { newframePreset } from '../../packages/ui/panda.preset.js'

export default defineConfig({
  include: ['./src/**/*.tsx'],
  exclude: ['./src/**/*.test.ts', './src/**/*.test.tsx'],
  globalCss: {
    // Chrome sizes popups from their content. Override the shared viewport-sized,
    // clipped roots, including UIRoot's higher-priority utility-layer styles.
    'html, body, #root, .nf-root': {
      width: 'token(sizes.page-compact) !important',
      height: 'auto !important',
      overflow: 'visible !important'
    }
  },
  jsxFramework: 'react',
  jsxStyleProps: 'none',
  outdir: 'src/styled-system',
  outExtension: 'js',
  presets: ['@pandacss/preset-base', newframePreset],
  preflight: false,
  strictTokens: false,
  theme: {}
})
