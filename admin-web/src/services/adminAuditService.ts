import { http } from '@/api/http';
import type { AuditEntry } from '@/api/types';

export interface AuditQuery { actor?: string; action?: string; category?: string; entityType?: string; entityId?: string; q?: string; since?: number; until?: number; beforeSeq?: number; limit?: number }
export interface AuditPage { items: AuditEntry[]; nextBeforeSeq: number | null; total: number }
export interface AuditVerification { ok: boolean; checked: number; headHash?: string | null; firstBadSeq?: number; reason?: string }

export const adminAuditService = {
  list: (query: AuditQuery, signal?: AbortSignal) => http.get<AuditPage>('/audit', { limit: 50, ...query }, { signal }),
  verify: (signal?: AbortSignal) => http.get<AuditVerification>('/audit/verify', undefined, { signal }),
  catalog: (signal?: AbortSignal) => http.get<{ action: string; label: string; category: string }[]>('/audit/catalog', undefined, { signal }),
};
