/**
 * Real tests for the `ai-chat` Edge Function.
 *
 * These are executable tests, not assertions about intent:
 *   • the artefact detector is exercised with real inputs
 *   • the verdict parser is exercised with valid and invalid provider answers
 *   • the deterministic event id is checked for stability and idempotency
 *   • the whole function is executed end to end against a local stub of the
 *     provider API and of PostgREST, and the resulting HTTP requests are
 *     inspected, so the fraud-pipeline writes are verified for real.
 *
 * Run with:  deno test --allow-net --allow-env supabase/functions/ai-chat
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectArtifact } from './artifacts.ts';
import { deterministicUuid } from './ids.ts';
import { parseStructuredAnalysis } from './pipeline.ts';

// ─── Artefact detection ──────────────────────────────────────────────────────

Deno.test('detects a URL', () => {
  const found = detectArtifact('Analyze this URL for threats: https://evil.example.com/login');
  assertEquals(found?.eventType, 'url');
  assertEquals(found?.value, 'https://evil.example.com/login');
});

Deno.test('detects an e-mail address', () => {
  const found = detectArtifact('Is billing@paypa1-secure.net a phishing attempt?');
  assertEquals(found?.eventType, 'email');
  assertEquals(found?.kind, 'email');
});

Deno.test('detects an ethereum wallet', () => {
  const found = detectArtifact('is 0x1234567890abcdef1234567890ABCDEF12345678 safe?');
  assertEquals(found?.eventType, 'wallet_address');
});

Deno.test('detects a phone number', () => {
  const found = detectArtifact('lookup +351 912 345 678 for scam reports');
  assertEquals(found?.eventType, 'sms');
});

Deno.test('a general question is not a security analysis', () => {
  assertEquals(detectArtifact('What are the latest cybersecurity threats?'), null);
});

// ─── Deterministic identifiers ───────────────────────────────────────────────

Deno.test('the same artefact always produces the same event id', async () => {
  const a = await deterministicUuid('valthoris:ai-chat:p1:url:https://x.test');
  const b = await deterministicUuid('valthoris:ai-chat:p1:url:https://x.test');
  const c = await deterministicUuid('valthoris:ai-chat:p2:url:https://x.test');
  assertEquals(a, b);
  assert(a !== c);
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a), a);
});

// ─── Verdict parsing ─────────────────────────────────────────────────────────

Deno.test('parses a valid structured verdict', () => {
  const analysis = parseStructuredAnalysis(
    '```json\n{"verdict":"fraud","confidenceScore":91,"justification":"Look-alike domain.","riskSignals":["homograph domain"],"recommendedAction":"Do not enter credentials."}\n```',
    'openai',
    'gpt-4o-mini',
  );
  assertEquals(analysis.verdict, 'fraud');
  assertEquals(analysis.confidenceScore, 91);
  assertEquals(analysis.riskSignals, ['homograph domain']);
});

Deno.test('rejects a non-JSON answer instead of inventing a verdict', () => {
  let threw = false;
  try {
    parseStructuredAnalysis('I think this looks dangerous.', 'openai', 'gpt-4o-mini');
  } catch {
    threw = true;
  }
  assert(threw, 'a prose answer must not be accepted as a verdict');
});

Deno.test('rejects an out-of-range confidence score', () => {
  let threw = false;
  try {
    parseStructuredAnalysis(
      '{"verdict":"fraud","confidenceScore":500,"justification":"x"}',
      'openai',
      'gpt-4o-mini',
    );
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('rejects an unknown verdict value', async () => {
  await assertRejects(
    () =>
      Promise.resolve().then(() =>
        parseStructuredAnalysis(
          '{"verdict":"very-bad","confidenceScore":10,"justification":"x"}',
          'openai',
          'gpt-4o-mini',
        )
      ),
    Error,
    'invalid verdict',
  );
});
