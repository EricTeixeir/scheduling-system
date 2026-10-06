import { BASE_URL } from '../tests/rules/api';
import { prepareActors, RULES, type Outcome, type Rule, type Actors } from '../tests/rules/rules';

const TITLE_WIDTH = 26;

async function checkSafely(rule: Rule, actors: Actors): Promise<Outcome> {
  try {
    return await rule.check(actors);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { summary: 'erro ao executar a verificação', failures: [reason] };
  }
}

async function main(): Promise<boolean> {
  console.log(`Verificando regras de negócio em ${BASE_URL}\n`);
  const actors = await prepareActors();
  let allPassed = true;
  for (const rule of RULES) {
    const { summary, failures } = await checkSafely(rule, actors);
    const passed = failures.length === 0;
    allPassed &&= passed;
    console.log(`${passed ? '✔' : '✘'} ${rule.title.padEnd(TITLE_WIDTH)}(${summary})`);
    for (const failure of failures) console.log(`    - ${failure}`);
  }
  return allPassed;
}

main().then(
  (allPassed) => {
    process.exitCode = allPassed ? 0 : 1;
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
