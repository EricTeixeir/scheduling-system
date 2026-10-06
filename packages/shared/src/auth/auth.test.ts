import { describe, expect, it } from 'vitest';

import { emailSchema, nameSchema, passwordSchema } from './fields';
import { loginSchema } from './login';
import { registerSchema } from './register';
import { userSchema } from './user';

const validRegistration = {
  name: 'Maria Silva',
  email: 'maria@example.com',
  password: 'segura123',
};

function firstMessage(result: { error?: { issues: { message: string }[] } | undefined }) {
  return result.error?.issues[0]?.message;
}

describe('emailSchema', () => {
  it('trims and lowercases before validating', () => {
    expect(emailSchema.parse('  Maria@Example.COM ')).toBe('maria@example.com');
  });

  it.each(['maria', 'maria@', '@example.com', '', '   '])('rejects %j', (value) => {
    expect(firstMessage(emailSchema.safeParse(value))).toBe('E-mail inválido.');
  });

  it('accepts 254 characters and rejects 255', () => {
    const emailOfLength = (lastLabel: number) =>
      `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(lastLabel)}.com`;
    expect(emailOfLength(57)).toHaveLength(254);
    expect(emailSchema.safeParse(emailOfLength(57)).success).toBe(true);
    expect(firstMessage(emailSchema.safeParse(emailOfLength(58)))).toBe(
      'O e-mail deve ter no máximo 254 caracteres.',
    );
  });

  it.each([42, null, undefined, ['a@b.com']])('rejects the non-string %j', (value) => {
    expect(firstMessage(emailSchema.safeParse(value))).toBe('Informe o e-mail.');
  });
});

describe('passwordSchema', () => {
  it.each([8, 128])('accepts %i characters', (length) => {
    expect(passwordSchema.safeParse('x'.repeat(length)).success).toBe(true);
  });

  it('rejects 7 characters', () => {
    expect(firstMessage(passwordSchema.safeParse('x'.repeat(7)))).toBe(
      'A senha deve ter no mínimo 8 caracteres.',
    );
  });

  it('rejects 129 characters', () => {
    expect(firstMessage(passwordSchema.safeParse('x'.repeat(129)))).toBe(
      'A senha deve ter no máximo 128 caracteres.',
    );
  });

  it('keeps surrounding spaces as part of the password', () => {
    expect(passwordSchema.parse('  senha123  ')).toBe('  senha123  ');
  });
});

describe('nameSchema', () => {
  it('trims the name', () => {
    expect(nameSchema.parse('  Maria  ')).toBe('Maria');
  });

  it('accepts 100 characters and rejects 101', () => {
    expect(nameSchema.safeParse('a'.repeat(100)).success).toBe(true);
    expect(firstMessage(nameSchema.safeParse('a'.repeat(101)))).toBe(
      'O nome deve ter no máximo 100 caracteres.',
    );
  });

  it('rejects a name that is blank after trimming', () => {
    expect(firstMessage(nameSchema.safeParse('   '))).toBe('Informe o nome.');
  });
});

describe('loginSchema', () => {
  it('accepts valid credentials and normalizes the email', () => {
    expect(loginSchema.parse({ email: ' Maria@Example.com', password: 'segura123' })).toEqual({
      email: 'maria@example.com',
      password: 'segura123',
    });
  });

  it('rejects unknown keys', () => {
    expect(
      loginSchema.safeParse({ email: 'maria@example.com', password: 'segura123', isAdmin: true })
        .success,
    ).toBe(false);
  });

  it.each([null, [], 'maria@example.com', {}])('rejects the payload %j', (payload) => {
    expect(loginSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a numeric password', () => {
    expect(loginSchema.safeParse({ email: 'maria@example.com', password: 12345678 }).success).toBe(
      false,
    );
  });
});

describe('registerSchema', () => {
  it('accepts a valid registration and normalizes name and email', () => {
    expect(
      registerSchema.parse({
        ...validRegistration,
        name: '  Maria Silva ',
        email: ' MARIA@example.com',
      }),
    ).toEqual(validRegistration);
  });

  it.each([
    ['role', 'ADMIN'],
    ['isAdmin', true],
  ])('rejects the extra field %s', (key, value) => {
    const result = registerSchema.safeParse({ ...validRegistration, [key]: value });
    expect(result.error?.issues[0]?.code).toBe('unrecognized_keys');
  });

  it.each(['name', 'email', 'password'])('rejects a missing %s', (missing) => {
    const payload = Object.fromEntries(
      Object.entries(validRegistration).filter(([key]) => key !== missing),
    );
    expect(registerSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects a numeric name', () => {
    expect(registerSchema.safeParse({ ...validRegistration, name: 123 }).success).toBe(false);
  });
});

describe('userSchema', () => {
  const user = {
    id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
    name: 'Maria Silva',
    email: 'maria@example.com',
    role: 'CLIENT',
  };

  it('accepts a user', () => {
    expect(userSchema.parse(user)).toEqual(user);
  });

  it('rejects an unknown role', () => {
    expect(userSchema.safeParse({ ...user, role: 'ROOT' }).success).toBe(false);
  });

  it('never outputs fields outside the contract, such as the password hash', () => {
    expect(userSchema.parse({ ...user, passwordHash: 'x' })).toEqual(user);
  });
});
