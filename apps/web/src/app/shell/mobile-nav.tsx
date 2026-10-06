import type { User } from '@scheduling/shared';
import { LogOut, Menu } from 'lucide-react';
import { useState } from 'react';

import { Brand } from '@/components/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import { ROLE_LABELS } from '../navigation';
import { NavLinks } from './nav-links';
import { UserAvatar } from './user-avatar';

interface MobileNavProps {
  readonly user: User;
  readonly onLogout: () => void;
  readonly loggingOut: boolean;
}

export function MobileNav({ user, onLogout, loggingOut }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir menu">
          <Menu className="size-6" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-xs gap-0">
        <SheetHeader className="pr-14">
          <SheetTitle>
            <Brand />
          </SheetTitle>
          <SheetDescription className="sr-only">Navegação principal</SheetDescription>
        </SheetHeader>
        <Separator />
        <nav aria-label="Principal" className="p-3">
          <NavLinks role={user.role} orientation="vertical" onNavigate={close} />
        </nav>
        <SheetFooter className="gap-3 border-t">
          <div className="flex items-center gap-3">
            <UserAvatar name={user.name} className="size-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
          <Button
            variant="outline"
            className="w-full"
            disabled={loggingOut}
            onClick={() => {
              close();
              onLogout();
            }}
          >
            <LogOut aria-hidden="true" />
            Sair
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
