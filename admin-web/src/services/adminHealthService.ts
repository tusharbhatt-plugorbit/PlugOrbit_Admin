import { http } from '@/api/http';
import type { HealthRow, HealthSummary, Overview, Page } from '@/api/types';

export const adminHealthService = {
  summary: (signal?: AbortSignal) => http.get<HealthSummary>('/health/summary', undefined, { signal }),
  chargers: (query: { severity?: string; partnerId?: string; stationId?: string; status?: string; q?: string }, signal?: AbortSignal) =>
    http.get<Page<HealthRow>>('/health/chargers', { limit: 200, ...query }, { signal }),
  /** The Overview: "what needs my attention right now?" */
  overview: (signal?: AbortSignal) => http.get<Overview>('/overview', undefined, { signal }),
};
