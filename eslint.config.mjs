import js from '@eslint/js';

export default [
  {
    files: ['**/*.{js,mjs,cjs}'],
    ignores: ['frontend/**', 'node_modules/**', 'uploads/**'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    ...js.configs.recommended,
    rules: {
      'no-undef': 'off',
    },
  },
];