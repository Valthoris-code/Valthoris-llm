/**
 * Internet Identity delegation verification.
 *
 * WHY THIS EXISTS
 * ───────────────
 * A principal ("rvwuy-…-nae") is a *public* identifier. It is printed on the
 * screen of the application, it travels in every canister call, and anybody who
 * has ever seen one can type it into a request. Accepting the principal a
 * browser claims to own would be the same as accepting a username with no
 * password.
 *
 * What actually proves ownership is the Internet Identity **delegation chain**:
 *
 *   Internet Identity canister ──signs──▶ delegation to the browser session key
 *                                              │
 *                                    the browser holds the private half
 *
 * This module verifies that chain end to end, on the server:
 *
 *   1. every delegation is signed by the key of the previous link;
 *   2. the first link is signed by the Internet Identity canister itself — a
 *      *canister signature*, verified against an Internet Computer state
 *      certificate whose BLS signature is checked against the IC root key, and
 *      whose signing canister must be the Internet Identity canister;
 *   3. no delegation has expired;
 *   4. the caller signs a short-lived, server-issued challenge with the session
 *      key at the end of the chain, which proves this browser holds the private
 *      key *now* — a copied chain alone is not enough;
 *   5. the principal is *derived* from the verified chain, never read from the
 *      request body.
 *
 * Only after all five does the caller have a principal this system will look up.
 *
 * WHY EVERY STEP EXPLAINS ITSELF
 * ──────────────────────────────
 * Verification has about a dozen ways to fail — an algorithm nobody supports, a
 * DER header that does not parse, a canister-signature blob whose CBOR cannot be
 * read, a certificate the Internet Computer root key rejects, a signature that
 * is simply absent from the certified tree, a chain issued by some *other*
 * canister — and they are not interchangeable: one is a forgery, another is a
 * misconfiguration, another is a bug in this function.
 *
 * Collapsing all of them into a single boolean produced exactly one symptom for
 * every cause ("A delegation signature is not valid.") and, because the failure
 * paths also swallowed exceptions, an internal error was reported as if the
 * administrator's signature had been wrong. Every check therefore returns the
 * reason it refused. The reason is recorded server-side, in
 * `governance.audit_logs.reason`; the browser still gets the same opaque 404.
 */

import {
  Certificate,
  Cbor,
  decodeLen,
  decodeLenBytes,
  ED25519_OID,
  hash,
  hashOfMap,
  IC_ROOT_KEY,
  lookup_path,
  lookupResultToBuffer,
  LookupStatus,
  reconstruct,
  unwrapDER,
} from 'npm:@dfinity/agent@2.4.1';
import { DelegationChain, isDelegationValid } from 'npm:@dfinity/identity@2.4.1';
import { Principal } from 'npm:@dfinity/principal@2.4.1';
import { ed25519 } from 'npm:@noble/curves@1.9.7/ed25519';
import { p256 } from 'npm:@noble/curves@1.9.7/p256';
import { sha256 } from 'npm:@noble/hashes@1.8.0/sha2';

/** The Internet Identity canister on the IC main network. */
export const INTERNET_IDENTITY_CANISTER_ID = 'rdmx6-jaaaa-aaaaa-aaadq-cai';

/**
 * Domain separator of the message the browser signs with its session key.
 * It is deliberately not a valid Internet Computer request, so a signature
 * produced here can never be replayed as a canister call, nor the other way
 * around.
 */
export const CHALLENGE_DOMAIN = 'valthoris-admin-icp-bridge';

/** DER `SEQUENCE(OID 1.3.6.1.4.1.56387.1.2)` — a canister-signature key. */
const CANISTER_SIGNATURE_OID = new Uint8Array([
  0x30, 0x0c, 0x06, 0x0a, 0x2b, 0x06, 0x01, 0x04, 0x01, 0x83, 0xb8, 0x43, 0x01, 0x02,
]);

/** DER prefix of an uncompressed P-256 SubjectPublicKeyInfo. */
const P256_SPKI_PREFIX = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

