import { fileURLToPath } from 'node:url'
import {
  baseJavaScriptConfigs,
  browserGlobalsConfig,
  globalsConfig,
  ignoredPaths,
  nodeGlobalsConfig,
  prettierConfig,
  reactConfigs,
  testGlobalsConfig,
  testingLibraryReactConfig,
  typescriptConfigs
} from './eslint.shared.mjs'

const workspacePath = (path) => fileURLToPath(new URL(path, import.meta.url))

const newframe = 'apps/newframe'
const extension = 'apps/newframe-extension'
const ui = 'packages/ui'

const newframeMainFiles = [
  '*.{js,mjs,ts}',
  'scripts/**/*.ts',
  'main/**/*.{js,ts}',
  'build/**/*.js',
  'resources/**/*.{js,ts}',
  'test/*.{ts,tsx}',
  'test/__mocks__/*.ts',
  'test/main/**/*.{js,ts}'
]

const newframeRendererFiles = [
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

const newframeReactFiles = [
  'app/**/*.{ts,tsx}',
  'resources/Components/**/*.{ts,tsx}',
  'resources/Hooks/**/*.{ts,tsx}',
  'resources/Native/**/*.{ts,tsx}',
  'resources/svg/index.tsx',
  'test/app/**/*.{ts,tsx}',
  'test/resources/Components/**/*.{ts,tsx}',
  'test/resources/Hooks/**/*.{ts,tsx}',
  'test/resources/Native/**/*.{ts,tsx}',
  'test/svg.tsx'
]

export default [
  ignoredPaths([
    'node_modules/**/*',
    '**/node_modules/**/*',
    '.husky/_/**/*',
    '.claude/**/*',
    '.codex/**/*',
    '.docs/**/*',
    '.playwright-cli/**/*',
    '**/.playwright-cli/**/*',
    'apps/newframe/bundle/**/*',
    'apps/newframe/compiled/**/*',
    'apps/newframe/dist/**/*',
    'apps/newframe/dist-preview/**/*',
    'apps/newframe/build/icons/**/*',
    'apps/newframe/test/e2e/**/*',
    'apps/newframe/main/signers/**/*',
    'apps/newframe-extension/dist/**/*',
    'apps/newframe-extension/.cache/**/*',
    'packages/ui/dist/**/*'
  ]),
  ...baseJavaScriptConfigs(),

  nodeGlobalsConfig({ files: ['eslint.config.mjs', 'eslint.shared.mjs', 'scripts/**/*.ts'] }),
  ...typescriptConfigs({ basePath: 'scripts', tsconfigRootDir: workspacePath('./') }),
  nodeGlobalsConfig({ files: ['harness/**/*.ts'] }),
  ...typescriptConfigs({ basePath: 'harness', tsconfigRootDir: workspacePath('./') }),

  nodeGlobalsConfig({ basePath: ui, files: ['scripts/**/*.ts', 'test/**/*.{ts,tsx}'] }),
  browserGlobalsConfig({ basePath: ui, files: ['src/**/*.{ts,tsx}'] }),
  ...typescriptConfigs({ basePath: ui, tsconfigRootDir: workspacePath('./packages/ui') }),
  ...reactConfigs({ basePath: ui, files: ['src/**/*.tsx', 'test/**/*.tsx'], version: '19.2' }),
  {
    files: [`${ui}/src/**/*.tsx`],
    rules: {
      'react/no-multi-comp': ['error', { ignoreStateless: false }]
    }
  },
  testGlobalsConfig({ basePath: ui, files: ['test/**/*.{ts,tsx}'] }),

  nodeGlobalsConfig({
    basePath: newframe,
    files: newframeMainFiles,
    ignores: ['resources/Components/**/*', 'resources/Hooks/**/*', 'resources/Native/**/*']
  }),
  browserGlobalsConfig({
    basePath: newframe,
    files: newframeRendererFiles,
    extraGlobals: {
      global: true
    }
  }),
  globalsConfig({
    basePath: newframe,
    files: ['app/*/index.tsx'],
    globals: {
      process: true
    }
  }),
  ...typescriptConfigs({
    basePath: newframe,
    tsconfigRootDir: workspacePath('./apps/newframe')
  }),
  ...reactConfigs({ basePath: newframe, files: newframeReactFiles, version: '18.2' }),
  testGlobalsConfig({ basePath: newframe, files: ['test/**/*.{ts,tsx}', '**/__mocks__/**/*.ts'] }),
  testingLibraryReactConfig({
    basePath: newframe,
    files: ['test/app/**/*.{ts,tsx}', 'test/resources/Components/**/*.{ts,tsx}', 'app/**/__mocks__/**/*.ts']
  }),

  nodeGlobalsConfig({
    basePath: extension,
    files: ['*.{js,mjs,ts}', 'build.ts'],
    extraGlobals: {
      Bun: 'readonly'
    }
  }),
  browserGlobalsConfig({
    basePath: extension,
    files: ['src/**/*.{ts,tsx}'],
    extraGlobals: {
      chrome: 'readonly'
    }
  }),
  ...typescriptConfigs({
    basePath: extension,
    tsconfigRootDir: workspacePath('./apps/newframe-extension')
  }),
  ...reactConfigs({ basePath: extension, files: ['src/**/*.{tsx}'], version: '19.2' }),

  prettierConfig
]
