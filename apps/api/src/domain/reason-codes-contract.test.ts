import type { ErrorCode } from '@scheduling/shared';
import { describe, expectTypeOf, it } from 'vitest';

import type { TransitionRefusal } from './appointment/appointment-status';
import type { BookingWindowRefusal, ClientCancellationRefusal } from './appointment/booking-policy';
import type { SlotRefusal } from './availability/slots';

// Enforced by `npm run typecheck`: a refusal without a matching ErrorCode stops compiling.
type DomainRefusal =
  BookingWindowRefusal | ClientCancellationRefusal | TransitionRefusal | SlotRefusal;

describe('domain refusals map onto shared error codes', () => {
  it('every domain refusal is an ErrorCode', () => {
    expectTypeOf<DomainRefusal>().toExtend<ErrorCode>();
  });
});