/** Thrown for every verification failure. Its message never reaches a browser. */
export class DelegationVerificationError extends Error {}

/**
 * The outcome of a single signature check: valid, or invalid *for a stated
 * reason*. The reason names the step that refused and the evidence it saw, so
 * that a refusal in production can be told apart from a bug in this function.
 */
export type SignatureCheck = { ok: true } | { ok: false; reason: string };

const VALID: SignatureCheck = { ok: true };

function invalid(reason: string): SignatureCheck {
  return { ok: false, reason };
}

export interface VerifyOptions {
  /** The chain exactly as `DelegationChain.toJSON()` produced it. */
  delegation: unknown;
  /** The challenge string this server issued. */
  challenge: string;
  /** The challenge signature, hex encoded, produced by the session key. */
  signature: string;
  /** Canister allowed to have issued the chain. Defaults to Internet Identity. */
  canisterId?: string;
  /** IC root key, hex encoded. Defaults to the main network root key. */
  rootKeyHex?: string;
}

export interface VerifiedDelegation {
  /** Principal derived from the verified chain — the only trustworthy one. */
  principal: string;
  /** Expiry of the shortest-lived delegation in the chain. */
  expiresAt: Date;
}

function bytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

/** A standalone ArrayBuffer holding exactly `value`. */
function buffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  const view = bytes(value);
  return view.slice().buffer;
}

