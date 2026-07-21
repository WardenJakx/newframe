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
  'test/*.{ts,tsx}',
  'test/__mocks__/*.ts',
  'test/main/**/*.{js,ts}'
]

const rendererFiles = [
  'app/**/*.{ts,tsx}',
  'resources/keyboard/**/*.{ts,tsx}',
  'resources/Components/**/*.{ts,tsx}',
  'resources/Hooks/**/*.{ts,tsx}',
  'resources/Native/**/*.{ts,tsx}',
  'resources/bridge/index.ts',
  'resources/link/index.ts',
  'test/app/**/*.{ts,tsx}',
  'test/resources/Components/**/*.{ts,tsx}',
  'test/resources/Hooks/**/*.{ts,tsx}',
  'test/resources/Native/**/*.{ts,tsx}'
]

const reactFiles = [
  'app/**/*.{ts,tsx}',
  'resources/Components/**/*.{ts,tsx}',
  'resources/Hooks/**/*.{ts,tsx}',
  'resources/Native/**/*.{ts,tsx}',
  'resources/svg.tsx',
  'test/app/**/*.{ts,tsx}',
  'test/resources/Components/**/*.{ts,tsx}',
  'test/resources/Hooks/**/*.{ts,tsx}',
  'test/resources/Native/**/*.{ts,tsx}',
  'test/svg.tsx'
]

export default [
  ...baseJavaScriptConfigs({
    ignores: ['dist/**/*', 'compiled/**/*', 'bundle/**/*', 'test/e2e/**/*', 'main/signers/**/*']
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
  testGlobalsConfig({ files: ['test/**/*.{ts,tsx}', '**/__mocks__/**/*.ts'] }),
  testingLibraryReactConfig({
    files: ['test/app/**/*.{ts,tsx}', 'test/resources/Components/**/*.{ts,tsx}', 'app/**/__mocks__/**/*.ts']
  }),
  prettierConfig
]
