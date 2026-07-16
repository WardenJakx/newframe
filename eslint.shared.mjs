import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import testingLibraryPlugin from 'eslint-plugin-testing-library'
import globals from 'globals'

const allCodeFiles = ['**/*.{js,mjs,ts,tsx}']
const tsFiles = ['**/*.{ts,tsx}']

const unusedVarsOptions = {
  args: 'after-used',
  ignoreRestSiblings: true,
  argsIgnorePattern: '^_',
  destructuredArrayIgnorePattern: '^_',
  caughtErrors: 'none'
}

const withBasePath = (basePath, patterns) => {
  if (!basePath) return patterns

  const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`
  return patterns.map((pattern) => `${normalizedBasePath}${pattern}`)
}

export const ignoredPaths = (patterns, { basePath = '' } = {}) => ({
  ignores: withBasePath(basePath, patterns)
})

export const baseJavaScriptConfigs = ({ basePath = '', ignores = [] } = {}) => [
  ...(ignores.length > 0 ? [ignoredPaths(ignores, { basePath })] : []),
  {
    files: withBasePath(basePath, allCodeFiles),
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.es2021
      }
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-unused-vars': ['error', unusedVarsOptions],
      // New ESLint rules with pre-existing violations; promote after cleanup.
      'no-useless-assignment': 'warn',
      'no-unassigned-vars': 'warn'
    }
  }
]

export const globalsConfig = ({ basePath = '', files, ignores = [], globals: scopedGlobals }) => ({
  files: withBasePath(basePath, files),
  ...(ignores.length > 0 ? { ignores: withBasePath(basePath, ignores) } : {}),
  languageOptions: {
    globals: scopedGlobals
  }
})

export const nodeGlobalsConfig = ({ basePath = '', files, ignores = [], extraGlobals = {} }) =>
  globalsConfig({
    basePath,
    files,
    ignores,
    globals: {
      ...globals.node,
      ...extraGlobals
    }
  })

export const browserGlobalsConfig = ({ basePath = '', files, ignores = [], extraGlobals = {} }) =>
  globalsConfig({
    basePath,
    files,
    ignores,
    globals: {
      ...globals.browser,
      ...extraGlobals
    }
  })

export const typescriptConfigs = ({ basePath = '', tsconfigRootDir, project } = {}) => [
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: withBasePath(basePath, tsFiles)
  })),
  {
    files: withBasePath(basePath, tsFiles),
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { modules: true },
        ecmaVersion: 'latest',
        ...(tsconfigRootDir ? { tsconfigRootDir } : {}),
        ...(project ? { project } : {})
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', unusedVarsOptions],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-nocheck': 'allow-with-description', 'ts-expect-error': 'allow-with-description' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }],
      '@typescript-eslint/prefer-namespace-keyword': 'off',
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }]
    }
  }
]

export const reactConfigs = ({ basePath = '', files, version }) => [
  {
    files: withBasePath(basePath, files),
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        jsxPragma: null
      }
    },
    settings: {
      react: {
        // eslint-plugin-react's detect mode uses APIs removed in newer ESLint versions.
        version
      }
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      // Keep the classic hooks rule set until React Compiler violations are cleaned up.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off'
    }
  }
]

export const testGlobalsConfig = ({ basePath = '', files }) =>
  globalsConfig({
    basePath,
    files,
    globals: {
      afterAll: 'readonly',
      afterEach: 'readonly',
      beforeAll: 'readonly',
      beforeEach: 'readonly',
      describe: 'readonly',
      expect: 'readonly',
      it: 'readonly',
      jest: 'readonly',
      test: 'readonly',
      xdescribe: 'readonly',
      xit: 'readonly',
      xtest: 'readonly'
    }
  })

export const testingLibraryReactConfig = ({ basePath = '', files }) => ({
  files: withBasePath(basePath, files),
  plugins: {
    'testing-library': testingLibraryPlugin
  },
  rules: {
    ...testingLibraryPlugin.configs.react.rules
  }
})

export const prettierConfig = prettier
