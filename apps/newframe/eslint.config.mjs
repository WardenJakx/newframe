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
  'src/**/*.{js,ts}',
  'build/**/*.{js,ts}',
  'test/support/**/*.{ts,tsx}'
]

const rendererFiles = [
  'src/renderer/**/*.{ts,tsx}',
  'src/**/renderer/**/*.{ts,tsx}',
  'src/preload/**/*.ts',
  'test/support/componentSetup.tsx'
]

const reactFiles = [
  'src/renderer/**/*.{ts,tsx}',
  'src/**/renderer/**/*.{ts,tsx}',
  'test/support/componentSetup.tsx'
]

export default [
  ...baseJavaScriptConfigs({
    ignores: [
      'dist/**/*',
      'compiled/**/*',
      'bundle/**/*',
      'test/e2e/**/*',
      'src/platform/signing/signers/**/*',
      '!src/platform/signing/signers/**/*/',
      '!src/platform/signing/signers/**/*.{test,spec}.{ts,tsx}'
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
    files: ['src/renderer/*/index.tsx'],
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
      'src/renderer/**/*.{test,spec}.{ts,tsx}',
      'src/**/renderer/**/*.{test,spec}.{ts,tsx}',
      'src/**/renderer/**/__mocks__/**/*.ts',
      'test/extension/**/*.{test,spec}.{ts,tsx}'
    ]
  }),
  prettierConfig
]
