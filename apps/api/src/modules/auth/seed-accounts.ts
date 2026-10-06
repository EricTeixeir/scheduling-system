import { emailSchema, passwordSchema, type Role } from '@scheduling/shared';
import type { z } from 'zod';

export interface SeedAccount {
  readonly role: Role;
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface SeedAccountsPlan {
  readonly accounts: readonly SeedAccount[];
  readonly skipped: readonly Role[];
}

export class SeedConfigError extends Error {
  override readonly name = 'SeedConfigError';
}

const SEED_PAIRS = [
  {
    role: 'ADMIN',
    name: 'Administrador',
    emailVariable: 'SEED_ADMIN_EMAIL',
    passwordVariable: 'SEED_ADMIN_PASSWORD',
  },
  {
    role: 'CLIENT',
    name: 'Cliente',
    emailVariable: 'SEED_CLIENT_EMAIL',
    passwordVariable: 'SEED_CLIENT_PASSWORD',
  },
] as const;

type SeedVariable = (typeof SEED_PAIRS)[number]['emailVariable' | 'passwordVariable'];

function readVariable(env: NodeJS.ProcessEnv, name: SeedVariable): string | undefined {
  // eslint-disable-next-line security/detect-object-injection -- name is one of four constants.
  const value = env[name];
  return value === undefined || value === '' ? undefined : value;
}

function issueOf(schema: z.ZodType<string>, value: string): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : (result.error.issues[0]?.message ?? 'inválido');
}

export function planSeedAccounts(env: NodeJS.ProcessEnv): SeedAccountsPlan {
  const accounts: SeedAccount[] = [];
  const skipped: Role[] = [];
  const problems: string[] = [];

  for (const { role, name, emailVariable, passwordVariable } of SEED_PAIRS) {
    const rawEmail = readVariable(env, emailVariable);
    const password = readVariable(env, passwordVariable);
    if (rawEmail === undefined && password === undefined) {
      skipped.push(role);
      continue;
    }
    if (rawEmail === undefined || password === undefined) {
      const missing = rawEmail === undefined ? emailVariable : passwordVariable;
      problems.push(`${missing}: must be set together with the other variable of its pair`);
      continue;
    }
    const emailIssue = issueOf(emailSchema, rawEmail);
    const passwordIssue = issueOf(passwordSchema, password);
    if (emailIssue !== undefined) problems.push(`${emailVariable}: ${emailIssue}`);
    if (passwordIssue !== undefined) problems.push(`${passwordVariable}: ${passwordIssue}`);
    if (emailIssue === undefined && passwordIssue === undefined) {
      accounts.push({ role, name, email: emailSchema.parse(rawEmail), password });
    }
  }

  const [admin, client] = accounts;
  if (admin !== undefined && client !== undefined && admin.email === client.email) {
    problems.push('SEED_ADMIN_EMAIL and SEED_CLIENT_EMAIL: must be different');
  }
  if (problems.length > 0) {
    throw new SeedConfigError(
      `Invalid seed account variables:\n${problems.map((line) => `  - ${line}`).join('\n')}`,
    );
  }
  return { accounts, skipped };
}
