import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface InlineStateProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly tone?: 'muted' | 'destructive';
  readonly action?: ReactNode;
}

export function InlineState({
  icon: Icon,
  title,
  description,
  tone = 'muted',
  action,
}: InlineStateProps) {
  return (
    <div
      role={tone === 'destructive' ? 'alert' : undefined}
      className="flex flex-col items-center px-4 py-10 text-center"
    >
      <div
        className={cn(
          'mb-4 flex size-12 items-center justify-center rounded-xl',
          tone === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-accent text-primary',
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <p className="font-semibold text-balance">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-pretty text-muted-foreground">{description}</p>
      {action === undefined ? null : <div className="mt-5">{action}</div>}
    </div>
  );
}
