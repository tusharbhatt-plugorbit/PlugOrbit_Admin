import { useEffect, useState } from 'react';
import { currentAuthFailure, hasMapsKey, loadGoogleMaps, type MapsStatus } from './googleMaps';

export function useGoogleMaps(): MapsStatus {
  const [state, setState] = useState<MapsStatus>(() => (!hasMapsKey ? { status: 'missing-key' } : { status: 'loading' }));
  useEffect(() => {
    if (!hasMapsKey) return;
    let live = true;
    loadGoogleMaps().then(
      () => { if (live) setState(currentAuthFailure() ? { status: 'error', message: currentAuthFailure()! } : { status: 'ready' }); },
      (e: Error) => { if (live) setState({ status: 'error', message: e.message }); },
    );
    const onAuth = () => live && setState({ status: 'error', message: currentAuthFailure() ?? 'Google rejected the Maps API key.' });
    window.addEventListener('po-maps-auth-failure', onAuth);
    return () => { live = false; window.removeEventListener('po-maps-auth-failure', onAuth); };
  }, []);
  return state;
}
