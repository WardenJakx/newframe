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
  'build/**/*.js',
  'resources/**/*.{js,ts}',
  'test/support/**/*.{ts,tsx}'
]

const rendererFiles = [
  'app/**/*.{ts,tsx}',
  'resources/keyboard/**/*.{ts,tsx}',
  'resources/Components/**/*.{ts,tsx}',
  'resources/Hooks/**/*.{ts,tsx}',
  'resources/Native/**/*.{ts,tsx}',
  'resources/bridge/index.ts',
  'resources/link/index.ts',
  'test/support/componentSetup.tsx'
]

const reactFiles = [
  'app/**/*.{ts,tsx}',
  'resources/Components/**/*.{ts,tsx}',
  'resources/Hooks/**/*.{ts,tsx}',
  'resources/Native/**/*.{ts,tsx}',
  'resources/svg.tsx',
  'test/support/componentSetup.tsx'
]

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
  nodeGlobalsConfig({
    files: mainFiles,
    ignores: ['resources/Components/**/*', 'resources/Hooks/**/*', 'resources/Native/**/*']
  }),
  browserGlobalsConfig({
    files: rendererFiles,
    extraGlobals: {
      global: true
    }
  }),
  globalsConfig({
    files: ['app/*/index.tsx'],
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
      'app/**/*.{test,spec}.{ts,tsx}',
      'resources/Components/**/*.{test,spec}.{ts,tsx}',
      'resources/Hooks/**/*.{test,spec}.{ts,tsx}',
      'app/**/__mocks__/**/*.ts'
    ]
  }),
  prettierConfig
]
