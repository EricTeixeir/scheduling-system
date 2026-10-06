import { isIP } from 'node:net';

import { z } from 'zod';

import {
  DEFAULT_CANCEL_DEADLINE_MINUTES,
  DEFAULT_HORIZON_DAYS,
  DEFAULT_MIN_LEAD_MINUTES,
  type BookingPolicy,
} from '../domain/appointment/booking-policy';

// Must match the fallbacks in docker-compose.yml and .env.example: production refuses them.
export const DEV_DATABASE_PASSWORD = 'dev_only_change_me';
export const DEV_JWT_SECRET = 'dev_only_change_me_jwt_secret_0123456789';

const NODE_ENVS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const JWT_SECRET_MIN_LENGTH = 32;

export interface Config {
  readonly nodeEnv: (typeof NODE_ENVS)[number];
  readonly host: string;
  readonly port: number;
  readonly logLevel: (typeof LOG_LEVELS)[number];
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly businessTimezone: string;
  readonly bookingPolicy: BookingPolicy;
  readonly corsOrigins: readonly string[];
  readonly trustedProxies: readonly string[];
  readonly bodyLimitBytes: number;
  readonly rateLimitMax: number;
  readonly demoMode: boolean;
}

function integer(fallback: number, min: number, max: number) {
  return z
    .string()
    .regex(/^\d+$/, { error: 'must be a whole number' })
    .default(String(fallback))
    .transform(Number)
    .pipe(
      z
        .int()
        .min(min, { error: `must be at least ${String(min)}` })
        .max(max, { error: `must be at most ${String(max)}` }),
    );
}

function isIanaTimeZone(zone: string): boolean {
  // Intl also accepts offsets such as "+03:00"; only named zones follow DST rules.
  if (!/^[A-Za-z]/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const PROXY_PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isProxyAddress(entry: string): boolean {
  if (PROXY_PRESETS.has(entry)) return true;
  const [address = '', prefix, ...rest] = entry.split('/');
  const version = isIP(address);
  if (version === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  const maxPrefix = version === 4 ? 32 : 128;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= maxPrefix;
}

function boolean(fallback: boolean) {
  return z
    .enum(['true', 'false'], { error: 'must be true or false' })
    .default(fallback ? 'true' : 'false')
    .transform((value) => value === 'true');
}

function commaList(fallback: string) {
  return z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    );
}

function isBareOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
}

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: integer(3000, 1, 65_535),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DATABASE_URL: z
    .string({ error: 'is required' })
    .refine((value) => URL.canParse(value) && /^postgres(ql)?:$/.test(new URL(value).protocol), {
      error: 'must be a postgresql:// connection URL',
    }),
  JWT_SECRET: z
    .string()
    .min(JWT_SECRET_MIN_LENGTH, {
      error: `must be at least ${String(JWT_SECRET_MIN_LENGTH)} characters`,
    })
    .optional(),
  BUSINESS_TIMEZONE: z
    .string()
    .default('America/Sao_Paulo')
    .refine(isIanaTimeZone, { error: 'must be an IANA time zone such as America/Sao_Paulo' }),
  MIN_LEAD_MINUTES: integer(DEFAULT_MIN_LEAD_MINUTES, 0, 7 * 24 * 60),
  CANCEL_DEADLINE_MINUTES: integer(DEFAULT_CANCEL_DEADLINE_MINUTES, 0, 7 * 24 * 60),
  HORIZON_DAYS: integer(DEFAULT_HORIZON_DAYS, 1, 366),
  CORS_ORIGINS: commaList('http://localhost:8080,http://localhost:5173')
    .refine((origins) => origins.length > 0, { error: 'must list at least one origin' })
    .refine((origins) => origins.every(isBareOrigin), {
      error: 'must be comma-separated origins like https://example.com (no path, no wildcard)',
    }),
  TRUST_PROXY: commaList('loopback,uniquelocal').refine(
    (entries) => entries.every((entry) => entry === 'none' || isProxyAddress(entry)),
    { error: 'must be "none" or comma-separated IPs, CIDRs or loopback/linklocal/uniquelocal' },
  ),
  BODY_LIMIT_BYTES: integer(16_384, 1_024, 1_048_576),
  RATE_LIMIT_MAX: integer(100, 1, 100_000),
  DEMO_MODE: boolean(false),
});

type ParsedEnv = z.output<typeof envSchema>;

const OWN_VARIABLES = new Set(Object.keys(envSchema.shape));

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

function ownVariablesWithEmptyAsUnset(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => OWN_VARIABLES.has(key))
      .map(([key, value]) => [key, value === '' ? undefined : value]),
  );
}

function devSecretsInUse(env: ParsedEnv): string[] {
  const offenders: string[] = [];
  if (env.JWT_SECRET === undefined) offenders.push('JWT_SECRET (not set)');
  else if (env.JWT_SECRET === DEV_JWT_SECRET) offenders.push('JWT_SECRET');
  if (new URL(env.DATABASE_URL).password === DEV_DATABASE_PASSWORD) {
    offenders.push('DATABASE_URL (password)');
  }
  return offenders;
}

function bulletList(lines: readonly string[]): string {
  return lines.map((line) => `  - ${line}`).join('\n');
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = envSchema.safeParse(ownVariablesWithEmptyAsUnset(env));
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid environment configuration:\n${bulletList(problems)}`);
  }
  const parsed = result.data;

  if (parsed.NODE_ENV === 'production') {
    const offenders = devSecretsInUse(parsed);
    if (offenders.length > 0) {
      throw new ConfigError(
        `Refusing to start in production with development secrets. Set real values for:\n${bulletList(offenders)}`,
      );
    }
    if (parsed.DEMO_MODE) {
      throw new ConfigError(
        'Refusing to start in production with DEMO_MODE=true: it publishes demo credentials. Set DEMO_MODE=false.',
      );
    }
  }

  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    jwtSecret: parsed.JWT_SECRET ?? DEV_JWT_SECRET,
    businessTimezone: parsed.BUSINESS_TIMEZONE,
    bookingPolicy: Object.freeze({
      minLeadMinutes: parsed.MIN_LEAD_MINUTES,
      cancelDeadlineMinutes: parsed.CANCEL_DEADLINE_MINUTES,
      horizonDays: parsed.HORIZON_DAYS,
    }),
    corsOrigins: Object.freeze(parsed.CORS_ORIGINS),
    trustedProxies: Object.freeze(parsed.TRUST_PROXY.filter((entry) => entry !== 'none')),
    bodyLimitBytes: parsed.BODY_LIMIT_BYTES,
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    demoMode: parsed.DEMO_MODE,
  });
}
