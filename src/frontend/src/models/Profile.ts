/**
 * Profile models for Valthoris.
 *
 * `CanisterProfile` maps the backend UserProfile type returned by
 * `backend.getUserProfile()`.
 *
 * `Profile` extends it with role and optional fields that will be
 * populated once the Supabase profile synchronisation layer is live.
 * Fields annotated "Supabase sync" are intentionally left undefined
 * until that integration is implemented.
 */

import type { UserRole } from './User';

/** Profile as stored on the ICP backend canister. */
export interface CanisterProfile {
  principal: string;
  displayName: string;
  createdAt: bigint;
  updatedAt: bigint;
  reputationScore: bigint;
  totalScans: bigint;
  totalReports: bigint;
  isActive: boolean;
}

/**
 * Extended profile with fields prepared for future Supabase sync.
 *
 * When the Supabase integration is added, a profile service will:
 * 1. Fetch `CanisterProfile` from the backend canister.
 * 2. Upsert the record to a Supabase `profiles` table.
 * 3. Merge cloud-only fields (`avatarUrl`, `bio`, etc.) back here.
 * 4. Update `syncedAt` to the current timestamp.
 */
export interface Profile extends CanisterProfile {
  /** Role resolved by the auth layer. */
  role: UserRole;

  // ── Supabase sync fields ─────────────────────────────────────────
  /** Supabase row UUID — populated after first cloud sync. */
  supabaseId?: string;
  /** Public avatar URL stored in Supabase Storage. */
  avatarUrl?: string;
  /** Short biography stored in Supabase. */
  bio?: string;
  /** Unix timestamp (ms) of the last successful Supabase sync. */
  syncedAt?: number;
}
