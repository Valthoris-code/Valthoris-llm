/**
 * Supabase Edge Function — `safe-room`
 *
 * Backend for the Valthoris Safe Rooms: short-lived, link-shared rooms where
 * every authorised participant publishes their OWN location and sees the other
 * participants of the SAME room, plus a private chat scoped to that room.
 *
 * Why the logic lives here instead of in the browser
 * --------------------------------------------------
 * Valthoris authenticates with Internet Identity, so the browser has no
 * Supabase session (`auth.uid()` is always NULL) and cannot be trusted with
 * direct table access. This function is the single writer/reader of the
 * safe_room* tables; it uses the service-role key injected by Supabase
 * (SUPABASE_SERVICE_ROLE_KEY), which never leaves the server.
 *
 * Authorisation
 * -------------
 *   • the room token (bearer secret carried by the share link) selects a room;
 *   • a per-participant secret, returned once at join time and stored only as a
 *     SHA-256 hash, proves the caller is that participant;
 *   • expired/closed rooms and participants that left are rejected or excluded.
 *
 * Platform rules enforced here: at most 30 participants, at most 24 hours,
 * safety radius at most 1000 m.
 */

// deno-lint-ignore-file no-explicit-any

const MAX_PARTICIPANTS = 30;
const MAX_DURATION_MINUTES = 24 * 60;
const MAX_RADIUS_METERS = 1000;
const MAX_MESSAGE_CHARS = 2000;
const MAX_NAME_CHARS = 60;
/** A participant that has not called the API for this long is treated as gone. */
const PRESENCE_TIMEOUT_MS = 5 * 60 * 1000;

/** Platform rules published to operators by the `health` action. */
const LIMITS = {
  maxParticipants: MAX_PARTICIPANTS,
  maxDurationMinutes: MAX_DURATION_MINUTES,
  maxRadiusMeters: MAX_RADIUS_METERS,
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function env(name: string): string | undefined {
  const value = (globalThis as any).Deno?.env?.get(name);
  return value && value.length > 0 ? value : undefined;
}

/** An error whose message is safe to return to the browser. */
class SafeRoomError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ─── Supabase REST access (service role) ─────────────────────────────────────

function restConfig(): { url: string; key: string } {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new SafeRoomError(
      'Safe Rooms backend is not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
      503,
    );
  }
  return { url: url.replace(/\/$/, ''), key };
}

const AUTH_SCHEME = 'Bearer';

async function rest(
  path: string,
  init: { method: string; body?: unknown; prefer?: string },
): Promise<any> {
  const { url, key } = restConfig();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `${AUTH_SCHEME} ${key}`,
    'Content-Type': 'application/json',
  };
  if (init.prefer) headers['Prefer'] = init.prefer;

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await res.text();
  if (!res.ok) {
    // The PostgREST body can contain schema details: log it, do not return it.
    console.error('[safe-room] rest', init.method, path, res.status, text);
    throw new SafeRoomError('Safe Rooms storage rejected the operation.', 502);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison of two equal-length hex digests. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SafeRoomError(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) throw new SafeRoomError(`${field} is too long`);
  return trimmed;
}

function requireCoordinate(value: unknown, field: string, limit: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new SafeRoomError(`${field} is invalid`);
  }
  return value;
}

interface RoomRow {
  id: string;
  token: string;
  name: string;
  radius_meters: number;
  max_participants: number;
  created_at: string;
  expires_at: string;
  closed_at: string | null;
  terms_version: string;
}

interface ParticipantRow {
  id: string;
  room_id: string;
  display_name: string;
  principal: string | null;
  secret_hash: string;
  is_creator: boolean;
  joined_at: string;
  last_seen_at: string;
  left_at: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  location_updated_at: string | null;
}

