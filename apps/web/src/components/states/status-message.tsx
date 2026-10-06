import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';

interface StatusMessageProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly badge?: string;
  readonly tone?: 'primary' | 'destructive';
  readonly action?: ReactNode;
}

export function StatusMessage({
  icon: Icon,
  title,
  description,
  badge,
  tone = 'primary',
  action,
}: StatusMessageProps) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center px-2 py-12 text-center sm:py-20">
      <div
        className={
          tone === 'destructive'
            ? 'mb-5 flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive'
            : 'mb-5 flex size-16 items-center justify-center rounded-2xl bg-accent text-primary'
        }
      >
        <Icon className="size-8" aria-hidden="true" />
      </div>
      {badge === undefined ? null : (
        <Badge variant="secondary" className="mb-3">
          {badge}
        </Badge>
      )}
      <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{title}</h1>
      <p className="mt-2 text-sm text-pretty text-muted-foreground sm:text-base">{description}</p>
      {action === undefined ? null : <div className="mt-6">{action}</div>}
    </section>
  );
}
