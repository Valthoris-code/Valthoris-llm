/**
 * Safe Location domain model.
 *
 * Only the share lifecycle is backed by the existing `safe_location` canister.
 * Trusted contacts, geofences, emergency mode and history are frontend-only
 * placeholders persisted in localStorage so the module is fully usable during
 * the beta and trivially portable to Android later.
 */

export type ShareDurationId = '15m' | '1h' | '8h' | '24h' | 'until';

export interface ShareDuration {
  id: ShareDurationId;
  labelKey: string;
  /** Seconds; `null` means "until manually disabled". */
  seconds: number | null;
}

export const SHARE_DURATIONS: ShareDuration[] = [
  { id: '15m', labelKey: 'safe.duration.15m', seconds: 15 * 60 },
  { id: '1h', labelKey: 'safe.duration.1h', seconds: 60 * 60 },
  { id: '8h', labelKey: 'safe.duration.8h', seconds: 8 * 60 * 60 },
  { id: '24h', labelKey: 'safe.duration.24h', seconds: 24 * 60 * 60 },
  { id: 'until', labelKey: 'safe.duration.until', seconds: null },
];

/** Upper bound applied when the user picks "until disabled" (canister needs a TTL). */
export const UNTIL_DISABLED_TTL_SECONDS = 30 * 24 * 60 * 60;

export type ContactPermission = 'view-live' | 'view-history' | 'receive-sos' | 'manage-geofences';

export const CONTACT_PERMISSIONS: Array<{ id: ContactPermission; label: string; desc: string }> = [
  { id: 'view-live', label: 'See live location', desc: 'Can open your live position while sharing is active.' },
  { id: 'view-history', label: 'See location history', desc: 'Can review previously recorded positions.' },
  { id: 'receive-sos', label: 'Receive SOS alerts', desc: 'Is notified immediately when you trigger SOS.' },
  { id: 'manage-geofences', label: 'Manage geofences', desc: 'Can create and edit safe zones on your behalf.' },
];

export interface TrustedContact {
  id: string;
  name: string;
  /** Internet Identity principal or contact handle. */
  handle: string;
  relation: string;
  permissions: ContactPermission[];
  /** Placeholder position used by the family map preview. */
  lat?: number;
  lng?: number;
}

export type GeofenceKind = 'safe' | 'alert';

export interface Geofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  kind: GeofenceKind;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

export interface LocationHistoryEntry {
  id: string;
  at: string;
  lat: number;
  lng: number;
  label: string;
}

export interface SafeLocationSettings {
  contacts: TrustedContact[];
  geofences: Geofence[];
  emergencyMode: boolean;
  defaultDuration: ShareDurationId;
  highAccuracy: boolean;
  shareBattery: boolean;
}

export const DEFAULT_SETTINGS: SafeLocationSettings = {
  contacts: [],
  geofences: [],
  emergencyMode: false,
  defaultDuration: '1h',
  highAccuracy: true,
  shareBattery: false,
};

const STORAGE_KEY = 'valthoris.safeLocation.v1';

export function loadSettings(): SafeLocationSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SafeLocationSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      geofences: Array.isArray(parsed.geofences) ? parsed.geofences : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: SafeLocationSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable — settings apply to the current session only.
  }
  // TODO(backend): persist trusted contacts, geofences and emergency state in
  // the safe_location canister once the corresponding endpoints exist.
}

/** Distance in metres between two coordinates (haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
