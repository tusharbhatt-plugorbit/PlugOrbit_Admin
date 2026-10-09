const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

/** ₹1,23,456.78 (Indian digit grouping). */
export function formatInr(value: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return (opts.whole ? inr0 : inr).format(value);
}

/** ₹8.6L / ₹12.4K / ₹950: compact for KPI tiles (lakh and thousand, as used in India). */
export function formatInrCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2).replace(/\.?0+$/, '')}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return `${sign}₹${Math.round(abs)}`;
}

export const formatNumber = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : num.format(v));
export const formatKwh = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${num.format(v)} kWh`);
export const formatKw = (v: number): string => `${num.format(v)} kW`;
export const formatPct = (v: number | null | undefined, digits = 0): string => (v === null || v === undefined ? '—' : `${v.toFixed(digits)}%`);

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

const dateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const dateTimeYear = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const dateOnly = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

export const formatDateTime = (at: number | null | undefined, withYear = false): string =>
  at === null || at === undefined ? '—' : (withYear ? dateTimeYear : dateTime).format(at);
export const formatDate = (at: number | null | undefined): string => (at === null || at === undefined ? '—' : dateOnly.format(at));
export const formatShortDate = (at: number | string): string => shortDate.format(typeof at === 'string' ? new Date(`${at}T12:00:00Z`) : at);

/** datetime-local input value <-> epoch ms, in the browser's local zone. */
export function toLocalInput(at: number | null | undefined): string {
  if (!at) return '';
  const d = new Date(at - new Date(at).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}
export function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
