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

const fn = await import('./index.ts');

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
/** The place the stubbed gazetteer returns. Reset by each place test. */
const DEFAULT_PLACE: Record<string, unknown> = {
  name: 'Hospital do Espírito Santo',
  display_name: 'Hospital do Espírito Santo, Évora, Portugal',
  category: 'amenity',
  type: 'hospital',
  lat: '38.5713',
  lon: '-7.9135',
};
let nominatimPlace: Record<string, unknown> = DEFAULT_PLACE;

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
    // The real API only returns grounding metadata when the search tool ran.
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    const searched = Array.isArray(parsed?.tools) &&
      parsed.tools.some((t: Record<string, unknown>) => t && 'google_search' in t);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          modelVersion: 'gemini-1.5-flash',
          candidates: [
            {
              content: { parts: [{ text: content }] },
              ...(searched
                ? {
                    groundingMetadata: {
                      groundingChunks: [
                        { web: { uri: 'https://www.hesevora.min-saude.pt/', title: 'HESE' } },
                        { web: { uri: 'https://www.hesevora.min-saude.pt/', title: 'HESE' } },
                      ],
                    },
                  }
                : {}),
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  if (url.startsWith('https://api.deepseek.com/')) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: { message: 'Insufficient Balance' } }), { status: 402 }),
    );
  }

  if (url.startsWith('https://nominatim.openstreetmap.org/search')) {
    return Promise.resolve(
      new Response(JSON.stringify([nominatimPlace]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
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
  assertEquals(decision.ai_provider, 'gemini:gemini-1.5-flash');

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

Deno.test('a provider failure is reported generically, never answered with a placeholder', async () => {
  recorded = [];
  providerAnswers = [''];

  const res = await handler!(post({
    messages: [{ role: 'user', content: 'Analyze https://example.test' }],
  }));

  assertEquals(res.status, 502);
  const body = await res.json();
  assertEquals(
    body.error,
    'De momento não consigo processar o seu pedido, tente novamente em instantes.',
  );
  assertEquals(body.content, undefined);
  assertEquals(restCalls('fraud_events').length, 0);
});

Deno.test('no request is made without a message', async () => {
  recorded = [];
  const res = await handler!(post({ messages: [] }));
  assertEquals(res.status, 400);
  assertEquals(recorded.length, 0);
});


// ─── Public place lookups ────────────────────────────────────────────────────

Deno.test('a place lookup needs both an entity and a factual request', () => {
  // Both conditions present → the lookup runs.
  assert(fn.isPlaceLookup('número de telefone do hospital distrital de Évora'));
  assert(fn.isPlaceLookup('qual é a morada da farmácia central de Braga?'));
  assert(fn.isPlaceLookup('quem é esta empresa Valthoris Lda?'));

  // Only one condition → no external lookup.
  assert(!fn.isPlaceLookup('gosto muito deste restaurante'));
  assert(!fn.isPlaceLookup('preciso do teu contacto'));

  // Greetings and small talk never trigger a lookup.
  for (const greeting of ['Olá', 'bom dia', 'obrigado', 'como estás?', 'Hi there']) {
    assert(!fn.isPlaceLookup(greeting), greeting);
  }
});

Deno.test('the place query drops the question and keeps the place', () => {
  const query = fn.placeQuery('número de telefone do hospital distrital de Évora');
  assert(query.toLowerCase().includes('hospital distrital'), query);
  assert(query.toLowerCase().includes('évora'), query);
  assert(!query.toLowerCase().includes('telefone'), query);
});

Deno.test('a greeting is answered with no external source at all', async () => {
  recorded = [];
  providerAnswers = ['Olá! Em que posso ajudar?'];

  const res = await handler!(post({ messages: [{ role: 'user', content: 'Olá' }] }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sources, undefined);
  assertEquals(body.analysis, undefined);
  // The only outbound call is the model itself.
  assertEquals(recorded.length, 1);
  assert(recorded[0].url.startsWith('https://generativelanguage.googleapis.com/'));
});

Deno.test('a place question is grounded on Nominatim', async () => {
  recorded = [];
  nominatimPlace = DEFAULT_PLACE;
  providerAnswers = ['O Hospital do Espírito Santo fica em Évora (fonte: OpenStreetMap).'];

  const res = await handler!(post({
    messages: [{ role: 'user', content: 'número de telefone do hospital distrital de Évora' }],
  }));

  assertEquals(res.status, 200);
  const body = await res.json();
  const source = body.sources.find((s: Record<string, unknown>) => s.provider === 'Nominatim');
  assertEquals(source.status, 'success');
  assertEquals(source.data.name, 'Hospital do Espírito Santo');
  assertEquals(
    source.data.link,
    'https://www.openstreetmap.org/?mlat=38.5713&mlon=-7.9135#map=17/38.5713/-7.9135',
  );
  assert(recorded.some((r) => r.url.startsWith('https://nominatim.openstreetmap.org/search')));
  // A place question is not a fraud event.
  assertEquals(body.analysis, undefined);
});

Deno.test('a place with no phone in the gazetteer falls back to the Gemini web search', async () => {
  recorded = [];
  nominatimPlace = DEFAULT_PLACE;
  providerAnswers = ['NOME: Hospital do Espírito Santo\nCONTACTO: +351 266 740 100'];

  const res = await handler!(post({
    messages: [{ role: 'user', content: 'Quero o contacto do hospital distrital Espírito Santo em Évora' }],
  }));

  assertEquals(res.status, 200);
  const body = await res.json();

  const gemini = recorded.find((r) => r.url.startsWith('https://generativelanguage.googleapis.com/'));
  const tools = (gemini?.body as Record<string, unknown>)?.tools as Record<string, unknown>[];
  assert(Array.isArray(tools) && tools.some((t) => 'google_search' in t), 'search tool not enabled');

  // The pages the search actually read are listed as a source, deduplicated.
  const web = body.sources.find(
    (s: Record<string, unknown>) => s.provider === 'Google Search (Gemini)',
  );
  assertEquals(web.status, 'success');
  assertEquals(web.data.pages.length, 1);
  assertEquals(web.data.pages[0].uri, 'https://www.hesevora.min-saude.pt/');
  assert(typeof web.timestamp === 'string' && web.timestamp.length > 0);
  // The internal field is not leaked into the answer payload.
  assertEquals(body.webSources, undefined);
});

Deno.test('a place that already has a phone does not trigger the web search', async () => {
  recorded = [];
  nominatimPlace = {
    name: 'Óptica Havaneza',
    display_name: 'Óptica Havaneza, Praça do Giraldo, Évora, Portugal',
    category: 'shop',
    type: 'optician',
    lat: '38.5717',
    lon: '-7.9089',
    extratags: { phone: '+351 266 702 297', website: 'https://opticahavaneza.test' },
  };
  providerAnswers = ['NOME: Óptica Havaneza\nCONTACTO: +351 266 702 297'];

  const res = await handler!(post({
    messages: [{ role: 'user', content: 'número de telefone da Óptica Havaneza em Évora' }],
  }));

  assertEquals(res.status, 200);
  const body = await res.json();
  const source = body.sources.find((s: Record<string, unknown>) => s.provider === 'Nominatim');
  assertEquals(source.data.phone, '+351 266 702 297');
  assertEquals(source.data.website, 'https://opticahavaneza.test');

  const gemini = recorded.find((r) => r.url.startsWith('https://generativelanguage.googleapis.com/'));
  assertEquals((gemini?.body as Record<string, unknown>)?.tools, undefined);
  assertEquals(
    body.sources.find((s: Record<string, unknown>) => s.provider === 'Google Search (Gemini)'),
    undefined,
  );
  nominatimPlace = DEFAULT_PLACE;
});

Deno.test('a model that does not serve the search tool still answers the turn', async () => {
  recorded = [];
  nominatimPlace = DEFAULT_PLACE;
  const realFetchStub = globalThis.fetch;
  let toolCalls = 0;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;
    if (url.startsWith('https://generativelanguage.googleapis.com/') && rawBody?.includes('google_search')) {
      toolCalls += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'tool not supported' } }), { status: 400 }),
      );
    }
    return realFetchStub(input as Request, init);
  }) as typeof fetch;

  try {
    providerAnswers = ['NOME: Hospital do Espírito Santo\nCONTACTO: não confirmado'];
    const res = await handler!(post({
      messages: [{ role: 'user', content: 'Quero o contacto do hospital distrital Espírito Santo em Évora' }],
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(toolCalls, 1);
    assertEquals(body.content, 'NOME: Hospital do Espírito Santo\nCONTACTO: não confirmado');
    assertEquals(body.error, undefined);
  } finally {
    globalThis.fetch = realFetchStub;
  }
});

Deno.test('a 400 that is not the tool never leaks its status to the user', async () => {
  recorded = [];
  nominatimPlace = DEFAULT_PLACE;
  const realFetchStub = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'invalid request' } }), { status: 400 }),
      );
    }
    return realFetchStub(input as Request, init);
  }) as typeof fetch;

  try {
    const res = await handler!(post({
      messages: [{ role: 'user', content: 'Quero o contacto do hospital distrital Espírito Santo em Évora' }],
    }));
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(
      body.error,
      'De momento não consigo processar o seu pedido, tente novamente em instantes.',
    );
  } finally {
    globalThis.fetch = realFetchStub;
  }
});