async function loadRoom(token: string): Promise<RoomRow> {
  const rows = await rest(
    `safe_rooms?token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
    { method: 'GET' },
  );
  const room = Array.isArray(rows) ? rows[0] : null;
  if (!room) throw new SafeRoomError('This Safe Room link is not valid.', 404);
  if (room.closed_at) throw new SafeRoomError('This Safe Room has been closed.', 410);
  if (new Date(room.expires_at).getTime() <= Date.now()) {
    throw new SafeRoomError('This Safe Room has expired.', 410);
  }
  return room as RoomRow;
}

async function activeParticipants(roomId: string): Promise<ParticipantRow[]> {
  const rows = await rest(
    `safe_room_participants?room_id=eq.${roomId}&left_at=is.null&select=*&order=joined_at.asc`,
    { method: 'GET' },
  );
  return Array.isArray(rows) ? (rows as ParticipantRow[]) : [];
}

/**
 * Resolves the caller from (roomToken, participantId, participantSecret).
 * A participant that already left cannot act on the room any more.
 */
async function authenticate(payload: any): Promise<{ room: RoomRow; participant: ParticipantRow }> {
  const token = requireString(payload?.roomToken, 'roomToken', 128);
  const participantId = requireString(payload?.participantId, 'participantId', 64);
  const secret = requireString(payload?.participantSecret, 'participantSecret', 256);

  const room = await loadRoom(token);
  const rows = await rest(
    `safe_room_participants?id=eq.${encodeURIComponent(participantId)}&room_id=eq.${room.id}&select=*&limit=1`,
    { method: 'GET' },
  );
  const participant = Array.isArray(rows) ? (rows[0] as ParticipantRow | undefined) : undefined;
  if (!participant) throw new SafeRoomError('You are not a participant of this room.', 403);
  if (participant.left_at) throw new SafeRoomError('You have left this room.', 403);
  if (!timingSafeEqual(await sha256Hex(secret), participant.secret_hash)) {
    throw new SafeRoomError('Invalid participant credentials.', 403);
  }
  return { room, participant };
}

function publicRoom(room: RoomRow, participantCount: number) {
  return {
    name: room.name,
    token: room.token,
    radiusMeters: room.radius_meters,
    maxParticipants: room.max_participants,
    createdAt: room.created_at,
    expiresAt: room.expires_at,
    termsVersion: room.terms_version,
    participantCount,
  };
}

/**
 * Projects a participant for the room view.
 *
 * The location is only exposed while the participant is present: it is dropped
 * once they stop calling the API (tab closed, device offline) so a stale point
 * is never shown as if it were live.
 */
function publicParticipant(row: ParticipantRow, selfId: string) {
  const present = Date.now() - new Date(row.last_seen_at).getTime() < PRESENCE_TIMEOUT_MS;
  const hasLocation =
    present && typeof row.latitude === 'number' && typeof row.longitude === 'number';
  return {
    id: row.id,
    displayName: row.display_name,
    isCreator: row.is_creator,
    isSelf: row.id === selfId,
    present,
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at,
    latitude: hasLocation ? row.latitude : null,
    longitude: hasLocation ? row.longitude : null,
    accuracyMeters: hasLocation ? row.accuracy_meters : null,
    locationUpdatedAt: hasLocation ? row.location_updated_at : null,
  };
}

async function touch(participantId: string, patch: Record<string, unknown> = {}): Promise<void> {
  await rest(`safe_room_participants?id=eq.${encodeURIComponent(participantId)}`, {
    method: 'PATCH',
    body: { last_seen_at: new Date().toISOString(), ...patch },
  });
}

/** Most recent messages returned for a room, newest-window not oldest-window. */
const MESSAGE_WINDOW = 200;

async function roomState(room: RoomRow, selfId: string, since?: unknown) {
  const participants = await activeParticipants(room.id);
  let messageFilter = '';
  if (typeof since === 'string' && since.length > 0 && !Number.isNaN(Date.parse(since))) {
    messageFilter = `&created_at=gt.${encodeURIComponent(new Date(since).toISOString())}`;
  }
  // The window is taken from the NEWEST end: sorting ascending and limiting
  // would return the first 200 messages ever sent and freeze the chat as soon
  // as a busy room passed that mark. `id` breaks ties so two messages written
  // in the same millisecond still have one stable order.
  const rows = await rest(
    `safe_room_messages?room_id=eq.${room.id}${messageFilter}` +
      `&select=id,participant_id,author_name,body,created_at` +
      `&order=created_at.desc,id.desc&limit=${MESSAGE_WINDOW}`,
    { method: 'GET' },
  );
  // Restore chronological order for rendering.
  const messages = (Array.isArray(rows) ? rows : []).slice().reverse();
  return {
    room: publicRoom(room, participants.length),
    participants: participants.map((p) => publicParticipant(p, selfId)),
    messages: messages.map((m: any) => ({
      id: m.id,
      participantId: m.participant_id,
      authorName: m.author_name,
      body: m.body,
      createdAt: m.created_at,
      isSelf: m.participant_id === selfId,
    })),
    serverTime: new Date().toISOString(),
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function createRoom(payload: any) {
  // A missing, blank or non-string name falls back to the default instead of
  // failing: the room name is a label, not an authorisation input.
  const name =
    typeof payload?.name === 'string' && payload.name.trim().length > 0
      ? requireString(payload.name, 'name', MAX_NAME_CHARS)
      : 'Safe Room';
  const displayName = requireString(payload?.displayName, 'displayName', MAX_NAME_CHARS);
  const durationMinutes = Math.min(
    Math.max(Math.round(Number(payload?.durationMinutes ?? 60)) || 60, 5),
    MAX_DURATION_MINUTES,
  );
  const radiusMeters = Math.min(
    Math.max(Math.round(Number(payload?.radiusMeters ?? 500)) || 500, 50),
    MAX_RADIUS_METERS,
  );
  const principal =
    typeof payload?.principal === 'string' && payload.principal.trim().length > 0
      ? payload.principal.trim().slice(0, 128)
      : null;

  const token = randomToken();
  const secret = randomToken(32);
  const now = Date.now();

  const inserted = await rest('safe_rooms', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      token,
      name,
      radius_meters: radiusMeters,
      max_participants: MAX_PARTICIPANTS,
      expires_at: new Date(now + durationMinutes * 60_000).toISOString(),
    },
  });
  const room = (Array.isArray(inserted) ? inserted[0] : inserted) as RoomRow;

  const participantRows = await rest('safe_room_participants', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      room_id: room.id,
      display_name: displayName,
      principal,
      secret_hash: await sha256Hex(secret),
      is_creator: true,
    },
  });
  const participant = (Array.isArray(participantRows) ? participantRows[0] : participantRows) as ParticipantRow;

  return {
    roomToken: token,
    participantId: participant.id,
    participantSecret: secret,
    ...(await roomState(room, participant.id)),
  };
}

async function joinRoom(payload: any) {
  const token = requireString(payload?.roomToken, 'roomToken', 128);
  const displayName = requireString(payload?.displayName, 'displayName', MAX_NAME_CHARS);
  if (payload?.acceptTerms !== true) {
    throw new SafeRoomError('The Safe Room terms must be accepted before joining.', 403);
  }

  const room = await loadRoom(token);
  const participants = await activeParticipants(room.id);
  if (participants.length >= room.max_participants) {
    throw new SafeRoomError(`This Safe Room is full (${room.max_participants} participants).`, 409);
  }

  const principal =
    typeof payload?.principal === 'string' && payload.principal.trim().length > 0
      ? payload.principal.trim().slice(0, 128)
      : null;
  const secret = randomToken(32);

  const rows = await rest('safe_room_participants', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      room_id: room.id,
      display_name: displayName,
      principal,
      secret_hash: await sha256Hex(secret),
      is_creator: false,
    },
  });
  const participant = (Array.isArray(rows) ? rows[0] : rows) as ParticipantRow;

  return {
    roomToken: room.token,
    participantId: participant.id,
    participantSecret: secret,
    ...(await roomState(room, participant.id)),
  };
}

/** Publishes the caller's own position. A participant can only move themselves. */
async function publishLocation(payload: any) {
  const { room, participant } = await authenticate(payload);
  const latitude = requireCoordinate(payload?.latitude, 'latitude', 90);
  const longitude = requireCoordinate(payload?.longitude, 'longitude', 180);
  const accuracy =
    typeof payload?.accuracyMeters === 'number' && Number.isFinite(payload.accuracyMeters)
      ? Math.max(0, Math.min(payload.accuracyMeters, 100_000))
      : null;

  await touch(participant.id, {
    latitude,
    longitude,
    accuracy_meters: accuracy,
    location_updated_at: new Date().toISOString(),
  });

  return roomState(room, participant.id);
}

async function readState(payload: any) {
  const { room, participant } = await authenticate(payload);
  await touch(participant.id);
  return roomState(room, participant.id, payload?.since);
}

async function sendMessage(payload: any) {
  const { room, participant } = await authenticate(payload);
  const body = requireString(payload?.body, 'body', MAX_MESSAGE_CHARS);
  await rest('safe_room_messages', {
    method: 'POST',
    body: {
      room_id: room.id,
      participant_id: participant.id,
      author_name: participant.display_name,
      body,
      // Written explicitly rather than relying on the column default, so the
      // message carries the instant the backend accepted it and the ordering
      // is deterministic even across a clock skew between statements.
      created_at: new Date().toISOString(),
    },
  });
  await touch(participant.id);
  return roomState(room, participant.id);
}

/**
 * Leaves the room. The participant's location stops being returned to everyone
 * else immediately, and the creator leaving closes the room for everybody.
 */
async function leaveRoom(payload: any) {
  const { room, participant } = await authenticate(payload);
  const now = new Date().toISOString();
  await rest(`safe_room_participants?id=eq.${encodeURIComponent(participant.id)}`, {
    method: 'PATCH',
    body: {
      left_at: now,
      latitude: null,
      longitude: null,
      accuracy_meters: null,
      location_updated_at: null,
    },
  });
  if (participant.is_creator) {
    await rest(`safe_rooms?id=eq.${room.id}`, { method: 'PATCH', body: { closed_at: now } });
  }
  return { left: true, roomClosed: participant.is_creator };
}

/**
 * Read-only configuration probe for the Administration page.
 *
 * It reports whether the function can reach its storage, never the values of
 * the secrets themselves, and never any room or participant data.
 */
async function health(): Promise<unknown> {
  const configured = Boolean(env('SUPABASE_URL')) && Boolean(env('SUPABASE_SERVICE_ROLE_KEY'));
  if (!configured) {
    return {
      status: 'not_configured',
      storage: 'disconnected',
      limits: LIMITS,
    };
  }
  // `head`-style count keeps the probe cheap and returns no row content.
  await rest('safe_rooms?select=id&limit=1', { method: 'GET' });
  return { status: 'configured', storage: 'connected', limits: LIMITS };
}

// ─── HTTP entry point ────────────────────────────────────────────────────────

const ACTIONS: Record<string, (payload: any) => Promise<unknown>> = {
  health,
  create: createRoom,
  join: joinRoom,
  location: publishLocation,
  state: readState,
  message: sendMessage,
  leave: leaveRoom,
};

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const action = ACTIONS[String(payload?.action ?? '')];
  if (!action) {
    return json({ error: 'Unknown action' }, 400);
  }

  try {
    return json(await action(payload), 200);
  } catch (err) {
    if (err instanceof SafeRoomError) {
      return json({ error: err.message }, err.status);
    }
    // Unexpected faults stay in the function logs; the browser gets no detail.
    console.error('[safe-room]', err);
    return json({ error: 'Safe Rooms backend error. Please try again.' }, 500);
  }
}

(globalThis as any).Deno?.serve(handleRequest);
