/**
 * Real tests for the intelligence orchestration layer (`intel.ts`).
 *
 * The providers are exercised against a local stub of their HTTP APIs, so what
 * is verified is the actual behaviour of the orchestrator:
 *   • every provider that applies to an entity is queried;
 *   • a provider that is not configured is reported as such and never faked;
 *   • a provider that fails does not take the other providers down;
 *   • no API key ever appears in a source report or in the evidence block.
 *
 * Run with:  deno test --allow-net --allow-env supabase/functions/ai-chat
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  formatEvidence,
  gatherIntelligence,
  isValidEntity,
  providersFor,
} from './intel.ts';

const SECRET_KEYS = [
  'ABUSEIPDB_API_KEY',
  'IPINFO_API_KEY',
  'VIRUSTOTAL_API_KEY',
  'URLSCAN_API_KEY',
  'ABSTRACT_IP_API_KEY',
  'ABSTRACT_EMAIL_API_KEY',
  'ABSTRACT_PHONE_API_KEY',
  'ABSTRACT_IBAN_API_KEY',
  'ABSTRACT_VAT_API_KEY',
  'NUMVERIFY_API_KEY',
  'ETHERSCAN_API_KEY',
  'COINGECKO_API_KEY',
  'NEWSDATA_API_KEY',
  'OPENIBAN_API_URL',
  'CRYPTOSCAMDB_API_URL',
  'GOPLUS_API_URL',
];

function clearSecrets() {
  for (const key of SECRET_KEYS) Deno.env.delete(key);
}

// ─── Entity validation ───────────────────────────────────────────────────────

Deno.test('entity validation accepts real values and rejects malformed ones', () => {
  assert(isValidEntity('ip', '8.8.8.8'));
  assert(!isValidEntity('ip', '8.8.8.999'));
  assert(isValidEntity('domain', 'example.com'));
  assert(!isValidEntity('domain', 'not a domain'));
  assert(isValidEntity('crypto_eth', '0x1234567890abcdef1234567890ABCDEF12345678'));
  assert(isValidEntity('iban', 'GB29 NWBK 6016 1331 9268 19'));
  assert(isValidEntity('phone', '+351 912 345 678'));
  assert(isValidEntity('email', 'user@example.com'));
});

Deno.test('a URL pointing at the deployment itself is never looked up', () => {
  assert(isValidEntity('url', 'https://example.com/login'));
  assert(!isValidEntity('url', 'http://localhost:8000/admin'));
  assert(!isValidEntity('url', 'http://127.0.0.1/'));
  assert(!isValidEntity('url', 'http://169.254.169.254/latest/meta-data'));
  assert(!isValidEntity('url', 'file:///etc/passwd'));
});

// ─── Provider selection ──────────────────────────────────────────────────────

Deno.test('each entity kind selects its real providers', () => {
  const names = (kind: Parameters<typeof providersFor>[0]) =>
    providersFor(kind).map((p) => p.provider);

  assertEquals(names('ip').sort(), ['AbuseIPDB', 'Abstract IP', 'IPinfo', 'VirusTotal'].sort());
  assert(names('url').includes('URLScan'));
  assert(names('url').includes('VirusTotal'));
  assert(names('phone').includes('NumVerify'));
  assert(names('phone').includes('Abstract Phone'));
  assert(names('iban').includes('OpenIBAN'));
  assert(names('crypto_eth').includes('Etherscan'));
  assert(names('crypto_eth').includes('CryptoScamDB'));
  assert(names('topic').includes('NewsData'));
});

// ─── Not configured ──────────────────────────────────────────────────────────

Deno.test('an unconfigured provider is reported, never invented', async () => {
  clearSecrets();
  const reports = await gatherIntelligence({ kind: 'ip', value: '8.8.8.8' });
  assert(reports.length > 0);
  assert(reports.every((r) => r.status === 'not_configured'));
  assert(reports.every((r) => r.data === undefined));
});

// ─── Partial outage ──────────────────────────────────────────────────────────

Deno.test('one failing provider does not take the analysis down', async () => {
  clearSecrets();
  Deno.env.set('ABUSEIPDB_API_KEY', 'unit-test-abuseipdb-key');
  Deno.env.set('IPINFO_API_KEY', 'unit-test-ipinfo-key');

  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const host = new URL(url).hostname;
    if (host === 'api.abuseipdb.com') {
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: { abuseConfidenceScore: 92, totalReports: 41, countryCode: 'RU' } }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (host === 'ipinfo.io') {
      return Promise.resolve(new Response('quota exceeded', { status: 429 }));
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;

  try {
    const reports = await gatherIntelligence({ kind: 'ip', value: '45.10.20.30' });
    const abuse = reports.find((r) => r.provider === 'AbuseIPDB');
    const ipinfo = reports.find((r) => r.provider === 'IPinfo');
    const virustotal = reports.find((r) => r.provider === 'VirusTotal');

    assertEquals(abuse?.status, 'success');
    assertEquals(abuse?.data?.abuseConfidenceScore, 92);
    assertEquals(ipinfo?.status, 'failed');
    assertEquals(ipinfo?.error, 'HTTP 429');
    assertEquals(virustotal?.status, 'not_configured');

    const evidence = formatEvidence({ kind: 'ip', value: '45.10.20.30' }, reports);
    assert(evidence.includes('AbuseIPDB'));
    assert(evidence.includes('did not answer'));
    // The evidence block is sent to the model: it must not carry credentials.
    assert(!evidence.includes('unit-test-abuseipdb-key'));
    assert(!evidence.includes('unit-test-ipinfo-key'));
    assert(!JSON.stringify(reports).includes('unit-test-abuseipdb-key'));
    assert(!JSON.stringify(reports).includes('unit-test-ipinfo-key'));
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

Deno.test('an invalid entity is not sent to any provider', async () => {
  clearSecrets();
  Deno.env.set('ABUSEIPDB_API_KEY', 'unit-test-abuseipdb-key');
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    return Promise.reject(new Error('must not be called'));
  }) as typeof fetch;
  try {
    const reports = await gatherIntelligence({ kind: 'ip', value: '999.999.999.999' });
    assertEquals(reports, []);
    assert(!called);
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});
