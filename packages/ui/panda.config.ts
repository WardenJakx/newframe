import { defineConfig } from '@pandacss/dev'

import { newframePreset } from './panda.preset.js'

export default defineConfig({
  include: ['./src/primitives/**/*.tsx', './src/root/**/*.tsx'],
  globalCss: {
    'html, body, .appRoot, .nf-root': {
      width: '100%',
      height: '100%',
      margin: 0,
      padding: 0,
      border: 0,
      overflow: 'hidden'
    },
    '.appRoot, .nf-root': { position: 'relative' },
    'html, body, .nf-root': {
      background: 'bg.primary',
      color: 'text.primary',
      fontFamily: 'body',
      fontWeight: 'regular'
    },
    '*, *::before, *::after': { boxSizing: 'border-box' },
    'body, .nf-root': { userSelect: 'none', fontFeatureSettings: "'ss04', 'zero'" },
    '.nf-root button, .nf-root input, .nf-root select, .nf-root textarea': {
      fontFamily: 'inherit',
      fontWeight: 'inherit'
    },
    '.nf-root input, .nf-root textarea': { userSelect: 'text' },
    '::-webkit-scrollbar': { width: 0, height: 0, background: 'transparent' },
    '.nf-root ::selection': { backgroundColor: 'border' },
    '.nf-root *, .nf-root *::before, .nf-root *::after': {
      _motionReduce: {
        scrollBehavior: 'auto !important',
        animationDuration: 'token(durations.reduced) !important',
        animationIterationCount: '1 !important',
        transitionDuration: 'token(durations.reduced) !important'
      }
    }
  },
  globalFontface: {
    VCR: [{ fontWeight: '100 700', src: "url('../assets/fonts/VCR/VCR.ttf')" }],
    FiraCode: [
      { fontWeight: 100, src: "url('../assets/fonts/FiraCode/FiraCode-Light.ttf')" },
      { fontWeight: 200, src: "url('../assets/fonts/FiraCode/FiraCode-Regular.ttf')" },
      { fontWeight: 250, src: "url('../assets/fonts/FiraCode/FiraCode-Retina.ttf')" },
      { fontWeight: 300, src: "url('../assets/fonts/FiraCode/FiraCode-Medium.ttf')" },
      { fontWeight: 400, src: "url('../assets/fonts/FiraCode/FiraCode-SemiBold.ttf')" },
      { fontWeight: 500, src: "url('../assets/fonts/FiraCode/FiraCode-Bold.ttf')" }
    ],
    MainFont: [
      { fontWeight: 200, src: "url('../assets/fonts/Ubuntu/Ubuntu-Light.ttf')" },
      { fontWeight: 300, src: "url('../assets/fonts/Ubuntu/Ubuntu-Regular.ttf')" },
      { fontWeight: 400, src: "url('../assets/fonts/Ubuntu/Ubuntu-Medium.ttf')" },
      { fontWeight: 500, src: "url('../assets/fonts/Ubuntu/Ubuntu-Bold.ttf')" }
    ]
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
