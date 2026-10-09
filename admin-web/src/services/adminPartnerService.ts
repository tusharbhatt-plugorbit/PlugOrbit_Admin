import { http } from '@/api/http';
import type { Page, Partner, PartnerInput, PartnerStatus } from '@/api/types';

export interface PartnerQuery { q?: string; status?: string; integration?: string; model?: string; limit?: number; offset?: number }

export const adminPartnerService = {
  list: (query: PartnerQuery, signal?: AbortSignal) => http.get<Page<Partner>>('/partners', { limit: 100, ...query }, { signal }),
  get: (id: string, signal?: AbortSignal) => http.get<Partner>(`/partners/${id}`, undefined, { signal }),
  create: (body: PartnerInput) => http.post<Partner>('/partners', body),
  update: (id: string, body: PartnerInput, expectedVersion: number) => http.put<Partner>(`/partners/${id}`, { ...body, expectedVersion }),
  transition: (id: string, body: { to: PartnerStatus; reason?: string; panVerified?: boolean; gstinVerified?: boolean }) => http.post<Partner>(`/partners/${id}/transition`, body),
};
