import type { AuditEntry } from '@/api/types';
import { formatDateTime } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useNow } from '@/hooks/useNow';
import { Pill } from './Badges';

const TONE: Record<string, 'lime' | 'info' | 'danger' | 'amber' | 'slate'> = {
  money: 'amber', pricing: 'info', user: 'danger', station: 'lime', partner: 'info', platform: 'amber', access: 'slate', support: 'slate', data: 'slate', content: 'slate',
};

export function formatAuditValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export function Diff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return null;
  return (
    <div className="diff">
      <div className="diff__col"><div className="diff__label">Before</div>
        {keys.map((k) => <div key={k} className="diff__row"><span className="diff__key">{k}:</span><span>{formatAuditValue(before?.[k])}</span></div>)}
      </div>
      <div className="diff__col diff__col--after"><div className="diff__label">After</div>
        {keys.map((k) => <div key={k} className="diff__row"><span className="diff__key">{k}:</span><span className="strong">{formatAuditValue(after?.[k])}</span></div>)}
      </div>
    </div>
  );
}

/** Who did what, to what, why, and the before/after values. Read-only: audit entries are never editable. */
export function AuditTimeline({ entries, showEntity = true }: { entries: AuditEntry[]; showEntity?: boolean }) {
  const now = useNow(30_000);
  return (
    <ol className="timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {entries.map((e) => (
        <li key={e.id} className="timeline__item">
          <span className={`timeline__dot timeline__dot--${e.category === 'money' ? 'amber' : e.category === 'user' ? 'danger' : 'lime'}`} />
          <div className="timeline__main">
            <div className="timeline__title">
              <span>{e.actionLabel}{showEntity && e.entityLabel ? <span className="muted"> · {e.entityLabel}</span> : null}</span>
              <Pill label={e.category} tone={TONE[e.category] ?? 'slate'} />
            </div>
            <div className="timeline__meta">{e.actor.name} ({e.actor.role.replace('_', ' ')}) · <time dateTime={new Date(e.at).toISOString()} title={formatDateTime(e.at, true)}>{timeAgo(e.at, now)}</time></div>
            {e.reason && <div style={{ marginTop: 4 }}>“{e.reason}”</div>}
            {(e.before || e.after) && <Diff before={e.before} after={e.after} />}
          </div>
        </li>
      ))}
    </ol>
  );
}
