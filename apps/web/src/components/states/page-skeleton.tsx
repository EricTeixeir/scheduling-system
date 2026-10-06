import { Skeleton } from '@/components/ui/skeleton';

export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-6 py-2">
      <span className="sr-only">Carregando…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="hidden h-28 rounded-xl lg:block" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

export function FullScreenLoader() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-20 sm:px-6">
      <PageSkeleton />
    </div>
  );
}
