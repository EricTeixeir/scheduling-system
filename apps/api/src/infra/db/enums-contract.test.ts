import { APPOINTMENT_STATUSES, ROLES } from '@scheduling/shared';
import { describe, expect, it } from 'vitest';

import { AppointmentStatus, Role } from './generated/enums.js';

// The shared contract cannot depend on Prisma, so drift between the database
// enums and the values the api and web agree on is caught here instead.
// Order is irrelevant to the contract, so values are compared sorted.
describe('shared enums match the database enums', () => {
  it('appointment statuses', () => {
    expect([...APPOINTMENT_STATUSES].sort()).toEqual(Object.values(AppointmentStatus).sort());
  });

  it('roles', () => {
    expect([...ROLES].sort()).toEqual(Object.values(Role).sort());
  });
});
