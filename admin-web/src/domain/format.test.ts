import { describe, expect, it } from 'vitest';
import { formatDuration, formatInr, formatInrCompact, fromLocalInput, initials, toLocalInput } from './format';

describe('money formatting (Indian digit grouping)', () => {
  it('groups lakhs and crores', () => {
    expect(formatInr(123456.78)).toBe('₹1,23,456.78');
    expect(formatInr(556.49)).toBe('₹556.49');
    expect(formatInr(1234567, { whole: true })).toBe('₹12,34,567');
    expect(formatInr(null)).toBe('—');
  });
  it('compacts for KPI tiles in lakh / thousand', () => {
    expect(formatInrCompact(860000)).toBe('₹8.6L');
    expect(formatInrCompact(12400)).toBe('₹12.4K');
    expect(formatInrCompact(950)).toBe('₹950');
    expect(formatInrCompact(25000000)).toBe('₹2.5Cr');
    expect(formatInrCompact(undefined)).toBe('—');
  });
});

describe('small helpers', () => {
  it('formats durations', () => {
    expect(formatDuration(41)).toBe('41 min');
    expect(formatDuration(125)).toBe('2 h 5 min');
    expect(formatDuration(120)).toBe('2 h');
  });
  it('makes initials', () => {
    expect(initials('Aarav Mehta')).toBe('AM');
    expect(initials('  ')).toBe('?');
    expect(initials('Cher')).toBe('C');
  });
  it('round-trips datetime-local values', () => {
    const t = new Date(2026, 9, 9, 14, 30).getTime();
    expect(fromLocalInput(toLocalInput(t))).toBe(t);
    expect(fromLocalInput('')).toBeNull();
  });
});
