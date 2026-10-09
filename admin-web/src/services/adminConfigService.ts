import { http } from '@/api/http';
import type { AdminRow, Lookups, PlatformConfig, Role, RoleInfo } from '@/api/types';

export type ConfigInput = Omit<PlatformConfig, 'featureCatalog' | 'version'> & { expectedVersion: number; reason?: string };

/** Platform settings, the role catalogue, admin accounts and the shared dropdown lookups. */
export const adminConfigService = {
  get: (signal?: AbortSignal) => http.get<PlatformConfig>('/config', undefined, { signal }),
  update: (body: ConfigInput) => http.put<PlatformConfig>('/config', body),
  roles: (signal?: AbortSignal) => http.get<RoleInfo[]>('/roles', undefined, { signal }),
  admins: (signal?: AbortSignal) => http.get<{ items: AdminRow[] }>('/admins', undefined, { signal }),
  invite: (body: { email: string; name: string; role: Role }) => http.post<AdminRow>('/admins', body),
  patchAdmin: (id: string, body: { role?: Role; status?: 'active' | 'disabled'; reason: string }) => http.patch<AdminRow>(`/admins/${id}`, body),
  lookups: (signal?: AbortSignal) => http.get<Lookups>('/lookups', undefined, { signal }),
};
