import { isNonEmptyString } from '@scheduling/shared';

export interface HealthStatus {
  status: 'ok';
  service: string;
}

export function buildHealthStatus(service: string): HealthStatus {
  if (!isNonEmptyString(service)) {
    throw new Error('service name must be a non-empty string');
  }
  return { status: 'ok', service };
}
