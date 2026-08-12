/**
 * End-to-end tests for the `safe-room` Edge Function.
 *
 * The function runs for real; only PostgREST is stubbed by a small in-memory
 * store that mimics the filters the function uses. What is proven here is the
 * behaviour the Safe Rooms feature depends on:
 *   • every participant publishes their OWN position and sees the others;
 *   • chat messages are scoped to the room and attributed to their author;
 *   • a participant of another room never sees this room's participants;
 *   • leaving removes the location immediately;
 *   • the terms must be accepted and credentials are verified.
 *
 * Run with:  deno test --allow-net --allow-env supabase/functions/safe-room
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.env.set('SUPABASE_URL', 'https://stub.supabase.test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

// ─── In-memory PostgREST stub ────────────────────────────────────────────────

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  safe_rooms: [],
  safe_room_participants: [],
  safe_room_messages: [],
};

let sequence = 0;
function uuid(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

/** Applies the `column=op.value` filters used by the function. */
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit'].includes(key)) continue;
    const [op, ...rest] = raw.split('.');
    const value = rest.join('.');
    if (op === 'eq' && String(row[key]) !== value) return false;
    if (op === 'is' && value === 'null' && row[key] !== null && row[key] !== undefined) return false;
    if (op === 'gt' && !(new Date(row[key]).getTime() > new Date(value).getTime())) return false;
  }
  return true;
}

const realFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(href);
  const method = init?.method ?? 'GET';
  const [, , , table] = url.pathname.split('/'); // /rest/v1/<table>
  const rows = tables[table];
  if (!rows) return Promise.reject(new Error(`unexpected table ${table}`));

  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

  if (method === 'GET') {
    const found = rows.filter((r) => matches(r, url.searchParams));
    return Promise.resolve(new Response(JSON.stringify(found), { status: 200 }));
  }
  if (method === 'POST') {
    const now = new Date().toISOString();
    const row: Row = {
      id: uuid(),
      created_at: now,
      joined_at: now,
      last_seen_at: now,
      left_at: null,
      closed_at: null,
      latitude: null,
      longitude: null,
      accuracy_meters: null,
      location_updated_at: null,
      terms_version: 'safe-room-v1',
      ...body,
    };
    rows.push(row);
    return Promise.resolve(new Response(JSON.stringify([row]), { status: 201 }));
  }
  if (method === 'PATCH') {
    for (const row of rows) {
      if (matches(row, url.searchParams)) Object.assign(row, body);
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.reject(new Error(`unexpected method ${method}`));
}) as typeof fetch;

globalThis.addEventListener('unload', () => {
  globalThis.fetch = realFetch;
});

