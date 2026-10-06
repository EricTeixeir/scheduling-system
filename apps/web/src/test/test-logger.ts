import { vi } from 'vitest';

import type { Logger } from '@/lib/logger';

export function createTestLogger() {
  return {
    debug: vi.fn<Logger['debug']>(),
    info: vi.fn<Logger['info']>(),
    warn: vi.fn<Logger['warn']>(),
    error: vi.fn<Logger['error']>(),
    addSink: vi.fn<Logger['addSink']>(() => () => undefined),
  } satisfies Logger;
}
