/**
 * Safe Rooms client.
 *
 * A Safe Room is a multi-participant, link-shared room: every participant
 * publishes their OWN position and sees the other participants of the SAME
 * room, plus a private chat scoped to that room.
 *
 * All state lives in the `safe-room` Supabase Edge Function (service-role
 * writes, per-participant secrets). The browser only holds:
 *   • the room token, which comes from the share link;
 *   • its own participant id and secret, returned once at join time and kept
 *     in sessionStorage so a page reload does not lose the seat.
 *
 * Nothing here is simulated: every function performs a real call and throws
 * the real error when it fails.
 */

import { BASE_PATH } from '../basePath';
import { getSupabase, isSupabaseConfigured, SUPABASE_CONFIG_ERROR } from './supabaseClient';

export const SAFE_ROOM_FUNCTION_NAME = 'safe-room';

/** Platform rules, mirrored by the Edge Function which enforces them. */
export const SAFE_ROOM_MAX_PARTICIPANTS = 30;
export const SAFE_ROOM_MAX_DURATION_MINUTES = 24 * 60;
export const SAFE_ROOM_MAX_RADIUS_METERS = 1000;

export const isSafeRoomBackendConfigured = isSupabaseConfigured;

export const SAFE_ROOM_CONFIG_ERROR =
  `${SUPABASE_CONFIG_ERROR} Safe Rooms reach their backend through the ` +
  `"${SAFE_ROOM_FUNCTION_NAME}" Supabase Edge Function.`;

export interface SafeRoom {
  name: string;
  token: string;
  radiusMeters: number;
  maxParticipants: number;
  createdAt: string;
  expiresAt: string;
  termsVersion: string;
  participantCount: number;
}

export interface SafeRoomParticipant {
  id: string;
  displayName: string;
  isCreator: boolean;
  isSelf: boolean;
  /** False once the participant stops reporting (closed tab, offline device). */
  present: boolean;
  joinedAt: string;
  lastSeenAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  locationUpdatedAt: string | null;
}

export interface SafeRoomMessage {
  id: string;
  participantId: string;
  authorName: string;
  body: string;
  createdAt: string;
  isSelf: boolean;
}

export interface SafeRoomState {
  room: SafeRoom;
  participants: SafeRoomParticipant[];
  messages: SafeRoomMessage[];
  serverTime: string;
}

/** Credentials that identify this browser as one participant of one room. */
export interface SafeRoomSession {
  roomToken: string;
  participantId: string;
  participantSecret: string;
}

export type SafeRoomJoinResult = SafeRoomSession & SafeRoomState;

const STORAGE_KEY = 'valthoris.safeRoom.session';

/**
 * The stored seat, plus the instant it stops being usable.
 *
 * `participantSecret` is a bearer capability, so it is deliberately kept in
 * `sessionStorage` rather than in `localStorage`: the value dies with the tab,
 * is bound to this origin, and grants nothing beyond one room — no account, no
 * profile, no other room. Keeping it is what allows a page reload (or the
 * Android browser reclaiming the tab) to return to the same seat instead of
 * silently creating a duplicate participant on the map.
 *
 * `expiresAt` bounds it further: a room lives at most 24 hours, so a secret
 * that outlived its room is discarded on read instead of lingering in storage.
 */
interface StoredSeat extends SafeRoomSession {
  expiresAt?: string;
}

/** Remembers the seat so a reload rejoins the same room as the same person. */
export function storeSession(session: SafeRoomSession, expiresAt?: string): void {
  try {
    const seat: StoredSeat = { ...session, ...(expiresAt ? { expiresAt } : {}) };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seat));
  } catch {
    // Private-mode browsers refuse storage; the room still works for this tab.
  }
}

export function loadStoredSession(roomToken?: string): SafeRoomSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSeat;
    if (!parsed?.roomToken || !parsed.participantId || !parsed.participantSecret) return null;
    if (roomToken && parsed.roomToken !== roomToken) return null;
    // The room is over: drop the credential instead of keeping it around.
    if (parsed.expiresAt) {
      const expiry = Date.parse(parsed.expiresAt);
      if (Number.isFinite(expiry) && expiry <= Date.now()) {
        clearStoredSession();
        return null;
      }
    }
    return {
      roomToken: parsed.roomToken,
      participantId: parsed.participantId,
      participantSecret: parsed.participantSecret,
    };
  } catch {
    return null;
  }
}

export function clearStoredSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}

