/**
 * Safe Location domain model.
 *
 * Shares, geofences, trusted contacts and the owner preferences are all backed
 * by the `safe_location` canister, which authenticates the caller's Internet
 * Identity principal. localStorage is only a non-authoritative render cache so
 * the page paints instantly on reload; it is always overwritten by the
 * canister answer and a failed canister write is never shown as a success.
 */

import type { SafeSettings, TrustedContact as CanisterContact } from '../../../declarations/safe_location/index.d.ts';
import type { _SERVICE as SafeLocationService } from '../../../declarations/safe_location/index.d.ts';

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

/** A geofence about to be created — the canister assigns the id. */
export type GeofenceDraft = Omit<Geofence, 'id'>;

export interface LocationHistoryEntry {
  id: string;
  at: string;
  lat: number;
  lng: number;
  label: string;
}

export interface SafeLocationSettings {
  contacts: TrustedContact[];
  emergencyMode: boolean;
  defaultDuration: ShareDurationId;
  highAccuracy: boolean;
  shareBattery: boolean;
}

export const DEFAULT_SETTINGS: SafeLocationSettings = {
  contacts: [],
  emergencyMode: false,
  defaultDuration: '1h',
  highAccuracy: true,
  shareBattery: false,
};

const CACHE_KEY = 'valthoris.safeLocation.cache.v2';

const DURATION_IDS: ShareDurationId[] = ['15m', '1h', '8h', '24h', 'until'];

function toDurationId(value: string): ShareDurationId {
  return (DURATION_IDS as string[]).includes(value)
    ? (value as ShareDurationId)
    : DEFAULT_SETTINGS.defaultDuration;
}

/**
 * Last known configuration for a principal. Render cache only — never treat
 * this as the persisted truth.
 */
export function getCachedSettings(principal: string): SafeLocationSettings {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const cache = JSON.parse(raw) as Record<string, Partial<SafeLocationSettings>>;
    const entry = cache[principal];
    if (!entry) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...entry,
      contacts: Array.isArray(entry.contacts) ? entry.contacts : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Store settings in the local render cache. Also used as a degraded-mode
 * fallback when the deployed canister has no settings methods; the data is
 * browser-local and never authoritative.
 */
export function cacheSettings(principal: string, settings: SafeLocationSettings): void {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const cache = raw ? (JSON.parse(raw) as Record<string, SafeLocationSettings>) : {};
    cache[principal] = settings;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Quota / private-browsing errors are irrelevant: the cache is optional.
  }
}

function fromCanister(settings: SafeSettings): SafeLocationSettings {
  return {
    contacts: settings.contacts.map(contact => ({
      id: contact.id,
      name: contact.name,
      handle: contact.handle,
      relation: contact.relation,
      permissions: contact.permissions.filter((p): p is ContactPermission =>
        CONTACT_PERMISSIONS.some(known => known.id === p)
      ),
    })),
    emergencyMode: settings.emergencyMode,
    defaultDuration: toDurationId(settings.defaultDuration),
    highAccuracy: settings.highAccuracy,
    shareBattery: settings.shareBattery,
  };
}

function toCanisterContacts(contacts: TrustedContact[]): CanisterContact[] {
  return contacts.map(contact => ({
    id: contact.id,
    name: contact.name,
    handle: contact.handle,
    relation: contact.relation,
    permissions: contact.permissions,
  }));
}

/**
 * True when the canister rejected the call because the method is absent from
 * its interface — i.e. the deployed canister predates `getMySettings` /
 * `setMySettings` and still needs a `dfx deploy`. The IC returns this as a
 * `DestinationInvalid` rejection whose message mentions the missing method.
 */
export function isMissingCanisterMethod(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes('method not found') ||
    message.includes('has no query method') ||
    message.includes('has no update method') ||
    message.includes('no query method') ||
    message.includes('no update method') ||
    /canister .* has no .* method/.test(message)
  );
}

/** Message shown when the deployed canister is missing the settings methods. */
export const SETTINGS_METHOD_MISSING_NOTICE =
  'The deployed safe_location canister does not expose the Safe Location ' +
  'settings methods yet (run `dfx deploy safe_location --network ic`). ' +
  'Your preferences are being kept in this browser only until it is updated.';

/**
 * Read the caller's configuration from the canister.
 * Throws when the canister rejects the call so the UI can show the real error
 * instead of silently rendering stale cache data.
 */
export async function fetchSettings(
  safeLocation: SafeLocationService,
  principal: string
): Promise<SafeLocationSettings> {
  const res = await safeLocation.getMySettings();
  if ('err' in res) throw new Error(res.err);
  const settings = fromCanister(res.ok);
  cacheSettings(principal, settings);
  return settings;
}

/**
 * Persist the caller's configuration in the canister and return the stored
 * record. Throws on any rejection — a failed write must never look successful.
 */
export async function persistSettings(
  safeLocation: SafeLocationService,
  principal: string,
  settings: SafeLocationSettings
): Promise<SafeLocationSettings> {
  const res = await safeLocation.setMySettings(
    toCanisterContacts(settings.contacts),
    settings.emergencyMode,
    settings.defaultDuration,
    settings.highAccuracy,
    settings.shareBattery
  );
  if ('err' in res) throw new Error(res.err);
  const saved = fromCanister(res.ok);
  cacheSettings(principal, saved);
  return saved;
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
