import type { Role } from '@scheduling/shared';
import { NavLink } from 'react-router';

import { cn } from '@/lib/utils';

import { navItemsFor } from '../navigation';

interface NavLinksProps {
  readonly role: Role;
  readonly orientation: 'horizontal' | 'vertical';
  readonly onNavigate?: () => void;
}

export function NavLinks({ role, orientation, onNavigate }: NavLinksProps) {
  return (
    <ul
      className={cn('flex', orientation === 'horizontal' ? 'items-center gap-1' : 'flex-col gap-1')}
    >
      {navItemsFor(role).map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                orientation === 'horizontal' && 'md:min-h-10',
                orientation === 'vertical' && 'text-base',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
