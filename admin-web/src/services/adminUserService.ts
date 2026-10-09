import { http } from '@/api/http';
import type { Page, SessionRow, SessionSummary, UserDetail, UserRow } from '@/api/types';

export const adminUserService = {
  list: (query: { q?: string; status?: string; unpaid?: boolean; limit?: number; offset?: number }, signal?: AbortSignal) => http.get<Page<UserRow>>('/users', { limit: 100, ...query }, { signal }),
  get: (id: string, signal?: AbortSignal) => http.get<UserDetail>(`/users/${id}`, undefined, { signal }),
  sessions: (id: string, signal?: AbortSignal) => http.get<Page<SessionRow, SessionSummary>>(`/users/${id}/sessions`, undefined, { signal }),
  restrict: (id: string, reason: string) => http.post<UserDetail>(`/users/${id}/restrict`, { reason }),
  unrestrict: (id: string, reason: string) => http.post<UserDetail>(`/users/${id}/unrestrict`, { reason }),
  /** Shows the real contact details once; the reason is mandatory and audited. */
  reveal: (id: string, reason: string) => http.post<{ phone: string | null; email: string | null; name: string | null }>(`/users/${id}/reveal`, { reason }),
};
