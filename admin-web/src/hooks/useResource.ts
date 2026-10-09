import { useCallback, useEffect, useRef, useState } from 'react';

export interface Resource<T> {
  data: T | undefined;
  error: unknown;
  /** True for the first load and for every reload. */
  loading: boolean;
  /** Reloading while previous data is still on screen (no skeleton flash). */
  refreshing: boolean;
  reload: () => void;
  /** Replace the data locally (optimistic update / using a mutation's response). */
  set: (next: T) => void;
}

interface Snapshot<T> { deps: readonly unknown[]; tick: number; data: T | undefined; error: unknown; settled: boolean }

const sameDeps = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

/**
 * Loads `fetcher` on mount and whenever `deps` change; the latest request always wins and in-flight
 * ones are aborted. Same contract as the mobile app's useResource, so screens look alike.
 *
 * `loading` is *derived*: a snapshot only counts as current when it was produced for the present deps
 * and reload tick, so nothing sets state synchronously inside the effect.
 */
export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[], opts: { enabled?: boolean } = {}): Resource<T> {
  const enabled = opts.enabled ?? true;
  const [tick, setTick] = useState(0);
  const [snap, setSnap] = useState<Snapshot<T>>({ deps: [], tick: -1, data: undefined, error: undefined, settled: false });
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetcherRef.current(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setSnap({ deps, tick, data, error: undefined, settled: true }); },
      (error) => { if (!controller.signal.aborted) setSnap((s) => ({ deps, tick, data: s.data, error, settled: true })); },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const current = snap.settled && snap.tick === tick && sameDeps(snap.deps, deps);
  const loading = enabled && !current;
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const set = useCallback((next: T) => setSnap((s) => ({ ...s, data: next, settled: true })), []);
  return { data: snap.data, error: current ? snap.error : undefined, loading, refreshing: loading && snap.data !== undefined, reload, set };
}
