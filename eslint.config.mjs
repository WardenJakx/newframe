import { fileURLToPath } from 'node:url'
import {
  baseJavaScriptConfigs,
  browserGlobalsConfig,
  extensionReactConfigs,
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
  'src/**/*.{js,ts}',
  'build/**/*.{js,ts}',
  'test/support/**/*.{ts,tsx}'
]

const newframeRendererFiles = [
  'src/renderer/**/*.{ts,tsx}',
  'src/**/renderer/**/*.{ts,tsx}',
  'src/preload/**/*.ts',
  'test/support/componentSetup.tsx'
]

const newframeReactFiles = [
  'src/renderer/**/*.{ts,tsx}',
  'src/**/renderer/**/*.{ts,tsx}',
  'test/support/componentSetup.tsx'
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
    'apps/newframe/src/platform/signing/signers/**/*',
    '!apps/newframe/src/platform/signing/signers/**/*/',
    '!apps/newframe/src/platform/signing/signers/**/*.{test,spec}.{ts,tsx}',
    'apps/newframe-extension/dist/**/*',
    'apps/newframe-extension/src/styled-system/**/*',
    'apps/newframe-extension/.cache/**/*',
    'packages/ui/dist/**/*',
    'packages/ui/src/styled-system/**/*'
  ]),
  ...baseJavaScriptConfigs(),

  nodeGlobalsConfig({ files: ['eslint.config.mjs', 'eslint.shared.mjs', 'scripts/**/*.ts'] }),
  ...typescriptConfigs({ basePath: 'scripts', tsconfigRootDir: workspacePath('./') }),
  nodeGlobalsConfig({
    files: ['test/unit/**/*.{ts,tsx}'],
    extraGlobals: {
      Bun: 'readonly'
    }
  }),
  ...typescriptConfigs({ basePath: 'test/unit', tsconfigRootDir: workspacePath('./') }),
  testGlobalsConfig({ files: ['test/unit/**/*.{ts,tsx}'] }),
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
    files: newframeMainFiles
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
    files: ['src/renderer/*/index.tsx'],
    globals: {
      process: true
    }
  }),
  ...typescriptConfigs({
    basePath: newframe,
    tsconfigRootDir: workspacePath('./apps/newframe')
  }),
  ...reactConfigs({ basePath: newframe, files: newframeReactFiles, version: '19.2' }),
  testGlobalsConfig({
    basePath: newframe,
    files: [
      '**/*.{test,spec}.{ts,tsx}',
      '**/*.test-support.{ts,tsx}',
      '**/*.test-fixture.{ts,tsx}',
      'test/support/**/*.{ts,tsx}',
      '**/__mocks__/**/*.ts'
    ]
  }),
  testingLibraryReactConfig({
    basePath: newframe,
    files: [
      'src/renderer/**/*.{test,spec}.{ts,tsx}',
      'src/**/renderer/**/*.{test,spec}.{ts,tsx}',
      'src/**/renderer/**/__mocks__/**/*.ts',
      'test/extension/**/*.{test,spec}.{ts,tsx}'
    ]
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
  ...extensionReactConfigs({ basePath: extension }),

  prettierConfig
]
