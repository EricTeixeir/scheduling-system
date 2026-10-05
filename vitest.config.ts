import { defineConfig } from 'vitest/config';

// Runs every workspace project from the root (used by `npm run test:coverage`).
// Each workspace can also run on its own with `npm run test:unit`.
export default defineConfig({
  test: {
    projects: [
      'packages/shared',
      'apps/api',
      'apps/web',
      // The `rules` project (business-rule integration tests over HTTP) goes here.
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**', 'packages/*/src/**'],
      exclude: ['**/src/test/**'],
    },
  },
});
