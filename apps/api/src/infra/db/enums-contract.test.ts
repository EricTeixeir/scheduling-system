import { APPOINTMENT_STATUSES, ROLES } from '@scheduling/shared';
import { describe, expect, it } from 'vitest';

import { AppointmentStatus, Role } from './generated/enums.js';

// The shared package cannot depend on Prisma, so drift from the database enums is caught here.
describe('shared enums match the database enums', () => {
  it('appointment statuses', () => {
    expect([...APPOINTMENT_STATUSES].sort()).toEqual(Object.values(AppointmentStatus).sort());
  });

  it('roles', () => {
    expect([...ROLES].sort()).toEqual(Object.values(Role).sort());
  });
});
