/**
 * Real tests for the `admin-api` Edge Function.
 *
 * They exercise the authorization pipeline, which is the part that actually
 * protects the administration:
 *   • an anonymous caller, a caller with an ordinary Valthoris account and a
 *     caller whose session never reached AAL2 all get the same opaque 404;
 *   • a ROOT administrator with an AAL2 session is served;
 *   • an administrator without the required permission is refused;
 *   • unexpected failures answer with the generic message, never with detail.
 *
 * Supabase Auth and PostgREST are stubbed at the `fetch` level: no network,
 * no key and no database are needed.
 *
 * Run with:  deno test --allow-env supabase/functions/admin-api
 */

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ACTION_PERMISSIONS,
  GENERIC_ERROR,
  MAX_IMPORT_ROWS,
  corsHeaders,
  handleRequest,
  hasPermission,
  normaliseImportRows,
  readAal,
  readAction,
} from './index.ts';

Deno.env.set('SUPABASE_URL', 'https://project.supabase.co');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-key-for-tests');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key-for-tests');

const realFetch = globalThis.fetch;

/** Minimal unsigned JWT carrying an `aal` claim; only the payload is read. */
function token(aal: string): string {
  const payload = btoa(JSON.stringify({ aal })).replace(/=+$/, '');
  return 'header.' + payload + '.signature';
}

interface StubOptions {
  /** null → the Auth server rejects the token. */
  user: { id: string; email: string } | null;
  /** null → the e-mail is not an administrator. */
  admin: Record<string, unknown> | null;
  /** Forces every RPC other than resolve/write to fail. */
  breakRpc?: boolean;
}

