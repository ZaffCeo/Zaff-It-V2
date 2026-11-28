// ESLint 9 flat config — repo-wide (Expo React Native monorepo).
// Legacy setup was dead: eslint 9 defaults to flat config and no plugin
// configs were wired. `npm run lint` now actually runs.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: [
      'node_modules/**', '**/node_modules/**',
      'dist/**', 'build/**', '**/dist/**', '**/build/**',
      '.expo/**', '**/.expo/**', 'web-build/**', '**/web-build/**',
      'apps/mobile/tests/typing-harness/bundles/**',
      'apps/mobile/tests/typing-harness/bundle.js',
      'apps/mobile/tests/typing-harness/.gen/**',
      '.wrangler/**',
      'google_drive/**',
      'supabase/functions/**', // Deno runtime — separate toolchain, tsc-checked via deno.json
      'worker/**',
      '**/*.png', '**/*.zip', '**/*.docx',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}', 'apps/mobile/App.tsx', 'apps/mobile/tests/**/*.{ts,tsx}', 'packages/shared/src/**/*.ts'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        __DEV__: 'readonly',
        process: 'readonly',
        require: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        WebSocket: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        AbortController: 'readonly',
        global: 'readonly',
        window: 'writable',
        document: 'readonly',
        navigator: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs['recommended-latest'].rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Metro asset requires (require('...png')) are idiomatic React Native.
      '@typescript-eslint/no-require-imports': 'off',
      // React Native JSX is not HTML — plain quotes in copy are fine.
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
    },
  },
  {
    // Config + harness driver scripts are plain node CJS/ESM
    files: [
      'eslint.config.js',
      'apps/mobile/tests/typing-harness/**/*.mjs',
      'apps/mobile/tests/typing-harness/stubs/**/*.js',
    ],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', require: 'readonly', module: 'writable', __dirname: 'readonly', fetch: 'readonly', setTimeout: 'readonly', URL: 'readonly' } },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
];
