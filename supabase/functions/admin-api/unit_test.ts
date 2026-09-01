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

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ACTION_PERMISSIONS,
  GENERIC_ERROR,
  handleRequest,
  hasPermission,
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

/** Installs a fetch stub and returns the RPCs that were called. */
function stub(options: StubOptions): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
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

  return { calls, restore: () => { globalThis.fetch = realFetch; } };
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