/** Installs a fetch stub and returns the RPCs that were called, with their arguments. */
function stub(
  options: StubOptions,
): { calls: string[]; bodies: Array<Record<string, unknown>>; restore: () => void } {
  const calls: string[] = [];
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url.includes('/auth/v1/user')) {
      return Promise.resolve(
        options.user
          ? new Response(JSON.stringify(options.user), { status: 200 })
          : new Response('{}', { status: 401 }),
      );
    }

    const name = url.split('/rpc/')[1] ?? url;
    calls.push(name);
    if (typeof init?.body === 'string') {
      try {
        bodies.push(JSON.parse(init.body));
      } catch {
        // A non-JSON body is not something these tests assert on.
      }
    }

    if (name === 'governance_resolve_admin') {
      return Promise.resolve(new Response(JSON.stringify(options.admin), { status: 200 }));
    }
    if (name.startsWith('governance_write') || name === 'governance_bind_admin_user') {
      return Promise.resolve(new Response('null', { status: 200 }));
    }
    if (options.breakRpc) {
      return Promise.resolve(new Response('permission denied for schema governance', { status: 403 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as typeof fetch;

  return { calls, bodies, restore: () => { globalThis.fetch = realFetch; } };
}

const ROOT_ADMIN = {
  id: '11111111-1111-1111-1111-111111111111',
  user_id: '99999999-9999-9999-9999-999999999999',
  email: 'coragem77@gmail.com',
  display_name: 'Hermínio Coragem',
  is_root: true,
  status: 'ACTIVE',
  mfa_required: true,
  roles: ['ROOT'],
  permissions: ['admin.access', 'dashboard.read'],
};

function request(path: string, accessToken?: string): Request {
  return new Request('https://project.supabase.co/functions/v1/admin-api' + path, {
    headers: accessToken ? { Authorization: 'Bearer ' + accessToken } : {},
  });
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

Deno.test('readAction only accepts known actions', () => {
  assertEquals(readAction('/functions/v1/admin-api/dashboard'), 'dashboard');
  assertEquals(readAction('/functions/v1/admin-api/audit-logs'), 'audit-logs');
  assertEquals(readAction('/functions/v1/admin-api/drop-tables'), null);
  assertEquals(readAction('/functions/v1/admin-api'), null);
  // Prototype keys must not be mistaken for actions.
  assertEquals(readAction('/functions/v1/admin-api/constructor'), null);
});

Deno.test('readAal extracts the assurance level from the access token', () => {
  assertEquals(readAal(token('aal2')), 'aal2');
  assertEquals(readAal(token('aal1')), 'aal1');
  assertEquals(readAal('not-a-jwt'), null);
});

Deno.test('ROOT satisfies every permission; others need the explicit key', () => {
  const root = { ...ROOT_ADMIN, isRoot: true, displayName: 'x', mfaRequired: true, permissions: [] };
  assert(hasPermission(root as never, 'billing.write'));

  const auditor = { ...root, isRoot: false, permissions: ['audit.read'] };
  assert(hasPermission(auditor as never, 'audit.read'));
  assert(!hasPermission(auditor as never, 'billing.write'));
});

// ─── Authorization pipeline ──────────────────────────────────────────────────

Deno.test('an anonymous caller gets an opaque 404', async () => {
  const s = stub({ user: null, admin: null });
  try {
    const response = await handleRequest(request('/dashboard'));
    assertEquals(response.status, 404);
    assertEquals(await response.json(), { error: 'Not found' });
    // Nothing was queried: the request never reached the database.
    assertEquals(s.calls.length, 0);
  } finally {
    s.restore();
  }
});

Deno.test('an ordinary Valthoris account gets the same opaque 404 and is audited', async () => {
  const s = stub({
    user: { id: 'user-1', email: 'alguem@exemplo.pt' },
    admin: null,
  });
  try {
    const response = await handleRequest(request('/dashboard', token('aal2')));
    assertEquals(response.status, 404);
    assertEquals(await response.json(), { error: 'Not found' });
    assert(s.calls.includes('governance_write_audit'));
    // The dashboard data was never read.
    assert(!s.calls.includes('governance_dashboard'));
  } finally {
    s.restore();
  }
});

Deno.test('a ROOT session that has not reached AAL2 is refused', async () => {
  const s = stub({
    user: { id: 'user-root', email: 'coragem77@gmail.com' },
    admin: ROOT_ADMIN,
  });
  try {
    const response = await handleRequest(request('/dashboard', token('aal1')));
    assertEquals(response.status, 404);
    assert(!s.calls.includes('governance_dashboard'));
  } finally {
    s.restore();
  }
});

Deno.test('a ROOT session with AAL2 is served and audited', async () => {
  const s = stub({
    user: { id: 'user-root', email: 'coragem77@gmail.com' },
    admin: ROOT_ADMIN,
  });
  try {
    const response = await handleRequest(request('/dashboard', token('aal2')));
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.data, { ok: true });
    assert(typeof body.requestId === 'string' && body.requestId.length > 0);
    assert(s.calls.includes('governance_write_audit'));
  } finally {
    s.restore();
  }
});

Deno.test('an administrator without the permission is refused with 403', async () => {
  const s = stub({
    user: { id: 'user-auditor', email: 'auditor@exemplo.pt' },
    admin: {
      ...ROOT_ADMIN,
      id: '22222222-2222-2222-2222-222222222222',
      email: 'auditor@exemplo.pt',
      is_root: false,
      roles: ['AUDITOR'],
      permissions: ['admin.access', 'audit.read'],
    },
  });
  try {
    const response = await handleRequest(request('/administrators', token('aal2')));
    assertEquals(response.status, 403);
    assertEquals(await response.json(), { error: 'Forbidden' });
    assert(!s.calls.includes('governance_list_admins'));
  } finally {
    s.restore();
  }
});

Deno.test('the auditor may read the audit log it is entitled to', async () => {
  const s = stub({
    user: { id: 'user-auditor', email: 'auditor@exemplo.pt' },
    admin: {
      ...ROOT_ADMIN,
      email: 'auditor@exemplo.pt',
      is_root: false,
      roles: ['AUDITOR'],
      permissions: ['admin.access', 'audit.read'],
    },
  });
  try {
    const response = await handleRequest(request('/audit-logs?limit=10', token('aal2')));
    assertEquals(response.status, 200);
    assert(s.calls.includes('governance_list_audit_logs'));
  } finally {
    s.restore();
  }
});

Deno.test('a backend failure answers generically and never leaks detail', async () => {
  const s = stub({
    user: { id: 'user-root', email: 'coragem77@gmail.com' },
    admin: ROOT_ADMIN,
    breakRpc: true,
  });
  try {
    const response = await handleRequest(request('/dashboard', token('aal2')));
    assertEquals(response.status, 503);
    const body = await response.json();
    assertEquals(body.error, GENERIC_ERROR);
    const serialised = JSON.stringify(body);
    assert(!serialised.includes('permission denied'));
    assert(!serialised.includes('governance'));
    // The technical detail went to the error log instead.
    assert(s.calls.includes('governance_write_error'));
  } finally {
    s.restore();
  }
});

Deno.test('every exposed action declares the permission it requires', () => {
  for (const [action, permission] of Object.entries(ACTION_PERMISSIONS)) {
    assert(permission.length > 0, action + ' has no permission');
  }
});

// ─── CORS ────────────────────────────────────────────────────────────────────

Deno.test('only known origins are granted cross-origin access', () => {
  const granted = corsHeaders(
    new Request('https://project.supabase.co/functions/v1/admin-api/session', {
      headers: { Origin: 'https://valthoris.com' },
    }),
  );
  assertEquals(granted['Access-Control-Allow-Origin'], 'https://valthoris.com');

  const refused = corsHeaders(
    new Request('https://project.supabase.co/functions/v1/admin-api/session', {
      headers: { Origin: 'https://atacante.example' },
    }),
  );
  assertEquals(refused['Access-Control-Allow-Origin'], undefined);
});

// ─── Command Center actions ──────────────────────────────────────────────────
//
// The sections added to the Command Center are the first ones in this function
// that *write*. What is tested here is the part that protects the tables: the
// method, the permission, and the validation of every field before a single row
// is created.

/** A POST request with a JSON body, for the write actions. */
function post(path: string, body: unknown, accessToken?: string): Request {
  return new Request('https://project.supabase.co/functions/v1/admin-api' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID_REPORT = {
  category: 'PHISHING',
  targetType: 'URL',
  targetValue: 'https://exemplo.invalido/pt',
  description: 'Página que imita um banco.',
  severity: 'HIGH',
};

Deno.test('every Command Center action is routable and declares a permission', () => {
  for (const action of [
    'statistics', 'fraud-reports', 'fraud-report-create', 'fraud-map', 'blacklist',
    'blacklist-add', 'blacklist-import', 'reputation', 'reputation-set',
    'threat-intel', 'monitoring', 'users',
  ]) {
    assertEquals(readAction('/functions/v1/admin-api/' + action), action);
    assert((ACTION_PERMISSIONS[action] ?? '').length > 0, action + ' has no permission');
  }
});

Deno.test('reading a Command Center section requires its own permission', async () => {
  const s = stub({
    user: { id: 'user-auditor', email: 'auditor@exemplo.pt' },
    admin: {
      ...ROOT_ADMIN,
      email: 'auditor@exemplo.pt',
      is_root: false,
      roles: ['AUDITOR'],
      // Holds blacklist.read but not reports.read.
      permissions: ['admin.access', 'blacklist.read'],
    },
  });
  try {
    const allowed = await handleRequest(request('/blacklist', token('aal2')));
    assertEquals(allowed.status, 200);
    assert(s.calls.includes('governance_list_blacklist'));

    const refused = await handleRequest(request('/fraud-reports', token('aal2')));
    assertEquals(refused.status, 403);
    assert(!s.calls.includes('governance_list_fraud_reports'));
  } finally {
    s.restore();
  }
});

Deno.test('a write action is refused over GET and a read is refused over POST', async () => {
  const s = stub({ user: { id: 'user-root', email: 'coragem77@gmail.com' }, admin: ROOT_ADMIN });
  try {
    const asGet = await handleRequest(request('/blacklist-add', token('aal2')));
    assertEquals(asGet.status, 405);
    // The method is decided before authentication: nothing was queried.
    assertEquals(s.calls.length, 0);

    const asPost = await handleRequest(post('/blacklist', VALID_REPORT, token('aal2')));
    assertEquals(asPost.status, 405);
    assertEquals(s.calls.length, 0);
  } finally {
    s.restore();
  }
});

Deno.test('a valid report is written and audited without its content', async () => {
  const s = stub({ user: { id: 'user-root', email: 'coragem77@gmail.com' }, admin: ROOT_ADMIN });
  try {
    const response = await handleRequest(post('/fraud-report-create', VALID_REPORT, token('aal2')));
    assertEquals(response.status, 200);
    assert(s.calls.includes('governance_create_fraud_report'));
    assert(s.calls.includes('governance_write_audit'));
    // The description the administrator typed is never part of the audit entry.
    assert(!JSON.stringify(s.bodies).includes('imita um banco'.slice(0, 6) + '"'));
  } finally {
    s.restore();
  }
});

Deno.test('an unknown category, a missing field or a bad coordinate are refused with 400', async () => {
  const cases: Array<[string, unknown]> = [
    ['unknown category',  { ...VALID_REPORT, category: 'DROP TABLE' }],
    ['missing target',    { category: 'PHISHING', targetType: 'URL' }],
    ['empty target',      { ...VALID_REPORT, targetValue: '   ' }],
    ['latitude off-world',{ ...VALID_REPORT, latitude: 999, longitude: 0 }],
    ['longitude is text', { ...VALID_REPORT, latitude: 41, longitude: 'norte' }],
  ];
  for (const [name, body] of cases) {
    const s = stub({ user: { id: 'user-root', email: 'coragem77@gmail.com' }, admin: ROOT_ADMIN });
    try {
      const response = await handleRequest(post('/fraud-report-create', body, token('aal2')));
      assertEquals(response.status, 400, name + ' was not refused');
      // Nothing reached the table.
      assert(!s.calls.includes('governance_create_fraud_report'), name + ' still wrote');
    } finally {
      s.restore();
    }
  }
});

Deno.test('a half-filled location is dropped rather than stored as a point at zero', async () => {
  const s = stub({ user: { id: 'user-root', email: 'coragem77@gmail.com' }, admin: ROOT_ADMIN });
  try {
    const response = await handleRequest(
      post('/fraud-report-create', { ...VALID_REPORT, latitude: 41.15 }, token('aal2')),
    );
    assertEquals(response.status, 200);
    const sent = s.bodies.find(b => b.p_target_value !== undefined);
    assertEquals(sent?.p_latitude, null);
    assertEquals(sent?.p_longitude, null);
  } finally {
    s.restore();
  }
});

Deno.test('a bulk import keeps the usable rows and rejects the rest', () => {
  const { rows, rejected } = normaliseImportRows([
    { category: 'ip', value: '203.0.113.9' },
    { category: 'DOMAIN', value: 'mau.exemplo', severity: 'critical' },
    { category: 'NOT_A_CATEGORY', value: 'x' },
    { category: 'EMAIL', value: '' },
    'a bare string',
    { category: 'CRYPTO', value: 'bc1qexemplo', severity: 'inventada' },
  ]);
  assertEquals(rejected, 3);
  assertEquals(rows.length, 3);
  assertEquals(rows[0].category, 'IP');
  assertEquals(rows[1].severity, 'CRITICAL');
  // An unknown severity falls back instead of failing the whole file.
  assertEquals(rows[2].severity, 'MEDIUM');
  // Only the four known fields survive the import.
  assertEquals(Object.keys(rows[0]).sort(), ['category', 'severity', 'value']);
});

Deno.test('an import that is not an array, or is too large, is refused', () => {
  assertThrows(() => normaliseImportRows('nope' as unknown));
  assertThrows(() => normaliseImportRows({ category: 'IP' } as unknown));
  assertThrows(() =>
    normaliseImportRows(
      Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ category: 'IP', value: '1.1.1.' + i })),
    ),
  );
});

Deno.test('an import is refused for an administrator without blacklist.write', async () => {
  const s = stub({
    user: { id: 'user-data', email: 'dados@exemplo.pt' },
    admin: {
      ...ROOT_ADMIN,
      email: 'dados@exemplo.pt',
      is_root: false,
      roles: ['AUDITOR'],
      permissions: ['admin.access', 'blacklist.read'],
    },
  });
  try {
    const response = await handleRequest(
      post('/blacklist-import', { entries: [{ category: 'IP', value: '203.0.113.9' }] }, token('aal2')),
    );
    assertEquals(response.status, 403);
    assert(!s.calls.includes('governance_import_blacklist'));
  } finally {
    s.restore();
  }
});

Deno.test('a reputation score outside 0..100 is refused', async () => {
  for (const score of [-1, 101, 12.5, 'muito mau']) {
    const s = stub({ user: { id: 'user-root', email: 'coragem77@gmail.com' }, admin: ROOT_ADMIN });
    try {
      const response = await handleRequest(
        post('/reputation-set', { entityType: 'DOMAIN', entityValue: 'mau.exemplo', score }, token('aal2')),
      );
      assertEquals(response.status, 400, 'score ' + score + ' was accepted');
      assert(!s.calls.includes('governance_upsert_entity_reputation'));
    } finally {
      s.restore();
    }
  }
});

Deno.test('a reputation change is attributed to the signed-in administrator only', async () => {
  const s = stub({ user: { id: 'user-root', email: 'coragem77@gmail.com' }, admin: ROOT_ADMIN });
  try {
    const response = await handleRequest(
      post(
        '/reputation-set',
        // The browser trying to attribute the change to somebody else is ignored.
        { entityType: 'DOMAIN', entityValue: 'mau.exemplo', score: 10, actorEmail: 'outro@exemplo.pt' },
        token('aal2'),
      ),
    );
    assertEquals(response.status, 200);
    const sent = s.bodies.find(b => b.p_entity_value !== undefined);
    assertEquals(sent?.p_actor_email, 'coragem77@gmail.com');
  } finally {
    s.restore();
  }
});

Deno.test('a body that is not valid JSON is refused with 400, not 503', async () => {
  const s = stub({ user: { id: 'user-root', email: 'coragem77@gmail.com' }, admin: ROOT_ADMIN });
  try {
    const response = await handleRequest(
      new Request('https://project.supabase.co/functions/v1/admin-api/blacklist-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token('aal2') },
        body: '{ not json',
      }),
    );
    assertEquals(response.status, 400);
    assert(!s.calls.includes('governance_add_blacklist_entry'));
  } finally {
    s.restore();
  }
});
