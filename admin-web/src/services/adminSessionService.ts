import { http } from '@/api/http';
import type { DevRole, Meta, Principal, Role, SessionInfo } from '@/api/types';

/** Sign-in bootstrap: what the server is (public), the demo role picker, and the signed-in session. */
export const adminSessionService = {
  meta: (signal?: AbortSignal) => http.get<Meta>('/meta', undefined, { signal, anonymous: true }),
  devRoles: () => http.get<DevRole[]>('/auth/dev-roles', undefined, { anonymous: true }),
  devLogin: (role: Role) => http.post<{ token: string; principal: Principal }>('/auth/dev-login', { role }, { anonymous: true }),
  startSession: () => http.post<SessionInfo>('/auth/session'),
  me: (signal?: AbortSignal) => http.get<SessionInfo>('/auth/me', undefined, { signal }),
  logout: () => http.post<{ message: string }>('/auth/logout'),
};
