import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';

export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

interface SurfaceProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: ReactNode;
  readonly children?: ReactNode;
  readonly footer: ReactNode;
}

function BottomSheetSurface({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: SurfaceProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="pr-14 text-left">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        {children === undefined ? null : <div className="px-4">{children}</div>}
        <SheetFooter className="flex-col-reverse">{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CenteredDialogSurface({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: SurfaceProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ConfirmSurfaceProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: ReactNode;
  readonly children?: ReactNode;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly dismissLabel: string;
  readonly tone?: 'default' | 'destructive';
  readonly pending: boolean;
  readonly onConfirm: () => void;
}

export function ConfirmSurface({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel,
  dismissLabel,
  tone = 'default',
  pending,
  onConfirm,
}: ConfirmSurfaceProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const Surface = isDesktop ? CenteredDialogSurface : BottomSheetSurface;
  const changeOpen = (next: boolean) => {
    if (!pending) onOpenChange(next);
  };

  return (
    <Surface
      open={open}
      onOpenChange={changeOpen}
      title={title}
      description={description}
      footer={
        <>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              changeOpen(false);
            }}
          >
            {dismissLabel}
          </Button>
          <Button variant={tone} disabled={pending} onClick={onConfirm}>
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                {pendingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </>
      }
    >
      {children}
    </Surface>
  );
}
