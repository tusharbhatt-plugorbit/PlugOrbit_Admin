import { http } from '@/api/http';
import type { Page, Settlement, SettlementDetail, SettlementSummary } from '@/api/types';

export const adminSettlementService = {
  list: (query: { partnerId?: string; status?: string; limit?: number; offset?: number }, signal?: AbortSignal) =>
    http.get<Page<Settlement, SettlementSummary>>('/settlements', { limit: 100, ...query }, { signal }),
  get: (id: string, signal?: AbortSignal) => http.get<SettlementDetail>(`/settlements/${id}`, undefined, { signal }),
  run: (body: { periodStart: number; periodEnd: number; partnerIds?: string[] }) =>
    http.post<{ created: SettlementDetail[]; skipped: { partnerId: string; reason: string }[] }>('/settlements/run', body),
  adjust: (id: string, body: { label: string; amount: number; reason: string }) => http.post<SettlementDetail>(`/settlements/${id}/adjustments`, body),
  approve: (id: string) => http.post<SettlementDetail>(`/settlements/${id}/approve`),
  hold: (id: string, reason: string) => http.post<SettlementDetail>(`/settlements/${id}/hold`, { reason }),
  markPaid: (id: string, payoutReference: string) => http.post<SettlementDetail>(`/settlements/${id}/paid`, { payoutReference }),
};
