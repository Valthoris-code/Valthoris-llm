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
  parseDuckDuckGoHtml,
  pickPlaceCandidate,
  placeContactMissing,
  placeMapLink,
  placeQueryVariants,
  providersFor,
  probeSource,
  resetGoPlusToken,
  resetNominatimState,
  resetQuotaGuard,
  geminiSearchModels,
  scorePlaceCandidate,
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
  'GEMINI_API_KEY',
  'GEMINI_SEARCH_MODEL',
  'GEMINI_MODEL',
  'BRAVE_SEARCH_API_KEY',
  'TAVILY_API_KEY',
  'SERPER_API_KEY',
];

function clearSecrets() {
  for (const key of SECRET_KEYS) Deno.env.delete(key);
  resetGoPlusToken();
  // The Nominatim throttle and its 24 h cache are process-wide: a test must
  // start from a clean state, or it would read the previous test's answer.
  resetNominatimState();
  // The quota cache and cooldown are process-wide too.
  resetQuotaGuard();
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
  // Two keyless gazetteers answer a place, so one index missing a business is
  // not the end of the lookup.
  assertEquals(names('place').sort(), ['Nominatim', 'Photon']);
  // The open web is searched with the keyless engines on every deployment, and
  // with the commercial APIs whenever their key is configured.
  const web = names('web');
  assert(web.includes('DuckDuckGo'));
  assert(web.includes('Wikipedia'));
  assert(web.includes('Brave Search'));
  assert(web.includes('Tavily'));
  assert(web.includes('Serper (Google)'));
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
  // The sources that need no credential work on every deployment.
  const keyless = ['Nominatim', 'Photon', 'DuckDuckGo', 'Wikipedia'];
  for (const provider of keyless) {
    assertEquals(sources.filter((s) => s.provider === provider)[0]?.status, 'operational', provider);
  }
  // Without secrets everything else is "not configured" — never "operational".
  assert(
    sources
      .filter((s) => !keyless.includes(s.provider))
      .every((s) => s.status === 'not_configured' || s.status === 'disabled'),
  );
});

// ─── Public web search ───────────────────────────────────────────────────────

Deno.test('the keyless search engine parses real result pages', () => {
  const html = `
    <div class="result">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.hesevora.min-saude.pt%2Fcontactos">
        Hospital do Esp&iacute;rito Santo &mdash; Contactos
      </a>
      <a class="result__snippet">Telefone: <b>266 740 100</b></a>
    </div>
    <div class="result">
      <a class="result__a" href="https://www.evora.net/optica-havaneza">Óptica Havaneza</a>
      <a class="result__snippet">Praça do Giraldo, Évora</a>
    </div>`;
  const results = parseDuckDuckGoHtml(html);
  assertEquals(results.length, 2);
  // The redirect wrapper is unwrapped: the source is the page, not DuckDuckGo.
  assertEquals(results[0].url, 'https://www.hesevora.min-saude.pt/contactos');
  assertEquals(results[0].title, 'Hospital do Espírito Santo — Contactos');
  assertEquals(results[0].snippet, 'Telefone: 266 740 100');
  assertEquals(results[1].url, 'https://www.evora.net/optica-havaneza');
});

Deno.test('a search result that is not a public page is never reported', () => {
  const html = `
    <a class="result__a" href="javascript:alert(1)">click</a>
    <a class="result__a" href="http://127.0.0.1:8000/admin">internal</a>
    <a class="result__a" href="https://example.com/real">real page</a>`;
  const results = parseDuckDuckGoHtml(html);
  assertEquals(results.length, 1);
  assertEquals(results[0].url, 'https://example.com/real');
});

