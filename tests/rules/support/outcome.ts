import { describeResponse, leakedInternals, problemCode, type ApiResponse } from './http';

export interface RuleOutcome {
  readonly failures: readonly string[];
  readonly summary: string;
}

export class Findings {
  readonly failures: string[] = [];

  check(condition: boolean, failure: string): boolean {
    if (!condition) this.failures.push(failure);
    return condition;
  }

  expectStatus(label: string, response: ApiResponse, status: number, code?: string): boolean {
    const codeMatches = code === undefined || problemCode(response) === code;
    const ok = this.check(
      response.status === status && codeMatches,
      `${label}: expected ${String(status)}${code === undefined ? '' : ` ${code}`}, got ${describeResponse(response)}`,
    );
    return this.expectNoLeak(label, response) && ok;
  }

  expectNoLeak(label: string, response: ApiResponse): boolean {
    const leaks = leakedInternals(response.text);
    return this.check(
      leaks.length === 0,
      `${label}: response leaks internals (${leaks.join(', ')})`,
    );
  }
}
