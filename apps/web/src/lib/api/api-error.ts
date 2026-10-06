import {
  problemDetailsSchema,
  type ErrorCode,
  type FieldError,
  type ScheduleConflict,
} from '@scheduling/shared';

export type ApiErrorKind = 'http' | 'network' | 'invalid-response';

export interface ApiErrorInit {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly title: string;
  readonly code?: ErrorCode | undefined;
  readonly detail?: string | undefined;
  readonly fieldErrors?: readonly FieldError[] | undefined;
  readonly conflicts?: readonly ScheduleConflict[] | undefined;
  readonly cause?: unknown;
}

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly title: string;
  readonly code: ErrorCode | undefined;
  readonly detail: string | undefined;
  readonly fieldErrors: readonly FieldError[];
  readonly conflicts: readonly ScheduleConflict[];

  constructor({
    kind,
    status,
    title,
    code,
    detail,
    fieldErrors = [],
    conflicts = [],
    cause,
  }: ApiErrorInit) {
    super(detail ?? title, cause === undefined ? undefined : { cause });
    this.kind = kind;
    this.status = status;
    this.title = title;
    this.code = code;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
    this.conflicts = conflicts;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const problem = problemDetailsSchema.safeParse(await readJson(response));
  if (!problem.success) {
    return new ApiError({
      kind: 'http',
      status: response.status,
      title: response.statusText || `HTTP ${String(response.status)}`,
    });
  }
  const { title, code, detail, errors, conflicts } = problem.data;
  return new ApiError({
    kind: 'http',
    status: response.status,
    title,
    code,
    detail,
    fieldErrors: errors,
    conflicts,
  });
}

export function networkError(cause: unknown): ApiError {
  return new ApiError({ kind: 'network', status: 0, title: 'Network failure', cause });
}

export function invalidResponseError(status: number, cause?: unknown): ApiError {
  return new ApiError({ kind: 'invalid-response', status, title: 'Invalid response', cause });
}
