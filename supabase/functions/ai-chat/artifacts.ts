/**
 * Artefact detection for the Valthoris AI Security Assistant.
 *
 * A chat turn only becomes a fraud-pipeline event when the user actually
 * submitted something analysable (a URL, a domain, an e-mail address, a crypto
 * wallet, an IBAN or a phone number). General questions such as "what are the
 * latest threats?" are answered by the assistant but are not security analyses
 * and therefore must not create fraud records.
 *
 * The classification is purely mechanical — nothing here invents a verdict.
 */

/** Event types accepted by `public.fraud_events.event_type`. */
export type FraudEventType =
  | 'url'
  | 'email'
  | 'sms'
  | 'wallet_address'
  | 'file'
  | 'icp_report'
  | 'unknown';

export interface DetectedArtifact {
  eventType: FraudEventType;
  /** The exact substring the user submitted. Never rewritten. */
  value: string;
  /** Narrower label kept in the event payload metadata. */
  kind: 'url' | 'domain' | 'email' | 'crypto' | 'iban' | 'phone';
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const DOMAIN_RE =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|co|dev|app|info|biz|xyz|top|ru|cn|br|pt|es|fr|de|uk|eu|online|site|shop|link|click|live|cc|tk|ml|ga|gq|pw)\b/i;
const BTC_RE = /\b(?:bc1[a-z0-9]{20,}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/;
const ETH_RE = /\b0x[a-fA-F0-9]{40}\b/;
const IBAN_RE = /\b[A-Z]{2}[0-9]{2}(?:[ ]?[A-Z0-9]{4}){2,7}[ ]?[A-Z0-9]{1,3}\b/;
const PHONE_RE = /(?:\+|00)[0-9][0-9 ().-]{7,17}[0-9]/;

/**
 * Returns the first analysable artefact found in `text`, or null.
 * Ordered from the most specific pattern to the least specific one.
 */
export function detectArtifact(text: string): DetectedArtifact | null {
  const url = URL_RE.exec(text);
  if (url) return { eventType: 'url', value: url[0], kind: 'url' };

  const email = EMAIL_RE.exec(text);
  if (email) return { eventType: 'email', value: email[0], kind: 'email' };

  const eth = ETH_RE.exec(text);
  if (eth) return { eventType: 'wallet_address', value: eth[0], kind: 'crypto' };

  const btc = BTC_RE.exec(text);
  if (btc) return { eventType: 'wallet_address', value: btc[0], kind: 'crypto' };

  const iban = IBAN_RE.exec(text);
  if (iban) return { eventType: 'unknown', value: iban[0], kind: 'iban' };

  const phone = PHONE_RE.exec(text);
  if (phone) return { eventType: 'sms', value: phone[0].trim(), kind: 'phone' };

  const domain = DOMAIN_RE.exec(text);
  if (domain) return { eventType: 'url', value: domain[0], kind: 'domain' };

  return null;
}
