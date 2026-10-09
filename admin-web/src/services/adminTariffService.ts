import { http } from '@/api/http';
import type { Tariff, TariffHistory, TariffInput } from '@/api/types';

export const adminTariffService = {
  history: (stationId: string, signal?: AbortSignal) => http.get<TariffHistory>(`/stations/${stationId}/tariffs`, undefined, { signal }),
  create: (stationId: string, body: TariffInput) => http.post<Tariff>(`/stations/${stationId}/tariffs`, body),
  cancelScheduled: (id: string, reason: string) => http.post<Tariff>(`/tariffs/${id}/cancel`, { reason }),
};
