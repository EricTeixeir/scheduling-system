export interface SeedWeeklyHours {
  readonly weekday: number;
  readonly opensAt: string;
  readonly closesAt: string;
}

export const SEED_SLOT_MINUTES = 30;

// Sunday (0) has no row, which means closed.
export const SEED_WEEKLY_HOURS: readonly SeedWeeklyHours[] = [
  { weekday: 1, opensAt: '09:00', closesAt: '18:00' },
  { weekday: 2, opensAt: '09:00', closesAt: '18:00' },
  { weekday: 3, opensAt: '09:00', closesAt: '18:00' },
  { weekday: 4, opensAt: '09:00', closesAt: '18:00' },
  { weekday: 5, opensAt: '09:00', closesAt: '18:00' },
  { weekday: 6, opensAt: '09:00', closesAt: '13:00' },
];
