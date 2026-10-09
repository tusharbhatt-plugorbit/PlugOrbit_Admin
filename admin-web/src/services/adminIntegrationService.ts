import { http } from '@/api/http';
import type { IntegrationItem, IntegrationTest, IntegrationsResponse } from '@/api/types';

export const adminIntegrationService = {
  list: (signal?: AbortSignal) => http.get<IntegrationsResponse>('/integrations', undefined, { signal }),
  update: (key: string, body: { enabled?: boolean; notes?: string; settings?: Record<string, string> }) => http.patch<IntegrationItem>(`/integrations/${key}`, body),
  test: (key: string) => http.post<IntegrationTest>(`/integrations/${key}/test`),
};
