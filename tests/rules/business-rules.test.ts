import { beforeAll, expect, it } from 'vitest';

import { prepareActors, RULES, type Actors } from './rules';

let actors: Actors;

beforeAll(async () => {
  actors = await prepareActors();
});

for (const rule of RULES) {
  it(`${rule.key}: ${rule.title}`, async () => {
    expect((await rule.check(actors)).failures).toEqual([]);
  });
}
