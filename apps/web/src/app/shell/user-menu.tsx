import type { User } from '@scheduling/shared';
import { ChevronDown, LogOut } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ROLE_LABELS } from '../navigation';
import { UserAvatar } from './user-avatar';

interface UserMenuProps {
  readonly user: User;
  readonly onLogout: () => void;
  readonly loggingOut: boolean;
}

export function UserMenu({ user, onLogout, loggingOut }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label={`Menu da conta de ${user.name}`}>
          <UserAvatar name={user.name} />
          <span className="max-w-40 truncate text-sm font-medium">{user.name}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-1.5 py-2">
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
          <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={loggingOut} onSelect={onLogout}>
          <LogOut aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
