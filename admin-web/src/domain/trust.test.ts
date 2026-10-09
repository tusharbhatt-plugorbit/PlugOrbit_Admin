import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVE_MAX_AGE_MS, DEFAULT_STALE_AFTER_MS, effectiveConfidence, isStale, timeAgo } from './trust';

const NOW = 1_800_000_000_000;

describe('effectiveConfidence: the client-side second guard behind "never show estimated as Live"', () => {
  it('keeps Live only while the timestamp is inside the live window', () => {
    expect(effectiveConfidence('live', NOW - 10_000, NOW)).toBe('live');
    expect(effectiveConfidence('live', NOW - DEFAULT_LIVE_MAX_AGE_MS, NOW)).toBe('live');
  });
  it('downgrades a stale "live" claim to estimated, and a missing timestamp to unknown', () => {
    expect(effectiveConfidence('live', NOW - DEFAULT_LIVE_MAX_AGE_MS - 1, NOW)).toBe('estimated');
    expect(effectiveConfidence('live', null, NOW)).toBe('unknown');
  });
  it('never upgrades anything to live', () => {
    for (const c of ['estimated', 'user', 'manual', 'unknown'] as const) expect(effectiveConfidence(c, NOW, NOW)).toBe(c);
  });
  it('honours a custom live window (Settings)', () => {
    expect(effectiveConfidence('live', NOW - 30_000, NOW, 10_000)).toBe('estimated');
  });
});

describe('isStale / timeAgo (same buckets as the mobile app)', () => {
  it('flags data older than the stale window or never updated', () => {
    expect(isStale(NOW - DEFAULT_STALE_AFTER_MS, NOW)).toBe(false);
    expect(isStale(NOW - DEFAULT_STALE_AFTER_MS - 1, NOW)).toBe(true);
    expect(isStale(null, NOW)).toBe(true);
  });
  it('words ages the way the mobile app does', () => {
    expect(timeAgo(NOW - 3_000, NOW)).toBe('just now');
    expect(timeAgo(NOW - 38_000, NOW)).toBe('38 sec ago');
    expect(timeAgo(NOW - 12 * 60_000, NOW)).toBe('12 min ago');
    expect(timeAgo(NOW - 3 * 3_600_000, NOW)).toBe('3 h ago');
    expect(timeAgo(NOW - 2 * 86_400_000, NOW)).toBe('2 d ago');
    expect(timeAgo(null, NOW)).toBe('never updated');
  });
});
