/**
 * Gemini provider tests for the `ai-chat` Edge Function.
 *
 * Gemini is the Valthoris provider of record, so the request the function
 * actually sends to Google is asserted here: the model endpoint, the key in
 * the `x-goog-api-key` header (never in the URL), the system instruction and
 * the role mapping (`assistant` → `model`).
 *
 * The environment is restored after every test so the other test files, which
 * exercise the OpenAI path, are unaffected.
 *
 * Run with:  deno test --allow-net --allow-env supabase/functions/ai-chat
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const realServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = () => ({ finished: Promise.resolve(), shutdown: () => Promise.resolve() });
const { handleRequest } = await import('./index.ts');
// deno-lint-ignore no-explicit-any
(Deno as any).serve = realServe;

interface Recorded {
  url: string;
  headers: Headers;
  // deno-lint-ignore no-explicit-any
  body: any;
}

let recorded: Recorded[] = [];
let answers: string[] = [];
let httpStatus = 200;

const realFetch = globalThis.fetch;

function stubGemini() {
  recorded = [];
  httpStatus = 200;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    recorded.push({
      url,
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    if (!url.startsWith('https://generativelanguage.googleapis.com/')) {
      return Promise.reject(new Error(`unexpected fetch to ${url}`));
    }
    if (httpStatus !== 200) {
      return Promise.resolve(new Response(JSON.stringify({ error: 'quota' }), { status: httpStatus }));
    }
    const text = answers.shift() ?? '';
    return Promise.resolve(
      new Response(
        JSON.stringify({
          modelVersion: 'gemini-2.0-flash',
          candidates: [{ content: { parts: [{ text }] }, finishReason: text ? 'STOP' : 'SAFETY' }],
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;
}

/** Runs `fn` with only the Gemini key configured, then restores the environment. */
async function withGemini(fn: () => Promise<void>): Promise<void> {
  const previous = {
    provider: Deno.env.get('AI_PROVIDER'),
    openai: Deno.env.get('OPENAI_API_KEY'),
    anthropic: Deno.env.get('ANTHROPIC_API_KEY'),
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
  };
  Deno.env.delete('AI_PROVIDER');
  Deno.env.delete('OPENAI_API_KEY');
  Deno.env.delete('ANTHROPIC_API_KEY');
  // No fraud-pipeline configuration: this file only tests the completion path.
  Deno.env.delete('SUPABASE_URL');
  Deno.env.set('GEMINI_API_KEY', 'test-gemini-key');
  stubGemini();
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete('GEMINI_API_KEY');
    if (previous.provider) Deno.env.set('AI_PROVIDER', previous.provider);
    if (previous.openai) Deno.env.set('OPENAI_API_KEY', previous.openai);
    if (previous.anthropic) Deno.env.set('ANTHROPIC_API_KEY', previous.anthropic);
    if (previous.supabaseUrl) Deno.env.set('SUPABASE_URL', previous.supabaseUrl);
  }
}

function post(body: unknown): Request {
  return new Request('https://stub.functions.test/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test('Gemini is used by default and its answer reaches the caller', async () => {
  await withGemini(async () => {
    answers = ['Este domínio imita um banco e pede credenciais.'];

    const res = await handleRequest(
      post({ messages: [{ role: 'user', content: 'Analisa este domínio: banco-seguro.test' }] }),
    );

    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.provider, 'gemini');
    assertEquals(body.model, 'gemini-2.0-flash');
    assertEquals(body.content, 'Este domínio imita um banco e pede credenciais.');
    assert(!String(body.content).includes('Backend integration pending'));

    assertEquals(recorded.length, 1);
    const call = recorded[0];
    assert(
      call.url.startsWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      ),
      call.url,
    );
    // The key travels in the header, never in the URL.
    assertEquals(call.headers.get('x-goog-api-key'), 'test-gemini-key');
    assert(!call.url.includes('test-gemini-key'));
    assertEquals(call.body.contents[0].role, 'user');
    assert(String(call.body.systemInstruction.parts[0].text).includes('VALTHORIS'));
  });
});

Deno.test('the assistant turn is mapped to the Gemini "model" role', async () => {
  await withGemini(async () => {
    answers = ['Sim, continua a parecer fraudulento.'];

    await handleRequest(
      post({
        messages: [
          { role: 'user', content: 'Este endereço parece uma fraude?' },
          { role: 'assistant', content: 'Sim, tem indicadores de fraude.' },
          { role: 'user', content: 'E este outro?' },
        ],
      }),
    );

    assertEquals(
      recorded[0].body.contents.map((c: { role: string }) => c.role),
      ['user', 'model', 'user'],
    );
  });
});

Deno.test('a Gemini failure is surfaced, never answered with a placeholder', async () => {
  await withGemini(async () => {
    httpStatus = 429;

    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'Verifica 1.2.3.4' }] }));

    assertEquals(res.status, 502);
    const body = await res.json();
    assert(String(body.error).includes('HTTP 429'), body.error);
    // The upstream body (which can echo the request) is not leaked.
    assert(!String(body.error).includes('quota'));
  });
});

Deno.test('an empty Gemini completion is reported with its finish reason', async () => {
  await withGemini(async () => {
    answers = [''];

    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'Analisa isto' }] }));

    assertEquals(res.status, 502);
    const body = await res.json();
    assert(String(body.error).includes('empty completion'), body.error);
  });
});

Deno.test('without any provider key the failure names the Gemini secret', async () => {
  const previous = {
    provider: Deno.env.get('AI_PROVIDER'),
    openai: Deno.env.get('OPENAI_API_KEY'),
    anthropic: Deno.env.get('ANTHROPIC_API_KEY'),
  };
  Deno.env.delete('AI_PROVIDER');
  Deno.env.delete('OPENAI_API_KEY');
  Deno.env.delete('ANTHROPIC_API_KEY');
  Deno.env.delete('GEMINI_API_KEY');
  try {
    const res = await handleRequest(post({ messages: [{ role: 'user', content: 'olá' }] }));
    assertEquals(res.status, 502);
    const body = await res.json();
    assert(String(body.error).includes('GEMINI_API_KEY'), body.error);
  } finally {
    if (previous.provider) Deno.env.set('AI_PROVIDER', previous.provider);
    if (previous.openai) Deno.env.set('OPENAI_API_KEY', previous.openai);
    if (previous.anthropic) Deno.env.set('ANTHROPIC_API_KEY', previous.anthropic);
  }
});
