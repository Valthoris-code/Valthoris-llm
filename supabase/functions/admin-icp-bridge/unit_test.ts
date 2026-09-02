/**
 * Unit tests for `admin-icp-bridge`.
 *
 * They cover what can be proven without the Internet Computer: the challenge is
 * unforgeable and expires, the delegation walk really verifies signatures, a
 * tampered chain is refused, and no route answers anything but "not found" to a
 * caller that has not proven anything.
 *
 * The canister-signature branch (the first link of a real Internet Identity
 * chain) is exercised negatively — a chain that claims to come from another
 * canister, or carries a broken certificate, must be refused.
 *
 * Run with: deno test --allow-net --allow-env supabase/functions/admin-icp-bridge
 */

import { Ed25519KeyIdentity, DelegationChain } from 'npm:@dfinity/identity@2.4.1';
import { wrapDER } from 'npm:@dfinity/agent@2.4.1';
import { Principal } from 'npm:@dfinity/principal@2.4.1';
import {
  CHALLENGE_TTL_MS,
  challengeIsValid,
  corsHeaders,
  handleRequest,
  issueChallenge,
  readAction,
} from './index.ts';
import {
  challengeMessage,
  DelegationVerificationError,
  domainSeparator,
  INTERNET_IDENTITY_CANISTER_ID,
  verifyCanisterSignature,
  verifyInternetIdentity,
  verifyPlainSignature,
} from './delegation.ts';


// Minimal assertions, so the tests depend on nothing but the function itself.
function assert(value: unknown, message = 'Expected a truthy value'): void {
  if (!value) throw new Error(message);
}

