import { http } from '@/api/http';
import type { DqActionName, DqIssue, DqSummary, Page, StationDetail } from '@/api/types';

export const adminDataQualityService = {
  summary: (signal?: AbortSignal) => http.get<DqSummary>('/data-quality/summary', undefined, { signal }),
  issues: (query: { type?: string; status?: string; severity?: string; stationId?: string }, signal?: AbortSignal) => http.get<Page<DqIssue>>('/data-quality/issues', { limit: 100, ...query }, { signal }),
  scan: () => http.post<{ opened: number; reopened: number; autoCleared: number; open: number; scannedAt: number }>('/data-quality/scan'),
  act: (id: string, body: { action: DqActionName; reason: string }) => http.post<DqIssue>(`/data-quality/issues/${id}/action`, body),
  merge: (body: { keepStationId: string; mergeStationId: string; reason: string }) => http.post<StationDetail>('/data-quality/merge', body),
};
