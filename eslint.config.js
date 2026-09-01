import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', '.bmad', '.claude', '.local', 'src/app/prototypes/**', 'test-results/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
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
      // Prevent TDZ crashes: flag const/let variables used before their declaration.
      // Functions and classes are hoisted so they're safe; variables (useCallback, useState) are not.
      '@typescript-eslint/no-use-before-define': ['error', {
        functions: false,
        classes: false,
        variables: true,
        allowNamedExports: true,
      }],
      // Allow underscore-prefixed variables to be unused (for intentional ignores)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Accessibility rules - catch common issues
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      // Allow autoFocus - often intentional UX for modals/dialogs
      'jsx-a11y/no-autofocus': 'off',
      // Allow redundant roles - sometimes needed for older screen readers
      'jsx-a11y/no-redundant-roles': 'error',
      // Hidden audio (className="hidden") doesn't need captions - warn only
      'jsx-a11y/media-has-caption': 'warn',
      // Label wrapping control is valid - allow Radix UI patterns
      'jsx-a11y/label-has-associated-control': ['error', {
        assert: 'either',
        depth: 3,
        controlComponents: ['Checkbox', 'Input', 'Select', 'Textarea', 'Switch'],
      }],
      // Dynamic headings (props spreading) are valid - warn only for shadcn/ui
      'jsx-a11y/heading-has-content': 'error',
      // Component prop `role` conflicts with ARIA role - common in UI libs
      'jsx-a11y/aria-role': ['error', {
        ignoreNonDOM: true,
      }],
      // P990: `logDbError(...)` followed by a bare `throw` re-reports a
      // suppressed network blip to Sentry under the wrapper message — the
      // logger filters the blip, then the throw carries the same text into the
      // global handler. AST-based on purpose: a grep-based gate misses the one
      // site where a comment block sits between the call and the throw
      // (letters-service.ts, the [P904 v0 ACCEPTED] block).
      'no-restricted-syntax': ['error', {
        selector: 'ExpressionStatement[expression.callee.name="logDbError"] + ThrowStatement',
        message: 'P990: logDbError followed by a bare throw re-reports filtered noise to Sentry. Use throwDbError(context, error, message) instead.',
      }],
    },
  },
  // P1200: production console must stay quiet. console.error/warn remain
  // allowed (they route to Sentry / surface real problems); any other
  // console method (log, info, debug) is a lint error under all of src/.
  // Widened from src/app/-only to src/** once src/auth/, src/hooks/, and
  // src/lib/ were cleaned up in the same P-number — see P1200 Evidence
  // section for the per-site policy (delete single-use logs; DEV-gate and
  // annotate with a per-line disable directive + rationale comment for
  // operational/test-asserted diagnostics). Test files are excluded below — they run under vitest,
  // never ship, and this codebase already logs intentionally in a couple.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  // Test files - allow 'any' and non-null assertions for mocking/assertions,
  // and allow console.log (P1200) since these never ship to production.
  {
    files: ['**/*.test.{ts,tsx}', '**/tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },
  // E2e test files — relaxed rules for Playwright patterns
  {
    files: ['e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