// The module registers an HTTP server on import; the test drives the handler
// directly instead of opening a socket.
const realServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = () => ({ finished: Promise.resolve(), shutdown: () => Promise.resolve() });
const { handleRequest } = await import('./index.ts');
// deno-lint-ignore no-explicit-any
(Deno as any).serve = realServe;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function call(payload: unknown): Promise<{ status: number; body: any }> {
  const res = await handleRequest(
    new Request('https://stub.functions.test/safe-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  return { status: res.status, body: await res.json() };
}

interface Session {
  roomToken: string;
  participantId: string;
  participantSecret: string;
}

function session(body: any): Session {
  return {
    roomToken: body.roomToken,
    participantId: body.participantId,
    participantSecret: body.participantSecret,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

Deno.test('every participant of a room has their own live marker', async () => {
  const created = await call({
    action: 'create',
    name: 'Night walk',
    displayName: 'Ana',
    durationMinutes: 60,
    radiusMeters: 800,
  });
  assertEquals(created.status, 200);
  const ana = session(created.body);
  assertEquals(created.body.room.radiusMeters, 800);
  assertEquals(created.body.room.maxParticipants, 30);

  const joinedB = await call({
    action: 'join',
    roomToken: ana.roomToken,
    displayName: 'Bruno',
    acceptTerms: true,
  });
  assertEquals(joinedB.status, 200);
  const bruno = session(joinedB.body);

  const joinedC = await call({
    action: 'join',
    roomToken: ana.roomToken,
    displayName: 'Carla',
    acceptTerms: true,
  });
  const carla = session(joinedC.body);

  await call({ action: 'location', ...ana, latitude: 38.72, longitude: -9.14, accuracyMeters: 12 });
  await call({ action: 'location', ...bruno, latitude: 38.73, longitude: -9.15 });
  const afterCarla = await call({
    action: 'location',
    ...carla,
    latitude: 38.74,
    longitude: -9.16,
  });

  // Carla sees three distinct markers, one of which is her own.
  const points = afterCarla.body.participants.filter((p: any) => p.latitude !== null);
  assertEquals(points.length, 3);
  assertEquals(
    points.map((p: any) => p.displayName).sort(),
    ['Ana', 'Bruno', 'Carla'],
  );
  assertEquals(points.filter((p: any) => p.isSelf).length, 1);
  assertEquals(points.find((p: any) => p.isSelf).displayName, 'Carla');
  assertEquals(points.find((p: any) => p.displayName === 'Ana').latitude, 38.72);

  // And Ana sees the same three participants from her own point of view.
  const anaView = await call({ action: 'state', ...ana });
  assertEquals(anaView.body.participants.length, 3);
  assertEquals(anaView.body.participants.find((p: any) => p.isSelf).displayName, 'Ana');
});

Deno.test('chat is scoped to the room and attributed to the author', async () => {
  const created = await call({ action: 'create', name: 'Room chat', displayName: 'Ana' });
  const ana = session(created.body);
  const bruno = session(
    (await call({ action: 'join', roomToken: ana.roomToken, displayName: 'Bruno', acceptTerms: true }))
      .body,
  );

  await call({ action: 'message', ...ana, body: 'Estou à porta do café.' });
  const afterBruno = await call({ action: 'message', ...bruno, body: 'Chego em 2 minutos.' });

  assertEquals(afterBruno.body.messages.length, 2);
  assertEquals(afterBruno.body.messages[0].authorName, 'Ana');
  assertEquals(afterBruno.body.messages[0].isSelf, false);
  assertEquals(afterBruno.body.messages[1].authorName, 'Bruno');
  assertEquals(afterBruno.body.messages[1].isSelf, true);
  assert(afterBruno.body.messages[0].createdAt);

  // A different room never sees these messages or participants.
  const other = session((await call({ action: 'create', name: 'Other', displayName: 'Dora' })).body);
  const otherState = await call({ action: 'state', ...other });
  assertEquals(otherState.body.messages.length, 0);
  assertEquals(otherState.body.participants.length, 1);
});

Deno.test('leaving removes the location from the room immediately', async () => {
  const created = await call({ action: 'create', name: 'Exit', displayName: 'Ana' });
  const ana = session(created.body);
  const bruno = session(
    (await call({ action: 'join', roomToken: ana.roomToken, displayName: 'Bruno', acceptTerms: true }))
      .body,
  );
  await call({ action: 'location', ...bruno, latitude: 38.7, longitude: -9.1 });

  const before = await call({ action: 'state', ...ana });
  assertEquals(before.body.participants.length, 2);

  const left = await call({ action: 'leave', ...bruno });
  assertEquals(left.body.left, true);

  const after = await call({ action: 'state', ...ana });
  assertEquals(after.body.participants.length, 1);
  assertEquals(after.body.participants[0].displayName, 'Ana');

  // A participant that left can no longer act on the room.
  const rejected = await call({ action: 'state', ...bruno });
  assertEquals(rejected.status, 403);
});

Deno.test('the terms must be accepted to join', async () => {
  const created = await call({ action: 'create', name: 'Terms', displayName: 'Ana' });
  const res = await call({
    action: 'join',
    roomToken: created.body.roomToken,
    displayName: 'Bruno',
  });
  assertEquals(res.status, 403);
  assert(String(res.body.error).includes('terms'));
});

Deno.test('a wrong participant secret is rejected', async () => {
  const created = await call({ action: 'create', name: 'Secret', displayName: 'Ana' });
  const ana = session(created.body);
  const res = await call({ action: 'state', ...ana, participantSecret: 'deadbeef'.repeat(8) });
  assertEquals(res.status, 403);
});

Deno.test('an unknown room token is rejected', async () => {
  const res = await call({
    action: 'join',
    roomToken: 'not-a-real-token',
    displayName: 'Bruno',
    acceptTerms: true,
  });
  assertEquals(res.status, 404);
});

Deno.test('the room duration is capped at 24 hours', async () => {
  const created = await call({
    action: 'create',
    name: 'Long',
    displayName: 'Ana',
    durationMinutes: 5000,
  });
  const room = tables.safe_rooms.find((r) => r.token === created.body.roomToken)!;
  const hours =
    (new Date(room.expires_at).getTime() - new Date(room.created_at).getTime()) / 3_600_000;
  assert(hours <= 24.001, `expected <= 24h, got ${hours}`);
});

Deno.test('the safety radius is capped at 1000 metres', async () => {
  const created = await call({
    action: 'create',
    name: 'Wide',
    displayName: 'Ana',
    radiusMeters: 99999,
  });
  assertEquals(created.body.room.radiusMeters, 1000);
});

Deno.test('an unknown action is rejected', async () => {
  const res = await call({ action: 'drop-everything' });
  assertEquals(res.status, 400);
});

Deno.test('the health probe reports configuration without leaking room data', async () => {
  await call({ action: 'create', name: 'Health', displayName: 'Ana' });
  const res = await call({ action: 'health' });
  assertEquals(res.status, 200);
  assertEquals(res.body.status, 'configured');
  assertEquals(res.body.storage, 'connected');
  assertEquals(res.body.limits.maxParticipants, 30);
  assertEquals(res.body.limits.maxRadiusMeters, 1000);
  // No room, participant or message payload may appear in an operator probe.
  const serialised = JSON.stringify(res.body);
  assert(!serialised.includes('Health'), 'health must not expose room names');
  assert(!serialised.includes('Ana'), 'health must not expose participant names');
});
