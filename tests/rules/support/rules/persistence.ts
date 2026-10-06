import { appointmentSchema, paginatedSchema } from '@scheduling/shared';

import type { RulesActors } from '../actors';
import { describeResponse, type ApiClient } from '../http';
import { Findings, type RuleOutcome } from '../outcome';
import { appointmentId } from '../session';
import { restartService, waitUntilReady } from '../stack';

const appointmentPage = paginatedSchema(appointmentSchema);

async function confirmedAppointmentProblem(
  client: ApiClient,
  id: string,
): Promise<string | undefined> {
  const response = await client.request('GET', '/api/appointments?scope=upcoming&pageSize=50');
  const page = appointmentPage.safeParse(response.body);
  if (response.status !== 200 || !page.success) {
    return `listing failed: ${describeResponse(response)}`;
  }
  const status = page.data.items.find((item) => item.id === id)?.status;
  return status === 'CONFIRMED' ? undefined : `appointment ${id} is ${status ?? 'missing'}`;
}

export async function dataSurvivesRestarts({ session, client }: RulesActors): Promise<RuleOutcome> {
  const findings = new Findings();
  const [slot = ''] = await session.freeSlots(client, 1);
  const created = await session.book(client, slot);
  if (!findings.expectStatus('creating the appointment', created, 201)) {
    return { failures: findings.failures, summary: 'não foi possível criar o agendamento' };
  }
  const id = appointmentId(created);

  for (const service of ['api', 'db'] as const) {
    await restartService(service);
    await waitUntilReady();
    const problem = await confirmedAppointmentProblem(client, id);
    findings.check(problem === undefined, `after restarting ${service}: ${problem ?? ''}`);
  }
  return { failures: findings.failures, summary: 'dados mantidos após restart' };
}
