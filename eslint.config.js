// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-e2e/**',
      '**/test-results/**',
      '**/.expo/**',
      '**/web-build/**',
      'apps/mobile/editor-web-bundle/build/**',
      'packages/shared/src/db.types.ts',
      'supabase/functions/**',
      'playwright-report/**',
      'test-results/**',
      '**/*.config.js',
      '**/babel.config.js',
      '**/metro.config.js',
      '**/tailwind.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      // shared must stay runtime-agnostic
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-native', 'react-native/*', 'expo*', 'node:*'] },
      ],
    },
  },
  prettier,
);
