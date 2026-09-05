import {
  baseJavaScriptConfigs,
  browserGlobalsConfig,
  extensionReactConfigs,
  nodeGlobalsConfig,
  prettierConfig,
  typescriptConfigs
} from '../../eslint.shared.mjs'

export default [
  ...baseJavaScriptConfigs({
    ignores: ['dist/**/*', 'src/styled-system/**/*']
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
  ...extensionReactConfigs(),
  prettierConfig
]
