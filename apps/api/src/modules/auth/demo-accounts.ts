import type { DemoAccount } from '@scheduling/shared';

export interface DemoUser extends DemoAccount {
  readonly name: string;
}

// Public on purpose and the single source for GET /api/auth/demo-accounts and the seed. Not in
// compose or .env files: Compose interpolates the `$` in these values.
export const DEMO_USERS: readonly DemoUser[] = Object.freeze([
  {
    role: 'ADMIN',
    name: 'Administrador Demo',
    email: 'euro@admin.com',
    password: '1$3@Euro', // sample credential, published by design in demo mode
  },
  {
    role: 'CLIENT',
    name: 'Cliente Demo',
    email: 'euro@user.com',
    password: 'Euro@3$1', // sample credential, published by design in demo mode
  },
]);

export const DEMO_NOTICE =
  'Credenciais de demonstração, disponíveis apenas no modo demo. Não use em produção.';
