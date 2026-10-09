import { http } from '@/api/http';
import type { NotificationInput, NotificationItem, NotificationsPage } from '@/api/types';

export const adminNotificationService = {
  list: (query: { kind?: string; status?: string }, signal?: AbortSignal) => http.get<NotificationsPage>('/notifications', { limit: 100, ...query }, { signal }),
  create: (body: NotificationInput) => http.post<NotificationItem>('/notifications', body),
  publish: (id: string) => http.post<NotificationItem>(`/notifications/${id}/publish`),
};
