import {
  baseJavaScriptConfigs,
  browserGlobalsConfig,
  nodeGlobalsConfig,
  prettierConfig,
  reactConfigs,
  typescriptConfigs
} from '../../eslint.shared.mjs'

export default [
  ...baseJavaScriptConfigs({
    ignores: ['dist/**/*']
  }),
  nodeGlobalsConfig({
    files: ['*.{js,mjs,ts}', 'build.ts'],
    extraGlobals: {
      Bun: 'readonly'
    }
  }),
  browserGlobalsConfig({
    files: ['src/**/*.{ts,tsx}'],
    extraGlobals: {
      chrome: 'readonly'
    }
  }),
  ...typescriptConfigs({
    tsconfigRootDir: import.meta.dirname,
    project: './tsconfig.json'
  }),
  ...reactConfigs({ files: ['src/**/*.{tsx}'], version: '19.2' }),
  prettierConfig
]