export function fromHex(value: string): Uint8Array {
  if (!/^[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) {
    throw new DelegationVerificationError('Value is not hex encoded.');
  }
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function startsWith(value: Uint8Array, prefix: Uint8Array): boolean {
  return value.length >= prefix.length && equalBytes(value.subarray(0, prefix.length), prefix);
}

/**
 * Returns the algorithm identifier of a DER key — the inner
 * `SEQUENCE(OID …)` of `SEQUENCE(algorithm, BITSTRING(payload))` — or null when
 * the bytes are not a DER key at all.
 *
 * The algorithm never sits at offset 0: the outer SEQUENCE header comes first,
 * and its length is itself variable. Comparing a prefix against the raw key
 * would therefore silently classify *every* key as "unknown", which is exactly
 * the kind of failure that looks like "the signature is wrong".
 */
function derAlgorithm(der: Uint8Array): Uint8Array | null {
  try {
    if (der.length < 4 || der[0] !== 0x30) return null;
    const inner = der.subarray(1 + decodeLenBytes(der, 1));
    if (inner.length < 2 || inner[0] !== 0x30) return null;
    const length = 1 + decodeLenBytes(inner, 1) + decodeLen(inner, 1);
    return length <= inner.length ? inner.subarray(0, length) : null;
  } catch {
    return null;
  }
}

/** True when a DER key declares the given `SEQUENCE(OID …)` algorithm. */
function hasAlgorithm(der: Uint8Array, oid: Uint8Array): boolean {
  const algorithm = derAlgorithm(der);
  return algorithm !== null && equalBytes(algorithm, oid);
}

export function toHex(value: Uint8Array): string {
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** The message of a thrown value, never its stack, and never empty. */
function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > 0 ? text : 'no reason given';
}

/**
 * Names a public key the way a human debugging a refusal needs it: the key
 * type when it is one this function supports, and otherwise the raw algorithm
 * identifier and length, which is what tells "an algorithm we do not accept"
 * apart from "these bytes are not a key at all".
 */
export function describeKey(der: Uint8Array): string {
  if (hasAlgorithm(der, CANISTER_SIGNATURE_OID)) return 'a canister-signature key';
  if (hasAlgorithm(der, bytes(ED25519_OID))) return 'an Ed25519 key';
  if (startsWith(der, P256_SPKI_PREFIX)) return 'an ECDSA P-256 key';
  const algorithm = derAlgorithm(der);
  return algorithm
    ? `an unsupported key (${der.length} bytes, algorithm ${toHex(algorithm)})`
    : `bytes that are not a DER public key (${der.length} bytes, starting ${toHex(der.subarray(0, 8))})`;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** `len(name) || name`, the Internet Computer domain-separation encoding. */
export function domainSeparator(name: string): Uint8Array {
  const encoded = new TextEncoder().encode(name);
  return concat(new Uint8Array([encoded.length]), encoded);
}

/** The exact bytes a browser must sign to answer a challenge. */
export function challengeMessage(challenge: string): Uint8Array {
  return concat(domainSeparator(CHALLENGE_DOMAIN), new TextEncoder().encode(challenge));
}

/**
 * Verifies a signature made by a plain (non-canister) Internet Computer key,
 * and says why when it refuses.
 *
 * Internet Identity hands the browser either an Ed25519 or an ECDSA P-256
 * session key depending on the platform, so both are supported; anything else
 * is refused rather than assumed — and named, because "the browser used a key
 * type this function never learned to read" and "the signature is a forgery"
 * are not the same incident.
 */
export function checkPlainSignature(
  derPublicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): SignatureCheck {
  if (signature.length !== 64) {
    return invalid(
      `the signature is ${signature.length} bytes, and both supported key types sign 64`,
    );
  }

  // Ed25519: DER `SEQUENCE(SEQUENCE(OID 1.3.101.112), BITSTRING(raw))`.
  if (hasAlgorithm(derPublicKey, bytes(ED25519_OID))) {
    let raw: Uint8Array;
    try {
      raw = bytes(unwrapDER(buffer(derPublicKey), ED25519_OID));
    } catch (error) {
      return invalid(`the Ed25519 key could not be unwrapped: ${errorText(error)}`);
    }
    try {
      return ed25519.verify(signature, message, raw)
        ? VALID
        : invalid('Ed25519 rejected the signature');
    } catch (error) {
      return invalid(`Ed25519 verification failed: ${errorText(error)}`);
    }
  }

  // ECDSA P-256: SubjectPublicKeyInfo with an uncompressed point. WebCrypto —
  // what the browser signs with — emits `r || s` over the SHA-256 digest.
  if (startsWith(derPublicKey, P256_SPKI_PREFIX)) {
    const raw = derPublicKey.subarray(P256_SPKI_PREFIX.length);
    if (raw.length !== 65 || raw[0] !== 0x04) {
      return invalid(
        `the ECDSA P-256 key carries ${raw.length} bytes after its header instead of a 65-byte uncompressed point`,
      );
    }
    try {
      return p256.verify(signature, sha256(message), raw, { prehash: false })
        ? VALID
        : invalid('ECDSA P-256 rejected the signature');
    } catch (error) {
      return invalid(`ECDSA P-256 verification failed: ${errorText(error)}`);
    }
  }

  return invalid(`the signer presented ${describeKey(derPublicKey)}`);
}

/** `checkPlainSignature` reduced to a boolean, for callers that only decide. */
export function verifyPlainSignature(
  derPublicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): boolean {
  return checkPlainSignature(derPublicKey, signature, message).ok;
}

/**
 * Verifies a *canister signature*: the proof that the Internet Identity
 * canister itself signed the first delegation of the chain.
 *
 * The signature carries an Internet Computer state certificate. The certificate
 * is verified against the IC root key — BLS signature, subnet delegation and
 * canister ranges included, by `Certificate.create` — and the signed message
 * must appear in that canister's certified `sig` tree.
 *
 * Certificate *time* is not checked: the certificate is minted once, when the
 * user signs in, while the delegation it certifies is deliberately valid for
 * days afterwards, so "recent" is meaningless for it. Freshness is enforced
 * where it belongs — the delegation's own expiry and the one-shot challenge.
 *
 * Every way this can go wrong is reported as its own reason: a chain minted by
 * another canister, a signature blob that is not decodable CBOR, a certificate
 * the root key rejects and a message simply absent from the certified tree are
 * four different incidents that used to look identical.
 */
export async function checkCanisterSignature(
  derPublicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
  expectedCanisterId: string,
  rootKeyHex: string,
): Promise<SignatureCheck> {
  if (!hasAlgorithm(derPublicKey, CANISTER_SIGNATURE_OID)) {
    return invalid(`the signer presented ${describeKey(derPublicKey)}, not a canister-signature key`);
  }

  let canisterId: Principal;
  let seed: Uint8Array;
  try {
    const raw = bytes(unwrapDER(buffer(derPublicKey), CANISTER_SIGNATURE_OID));
    const idLength = raw[0];
    if (!idLength || raw.length < idLength + 1) {
      return invalid(
        `the canister-signature key announces a ${idLength}-byte canister id but carries ${raw.length} bytes`,
      );
    }
    canisterId = Principal.fromUint8Array(raw.subarray(1, idLength + 1));
    seed = raw.subarray(idLength + 1);
  } catch (error) {
    return invalid(`the canister-signature key could not be read: ${errorText(error)}`);
  }

  // Only the Internet Identity canister may vouch for a Valthoris
  // administrator: any other canister could mint principals at will.
  if (canisterId.toText() !== expectedCanisterId) {
    return invalid(
      `the chain was issued by canister ${canisterId.toText()}, not by ${expectedCanisterId}`,
    );
  }

  let rootKey: ArrayBuffer;
  try {
    rootKey = buffer(fromHex(rootKeyHex));
  } catch (error) {
    // A misconfigured IC_ROOT_KEY_HEX is an operator mistake, not a forgery.
    return invalid(`the configured Internet Computer root key is unusable: ${errorText(error)}`);
  }

  let certificateBytes: Uint8Array;
  let tree: unknown;
  try {
    const decoded = Cbor.decode<{ certificate: ArrayBuffer | Uint8Array; tree: unknown }>(
      buffer(signature),
    );
    if (!decoded?.certificate || !decoded?.tree) {
      return invalid('the canister signature carries no certificate and tree');
    }
    certificateBytes = bytes(decoded.certificate);
    tree = decoded.tree;
  } catch (error) {
    return invalid(
      `the canister signature (${signature.length} bytes) is not decodable CBOR: ${errorText(error)}`,
    );
  }

  let cert: Certificate;
  try {
    cert = await Certificate.create({
      certificate: buffer(certificateBytes),
      rootKey,
      canisterId,
      disableTimeVerification: true,
    });
  } catch (error) {
    return invalid(
      `the state certificate was rejected against the Internet Computer root key: ${errorText(error)}`,
    );
  }

  try {
    // The tree carried by the signature must be the one the canister certified.
    const certified = lookupResultToBuffer(
      cert.lookup(['canister', buffer(canisterId.toUint8Array()), 'certified_data']),
    );
    if (!certified) {
      return invalid(`the certificate holds no certified data for canister ${canisterId.toText()}`);
    }
    // deno-lint-ignore no-explicit-any
    if (!equalBytes(bytes(certified), bytes(await reconstruct(tree as any)))) {
      return invalid('the tree carried by the signature is not the one the canister certified');
    }

    // …and it must contain this exact message under this exact seed.
    const found = lookup_path(
      ['sig', buffer(hash(buffer(seed))), buffer(hash(buffer(message)))],
      // deno-lint-ignore no-explicit-any
      tree as any,
    );
    return found.status === LookupStatus.Found
      ? VALID
      : invalid(
        `the certified tree holds no signature for this message under seed ${toHex(seed)} (lookup: ${found.status})`,
      );
  } catch (error) {
    return invalid(`the certified tree could not be examined: ${errorText(error)}`);
  }
}

/** `checkCanisterSignature` reduced to a boolean, for callers that only decide. */
export async function verifyCanisterSignature(
  derPublicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
  expectedCanisterId: string,
  rootKeyHex: string,
): Promise<boolean> {
  const check = await checkCanisterSignature(
    derPublicKey,
    signature,
    message,
    expectedCanisterId,
    rootKeyHex,
  );
  return check.ok;
}

/** The message a delegation is signed over, per the Internet Computer spec. */
export function delegationMessage(delegation: {
  pubkey: ArrayBuffer;
  expiration: bigint;
  targets?: { toUint8Array(): Uint8Array }[];
}): Uint8Array {
  const map: Record<string, unknown> = {
    pubkey: delegation.pubkey,
    expiration: delegation.expiration,
  };
  if (delegation.targets && delegation.targets.length > 0) {
    map.targets = delegation.targets.map(target => buffer(target.toUint8Array()));
  }
  return concat(domainSeparator('ic-request-auth-delegation'), bytes(hashOfMap(map)));
}

/**
 * Verifies a complete Internet Identity session and returns the principal it
 * genuinely belongs to. Throws `DelegationVerificationError` on any failure;
 * the caller answers every failure identically.
 */
export async function verifyInternetIdentity(options: VerifyOptions): Promise<VerifiedDelegation> {
  const canisterId = options.canisterId ?? INTERNET_IDENTITY_CANISTER_ID;
  const rootKeyHex = options.rootKeyHex ?? IC_ROOT_KEY;

  let chain: DelegationChain;
  try {
    // deno-lint-ignore no-explicit-any
    chain = DelegationChain.fromJSON(options.delegation as any);
  } catch (error) {
    throw new DelegationVerificationError(
      `The delegation chain could not be parsed: ${errorText(error)}.`,
    );
  }

  if (chain.delegations.length === 0 || chain.delegations.length > 8) {
    throw new DelegationVerificationError(
      `Unexpected delegation chain length: ${chain.delegations.length}.`,
    );
  }
  if (!isDelegationValid(chain)) {
    throw new DelegationVerificationError('The delegation chain has expired.');
  }

  // Walk the chain: link i must be signed by the key of link i-1, and the first
  // link by the root key of the chain — for Internet Identity, a
  // canister-signature key belonging to the Internet Identity canister.
  let currentKey = bytes(chain.publicKey);
  let expiresAt = Number.MAX_SAFE_INTEGER;

  for (let index = 0; index < chain.delegations.length; index++) {
    const signed = chain.delegations[index];
    const message = delegationMessage(signed.delegation);
    const signature = bytes(signed.signature);

    const check = hasAlgorithm(currentKey, CANISTER_SIGNATURE_OID)
      ? await checkCanisterSignature(currentKey, signature, message, canisterId, rootKeyHex)
      : checkPlainSignature(currentKey, signature, message);
    if (!check.ok) {
      // The sentence stays, so anything already watching for it keeps working;
      // what follows it is the part that says *where* the walk gave up.
      throw new DelegationVerificationError(
        `A delegation signature is not valid. Link ${index + 1} of ${chain.delegations.length},` +
          ` signed by ${describeKey(currentKey)}: ${check.reason}.`,
      );
    }

    // `expiration` is in nanoseconds.
    expiresAt = Math.min(expiresAt, Number(signed.delegation.expiration / 1_000_000n));
    currentKey = bytes(signed.delegation.pubkey);
  }

  // The last key of the chain is the browser's session key. Proving possession
  // of it *now* is what makes a copied chain useless on its own.
  let challengeSignature: Uint8Array;
  try {
    challengeSignature = fromHex(options.signature);
  } catch {
    throw new DelegationVerificationError('The challenge signature is not hex encoded.');
  }
  const challenge = checkPlainSignature(
    currentKey,
    challengeSignature,
    challengeMessage(options.challenge),
  );
  if (!challenge.ok) {
    throw new DelegationVerificationError(
      `The challenge signature is not valid. Session key is ${describeKey(currentKey)}:` +
        ` ${challenge.reason}.`,
    );
  }

  return {
    principal: Principal.selfAuthenticating(bytes(chain.publicKey)).toText(),
    expiresAt: new Date(expiresAt),
  };
}
