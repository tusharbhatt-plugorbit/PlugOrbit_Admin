import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useResource } from './useResource';

describe('useResource', () => {
  it('loads, then exposes data', async () => {
    const { result } = renderHook(() => useResource(async () => 'hello', []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('hello'));
    expect(result.current.loading).toBe(false);
  });

  it('surfaces errors and keeps data undefined', async () => {
    const { result } = renderHook(() => useResource(async () => { throw new Error('boom'); }, []));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.data).toBeUndefined();
  });

  it('refetches when deps change and the latest request wins', async () => {
    const resolvers: Record<string, (v: string) => void> = {};
    const fetcher = vi.fn((_s: AbortSignal, q: string) => new Promise<string>((res) => { resolvers[q] = res; }));
    const { result, rerender } = renderHook(({ q }) => useResource((s) => fetcher(s, q), [q]), { initialProps: { q: 'a' } });
    rerender({ q: 'b' });
    await act(async () => { resolvers.b('B'); });
    await act(async () => { resolvers.a('A'); }); // the slow, stale answer arrives last and is ignored
    expect(result.current.data).toBe('B');
  });

  it('reload() fetches again and keeps the previous data on screen while it does', async () => {
    let n = 0;
    const { result } = renderHook(() => useResource(async () => `v${++n}`, []));
    await waitFor(() => expect(result.current.data).toBe('v1'));
    act(() => result.current.reload());
    expect(result.current.refreshing).toBe(true);
    expect(result.current.data).toBe('v1');
    await waitFor(() => expect(result.current.data).toBe('v2'));
    expect(result.current.refreshing).toBe(false);
  });

  it('does not fetch while disabled', async () => {
    const fetcher = vi.fn(async () => 1);
    const { result } = renderHook(() => useResource(fetcher, [], { enabled: false }));
    expect(result.current.loading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('set() replaces the data locally (e.g. with a mutation response)', async () => {
    const { result } = renderHook(() => useResource(async () => 1, []));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.set(2));
    expect(result.current.data).toBe(2);
  });
});
