/**
 * Tests for the deterministic verdict layer.
 *
 * What is verified here is the promise the layer exists to keep: the same
 * evidence always produces the same traffic light, a confirmed malicious
 * indicator is never described neutrally, and missing data is never rendered as
 * green.
 *
 * Run with:  deno test --allow-net --allow-env supabase/functions/ai-chat
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeVerdict, VERDICT_THRESHOLDS, verdictLanguage } from './verdict.ts';
import { applyVerdict, DETAIL_MARKER } from './index.ts';
import type { SourceReport } from './intel.ts';

function report(
  provider: string,
  endpoint: string,
  data: Record<string, unknown>,
  status: SourceReport['status'] = 'success',
): SourceReport {
  return {
    provider,
    endpoint,
    entity: '185.220.101.1',
    timestamp: '2026-09-02T10:00:00.000Z',
    status,
    ...(status === 'success' ? { data } : {}),
  };
}

Deno.test('a confirmed malicious IP is red, not a neutral description', () => {
  const verdict = computeVerdict({
    kind: 'ip',
    entity: '185.220.101.1',
    sources: [
      report('VirusTotal', 'url-domain-ip/reputation', {
        malicious: 4,
        suspicious: 2,
        harmless: 60,
        reputation: -2,
      }),
      report('AbuseIPDB', 'ip/reputation', {
        abuseConfidenceScore: 100,
        totalReports: 42,
      }),
      report('IPinfo', 'ip/geolocation-asn', { country: 'DE', org: 'AS1234 Example' }),
    ],
  });

  assertEquals(verdict.level, 'danger');
  assert(verdict.headline.startsWith('🔴 PERIGO'), verdict.headline);
  assert(verdict.headline.includes('desaconselha o contacto'));
  // Every reason is attributed to the source that produced it.
  assert(verdict.signals.some((s) => s.provider === 'VirusTotal' && s.severity === 'strong'));
  assert(verdict.signals.some((s) => s.provider === 'AbuseIPDB' && s.severity === 'strong'));
});

Deno.test('a single unconfirmed signal is amber, never red and never green', () => {
  const verdict = computeVerdict({
    kind: 'domain',
    entity: 'example.test',
    sources: [
      report('VirusTotal', 'url-domain-ip/reputation', {
        malicious: 0,
        suspicious: 1,
        harmless: 70,
        reputation: 0,
      }),
      report('URLScan', 'url-domain/scan-history', { totalScans: 3, malicious: 0 }),
    ],
  });

  assertEquals(verdict.level, 'caution');
  assert(verdict.headline.startsWith('🟠 CUIDADO'), verdict.headline);
});

Deno.test('a clean indicator with real coverage is green', () => {
  const verdict = computeVerdict({
    kind: 'ip',
    entity: '8.8.8.8',
    sources: [
      report('VirusTotal', 'url-domain-ip/reputation', {
        malicious: 0,
        suspicious: 0,
        harmless: 72,
        reputation: 4,
      }),
      report('AbuseIPDB', 'ip/reputation', { abuseConfidenceScore: 0, totalReports: 0 }),
      report('IPinfo', 'ip/geolocation-asn', { country: 'US', org: 'AS15169 Google' }),
    ],
  });

  assertEquals(verdict.level, 'safe');
  assert(verdict.headline.startsWith('🟢 SEGURO'), verdict.headline);
});

Deno.test('no source answering is "no information", never green', () => {
  const verdict = computeVerdict({
    kind: 'phone',
    entity: '+351210000000',
    sources: [
      report('NumVerify', 'phone/validation', {}, 'failed'),
      report('Abstract Phone', 'phone/intelligence', {}, 'failed'),
      report('FTC DNC Complaints', 'phone/us-robocall-complaints', {}, 'not_configured'),
    ],
  });

  assertEquals(verdict.level, 'insufficient');
  assert(verdict.headline.startsWith('⚪ SEM INFORMAÇÃO SUFICIENTE'), verdict.headline);
  assert(verdict.headline.includes('não quer dizer que seja seguro'));
  assertEquals(verdict.coverage.answered, 0);
});

Deno.test('a majority of failed sources is not certified as safe', () => {
  const verdict = computeVerdict({
    kind: 'ip',
    entity: '1.2.3.4',
    sources: [
      report('IPinfo', 'ip/geolocation-asn', { country: 'PT' }),
      report('VirusTotal', 'url-domain-ip/reputation', {}, 'failed'),
      report('AbuseIPDB', 'ip/reputation', {}, 'failed'),
    ],
  });

  assertEquals(verdict.level, 'insufficient');
});

Deno.test('a confirmed community report alone is enough to be red', () => {
  const verdict = computeVerdict({
    kind: 'phone',
    entity: '+351911111111',
    sources: [],
    local: {
      reports: [{ status: 'confirmed', riskScore: 90 }],
    },
  });

  assertEquals(verdict.level, 'danger');
  assert(verdict.signals.some((s) => s.endpoint === 'community/reports'));
});

Deno.test('reports still under review are amber, not red', () => {
  const verdict = computeVerdict({
    kind: 'phone',
    entity: '+351911111111',
    sources: [],
    local: { reports: [{ status: 'pending', riskScore: 40 }] },
  });

  assertEquals(verdict.level, 'caution');
});

Deno.test('the verdict is a pure function of the evidence', () => {
  const sources = [
    report('VirusTotal', 'url-domain-ip/reputation', { malicious: 3, harmless: 50 }),
  ];
  const first = computeVerdict({ kind: 'url', sources });
  const second = computeVerdict({ kind: 'url', sources });
  assertEquals(first.level, second.level);
  assertEquals(first.score, second.score);
  assertEquals(first.headline, second.headline);
});

Deno.test('the thresholds are explicit and adjustable', () => {
  assertEquals(VERDICT_THRESHOLDS.abuseIpdb.confidenceStrong, 50);
  assertEquals(VERDICT_THRESHOLDS.virusTotal.maliciousStrong, 2);
  assert(VERDICT_THRESHOLDS.score.danger > VERDICT_THRESHOLDS.score.caution);
  assertEquals(VERDICT_THRESHOLDS.weights.strong, VERDICT_THRESHOLDS.score.danger);
});

Deno.test('an English question is answered with an English verdict', () => {
  assertEquals(verdictLanguage('Is this number safe to call?'), 'en');
  assertEquals(verdictLanguage('Este número é seguro?'), 'pt');
  // A bare indicator carries no language: the product language wins.
  assertEquals(verdictLanguage('185.220.101.1'), 'pt');

  const verdict = computeVerdict({
    kind: 'ip',
    sources: [report('VirusTotal', 'url-domain-ip/reputation', { malicious: 9 })],
    language: 'en',
  });
  assert(verdict.headline.startsWith('🔴 DANGER'), verdict.headline);
});

Deno.test('the computed verdict replaces the verdict the model wrote', () => {
  const verdict = computeVerdict({
    kind: 'ip',
    sources: [
      report('VirusTotal', 'url-domain-ip/reputation', { malicious: 4, suspicious: 2 }),
      report('AbuseIPDB', 'ip/reputation', { abuseConfidenceScore: 100, totalReports: 12 }),
    ],
  });

  const answer = applyVerdict(
    [
      '✅ Seguro',
      'Não encontrei nada de errado com este endereço.',
      DETAIL_MARKER,
      'VirusTotal: malicious 4, suspicious 2.',
    ].join('\n'),
    verdict,
  );

  const visible = answer.slice(0, answer.indexOf(DETAIL_MARKER));
  assert(visible.startsWith('🔴 PERIGO'), visible);
  // The contradicting verdict line is gone; the model's sentence is kept.
  assert(!visible.includes('✅ Seguro'), visible);
  assert(visible.includes('Não encontrei nada de errado'), visible);
  // The technical detail is untouched and stays behind the marker.
  assert(answer.includes('VirusTotal: malicious 4, suspicious 2.'));
});

Deno.test('an answer with no technical detail still opens with the verdict', () => {
  const verdict = computeVerdict({ kind: 'email', sources: [] });
  const answer = applyVerdict('Não consegui confirmar nada.', verdict);
  assert(answer.startsWith('⚪ SEM INFORMAÇÃO SUFICIENTE'), answer);
  assert(answer.includes('Não consegui confirmar nada.'));
});

Deno.test('the visible verdict carries no markdown the interface cannot render', () => {
  for (const kind of ['ip', 'phone', 'email', 'iban'] as const) {
    const verdict = computeVerdict({
      kind,
      sources: [report('VirusTotal', 'url-domain-ip/reputation', { malicious: 5 })],
    });
    assert(!verdict.headline.includes('*'), verdict.headline);
    assert(!verdict.headline.includes('#'), verdict.headline);
  }
});
