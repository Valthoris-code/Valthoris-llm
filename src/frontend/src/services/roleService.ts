/**
 * Role Management Service — Valthoris
 *
 * Manages user roles and account status with localStorage persistence.
 *
 * Architecture note: this service is designed to be replaced by
 * a Motoko admin canister call once the role-persistence canister is deployed.
 * The public API surface is intentionally kept stable for that migration.
 *
 * Motoko integration hook (future):
 *   Replace load()/save() calls with canister query/update calls, e.g.:
 *     await adminCanister.setUserRole(principal, role)
 *     await adminCanister.getAllUsers()
 */

import type { UserRole } from '../models/User';

const STORAGE_KEY = 'valthoris_user_roles';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ManagedUser {
  /** Internet Identity principal text representation. */
  principal: string;
  /** Display name shown in the admin UI. */
  displayName: string;
  /** Assigned role. */
  role: UserRole;
  /** Whether the account is active. */
  isActive: boolean;
  /** Unix timestamp (ms) of first registration. */
  registeredAt: number;
}

type RoleStore = Record<string, ManagedUser>;

// ─── Private helpers ──────────────────────────────────────────────────────────

function load(): RoleStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RoleStore) : {};
  } catch {
    return {};
  }
}

function save(store: RoleStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / private-browsing errors
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Return all registered users sorted by registration date (oldest first). */
export function getAllUsers(): ManagedUser[] {
  return Object.values(load()).sort((a, b) => a.registeredAt - b.registeredAt);
}

/** Return the stored role for a principal, defaulting to 'member'. */
export function getUserRole(principal: string): UserRole {
  return load()[principal]?.role ?? 'member';
}

/**
 * Register or refresh a user entry.
 *
 * - First ever user automatically becomes 'administrator' (bootstrap).
 * - Subsequent users default to 'member'.
 * - If the user already exists their role is preserved; only displayName
 *   is updated when a non-empty value is supplied.
 *
 * Called automatically from AuthContext after a successful II login.
 */
export function ensureUser(principal: string, displayName?: string): ManagedUser {
  const store = load();

  if (!store[principal]) {
    const isFirstUser = Object.keys(store).length === 0;
    store[principal] = {
      principal,
      displayName: displayName ?? `${principal.slice(0, 12)}…`,
      role: isFirstUser ? 'administrator' : 'member',
      isActive: true,
      registeredAt: Date.now(),
    };
    save(store);
  } else if (displayName && store[principal].displayName !== displayName) {
    store[principal] = { ...store[principal], displayName };
    save(store);
  }

  return store[principal];
}

/** Promote a user one step up the role hierarchy (member → moderator → administrator). */
export function promoteUser(principal: string): void {
  const store = load();
  if (!store[principal]) return;
  const next: Record<UserRole, UserRole> = {
    member: 'moderator',
    moderator: 'administrator',
    administrator: 'administrator',
  };
  store[principal] = { ...store[principal], role: next[store[principal].role] };
  save(store);
}

/** Demote a user one step down the role hierarchy (administrator → moderator → member). */
export function demoteUser(principal: string): void {
  const store = load();
  if (!store[principal]) return;
  const prev: Record<UserRole, UserRole> = {
    administrator: 'moderator',
    moderator: 'member',
    member: 'member',
  };
  store[principal] = { ...store[principal], role: prev[store[principal].role] };
  save(store);
}

/** Mark a user account as inactive. */
export function deactivateUser(principal: string): void {
  const store = load();
  if (!store[principal]) return;
  store[principal] = { ...store[principal], isActive: false };
  save(store);
}

/** Restore a previously deactivated user account. */
export function reactivateUser(principal: string): void {
  const store = load();
  if (!store[principal]) return;
  store[principal] = { ...store[principal], isActive: true };
  save(store);
}
