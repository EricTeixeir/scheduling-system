import { z } from 'zod';

const count = z.number().int().nonnegative();

// Days are business-time-zone calendar days; "last 30 days" ends today, inclusive.
export const adminSummarySchema = z.object({
  todayConfirmed: count,
  next7DaysConfirmed: count,
  completedLast30Days: count,
  noShowLast30Days: count,
  cancelledLast30Days: count,
});

export type AdminSummary = z.output<typeof adminSummarySchema>;
