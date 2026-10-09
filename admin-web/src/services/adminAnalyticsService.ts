import { http } from '@/api/http';
import type { Analytics } from '@/api/types';

export const adminAnalyticsService = {
  summary: (range: '7d' | '30d' | '90d', signal?: AbortSignal) => http.get<Analytics>('/analytics/summary', { range }, { signal }),
};
