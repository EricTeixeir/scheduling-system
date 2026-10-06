import { readFileSync } from 'node:fs';

import { build } from 'esbuild';

interface PackageJson {
  readonly dependencies?: Readonly<Record<string, string>>;
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson;

// Workspaces ship TypeScript, so they are bundled; native argon2 and the Prisma WASM compiler cannot be.
const external = Object.keys(manifest.dependencies ?? {}).filter(
  (name) => !name.startsWith('@scheduling/'),
);

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external,
  sourcemap: true,
  logLevel: 'info',
});
