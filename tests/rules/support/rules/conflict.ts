import { setTimeout as sleep } from 'node:timers/promises';

import type { RulesActors } from '../actors';
import { problemCode, type ApiClient } from '../http';
import { Findings, type RuleOutcome } from '../outcome';
import { appointmentId } from '../session';
import { runSqlInDatabase } from '../stack';

export const CONCURRENT_REQUESTS = 10;

export interface RaceOutcome extends RuleOutcome {
  readonly created: number;
  readonly rejected: number;
  readonly slot: string;
  readonly winnerId: string | undefined;
}

// The API also limits each IP to 100 requests per minute; the race must not hit that ceiling.
async function waitForIpBudget(client: ApiClient, needed: number): Promise<void> {
  const response = await client.request('GET', '/api/auth/me');
  const remaining = Number(response.headers.get('x-ratelimit-remaining') ?? Infinity);
  const resetSeconds = Number(response.headers.get('x-ratelimit-reset') ?? 0);
  if (remaining < needed) await sleep((resetSeconds + 1) * 1000);
}

export async function raceForTheSameSlot({ session, racer }: RulesActors): Promise<RaceOutcome> {
  const findings = new Findings();
  const [slot = ''] = await session.freeSlots(racer, 1);
  await waitForIpBudget(racer, CONCURRENT_REQUESTS + 5);

  const responses = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, () =>
      session.book(racer, slot, { retryOnRateLimit: false }),
    ),
  );
  const winners = responses.filter((response) => response.status === 201);
  const rejected = responses.filter(
    (response) => response.status === 409 && problemCode(response) === 'SLOT_TAKEN',
  );
  findings.check(winners.length === 1, `expected exactly 1 created, got ${String(winners.length)}`);
  findings.check(
    rejected.length === CONCURRENT_REQUESTS - 1,
    `expected ${String(CONCURRENT_REQUESTS - 1)} rejected with 409 SLOT_TAKEN, got ${String(rejected.length)} (statuses: ${responses.map((r) => r.status).join(',')})`,
  );
  responses.forEach((response, index) =>
    findings.expectNoLeak(`request ${String(index + 1)}`, response),
  );

  const [winner] = winners;
  return {
    failures: findings.failures,
    summary: `${String(winners.length)} criado, ${String(rejected.length)} rejeitados com 409`,
    created: winners.length,
    rejected: rejected.length,
    slot,
    winnerId: winner === undefined ? undefined : appointmentId(winner),
  };
}

export async function cancelledSlotIsBookableAgain(
  { session, racer, client }: RulesActors,
  race: RaceOutcome,
): Promise<RuleOutcome> {
  const findings = new Findings();
  if (race.winnerId === undefined) {
    findings.check(false, 'the race produced no appointment to cancel');
    return { failures: findings.failures, summary: 'sem agendamento para cancelar' };
  }
  const takenAgain = await session.book(client, race.slot);
  findings.expectStatus('booking the taken slot', takenAgain, 409, 'SLOT_TAKEN');
  const cancelled = await session.cancel(racer, race.winnerId);
  findings.expectStatus('cancelling the winner', cancelled, 200);
  const rebooked = await session.book(client, race.slot);
  findings.expectStatus('re-booking the freed slot', rebooked, 201);
  return { failures: findings.failures, summary: 'horário cancelado volta a ficar livre' };
}

const ADJACENT = 'adjacent-accepted';
const OVERLAP = 'overlap-accepted';

// Partial overlap cannot be requested through the API (slots are a fixed grid), so it is checked
// against the no_overlap exclusion constraint itself, inside a transaction that never commits.
const PARTIAL_OVERLAP_SQL = `
BEGIN;
CREATE TEMP TABLE rules_owner AS SELECT id FROM users ORDER BY created_at LIMIT 1;
INSERT INTO appointments (user_id, starts_at, ends_at, updated_at)
  SELECT id, '2000-01-03T10:00:00Z', '2000-01-03T10:30:00Z', now() FROM rules_owner;
INSERT INTO appointments (user_id, starts_at, ends_at, updated_at)
  SELECT id, '2000-01-03T10:30:00Z', '2000-01-03T11:00:00Z', now() FROM rules_owner;
SELECT '${ADJACENT}';
INSERT INTO appointments (user_id, starts_at, ends_at, updated_at)
  SELECT id, '2000-01-03T10:15:00Z', '2000-01-03T10:45:00Z', now() FROM rules_owner;
SELECT '${OVERLAP}';
ROLLBACK;
`;

export async function databaseRejectsPartialOverlap(): Promise<RuleOutcome> {
  const findings = new Findings();
  const result = await runSqlInDatabase(PARTIAL_OVERLAP_SQL);
  findings.check(
    result.stdout.includes(ADJACENT),
    `back-to-back slots were not accepted: ${result.stderr.trim()}`,
  );
  findings.check(
    !result.stdout.includes(OVERLAP),
    'a partially overlapping appointment was accepted',
  );
  findings.check(
    result.exitCode !== 0 && result.stderr.includes('no_overlap'),
    `expected the no_overlap constraint to refuse the overlap, got exit ${String(result.exitCode)}: ${result.stderr.trim()}`,
  );
  return { failures: findings.failures, summary: 'sobreposição parcial recusada pelo banco' };
}
