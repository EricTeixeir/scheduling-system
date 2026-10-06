import { prepareActors, type RulesActors } from '../tests/rules/support/actors';
import { RULES_BASE_URL } from '../tests/rules/support/config';
import type { RuleOutcome } from '../tests/rules/support/outcome';
import {
  cancelledSlotIsBookableAgain,
  databaseRejectsPartialOverlap,
  raceForTheSameSlot,
} from '../tests/rules/support/rules/conflict';
import { invalidOperationsAreHandled } from '../tests/rules/support/rules/invalid';
import { futureSlotIsAccepted, pastTimesAreRefused } from '../tests/rules/support/rules/past';
import { dataSurvivesRestarts } from '../tests/rules/support/rules/persistence';

interface Rule {
  readonly title: string;
  readonly restartsTheStack?: boolean;
  readonly run: (actors: RulesActors) => Promise<RuleOutcome>;
}

const LABEL_WIDTH = 26;

function combine(headline: RuleOutcome, ...others: RuleOutcome[]): RuleOutcome {
  return {
    summary: headline.summary,
    failures: [headline, ...others].flatMap((outcome) => outcome.failures),
  };
}

const RULES: readonly Rule[] = [
  {
    title: 'Conflito de horários',
    run: async (actors) => {
      const race = await raceForTheSameSlot(actors);
      return combine(
        race,
        await cancelledSlotIsBookableAgain(actors, race),
        await databaseRejectsPartialOverlap(),
      );
    },
  },
  {
    title: 'Datas e horas passadas',
    run: async (actors) =>
      combine(await pastTimesAreRefused(actors), await futureSlotIsAccepted(actors)),
  },
  { title: 'Persistência', restartsTheStack: true, run: dataSurvivesRestarts },
  { title: 'Operações inválidas', run: invalidOperationsAreHandled },
];

async function runRule(rule: Rule, actors: RulesActors): Promise<RuleOutcome> {
  try {
    return await rule.run(actors);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { summary: 'erro ao executar a verificação', failures: [reason] };
  }
}

async function main(): Promise<number> {
  console.log(`Verificando regras de negócio em ${RULES_BASE_URL}\n`);
  const actors = await prepareActors();
  const executionOrder = [
    ...RULES.filter((rule) => rule.restartsTheStack !== true),
    ...RULES.filter((rule) => rule.restartsTheStack === true),
  ];
  const outcomes = new Map<Rule, RuleOutcome>();
  for (const rule of executionOrder) outcomes.set(rule, await runRule(rule, actors));
  const cleanupFailures = await actors.session.cancelEverythingCreated();

  let failed = 0;
  for (const rule of RULES) {
    const outcome = outcomes.get(rule) ?? { summary: 'não executada', failures: ['not run'] };
    const passed = outcome.failures.length === 0;
    if (!passed) failed++;
    console.log(`${passed ? '✔' : '✘'} ${rule.title.padEnd(LABEL_WIDTH)}(${outcome.summary})`);
    for (const failure of outcome.failures) console.log(`    - ${failure}`);
  }
  if (cleanupFailures.length > 0) {
    console.log('\nNão foi possível cancelar alguns agendamentos de teste:');
    for (const failure of cleanupFailures) console.log(`    - ${failure}`);
  }
  console.log(
    `\nUsuários de teste ficam com o prefixo ${actors.session.runId} (npm run down limpa tudo).`,
  );
  return failed === 0 && cleanupFailures.length === 0 ? 0 : 1;
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    console.error(
      'check:rules não conseguiu rodar:',
      error instanceof Error ? error.message : error,
    );
    console.error('A stack está de pé? Rode `npm run dev` (docker compose up --build) antes.');
    process.exitCode = 1;
  },
);
