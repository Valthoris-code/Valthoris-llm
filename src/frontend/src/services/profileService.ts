/**
 * Profile Service — Valthoris
 *
 * Manages extended user profiles (avatar, bio, display name) backed by
 * a Supabase `profiles` table, with localStorage as a read-through cache
 * for offline / pre-sync access.
 *
 * Supabase table schema:
 *   profiles (
 *     principal    TEXT PRIMARY KEY,
 *     display_name TEXT,
 *     avatar_url   TEXT,
 *     bio          TEXT,
 *     last_seen    TIMESTAMPTZ DEFAULT now(),
 *     updated_at   TIMESTAMPTZ DEFAULT now()
 *   )
 *
 * RLS policy: authenticated users may read/write only their own row.
 * See supabase/migrations/20260808000001_create_profiles.sql
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';
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

function saveLocal(store: ProfileStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / private-browsing errors
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Return locally cached extended profile fields for a principal. */
export function getLocalProfile(principal: string): ProfileUpdate {
  return load()[principal] ?? {};
}

/**
 * Persist profile edits to Supabase and update the local cache.
 * Falls back silently to local-only storage when Supabase is unavailable.
 */
export async function updateProfile(principal: string, data: ProfileUpdate): Promise<void> {
  const store = load();
  store[principal] = { ...store[principal], ...data };
  saveLocal(store);

  if (!isSupabaseConfigured) return;

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        principal,
        display_name: data.displayName,
        avatar_url:   data.avatarUrl,
        bio:          data.bio,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'principal' },
    );

  if (error) {
    console.warn('[profileService] Supabase upsert failed:', error.message);
  }
}

/**
 * Sync a principal with Supabase on login (upsert `last_seen`).
 * Merges cloud fields back into the local cache and returns them.
 */
export async function syncWithSupabase(principal: string): Promise<ProfileUpdate> {
  if (!isSupabaseConfigured) return getLocalProfile(principal);

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { principal, last_seen: new Date().toISOString() },
      { onConflict: 'principal' },
    )
    .select('display_name, avatar_url, bio')
    .single();

  if (error || !data) {
    console.warn('[profileService] Supabase sync failed:', error?.message ?? 'no data');
    return getLocalProfile(principal);
  }

  const merged: ProfileUpdate = {
    displayName: data.display_name ?? undefined,
    avatarUrl:   data.avatar_url   ?? undefined,
    bio:         data.bio          ?? undefined,
  };

  const store = load();
  store[principal] = { ...store[principal], ...merged };
  saveLocal(store);

  return merged;
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
