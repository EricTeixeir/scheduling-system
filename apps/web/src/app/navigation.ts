import type { Role } from '@scheduling/shared';
import { CalendarCheck, CalendarPlus, LayoutDashboard, type LucideIcon } from 'lucide-react';

export const PATHS = {
  home: '/',
  login: '/login',
  register: '/cadastro',
  book: '/agendar',
  myAppointments: '/meus-agendamentos',
  admin: '/admin',
} as const;

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

const NAV_ITEMS_BY_ROLE: Readonly<Record<Role, readonly NavItem[]>> = {
  CLIENT: [
    { to: PATHS.book, label: 'Agendar', icon: CalendarPlus },
    { to: PATHS.myAppointments, label: 'Meus agendamentos', icon: CalendarCheck },
  ],
  ADMIN: [{ to: PATHS.admin, label: 'Painel', icon: LayoutDashboard }],
};

const HOME_BY_ROLE: Readonly<Record<Role, string>> = {
  CLIENT: PATHS.book,
  ADMIN: PATHS.admin,
};

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  CLIENT: 'Cliente',
  ADMIN: 'Administrador',
};

export function navItemsFor(role: Role): readonly NavItem[] {
  // eslint-disable-next-line security/detect-object-injection -- role is a typed Role, never free-form input.
  return NAV_ITEMS_BY_ROLE[role];
}

export function isAreaOf(role: Role, path: string): boolean {
  const { pathname } = new URL(path, 'http://app.local');
  return navItemsFor(role).some(({ to }) => pathname === to || pathname.startsWith(`${to}/`));
}

export function homePathFor(role: Role): string {
  // eslint-disable-next-line security/detect-object-injection -- role is a typed Role, never free-form input.
  return HOME_BY_ROLE[role];
}
