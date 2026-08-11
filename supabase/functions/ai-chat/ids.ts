/**
 * Deterministic identifiers used by the `ai-chat` fraud pipeline.
 *
 * The same artefact submitted twice by the same user must produce the same
 * `fraud_events.id`, so a repeated request updates the existing run instead of
 * creating a duplicate event. The id is derived from the content itself with
 * SHA-256 and formatted as an RFC 4122 UUID, which lets the primary key act as
 * the idempotency key on any deployment, independently of any additional
 * unique index that may exist in the database.
 */

/** SHA-256 of `value`, formatted as an RFC 4122 (version 8) UUID. */
export async function deterministicUuid(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );

  const bytes = digest.slice(0, 16);
  // Version 8 (custom / name-based with an application-defined hash).
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  // RFC 4122 variant.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
