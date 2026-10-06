import type { ProblemDetails } from '@scheduling/shared';

import type { AppError } from '../errors/app-errors';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export function problemType(code: AppError['code']): string {
  return `urn:scheduling:problem:${code.toLowerCase().replaceAll('_', '-')}`;
}

export function toProblemDetails(error: AppError, requestId: string): ProblemDetails {
  return {
    type: problemType(error.code),
    title: error.title,
    status: error.status,
    ...(error.detail === undefined ? {} : { detail: error.detail }),
    instance: `urn:uuid:${requestId}`,
    code: error.code,
    ...(error.errors === undefined ? {} : { errors: [...error.errors] }),
    ...(error.conflicts === undefined ? {} : { conflicts: [...error.conflicts] }),
  };
}
