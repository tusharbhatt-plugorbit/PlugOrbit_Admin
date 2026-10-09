import { http } from '@/api/http';
import type { ConnectorStatus, MapStation, Page, Station, StationDetail, StationInput } from '@/api/types';

export interface StationQuery { q?: string; partnerId?: string; status?: string; publication?: string; city?: string; source?: string; sort?: string; limit?: number; offset?: number }

export const adminStationService = {
  list: (query: StationQuery, signal?: AbortSignal) => http.get<Page<Station>>('/stations', { limit: 100, ...query }, { signal }),
  get: (id: string, signal?: AbortSignal) => http.get<StationDetail>(`/stations/${id}`, undefined, { signal }),
  create: (body: StationInput) => http.post<StationDetail>('/stations', body),
  update: (id: string, body: StationInput, expectedVersion: number) => http.put<StationDetail>(`/stations/${id}`, { ...body, expectedVersion }),
  publish: (id: string) => http.post<StationDetail>(`/stations/${id}/publish`),
  hide: (id: string, reason: string) => http.post<StationDetail>(`/stations/${id}/hide`, { reason }),
  overrideStatus: (id: string, body: { status: ConnectorStatus; reason: string; expiresInMinutes?: number }) => http.post<StationDetail>(`/stations/${id}/status`, body),
  clearOverride: (id: string) => http.delete<StationDetail>(`/stations/${id}/status`),
  /** Lightweight rows for the Network Map pins. */
  map: (query: { partnerId?: string; city?: string; connectorType?: string; minPowerKw?: number; status?: string; source?: string; q?: string }, signal?: AbortSignal) =>
    http.get<{ items: MapStation[]; total: number; generatedAt: number }>('/map/stations', query, { signal }),
};
