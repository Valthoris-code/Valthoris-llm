/**
 * End-to-end test of the `ai-chat` Edge Function.
 *
 * The function is executed for real. Only the two external systems are stubbed:
 *   • the LLM provider HTTP API
 *   • PostgREST (the Supabase data API)
 *
 * Every HTTP request the function makes is recorded and asserted, so this test
 * proves what is actually written to the fraud pipeline — including the
 * running → completed transition, the idempotent event id, and the fact that
 * no decision is persisted when the provider does not return a valid verdict.
 *
 * Run with:  deno test --allow-net --allow-env supabase/functions/ai-chat
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// ─── Environment (read by the function at call time) ─────────────────────────

Deno.env.set('GEMINI_API_KEY', 'test-gemini-key');
Deno.env.set('SUPABASE_URL', 'https://stub.supabase.test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

// ─── Capture the handler registered with Deno.serve ──────────────────────────

type Handler = (req: Request) => Promise<Response>;
let handler: Handler | null = null;

const realServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (fn: Handler) => {
  handler = fn;
  return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
};

await import('./index.ts');

// deno-lint-ignore no-explicit-any
(Deno as any).serve = realServe;

assert(handler, 'the function did not register a request handler');

// ─── Stubbed external systems ────────────────────────────────────────────────

interface Recorded {
  url: string;
  method: string;
  body: unknown;
  prefer?: string;
}

let recorded: Recorded[] = [];
/** Content the stubbed provider returns, in call order. */
let providerAnswers: string[] = [];

const realFetch = globalThis.fetch;

globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? 'GET';
  const rawBody = typeof init?.body === 'string' ? init.body : undefined;
  const headers = new Headers(init?.headers);
  recorded.push({
    url,
    method,
    body: rawBody ? JSON.parse(rawBody) : undefined,
    prefer: headers.get('Prefer') ?? undefined,
  });

  if (url.startsWith('https://generativelanguage.googleapis.com/')) {
    const content = providerAnswers.shift() ?? '';
    return Promise.resolve(
      new Response(
        JSON.stringify({
          modelVersion: 'gemini-2.0-flash',
          candidates: [{ content: { parts: [{ text: content }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  if (url.startsWith('https://stub.supabase.test/rest/v1/')) {
    const path = url.slice('https://stub.supabase.test/rest/v1/'.length);
    if (path.startsWith('fraud_pipelines') && method === 'GET') {
      return Promise.resolve(
        new Response(JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111' }]), { status: 200 }),
      );
    }
    if (path.startsWith('fraud_decisions')) {
      return Promise.resolve(
        new Response(JSON.stringify([{ id: '22222222-2222-4222-8222-222222222222' }]), { status: 201 }),
      );
    }
    return Promise.resolve(new Response('', { status: 201 }));
  }

  return Promise.reject(new Error(`unexpected fetch to ${url}`));
}) as typeof fetch;

globalThis.addEventListener('unload', () => {
  globalThis.fetch = realFetch;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function post(body: unknown): Request {
  return new Request('https://stub.functions.test/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function restCalls(table: string): Recorded[] {
  return recorded.filter((r) => r.url.includes(`/rest/v1/${table}`) && r.method === 'POST');
}

const VALID_VERDICT = JSON.stringify({
  verdict: 'fraud',
  confidenceScore: 88,
  justification: 'The domain imitates a well known brand and asks for credentials.',
  riskSignals: ['look-alike domain', 'credential harvesting form'],
  recommendedAction: 'Do not enter any credentials and report the page.',
});

// ─── Tests ───────────────────────────────────────────────────────────────────

Deno.test('a real analysis produces a completed run, a decision and a justification', async () => {
  recorded = [];
  providerAnswers = ['This link is a phishing page imitating a bank.', VALID_VERDICT];

  const res = await handler!(post({
    messages: [{ role: 'user', content: 'Analyze this URL for threats: https://secure-bank-login.test/verify' }],
    principal: 'aaaaa-bbbbb-ccccc-ddddd-cai',
  }));

  assertEquals(res.status, 200);
  const body = await res.json();

  // The answer is the real provider answer, not a placeholder.
  assertEquals(body.content, 'This link is a phishing page imitating a bank.');
  assertEquals(body.provider, 'gemini');
  assert(!String(body.content).includes('Backend integration pending'));

  // The verdict is exactly what the provider returned.
  assertEquals(body.analysis.recorded, true);
  assertEquals(body.analysis.verdict, 'fraud');
  assertEquals(body.analysis.confidenceScore, 88);

  // The event was written once, attributed to the caller's principal.
  const events = restCalls('fraud_events');
  assertEquals(events.length, 1);
  const event = events[0].body as Record<string, any>;
  assertEquals(event.user_id, 'aaaaa-bbbbb-ccccc-ddddd-cai');
  assertEquals(event.event_type, 'url');
  assertEquals(event.payload.content, 'https://secure-bank-login.test/verify');
  assert(events[0].prefer?.includes('ignore-duplicates'), 'event insert must be idempotent');

  // The workflow run went running → completed with no error.
  const runs = restCalls('fraud_workflow_runs').map((r) => r.body as Record<string, any>);
  assertEquals(runs.map((r) => r.status), ['running', 'completed']);
  assertEquals(runs[1].error_message, null);
  assert(runs[1].completed_at);

  // The decision and its justification carry the provider output verbatim.
  const decision = restCalls('fraud_decisions')[0].body as Record<string, any>;
  assertEquals(decision.verdict, 'fraud');
  assertEquals(decision.confidence_score, 88);
  assertEquals(decision.ai_provider, 'gemini:gemini-2.0-flash');

  const justification = restCalls('fraud_decision_justifications')[0].body as Record<string, any>;
  assertEquals(justification.risk_signals, ['look-alike domain', 'credential harvesting form']);
  assertEquals(justification.recommended_action, 'Do not enter any credentials and report the page.');
});

Deno.test('the same artefact from the same user reuses the same event id', async () => {
  recorded = [];
  providerAnswers = ['Phishing.', VALID_VERDICT];
  await handler!(post({
    messages: [{ role: 'user', content: 'check https://secure-bank-login.test/verify' }],
    principal: 'aaaaa-bbbbb-ccccc-ddddd-cai',
  }));
  const first = (restCalls('fraud_events')[0].body as Record<string, any>).id;

  recorded = [];
  providerAnswers = ['Phishing again.', VALID_VERDICT];
  await handler!(post({
    messages: [{ role: 'user', content: 'is https://secure-bank-login.test/verify dangerous?' }],
    principal: 'aaaaa-bbbbb-ccccc-ddddd-cai',
  }));
  const second = (restCalls('fraud_events')[0].body as Record<string, any>).id;

  assertEquals(first, second);
});

Deno.test('an unusable provider verdict records a failed run and no decision', async () => {
  recorded = [];
  providerAnswers = ['It looks risky to me.', 'I cannot produce JSON right now.'];

  const res = await handler!(post({
    messages: [{ role: 'user', content: 'Is 0x1234567890abcdef1234567890abcdef12345678 safe?' }],
    principal: 'aaaaa-bbbbb-ccccc-ddddd-cai',
  }));

  assertEquals(res.status, 200);
  const body = await res.json();
  // The user still gets the real answer…
  assertEquals(body.content, 'It looks risky to me.');
  // …but nothing is fabricated: no verdict, and the real reason is reported.
  assertEquals(body.analysis.recorded, false);
  assertEquals(body.analysis.verdict, undefined);
  assert(String(body.analysis.error).includes('not valid JSON'));

  const runs = restCalls('fraud_workflow_runs').map((r) => r.body as Record<string, any>);
  assertEquals(runs.map((r) => r.status), ['running', 'failed']);
  assert(String(runs[1].error_message).includes('not valid JSON'));
  assertEquals(restCalls('fraud_decisions').length, 0);
  assertEquals(restCalls('fraud_decision_justifications').length, 0);
});

Deno.test('a general question is answered without creating fraud records', async () => {
  recorded = [];
  providerAnswers = ['Ransomware and infostealers are the dominant threats right now.'];

  const res = await handler!(post({
    messages: [{ role: 'user', content: 'What are the latest cybersecurity threats?' }],
  }));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.analysis, undefined);
  assertEquals(restCalls('fraud_events').length, 0);
  assertEquals(restCalls('fraud_workflow_runs').length, 0);
});

Deno.test('a provider failure is surfaced, never answered with a placeholder', async () => {
  recorded = [];
  providerAnswers = [''];

  const res = await handler!(post({
    messages: [{ role: 'user', content: 'Analyze https://example.test' }],
  }));

  assertEquals(res.status, 502);
  const body = await res.json();
  assert(String(body.error).includes('empty completion'), body.error);
  assertEquals(restCalls('fraud_events').length, 0);
});

Deno.test('no request is made without a message', async () => {
  recorded = [];
  const res = await handler!(post({ messages: [] }));
  assertEquals(res.status, 400);
  assertEquals(recorded.length, 0);
});