Deno.test('a real web search is performed with no credential at all', async () => {
  clearSecrets();
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    if (url.startsWith('https://html.duckduckgo.com/')) {
      return Promise.resolve(
        new Response(
          '<a class="result__a" href="https://exemplo.test/pagina">Uma página</a>' +
            '<a class="result__snippet">O que a página diz</a>',
          { status: 200 },
        ),
      );
    }
    if (/^https:\/\/[a-z]{2}\.wikipedia\.org\//.test(url)) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ query: { search: [{ title: 'Évora', snippet: 'Cidade <b>portuguesa</b>' }] } }),
          { status: 200 },
        ),
      );
    }
    return Promise.reject(new Error(`unexpected fetch to ${url}`));
  }) as typeof fetch;

  try {
    const reports = await gatherIntelligence({ kind: 'web', value: 'óptica havaneza évora' });
    const ddg = reports.find((r) => r.provider === 'DuckDuckGo');
    assertEquals(ddg?.status, 'success');
    assertEquals((ddg?.data?.pages as { url: string }[])[0].url, 'https://exemplo.test/pagina');

    const wiki = reports.find((r) => r.provider === 'Wikipedia');
    assertEquals(wiki?.status, 'success');
    assertEquals((wiki?.data?.pages as { url: string }[])[0].url, 'https://pt.wikipedia.org/wiki/%C3%89vora');

    // The engines that need a key are reported as unavailable, never faked.
    assertEquals(reports.find((r) => r.provider === 'Brave Search')?.status, 'not_configured');
    assert(calls.some((url) => url.startsWith('https://html.duckduckgo.com/')));
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test('the paid Gemini search is switched off and never called', async () => {
  clearSecrets();
  Deno.env.set('GEMINI_API_KEY', 'unit-test-gemini-key');
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;

  try {
    // Grounding with Google Search is billed apart from the ordinary Gemini
    // quota, so the source is disabled: it is reported as such, with the
    // reason, and the Gemini endpoint is not contacted for a search.
    const reports = await gatherIntelligence({ kind: 'web', value: 'óptica havaneza évora' });
    const search = reports.find((r) => r.provider === 'Google Search (Gemini)');
    assertEquals(search?.status, 'disabled');
    assert(String(search?.error).includes('paid'));
    assert(!calls.some((url) => url.startsWith('https://generativelanguage.googleapis.com/')));

    const health = await probeSource(sourceId('Google Search (Gemini)', 'web/search'));
    assertEquals(health?.status, 'disabled');
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

Deno.test('the search model can be pointed at a model of its own', () => {
  clearSecrets();
  Deno.env.set('GEMINI_MODEL', 'models/gemini-2.5-pro/');
  Deno.env.set('GEMINI_SEARCH_MODEL', 'gemini-2.5-flash');
  try {
    const chain = geminiSearchModels();
    assertEquals(chain[0], 'gemini-2.5-flash');
    assert(chain.includes('gemini-2.5-pro'), 'the configured model is still tried');
    assert(chain.includes('gemini-2.5-flash-lite'), 'the fallback is still tried');
    // A name is never repeated: each entry costs a request when the one before
    // it fails.
    assertEquals(new Set(chain).size, chain.length);
  } finally {
    clearSecrets();
  }
});

// ─── Place ranking ───────────────────────────────────────────────────────────

Deno.test('a bus stop never outranks the place the user asked about', () => {
  const busStop = {
    name: 'Hospital',
    display_name: 'Hospital, Rua Diogo Cão, Barreiro, Setúbal, Portugal',
    category: 'highway',
    type: 'bus_stop',
    importance: 0.4,
  };
  const hospital = {
    name: 'Hospital de São Bernardo',
    display_name: 'Hospital de São Bernardo, Setúbal, Portugal',
    category: 'amenity',
    type: 'hospital',
    importance: 0.3,
  };
  const query = 'Hospital de Setúbal';
  assert(scorePlaceCandidate(hospital, query) > scorePlaceCandidate(busStop, query));
  assertEquals(pickPlaceCandidate([busStop, hospital], query), hospital);
});

Deno.test('a place query is reformulated until the gazetteer understands it', () => {
  const variants = placeQueryVariants('Óptica Havaneza em Évora');
  assert(variants.includes('Óptica Havaneza em Évora'));
  assert(variants.includes('Óptica Havaneza, Évora'));
  assert(variants.includes('Havaneza, Évora'), variants.join(' | '));
});


// ─── Contact details of a public place ───────────────────────────────────────

Deno.test('a place found by Photon still gets its phone and site from OSM', async () => {
  clearSecrets();
  const realFetch = globalThis.fetch;
  let lookupUrl = '';
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://nominatim.openstreetmap.org/lookup')) {
      lookupUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify([{
            extratags: {
              phone: '+351 266 700 000',
              website: 'https://farmaciaavo.test',
              opening_hours: 'Mo-Sa 09:00-20:00',
            },
          }]),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url.startsWith('https://photon.komoot.io/api/')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            features: [{
              properties: {
                name: 'Farmácia Avó',
                osm_key: 'amenity',
                osm_value: 'pharmacy',
                osm_type: 'N',
                osm_id: 123456789,
                city: 'Évora',
                country: 'Portugal',
              },
              geometry: { coordinates: [-7.9089, 38.5717] },
            }],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url.startsWith('https://nominatim.openstreetmap.org/search')) {
      return Promise.resolve(
        new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } }),
      );
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;

  try {
    const reports = await gatherIntelligence({ kind: 'place', value: 'Farmácia Avó Évora' });
    const photon = reports.find((r) => r.provider === 'Photon');
    assertEquals(photon?.status, 'success');
    // Photon itself never returns a contact: the OSM object carries it, and it
    // is fetched instead of leaving the answer without a phone number.
    assert(lookupUrl.includes('osm_ids=N123456789'), lookupUrl);
    assert(lookupUrl.includes('extratags=1'), lookupUrl);
    assertEquals(photon?.data?.phone, '+351 266 700 000');
    assertEquals(photon?.data?.website, 'https://farmaciaavo.test');
    assertEquals(photon?.data?.openingHours, 'Mo-Sa 09:00-20:00');
    assertEquals(placeContactMissing(reports), false);
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

Deno.test('an OSM object with no contact tag produces no contact at all', async () => {
  clearSecrets();
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://nominatim.openstreetmap.org/lookup')) {
      return Promise.resolve(
        new Response(JSON.stringify([{ extratags: {} }]), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.startsWith('https://nominatim.openstreetmap.org/search')) {
      return Promise.resolve(
        new Response(
          JSON.stringify([{
            name: 'Óptica Havaneza',
            display_name: 'Óptica Havaneza, Évora',
            category: 'shop',
            type: 'optician',
            osm_type: 'way',
            osm_id: 42,
            lat: '38.5717',
            lon: '-7.9089',
          }]),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;

  try {
    const reports = await gatherIntelligence({ kind: 'place', value: 'Óptica Havaneza Évora' });
    const osm = reports.find((r) => r.provider === 'Nominatim');
    assertEquals(osm?.data?.name, 'Óptica Havaneza');
    assertEquals(osm?.data?.phone, undefined);
    assertEquals(osm?.data?.website, undefined);
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

// ─── Metered providers ───────────────────────────────────────────────────────

Deno.test('a repeated phone lookup does not spend a second NumVerify request', async () => {
  clearSecrets();
  Deno.env.set('NUMVERIFY_API_KEY', 'numverify-key');
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://apilayer.net/api/validate')) {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ valid: true, country_name: 'Portugal', carrier: 'MEO' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  }) as typeof fetch;

  try {
    const first = await gatherIntelligence({ kind: 'phone', value: '+351910000000' });
    const second = await gatherIntelligence({ kind: 'phone', value: '+351910000000' });
    assertEquals(first.find((r) => r.provider === 'NumVerify')?.data?.countryName, 'Portugal');
    assertEquals(second.find((r) => r.provider === 'NumVerify')?.data?.countryName, 'Portugal');
    assertEquals(calls, 1);
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

Deno.test('an exhausted NumVerify quota stops further requests and says why', async () => {
  clearSecrets();
  Deno.env.set('NUMVERIFY_API_KEY', 'numverify-key');
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://apilayer.net/api/validate')) {
      calls += 1;
      // apilayer reports an exhausted plan as HTTP 200 with error code 104.
      return Promise.resolve(
        new Response(JSON.stringify({ success: false, error: { code: 104, info: 'usage limit' } }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  }) as typeof fetch;

  try {
    const first = await gatherIntelligence({ kind: 'phone', value: '+351910000001' });
    const failure = first.find((r) => r.provider === 'NumVerify');
    assertEquals(failure?.status, 'failed');
    assert(String(failure?.error).includes('429'), failure?.error);

    const second = await gatherIntelligence({ kind: 'phone', value: '+351910000002' });
    const cooled = second.find((r) => r.provider === 'NumVerify');
    assertEquals(cooled?.status, 'failed');
    // The quota is spent: no further request is sent until the cooldown ends.
    assertEquals(calls, 1);
    assert(String(cooled?.error).includes('no further request'), cooled?.error);
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

Deno.test('a rejected credential names the secret to fix', async () => {
  clearSecrets();
  Deno.env.set('ABSTRACT_PHONE_API_KEY', 'wrong-product-key');
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://phonevalidation.abstractapi.com/')) {
      return Promise.resolve(new Response('unauthorized', { status: 401 }));
    }
    return Promise.resolve(new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  }) as typeof fetch;

  const failures: IntelFailure[] = [];
  setIntelFailureSink((failure) => failures.push(failure));
  try {
    const reports = await gatherIntelligence({ kind: 'phone', value: '+351910000003' });
    const abstract = reports.find((r) => r.provider === 'Abstract Phone');
    assertEquals(abstract?.status, 'failed');
    assert(String(abstract?.error).includes('ABSTRACT_PHONE_API_KEY'), abstract?.error);
    const logged = failures.find((f) => f.provider === 'Abstract Phone');
    assertEquals(logged?.status, 401);
    // The Abstract products issue one key each — the log says so, because that
    // is what a 401 from these endpoints almost always means.
    assert(String(logged?.message).includes('own key'), logged?.message);
  } finally {
    setIntelFailureSink(undefined);
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

// ─── Crypto: the panel data ──────────────────────────────────────────────────

Deno.test('a listed token returns the market data and the price history', async () => {
  // USDT: a real, listed contract — the address the crypto panel is expected to
  // show market data for, exercised against a stub of the two APIs.
  const usdt = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  clearSecrets();
  Deno.env.set('ETHERSCAN_API_KEY', 'unit-test-etherscan-key');
  Deno.env.set('COINGECKO_API_KEY', 'unit-test-coingecko-key');

  const day = 24 * 60 * 60 * 1000;
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const json = (body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }),
      );
    const host = new URL(url).hostname;
    if (host === 'api.etherscan.io') {
      if (url.includes('action=balance')) return json({ status: '1', result: '2500000000000000000' });
      if (url.includes('action=txlist')) {
        return json({
          status: '1',
          result: [
            { timeStamp: String(Math.floor((Date.now()) / 1000)) },
            { timeStamp: String(Math.floor((Date.now() - 30 * day) / 1000)) },
          ],
        });
      }
      if (url.includes('action=eth_getCode')) return json({ result: '0x60806040523480' });
    }
    if (url.includes('/coins/ethereum/contract/')) {
      return json({
        id: 'tether',
        name: 'Tether',
        symbol: 'usdt',
        market_cap_rank: 3,
        market_data: {
          current_price: { usd: 1.001 },
          price_change_percentage_24h: -0.02,
          total_volume: { usd: 42_000_000_000 },
          market_cap: { usd: 95_000_000_000 },
        },
        tickers: [
          { market: { name: 'Binance' } },
          { market: { name: 'Binance' } },
          { market: { name: 'Kraken' } },
        ],
      });
    }
    if (url.includes('/market_chart')) {
      return json({
        prices: [
          [Date.now() - 2 * day, 0.999],
          [Date.now() - day, 1.0],
          [Date.now(), 1.001],
        ],
      });
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;

  try {
    const reports = await gatherIntelligence({ kind: 'crypto_eth', value: usdt });
    const etherscan = reports.find((r) => r.provider === 'Etherscan');
    const coingecko = reports.find((r) => r.provider === 'CoinGecko');

    assertEquals(etherscan?.status, 'success');
    assertEquals(etherscan?.data?.balanceEth, 2.5);
    assertEquals(etherscan?.data?.recentTransactions, 2);
    // USDT is a contract, not a wallet — the panel says so explicitly.
    assertEquals(etherscan?.data?.isContract, true);

    assertEquals(coingecko?.status, 'success');
    assertEquals(coingecko?.data?.listedToken, true);
    assertEquals(coingecko?.data?.symbol, 'usdt');
    assertEquals(coingecko?.data?.priceUsd, 1.001);
    assertEquals(coingecko?.data?.priceChange24hPct, -0.02);
    assertEquals(coingecko?.data?.volume24hUsd, 42_000_000_000);
    assertEquals(coingecko?.data?.marketCapUsd, 95_000_000_000);
    assertEquals(coingecko?.data?.exchanges, ['Binance', 'Kraken']);
    assertEquals((coingecko?.data?.priceHistory7d as unknown[]).length, 3);

    // No credential ever reaches a source report or the model's evidence.
    const evidence = formatEvidence({ kind: 'crypto_eth', value: usdt }, reports);
    assert(!evidence.includes('unit-test-etherscan-key'));
    assert(!evidence.includes('unit-test-coingecko-key'));
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});

Deno.test('a plain wallet is reported as not being a listed token', async () => {
  const wallet = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  clearSecrets();
  Deno.env.set('COINGECKO_API_KEY', 'unit-test-coingecko-key');
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/coins/ethereum/contract/')) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    return Promise.reject(new Error(`unexpected call to ${url}`));
  }) as typeof fetch;
  try {
    const reports = await gatherIntelligence({ kind: 'crypto_eth', value: wallet });
    const coingecko = reports.find((r) => r.provider === 'CoinGecko');
    assertEquals(coingecko?.status, 'success');
    assertEquals(coingecko?.data?.listedToken, false);
  } finally {
    globalThis.fetch = realFetch;
    clearSecrets();
  }
});