function assertFalse(value: unknown, message = 'Expected a falsy value'): void {
  if (value) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  const same = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) {
    throw new Error(message ?? `Expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function assertRejects(
  fn: () => Promise<unknown>,
  // deno-lint-ignore no-explicit-any
  ErrorClass: new (...args: any[]) => Error,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof ErrorClass, `Expected ${ErrorClass.name}, got ${String(error)}`);
    return;
  }
  throw new Error(`Expected ${ErrorClass.name} to be thrown`);
}

Deno.env.set('ADMIN_ICP_BRIDGE_SECRET', 'test-secret-for-challenges');

// ─── Routing ─────────────────────────────────────────────────────────────────

Deno.test('readAction only accepts the three known routes', () => {
  assertEquals(readAction('/admin-icp-bridge/challenge'), 'challenge');
  assertEquals(readAction('/functions/v1/admin-icp-bridge/session'), 'session');
  assertEquals(readAction('/admin-icp-bridge/claim'), 'claim');
  assertEquals(readAction('/admin-icp-bridge/anything-else'), null);
  assertEquals(readAction('/admin-icp-bridge'), null);
});

Deno.test('CORS never grants an unknown origin', () => {
  const unknown = corsHeaders(
    new Request('https://x/admin-icp-bridge/session', { headers: { Origin: 'https://evil.test' } }),
  );
  assertEquals(unknown['Access-Control-Allow-Origin'], undefined);

  const known = corsHeaders(
    new Request('https://x/admin-icp-bridge/session', { headers: { Origin: 'https://valthoris.com' } }),
  );
  assertEquals(known['Access-Control-Allow-Origin'], 'https://valthoris.com');
});

// ─── Challenges ──────────────────────────────────────────────────────────────

Deno.test('a freshly issued challenge is valid, a tampered one is not', async () => {
  const { challenge, expiresAt } = await issueChallenge();
  assert(await challengeIsValid(challenge));
  assert(new Date(expiresAt).getTime() > Date.now());

  const [expiry, nonce, signature] = challenge.split('.');
  assertFalse(await challengeIsValid(`${expiry}.${nonce}xyz.${signature}`));
  assertFalse(await challengeIsValid(`${Number(expiry) + 60_000}.${nonce}.${signature}`));
  assertFalse(await challengeIsValid('not-a-challenge'));
  assertFalse(await challengeIsValid(42));
});

Deno.test('a challenge expires', async () => {
  const { challenge } = await issueChallenge(Date.now() - CHALLENGE_TTL_MS - 1_000);
  assertFalse(await challengeIsValid(challenge));
});

// ─── Delegation verification ─────────────────────────────────────────────────

const HOUR = 60 * 60 * 1000;

function hex(data: Uint8Array): string {
  return Array.from(data, b => b.toString(16).padStart(2, '0')).join('');
}

async function signedChallenge(identity: Ed25519KeyIdentity, challenge: string): Promise<string> {
  return hex(new Uint8Array(await identity.sign(challengeMessage(challenge).buffer as ArrayBuffer)));
}

Deno.test('domainSeparator follows the Internet Computer encoding', () => {
  assertEquals(Array.from(domainSeparator('abc')), [3, 97, 98, 99]);
});

Deno.test('a chain signed by a plain key verifies, and yields its own principal', async () => {
  const root = Ed25519KeyIdentity.generate();
  const session = Ed25519KeyIdentity.generate();
  const chain = await DelegationChain.create(root, session.getPublicKey(), new Date(Date.now() + HOUR));
  const { challenge } = await issueChallenge();

  const verified = await verifyInternetIdentity({
    delegation: chain.toJSON(),
    challenge,
    signature: await signedChallenge(session, challenge),
  });

  assertEquals(
    verified.principal,
    Principal.selfAuthenticating(new Uint8Array(chain.publicKey)).toText(),
  );
  assertEquals(verified.principal, root.getPrincipal().toText());
});

Deno.test('the challenge must be signed by the session key of the chain', async () => {
  const root = Ed25519KeyIdentity.generate();
  const session = Ed25519KeyIdentity.generate();
  const impostor = Ed25519KeyIdentity.generate();
  const chain = await DelegationChain.create(root, session.getPublicKey(), new Date(Date.now() + HOUR));
  const { challenge } = await issueChallenge();

  await assertRejects(
    async () =>
      await verifyInternetIdentity({
        delegation: chain.toJSON(),
        challenge,
        signature: await signedChallenge(impostor, challenge),
      }),
    DelegationVerificationError,
  );
});

Deno.test('a signature over a different challenge is refused', async () => {
  const root = Ed25519KeyIdentity.generate();
  const session = Ed25519KeyIdentity.generate();
  const chain = await DelegationChain.create(root, session.getPublicKey(), new Date(Date.now() + HOUR));
  const first = await issueChallenge();
  const second = await issueChallenge();

  await assertRejects(
    async () =>
      await verifyInternetIdentity({
        delegation: chain.toJSON(),
        challenge: second.challenge,
        signature: await signedChallenge(session, first.challenge),
      }),
    DelegationVerificationError,
  );
});

Deno.test('a chain whose delegation signature was tampered with is refused', async () => {
  const root = Ed25519KeyIdentity.generate();
  const session = Ed25519KeyIdentity.generate();
  const chain = await DelegationChain.create(root, session.getPublicKey(), new Date(Date.now() + HOUR));
  const { challenge } = await issueChallenge();

  const json = chain.toJSON();
  const signature = json.delegations[0].signature;
  json.delegations[0].signature = (signature.startsWith('0') ? '1' : '0') + signature.slice(1);

  await assertRejects(
    async () =>
      await verifyInternetIdentity({
        delegation: json,
        challenge,
        signature: await signedChallenge(session, challenge),
      }),
    DelegationVerificationError,
  );
});

Deno.test('a chain that swaps in another public key is refused', async () => {
  const root = Ed25519KeyIdentity.generate();
  const other = Ed25519KeyIdentity.generate();
  const session = Ed25519KeyIdentity.generate();
  const chain = await DelegationChain.create(root, session.getPublicKey(), new Date(Date.now() + HOUR));
  const { challenge } = await issueChallenge();

  // Claiming somebody else's identity while keeping a valid-looking signature.
  const json = chain.toJSON();
  json.publicKey = hex(new Uint8Array(other.getPublicKey().toDer()));

  await assertRejects(
    async () =>
      await verifyInternetIdentity({
        delegation: json,
        challenge,
        signature: await signedChallenge(session, challenge),
      }),
    DelegationVerificationError,
  );
});

Deno.test('an expired chain is refused', async () => {
  const root = Ed25519KeyIdentity.generate();
  const session = Ed25519KeyIdentity.generate();
  const chain = await DelegationChain.create(root, session.getPublicKey(), new Date(Date.now() - 1_000));
  const { challenge } = await issueChallenge();

  await assertRejects(
    async () =>
      await verifyInternetIdentity({
        delegation: chain.toJSON(),
        challenge,
        signature: await signedChallenge(session, challenge),
      }),
    DelegationVerificationError,
  );
});

Deno.test('garbage is refused instead of throwing something else', async () => {
  const { challenge } = await issueChallenge();
  await assertRejects(
    () => verifyInternetIdentity({ delegation: { nope: true }, challenge, signature: 'aa' }),
    DelegationVerificationError,
  );
});

Deno.test('verifyPlainSignature rejects unknown key formats and bad lengths', () => {
  const key = new Uint8Array([1, 2, 3, 4]);
  assertFalse(verifyPlainSignature(key, new Uint8Array(64), new Uint8Array([1])));
  assertFalse(verifyPlainSignature(key, new Uint8Array(10), new Uint8Array([1])));
});

Deno.test('a canister signature from another canister is refused', async () => {
  // A canister-signature key is `DER(OID 1.3.6.1.4.1.56387.1.2, len || id || seed)`.
  // This one names a canister that is not Internet Identity, which is the shape
  // an attacker with their own canister would present.
  const CANISTER_SIGNATURE_OID = new Uint8Array([
    0x30, 0x0c, 0x06, 0x0a, 0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xb8, 0x43, 0x01, 0x02,
  ]);
  const impostor = Principal.fromText('aaaaa-aa').toUint8Array();
  const seed = new Uint8Array(32).fill(7);
  const raw = new Uint8Array([impostor.length, ...impostor, ...seed]);
  const der = wrapDER(raw.buffer as ArrayBuffer, CANISTER_SIGNATURE_OID);

  assertFalse(
    await verifyCanisterSignature(
      new Uint8Array(der),
      new Uint8Array(64),
      new Uint8Array([1, 2, 3]),
      INTERNET_IDENTITY_CANISTER_ID,
      '00',
    ),
  );
});

// ─── The HTTP surface ────────────────────────────────────────────────────────

Deno.test('unknown routes and non-POST methods are not found', async () => {
  const get = await handleRequest(new Request('https://x/admin-icp-bridge/challenge'));
  assertEquals(get.status, 404);

  const unknown = await handleRequest(
    new Request('https://x/admin-icp-bridge/whatever', { method: 'POST' }),
  );
  assertEquals(unknown.status, 404);
});

Deno.test('the challenge route answers without any credential', async () => {
  const response = await handleRequest(
    new Request('https://x/admin-icp-bridge/challenge', { method: 'POST' }),
  );
  assertEquals(response.status, 200);
  const body = await response.json();
  assert(await challengeIsValid(body.challenge));
});

Deno.test('a session request with no proof is answered "not found"', async () => {
  const response = await handleRequest(
    new Request('https://x/admin-icp-bridge/session', {
      method: 'POST',
      body: JSON.stringify({ principal: 'aaaaa-aa' }),
    }),
  );
  assertEquals(response.status, 404);
  assertEquals((await response.json()).error, 'Not found');
});

Deno.test('a claim request with no Supabase session is answered "not found"', async () => {
  const response = await handleRequest(
    new Request('https://x/admin-icp-bridge/claim', { method: 'POST', body: '{}' }),
  );
  assertEquals(response.status, 404);
});
