/**
 * Profile Service — Valthoris
 *
 * IDENTITY MAPPING (single, canonical mechanism)
 * ──────────────────────────────────────────────
 * The browser holds exactly one identity: the Internet Identity delegation,
 * whose principal text is the canonical Valthoris user id. The Supabase
 * browser client is created with the public anon key only — it never performs
 * a Supabase Auth sign-in — therefore `auth.uid()` and
 * `request.jwt.claims ->> 'sub'` are NULL for every request made from the app.
 *
 * Consequence: the `public.profiles` RLS policies (which compare `principal`
 * to the JWT `sub`) can never match a browser request, so every browser write
 * to that table is rejected. The previous implementation swallowed that
 * rejection and fell back to localStorage, which is why profile data vanished
 * as soon as the browser storage was cleared or another device was used.
 *
 * The extended profile is therefore persisted in the `backend` canister, which
 * authenticates the very same ICP principal that the UI already uses for every
 * other call. `public.profiles` remains reserved for backend services that
 * hold the Supabase service-role key (see migration
 * 20260808000004_..._profiles_service_role.sql); it is not written from here.
 *
 * localStorage is used ONLY as a non-authoritative render cache so the profile
 * paints instantly on reload. It is always overwritten by the canister answer,
 * and a failed canister write is never reported as a success.
 */

import type { _SERVICE as BackendService, ProfileDetails } from '../../../declarations/backend/index.d.ts';
import type { UserRole } from '../models/User';
import type { CanisterProfile, Profile } from '../models/Profile';

const CACHE_KEY = 'valthoris_profiles';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Extended profile fields as used by the UI. */
export interface ProfileDetailsData {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  country?: string;
  publicProfile: boolean;
  twoFactor: boolean;
}

export const EMPTY_PROFILE_DETAILS: ProfileDetailsData = {
  publicProfile: false,
  twoFactor: false,
};

type ProfileCache = Record<string, ProfileDetailsData>;

// ─── Candid helpers ───────────────────────────────────────────────────────────

/** Candid `opt text` → string | undefined. */
function fromOpt(value: [] | [string]): string | undefined {
  const [first] = value;
  return first && first.length > 0 ? first : undefined;
}

/** string | undefined → Candid `opt text` (blank strings clear the field). */
function toOpt(value: string | undefined): [] | [string] {
  const trimmed = value?.trim();
  return trimmed ? [trimmed] : [];
}

function fromCanister(details: ProfileDetails): ProfileDetailsData {
  return {
    displayName:   fromOpt(details.displayName),
    avatarUrl:     fromOpt(details.avatarUrl),
    bio:           fromOpt(details.bio),
    country:       fromOpt(details.country),
    publicProfile: details.publicProfile,
    twoFactor:     details.twoFactor,
  };
}

// ─── Non-authoritative cache ──────────────────────────────────────────────────

function readCache(): ProfileCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ProfileCache) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: ProfileCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Quota / private-browsing errors are irrelevant: the cache is optional.
  }
}

/**
 * Last known extended profile for a principal.
 * Only a render cache — never treat this as the persisted truth.
 */
export function getCachedProfileDetails(principal: string): ProfileDetailsData {
  return { ...EMPTY_PROFILE_DETAILS, ...(readCache()[principal] ?? {}) };
}

function cacheProfileDetails(principal: string, data: ProfileDetailsData): void {
  const cache = readCache();
  cache[principal] = data;
  writeCache(cache);
}

/** Drops the cached copy for a principal (used when the canister has no row). */
export function clearCachedProfileDetails(principal: string): void {
  const cache = readCache();
  delete cache[principal];
  writeCache(cache);
}

// ─── Canister-backed persistence ──────────────────────────────────────────────

/**
 * Read the caller's extended profile from the backend canister.
 * Throws when the canister rejects the call so the UI can show the real error
 * instead of silently rendering stale cache data.
 */
export async function fetchProfileDetails(
  backend: BackendService,
  principal: string,
): Promise<ProfileDetailsData> {
  const res = await backend.getProfileDetails();
  if ('err' in res) {
    throw new Error(res.err);
  }
  const data = fromCanister(res.ok);
  cacheProfileDetails(principal, data);
  return data;
}

/**
 * Persist the caller's extended profile in the backend canister.
 * Resolves with the stored record (as returned by the canister) and throws on
 * any rejection — a failed write must never look like a successful one.
 */
export async function saveProfileDetails(
  backend: BackendService,
  principal: string,
  data: ProfileDetailsData,
): Promise<ProfileDetailsData> {
  const res = await backend.setProfileDetails(
    toOpt(data.displayName),
    toOpt(data.avatarUrl),
    toOpt(data.bio),
    toOpt(data.country),
    data.publicProfile,
    data.twoFactor,
  );
  if ('err' in res) {
    throw new Error(res.err);
  }
  const saved = fromCanister(res.ok);
  cacheProfileDetails(principal, saved);
  return saved;
}

/**
 * Merge a CanisterProfile with the extended fields and the resolved role to
 * produce a complete Profile object for UI consumption.
 */
export function buildProfile(
  canister: CanisterProfile,
  role: UserRole,
  details: ProfileDetailsData = EMPTY_PROFILE_DETAILS,
): Profile {
  return {
    ...canister,
    role,
    avatarUrl: details.avatarUrl,
    bio:       details.bio,
    syncedAt:  Date.now(),
  };
}
