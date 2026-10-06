import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CANCEL_DEADLINE_MINUTES,
  DEFAULT_HORIZON_DAYS,
  DEFAULT_MIN_LEAD_MINUTES,
} from '../domain/appointment/booking-policy';
import { ConfigError, DEV_DATABASE_PASSWORD, DEV_JWT_SECRET, loadConfig } from './env';

const DATABASE_URL = 'postgresql://scheduling:s3cret@db:5432/scheduling';
const REAL_SECRET = 'a-real-production-secret-with-enough-length';

function configError(env: NodeJS.ProcessEnv): string {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('applies defaults when only DATABASE_URL is set', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 3000,
      logLevel: 'info',
      databaseUrl: DATABASE_URL,
      jwtSecret: DEV_JWT_SECRET,
      businessTimezone: 'America/Sao_Paulo',
      bookingPolicy: {
        minLeadMinutes: DEFAULT_MIN_LEAD_MINUTES,
        cancelDeadlineMinutes: DEFAULT_CANCEL_DEADLINE_MINUTES,
        horizonDays: DEFAULT_HORIZON_DAYS,
      },
      corsOrigins: ['http://localhost:8080', 'http://localhost:5173'],
      trustedProxies: ['loopback', 'uniquelocal'],
      bodyLimitBytes: 16_384,
      rateLimitMax: 100,
    });
  });

  it('reads every variable and ignores unrelated ones', () => {
    const config = loadConfig({
      DATABASE_URL,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '8081',
      LOG_LEVEL: 'warn',
      JWT_SECRET: REAL_SECRET,
      BUSINESS_TIMEZONE: 'Europe/Lisbon',
      MIN_LEAD_MINUTES: '0',
      CANCEL_DEADLINE_MINUTES: '120',
      HORIZON_DAYS: '30',
      CORS_ORIGINS: ' https://app.example.com , http://localhost:5173 ',
      TRUST_PROXY: '10.0.0.0/8, ::1, 172.18.0.5',
      BODY_LIMIT_BYTES: '2048',
      RATE_LIMIT_MAX: '5',
      PATH: '/usr/bin',
    });
    expect(config).toMatchObject({
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 8081,
      logLevel: 'warn',
      jwtSecret: REAL_SECRET,
      businessTimezone: 'Europe/Lisbon',
      bookingPolicy: { minLeadMinutes: 0, cancelDeadlineMinutes: 120, horizonDays: 30 },
      corsOrigins: ['https://app.example.com', 'http://localhost:5173'],
      trustedProxies: ['10.0.0.0/8', '::1', '172.18.0.5'],
      bodyLimitBytes: 2048,
      rateLimitMax: 5,
    });
    expect(config).not.toHaveProperty('PATH');
  });

  it('treats empty values as unset', () => {
    expect(loadConfig({ DATABASE_URL, PORT: '', BUSINESS_TIMEZONE: '' })).toMatchObject({
      port: 3000,
      businessTimezone: 'America/Sao_Paulo',
    });
  });

  it('turns proxy trust off with "none"', () => {
    expect(loadConfig({ DATABASE_URL, TRUST_PROXY: 'none' }).trustedProxies).toEqual([]);
  });

  it('returns an immutable config', () => {
    const config = loadConfig({ DATABASE_URL });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.corsOrigins)).toBe(true);
    expect(Object.isFrozen(config.bookingPolicy)).toBe(true);
  });

  it('requires DATABASE_URL', () => {
    expect(configError({})).toContain('DATABASE_URL: is required');
  });

  it.each([
    ['DATABASE_URL', 'mysql://u:p@h/db'],
    ['DATABASE_URL', 'not a url'],
    ['NODE_ENV', 'staging'],
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['PORT', '0'],
    ['LOG_LEVEL', 'verbose'],
    ['JWT_SECRET', 'too-short'],
    ['BUSINESS_TIMEZONE', 'Mars/Olympus_Mons'],
    ['BUSINESS_TIMEZONE', '+03:00'],
    ['HORIZON_DAYS', '-1'],
    ['CORS_ORIGINS', '*'],
    ['CORS_ORIGINS', 'https://app.example.com/path'],
    ['TRUST_PROXY', 'everyone'],
    ['TRUST_PROXY', '10.0.0.0/33'],
    ['TRUST_PROXY', '10.0.0.0/8/1'],
    ['BODY_LIMIT_BYTES', '77'],
  ])('rejects %s=%s naming the variable but not the value', (name, value) => {
    const message = configError({ DATABASE_URL, [name]: value });
    expect(message).toContain(`${name}:`);
    expect(message).not.toContain(value);
  });

  it('rejects an empty origin list', () => {
    expect(configError({ DATABASE_URL, CORS_ORIGINS: ' , ' })).toContain(
      'CORS_ORIGINS: must list at least one origin',
    );
  });

  it('lists every invalid variable at once', () => {
    const message = configError({ PORT: 'x', LOG_LEVEL: 'loud' });
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('PORT');
    expect(message).toContain('LOG_LEVEL');
  });

  describe('in production', () => {
    const production = { NODE_ENV: 'production' };

    it('starts with real secrets', () => {
      expect(loadConfig({ ...production, DATABASE_URL, JWT_SECRET: REAL_SECRET }).jwtSecret).toBe(
        REAL_SECRET,
      );
    });

    it('refuses the development defaults without printing them', () => {
      const message = configError({
        ...production,
        DATABASE_URL: `postgresql://scheduling:${DEV_DATABASE_PASSWORD}@db:5432/scheduling`,
        JWT_SECRET: DEV_JWT_SECRET,
      });
      expect(message).toContain('Refusing to start in production');
      expect(message).toContain('JWT_SECRET');
      expect(message).toContain('DATABASE_URL (password)');
      expect(message).not.toContain(DEV_DATABASE_PASSWORD);
      expect(message).not.toContain(DEV_JWT_SECRET);
    });

    it('requires JWT_SECRET instead of falling back to the development one', () => {
      expect(configError({ ...production, DATABASE_URL })).toContain('JWT_SECRET (not set)');
    });
  });
});
