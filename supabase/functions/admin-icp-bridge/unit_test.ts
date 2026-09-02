/**
 * Unit tests for `admin-icp-bridge`.
 *
 * They cover what can be proven without the Internet Computer: the challenge is
 * unforgeable and expires, the delegation walk really verifies signatures, a
 * tampered chain is refused, and no route answers anything but "not found" to a
 * caller that has not proven anything.
 *
 * The canister-signature branch (the first link of a real Internet Identity
 * chain) is exercised both ways: positively against a real delegation issued by
 * Internet Identity on the mainnet, and negatively — a chain that claims to come
 * from another canister, or carries a broken certificate, must be refused.
 *
 * Every refusal must also *say why*: the bug this suite guards against is not a
 * signature wrongly accepted, it is a dozen unrelated causes reported as the
 * single sentence "A delegation signature is not valid.", which left a real
 * failed sign-in impossible to diagnose from `governance.audit_logs`.
 *
 * Run with: deno test --allow-net --allow-env supabase/functions/admin-icp-bridge
 */

import { DelegationChain, ECDSAKeyIdentity, Ed25519KeyIdentity } from 'npm:@dfinity/identity@2.4.1';
import { IC_ROOT_KEY, wrapDER } from 'npm:@dfinity/agent@2.4.1';
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
  checkCanisterSignature,
  checkPlainSignature,
  delegationMessage,
  DelegationVerificationError,
  describeKey,
  domainSeparator,
  fromHex,
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

