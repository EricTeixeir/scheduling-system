import { defineConfig } from 'vitest/config';

// Runs every workspace project from the root (used by `npm run test:coverage`).
// Each workspace can also run on its own with `npm run test:unit`.
export default defineConfig({
  test: {
    projects: [
      'packages/shared',
      'apps/api',
      'apps/web',
      // Business-rule tests over HTTP live in vitest.rules.config.ts.
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
      // Test helpers and generated Prisma Client are not our production code. server.ts is the
      // process bootstrap (listen, signals, exit) and is exercised by running the API, not by tests.
      // *.repository.ts are thin Prisma queries whose behavior is the SQL itself; they are verified
      // against a real PostgreSQL (migration + seed + end-to-end smoke), not with mocks.
      // apps/web/src/components/ui is shadcn/ui source copied into the repo (library code we only
      // restyle); main.tsx is the browser bootstrap, exercised by running the app.
      exclude: [
        '**/src/test/**',
        'apps/api/src/infra/db/generated/**',
        'apps/api/src/server.ts',
        'apps/api/src/modules/**/*.repository.ts',
        'apps/web/src/components/ui/**',
        'apps/web/src/main.tsx',
      ],
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
        'apps/web/src/{lib,components/error-boundary}/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        'apps/api/src/modules/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  },
});
