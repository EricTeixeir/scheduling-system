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
      // Test helpers and generated Prisma Client are not our production code. server.ts is the
      // process bootstrap (listen, signals, exit) and is exercised by running the API, not by tests.
      exclude: ['**/src/test/**', 'apps/api/src/infra/db/generated/**', 'apps/api/src/server.ts'],
      // Per-glob gates: the run fails when a covered area drops below its floor.
      thresholds: {
        'apps/api/src/domain/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        'apps/api/src/{app.ts,{config,errors,http,infra/db,logging,routes}/**}': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        'packages/shared/src/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        // 'apps/api/src/services/**': same floors, added with the service layer.
      },
    },
  },
});
