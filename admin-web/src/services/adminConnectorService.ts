import { http } from '@/api/http';
import type { Connector, ConnectorInput, ConnectorStatus } from '@/api/types';

export const adminConnectorService = {
  list: (stationId: string, signal?: AbortSignal) => http.get<{ items: Connector[] }>(`/stations/${stationId}/connectors`, undefined, { signal }),
  create: (stationId: string, body: ConnectorInput) => http.post<Connector>(`/stations/${stationId}/connectors`, body),
  update: (id: string, body: ConnectorInput, expectedVersion: number) => http.put<Connector>(`/connectors/${id}`, { ...body, expectedVersion }),
  remove: (id: string) => http.delete<void>(`/connectors/${id}`),
  override: (id: string, body: { status: ConnectorStatus; reason: string; expiresInMinutes?: number }) => http.post<Connector>(`/connectors/${id}/override`, body),
  clearOverride: (id: string) => http.delete<Connector>(`/connectors/${id}/override`),
};
