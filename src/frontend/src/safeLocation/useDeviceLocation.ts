import { useCallback, useEffect, useRef, useState } from 'react';

export interface DevicePosition {
  lat: number;
  lng: number;
  accuracy?: number;
  at: string;
}

interface State {
  position: DevicePosition | null;
  error: string;
  loading: boolean;
  /** True while a continuous watch is running. */
  watching: boolean;
}

/**
 * Thin wrapper over the Geolocation API.
 *
 * The same interface will be backed by the Android fused location provider when
 * the mobile client ships, so consumers do not need to change.
 */
export function useDeviceLocation(highAccuracy = true) {
  const [state, setState] = useState<State>({
    position: null,
    error: '',
    loading: false,
    watching: false,
  });
  const watchId = useRef<number | null>(null);

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const toPosition = (pos: GeolocationPosition): DevicePosition => ({
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    at: new Date(pos.timestamp).toISOString(),
  });

  const describeError = (err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) return 'Location permission denied.';
    if (err.code === err.POSITION_UNAVAILABLE) return 'Location is currently unavailable.';
    if (err.code === err.TIMEOUT) return 'Timed out while acquiring your location.';
    return 'Could not determine your location.';
  };

  const locate = useCallback(() => {
    if (!supported) {
      setState(s => ({ ...s, error: 'Geolocation is not supported by this browser.' }));
      return;
    }
    setState(s => ({ ...s, loading: true, error: '' }));
    navigator.geolocation.getCurrentPosition(
      pos => setState(s => ({ ...s, position: toPosition(pos), loading: false })),
      err => setState(s => ({ ...s, loading: false, error: describeError(err) })),
      { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 30000 }
    );
  }, [supported, highAccuracy]);

  const stopWatching = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setState(s => ({ ...s, watching: false }));
  }, []);

  const startWatching = useCallback(() => {
    if (!supported || watchId.current !== null) return;
    setState(s => ({ ...s, watching: true, error: '' }));
    watchId.current = navigator.geolocation.watchPosition(
      pos => setState(s => ({ ...s, position: toPosition(pos) })),
      err => setState(s => ({ ...s, error: describeError(err), watching: false })),
      { enableHighAccuracy: highAccuracy, timeout: 20000, maximumAge: 10000 }
    );
  }, [supported, highAccuracy]);

  useEffect(() => stopWatching, [stopWatching]);

  return { ...state, supported, locate, startWatching, stopWatching };
}
