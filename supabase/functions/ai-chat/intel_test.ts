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
  listSources,
  nominatimThrottle,
  placeContactMissing,
  placeMapLink,
  providersFor,
  probeSource,
  resetGoPlusToken,
  resetNominatimState,
  setIntelFailureSink,
  sourceId,
} from './intel.ts';
import type { IntelFailure } from './intel.ts';

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
  'GOPLUS_APP_KEY',
  'GOPLUS_APP_SECRET',
  'DATA_GOV_API_KEY',
];

function clearSecrets() {
  for (const key of SECRET_KEYS) Deno.env.delete(key);
  resetGoPlusToken();
  // The Nominatim throttle and its 24 h cache are process-wide: a test must
  // start from a clean state, or it would read the previous test's answer.
  resetNominatimState();
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
  assert(names('phone').includes('FTC DNC Complaints'));
  assertEquals(names('place'), ['Nominatim']);
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
    // The report carries the real diagnosis, not just the bare status: a quota
    // and a revoked key must not read the same to an operator.
    assertEquals(
      ipinfo?.error,
      'HTTP 429 — rate limit or quota exhausted at the provider',
    );
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


// ─── GoPlus token authentication ─────────────────────────────────────────────

Deno.test('GoPlus is not configured without the app key and secret', async () => {
  clearSecrets();
  Deno.env.set('GOPLUS_API_URL', 'https://api.gopluslabs.io');
  try {
    const reports = await gatherIntelligence({
      kind: 'crypto_eth',
      value: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    });
    const goplus = reports.find((r) => r.provider === 'GoPlus');
    assertEquals(goplus?.status, 'not_configured');
  } finally {
    clearSecrets();
  }
});

Deno.test('GoPlus signs a token and reuses it for both lookups', async () => {
  clearSecrets();
  Deno.env.set('GOPLUS_API_URL', 'https://api.gopluslabs.io');
  Deno.env.set('GOPLUS_APP_KEY', 'unit-test-app-key');
  Deno.env.set('GOPLUS_APP_SECRET', 'unit-test-app-secret');

  const realFetch = globalThis.fetch;
  let tokenRequests = 0;
  let signSeen = '';
  let timeSeen = 0;
  const authHeaders: string[] = [];

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    if (url.endsWith('/api/v1/token')) {
      tokenRequests += 1;
      const body = JSON.parse(String(init?.body ?? '{}'));
      signSeen = body.sign;
      timeSeen = body.time;
      assertEquals(body.app_key, 'unit-test-app-key');
      return Promise.resolve(
        new Response(JSON.stringify({ result: { access_token: 'unit-test-token' } }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    authHeaders.push(headers.get('Authorization') ?? '');
    if (url.includes('/address_security/')) {
      return Promise.resolve(
        new Response(JSON.stringify({ result: { honeypot_related_address: '1', cybercrime: '0' } }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;

  try {
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const first = await gatherIntelligence({ kind: 'crypto_eth', value: address });
    const goplus = first.find((r) => r.provider === 'GoPlus');
    assertEquals(goplus?.status, 'success');
    assertEquals(goplus?.data?.maliciousFlags, ['honeypot_related_address']);
    assertEquals(authHeaders[0], 'Bearer ' + 'unit-test-token');

    // The signature is SHA-1(app_key + time + app_secret), computed natively.
    const expected = await sha1Hex(`unit-test-app-key${timeSeen}unit-test-app-secret`);
    assertEquals(signSeen, expected);

    // A second lookup reuses the cached token instead of authenticating again.
    await gatherIntelligence({ kind: 'crypto_eth', value: address });
    assertEquals(tokenRequests, 1);

    // Neither the secret nor the token leaks into the reports.
    assert(!JSON.stringify(first).includes('unit-test-app-secret'));
    assert(!JSON.stringify(first).includes('unit-test-token'));
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// ─── FTC Do Not Call complaints (US only) ────────────────────────────────────

Deno.test('the FTC source answers for a US number and stays empty for a Portuguese one', async () => {
  clearSecrets();
  Deno.env.set('DATA_GOV_API_KEY', 'unit-test-data-gov-key');

  const realFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requested.push(url);
    if (url.startsWith('https://api.ftc.gov/v0/dnc-complaints')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            meta: { count: 137 },
            data: [
              { attributes: { subject: 'Reducing your debt', 'recorded-message-or-robocall': 'Y' } },
              { attributes: { subject: 'Vacation & timeshares', 'recorded-message-or-robocall': 'N' } },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;

  try {
    const us = await gatherIntelligence({ kind: 'phone', value: '+1 202 555 0100' });
    const ftcUs = us.find((r) => r.provider === 'FTC DNC Complaints');
    assertEquals(ftcUs?.status, 'success');
    assertEquals(ftcUs?.data?.areaCode, '202');
    assertEquals(ftcUs?.data?.complaintsInArea, 137);
    assertEquals(ftcUs?.data?.robocallComplaints, 1);
    assert(requested.some((u) => u.includes('area_code=202')));
    assert(!JSON.stringify(us).includes('unit-test-data-gov-key'));

    requested.length = 0;
    const pt = await gatherIntelligence({ kind: 'phone', value: '+351 21 000 0000' });
    const ftcPt = pt.find((r) => r.provider === 'FTC DNC Complaints');
    // A Portuguese number is out of scope: an empty result, never an error.
    assertEquals(ftcPt?.status, 'success');
    assertEquals(ftcPt?.data?.applicable, false);
    assertEquals(requested.length, 0);
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

// ─── Nominatim public place search ───────────────────────────────────────────

Deno.test('Nominatim returns the public location and an OpenStreetMap link', async () => {
  clearSecrets();
  const realFetch = globalThis.fetch;
  let userAgent = '';
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://nominatim.openstreetmap.org/search')) {
      userAgent = new Headers(init?.headers).get('User-Agent') ?? '';
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              name: 'Hospital do Espírito Santo',
              display_name: 'Hospital do Espírito Santo, Évora, Portugal',
              category: 'amenity',
              type: 'hospital',
              lat: '38.5713',
              lon: '-7.9135',
            },
          ]),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;

  try {
    const reports = await gatherIntelligence({
      kind: 'place',
      value: 'hospital distrital de Évora',
    });
    const osm = reports.find((r) => r.provider === 'Nominatim');
    assertEquals(osm?.status, 'success');
    assertEquals(osm?.data?.found, true);
    assertEquals(osm?.data?.name, 'Hospital do Espírito Santo');
    assertEquals(osm?.data?.type, 'hospital');
    assertEquals(
      osm?.data?.link,
      'https://www.openstreetmap.org/?mlat=38.5713&mlon=-7.9135#map=17/38.5713/-7.9135',
    );
    // No phone in the gazetteer means no phone in the report — nothing invented.
    assertEquals(osm?.data?.phone, undefined);
    assertEquals(userAgent, 'Valthoris-App/1.0 (https://valthoris.com; contacto@valthoris.com)');
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

Deno.test('Nominatim asks for the contact tags and reports the ones it gets', async () => {
  clearSecrets();
  const realFetch = globalThis.fetch;
  let requested = '';
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://nominatim.openstreetmap.org/search')) {
      requested = url;
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              name: 'Óptica Havaneza',
              display_name: 'Óptica Havaneza, Praça do Giraldo, Évora, Portugal',
              category: 'shop',
              type: 'optician',
              lat: '38.5717',
              lon: '-7.9089',
              extratags: {
                'contact:phone': '+351 266 702 297',
                website: 'https://opticahavaneza.test',
                opening_hours: 'Mo-Fr 09:00-19:00',
              },
            },
          ]),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;

  try {
    const reports = await gatherIntelligence({ kind: 'place', value: 'Óptica Havaneza Évora' });
    const osm = reports.find((r) => r.provider === 'Nominatim');
    // Without `extratags` the gazetteer never returns a contact at all.
    assert(requested.includes('extratags=1'), requested);
    assertEquals(osm?.data?.phone, '+351 266 702 297');
    assertEquals(osm?.data?.website, 'https://opticahavaneza.test');
    assertEquals(osm?.data?.openingHours, 'Mo-Fr 09:00-19:00');
    assertEquals(osm?.data?.address, 'Óptica Havaneza, Praça do Giraldo, Évora, Portugal');
    assertEquals(placeContactMissing(reports), false);
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

Deno.test('a missing phone is reported as missing, never filled in', () => {
  assertEquals(
    placeContactMissing([
      {
        provider: 'Nominatim',
        endpoint: 'place/public-search',
        entity: 'x',
        timestamp: new Date().toISOString(),
        status: 'success',
        data: { found: true, name: 'X' },
      },
    ]),
    true,
  );
});

Deno.test('the map link is only built from real coordinates', () => {
  assertEquals(
    placeMapLink('38.5713', '-7.9135'),
    'https://www.openstreetmap.org/?mlat=38.5713&mlon=-7.9135#map=17/38.5713/-7.9135',
  );
  assertEquals(placeMapLink('38.5713', undefined), undefined);
  assertEquals(placeMapLink('38.5713', '-7.9135; DROP'), undefined);
  assertEquals(placeMapLink('not-a-number', '-7.9135'), undefined);
});

// ─── Nominatim usage policy ──────────────────────────────────────────────────

Deno.test('a repeated place search is answered from the cache, not from Nominatim', async () => {
  clearSecrets();
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://nominatim.openstreetmap.org/search')) {
      calls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { name: 'McDonald\'s', display_name: 'McDonald\'s, Évora', lat: '38.5713', lon: '-7.9135' },
          ]),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;

  try {
    const first = await gatherIntelligence({ kind: 'place', value: "McDonald's Évora" });
    const second = await gatherIntelligence({ kind: 'place', value: "mcdonald's évora" });
    assertEquals(first[0]?.status, 'success');
    assertEquals(second[0]?.status, 'success');
    assertEquals(second[0]?.data?.name, "McDonald's");
    // The public gazetteer allows one request per second for the whole app;
    // the same question must not spend a second one.
    assertEquals(calls, 1);
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

Deno.test('concurrent Nominatim lookups are spaced by at least one second', async () => {
  clearSecrets();
  const realFetch = globalThis.fetch;
  const timestamps: number[] = [];
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://nominatim.openstreetmap.org/search')) {
      timestamps.push(Date.now());
      return Promise.resolve(
        new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } }),
      );
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;

  try {
    await Promise.all([
      nominatimThrottle(() => fetch('https://nominatim.openstreetmap.org/search?q=a')),
      nominatimThrottle(() => fetch('https://nominatim.openstreetmap.org/search?q=b')),
    ]);
    assertEquals(timestamps.length, 2);
    assert(timestamps[1] - timestamps[0] >= 950, `${timestamps[1] - timestamps[0]} ms apart`);
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

// ─── Source health ───────────────────────────────────────────────────────────

Deno.test('a disabled source is reported as disabled and never contacted', async () => {
  clearSecrets();
  Deno.env.set('CRYPTOSCAMDB_API_URL', 'https://api.cryptoscamdb.test');
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = ((): Promise<Response> => {
    called = true;
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;

  try {
    const health = await probeSource(sourceId('CryptoScamDB', 'crypto/scam-database'));
    assertEquals(health?.status, 'disabled');
    assertEquals(called, false);

    const reports = await gatherIntelligence({ kind: 'domain', value: 'example.com' });
    const scamdb = reports.find((r) => r.provider === 'CryptoScamDB');
    assertEquals(scamdb?.status, 'disabled');
    assert(String(scamdb?.error).includes('discontinued'));
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

Deno.test('every failure is handed to the failure sink with its HTTP status', async () => {
  clearSecrets();
  Deno.env.set('ABUSEIPDB_API_KEY', 'unit-test-abuseipdb-key');
  const failures: IntelFailure[] = [];
  setIntelFailureSink((failure) => failures.push(failure));

  const realFetch = globalThis.fetch;
  globalThis.fetch = ((): Promise<Response> =>
    Promise.resolve(new Response('forbidden', { status: 403 }))) as typeof fetch;

  try {
    const reports = await gatherIntelligence({ kind: 'ip', value: '8.8.8.8' });
    assertEquals(reports.find((r) => r.provider === 'AbuseIPDB')?.status, 'failed');
    const failure = failures.find((f) => f.provider === 'AbuseIPDB');
    assertEquals(failure?.status, 403);
    assert(String(failure?.message).includes('403'));
    // The sink must never receive a credential.
    assert(!JSON.stringify(failures).includes('unit-test-abuseipdb-key'));
  } finally {
    globalThis.fetch = realFetch;
    setIntelFailureSink(undefined);
    clearSecrets();
  }
});

Deno.test('the registry lists a source for every configured secret, values excluded', () => {
  clearSecrets();
  const sources = listSources();
  assert(sources.length > 10);
  assertEquals(
    sources.filter((s) => s.provider === 'Nominatim')[0]?.status,
    'operational',
  );
  // Without secrets everything else is "not configured" — never "operational".
  assert(
    sources
      .filter((s) => s.provider !== 'Nominatim')
      .every((s) => s.status === 'not_configured' || s.status === 'disabled'),
  );
});
