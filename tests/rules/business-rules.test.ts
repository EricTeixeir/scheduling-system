import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prepareActors, type RulesActors } from './support/actors';
import {
  cancelledSlotIsBookableAgain,
  CONCURRENT_REQUESTS,
  databaseRejectsPartialOverlap,
  raceForTheSameSlot,
  type RaceOutcome,
} from './support/rules/conflict';
import { invalidOperationsAreHandled } from './support/rules/invalid';
import { futureSlotIsAccepted, pastTimesAreRefused } from './support/rules/past';
import { dataSurvivesRestarts } from './support/rules/persistence';

let actors: RulesActors;

beforeAll(async () => {
  actors = await prepareActors();
});

// Users cannot be deleted through the API and audit events are append-only, so the prefixed
// rules-<run>-*@example.test accounts remain; `npm run down` resets the whole database.
afterAll(async () => {
  expect(await actors.session.cancelEverythingCreated()).toEqual([]);
});

describe('conflito de horários', () => {
  let race: RaceOutcome;

  it(`aceita só 1 de ${String(CONCURRENT_REQUESTS)} pedidos simultâneos para o mesmo horário (os demais 409 SLOT_TAKEN)`, async () => {
    race = await raceForTheSameSlot(actors);
    expect(race.failures).toEqual([]);
    expect([race.created, race.rejected]).toEqual([1, CONCURRENT_REQUESTS - 1]);
  });

  it('libera o horário quando o agendamento é cancelado (novo agendamento → 201)', async () => {
    expect((await cancelledSlotIsBookableAgain(actors, race)).failures).toEqual([]);
  });

  it('o banco recusa sobreposição parcial (constraint no_overlap) e aceita horários encostados', async () => {
    expect((await databaseRejectsPartialOverlap()).failures).toEqual([]);
  });
});

describe('datas e horas no passado', () => {
  it('recusa ontem, uma hora atrás e o horário que começa agora com 422 e mensagem em pt-BR', async () => {
    const outcome = await pastTimesAreRefused(actors);
    expect(outcome.failures).toEqual([]);
    expect(outcome.rejected).toBe(3);
  });

  it('aceita um horário futuro livre (201)', async () => {
    expect((await futureSlotIsAccepted(actors)).failures).toEqual([]);
  });
});

describe('operações inválidas (invalid)', () => {
  it('responde com o status certo e sem vazar stack trace ou caminhos internos', async () => {
    const outcome = await invalidOperationsAreHandled(actors);
    expect(outcome.failures).toEqual([]);
    expect(outcome.handled).toBe(outcome.total);
  });
});

// Last on purpose: restarting the API also resets its in-memory rate-limit counters.
describe('persistência', () => {
  it('mantém os dados após reiniciar a API e o banco (volume nomeado)', async () => {
    expect((await dataSurvivesRestarts(actors)).failures).toEqual([]);
  });
});
