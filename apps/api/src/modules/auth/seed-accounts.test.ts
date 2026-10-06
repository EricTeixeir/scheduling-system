import { describe, expect, it } from 'vitest';

import { planSeedAccounts, SeedConfigError } from './seed-accounts';

const ADMIN_TEST_PASSWORD = 'admin-test-pass-1';
const CLIENT_TEST_PASSWORD = 'client-test-pass-1';

const BOTH = {
  SEED_ADMIN_EMAIL: 'admin@example.com',
  SEED_ADMIN_PASSWORD: ADMIN_TEST_PASSWORD,
  SEED_CLIENT_EMAIL: 'client@example.com',
  SEED_CLIENT_PASSWORD: CLIENT_TEST_PASSWORD,
};

function failure(env: NodeJS.ProcessEnv): string {
  try {
    planSeedAccounts(env);
  } catch (error) {
    expect(error).toBeInstanceOf(SeedConfigError);
    return (error as SeedConfigError).message;
  }
  throw new Error('expected planSeedAccounts to throw');
}

describe('planSeedAccounts', () => {
  it('plans an ADMIN and a CLIENT when both pairs are complete', () => {
    expect(planSeedAccounts(BOTH)).toEqual({
      accounts: [
        {
          role: 'ADMIN',
          name: 'Administrador',
          email: 'admin@example.com',
          password: ADMIN_TEST_PASSWORD,
        },
        {
          role: 'CLIENT',
          name: 'Cliente',
          email: 'client@example.com',
          password: CLIENT_TEST_PASSWORD,
        },
      ],
      skipped: [],
    });
  });

  it('skips an absent pair', () => {
    const plan = planSeedAccounts({
      SEED_CLIENT_EMAIL: BOTH.SEED_CLIENT_EMAIL,
      SEED_CLIENT_PASSWORD: BOTH.SEED_CLIENT_PASSWORD,
    });
    expect(plan.accounts.map((account) => account.role)).toEqual(['CLIENT']);
    expect(plan.skipped).toEqual(['ADMIN']);
  });

  it('skips both pairs when nothing is set, treating empty values as unset', () => {
    expect(planSeedAccounts({ SEED_ADMIN_EMAIL: '', SEED_CLIENT_PASSWORD: '' })).toEqual({
      accounts: [],
      skipped: ['ADMIN', 'CLIENT'],
    });
  });

  it('normalizes the email', () => {
    const plan = planSeedAccounts({ ...BOTH, SEED_ADMIN_EMAIL: '  Admin@Example.COM ' });
    expect(plan.accounts[0]?.email).toBe('admin@example.com');
  });

  it.each([
    ['SEED_ADMIN_PASSWORD', { SEED_ADMIN_EMAIL: 'admin@example.com' }],
    ['SEED_ADMIN_EMAIL', { SEED_ADMIN_PASSWORD: ADMIN_TEST_PASSWORD }],
    ['SEED_CLIENT_PASSWORD', { SEED_CLIENT_EMAIL: 'client@example.com' }],
  ])('fails naming %s when its pair is partial', (missing, env) => {
    expect(failure(env)).toContain(`${missing}: must be set together`);
  });

  it('fails on an invalid email, naming the variable', () => {
    expect(failure({ ...BOTH, SEED_CLIENT_EMAIL: 'not-an-email' })).toContain(
      'SEED_CLIENT_EMAIL: E-mail inválido.',
    );
  });

  it('fails on a short password without printing it', () => {
    const message = failure({ ...BOTH, SEED_ADMIN_PASSWORD: 'test-1' });
    expect(message).toContain('SEED_ADMIN_PASSWORD: A senha deve ter no mínimo 8 caracteres.');
    expect(message).not.toContain('test-1');
  });

  it('reports every problem at once', () => {
    const message = failure({
      SEED_ADMIN_EMAIL: 'nope',
      SEED_ADMIN_PASSWORD: 'test-1',
      SEED_CLIENT_EMAIL: 'client@example.com',
    });
    expect(message).toContain('SEED_ADMIN_EMAIL:');
    expect(message).toContain('SEED_ADMIN_PASSWORD:');
    expect(message).toContain('SEED_CLIENT_PASSWORD:');
  });

  it('fails when both pairs use the same email', () => {
    expect(failure({ ...BOTH, SEED_CLIENT_EMAIL: 'ADMIN@example.com' })).toContain(
      'must be different',
    );
  });
});
