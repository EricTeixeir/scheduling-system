import { setTimeout as sleep } from 'node:timers/promises';

import { RULES_BASE_URL } from './config';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_AFTER_SECONDS = 65;

export interface RequestOptions {
  readonly json?: unknown;
  readonly rawBody?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly csrf?: boolean;
  readonly retryOnRateLimit?: boolean;
}

export interface ApiResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
  readonly body: unknown;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function retryAfterMs(headers: Headers): number {
  const seconds = Number(headers.get('retry-after') ?? '1');
  const bounded = Number.isFinite(seconds)
    ? Math.min(Math.max(seconds, 1), MAX_RETRY_AFTER_SECONDS)
    : 1;
  return bounded * 1000;
}

// A plain jar works over http://localhost because only browsers enforce the Secure cookie flag.
export class ApiClient {
  readonly #cookies = new Map<string, string>();

  async request(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const retries = options.retryOnRateLimit === false ? 0 : MAX_RATE_LIMIT_RETRIES;
    for (let attempt = 0; ; attempt++) {
      const response = await this.#send(method, path, options);
      if (response.status !== 429 || attempt >= retries) return response;
      await sleep(retryAfterMs(response.headers));
    }
  }

  async #send(method: string, path: string, options: RequestOptions): Promise<ApiResponse> {
    const headers = new Headers(options.headers);
    if (options.csrf !== false) headers.set('X-Requested-With', 'fetch');
    if (this.#cookies.size > 0) {
      headers.set(
        'Cookie',
        [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      );
    }
    let body: string | undefined;
    if (options.rawBody !== undefined) body = options.rawBody;
    else if (options.json !== undefined) body = JSON.stringify(options.json);
    if (body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(new URL(path, RULES_BASE_URL), {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    this.#storeCookies(response.headers.getSetCookie());
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, body: parseJson(text) };
  }

  #storeCookies(setCookies: readonly string[]): void {
    for (const line of setCookies) {
      const [pair = '', ...attributes] = line.split(';');
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
      if (expired || value === '') this.#cookies.delete(name);
      else this.#cookies.set(name, value);
    }
  }
}

const LEAK_PATTERNS: readonly RegExp[] = [
  /\bat [\w$.<>]+ \(/,
  /\bat (?:file:|[A-Z]:\\|\/)/,
  /node_modules/,
  /Error:/,
  /\/app\//,
  /\.(?:ts|js|mjs):\d+/,
];

export function leakedInternals(text: string): string[] {
  return LEAK_PATTERNS.filter((pattern) => pattern.test(text)).map(String);
}

export function problemCode(response: ApiResponse): string | undefined {
  const { body } = response;
  if (typeof body !== 'object' || body === null || !('code' in body)) return undefined;
  return typeof body.code === 'string' ? body.code : undefined;
}

export function problemMessage(response: ApiResponse): string {
  const { body } = response;
  if (typeof body !== 'object' || body === null) return '';
  const parts = [
    'title' in body ? body.title : undefined,
    'detail' in body ? body.detail : undefined,
  ];
  return parts.filter((part): part is string => typeof part === 'string').join(' — ');
}

export function describeResponse(response: ApiResponse): string {
  const code = problemCode(response) ?? '-';
  return `${String(response.status)} ${code} ${response.text.slice(0, 200)}`;
}
