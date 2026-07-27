import {
  baseJavaScriptConfigs,
  browserGlobalsConfig,
  globalsConfig,
  nodeGlobalsConfig,
  prettierConfig,
  reactConfigs,
  testGlobalsConfig,
  testingLibraryReactConfig,
  typescriptConfigs
} from '../../eslint.shared.mjs'

const mainFiles = [
  '*.{js,mjs,ts}',
  'scripts/**/*.ts',
  'main/**/*.{js,ts}',
  'build/**/*.{js,ts}',
  'test/support/**/*.{ts,tsx}'
]

const rendererFiles = ['renderer/**/*.{ts,tsx}', 'preload/**/*.ts', 'test/support/componentSetup.tsx']

const reactFiles = ['renderer/**/*.{ts,tsx}', 'test/support/componentSetup.tsx']

export default [
  ...baseJavaScriptConfigs({
    ignores: [
      'dist/**/*',
      'compiled/**/*',
      'bundle/**/*',
      'test/e2e/**/*',
      'main/signers/**/*',
      '!main/signers/**/*/',
      '!main/signers/**/*.{test,spec}.{ts,tsx}'
    ]
  }),
  nodeGlobalsConfig({ files: mainFiles }),
  browserGlobalsConfig({
    files: rendererFiles,
    extraGlobals: {
      global: true
    }
  }),
  globalsConfig({
    files: ['renderer/*/index.tsx'],
    globals: {
      process: true
    }
  }),
  ...typescriptConfigs({
    tsconfigRootDir: import.meta.dirname
  }),
  ...reactConfigs({ files: reactFiles, version: '19.2' }),
  testGlobalsConfig({
    files: [
      '**/*.{test,spec}.{ts,tsx}',
      '**/*.test-support.{ts,tsx}',
      '**/*.test-fixture.{ts,tsx}',
      'test/support/**/*.{ts,tsx}',
      '**/__mocks__/**/*.ts'
    ]
  }),
  testingLibraryReactConfig({
    files: [
      'renderer/**/*.{test,spec}.{ts,tsx}',
      'renderer/shared/ui/**/*.{test,spec}.{ts,tsx}',
      'renderer/shared/hooks/**/*.{test,spec}.{ts,tsx}',
      'renderer/**/__mocks__/**/*.ts'
    ]
  }),
  prettierConfig
]