// ─── DeepSeek is optional and never surfaces its own failure ─────────────────

Deno.test('a DeepSeek failure falls back to Gemini without reaching the user', async () => {
  recorded = [];
  providerAnswers = ['Ransomware continua a dominar as ameaças atuais.'];
  Deno.env.set('DEEPSEEK_API_KEY', 'test-deepseek-key');

  try {
    const res = await handler!(post({
      messages: [{ role: 'user', content: 'Olá, tudo bem?' }],
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    // DeepSeek answered 402; the user still gets the real Gemini answer.
    assertEquals(body.provider, 'gemini');
    assertEquals(body.content, 'Ransomware continua a dominar as ameaças atuais.');
    assertEquals(body.error, undefined);
    assert(recorded.some((r) => r.url.startsWith('https://api.deepseek.com/')));
  } finally {
    Deno.env.delete('DEEPSEEK_API_KEY');
  }
});

Deno.test('a Gemini rate limit falls back to DeepSeek without reaching the user', async () => {
  recorded = [];
  Deno.env.set('DEEPSEEK_API_KEY', 'test-deepseek-key');
  const realFetchStub = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      recorded.push({ url, method: init?.method ?? 'GET', body: undefined });
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Resource exhausted' } }), { status: 429 }),
      );
    }
    if (url.startsWith('https://api.deepseek.com/')) {
      recorded.push({ url, method: init?.method ?? 'GET', body: undefined });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: 'deepseek-chat',
            choices: [{ message: { content: 'Resposta do modelo alternativo.' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    return realFetchStub(input as Request, init);
  }) as typeof fetch;

  try {
    const res = await handler!(post({
      messages: [{ role: 'user', content: 'Quero o contacto do hospital distrital Espírito Santo em Évora' }],
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    // Gemini answered 429 on the search turn; DeepSeek covered for it and the
    // raw status never reached the conversation.
    assertEquals(body.provider, 'deepseek');
    assertEquals(body.content, 'Resposta do modelo alternativo.');
    assertEquals(body.error, undefined);
    assert(recorded.some((r) => r.url.startsWith('https://api.deepseek.com/')));
  } finally {
    globalThis.fetch = realFetchStub;
    Deno.env.delete('DEEPSEEK_API_KEY');
  }
});

Deno.test('when both models fail the user sees one generic message, never a status', async () => {
  recorded = [];
  Deno.env.set('DEEPSEEK_API_KEY', 'test-deepseek-key');
  const realFetchStub = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      return Promise.resolve(new Response('{}', { status: 429 }));
    }
    if (url.startsWith('https://api.deepseek.com/')) {
      return Promise.resolve(new Response('{}', { status: 402 }));
    }
    return realFetchStub(input as Request, init);
  }) as typeof fetch;

  try {
    const res = await handler!(post({
      messages: [{ role: 'user', content: 'Olá, tudo bem?' }],
    }));
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(
      body.error,
      'De momento não consigo processar o seu pedido, tente novamente em instantes.',
    );
    assert(!String(body.error).includes('HTTP'));
    assertEquals(body.content, undefined);
  } finally {
    globalThis.fetch = realFetchStub;
    Deno.env.delete('DEEPSEEK_API_KEY');
  }
});
