import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', '.bmad', '.claude', '.local', 'src/app/prototypes/**', 'test-results/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Allow underscore-prefixed variables to be unused (for intentional ignores)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Accessibility rules - catch common issues
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      // Allow autoFocus - often intentional UX for modals/dialogs
      'jsx-a11y/no-autofocus': 'off',
      // Allow redundant roles - sometimes needed for older screen readers
      'jsx-a11y/no-redundant-roles': 'warn',
      // Hidden audio (className="hidden") doesn't need captions - warn only
      'jsx-a11y/media-has-caption': 'warn',
      // Label wrapping control is valid - allow Radix UI patterns
      'jsx-a11y/label-has-associated-control': ['error', {
        assert: 'either',
        depth: 3,
        controlComponents: ['Checkbox', 'Input', 'Select', 'Textarea', 'Switch'],
      }],
      // Dynamic headings (props spreading) are valid - warn only for shadcn/ui
      'jsx-a11y/heading-has-content': 'warn',
      // Component prop `role` conflicts with ARIA role - common in UI libs
      'jsx-a11y/aria-role': ['error', {
        ignoreNonDOM: true,
      }],
    },
  },
  // Test files - allow 'any' for mocking
  {
    files: ['**/*.test.{ts,tsx}', '**/tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // E2e test files — relaxed unused-vars for stubs and Playwright fixtures
  {
    files: ['e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
)
