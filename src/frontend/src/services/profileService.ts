/**
 * Profile Service — Valthoris
 *
 * Manages extended user profiles (avatar, bio, display name) with
 * localStorage persistence and a pre-wired Supabase integration surface.
 *
 * Architecture note: replace the localStorage stubs with Supabase client
 * calls once the `profiles` table is provisioned. Each TODO comment marks
 * the exact integration point.
 *
 * Supabase table schema (future):
 *   profiles (
 *     principal    TEXT PRIMARY KEY,
 *     display_name TEXT,
 *     avatar_url   TEXT,
 *     bio          TEXT,
 *     updated_at   TIMESTAMPTZ DEFAULT now()
 *   )
 */

import type { UserRole } from '../models/User';
import type { Profile } from '../models/Profile';

const STORAGE_KEY = 'valthoris_profiles';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProfileUpdate {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
}

type ProfileStore = Record<string, ProfileUpdate>;

// ─── Private helpers ──────────────────────────────────────────────────────────

function load(): ProfileStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProfileStore) : {};
  } catch {
    return {};
  }
}

function save(store: ProfileStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / private-browsing errors
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Return locally stored extended profile fields for a principal. */
export function getLocalProfile(principal: string): ProfileUpdate {
  return load()[principal] ?? {};
}

/**
 * Persist profile edits locally.
 *
 * Supabase integration hook (future):
 *   await supabase.from('profiles').upsert({
 *     principal,
 *     display_name: data.displayName,
 *     avatar_url:   data.avatarUrl,
 *     bio:          data.bio,
 *     updated_at:   new Date().toISOString(),
 *   }, { onConflict: 'principal' });
 */
export async function updateProfile(principal: string, data: ProfileUpdate): Promise<void> {
  const store = load();
  store[principal] = { ...store[principal], ...data };
  save(store);
  // TODO: Supabase upsert call once client is configured
}

/**
 * Sync a principal with Supabase on login (upsert pattern).
 * Currently returns locally stored data; the return shape matches the
 * future Supabase record so callers need no changes after migration.
 *
 * Supabase integration hook (future):
 *   const { data } = await supabase
 *     .from('profiles')
 *     .upsert(
 *       { principal, last_seen: new Date().toISOString() },
 *       { onConflict: 'principal' },
 *     )
 *     .select()
 *     .single();
 *   return { displayName: data.display_name, avatarUrl: data.avatar_url, bio: data.bio };
 */
export async function syncWithSupabase(principal: string): Promise<ProfileUpdate> {
  // TODO: replace with Supabase client call
  return getLocalProfile(principal);
}

/**
 * Merge a CanisterProfile with locally stored extended fields and role
 * to produce a complete Profile object ready for consumption by UI components.
 */
export function buildProfile(
  canister: {
    principal: string;
    displayName: string;
    createdAt: bigint;
    updatedAt: bigint;
    reputationScore: bigint;
    totalScans: bigint;
    totalReports: bigint;
    isActive: boolean;
  },
  role: UserRole,
): Profile {
  const local = getLocalProfile(canister.principal);
  return {
    ...canister,
    role,
    avatarUrl: local.avatarUrl,
    bio:       local.bio,
    syncedAt:  Date.now(),
  };
}
