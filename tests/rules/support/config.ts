import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

function envOr(name: string, fallback: string): string {
  // eslint-disable-next-line security/detect-object-injection -- name is one of the constants below.
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function baseUrl(): string {
  const raw = envOr('RULES_BASE_URL', 'http://localhost:8080');
  if (!URL.canParse(raw)) throw new Error(`RULES_BASE_URL is not a valid URL: ${raw}`);
  return new URL(raw).origin;
}

export const RULES_BASE_URL = baseUrl();

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const SEEDED_CLIENT: Credentials = {
  email: envOr('SEED_CLIENT_EMAIL', 'euro@user.com'),
  password: envOr('SEED_CLIENT_PASSWORD', 'Euro@3$1'),
};

export const SEEDED_ADMIN: Credentials = {
  email: envOr('SEED_ADMIN_EMAIL', 'euro@admin.com'),
  password: envOr('SEED_ADMIN_PASSWORD', '1$3@Euro'),
};

export function newRunId(): string {
  return `rules-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}
