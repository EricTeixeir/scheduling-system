import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', '**/coverage/', '**/node_modules/']),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  security.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        // Each file is checked with the nearest tsconfig.json (root or workspace).
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-properties': [
        'error',
        {
          property: '$queryRawUnsafe',
          message: 'Use the tagged template $queryRaw`...` so values are sent as parameters.',
        },
        {
          property: '$executeRawUnsafe',
          message: 'Use the tagged template $executeRaw`...` so values are sent as parameters.',
        },
        {
          object: 'Prisma',
          property: 'raw',
          message:
            'Prisma.raw inserts unescaped SQL. Use the tagged template $queryRaw`...` or Prisma.sql.',
        },
      ],
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML bypasses React escaping and opens the door to XSS.',
        },
      ],
    },
  },

  // Must stay last: turns off stylistic rules that would fight with Prettier.
  prettier,
);
