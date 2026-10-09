import { http } from '@/api/http';
import type { Page, Ticket, TicketCategory, TicketPriority, TicketStatus, TicketSummary } from '@/api/types';

export interface TicketQuery { q?: string; status?: string; category?: string; priority?: string; ownerId?: string; stationId?: string; userId?: string; sessionId?: string; limit?: number; offset?: number }

export const adminSupportService = {
  list: (query: TicketQuery, signal?: AbortSignal) => http.get<Page<Ticket, TicketSummary>>('/tickets', { limit: 100, ...query }, { signal }),
  get: (id: string, signal?: AbortSignal) => http.get<Ticket>(`/tickets/${id}`, undefined, { signal }),
  create: (body: { category: TicketCategory; priority: TicketPriority; subject: string; description?: string; sessionId?: string; stationId?: string; userId?: string }) => http.post<Ticket>('/tickets', body),
  update: (id: string, body: Partial<{ category: TicketCategory; priority: TicketPriority; status: TicketStatus; ownerId: string; unassign: boolean; expectedVersion: number }>) => http.patch<Ticket>(`/tickets/${id}`, body),
  addNote: (id: string, body: string) => http.post<Ticket>(`/tickets/${id}/notes`, { body }),
};
