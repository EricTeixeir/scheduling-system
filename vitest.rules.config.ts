import { defineConfig } from 'vitest/config';

// Kept out of vitest.config.ts: any --project filter there leaves the coverage report empty.
export default defineConfig({
  test: {
    name: 'rules',
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    // They share one stack and restart its containers: never in parallel.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