/** Extracts a human-readable message from an Edge Function error response. */
async function readFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      // fall through
    }
    return `Safe Rooms backend returned HTTP ${context.status}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function invoke<T>(payload: Record<string, unknown>): Promise<T> {
  if (!isSafeRoomBackendConfigured) {
    throw new Error(SAFE_ROOM_CONFIG_ERROR);
  }
  const { data, error } = await getSupabase().functions.invoke<T | { error: string }>(
    SAFE_ROOM_FUNCTION_NAME,
    { body: payload },
  );
  if (error) throw new Error(await readFunctionError(error));
  if (!data) throw new Error('Safe Rooms backend returned an empty response');
  if (typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

export interface CreateRoomInput {
  name: string;
  displayName: string;
  durationMinutes: number;
  radiusMeters: number;
  principal?: string | null;
}

/**
 * Releases the seat this browser still holds in another room before it takes a
 * seat in a new one.
 *
 * Without this, changing room would leave the previous marker on the previous
 * map until the server-side presence timeout expired — the participant would
 * still appear in a room they are no longer in. Best-effort on purpose: if the
 * old room is already gone the new one must still be joinable.
 */
async function releasePreviousSeat(nextRoomToken?: string): Promise<void> {
  const previous = loadStoredSession();
  if (!previous) return;
  if (nextRoomToken && previous.roomToken === nextRoomToken) return;
  try {
    await invoke<{ left: boolean }>({ action: 'leave', ...previous });
  } catch {
    // The previous room may have expired, closed, or already dropped the seat.
  } finally {
    clearStoredSession();
  }
}

export async function createRoom(input: CreateRoomInput): Promise<SafeRoomJoinResult> {
  await releasePreviousSeat();
  return invoke<SafeRoomJoinResult>({
    action: 'create',
    name: input.name,
    displayName: input.displayName,
    durationMinutes: Math.min(input.durationMinutes, SAFE_ROOM_MAX_DURATION_MINUTES),
    radiusMeters: Math.min(input.radiusMeters, SAFE_ROOM_MAX_RADIUS_METERS),
    ...(input.principal ? { principal: input.principal } : {}),
  });
}

export async function joinRoom(input: {
  roomToken: string;
  displayName: string;
  acceptTerms: boolean;
  principal?: string | null;
}): Promise<SafeRoomJoinResult> {
  await releasePreviousSeat(input.roomToken);
  return invoke<SafeRoomJoinResult>({
    action: 'join',
    roomToken: input.roomToken,
    displayName: input.displayName,
    acceptTerms: input.acceptTerms,
    ...(input.principal ? { principal: input.principal } : {}),
  });
}

export async function fetchRoomState(session: SafeRoomSession): Promise<SafeRoomState> {
  return invoke<SafeRoomState>({ action: 'state', ...session });
}

/** Publishes this participant's own position and returns the refreshed room. */
export async function publishLocation(
  session: SafeRoomSession,
  position: { lat: number; lng: number; accuracy?: number },
): Promise<SafeRoomState> {
  return invoke<SafeRoomState>({
    action: 'location',
    ...session,
    latitude: position.lat,
    longitude: position.lng,
    ...(typeof position.accuracy === 'number' ? { accuracyMeters: position.accuracy } : {}),
  });
}

export async function sendRoomMessage(
  session: SafeRoomSession,
  body: string,
): Promise<SafeRoomState> {
  return invoke<SafeRoomState>({ action: 'message', ...session, body });
}

/**
 * Leaves the room and drops the stored seat.
 *
 * The seat is cleared even when the call fails: the caller asked to leave, and
 * a room that refused the request (expired, closed, seat already released) is
 * one this browser must not keep credentials for either. The error is still
 * rethrown so the caller can report it.
 */
export async function leaveRoom(session: SafeRoomSession): Promise<void> {
  try {
    await invoke<{ left: boolean }>({ action: 'leave', ...session });
  } finally {
    clearStoredSession();
  }
}

/**
 * Absolute, shareable URL for a Safe Room token.
 * `BASE_PATH` always ends with "/", so the same build works on the custom
 * domain and on a GitHub Pages sub-path.
 */
export function buildRoomUrl(token: string): string {
  return `${window.location.origin}${BASE_PATH}room/${encodeURIComponent(token)}`;
}

export interface SafeRoomHealth {
  status: 'configured' | 'not_configured';
  storage: 'connected' | 'disconnected';
  limits: {
    maxParticipants: number;
    maxDurationMinutes: number;
    maxRadiusMeters: number;
  };
}

/**
 * Read-only probe used by the Administration page. It creates nothing and
 * returns no room data — only whether the backend is configured and can reach
 * its storage.
 */
export async function probeSafeRoomBackend(): Promise<SafeRoomHealth> {
  return invoke<SafeRoomHealth>({ action: 'health' });
}
