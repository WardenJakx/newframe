import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import testingLibrary from 'eslint-plugin-testing-library'
import globals from 'globals'

export default [
  // Ignored dirs
  {
    ignores: ['dist/**/*', 'compiled/**/*', 'bundle/**/*']
  },
  // Temporary ignored dirs
  // TODO: remove signers on rewrite
  // TODO: remove e2e on rewrite
  {
    ignores: ['test/e2e/**/*', 'main/signers/**/*']
  },
  // All files
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.es2021
      }
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrors: 'none' // restore pre-ESLint 9 default; unused catch params are widespread
        }
      ],
      // new rules with pre-existing violations; TODO: fix the code and promote to errors
      'no-useless-assignment': 'warn',
      'no-unassigned-vars': 'warn'
    }
  },
  // Main process files and scripts
  {
    files: [
      '*.{js,mjs,ts}',
      'scripts/**/*.ts',
      'main/**/*.{js,ts}',
      'build/**/*.js',
      'resources/**/*.{js,ts}',
      'test/*.{ts,tsx}',
      'test/__mocks__/*.ts',
      'test/main/**/*.{js,ts}'
    ],
    ignores: ['resources/Components/**/*', 'resources/Hooks/**/*', 'resources/Native/**/*'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  // Renderer process files
  {
    files: [
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
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        global: true
      }
    }
  },
  // Renderer entry points
  {
    files: ['app/*/index.tsx'],
    languageOptions: {
      globals: {
        process: true
      }
    }
  },
  // TS files
  // scope typescript-eslint's recommended configs (which apply globally by default) to TS files only
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}']
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { modules: true },
        ecmaVersion: 'latest',
        tsconfigRootDir: import.meta.dirname,
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      'no-undef': 'off', // redundant - TS will fail to compile with undefined vars
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrors: 'none' // restore pre-ESLint 9 default; unused catch params are widespread
        }
      ],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-nocheck': 'allow-with-description', 'ts-expect-error': 'allow-with-description' }
      ],
      '@typescript-eslint/no-explicit-any': 'warn', // was a warning in typescript-eslint v5 recommended; widespread in existing code
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions'] }], // allow noop arrow functions, e.g. in a method signature for ensuring a parameter defaults to a function
      '@typescript-eslint/prefer-namespace-keyword': 'off', // use ES module syntax instead of namespace
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }]
    }
  },
  // React / JSX files
  // TODO: simplify as '**/*.{jsx,tsx}'
  {
    files: [
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
    ],
    plugins: {
      react,
      'react-hooks': reactHooks
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    settings: {
      react: {
        // eslint-plugin-react's 'detect' option uses context.getFilename(), removed in ESLint 10
        version: '18.2'
      }
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      // react-hooks v6+ recommended includes React Compiler rules with many pre-existing
      // violations; keep the classic v4-era rule set for now
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off' // all type checking to be done in TS
    }
  },
  // Test files
  {
    files: ['test/**/*.{ts,tsx}', '**/__mocks__/**/*.ts'],
    languageOptions: {
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
    }
  },
  // Components test files
  {
    files: ['test/app/**/*.{ts,tsx}', 'test/resources/Components/**/*.{ts,tsx}', 'app/**/__mocks__/**/*.ts'],
    plugins: {
      'testing-library': testingLibrary
    },
    rules: {
      ...testingLibrary.configs.react.rules
    }
  },
  // ensure all rules work with prettier
  prettier
]
