import type { TransitionRefusal } from '../../domain/appointment/appointment-status';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  type AppError,
} from '../../errors/app-errors';

export function transitionError(
  reason: TransitionRefusal,
  invalidTransitionDetail: string,
): AppError {
  switch (reason) {
    case 'INVALID_TRANSITION':
      return new ConflictError(reason, invalidTransitionDetail);
    case 'ACTOR_NOT_ALLOWED':
      return new ForbiddenError(reason);
    case 'CANCEL_DEADLINE_PASSED':
    case 'NOT_STARTED_YET':
    case 'ALREADY_STARTED':
      return new BusinessRuleError(reason);
  }
}
