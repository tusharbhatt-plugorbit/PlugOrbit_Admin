import { http } from '@/api/http';
import type { Page, SessionDetail, SessionRow, SessionSummary } from '@/api/types';

export interface TransactionQuery { q?: string; status?: string; mode?: string; stationId?: string; userId?: string; partnerId?: string; since?: number; until?: number; limit?: number; offset?: number }

export const adminTransactionService = {
  list: (query: TransactionQuery, signal?: AbortSignal) => http.get<Page<SessionRow, SessionSummary>>('/transactions', { limit: 50, ...query }, { signal }),
  get: (id: string, signal?: AbortSignal) => http.get<SessionDetail>(`/transactions/${id}`, undefined, { signal }),
  /** `amount` omitted = refund everything still refundable. The key makes a retry safe. */
  refund: (id: string, body: { amount?: number; reason: string }, idempotencyKey: string) =>
    http.post<SessionDetail>(`/transactions/${id}/refund`, body, { headers: { 'Idempotency-Key': idempotencyKey } }),
};
