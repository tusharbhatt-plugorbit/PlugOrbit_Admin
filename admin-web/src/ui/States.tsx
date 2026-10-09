import type { ReactNode } from 'react';
import { ApiError, ApiTimeoutError, NetworkError, describeError } from '@/api/http';
import type { Resource } from '@/hooks/useResource';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

type StateTone = 'lime' | 'warn' | 'danger' | 'info';

/** Icon tile + title + body + actions: the mobile `Panel`, used for empty, error and permission states. */
function Panel({ icon, tone = 'lime', title, body, actions, compact }: { icon: IconName; tone?: StateTone; title: string; body?: ReactNode; actions?: ReactNode; compact?: boolean }) {
  return (
    <div className={`state ${compact ? 'state--compact' : ''}`}>
      <div className={`state__icon ${tone === 'lime' ? '' : `state__icon--${tone}`}`}><Icon name={icon} size={28} /></div>
      <h2 className="state__title">{title}</h2>
      {body && <p className="state__body">{body}</p>}
      {actions && <div className="state__actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, body, action, compact }: { icon?: IconName; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return <Panel icon={icon} title={title} body={body} actions={action} compact={compact} />;
}

/** "No search results": distinct from "nothing exists yet", and always offers a way out. */
export function NoResults({ onClear, what = 'results' }: { onClear?: () => void; what?: string }) {
  return (
    <Panel icon="search" tone="info" title={`No ${what} match`} body="Try a different search, or clear the filters to see everything."
      actions={onClear && <Button variant="secondary" label="Clear filters" onClick={onClear} />} compact />
  );
}

export function NoPermission({ what = 'this page' }: { what?: string }) {
  return <Panel icon="lock" tone="warn" title="You don't have access" body={`Your role does not include permission to use ${what}. Ask a Super Admin if you need it.`} />;
}

export type FailureKind = 'timeout' | 'offline' | 'permission' | 'integration' | 'generic';

export function classify(error: unknown): FailureKind {
  if (error instanceof ApiTimeoutError) return 'timeout';
  if (error instanceof NetworkError) return 'offline';
  if (error instanceof ApiError) {
    if (error.status === 403) return 'permission';
    if (error.status === 501 || error.code === 'INTEGRATION_UNAVAILABLE') return 'integration';
  }
  return 'generic';
}

const FAILURE: Record<FailureKind, { icon: IconName; tone: StateTone; title: string }> = {
  timeout: { icon: 'hourglass', tone: 'warn', title: 'The server is taking too long' },
  offline: { icon: 'wifi-off', tone: 'warn', title: "Can't reach the server" },
  permission: { icon: 'lock', tone: 'warn', title: "You don't have access" },
  integration: { icon: 'plug', tone: 'warn', title: 'Integration unavailable' },
  generic: { icon: 'alert', tone: 'danger', title: 'Something went wrong' },
};

export function ErrorState({ error, title, onRetry, compact }: { error?: unknown; title?: string; onRetry?: () => void; compact?: boolean }) {
  const kind = classify(error);
  const f = FAILURE[kind];
  return (
    <Panel icon={f.icon} tone={f.tone} title={title ?? f.title} body={describeError(error)} compact={compact}
      actions={onRetry && kind !== 'permission' ? <Button icon="refresh" label="Try again" onClick={onRetry} /> : undefined} />
  );
}

export function Notice({ tone = 'info', title, children, actions, icon }: { tone?: 'info' | 'warn' | 'danger' | 'lime'; title: string; children?: ReactNode; actions?: ReactNode; icon?: IconName }) {
  const defaults: Record<string, IconName> = { info: 'info', warn: 'alert', danger: 'circle-alert', lime: 'circle-check' };
  return (
    <div className={`notice notice--${tone}`} role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}>
      <Icon name={icon ?? defaults[tone]} size={18} />
      <div className="notice__body">
        <div className="notice__title">{title}</div>
        {children && <div className="notice__text">{children}</div>}
        {actions && <div className="notice__actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}

export function LoadingState({ variant = 'table', rows = 6 }: { variant?: 'table' | 'cards' | 'detail'; rows?: number }) {
  if (variant === 'cards') {
    return (
      <div className="grid grid--3" role="status" aria-label="Loading">
        {Array.from({ length: Math.min(rows, 6) }, (_, i) => (
          <div key={i} className="card card--pad stack"><Skeleton h={18} w="55%" /><Skeleton h={12} w="90%" /><Skeleton h={12} w="70%" /></div>
        ))}
      </div>
    );
  }
  if (variant === 'detail') {
    return (
      <div className="stack" role="status" aria-label="Loading">
        <div className="card card--pad stack"><Skeleton h={22} w="40%" />{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} h={14} w={i % 2 ? '70%' : '90%'} />)}</div>
      </div>
    );
  }
  return (
    <div className="card" role="status" aria-label="Loading">
      <div className="skeleton-rows">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={18} w={i % 3 === 2 ? '80%' : '100%'} />)}</div>
    </div>
  );
}

/**
 * Loading / error / empty / stale handled in one place (the mobile AsyncView contract):
 *  - first load: skeleton        - failed first load: ErrorState with retry
 *  - reload: keeps the previous data on screen (dimmed), no skeleton flash
 *  - failed reload: keeps the data and says it may be out of date
 */
export function AsyncView<T>({ resource, children, isEmpty, empty, skeleton = 'table' }: {
  resource: Resource<T>; children: (data: T) => ReactNode; isEmpty?: (data: T) => boolean; empty?: ReactNode; skeleton?: 'table' | 'cards' | 'detail';
}) {
  const { data, error, loading, refreshing, reload } = resource;
  if (data === undefined) {
    if (error) return <div className="card"><ErrorState error={error} onRetry={reload} /></div>;
    return <LoadingState variant={skeleton} />;
  }
  return (
    <div className="stack" style={{ opacity: refreshing ? 0.6 : 1, transition: 'opacity 0.15s' }} aria-busy={loading || undefined}>
      {!!error && !loading && (
        <Notice tone="warn" title="Showing the last data we loaded" actions={<Button small variant="secondary" icon="refresh" label="Retry" onClick={reload} />}>
          {describeError(error)} What you see may be out of date.
        </Notice>
      )}
      {isEmpty?.(data) ? <div className="card">{empty}</div> : children(data)}
    </div>
  );
}