async function signedChallenge(
  identity: { sign(blob: ArrayBuffer): Promise<ArrayBuffer | Uint8Array> },
  challenge: string,
): Promise<string> {
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


// ─── A real Internet Identity delegation ─────────────────────────────────────

/**
 * A genuine delegation issued by Internet Identity on the Internet Computer
 * mainnet, taken from the DFINITY signature-verification test vectors
 * (`dfinity/internet-identity`, `src/sig-verifier-js/src/lib.rs`). It is signed
 * by the Internet Identity instance `fgte5-ciaaa-aaaad-aaatq-cai` and expired on
 * 2024-02-20, so it can never authenticate anybody — it exists only to prove
 * that the canister-signature branch accepts what production actually sends.
 */
const REAL_II = {
  canisterId: 'fgte5-ciaaa-aaaad-aaatq-cai',
  principal: 'hf7wk-a35mp-bc6eb-ntvr2-aeu3d-naglw-n6ea3-qn5ps-jcanu-p2vro-5ae',
  publicKey: '303c300c060a2b0601040183b8430102032c000a00000000006000270101f3ffab2278616508ad5ebfa0cb79a21e08dbb7132f6875b95f81e72067f31302',
  signature: 'd9d9f7a26b6365727469666963617465590547d9d9f7a3647472656583018301830183024863616e697374657283018301830183018301830182045820640c48458731be868c750243066312f4e06b2bfde48309a3cfd0617ee3c8f3448301820458204042fb2844db206e1724a248eef393f5cb1d22280f298d948fc18e0a408533438301820458208d3dbc5b1ac807eb4f313b91712db94fdf4a50068207719f1cba37771b2ac8ef83024a000000000060002701018301830183024e6365727469666965645f6461746182035820a61cee2397ab0f006060d4a7bf4a9bef463d5b2381c502a6c66a26b6d088b64d820458206ccd6bb31a54761d4a56e9cfd8cba384d5b8fb47184e8ca13cb70e04f2209ace82045820c64354fe1474e905acdcf09f6569cfb29c305d0b06806908f2da5ee9404726bf820458203de781de0811f5a8469166c594f9433d966f686f4f4065ad9395e30bfac153e282045820cb2a94057004ae336fb52ba39117cf90aaadefe02ddfe9205bcc13c8f6150a0282045820bc1f9b4c54f66eb8fc25381e90641ae59ef87c590186355162a52cb4875242cb8204582001f9f57686d9eb1af846b6ee42c48b02289fe9cf134f84d527a000e65e4d7443820458201c1f10e2904ed9819f3cf7e051c473151700ea5b8038bf1413ba894b3afac4608204582045c96fb30bf784be7d9da2f7e41a2fa93f728bf07829da23acad05006286c269820458204ffce0d4d1e2124180daef5447fe496bbec7ef22b53786138b4acf523453fa75830182045820d5523abdfb2963caffc236cfe5a7f30a832b152c2f827d6acdf79ed5bb9a690e83024474696d65820349a1fa9b83afaae6da17697369676e6174757265583092eaf174a665a296e8968d910ab5a6130fb7deca606a68f5903d8e6a4b64a0fc609b7b7f6a68146e6c51b35e367deb8b6a64656c65676174696f6ea2697375626e65745f6964581d2c55b347ecf2686c83781d6c59d1b43e7b4cba8deb6c1b376107f2cd026b636572746966696361746559026ed9d9f7a2647472656583018204582075d2df1ca388b2596be5564ca726dbcadf77bbc535811734b704a8846153be1383018302467375626e657483018301830183018204582035bc207266aa1f9a1b4eea393efe91ae33ed4ce77069ed8e881d86716adf7b6b830182045820f8c3eae0377ee00859223bf1c6202f5885c4dcdc8fd13b1d48c3c838688919bc83018302581d2c55b347ecf2686c83781d6c59d1b43e7b4cba8deb6c1b376107f2cd02830183024f63616e69737465725f72616e67657382035832d9d9f782824a000000000060000001014a00000000006000ae0101824a00000000006000b001014a00000000006fffff010183024a7075626c69635f6b657982035885308182301d060d2b0601040182dc7c0503010201060c2b0601040182dc7c0503020103610090075120778eb21a530a02bcc763e7f4a192933506966af7b54c10a4d2b24de6a86b200e3440bae6267bf4c488d9a11d0472c38c1b6221198f98e4e6882ba38a5a4e3aa5afce899b7f825ed95adfa12629688073556f2747527213e8d73e40ce8204582036f3cd257d90fb38e42597f193a5e031dbd585b6292793bb04db4794803ce06e82045820028fc5e5f70868254e7215e7fc630dbd29eefc3619af17ce231909e1faf97e9582045820ef8995c410ed405731c9b913f67879e3b6a6b4d659d2746db9a6b47d7e70d3d582045820f9a6810df003d2188a807e8370076bd94a996877ec8bd11aa2c4e1358c01c6ab83024474696d65820349e2c9c9e480f6edd917697369676e61747572655830833724e450e6e1c8848118e82b04c5db3964f0869b6fb52af9bdbf3876435a19c798c03b41d5eb5fd39535c4ab24e70464747265658301820458209a7cc9ffcec2242e2e15b45a4e1fb9983c87c5b7e8badb7b92a891b40382f73683024373696783025820c9f3b4b781360e36240c549029e4b0857a6cc31e7230a680e551cab71aae0df38301820458203e26edaf16f66c93c238503a3d2077176e9ce6f0438940679b22cb31a636bfee83025820f49c0d7056981c0f2fdfaf02d219db038e2c448193bbf19642fbf118a8f4739a820340',
  pubkey: 'e7875e69ce7beda6fc7b6dfbd9b75be1c6f6d5debae3ae1ed7c7f873de1b6f9f75e9e7dcddcf37efaddcdf6f7b69a7b57377b5ddaef87dee386ddd75e39e9cd39d7d77debc79df1b7b469df36eb8e7cef47b4d5cefa7f5df67dbefc73debdf5c',
  expiration: '17b5b384762bfd21',
};

const REAL_II_MESSAGE = () =>
  delegationMessage({
    pubkey: fromHex(REAL_II.pubkey).buffer as ArrayBuffer,
    expiration: BigInt('0x' + REAL_II.expiration),
  });

Deno.test('a real Internet Identity canister signature verifies', async () => {
  const check = await checkCanisterSignature(
    fromHex(REAL_II.publicKey),
    fromHex(REAL_II.signature),
    REAL_II_MESSAGE(),
    REAL_II.canisterId,
    IC_ROOT_KEY,
  );
  assert(check.ok, `Expected the real chain to verify, got: ${(check as { reason?: string }).reason}`);

  // …and the key it carries is the one the principal is derived from.
  assertEquals(
    Principal.selfAuthenticating(fromHex(REAL_II.publicKey)).toText(),
    REAL_II.principal,
  );
});

Deno.test('the real signature is refused, with a reason, once a byte moves', async () => {
  const message = REAL_II_MESSAGE();
  message[message.length - 1] ^= 1;

  const check = await checkCanisterSignature(
    fromHex(REAL_II.publicKey),
    fromHex(REAL_II.signature),
    message,
    REAL_II.canisterId,
    IC_ROOT_KEY,
  );
  assertFalse(check.ok);
  assert(
    !check.ok && check.reason.includes('holds no signature for this message'),
    `Unexpected reason: ${!check.ok ? check.reason : ''}`,
  );
});

Deno.test('a real chain issued by another Internet Identity names both canisters', async () => {
  const check = await checkCanisterSignature(
    fromHex(REAL_II.publicKey),
    fromHex(REAL_II.signature),
    REAL_II_MESSAGE(),
    INTERNET_IDENTITY_CANISTER_ID,
    IC_ROOT_KEY,
  );
  assertFalse(check.ok);
  assert(!check.ok && check.reason.includes(REAL_II.canisterId));
  assert(!check.ok && check.reason.includes(INTERNET_IDENTITY_CANISTER_ID));
});

Deno.test('a canister signature that carries no certificate says so', async () => {
  const check = await checkCanisterSignature(
    fromHex(REAL_II.publicKey),
    new Uint8Array([1, 2, 3, 4]),
    REAL_II_MESSAGE(),
    REAL_II.canisterId,
    IC_ROOT_KEY,
  );
  assertFalse(check.ok);
  assert(
    !check.ok && check.reason.includes('no certificate and tree'),
    !check.ok ? check.reason : '',
  );
});

Deno.test('a canister signature that is not CBOR at all says so', async () => {
  const check = await checkCanisterSignature(
    fromHex(REAL_II.publicKey),
    new Uint8Array([0xff, 0xff, 0xff]),
    REAL_II_MESSAGE(),
    REAL_II.canisterId,
    IC_ROOT_KEY,
  );
  assertFalse(check.ok);
  assert(!check.ok && check.reason.includes('CBOR'), !check.ok ? check.reason : '');
});

Deno.test('a certificate the root key rejects is named as such', async () => {
  const check = await checkCanisterSignature(
    fromHex(REAL_II.publicKey),
    fromHex(REAL_II.signature),
    REAL_II_MESSAGE(),
    REAL_II.canisterId,
    // A syntactically valid but wrong root key: the BLS check must fail.
    IC_ROOT_KEY.slice(0, -2) + (IC_ROOT_KEY.endsWith('00') ? '11' : '00'),
  );
  assertFalse(check.ok);
  assert(
    !check.ok && check.reason.includes('state certificate was rejected'),
    !check.ok ? check.reason : '',
  );
});

Deno.test('an unusable root key configuration is reported, not swallowed', async () => {
  const check = await checkCanisterSignature(
    fromHex(REAL_II.publicKey),
    fromHex(REAL_II.signature),
    REAL_II_MESSAGE(),
    REAL_II.canisterId,
    'not-hex',
  );
  assertFalse(check.ok);
  assert(!check.ok && check.reason.includes('root key is unusable'), !check.ok ? check.reason : '');
});

// ─── Reasons ─────────────────────────────────────────────────────────────────

Deno.test('describeKey names every key the bridge can meet', () => {
  assertEquals(describeKey(fromHex(REAL_II.publicKey)), 'a canister-signature key');
  assertEquals(
    describeKey(new Uint8Array(Ed25519KeyIdentity.generate().getPublicKey().toDer())),
    'an Ed25519 key',
  );
  assert(describeKey(new Uint8Array([1, 2, 3])).startsWith('bytes that are not a DER public key'));
});

Deno.test('a browser ECDSA P-256 session key signs the challenge and the chain', async () => {
  // What a real browser holds: agent-js stores an ECDSA P-256 key, not Ed25519.
  const root = Ed25519KeyIdentity.generate();
  const session = await ECDSAKeyIdentity.generate();
  const chain = await DelegationChain.create(
    root,
    session.getPublicKey(),
    new Date(Date.now() + HOUR),
  );
  const { challenge } = await issueChallenge();

  const verified = await verifyInternetIdentity({
    delegation: chain.toJSON(),
    challenge,
    signature: await signedChallenge(session, challenge),
  });
  assertEquals(verified.principal, root.getPrincipal().toText());
});

Deno.test('a failed link says which link failed and what kind of key signed it', async () => {
  const root = Ed25519KeyIdentity.generate();
  const session = Ed25519KeyIdentity.generate();
  const chain = await DelegationChain.create(
    root,
    session.getPublicKey(),
    new Date(Date.now() + HOUR),
  );
  const { challenge } = await issueChallenge();

  const json = chain.toJSON();
  const signature = json.delegations[0].signature;
  json.delegations[0].signature = (signature.startsWith('0') ? '1' : '0') + signature.slice(1);

  try {
    await verifyInternetIdentity({
      delegation: json,
      challenge,
      signature: await signedChallenge(session, challenge),
    });
  } catch (error) {
    const message = String((error as Error).message);
    // The original sentence survives, so anything watching for it still matches.
    assert(message.startsWith('A delegation signature is not valid.'), message);
    assert(message.includes('Link 1 of 1'), message);
    assert(message.includes('an Ed25519 key'), message);
    return;
  }
  throw new Error('Expected the tampered chain to be refused');
});

Deno.test('a failed challenge signature explains itself too', async () => {
  const root = Ed25519KeyIdentity.generate();
  const session = Ed25519KeyIdentity.generate();
  const impostor = Ed25519KeyIdentity.generate();
  const chain = await DelegationChain.create(
    root,
    session.getPublicKey(),
    new Date(Date.now() + HOUR),
  );
  const { challenge } = await issueChallenge();

  try {
    await verifyInternetIdentity({
      delegation: chain.toJSON(),
      challenge,
      signature: await signedChallenge(impostor, challenge),
    });
  } catch (error) {
    const message = String((error as Error).message);
    assert(message.startsWith('The challenge signature is not valid.'), message);
    assert(message.includes('an Ed25519 key'), message);
    assert(message.includes('Ed25519 rejected the signature'), message);
    return;
  }
  throw new Error('Expected the impostor signature to be refused');
});

Deno.test('checkPlainSignature distinguishes a bad length from a bad key', () => {
  const key = new Uint8Array(Ed25519KeyIdentity.generate().getPublicKey().toDer());
  const short = checkPlainSignature(key, new Uint8Array(10), new Uint8Array([1]));
  assertFalse(short.ok);
  assert(!short.ok && short.reason.includes('10 bytes'), !short.ok ? short.reason : '');

  const unknown = checkPlainSignature(new Uint8Array([1, 2, 3]), new Uint8Array(64), new Uint8Array([1]));
  assertFalse(unknown.ok);
  assert(!unknown.ok && unknown.reason.includes('not a DER public key'), !unknown.ok ? unknown.reason : '');
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
