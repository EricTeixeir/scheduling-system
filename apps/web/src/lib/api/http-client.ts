import type { z } from 'zod';

import { logger as defaultLogger, type Logger } from '../logger';
import {
  apiErrorFromResponse,
  invalidResponseError,
  networkError,
  type ApiError,
} from './api-error';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  readonly method?: HttpMethod;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal | undefined;
}

export interface ApiClient {
  request<Schema extends z.ZodType>(
    path: string,
    options: RequestOptions & { readonly schema: Schema },
  ): Promise<z.output<Schema>>;
  request(path: string, options?: RequestOptions): Promise<void>;
}

export interface ApiClientOptions {
  readonly onSessionExpired: () => void;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly logger?: Logger;
}

export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_HEADER_VALUE = 'fetch';
export const REFRESH_PATH = '/auth/refresh';

// A 401 from these means "wrong credentials" or "no session to renew", not "access token expired".
const PATHS_WITHOUT_REFRESH = new Set([
  '/auth/login',
  '/auth/register',
  REFRESH_PATH,
  '/auth/logout',
]);

type RefreshOutcome =
  | { readonly kind: 'renewed' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'unavailable'; readonly error: ApiError };

export function createApiClient({
  onSessionExpired,
  baseUrl = '/api',
  fetch: fetchImpl = (input, init) => fetch(input, init),
  logger = defaultLogger,
}: ApiClientOptions): ApiClient {
  let refreshInFlight: Promise<RefreshOutcome> | undefined;
  let sessionGeneration = 0;

  async function sendOnce(
    path: string,
    { method = 'GET', body, headers: extraHeaders = {}, signal }: RequestOptions,
  ): Promise<Response> {
    const headers = new Headers(extraHeaders);
    headers.set('Accept', 'application/json, application/problem+json');
    if (method !== 'GET') headers.set(CSRF_HEADER, CSRF_HEADER_VALUE);
    if (body !== undefined) headers.set('Content-Type', 'application/json');

    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        credentials: 'include',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      if (signal?.aborted === true) throw error;
      throw networkError(error);
    }
  }

  async function performRefresh(): Promise<RefreshOutcome> {
    let response: Response;
    try {
      response = await sendOnce(REFRESH_PATH, { method: 'POST' });
    } catch (error) {
      return { kind: 'unavailable', error: error as ApiError };
    }
    if (response.ok) {
      sessionGeneration += 1;
      return { kind: 'renewed' };
    }
    const error = await apiErrorFromResponse(response);
    if (error.code === 'REFRESH_RACE') {
      logger.info('Session was renewed by another tab; retrying', { path: REFRESH_PATH });
      return { kind: 'renewed' };
    }
    if (error.status === 401) return { kind: 'expired' };
    return { kind: 'unavailable', error };
  }

  function refreshSession(): Promise<RefreshOutcome> {
    refreshInFlight ??= performRefresh().finally(() => {
      refreshInFlight = undefined;
    });
    return refreshInFlight;
  }

  function expireSession(path: string) {
    logger.warn('Session expired', { path });
    onSessionExpired();
  }

  async function send(path: string, options: RequestOptions): Promise<Response> {
    const generationAtSend = sessionGeneration;
    const response = await sendOnce(path, options);
    if (response.status !== 401 || PATHS_WITHOUT_REFRESH.has(path)) return response;

    // A refresh that finished after this request left already renewed the cookies: just retry.
    if (generationAtSend === sessionGeneration) {
      const outcome = await refreshSession();
      if (outcome.kind === 'unavailable') throw outcome.error;
      if (outcome.kind === 'expired') {
        expireSession(path);
        return response;
      }
    }

    const retried = await sendOnce(path, options);
    if (retried.status === 401) expireSession(path);
    return retried;
  }

  async function parseBody<Schema extends z.ZodType>(
    response: Response,
    schema: Schema,
    path: string,
  ): Promise<z.output<Schema>> {
    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      logger.error('Response body is not JSON', { path, status: response.status, error });
      throw invalidResponseError(response.status, error);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      logger.error('Response does not match the contract', {
        path,
        status: response.status,
        issues: parsed.error.issues,
      });
      throw invalidResponseError(response.status, parsed.error);
    }
    return parsed.data;
  }

  function request<Schema extends z.ZodType>(
    path: string,
    options: RequestOptions & { readonly schema: Schema },
  ): Promise<z.output<Schema>>;
  function request(path: string, options?: RequestOptions): Promise<void>;
  async function request(
    path: string,
    options: RequestOptions & { readonly schema?: z.ZodType } = {},
  ): Promise<unknown> {
    if (!path.startsWith('/')) throw new Error(`API path must start with "/": ${path}`);
    const response = await send(path, options);
    if (!response.ok) throw await apiErrorFromResponse(response);
    if (options.schema === undefined) return undefined;
    return parseBody(response, options.schema, path);
  }

  return { request };
}
