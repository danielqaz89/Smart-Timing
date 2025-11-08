import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Base recommended for JS
  js.configs.recommended,
  // Base recommended for TS
  ...tseslint.configs.recommended,
  // Register Next.js plugin so disable/enable comments for @next/next rules resolve
  {
    plugins: { '@next/next': nextPlugin },
  },
  // TS/TSX specifics and React
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
      },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Relax some strict rules during migration
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
    settings: { react: { version: 'detect' } },
  },
  // Service worker/env overrides
  {
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...globals.worker, ...globals.browser },
    },
    rules: {
      'no-undef': 'off',
      'no-restricted-globals': 'off',
    },
  },
  // Apply module env to all
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
  // Ignores
  {
    ignores: ['.next/**', 'node_modules/**', 'build/**', 'coverage/**', '.next-turbo/**', '.out/**'],
  },
];
