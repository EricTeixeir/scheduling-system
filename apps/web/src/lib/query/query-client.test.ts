import { describe, expect, it, vi } from 'vitest';

import { createTestLogger } from '@/test/test-logger';

import { ApiError } from '../api/api-error';
import { createQueryClient, shouldRetryQuery } from './query-client';

const serverError = () => new ApiError({ kind: 'http', status: 500, title: 'x' });
const conflict = () => new ApiError({ kind: 'http', status: 409, title: 'x', code: 'SLOT_TAKEN' });

function setup() {
  const notifyError = vi.fn();
  const logger = createTestLogger();
  const client = createQueryClient({ notifyError, logger });
  return { client, notifyError, logger };
}

describe('createQueryClient', () => {
  it('logs a failed mutation and shows a toast', async () => {
    const { client, notifyError, logger } = setup();

    await expect(
      client
        .getMutationCache()
        .build(client, { mutationFn: () => Promise.reject(conflict()) })
        .execute(undefined),
    ).rejects.toBeInstanceOf(ApiError);

    expect(logger.warn).toHaveBeenCalledWith(
      'Mutation failed',
      expect.objectContaining({ status: 409, code: 'SLOT_TAKEN' }),
    );
    expect(notifyError).toHaveBeenCalledWith(
      'Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.',
    );
  });

  it('does not toast a mutation whose form shows the error inline', async () => {
    const { client, notifyError, logger } = setup();

    await expect(
      client
        .getMutationCache()
        .build(client, {
          mutationFn: () => Promise.reject(serverError()),
          meta: { handlesErrorInline: true },
        })
        .execute(undefined),
    ).rejects.toBeInstanceOf(ApiError);

    expect(logger.error).toHaveBeenCalledOnce();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('logs a failed first load without a toast (the page shows its error state)', async () => {
    const { client, notifyError, logger } = setup();

    await expect(
      client.query({
        queryKey: ['x'],
        queryFn: () => Promise.reject(conflict()),
        retry: false,
      }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(logger.warn).toHaveBeenCalledWith(
      'Query failed',
      expect.objectContaining({ queryKey: ['x'] }),
    );
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('toasts when a background refetch fails over cached data', async () => {
    const { client, notifyError } = setup();
    client.setQueryData(['x'], 'cached');

    await expect(
      client.query({
        queryKey: ['x'],
        queryFn: () => Promise.reject(serverError()),
        retry: false,
        staleTime: 0,
      }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(notifyError).toHaveBeenCalledWith(
      'O servidor encontrou um problema. Tente novamente em instantes.',
    );
  });
});

describe('shouldRetryQuery', () => {
  it('never retries client errors', () => {
    expect(shouldRetryQuery(0, conflict())).toBe(false);
  });

  it('retries server and network errors up to twice', () => {
    expect(shouldRetryQuery(0, serverError())).toBe(true);
    expect(shouldRetryQuery(1, new ApiError({ kind: 'network', status: 0, title: 'x' }))).toBe(
      true,
    );
    expect(shouldRetryQuery(2, serverError())).toBe(false);
  });
});
