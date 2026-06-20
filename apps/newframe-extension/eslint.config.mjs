import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  // Ignored dirs
  {
    ignores: ['dist/**/*']
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
          caughtErrors: 'none'
        }
      ],
      // new rules with pre-existing violations; TODO: fix the code and promote to errors
      'no-useless-assignment': 'warn',
      'no-unassigned-vars': 'warn'
    }
  },
  // Build scripts and config
  {
    files: ['*.{js,mjs,ts}', 'build.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        Bun: 'readonly'
      }
    }
  },
  // Extension runtime files
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly'
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
          caughtErrors: 'none'
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
  {
    files: ['src/**/*.{tsx}'],
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
        version: '19.2'
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
  // ensure all rules work with prettier
  prettier
]
