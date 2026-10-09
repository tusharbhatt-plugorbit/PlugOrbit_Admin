import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Filter state that lives in the URL, so a filtered list can be bookmarked, shared and survives refresh. */
export function useUrlState<K extends string>(defaults: Record<K, string>): [Record<K, string>, (patch: Partial<Record<K, string>>) => void] {
  const [params, setParams] = useSearchParams();
  const state = {} as Record<K, string>;
  for (const key of Object.keys(defaults) as K[]) state[key] = params.get(key) ?? defaults[key];

  const update = useCallback((patch: Partial<Record<K, string>>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch) as [K, string | undefined][]) {
        if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setParams]);

  return [state, update];
}
