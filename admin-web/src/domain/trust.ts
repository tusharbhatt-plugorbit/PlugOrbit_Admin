/**
 * Data-confidence rules, shared in spirit and wording with the mobile app's `domain/trust.ts`
 * and the Admin API's `domain/trust.py`.
 *
 * The product rule: LIVE may only be claimed for a fresh operator feed. The server decides the
 * confidence; this module is a second, independent guard on the client so that a stale payload
 * (an old tab, a cached response) can never render as LIVE.
 */
import type { Confidence } from '@/api/types';

export const DEFAULT_LIVE_MAX_AGE_MS = 5 * 60 * 1000;
export const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  live: 'Live', estimated: 'Estimated', user: 'User-confirmed', manual: 'Manual', unknown: 'Unknown',
};

/** Downgrades a server-claimed `live` to `estimated` if its timestamp says it has aged out. */
export function effectiveConfidence(
  confidence: Confidence, updatedAt: number | null | undefined, now: number, liveMaxAgeMs = DEFAULT_LIVE_MAX_AGE_MS,
): Confidence {
  if (confidence !== 'live') return confidence;
  if (updatedAt === null || updatedAt === undefined) return 'unknown';
  return now - updatedAt <= liveMaxAgeMs ? 'live' : 'estimated';
}

export function isStale(updatedAt: number | null | undefined, now: number, staleAfterMs = DEFAULT_STALE_AFTER_MS): boolean {
  return updatedAt === null || updatedAt === undefined || now - updatedAt > staleAfterMs;
}

/** "just now", "38 sec ago", "12 min ago", "3 h ago", "2 d ago" (same buckets as the mobile app). */
export function timeAgo(at: number | null | undefined, now: number): string {
  if (at === null || at === undefined) return 'never updated';
  const sec = Math.max(0, Math.round((now - at) / 1000));
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
